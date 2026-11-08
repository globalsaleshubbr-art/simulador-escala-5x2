"use client";
import { almocosEmDia } from "../engine/almoco";
import { ajustarTurnos } from "../engine/turnos";
import { resolveStoreSel } from "./storeSel";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Code, Sector, Store } from "../engine/types";
import { analyzeSector, analyzeSectorCached, type AlertTarget, type SectorAnalysis } from "../engine/analysis";
import { applyResult, buildProblem, coverageCeiling, excessoTurnos, explainInfeasibility, fillMissing, folgasPorTurno, impede, resumoFds, solveBest, validate, evaluate, type Violation } from "../engine/solver";
import { aplicarGeracao } from "../engine/gerar";
import { buildDays, cellCode } from "../engine/model";
import { demoStore } from "../engine/seed";
import { pickAdapter, solveRemote, type StorageAdapter, LocalAdapter, DesktopAdapter } from "../storage/storage";
import { fmtNum } from "../engine/time";

export interface RunReport {
  sectorId: string;
  ok: boolean;
  applied: boolean;
  engine: string;
  ms: number;
  before: { pct: number; def: number };
  after: { pct: number; def: number };
  violations: Violation[];
  explanations: string[];
  ceiling: string[];
  remainingRed: number;
  pendingRows?: Code[][];
  at: string;
  /** almoços distribuídos automaticamente depois de gerar */
  almoco?: { dias: number; mudancas: number; missBefore: number; missAfter: number };
  /** ajustes automáticos feitos para conseguir gerar (ex.: limite de folgas por dia aumentado) */
  avisos?: string[];
  /** turnos trocados pelas regras avançadas (rodízio; quem fecha não abre) */
  turnos?: { rodizio: number; trocas: number; semAlternativa: number; cobertos?: number; semCobertura?: number };
  /** sábados de folga e fins de semana inteiros por pessoa (rodízio) */
  fds?: { sabMin: number; sabMax: number; parMin: number; parMax: number; pares: number; comPares: boolean };
  /** divisão das folgas entre os turnos: dias abertos e dias em que algum turno ficou acima da parte proporcional */
  divTurnos?: { dias: number; acima: number; nomes: string[] };
  /** folgas por dia de segunda a sábado: menor e maior número de folgas num dia, por semana (sem dia no limite) */
  divDias?: { min: number; max: number }[];
}

/** Almoços do período depois de gerar: horário fixo de cada pessoa (sugerido para quem não tem), rodízio e domingos. */
function comAlmocos(store: Store, sectorId: string): { store: Store; almoco?: RunReport["almoco"] } {
  const r = almocosEmDia(store, sectorId, { refazer: true });
  return { store: r.store, almoco: { dias: 0, mudancas: r.mudancas + r.novos, missBefore: 0, missAfter: 0 } };
}

type SaveState = "idle" | "saving" | "saved" | "error";

interface Ctx {
  ready: boolean;
  stores: Store[];
  store: Store;
  sector: Sector;
  analysis: SectorAnalysis;
  sectorSummaries: Record<string, { people: number; problems: number; pct: number }>;
  setStoreId: (id: string) => void;
  setSectorId: (id: string) => void;
  updateStore: (fn: (s: Store) => Store) => void;
  /** altera uma loja específica (não precisa ser a loja em uso) */
  updateStoreById: (id: string, fn: (s: Store) => Store, opts?: { semHistorico?: boolean }) => void;
  /** lojas selecionadas no filtro (a loja em uso sempre faz parte) */
  storeSel: string[];
  selStores: Store[];
  setStoreSel: (ids: string[]) => void;
  updateSector: (fn: (s: Sector) => Sector) => void;
  replaceStores: (list: Store[], currentId?: string) => void;
  addStore: (s: Store) => void;
  removeStore: (id: string) => void;
  adapter: StorageAdapter | null;
  saveState: SaveState;
  savedAt: string | null;
  saveNow: () => Promise<void>;
  reload: () => Promise<void>;
  solverOnline: boolean;
  solverName?: string;
  engineChoice: "auto" | "local";
  setEngineChoice: (v: "auto" | "local") => void;
  redistribute: (sectorId?: string, storeId?: string) => Promise<void>;
  applyDraft: () => void;
  running: boolean;
  report: RunReport | null;
  setReport: (r: RunReport | null) => void;
  highlight: (AlertTarget & { nonce: number }) | null;
  focus: (t: AlertTarget) => void;
  coverageWeek: number;
  setCoverageWeek: (w: number) => void;
  manualEdit: { sectorId: string; count: number } | null;
  noteManualEdit: () => void;
  clearManualEdit: () => void;
  toast: string | null;
  setToast: (t: string | null) => void;
  /** volta as lojas para antes da última mudança (true se havia o que desfazer) */
  desfazer: () => boolean;
  podeDesfazer: boolean;
  /** momento (ms) da última mudança nos dados — para o aviso oferecer "Desfazer" */
  ultimaMudanca: () => number;
}

const SimCtx = createContext<Ctx | null>(null);
export const useSim = () => {
  const c = useContext(SimCtx);
  if (!c) throw new Error("useSim fora do provedor");
  return c;
};

function fillAll(store: Store): Store {
  let st = store;
  for (const sec of store.sectors) {
    const filled = fillMissing(st, sec.id);
    if (filled) st = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? filled : s)) };
  }
  return st;
}

/** Resumo de sábados/fins de semana para o relatório da geração (só quando o setor tem sábado aberto). */
/** Folgas divididas entre os turnos (abertura, fechamento…) na proporção de cada um: em quantos dias algum turno passou da parte dele. */
function divisaoTurnos(p: Parameters<typeof resumoFds>[0], rows: Parameters<typeof resumoFds>[1]) {
  if (!p.turnos || p.turnos.length < 2) return undefined;
  let dias = 0;
  let acima = 0;
  for (let d = 0; d < p.days.length; d++) {
    if (p.days[d].closed) continue;
    dias++;
    if (excessoTurnos(p.turnos, folgasPorTurno(p, rows, d)) > 0) acima++;
  }
  return { dias, acima, nomes: (p.turnoNomes ?? []).map((n, g) => `${n}: ${p.turnos![g]}`) };
}

/** Folgas por dia de segunda a sábado em cada semana (dias que já estão no limite de folgas ficam de fora). */
function divisaoDias(p: Parameters<typeof resumoFds>[0], rows: Parameters<typeof resumoFds>[1]): RunReport["divDias"] {
  if (p.diasIguais === false) return undefined;
  const out: { min: number; max: number }[] = [];
  for (let w = 0; w * 7 < p.days.length; w++) {
    const dias = p.days.map((_, d) => d).filter((d) => p.days[d].week === w && !p.days[d].closed && !p.days[d].special);
    const off = dias.map((d) => rows.filter((r, ei) => r[d] === "F" && !p.employees[ei].plantao).length);
    const livres = off.filter((n, i) => n < (p.days[dias[i]].maxOff ?? Infinity));
    if (off.length > 1 && livres.length) out.push({ min: Math.min(...livres), max: Math.max(...off) });
  }
  return out.length ? out : undefined;
}

function resumoParaRelatorio(p: Parameters<typeof resumoFds>[0], rows: Parameters<typeof resumoFds>[1]) {
  if (!p.days.some((d) => d.weekday === 6 && !d.closed) || p.employees.length < 2) return undefined;
  const r = resumoFds(p, rows);
  return { sabMin: r.sabMin, sabMax: r.sabMax, parMin: r.parMin, parMax: r.parMax, pares: r.pares, comPares: p.regras?.sabDom != null };
}

export function SimProvider({ children, seed = () => demoStore() }: { children: React.ReactNode; seed?: () => Store }) {
  const [ready, setReady] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreIdRaw] = useState<string>("");
  const [sectorId, setSectorIdRaw] = useState<string>("");
  const [adapter, setAdapter] = useState<StorageAdapter | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [solverOnline, setSolverOnline] = useState(false);
  const [solverName, setSolverName] = useState<string | undefined>();
  const [engineChoice, setEngineChoice] = useState<"auto" | "local">("auto");
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<RunReport | null>(null);
  const [highlight, setHighlight] = useState<(AlertTarget & { nonce: number }) | null>(null);
  const [coverageWeek, setCoverageWeek] = useState(0);
  const [manualEdit, setManualEdit] = useState<{ sectorId: string; count: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dirty = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storesRef = useRef<Store[]>([]);
  storesRef.current = stores;
  // ---------- histórico para "Desfazer": guarda as lojas como estavam antes de cada mudança
  // (mudanças seguidas em menos de 1 s, como digitar um nome, contam como uma só)
  const hist = useRef<{ stores: Store[]; storeId: string }[]>([]);
  const [histN, setHistN] = useState(0);
  const ultima = useRef(0);
  const guardar = () => {
    const now = Date.now();
    if (!storesRef.current.length) return;
    if (now - ultima.current > 1000 || !hist.current.length) {
      hist.current.push({ stores: storesRef.current, storeId: storeIdRef.current });
      if (hist.current.length > 30) hist.current.shift();
      setHistN(hist.current.length);
    }
    ultima.current = now;
  };
  const storeIdRef = useRef("");

  // ---------- carga inicial
  const load = useCallback(async () => {
    const picked = await pickAdapter();
    setAdapter(picked.adapter);
    setSolverOnline(picked.solverOnline);
    setSolverName(picked.solverName);
    let list: Store[] | null = null;
    try {
      list = await picked.adapter.loadAll();
    } catch {
      list = null;
    }
    let seeded = false;
    if (!list || !list.length) {
      list = [fillAll(seed())];
      seeded = true;
    } else {
      list = list.map((s) => fillAll(s));
    }
    if (picked.adapter instanceof LocalAdapter || picked.adapter instanceof DesktopAdapter) (picked.adapter as LocalAdapter).seed(list);
    setStores(list);
    let rememberStore = "";
    let rememberSector = "";
    try {
      rememberStore = localStorage.getItem("escala5x2:store") ?? "";
      rememberSector = localStorage.getItem("escala5x2:sector") ?? "";
    } catch {
      /* sem armazenamento */
    }
    const st = list.find((s) => s.id === rememberStore) ?? list[0];
    setStoreIdRaw(st.id);
    const sec = st.sectors.find((s) => s.id === rememberSector && !s.hidden) ?? st.sectors.find((s) => !s.hidden && st.employees.some((e) => e.sectorId === s.id)) ?? st.sectors[0];
    setSectorIdRaw(sec.id);
    setReady(true);
    if (seeded) {
      list.forEach((s) => dirty.current.add(s.id));
      scheduleSave(picked.adapter, 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const scheduleSave = useCallback((ad: StorageAdapter | null, delay = 900) => {
    if (!ad) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const ids = Array.from(dirty.current);
      dirty.current.clear();
      if (!ids.length) return;
      setSaveState("saving");
      try {
        for (const id of ids) {
          const s = storesRef.current.find((x) => x.id === id);
          if (s) await ad.saveStore(s);
        }
        setSaveState("saved");
        setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      } catch {
        ids.forEach((id) => dirty.current.add(id));
        setSaveState("error");
      }
    }, delay);
  }, []);

  // fechar ou recarregar a página logo depois de uma mudança: grava na hora o que ainda estava esperando
  useEffect(() => {
    if (!adapter) return;
    const gravarJa = () => {
      const ids = Array.from(dirty.current);
      if (!ids.length) return;
      if (timer.current) clearTimeout(timer.current);
      dirty.current.clear();
      for (const id of ids) {
        const s = storesRef.current.find((x) => x.id === id);
        if (s) adapter.saveStore(s).catch(() => dirty.current.add(id));
      }
    };
    const oculta = () => document.visibilityState === "hidden" && gravarJa();
    window.addEventListener("pagehide", gravarJa);
    window.addEventListener("beforeunload", gravarJa);
    document.addEventListener("visibilitychange", oculta);
    return () => {
      window.removeEventListener("pagehide", gravarJa);
      window.removeEventListener("beforeunload", gravarJa);
      document.removeEventListener("visibilitychange", oculta);
    };
  }, [adapter]);

  const store = useMemo(() => stores.find((s) => s.id === storeId) ?? stores[0], [stores, storeId]);
  storeIdRef.current = store?.id ?? "";
  const storeFromCtx = store;
  const sector = useMemo(() => store?.sectors.find((s) => s.id === sectorId) ?? store?.sectors[0], [store, sectorId]);

  const updateStoreById = useCallback(
    (id: string, fn: (s: Store) => Store, opts?: { semHistorico?: boolean }) => {
      // mudanças automáticas (ex.: almoços redistribuídos sozinhos) não viram um passo do Desfazer
      if (!opts?.semHistorico) guardar();
      setStores((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          let next = fn(s);
          if (next === s) return s;
          // período ou equipe mudou: completa a escala que falta (sem mexer no que existe)
          next = fillAll(next);
          dirty.current.add(next.id);
          return { ...next, updatedAt: new Date().toISOString() };
        }),
      );
      scheduleSave(adapter);
    },
    [adapter, scheduleSave],
  );
  const updateStore = useCallback((fn: (s: Store) => Store) => updateStoreById(storeId, fn), [updateStoreById, storeId]);

  // ---------- filtro de lojas (uma, várias ou todas); guardado neste navegador
  const [storeSelRaw, setStoreSelRaw] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("escala5x2:stores-sel") ?? "[]");
      return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  });
  const storeSel = useMemo(() => {
    return resolveStoreSel(stores.map((s) => s.id), storeSelRaw, storeId);
  }, [stores, storeSelRaw, storeId]);
  const selStores = useMemo(() => stores.filter((s) => storeSel.includes(s.id)), [stores, storeSel]);
  const setStoreSel = (ids: string[]) => {
    setStoreSelRaw(ids);
    try {
      localStorage.setItem("escala5x2:stores-sel", JSON.stringify(ids));
    } catch {
      /* ok */
    }
    // a loja em uso precisa estar na seleção: se saiu, a primeira selecionada passa a ser a loja em uso
    if (ids.length && !ids.includes(storeId)) setStoreId(ids[0]);
  };

  const updateSector = useCallback(
    (fn: (s: Sector) => Sector) => updateStore((st) => ({ ...st, sectors: st.sectors.map((s) => (s.id === sectorId ? fn(s) : s)) })),
    [updateStore, sectorId],
  );

  const setStoreId = (id: string) => {
    setStoreIdRaw(id);
    const st = stores.find((s) => s.id === id);
    if (st && !st.sectors.some((s) => s.id === sectorId)) {
      const name = sector?.name;
      const same = st.sectors.find((s) => s.name === name) ?? st.sectors[0];
      setSectorIdRaw(same.id);
    }
    setReport(null);
    try {
      localStorage.setItem("escala5x2:store", id);
    } catch {
      /* ok */
    }
  };
  const setSectorId = (id: string) => {
    setSectorIdRaw(id);
    setReport((r) => (r && r.sectorId !== id ? null : r));
    setCoverageWeek(0);
    try {
      localStorage.setItem("escala5x2:sector", id);
    } catch {
      /* ok */
    }
  };

  const replaceStores = (list: Store[], currentId?: string) => {
    guardar();
    const keep = new Set(list.map((s) => s.id));
    stores.filter((s) => !keep.has(s.id)).forEach((s) => adapter?.deleteStore(s.id).catch(() => setSaveState("error")));
    const filled = list.map((s) => fillAll(s));
    setStores(filled);
    filled.forEach((s) => dirty.current.add(s.id));
    const cur = filled.find((s) => s.id === currentId) ?? filled[0];
    setStoreIdRaw(cur.id);
    setSectorIdRaw((cur.sectors.find((s) => s.name === sector?.name) ?? cur.sectors[0]).id);
    scheduleSave(adapter, 200);
  };
  const addStore = (s: Store) => {
    guardar();
    const f = fillAll(s);
    setStores((prev) => [...prev, f]);
    dirty.current.add(f.id);
    scheduleSave(adapter, 200);
  };
  const removeStore = (id: string) => {
    guardar();
    setStores((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (id === storeId && next[0]) {
        setStoreIdRaw(next[0].id);
        setSectorIdRaw(next[0].sectors[0].id);
      }
      return next;
    });
    adapter?.deleteStore(id).catch(() => setSaveState("error"));
  };

  const desfazer = () => {
    const snap = hist.current.pop();
    setHistN(hist.current.length);
    if (!snap) return false;
    const ids = new Set(snap.stores.map((x) => x.id));
    // lojas criadas depois do ponto desfeito somem também do armazenamento
    storesRef.current.filter((x) => !ids.has(x.id)).forEach((x) => adapter?.deleteStore(x.id).catch(() => setSaveState("error")));
    setStores(snap.stores);
    snap.stores.forEach((x) => dirty.current.add(x.id));
    const cur = snap.stores.find((x) => x.id === storeIdRef.current) ?? snap.stores.find((x) => x.id === snap.storeId) ?? snap.stores[0];
    if (cur.id !== storeIdRef.current) {
      setStoreIdRaw(cur.id);
      setSectorIdRaw(cur.sectors[0].id);
    }
    setReport(null);
    setManualEdit(null);
    ultima.current = 0;
    scheduleSave(adapter, 200);
    return true;
  };

  const saveNow = async () => {
    if (!adapter) return;
    stores.forEach((s) => dirty.current.add(s.id));
    scheduleSave(adapter, 0);
  };
  const reload = async () => {
    setReady(false);
    await load();
  };

  // ---------- análise
  const analysis = useMemo(() => (store && sector ? analyzeSectorCached(store, sector.id) : (null as unknown as SectorAnalysis)), [store, sector]);
  const sectorSummaries = useMemo(() => {
    const out: Record<string, { people: number; problems: number; pct: number }> = {};
    if (!store) return out;
    for (const s of store.sectors) {
      const n = store.employees.filter((e) => e.sectorId === s.id).length;
      if (!n && !s.minRules.length) {
        out[s.id] = { people: 0, problems: 0, pct: 100 };
        continue;
      }
      const a = s.id === sector?.id ? analysis : analyzeSectorCached(store, s.id);
      out[s.id] = { people: n, problems: a.alerts.filter((x) => x.severity === "problema").length, pct: a.totals.pct };
    }
    return out;
  }, [store, sector, analysis]);

  // ---------- redistribuição
  const redistribute = async (secId?: string, stId?: string) => {
    const store0 = (stId ? stores.find((x) => x.id === stId) : null) ?? storeFromCtx;
    if (!store0) return;
    const sid = secId ?? sector.id;
    // meses limpos (em branco) dentro do período voltam a ser gerados
    const mesesPeriodo = new Set(buildDays(store0.config).map((d) => d.date.slice(0, 7)));
    const tinhaLimpo = !!store0.sectors.find((s) => s.id === sid)?.limpo?.some((m) => mesesPeriodo.has(m));
    const store: Store = tinhaLimpo ? { ...store0, sectors: store0.sectors.map((s) => (s.id === sid ? { ...s, limpo: (s.limpo ?? []).filter((m) => !mesesPeriodo.has(m)) } : s)) } : store0;
    const updateStore = (fn: (s: Store) => Store) => updateStoreById(store.id, fn);
    setRunning(true);
    await new Promise((r) => setTimeout(r, 20));
    const t0 = Date.now();
    const before = analyzeSector(store, sid).totals;
    const days = buildDays(store.config);
    const p = buildProblem(store, sid, { keepLocks: true, days });
    let res = solveBest(p, 4);
    let engine = res.engine;
    let explanations = res.explanations;
    if (engineChoice === "auto" && solverOnline && p.employees.length) {
      try {
        const remote = await solveRemote(p, res.rows, 10);
        if (remote.rows) {
          const v = validate(p, remote.rows);
          if (remote.ok && v.filter(impede).length === 0) {
            const ev = evaluate(p, remote.rows);
            if (!res.ok || ev.obj <= res.objective + 1e-6) {
              res = { ...res, ok: true, rows: remote.rows, violations: [], objective: ev.obj, deficitSlots: ev.deficit };
              engine = `OR-Tools CP-SAT (${remote.status === "OPTIMAL" ? "ótimo" : "viável"})`;
            }
          } else if (!remote.ok) {
            explanations = remote.explanations.length ? remote.explanations : explanations;
            engine = "OR-Tools CP-SAT (sem solução)";
          }
        }
      } catch {
        engine += " — servidor indisponível";
      }
    }
    if (!res.ok && !explanations.length) explanations = explainInfeasibility(p);
    const ceiling = coverageCeiling(p);
    // se a escala atual já é válida e tão boa quanto a nova (objetivo ponderado pelo movimento), mantém a atual
    const curRows = p.employees.map((pe) => days.map((d) => cellCode(store.sectors.find((s) => s.id === sid)!, pe.id, d)));
    const curValid = p.employees.length > 0 && validate(p, curRows).filter(impede).length === 0;
    // a escala atual só fica se também cumprir o rodízio dos sábados e os fins de semana das regras 5b/5c tão bem quanto a nova
    const fdsCur = resumoFds(p, curRows);
    const fdsNovo = res.ok ? resumoFds(p, res.rows) : fdsCur;
    const fdsOk = Math.max(1, fdsCur.desequilibrio) <= Math.max(1, fdsNovo.desequilibrio) && (p.regras?.sabDom == null || fdsCur.pares >= fdsNovo.pares) && (p.regras?.domSeg == null || fdsCur.segPares >= fdsNovo.segPares);
    if (res.ok && curValid && fdsOk && evaluate(p, curRows).obj <= res.objective + 1e-6) {
      const tur = ajustarTurnos(store, sid);
      const alm = comAlmocos(tur.store, sid);
      const mudou = alm.store !== store || tinhaLimpo;
      if (mudou) updateStore(() => alm.store);
      const afterKeep = mudou ? analyzeSector(alm.store, sid).totals : before;
      setReport({
        avisos: [...(p.avisos ?? []), ...validate(p, curRows).filter((v) => !impede(v)).map((v) => v.message)],
        fds: resumoParaRelatorio(p, curRows),
        divTurnos: divisaoTurnos(p, curRows),
        divDias: divisaoDias(p, curRows),
        almoco: alm.almoco,
        turnos: tur.rodizio || tur.trocas || tur.semAlternativa || tur.cobertos || tur.semCobertura ? { rodizio: tur.rodizio, trocas: tur.trocas, semAlternativa: tur.semAlternativa, cobertos: tur.cobertos, semCobertura: tur.semCobertura } : undefined,
        sectorId: sid,
        ok: true,
        applied: false,
        engine: `${engine} — a escala atual já é a melhor encontrada`,
        ms: Date.now() - t0,
        before: { pct: before.pct, def: before.deficitHoursPerWeek },
        after: { pct: afterKeep.pct, def: afterKeep.deficitHoursPerWeek },
        violations: [],
        explanations: [],
        ceiling,
        remainingRed: afterKeep.redCells,
        at: new Date().toLocaleTimeString("pt-BR"),
      });
      setManualEdit(null);
      setRunning(false);
      return;
    }
    if (res.ok) {
      // folgas → turnos do dia (rodízio, quem fecha não abre) → almoços onde sobra gente no posto, e as folgas
      // calculadas de novo com os almoços no lugar (fica a versão com menos falta de gente)
      const g = aplicarGeracao(store, sid, p, res.rows, { days });
      const tur = g.tur;
      const lastRun = { at: new Date().toISOString(), engine, ok: true, summary: "" };
      const nextStore: Store = { ...g.store, sectors: g.store.sectors.map((s) => (s.id === sid ? { ...s, lastRun } : s)) };
      const after = analyzeSector(nextStore, sid).totals;
      updateStore(() => nextStore);
      setReport({
        avisos: [...(g.p.avisos ?? []), ...(res.descansoAvisos ?? [])],
        fds: resumoParaRelatorio(g.p, g.rows),
        divTurnos: divisaoTurnos(g.p, g.rows),
        divDias: divisaoDias(g.p, g.rows),
        almoco: { dias: 0, mudancas: g.almoco.mudancas + g.almoco.novos, missBefore: 0, missAfter: 0 },
        turnos: tur.rodizio || tur.trocas || tur.semAlternativa || tur.cobertos || tur.semCobertura ? { rodizio: tur.rodizio, trocas: tur.trocas, semAlternativa: tur.semAlternativa, cobertos: tur.cobertos, semCobertura: tur.semCobertura } : undefined,
        sectorId: sid,
        ok: true,
        applied: true,
        engine,
        ms: Date.now() - t0,
        before: { pct: before.pct, def: before.deficitHoursPerWeek },
        after: { pct: after.pct, def: after.deficitHoursPerWeek },
        violations: [],
        explanations: [],
        ceiling,
        remainingRed: after.redCells,
        at: new Date().toLocaleTimeString("pt-BR"),
      });
      setManualEdit(null);
    } else {
      setReport({
        sectorId: sid,
        ok: false,
        applied: false,
        engine,
        ms: Date.now() - t0,
        before: { pct: before.pct, def: before.deficitHoursPerWeek },
        after: { pct: before.pct, def: before.deficitHoursPerWeek },
        violations: res.violations,
        explanations,
        ceiling,
        remainingRed: before.redCells,
        pendingRows: res.rows,
        at: new Date().toLocaleTimeString("pt-BR"),
      });
    }
    setRunning(false);
  };

  const applyDraft = () => {
    if (!report?.pendingRows) return;
    const p = buildProblem(store, report.sectorId, { keepLocks: true });
    const rows = report.pendingRows;
    updateStore((st) => ({ ...st, sectors: st.sectors.map((s) => (s.id === report.sectorId ? applyResult(s, p, rows) : s)) }));
    setReport({ ...report, applied: true, pendingRows: undefined });
    setToast("Rascunho aplicado. As violações aparecem nos alertas até serem corrigidas.");
  };

  const focus = (t: AlertTarget) => {
    setHighlight({ ...t, nonce: Date.now() });
    if (t.kind === "coverage") {
      setCoverageWeek(t.week);
      setTimeout(() => document.getElementById("cobertura")?.scrollIntoView({ block: "start" }), 30);
    } else if (t.kind === "cell") {
      setTimeout(() => {
        const el = document.getElementById(`cell-${t.empId}-${t.date}`) ?? document.getElementById("calendario");
        el?.scrollIntoView({ block: "center", inline: "center" });
      }, 30);
    } else {
      document.getElementById(t.id)?.scrollIntoView({ block: "start" });
    }
  };

  const value: Ctx | null =
    ready && store && sector
      ? {
          ready,
          stores,
          store,
          sector,
          analysis,
          sectorSummaries,
          setStoreId,
          setSectorId,
          updateStore,
          updateStoreById,
          storeSel,
          selStores,
          setStoreSel,
          updateSector,
          replaceStores,
          addStore,
          removeStore,
          adapter,
          saveState,
          savedAt,
          saveNow,
          reload,
          solverOnline,
          solverName,
          engineChoice,
          setEngineChoice,
          redistribute,
          applyDraft,
          running,
          report,
          setReport,
          highlight,
          focus,
          coverageWeek,
          setCoverageWeek,
          manualEdit,
          noteManualEdit: () => {
            setReport(null);
            setManualEdit((m) => ({ sectorId: sector.id, count: (m && m.sectorId === sector.id ? m.count : 0) + 1 }));
          },
          clearManualEdit: () => setManualEdit(null),
          toast,
          setToast,
          desfazer,
          podeDesfazer: histN > 0,
          ultimaMudanca: () => ultima.current,
        }
      : null;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!value)
    return (
      <div className="min-h-[60vh] grid place-items-center text-muted text-sm" role="status">
        Carregando escalas…
      </div>
    );
  return <SimCtx.Provider value={value}>{children}</SimCtx.Provider>;
}

export const pct = (n: number) => `${fmtNum(n, 1)}%`;
