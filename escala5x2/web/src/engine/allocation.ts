// Mapa de alocação: quem está trabalhando, onde, e o que acontece se alguém faltar.
import type { CalDay, Employee, Store } from "./types";
import { buildDays, cellCode, employeeShift, requirementAt, presenceAt, type PresenceState } from "./model";
import { fmtTime, toMin } from "./time";

export interface AllocRow {
  emp: Employee;
  sectorName: string;
  sectorId: string;
  post: string;
  where: string; // setor onde está agora
  entrada: string;
  intervalo: string;
  saida: string;
  state: PresenceState;
  situacao: string;
  hasSchedule: boolean;
}

export const STATE_LABEL: Record<PresenceState, string> = {
  working: "Trabalhando",
  break: "Intervalo",
  out: "Remanejado",
  activity: "Outra atividade",
  before: "Ainda não entrou",
  after: "Já saiu",
  off: "Folga",
  absent: "Ausente",
  vacation: "Férias",
  holiday: "Feriado",
};

export function dayFor(store: Store, date: string): CalDay {
  return buildDays(store.config, date, 1)[0];
}

export function allocationAt(store: Store, date: string, time: string, sectorId: string | "all"): AllocRow[] {
  const day = dayFor(store, date);
  const t = toMin(time);
  const emps = store.employees.filter((e) => sectorId === "all" || e.sectorId === sectorId || store.reassignments.some((r) => r.employeeId === e.id && r.toSectorId === sectorId));
  return emps.map((e) => {
    const sec = store.sectors.find((s) => s.id === e.sectorId)!;
    const hasSchedule = !!sec.schedule[e.id]?.[date];
    const p = presenceAt(store, e, day, t, cellCode(sec, e.id, day));
    const sh = employeeShift(store, sec, e, day.special);
    const working = p.code === "T" || p.code === "D";
    const whereSec = store.sectors.find((s) => s.id === p.sectorId);
    let situacao = STATE_LABEL[p.state];
    if (p.state === "out") situacao = `Remanejado → ${whereSec?.name ?? ""}`;
    if (p.state === "activity") situacao = `Outra atividade: ${p.post}`;
    return {
      emp: e,
      sectorName: sec.name,
      sectorId: sec.id,
      post: p.state === "working" || p.state === "out" || p.state === "activity" ? p.post : working ? e.defaultPost : "—",
      where: whereSec?.name ?? sec.name,
      entrada: working && sh.shift ? fmtTime(sh.start) : "—",
      intervalo: working && sh.breakEnd > sh.breakStart ? `${fmtTime(sh.breakStart)}–${fmtTime(sh.breakEnd)}` : "—",
      saida: working && sh.shift ? fmtTime(sh.end) : "—",
      state: p.state,
      situacao,
      hasSchedule,
    };
  });
}

/** Quantas pessoas contam para o setor no instante, e o mínimo exigido. */
export function sectorCountAt(store: Store, sectorId: string, date: string, time: string) {
  const day = dayFor(store, date);
  const t = toMin(time);
  const sector = store.sectors.find((s) => s.id === sectorId)!;
  let count = 0;
  const present: Employee[] = [];
  for (const e of store.employees) {
    const sec = store.sectors.find((s) => s.id === e.sectorId)!;
    const p = presenceAt(store, e, day, t, cellCode(sec, e.id, day));
    if ((p.state === "working" && p.sectorId === sectorId) || (p.state === "out" && p.sectorId === sectorId)) {
      count++;
      present.push(e);
    }
  }
  const req = day.closed ? { min: 0, ideal: 0 } : requirementAt(sector, day, t);
  return { count, min: req.min, ideal: req.ideal, present, day };
}

export interface AbsenceImpact {
  post: string;
  before: number;
  after: number;
  min: number;
  uncovered: boolean;
  candidates: { emp: Employee; from: string; reason: string; safe: boolean }[];
}

/** Simula a falta de uma pessoa no instante: posto descoberto e quem pode cobrir. */
export function simulateAbsence(store: Store, empId: string, date: string, time: string): AbsenceImpact | null {
  const emp = store.employees.find((e) => e.id === empId);
  if (!emp) return null;
  const day = dayFor(store, date);
  const t = toMin(time);
  const sec = store.sectors.find((s) => s.id === emp.sectorId)!;
  const p = presenceAt(store, emp, day, t, cellCode(sec, emp.id, day));
  const target = p.state === "out" ? p.sectorId : emp.sectorId;
  const now = sectorCountAt(store, target, date, time);
  const counted = (p.state === "working" || p.state === "out") && p.sectorId === target;
  const after = counted ? now.count - 1 : now.count;
  const candidates: AbsenceImpact["candidates"] = [];
  for (const e of store.employees) {
    if (e.id === emp.id) continue;
    const s2 = store.sectors.find((s) => s.id === e.sectorId)!;
    const p2 = presenceAt(store, e, day, t, cellCode(s2, e.id, day));
    if (e.sectorId === target && p2.state === "activity") {
      candidates.push({ emp: e, from: s2.name, reason: `está em "${p2.post}" no mesmo setor`, safe: true });
      continue;
    }
    if (e.sectorId !== target && (e.quals.includes(target) || e.joker) && p2.state === "working") {
      const own = sectorCountAt(store, e.sectorId, date, time);
      const safe = own.count - 1 >= own.min;
      candidates.push({
        emp: e,
        from: s2.name,
        reason: safe ? `${s2.name} fica com ${own.count - 1} (mínimo ${own.min})` : `${s2.name} ficaria abaixo do mínimo (${own.count - 1}/${own.min})`,
        safe,
      });
    }
  }
  candidates.sort((a, b) => Number(b.safe) - Number(a.safe));
  return { post: p.post || emp.defaultPost, before: now.count, after, min: now.min, uncovered: after < now.min, candidates };
}

/** Situação dos postos de um setor no instante. */
export function postBoard(store: Store, sectorId: string, date: string, time: string) {
  const sector = store.sectors.find((s) => s.id === sectorId)!;
  const rows = allocationAt(store, date, time, sectorId);
  const occupied = new Map<string, AllocRow[]>();
  for (const r of rows) {
    if ((r.state === "working" && r.sectorId === sectorId) || (r.state === "out" && r.where === sector.name)) {
      const list = occupied.get(r.post) ?? [];
      list.push(r);
      occupied.set(r.post, list);
    }
  }
  const posts = Array.from(new Set([...sector.posts, ...occupied.keys()])).filter(Boolean);
  return posts.map((post) => ({ post, people: occupied.get(post) ?? [] }));
}
