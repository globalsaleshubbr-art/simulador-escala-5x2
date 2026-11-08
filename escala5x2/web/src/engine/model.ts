import type { CalDay, Cell, Code, Employee, Jornada, MinRule, PostAssignment, Reassignment, Sector, Shift, Store, StoreConfig } from "./types";
import { addDays, epochDay, toMin, weekdayOf } from "./time";

export const isWorking = (c: Code | undefined | null) => c === "T" || c === "D";

/** Dias do período da simulação (blocos de 7 dias a partir da data inicial). */
export function buildDays(cfg: StoreConfig, startDate = cfg.startDate, weeks = cfg.weeks): CalDay[] {
  const out: CalDay[] = [];
  const hol = new Map(cfg.holidays.map((h) => [h.date, h]));
  for (let i = 0; i < weeks * 7; i++) {
    const date = addDays(startDate, i);
    const weekday = weekdayOf(date);
    const holiday = hol.get(date) ?? null;
    const isSun = weekday === 0;
    let closed = false;
    let special = false;
    let openMin = toMin(cfg.open);
    let closeMin = toMin(cfg.close);
    if (holiday) {
      if (!holiday.open) closed = true;
      else special = true;
    }
    if (isSun) {
      if (!cfg.sundayOpen) closed = true;
      else special = true;
    }
    if (special) {
      openMin = toMin(cfg.sundayStart);
      closeMin = toMin(cfg.sundayEnd);
    }
    out.push({ idx: i, date, week: Math.floor(i / 7), weekday, holiday, closed, special, openMin, closeMin });
  }
  return out;
}

export interface ResolvedShift {
  shift: Shift | null;
  start: number;
  end: number;
  breakStart: number;
  breakEnd: number;
  workMin: number;
}

export function shiftWorkMin(cfg: StoreConfig, s: Shift): number {
  return s.workMin ?? cfg.dailyMin;
}

/** Saída = Entrada + Jornada efetiva + Intervalo não computado. */
export function shiftEnd(cfg: StoreConfig, s: Shift): number {
  return toMin(s.start) + shiftWorkMin(cfg, s) + (s.breakStart ? s.breakMin : 0);
}

// ---------------------------------------------------------------- 12x36 (plantão dia sim, dia não)
export const isPlantao = (e: Pick<Employee, "regime">) => e.regime === "12x36";
/** No 12x36 a pessoa trabalha dia sim, dia não, ancorado no calendário (Plantão A e Plantão B). */
export function plantaoTrabalha(e: Pick<Employee, "plantaoFase">, iso: string): boolean {
  return (((epochDay(iso) + (e.plantaoFase ?? 0)) % 2) + 2) % 2 === 0;
}
export const nomePlantao = (e: Pick<Employee, "plantaoFase">) => (e.plantaoFase === 1 ? "B" : "A");

export function resolveShiftObj(cfg: StoreConfig, s: Shift | null | undefined): ResolvedShift {
  if (!s) return { shift: null, start: 0, end: 0, breakStart: 0, breakEnd: 0, workMin: 0 };
  const start = toMin(s.start);
  const workMin = shiftWorkMin(cfg, s);
  const hasBreak = !!s.breakStart && s.breakMin > 0;
  // turno que passa da meia-noite: intervalo depois da meia-noite fica no "dia seguinte" (minutos > 1440)
  const breakStart = hasBreak ? toMin(s.breakStart) + (toMin(s.breakStart) < start ? 1440 : 0) : 0;
  const breakEnd = hasBreak ? breakStart + s.breakMin : 0;
  return { shift: s, start, end: start + workMin + (hasBreak ? s.breakMin : 0), breakStart, breakEnd, workMin };
}

// ---------------------------------------------------------------- contratação (estágio / jovem aprendiz)
export type Contratacao = "clt" | "estagio" | "aprendiz";
export const CONTRATACAO_NOME: Record<Contratacao, string> = { clt: "CLT", estagio: "Estagiário", aprendiz: "Jovem aprendiz" };
/** Padrões ao escolher a contratação: horas por dia e por semana (min). */
export const CONTRATACAO_PADRAO: Record<"estagio" | "aprendiz", { dia: number; semana: number }> = { estagio: { dia: 360, semana: 1800 }, aprendiz: { dia: 360, semana: 1800 } };
export const contratacaoDe = (e: Pick<Employee, "contratacao">): Contratacao => (e.contratacao === "estagio" || e.contratacao === "aprendiz" ? e.contratacao : "clt");
/** Jornada cadastrada da pessoa (Personalizar → Jornadas); null = a da loja. O 12x36 não usa jornada. */
export function jornadaDe(cfg: Pick<StoreConfig, "jornadas"> | undefined, e: Pick<Employee, "jornadaId" | "regime">): Jornada | null {
  if (!cfg || !e.jornadaId || isPlantao(e)) return null;
  return cfg.jornadas?.find((j) => j.id === e.jornadaId) ?? null;
}
/** Folgas por semana da pessoa: as da jornada cadastrada, as escolhidas para ela (5x2/6x1), as do setor ou as da loja. */
export function folgasDe(store: Store, e: Employee): number {
  const j = jornadaDe(store.config, e);
  if (j) return Math.max(0, 7 - Math.min(7, Math.max(1, j.diasSemana)));
  if (e.folgasSemana != null) return e.folgasSemana;
  const sec = store.sectors.find((s) => s.id === e.sectorId);
  return sec?.folgasSemana ?? store.config.folgasPorSemana;
}
/** Nome curto do modelo pelas folgas: 2 → 5x2, 1 → 6x1. */
export const nomeFolgas = (f: number) => (f === 2 ? "5x2" : f === 1 ? "6x1" : `${7 - f}x${f}`);
/**
 * Horas por dia de quem está num modelo diferente do da loja (ex.: 6x1 numa loja 5x2) e usa um turno
 * sem horas próprias: o limite semanal dividido pelos dias de trabalho (42h ÷ 6 = 7h). null = a do turno.
 */
export function horasDiaModelo(store: Store, e: Employee, sh: Shift | null | undefined): number | null {
  if (!sh || sh.special || sh.plantao || sh.workMin != null || isPlantao(e) || jornadaDe(store.config, e)) return null;
  const f = folgasDe(store, e);
  if (f === store.config.folgasPorSemana) return null;
  return Math.floor(store.config.weeklyMaxMin / Math.max(1, 7 - f));
}
/** Horas por dia próprias: as da jornada cadastrada; senão as do estagiário/aprendiz; null = as do turno. */
export function jornadaPessoal(e: Pick<Employee, "contratacao" | "horasDia" | "regime" | "jornadaId">, cfg?: Pick<StoreConfig, "jornadas">): number | null {
  const j = jornadaDe(cfg, e);
  if (j && j.horasDia > 0) return j.horasDia;
  return contratacaoDe(e) !== "clt" && !isPlantao(e) && e.horasDia && e.horasDia > 0 ? e.horasDia : null;
}
/** Intervalo de quem tem jornada própria: o escolhido, ou automático (até 4h: sem; até 6h: 15 min; acima: o do turno, mínimo 1h). */
export function intervaloPessoal(e: Pick<Employee, "intervaloMin">, workMin: number, doTurno: number): number {
  if (e.intervaloMin != null && e.intervaloMin >= 0) return e.intervaloMin;
  if (workMin <= 240) return 0;
  if (workMin <= 360) return 15;
  return Math.max(60, doTurno);
}
/** Aplica a jornada própria (horas por dia + intervalo) sobre o turno: mesma entrada, saída recalculada. */
export function comJornadaPessoal(r: ResolvedShift, e: Employee, special = false, cfg?: StoreConfig, porModelo: number | null = null): ResolvedShift {
  const w0 = jornadaPessoal(e, cfg) ?? porModelo;
  if (w0 == null || !r.shift) return r;
  // domingo/feriado com turno mais curto: não passa do turno especial
  const w = special ? Math.min(w0, r.workMin) : w0;
  const turnoBrk = r.breakEnd > r.breakStart ? r.breakEnd - r.breakStart : 0;
  const j = jornadaDe(cfg, e);
  const brk = intervaloPessoal(j ? { intervaloMin: j.intervaloMin ?? e.intervaloMin } : e, w, turnoBrk);
  const end = r.start + w + brk;
  if (!brk) return { ...r, workMin: w, end, breakStart: 0, breakEnd: 0 };
  // mantém o horário do intervalo do turno (ou o escalonado) se couber; senão, no meio da jornada
  let bs = turnoBrk ? r.breakStart : 0;
  if (!bs || bs <= r.start || bs + brk >= end) bs = r.start + Math.round(w / 2 / 15) * 15;
  return { ...r, workMin: w, end, breakStart: bs, breakEnd: bs + brk };
}

export function employeeShift(store: Store, sector: Sector | undefined, emp: Employee, special: boolean): ResolvedShift {
  const sec = sector ?? store.sectors.find((s) => s.id === emp.sectorId);
  if (!sec) return resolveShiftObj(store.config, null);
  // no 12x36 o plantão é o mesmo em domingo e feriado
  if (special && !isPlantao(emp)) {
    const sid = emp.sundayShiftId ?? sec.defaultSundayShiftId;
    const sh = sec.shifts.find((s) => s.id === sid) ?? sec.shifts.find((s) => s.special) ?? null;
    if (sh) return comJornadaPessoal(resolveShiftObj(store.config, sh), emp, true, store.config);
    // sem turno especial: usa o turno normal
  }
  const sh = sec.shifts.find((s) => s.id === emp.shiftId) ?? sec.shifts.find((s) => !s.special) ?? null;
  const pm = horasDiaModelo(store, emp, sh);
  // intervalo escalonado da pessoa (só no turno normal, que tem intervalo)
  if (sh && (emp.breakStart || emp.almocoMin) && sh.breakStart && sh.breakMin > 0)
    return comJornadaPessoal(resolveShiftObj(store.config, { ...sh, breakStart: emp.breakStart || sh.breakStart, breakMin: emp.almocoMin && emp.almocoMin >= 15 ? emp.almocoMin : sh.breakMin }), emp, false, store.config, pm);
  return comJornadaPessoal(resolveShiftObj(store.config, sh), emp, false, store.config, pm);
}

/**
 * Turno da pessoa num dia específico: o turno escolhido para aquele dia (célula), se houver;
 * senão o turno habitual (normal ou de domingo/feriado, com o intervalo próprio da pessoa).
 */
/**
 * Almoço próprio do domingo da pessoa sobre o turno do domingo: o tempo muda a saída (as horas trabalhadas não mudam);
 * o horário vale se couber no expediente.
 */
export function comAlmocoDomingo(r: ResolvedShift, emp: Employee): ResolvedShift {
  if (!r.shift || (!emp.almocoDomingo && !emp.almocoDomingoMin)) return r;
  // turno de domingo sem intervalo: o almoço do domingo entra no meio do expediente (1h, se o tempo não foi escolhido)
  const len0 = r.breakEnd > r.breakStart ? r.breakEnd - r.breakStart : 0;
  const len = emp.almocoDomingoMin && emp.almocoDomingoMin >= 15 ? emp.almocoDomingoMin : len0 || 60;
  const end = r.end + (len - len0);
  let b = len0 ? r.breakStart : r.start + Math.round(r.workMin / 2 / 15) * 15;
  if (emp.almocoDomingo) {
    const x = toMin(emp.almocoDomingo);
    if (x > r.start && x + len < end) b = x;
  }
  if (b + len >= end) b = r.breakStart;
  return { ...r, breakStart: b, breakEnd: b + len, end };
}

/** O dia usa um turno de domingo/feriado (o habitual, ou um escolhido para o dia que também é de domingo)? */
export function noTurnoDeDomingo(sec: Sector | undefined, cell: { shiftId?: string } | undefined): boolean {
  if (!cell?.shiftId) return true;
  return !!sec?.shifts.find((s) => s.id === cell.shiftId)?.special;
}

export function dayShift(store: Store, sector: Sector | undefined, emp: Employee, day: CalDay): ResolvedShift {
  const sec = sector ?? store.sectors.find((s) => s.id === emp.sectorId);
  const cell = sec?.schedule[emp.id]?.[day.date];
  let r: ResolvedShift | null = null;
  if (sec && cell?.shiftId) {
    const sh = sec.shifts.find((s) => s.id === cell.shiftId);
    if (sh) r = comJornadaPessoal(resolveShiftObj(store.config, sh), emp, sh.special, store.config, horasDiaModelo(store, emp, sh));
  }
  r ??= employeeShift(store, sec, emp, day.special);
  // domingo no turno de domingo: horário e tempo de almoço próprios do domingo (antes do "só neste dia", que manda)
  if (day.weekday === 0 && noTurnoDeDomingo(sec, cell)) r = comAlmocoDomingo(r, emp);
  // intervalo só deste dia: outro horário e/ou outra duração (a saída anda junto: as horas trabalhadas não mudam)
  if ((cell?.brk || cell?.brkMin) && r.breakEnd > r.breakStart) {
    const len0 = r.breakEnd - r.breakStart;
    const len = cell.brkMin && cell.brkMin >= 15 ? cell.brkMin : len0;
    const end = r.end + (len - len0);
    const b = cell.brk ? toMin(cell.brk) : r.breakStart;
    const b2 = b < r.start ? b + 1440 : b;
    if (b2 > r.start && b2 + len < end) return { ...r, breakStart: b2, breakEnd: b2 + len, end };
    // horário novo não cabe: fica só a duração
    if (len !== len0 && r.breakStart + len < end) return { ...r, breakEnd: r.breakStart + len, end };
  }
  return r;
}

/** Dias da semana de folga fixa da pessoa (até dois; 0 = domingo .. 6 = sábado). */
export function folgasFixas(e: Pick<Employee, "fixedOff" | "fixedOff2">): number[] {
  return Array.from(new Set([e.fixedOff, e.fixedOff2].filter((x): x is number => x != null)));
}
/** A pessoa tem folga fixa no domingo (não trabalha aos domingos). */
export const folgaFixaDomingo = (e: Pick<Employee, "fixedOff" | "fixedOff2">) => e.fixedOff === 0 || e.fixedOff2 === 0;

/** Dia em branco: o mês foi limpo e a escala ainda não foi gerada de novo (sem nada lançado no dia). */
export function emBranco(sector: Pick<Sector, "limpo" | "schedule">, empId: string, date: string): boolean {
  return !!sector.limpo?.length && sector.limpo.includes(date.slice(0, 7)) && !sector.schedule[empId]?.[date];
}

export function getCell(sector: Sector, empId: string, date: string): Cell | undefined {
  return sector.schedule[empId]?.[date];
}

/** Código efetivo de um dia, considerando loja fechada. */
export function cellCode(sector: Sector, empId: string, day: CalDay): Code {
  const c = getCell(sector, empId, day.date);
  if (day.closed) {
    if (c && (c.c === "A" || c.c === "M" || c.c === "V")) return c.c;
    return day.holiday && !day.holiday.open ? "H" : "F";
  }
  if (c) {
    // dia aberto: normaliza T/D conforme o tipo do dia
    if (c.c === "T" && day.special) return "D";
    if ((c.c === "D" || c.c === "H") && !day.special) return c.c === "H" ? "F" : "T";
    if (c.c === "H") return "F";
    return c.c;
  }
  return day.special ? "D" : "T";
}

export function sectorEmployees(store: Store, sectorId: string): Employee[] {
  return store.employees.filter((e) => e.sectorId === sectorId);
}

function ruleApplies(r: MinRule, day: CalDay) {
  if (r.date) return r.date === day.date;
  // feriado aberto funciona como domingo (jornada e horário especiais)
  return r.days.includes(day.special ? 0 : day.weekday);
}

/** Necessidade mínima e ideal em um instante (min do dia). Regra mais específica vence:
 *  data específica > conjunto de dias menor > maior mínimo. */
export function requirementAt(sector: Sector, day: CalDay, t: number): { min: number; ideal: number; rule: MinRule | null } {
  let best: MinRule | null = null;
  let bestScore = -Infinity;
  for (const r of sector.minRules) {
    if (!ruleApplies(r, day)) continue;
    const s = toMin(r.start);
    const e = toMin(r.end);
    if (t < s || t >= e) continue;
    const score = (r.date ? 1000 : 0) + (7 - r.days.length) * 10 + r.min * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  if (!best) return { min: 0, ideal: 0, rule: null };
  const ideal = best.ideal != null && best.ideal > best.min ? best.ideal : best.min;
  return { min: best.min, ideal, rule: best };
}

/** Eixo horário do mapa: do menor horário de abertura ao maior fechamento do período. */
export function slotAxis(cfg: StoreConfig, days: CalDay[], slot = cfg.slot): number[] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const d of days) {
    if (d.closed) continue;
    lo = Math.min(lo, d.openMin);
    hi = Math.max(hi, d.closeMin);
  }
  if (!isFinite(lo)) {
    lo = toMin(cfg.open);
    hi = toMin(cfg.close);
  }
  lo = Math.floor(lo / slot) * slot;
  const out: number[] = [];
  for (let t = lo; t < hi; t += slot) out.push(t);
  return out;
}

function matchesWhen(x: { date: string | null; weekdays: number[] }, day: CalDay) {
  return x.date ? x.date === day.date : x.weekdays.includes(day.weekday);
}

export function reassignmentsOn(store: Store, empId: string, day: CalDay): Reassignment[] {
  return store.reassignments.filter((r) => r.employeeId === empId && matchesWhen(r, day));
}
export function assignmentsOn(store: Store, empId: string, day: CalDay): PostAssignment[] {
  return store.assignments.filter((a) => a.employeeId === empId && matchesWhen(a, day));
}

export type PresenceState =
  | "working" // no posto do setor
  | "break" // em intervalo
  | "out" // remanejado para outro setor
  | "activity" // em outra atividade (não conta)
  | "before" // ainda não entrou
  | "after" // já saiu
  | "off" // folga
  | "absent"
  | "vacation"
  | "holiday";

export interface Presence {
  state: PresenceState;
  sectorId: string; // setor onde está contando (para working)
  post: string;
  shift: ResolvedShift;
  code: Code;
  detail?: string;
}

/** Onde a pessoa está no instante t (min) do dia. Nunca em dois lugares ao mesmo tempo. */
/**
 * Parte da madrugada de um turno que começou no dia anterior e passa da meia-noite (ex.: plantão 19h–7h),
 * já no relógio deste dia (minutos a partir de 00:00). null = não veio de turno noturno.
 */
export function noturnoAnterior(store: Store, sector: Sector | undefined, emp: Employee, day: CalDay): { end: number; breakStart: number; breakEnd: number } | null {
  const sec = sector ?? store.sectors.find((s) => s.id === emp.sectorId);
  if (!sec) return null;
  // atalho: só quem tem algum turno que passa da meia-noite
  if (!sec.shifts.some((s) => shiftEndOf(store.config, s) > 1440)) return null;
  const prevIso = addDays(day.date, -1);
  const prev = buildDays(store.config, prevIso, 1)[0];
  // fora do período planejado (sem célula), o 12x36 segue o revezamento
  const semCelula = !sec.schedule[emp.id]?.[prevIso];
  const trabalhou = isPlantao(emp) && semCelula ? !prev.closed && plantaoTrabalha(emp, prevIso) : isWorking(cellCode(sec, emp.id, prev));
  if (!trabalhou) return null;
  const r = dayShift(store, sec, emp, prev);
  if (!r.shift || r.end <= 1440) return null;
  return { end: r.end - 1440, breakStart: r.breakStart - 1440, breakEnd: r.breakEnd - 1440 };
}
const shiftEndOf = (cfg: StoreConfig, s: Shift) => toMin(s.start) + (s.workMin ?? cfg.dailyMin) + (s.breakStart ? s.breakMin : 0);

/**
 * Onde a pessoa está no instante `t` ou, com `len` > 0, durante a faixa [t, t+len):
 * só conta como trabalhando se estiver presente na faixa inteira (quem chega ou sai no meio da faixa,
 * ou tem parte do intervalo nela, não conta como disponível naquela faixa).
 */
export function presenceAt(store: Store, emp: Employee, day: CalDay, t: number, codeOverride?: Code, len = 0): Presence {
  const sector = store.sectors.find((s) => s.id === emp.sectorId);
  const code: Code = codeOverride ?? (sector ? cellCode(sector, emp.id, day) : "F");
  const shift = dayShift(store, sector, emp, day);
  const base = { sectorId: emp.sectorId, post: emp.defaultPost, shift, code };
  // madrugada de um plantão noturno que começou ontem
  if (t < (isWorking(code) && shift.shift ? shift.start : 1440)) {
    const sp = noturnoAnterior(store, sector, emp, day);
    if (sp && t < sp.end) {
      if (len > 0 && t + len > sp.end) return { ...base, state: "after" };
      if (sp.breakEnd > sp.breakStart && sp.breakStart < t + Math.max(len, 1) && sp.breakEnd > t) return { ...base, state: "break" };
      return { ...base, state: "working" };
    }
  }
  if (!isWorking(code)) {
    const st: PresenceState = code === "A" || code === "M" ? "absent" : code === "V" ? "vacation" : code === "H" ? "holiday" : "off";
    return { ...base, state: st };
  }
  if (!shift.shift) return { ...base, state: "off", detail: "sem turno" };
  if (t < shift.start) return { ...base, state: "before" };
  if (t >= shift.end || (len > 0 && t + len > shift.end)) return { ...base, state: "after" };
  if (shift.breakEnd > shift.breakStart && shift.breakStart < t + Math.max(len, 1) && shift.breakEnd > t) return { ...base, state: "break" };
  const re = reassignmentsOn(store, emp.id, day).find((r) => t >= toMin(r.start) && t < toMin(r.end));
  if (re) {
    if (re.toSectorId === emp.sectorId) return { ...base, state: "working", post: re.post || base.post };
    return { ...base, state: "out", sectorId: re.toSectorId, post: re.post || "", detail: re.note };
  }
  const asg = assignmentsOn(store, emp.id, day).find((a) => t >= toMin(a.start) && t < toMin(a.end));
  if (asg) {
    if (!asg.counts) return { ...base, state: "activity", post: asg.post };
    return { ...base, state: "working", post: asg.post };
  }
  return { ...base, state: "working" };
}

/** Tamanho da faixa do eixo (min). */
export function slotLen(axis: number[], fallback = 30): number {
  return axis.length > 1 ? axis[1] - axis[0] : fallback;
}

/** Índices de slot (do eixo) em que a pessoa conta para o setor `sectorId` caso trabalhe no dia. */
export function contributionSlots(store: Store, emp: Employee, day: CalDay, axis: number[], sectorId: string): number[] {
  const out: number[] = [];
  const workCode: Code = day.special ? "D" : "T";
  const len = slotLen(axis, store.config.slot);
  for (let i = 0; i < axis.length; i++) {
    const p = presenceAt(store, emp, day, axis[i], workCode, len);
    if (p.state === "working" && p.sectorId === sectorId) out.push(i);
    else if (p.state === "out" && p.sectorId === sectorId) out.push(i);
  }
  return out;
}

/** Minutos trabalhados no dia (jornada efetiva do turno). */
export function dayWorkMin(store: Store, emp: Employee, day: CalDay, code: Code): number {
  if (!isWorking(code)) return 0;
  return dayShift(store, undefined, emp, day).workMin;
}
