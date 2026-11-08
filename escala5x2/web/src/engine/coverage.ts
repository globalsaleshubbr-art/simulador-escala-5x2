import type { CalDay, Code, Employee, Sector, Store } from "./types";
import { assignmentsOn, cellCode, dayShift, isWorking, noturnoAnterior, reassignmentsOn, requirementAt, slotLen, type PresenceState } from "./model";
import { toMin } from "./time";

export type SlotStatus = "closed" | "none" | "red" | "yellow" | "light" | "green";

export interface DayCoverage {
  day: CalDay;
  counts: number[];
  req: number[];
  ideal: number[];
  status: SlotStatus[];
  open: boolean[];
}

export interface SlotInfo {
  state: PresenceState;
  sectorId: string;
  post: string;
}

/** Estado da pessoa em cada slot do eixo, para um dia. Uma pessoa = um lugar por slot. */
export function daySlotStates(store: Store, emp: Employee, day: CalDay, axis: number[], codeOverride?: Code): SlotInfo[] {
  const sector = store.sectors.find((s) => s.id === emp.sectorId);
  const code: Code = codeOverride ?? (sector ? cellCode(sector, emp.id, day) : "F");
  const n = axis.length;
  const out: SlotInfo[] = new Array(n);
  const lenSp = slotLen(axis, store.config.slot);
  // madrugada de um plantão noturno que começou ontem
  const sp = noturnoAnterior(store, sector, emp, day);
  const spill = (t: number): SlotInfo | null => {
    if (!sp || t >= sp.end) return null;
    if (t + lenSp > sp.end) return { state: "after", sectorId: emp.sectorId, post: "" };
    if (sp.breakEnd > sp.breakStart && sp.breakStart < t + lenSp && sp.breakEnd > t) return { state: "break", sectorId: emp.sectorId, post: "" };
    return { state: "working", sectorId: emp.sectorId, post: emp.defaultPost };
  };
  if (!isWorking(code)) {
    const st: PresenceState = code === "A" || code === "M" ? "absent" : code === "V" ? "vacation" : code === "H" ? "holiday" : "off";
    for (let i = 0; i < n; i++) out[i] = spill(axis[i]) ?? { state: st, sectorId: emp.sectorId, post: "" };
    return out;
  }
  const sh = dayShift(store, sector, emp, day);
  // a pessoa só conta na faixa se estiver presente nela inteira (chegada, saída e intervalo no meio da faixa contam como fora)
  const len = slotLen(axis, store.config.slot);
  const re = reassignmentsOn(store, emp.id, day).map((r) => ({ s: toMin(r.start), e: toMin(r.end), r }));
  const as = assignmentsOn(store, emp.id, day).map((a) => ({ s: toMin(a.start), e: toMin(a.end), a }));
  for (let i = 0; i < n; i++) {
    const t = axis[i];
    if (!sh.shift) {
      out[i] = { state: "off", sectorId: emp.sectorId, post: "" };
      continue;
    }
    if (t < sh.start) out[i] = spill(t) ?? { state: "before", sectorId: emp.sectorId, post: "" };
    else if (t >= sh.end || t + len > sh.end) out[i] = { state: "after", sectorId: emp.sectorId, post: "" };
    else if (sh.breakEnd > sh.breakStart && sh.breakStart < t + len && sh.breakEnd > t) out[i] = { state: "break", sectorId: emp.sectorId, post: "" };
    else {
      const r = re.find((x) => t >= x.s && t < x.e);
      if (r) {
        out[i] =
          r.r.toSectorId === emp.sectorId
            ? { state: "working", sectorId: emp.sectorId, post: r.r.post || emp.defaultPost }
            : { state: "out", sectorId: r.r.toSectorId, post: r.r.post };
        continue;
      }
      const a = as.find((x) => t >= x.s && t < x.e);
      if (a) {
        out[i] = a.a.counts ? { state: "working", sectorId: emp.sectorId, post: a.a.post } : { state: "activity", sectorId: emp.sectorId, post: a.a.post };
        continue;
      }
      out[i] = { state: "working", sectorId: emp.sectorId, post: emp.defaultPost };
    }
  }
  return out;
}

/** Pessoas que podem contar para o setor: do próprio setor + remanejadas para ele. */
export function relevantEmployees(store: Store, sectorId: string): Employee[] {
  const incoming = new Set(store.reassignments.filter((r) => r.toSectorId === sectorId).map((r) => r.employeeId));
  return store.employees.filter((e) => e.sectorId === sectorId || incoming.has(e.id));
}

export function countsFor(info: SlotInfo, emp: Employee, sectorId: string): boolean {
  if (info.state === "working") return info.sectorId === sectorId;
  if (info.state === "out") return info.sectorId === sectorId;
  return false;
}

export function statusOf(count: number, min: number, ideal: number, open: boolean): SlotStatus {
  if (!open && min === 0) return "closed";
  if (min === 0) return "none";
  if (count < min) return "red";
  if (ideal > min && count < ideal) return "yellow";
  if (count === min) return "light";
  return "green";
}

export function computeCoverage(store: Store, sector: Sector, days: CalDay[], axis: number[]): DayCoverage[] {
  const emps = relevantEmployees(store, sector.id);
  return days.map((day) => {
    const n = axis.length;
    const counts = new Array(n).fill(0);
    const req = new Array(n).fill(0);
    const ideal = new Array(n).fill(0);
    const open = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
      const t = axis[i];
      open[i] = !day.closed && t >= day.openMin && t < day.closeMin;
      if (day.closed) continue;
      const r = requirementAt(sector, day, t);
      req[i] = r.min;
      ideal[i] = r.ideal;
    }
    if (!day.closed) {
      for (const e of emps) {
        const st = daySlotStates(store, e, day, axis);
        for (let i = 0; i < n; i++) if (countsFor(st[i], e, sector.id)) counts[i]++;
      }
    }
    const status = counts.map((c, i) => statusOf(c, req[i], ideal[i], open[i]));
    return { day, counts, req, ideal, status, open };
  });
}

export interface CoverageTotals {
  reqSlots: number; // pessoa-slots exigidos
  metSlots: number; // pessoa-slots atendidos (até o mínimo)
  deficitSlots: number;
  pct: number;
  deficitHoursPerWeek: number;
  peakMissing: number;
  redCells: number;
}

export function coverageTotals(cov: DayCoverage[], slot: number, weeks: number): CoverageTotals {
  let reqSlots = 0;
  let metSlots = 0;
  let peak = 0;
  let red = 0;
  for (const d of cov) {
    for (let i = 0; i < d.req.length; i++) {
      const r = d.req[i];
      if (!r) continue;
      reqSlots += r;
      metSlots += Math.min(r, d.counts[i]);
      const miss = r - d.counts[i];
      if (miss > 0) {
        red++;
        if (miss > peak) peak = miss;
      }
    }
  }
  const deficitSlots = reqSlots - metSlots;
  return {
    reqSlots,
    metSlots,
    deficitSlots,
    pct: reqSlots ? (metSlots / reqSlots) * 100 : 100,
    deficitHoursPerWeek: (deficitSlots * slot) / 60 / Math.max(1, weeks),
    peakMissing: peak,
    redCells: red,
  };
}
