// Controle de férias: períodos lançados na escala (dias "V"), saldo por período aquisitivo,
// vencimentos e alertas. As regras vêm da loja e só geram alertas, nunca bloqueiam.
import type { Employee, Sector, Store, StoreConfig, VacRules } from "../engine/types";
import { addDays, addMonths, daysBetween, fmtDateBR } from "../engine/time";

export const DEFAULT_VAC: VacRules = { dias: 30, minPeriodo: 5, periodoLongo: 14, maxPeriodos: 3, avisoDias: 60, maxSimultaneo: null, descontoFaltas: true };

/**
 * Dias de férias conforme as faltas sem atestado no período aquisitivo (CLT art. 130):
 * até 5 → todos; 6 a 14 → 80%; 15 a 23 → 60%; 24 a 32 → 40%; mais de 32 → sem direito.
 * Com outro número de dias por período, a mesma proporção.
 */
export function vacDaysAfterAbsences(dias: number, faltas: number): number {
  if (faltas <= 5) return dias;
  if (faltas <= 14) return Math.round(dias * 0.8);
  if (faltas <= 23) return Math.round(dias * 0.6);
  if (faltas <= 32) return Math.round(dias * 0.4);
  return 0;
}
export function vacRules(cfg: StoreConfig): VacRules {
  return { ...DEFAULT_VAC, ...(cfg.vacation ?? {}) };
}

export interface VacBlock {
  start: string;
  end: string;
  days: number;
}

/** Férias da pessoa: dias "V" seguidos formam um período. */
export function vacBlocks(sec: Sector, empId: string): VacBlock[] {
  const row = sec.schedule[empId] ?? {};
  const dates = Object.keys(row)
    .filter((d) => row[d].c === "V")
    .sort();
  const out: VacBlock[] = [];
  for (const d of dates) {
    const last = out[out.length - 1];
    if (last && addDays(last.end, 1) === d) {
      last.end = d;
      last.days++;
    } else out.push({ start: d, end: d, days: 1 });
  }
  return out;
}

export interface Aquisitivo {
  start: string;
  end: string;
  /** último dia para tirar as férias deste período (fim do período concessivo) */
  deadline: string;
  taken: number;
  remaining: number;
  /** dias tirados (ou programados) depois do vencimento */
  late: number;
  /** quitado antes do controle começar */
  paid: boolean;
  /** faltas sem atestado no período aquisitivo */
  faltas: number;
  /** dias de férias a que tem direito neste período (com o desconto das faltas, se a regra estiver ligada) */
  entitled: number;
  blocks: VacBlock[];
}

export type VacStatus = "sem-admissao" | "adquirindo" | "em-dia" | "vence-breve" | "vencida";
export const STATUS_LABEL: Record<VacStatus, string> = {
  "sem-admissao": "Sem admissão",
  adquirindo: "Ainda adquirindo",
  "em-dia": "Em dia",
  "vence-breve": "Vence em breve",
  vencida: "Vencida",
};

export interface VacInfo {
  key: string;
  store: Store;
  sector: Sector;
  emp: Employee;
  name: string;
  shiftName: string;
  func: string;
  blocks: VacBlock[];
  periods: Aquisitivo[];
  /** período aquisitivo em curso */
  current: Aquisitivo | null;
  /** dias a tirar dos períodos já adquiridos */
  saldo: number;
  nextDeadline: string | null;
  status: VacStatus;
  daysToDeadline: number | null;
  onVacation: VacBlock | null;
  next: VacBlock | null;
  issues: string[];
  /** férias antigas consideradas tiradas e ainda não confirmadas pelo usuário */
  needsConfirm: boolean;
}

/** Situação de férias de uma pessoa em `today`. */
export function vacInfo(st: Store, sec: Sector, emp: Employee, rules: VacRules, today: string): VacInfo {
  const blocks = vacBlocks(sec, emp.id);
  const issues: string[] = [];
  for (const b of blocks)
    if (b.days < rules.minPeriodo) issues.push(`Férias de ${fmtDateBR(b.start)} a ${fmtDateBR(b.end)} com ${b.days} ${b.days === 1 ? "dia" : "dias"} (mínimo da loja: ${rules.minPeriodo}).`);
  const onVacation = blocks.find((b) => b.start <= today && b.end >= today) ?? null;
  const next = blocks.find((b) => b.start > today) ?? null;
  const base = {
    key: `${st.id}|${emp.id}`,
    store: st,
    sector: sec,
    emp,
    name: (emp.name || emp.func).trim(),
    shiftName: sec.shifts.find((s) => s.id === emp.shiftId)?.name.trim() ?? "",
    func: emp.func.trim(),
    blocks,
    onVacation,
    next,
  };
  const adm = emp.admissao;
  if (!adm) return { ...base, periods: [], current: null, saldo: 0, nextDeadline: null, status: "sem-admissao", daysToDeadline: null, issues, needsConfirm: false };

  // períodos aquisitivos de 12 meses desde a admissão, até cobrir hoje e as férias lançadas
  const row = sec.schedule[emp.id] ?? {};
  const lastDate = [today, ...blocks.map((b) => b.end)].sort().pop()!;
  const periods: Aquisitivo[] = [];
  for (let k = 0; k < 80; k++) {
    const start = addMonths(adm, 12 * k);
    if (start > lastDate && k > 0) break;
    const end = addDays(addMonths(adm, 12 * (k + 1)), -1);
    const paid = !!emp.vacPaidUntil && end <= emp.vacPaidUntil;
    const faltas = Object.keys(row).filter((d) => d >= start && d <= end && row[d].c === "A").length;
    const entitled = rules.descontoFaltas ? vacDaysAfterAbsences(rules.dias, faltas) : rules.dias;
    periods.push({ start, end, deadline: addDays(addMonths(adm, 12 * (k + 2)), -1), taken: 0, remaining: paid ? 0 : entitled, late: 0, paid, faltas, entitled, blocks: [] });
  }
  // cada dia de férias abate do período mais antigo em aberto (já adquirido naquele dia, se houver)
  let extra = 0;
  const open = periods.filter((p) => !p.paid);
  const paidEnd = emp.vacPaidUntil ?? "";
  for (const b of blocks) {
    let firstOf: Aquisitivo | null = null;
    for (let i = 0, d = b.start; i < b.days; i++, d = addDays(d, 1)) {
      // dias dentro do prazo de um período já quitado (e sem outro período adquirido em aberto) pertencem a ele
      if (paidEnd && d > paidEnd && d <= addMonths(paidEnd, 12) && !open.some((p) => p.end < d && p.remaining > 0)) continue;
      if (paidEnd && d <= paidEnd) continue;
      const p = open.find((x) => x.remaining > 0 && x.end < d) ?? open.find((x) => x.remaining > 0);
      if (!p) {
        extra++;
        continue;
      }
      p.remaining--;
      p.taken++;
      if (d > p.deadline) p.late++;
      firstOf ??= p;
    }
    firstOf?.blocks.push(b);
  }
  const done = open.filter((p) => p.end < today);
  const current = periods.find((p) => p.start <= today && p.end >= today) ?? null;
  const saldo = done.reduce((s, p) => s + p.remaining, 0);
  const pending = done.find((p) => p.remaining > 0) ?? null;
  const nextDeadline = pending?.deadline ?? null;
  const daysToDeadline = nextDeadline ? daysBetween(today, nextDeadline) : null;
  let status: VacStatus = "em-dia";
  if (done.some((p) => p.remaining > 0 && p.deadline < today)) status = "vencida";
  else if (daysToDeadline != null && daysToDeadline <= rules.avisoDias) status = "vence-breve";
  else if (!periods.some((p) => p.end < today)) status = "adquirindo";

  for (const p of open) {
    const lbl = `${fmtDateBR(p.start)} a ${fmtDateBR(p.end)}`;
    if (p.late) issues.push(`${p.late} ${p.late === 1 ? "dia" : "dias"} de férias do período ${lbl} ${p.late === 1 ? "fica" : "ficam"} depois do vencimento (${fmtDateBR(p.deadline)}).`);
    if (p.blocks.length > rules.maxPeriodos) issues.push(`Férias do período ${lbl} divididas em ${p.blocks.length} partes (máximo da loja: ${rules.maxPeriodos}).`);
    if (p.faltas > 5 && rules.descontoFaltas) issues.push(`Período ${lbl}: ${p.faltas} faltas sem atestado — direito a ${p.entitled} dias de férias em vez de ${rules.dias} (CLT art. 130).`);
    if (p.taken >= p.entitled && p.entitled > 0 && p.blocks.length && !p.blocks.some((b) => b.days >= rules.periodoLongo)) issues.push(`Férias do período ${lbl}: nenhuma parte tem ${rules.periodoLongo} dias ou mais.`);
    if (p.remaining > 0 && p.deadline < today) issues.push(`Período ${lbl}: ${p.remaining} ${p.remaining === 1 ? "dia vencido" : "dias vencidos"} desde ${fmtDateBR(p.deadline)}.`);
  }
  if (extra) issues.push(`${extra} ${extra === 1 ? "dia" : "dias"} de férias além do direito cadastrado.`);
  if (emp.vacPaidUntil && !emp.vacPaidConfirmed)
    issues.push(`Confirme se as férias até o período encerrado em ${fmtDateBR(emp.vacPaidUntil)} foram mesmo tiradas (o sistema considerou que sim ao informar a admissão).`);
  return { ...base, periods, current, saldo, nextDeadline, status, daysToDeadline, issues, needsConfirm: !!emp.vacPaidUntil && !emp.vacPaidConfirmed };
}

/** Ao informar a admissão: períodos que venceram antes de hoje são tratados como já quitados (o sistema não sabe o histórico). */
export function paidUntilFor(admissao: string, today: string): string | null {
  let out: string | null = null;
  for (let k = 0; k < 80; k++) {
    const end = addDays(addMonths(admissao, 12 * (k + 1)), -1);
    const deadline = addDays(addMonths(admissao, 12 * (k + 2)), -1);
    if (deadline < today) out = end;
    else break;
  }
  return out;
}

/** Lista de períodos aquisitivos para escolher até onde já está quitado. */
export function aquisitivoEnds(admissao: string, today: string): string[] {
  const out: string[] = [];
  for (let k = 0; k < 80; k++) {
    const end = addDays(addMonths(admissao, 12 * (k + 1)), -1);
    if (end >= today) break;
    out.push(end);
  }
  return out;
}

/** Grava férias (dias "V" fixados) de `start` por `days` dias corridos. */
export function setVacation(sec: Sector, empId: string, start: string, days: number): Sector {
  const row = { ...(sec.schedule[empId] ?? {}) };
  for (let i = 0; i < days; i++) row[addDays(start, i)] = { c: "V", lock: true };
  return { ...sec, schedule: { ...sec.schedule, [empId]: row } };
}
/** Remove um período de férias: os dias voltam para a escala normal (a gerar de novo). */
export function removeVacation(sec: Sector, empId: string, b: VacBlock): Sector {
  const row = { ...(sec.schedule[empId] ?? {}) };
  for (let i = 0, d = b.start; i < b.days; i++, d = addDays(d, 1)) if (row[d]?.c === "V") delete row[d];
  return { ...sec, schedule: { ...sec.schedule, [empId]: row } };
}

/** O que muda ao lançar: dias com outra marcação que serão trocados por férias. */
export function vacationConflicts(sec: Sector, empId: string, start: string, days: number) {
  const row = sec.schedule[empId] ?? {};
  const faltas: string[] = [];
  const atestados: string[] = [];
  const fixed: string[] = [];
  const already: string[] = [];
  for (let i = 0, d = start; i < days; i++, d = addDays(d, 1)) {
    const c = row[d];
    if (!c) continue;
    if (c.c === "V") already.push(d);
    else if (c.c === "A") faltas.push(d);
    else if (c.c === "M") atestados.push(d);
    else if (c.lock) fixed.push(d);
  }
  return { faltas, atestados, fixed, already };
}

/** Dias em que mais pessoas do mesmo setor estão de férias do que o limite da loja. */
export function overLimit(st: Store, sec: Sector, limit: number | null, extra?: { empId: string; start: string; days: number }): { start: string; end: string; n: number }[] {
  if (limit == null) return [];
  const count = new Map<string, number>();
  for (const e of st.employees) {
    if (e.sectorId !== sec.id || e.id === extra?.empId) continue;
    for (const b of vacBlocks(sec, e.id)) for (let i = 0, d = b.start; i < b.days; i++, d = addDays(d, 1)) count.set(d, (count.get(d) ?? 0) + 1);
  }
  if (extra) {
    for (const b of vacBlocks(sec, extra.empId)) for (let i = 0, d = b.start; i < b.days; i++, d = addDays(d, 1)) if (d < extra.start || d > addDays(extra.start, extra.days - 1)) count.set(d, (count.get(d) ?? 0) + 1);
    for (let i = 0, d = extra.start; i < extra.days; i++, d = addDays(d, 1)) count.set(d, (count.get(d) ?? 0) + 1);
  }
  const bad = Array.from(count.entries())
    .filter(([, n]) => n > limit)
    .sort(([a], [b]) => a.localeCompare(b));
  const out: { start: string; end: string; n: number }[] = [];
  for (const [d, n] of bad) {
    const last = out[out.length - 1];
    if (last && addDays(last.end, 1) === d) {
      last.end = d;
      last.n = Math.max(last.n, n);
    } else out.push({ start: d, end: d, n });
  }
  return out;
}

// ------------------------------------------------------------------ férias programadas (planejamento)
const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "2027-07" → "julho/2027" (curto: "jul/27") */
export function nomeMes(m: string, curto = false): string {
  const [y, mm] = m.split("-").map(Number);
  return curto ? `${NOMES_MES[mm - 1].slice(0, 3)}/${String(y).slice(2)}` : `${NOMES_MES[mm - 1]}/${y}`;
}
/** Mês ("AAAA-MM") de uma data, somando n meses. */
export function mesDe(iso: string, n = 0): string {
  return addMonths(`${iso.slice(0, 7)}-01`, n).slice(0, 7);
}

/** Período programado da pessoa (de/até), ou null. O formato antigo (só o mês) vira do dia 1 por `dias` dias. */
export function planoFerias(e: Employee, dias: number): { ini: string; fim: string; dias: number } | null {
  const ini = e.feriasDe ?? (e.feriasMes ? `${e.feriasMes}-01` : null);
  if (!ini) return null;
  const fim = e.feriasDe && e.feriasAte && e.feriasAte >= e.feriasDe ? e.feriasAte : addDays(ini, Math.max(1, dias) - 1);
  return { ini, fim, dias: daysBetween(ini, fim) + 1 };
}
/** As férias programadas já foram lançadas (há férias na escala que encostam no período)? */
export function planoLancado(blocks: VacBlock[], p: { ini: string; fim: string }): boolean {
  return blocks.some((b) => b.start <= p.fim && b.end >= p.ini);
}

/** Dias "ocupados" de cada pessoa do setor: férias lançadas + programadas ainda não lançadas. */
function ocupacao(st: Store, sec: Sector, dias: number): Map<string, number> {
  const n = new Map<string, number>();
  const soma = (a: string, b: string) => {
    for (let d = a; d <= b; d = addDays(d, 1)) n.set(d, (n.get(d) ?? 0) + 1);
  };
  for (const e of st.employees) {
    if (e.sectorId !== sec.id) continue;
    const blocks = vacBlocks(sec, e.id);
    for (const b of blocks) soma(b.start, b.end);
    const p = planoFerias(e, dias);
    if (p && !planoLancado(blocks, p)) soma(p.ini, p.fim);
  }
  return n;
}

/**
 * Escolha automática das férias de quem ainda não tem (nem período programado, nem férias lançadas nos próximos
 * 12 meses): espalha a equipe de cada setor pelos 12 meses a partir do mês que vem, começando no dia 1 do mês
 * (e no dia 16, quando o mês já está cheio) — primeiro onde cabe no máximo de pessoas do setor ao mesmo tempo,
 * depois onde há menos gente de férias, depois onde há menos gente da mesma função, depois o mais cedo.
 */
export function escolherMeses(st: Store, today: string, limite: number | null, sectorIds?: Set<string>, dias = DEFAULT_VAC.dias): { store: Store; escolhidos: number; acima: number } {
  const inicios = Array.from({ length: 12 }, (_, i) => mesDe(today, i + 1)).flatMap((m) => [`${m}-01`, `${m}-16`]);
  const limiteFim = addDays(`${mesDe(today, 13)}-01`, -1);
  const novos = new Map<string, { de: string; ate: string }>();
  let acima = 0;
  for (const sec of st.sectors) {
    if (sectorIds && !sectorIds.has(sec.id)) continue;
    const equipe = st.employees.filter((e) => e.sectorId === sec.id);
    const occ = ocupacao(st, sec, dias);
    const fn = new Map<string, Map<string, number>>(); // função → dia → quantos
    const marca = (func: string, a: string, b: string) => {
      const m = fn.get(func) ?? fn.set(func, new Map()).get(func)!;
      for (let d = a; d <= b; d = addDays(d, 1)) m.set(d, (m.get(d) ?? 0) + 1);
    };
    for (const e of equipe) {
      for (const b of vacBlocks(sec, e.id)) marca(e.func.trim(), b.start, b.end);
      const p = planoFerias(e, dias);
      if (p && !planoLancado(vacBlocks(sec, e.id), p)) marca(e.func.trim(), p.ini, p.fim);
    }
    for (const e of equipe) {
      if (planoFerias(e, dias)) continue;
      if (vacBlocks(sec, e.id).some((b) => b.end >= today && b.start <= limiteFim)) continue;
      let melhor = inicios[0];
      let custo = Infinity;
      let passou = false;
      inicios.forEach((ini, i) => {
        const fim = addDays(ini, dias - 1);
        let pico = 0;
        let soma = 0;
        let mesmaFn = 0;
        const f = fn.get(e.func.trim());
        for (let d = ini; d <= fim; d = addDays(d, 1)) {
          const c = occ.get(d) ?? 0;
          pico = Math.max(pico, c);
          soma += c;
          mesmaFn += f?.get(d) ?? 0;
        }
        const passa = limite != null && pico + 1 > limite;
        // começar no dia 16 só quando ajuda (custo extra pequeno)
        const k = (passa ? 1e9 : 0) + pico * 1e6 + soma * 100 + mesmaFn * 10 + i * 0.01 + (ini.endsWith("-16") ? 50 : 0);
        if (k < custo) (custo = k), (melhor = ini), (passou = passa);
      });
      if (passou) acima++;
      const ate = addDays(melhor, dias - 1);
      for (let d = melhor; d <= ate; d = addDays(d, 1)) occ.set(d, (occ.get(d) ?? 0) + 1);
      marca(e.func.trim(), melhor, ate);
      novos.set(e.id, { de: melhor, ate });
    }
  }
  return {
    store: { ...st, employees: st.employees.map((e) => (novos.has(e.id) ? { ...e, feriasDe: novos.get(e.id)!.de, feriasAte: novos.get(e.id)!.ate, feriasMes: null } : e)) },
    escolhidos: novos.size,
    acima,
  };
}

/** Dias em que o setor passa do limite contando também as férias programadas (ainda não lançadas). */
export function programadasAcimaDoLimite(st: Store, sec: Sector, limite: number | null, dias: number): { start: string; end: string; n: number }[] {
  if (limite == null) return [];
  const temPlano = st.employees.some((e) => e.sectorId === sec.id && planoFerias(e, dias) && !planoLancado(vacBlocks(sec, e.id), planoFerias(e, dias)!));
  if (!temPlano) return [];
  const bad = Array.from(ocupacao(st, sec, dias).entries())
    .filter(([, n]) => n > limite)
    .sort(([a], [b]) => a.localeCompare(b));
  const out: { start: string; end: string; n: number }[] = [];
  for (const [d, n] of bad) {
    const last = out[out.length - 1];
    if (last && addDays(last.end, 1) === d) {
      last.end = d;
      last.n = Math.max(last.n, n);
    } else out.push({ start: d, end: d, n });
  }
  return out;
}
