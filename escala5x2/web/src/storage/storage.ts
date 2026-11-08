// Persistência: servidor (FastAPI + SQLite), banco do artefato publicado (claude.use("db")) ou navegador.
import type { Cell, Code, Store } from "../engine/types";
import type { SolveProblem } from "../engine/solver";
import { addDays } from "../engine/time";

export interface StorageAdapter {
  kind: "api" | "artifact" | "local";
  label: string;
  loadAll(): Promise<Store[] | null>;
  saveStore(s: Store): Promise<void>;
  deleteStore(id: string): Promise<void>;
}

const API_BASE: string = process.env.NEXT_PUBLIC_API_URL || "";

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

// ---------------------------------------------------------------- codec compacto da escala
export function encodeSchedule(schedule: Record<string, Record<string, Cell>>): string {
  const parts: string[] = [];
  for (const [emp, row] of Object.entries(schedule)) {
    const dates = Object.keys(row).sort();
    if (!dates.length) continue;
    const segs: string[] = [];
    let start = dates[0];
    let codes = "";
    let prev = "";
    for (const d of dates) {
      if (prev && addDays(prev, 1) !== d) {
        segs.push(`${start}|${codes}`);
        start = d;
        codes = "";
      }
      const c = row[d];
      codes += c.lock ? c.c.toLowerCase() : c.c;
      prev = d;
    }
    segs.push(`${start}|${codes}`);
    parts.push(`${emp}=${segs.join(",")}`);
  }
  return parts.join(";");
}

export function decodeSchedule(s: string): Record<string, Record<string, Cell>> {
  const out: Record<string, Record<string, Cell>> = {};
  if (!s) return out;
  for (const part of s.split(";")) {
    const [emp, segs] = part.split("=");
    if (!emp || !segs) continue;
    const row: Record<string, Cell> = {};
    for (const seg of segs.split(",")) {
      const [start, codes] = seg.split("|");
      for (let i = 0; i < codes.length; i++) {
        const ch = codes[i];
        const up = ch.toUpperCase() as Code;
        row[addDays(start, i)] = ch !== up ? { c: up, lock: true } : { c: up };
      }
    }
    out[emp] = row;
  }
  return out;
}

/** Turnos escolhidos por dia (célula com turno próprio): guardados à parte do código compacto. */
export function extractCellShifts(schedule: Record<string, Record<string, Cell>>): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [emp, row] of Object.entries(schedule))
    for (const [d, c] of Object.entries(row))
      // turno do dia e/ou intervalo do dia: "turno", "turno|HH:MM" ou "|HH:MM";
      // depois, opcional: "|60" (duração própria do intervalo) e "!" (mudado só naquele dia — o sistema não mexe)
      if (c.shiftId || c.brk) {
        // "~": turno do dia trocado pelas Regras avançadas (refeito sozinho a cada mudança)
        const extra = (c.brkMin ? String(c.brkMin) : "") + (c.brkFix ? "!" : "") + (c.auto && c.shiftId ? "~" : "");
        (out[emp] ??= {})[d] = (c.shiftId ?? "") + (c.brk || extra ? `|${c.brk ?? ""}` : "") + (extra ? `|${extra}` : "");
      }
  return out;
}
export function applyCellShifts(schedule: Record<string, Record<string, Cell>>, map: Record<string, Record<string, string>> | undefined) {
  if (!map) return schedule;
  for (const [emp, row] of Object.entries(map))
    for (const [d, v] of Object.entries(row)) {
      const c = schedule[emp]?.[d];
      if (!c) continue;
      const [sid, brk, extra] = v.split("|");
      if (sid) c.shiftId = sid;
      if (brk) c.brk = brk;
      if (extra) {
        const n = parseInt(extra, 10);
        if (n >= 15) c.brkMin = n;
        if (extra.includes("!")) c.brkFix = true;
        if (extra.includes("~") && c.shiftId) c.auto = true;
      }
    }
  return schedule;
}

// ---------------------------------------------------------------- servidor
export class ApiAdapter implements StorageAdapter {
  kind = "api" as const;
  label = "Servidor (SQLite)";
  async loadAll() {
    const r = await fetch(`${API_BASE}/api/stores`);
    if (!r.ok) throw new Error(`Falha ao carregar (${r.status})`);
    const list = (await r.json()) as Store[];
    return list.length ? list : null;
  }
  async saveStore(s: Store) {
    const r = await fetch(`${API_BASE}/api/stores/${encodeURIComponent(s.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    if (!r.ok) throw new Error(`Falha ao salvar (${r.status})`);
  }
  async deleteStore(id: string) {
    await fetch(`${API_BASE}/api/stores/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}

export async function apiAvailable(): Promise<{ ok: boolean; solver?: string }> {
  try {
    const r = await withTimeout(fetch(`${API_BASE}/api/health`), 1500);
    if (!r.ok) return { ok: false };
    const j = await r.json();
    return { ok: !!j.ok, solver: j.solver };
  } catch {
    return { ok: false };
  }
}

export async function solveRemote(problem: SolveProblem, hint: Code[][] | null, timeLimit = 10) {
  const r = await fetch(`${API_BASE}/api/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ problem, hint, timeLimit }),
  });
  if (!r.ok) throw new Error(`Serviço de otimização respondeu ${r.status}`);
  return (await r.json()) as { ok: boolean; status: string; rows: Code[][] | null; explanations: string[]; ms: number };
}

// ---------------------------------------------------------------- banco do artefato publicado
type DbRef = {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(d: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
};
type DbLike = {
  doc(path: string): DbRef;
  collection(path: string): { get(): Promise<{ docs: { id: string; data(): Record<string, unknown> | undefined }[] }> };
};

const safeId = (s: string) => s.replace(/[^A-Za-z0-9_\-.~:@+]/g, "_");

export class ArtifactDbAdapter implements StorageAdapter {
  kind = "artifact" as const;
  label = "Salvo nesta página (compartilhado)";
  private last = new Map<string, string>();
  private queue: Promise<void> = Promise.resolve();
  constructor(private db: DbLike) {}

  async loadAll() {
    const metas = await this.db.collection("stores").get();
    if (!metas.docs.length) return null;
    const secs = await this.db.collection("sectordata").get();
    const secMap = new Map(secs.docs.map((d) => [d.id, d.data() as { emps?: string; sched?: string; cshift?: string }]));
    const out: Store[] = [];
    for (const d of metas.docs) {
      const body = d.data() as { json?: string } | undefined;
      if (!body?.json) continue;
      this.last.set(`stores/${d.id}`, body.json);
      const store = JSON.parse(body.json) as Store;
      store.employees = [];
      for (const sec of store.sectors) {
        const key = safeId(`${store.id}__${sec.id}`);
        const sd = secMap.get(key);
        if (sd) {
          this.last.set(`sectordata/${key}`, JSON.stringify(sd));
          store.employees.push(...(JSON.parse(sd.emps || "[]") as Store["employees"]));
          sec.schedule = applyCellShifts(decodeSchedule(sd.sched || ""), sd.cshift ? JSON.parse(sd.cshift) : undefined);
        } else sec.schedule = {};
      }
      out.push(store);
    }
    return out.length ? out : null;
  }

  saveStore(s: Store) {
    const run = this.queue.then(() => this._save(s));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async _save(s: Store) {
    const meta = { ...s, employees: [], sectors: s.sectors.map((x) => ({ ...x, schedule: {} })) };
    const metaJson = JSON.stringify(meta);
    const metaPath = `stores/${safeId(s.id)}`;
    if (this.last.get(metaPath) !== metaJson) {
      await this.db.doc(metaPath).set({ json: metaJson, name: s.name, network: s.network });
      this.last.set(metaPath, metaJson);
    }
    for (const sec of s.sectors) {
      const key = safeId(`${s.id}__${sec.id}`);
      const cs = extractCellShifts(sec.schedule);
      const body: Record<string, string> = { emps: JSON.stringify(s.employees.filter((e) => e.sectorId === sec.id)), sched: encodeSchedule(sec.schedule) };
      if (Object.keys(cs).length) body.cshift = JSON.stringify(cs);
      const str = JSON.stringify(body);
      const path = `sectordata/${key}`;
      if (this.last.get(path) === str) continue;
      await this.db.doc(path).set(body);
      this.last.set(path, str);
    }
  }

  async deleteStore(id: string) {
    const metaPath = `stores/${safeId(id)}`;
    const snap = await this.db.doc(metaPath).get();
    const body = snap.data() as { json?: string } | undefined;
    if (body?.json) {
      const st = JSON.parse(body.json) as Store;
      for (const sec of st.sectors) await this.db.doc(`sectordata/${safeId(`${id}__${sec.id}`)}`).delete();
    }
    await this.db.doc(metaPath).delete();
    this.last.delete(metaPath);
  }
}

// ---------------------------------------------------------------- programa de computador (Electron)
type DesktopBridge = {
  load(): Promise<string | null>;
  save(json: string): Promise<{ ok: boolean; path?: string; error?: string }>;
  saveFile(name: string, bytes: Uint8Array): Promise<"saved" | "declined" | "error">;
  dataPath(): Promise<string>;
};
const desktop = (): DesktopBridge | undefined => (typeof window !== "undefined" ? (window as unknown as { escalaDesktop?: DesktopBridge }).escalaDesktop : undefined);

export class DesktopAdapter implements StorageAdapter {
  kind = "local" as const;
  label = "Salvo no computador";
  private all: Map<string, Store> = new Map();
  constructor(private bridge: DesktopBridge) {}
  async loadAll() {
    const raw = await this.bridge.load();
    if (!raw) return null;
    const list = JSON.parse(raw) as (Store & { _sched?: Record<string, string>; _cshift?: Record<string, Record<string, Record<string, string>>> })[];
    for (const st of list) {
      for (const sec of st.sectors) sec.schedule = applyCellShifts(decodeSchedule((st._sched ?? {})[sec.id] ?? ""), (st._cshift ?? {})[sec.id]);
      delete st._sched;
      delete st._cshift;
    }
    this.all = new Map(list.map((x) => [x.id, x as Store]));
    return list.length ? (list as Store[]) : null;
  }
  seed(stores: Store[]) {
    this.all = new Map(stores.map((s) => [s.id, s]));
  }
  private async flush() {
    const list = Array.from(this.all.values()).map((st) => ({
      ...st,
      sectors: st.sectors.map((x) => ({ ...x, schedule: {} })),
      _sched: Object.fromEntries(st.sectors.map((x) => [x.id, encodeSchedule(x.schedule)])),
      _cshift: Object.fromEntries(st.sectors.map((x) => [x.id, extractCellShifts(x.schedule)])),
    }));
    const r = await this.bridge.save(JSON.stringify(list));
    if (!r.ok) throw new Error(r.error || "Falha ao gravar o arquivo de dados");
  }
  async saveStore(s: Store) {
    this.all.set(s.id, s);
    await this.flush();
  }
  async deleteStore(id: string) {
    this.all.delete(id);
    await this.flush();
  }
}

// ---------------------------------------------------------------- navegador
const LS_KEY = "escala5x2:v1:stores";
export class LocalAdapter implements StorageAdapter {
  kind = "local" as const;
  label = "Salvo neste navegador";
  async loadAll() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const list = JSON.parse(raw) as (Store & { _sched?: Record<string, string>; _cshift?: Record<string, Record<string, Record<string, string>>> })[];
      for (const st of list) {
        for (const sec of st.sectors) sec.schedule = applyCellShifts(decodeSchedule((st._sched ?? {})[sec.id] ?? ""), (st._cshift ?? {})[sec.id]);
        delete st._sched;
      delete st._cshift;
      }
      this.all = new Map(list.map((x) => [x.id, x as Store]));
      return list.length ? list : null;
    } catch {
      return null;
    }
  }
  private all: Map<string, Store> = new Map();
  async saveStore(s: Store) {
    this.all.set(s.id, s);
    this.flush();
  }
  async deleteStore(id: string) {
    this.all.delete(id);
    this.flush();
  }
  seed(stores: Store[]) {
    this.all = new Map(stores.map((s) => [s.id, s]));
  }
  private flush() {
    try {
      const list = Array.from(this.all.values()).map((st) => ({
        ...st,
        sectors: st.sectors.map((x) => ({ ...x, schedule: {} })),
        _sched: Object.fromEntries(st.sectors.map((x) => [x.id, encodeSchedule(x.schedule)])),
      _cshift: Object.fromEntries(st.sectors.map((x) => [x.id, extractCellShifts(x.schedule)])),
      }));
      localStorage.setItem(LS_KEY, JSON.stringify(list));
    } catch {
      /* armazenamento indisponível: segue em memória */
    }
  }
}

/** Escolhe o melhor armazenamento disponível. */
export async function pickAdapter(): Promise<{ adapter: StorageAdapter; solverOnline: boolean; solverName?: string }> {
  // na versão de arquivo único o servidor só é usado se um endereço for configurado no build
  const d = desktop();
  if (d) return { adapter: new DesktopAdapter(d), solverOnline: false };
  const standalone = process.env.NEXT_PUBLIC_STANDALONE === "1";
  const api = standalone && !API_BASE ? { ok: false } : await apiAvailable();
  if (api.ok) return { adapter: new ApiAdapter(), solverOnline: true, solverName: (api as { solver?: string }).solver };
  const w = typeof window !== "undefined" ? (window as unknown as { claude?: { use(n: string): Promise<unknown> } }) : undefined;
  if (w?.claude?.use) {
    try {
      const db = (await withTimeout(w.claude.use("db"), 6000)) as DbLike | null;
      if (db) return { adapter: new ArtifactDbAdapter(db), solverOnline: false };
    } catch {
      /* segue para o armazenamento local */
    }
  }
  return { adapter: new LocalAdapter(), solverOnline: false };
}

/** Download de arquivo: capacidade "downloads" do artefato, ou link comum no navegador. */
export async function saveFile(filename: string, data: Blob): Promise<"saved" | "declined" | "unavailable"> {
  const d = desktop();
  if (d) {
    const r = await d.saveFile(filename, new Uint8Array(await data.arrayBuffer()));
    return r === "saved" ? "saved" : r === "declined" ? "declined" : "unavailable";
  }
  const w = typeof window !== "undefined" ? (window as unknown as { claude?: { use(n: string): Promise<unknown> } }) : undefined;
  if (w?.claude?.use) {
    try {
      const dl = (await withTimeout(w.claude.use("downloads"), 4000)) as { save(r: { filename: string; data: Blob }): Promise<unknown> } | null;
      if (dl) {
        try {
          await dl.save({ filename, data });
          return "saved";
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code === "declined") return "declined";
          return "unavailable";
        }
      }
    } catch {
      /* cai no download comum */
    }
  }
  try {
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return "saved";
  } catch {
    return "unavailable";
  }
}
