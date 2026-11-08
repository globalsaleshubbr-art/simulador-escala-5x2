// Motor de geração e redistribuição de folgas 5x2.
// Restrições obrigatórias (hard) e critérios de preferência (soft) tratados separadamente.
// O mesmo "SolveProblem" é enviado ao serviço Python (OR-Tools CP-SAT) quando disponível;
// este arquivo implementa o motor local (heurística gulosa + busca local) e o validador comum.

import type { CalDay, Cell, Code, Sector, Store, TurnoChave } from "./types";
import { configDoSetor } from "./regrasSetor";
import { buildDays, cellCode, contributionSlots, dayShift, dayWorkMin, employeeShift, folgaFixaDomingo, folgasDe, folgasFixas, isPlantao, plantaoTrabalha, requirementAt, sectorEmployees, slotAxis } from "./model";
import { daySlotStates, relevantEmployees, countsFor } from "./coverage";
import { custoRegras, paresFds, parFds, penalidadeRegras, podeFolgarRegras, regrasDoProblema, vizinhasF, violacoesRegras, type RegrasProblema } from "./regras";
import { WEEKDAY_LONG, WEEKDAY_SHORT, addDays, fmtDateBR, fmtDur, fmtTime, sundayIndex, weekdayOf } from "./time";

export interface ProblemDay {
  date: string;
  weekday: number;
  week: number;
  closed: boolean;
  special: boolean;
  intensity: number;
  maxOff: number | null;
  /** máximo de folgas de cada turno no dia (índice em SolveProblem.turnos); null = sem limite (regra 3b) */
  maxOffTurno?: (number | null)[];
  minStaff: number | null;
  req: number[];
  ideal: number[];
}

export interface ProblemEmp {
  id: string;
  name: string;
  fixed: (Code | null)[];
  contrib: number[][];
  workMin: number[]; // minutos de trabalho se trabalhar no dia
  fixedOffWeekday: number | null;
  /** todos os dias de folga fixa (até dois) */
  fixedOffWeekdays?: number[];
  prefWeekday: number | null;
  /** "window": domingo de folga escolhido pelo motor — ao menos 1 folga a cada N domingos */
  sundayWindow: number | null;
  /** 12x36: dias todos definidos pelo revezamento; não segue as regras de folgas por semana do 5x2 */
  plantao?: boolean;
  /** folgas por semana desta pessoa (jornada cadastrada); ausente = as da loja */
  folgas?: number;
  /** turno habitual da pessoa (índice em SolveProblem.turnos); -1 = não entra no equilíbrio (12x36) */
  turno?: number;
  /** descanso (min) entre o dia d-1 e o dia d se a pessoa trabalhar nos dois; só onde fica abaixo do mínimo (senão null) */
  descansoCurto?: (number | null)[];
  /** sábados de folga no período anterior (mesmo tamanho), para o rodízio continuar de onde parou */
  sabAntes?: number;
}

export interface SolveProblem {
  sectorId: string;
  slot: number;
  axis: number[];
  days: ProblemDay[];
  external: number[][];
  employees: ProblemEmp[];
  folgas: number;
  maxConsec: number;
  weeks: number;
  weeklyMaxMin: number;
  /** feriado com a loja fechada conta como uma das folgas da semana */
  feriadoFolga?: boolean;
  /** ajustes automáticos feitos ao montar o problema (para avisar o usuário) */
  avisos?: string[];
  /** regras avançadas extras já traduzidas para o problema */
  regras?: RegrasProblema;
  /** quantas pessoas há em cada turno (para espalhar as folgas de cada turno pelos dias) */
  turnos?: number[];
  /** nome de cada turno (Abertura, Intermediário, Fechamento) */
  turnoNomes?: string[];
  /** Regras avançadas, regra 3: folgas por igual entre os dias da semana (ausente = ligada) */
  diasIguais?: boolean;
  /** descanso mínimo entre jornadas respeitado ao gerar (Regras avançadas, item 14); ausente = não verifica */
  minRestMin?: number;
}

/** A pessoa pode folgar em algum dos sábados: o sábado não está fixado e a semana dele tem folga que não é fixa. */
function sabadoLivre(p: SolveProblem, ei: number, sabs: number[]): boolean {
  const e = p.employees[ei];
  return sabs.some((s) => {
    if (e.fixed[s] !== null) return false;
    const w = p.days[s].week;
    const fixas = e.fixed.slice(w * 7, w * 7 + 7).filter((c) => c === "F").length;
    return requiredFolgas(p, e.fixed, w, e.folgas) > fixas;
  });
}

/** Sábados do período anterior de cada pessoa, a partir do menor entre os elegíveis (quem folgou menos começa do 0). */
function basesSabado(p: SolveProblem, eleg: number[]): number[] {
  const b = p.employees.map((e) => e.sabAntes ?? 0);
  const mn = eleg.length ? Math.min(...eleg.map((ei) => b[ei])) : 0;
  return b.map((x) => x - mn);
}

/** Quem entra no rodízio dos sábados e quantos sábados de folga cada um soma com o período anterior (a partir do menor). */
export function filaSabados(p: SolveProblem, rows: (Code | null)[][]): { eleg: number[]; tot: number[] } {
  const sabs = p.days.map((d, i) => i).filter((i) => p.days[i].weekday === 6 && !p.days[i].closed);
  const eleg = p.employees.map((e, ei) => ei).filter((ei) => !p.employees[ei].plantao && sabadoLivre(p, ei, sabs));
  const base = basesSabado(p, eleg);
  return { eleg, tot: eleg.map((ei) => base[ei] + sabs.filter((s) => rows[ei][s] === "F").length) };
}

/** Rodízio dos sábados (com o período anterior): sábados de folga além de 1 acima do menor da equipe. */
function penalidadeSabados(p: SolveProblem, rows: (Code | null)[][]): number {
  const { tot } = filaSabados(p, rows);
  if (tot.length < 2) return 0;
  const mn = Math.min(...tot);
  return SAB_FILA * tot.reduce((a, t) => a + Math.max(0, t - mn - 1), 0);
}

/** Pares de dias seguidos trabalhados com descanso abaixo do mínimo (null conta como trabalho). */
export function descansosCurtos(p: Pick<SolveProblem, "employees">, ei: number, row: (Code | null)[]): number {
  const dc = p.employees[ei].descansoCurto;
  if (!dc) return 0;
  let n = 0;
  for (let d = 1; d < row.length; d++) if (dc[d] != null && (isWork(row[d - 1]) || row[d - 1] === null) && (isWork(row[d]) || row[d] === null)) n++;
  return n;
}

/** Peso do equilíbrio de folgas dentro de cada turno (custo por pessoa do mesmo turno já de folga no dia, ÷ tamanho do turno). */
const BAL_TURNO = 12;
/** Teto "justo" de folgas de um turno num dia (cerca de 1/3 do turno, arredondado para cima): acima dele custa caro. */
export const tetoTurno = (tam: number) => Math.max(1, Math.ceil((tam * 2) / 6 + 0.5));
const ACIMA_TETO = 60;
/** Custo de cada pessoa de folga acima da parte proporcional do turno no dia (folgas divididas entre os turnos
 *  na proporção do tamanho de cada um: abertura, intermediário, fechamento…). */
const PROP_TURNO = 40;
/**
 * Pessoas de folga acima da parte proporcional de cada turno num dia. Com K folgas no dia e N pessoas nos turnos,
 * a parte do turno g é K × tamanho(g) ÷ N, arredondada para cima.
 */
export function excessoTurnos(tam: number[], k: number[]): number {
  let K = 0;
  let N = 0;
  for (let g = 0; g < tam.length; g++) (K += k[g]), (N += tam[g]);
  if (!K || !N || tam.length < 2) return 0;
  let e = 0;
  for (let g = 0; g < tam.length; g++) e += Math.max(0, k[g] - Math.ceil((K * tam[g]) / N - 1e-9));
  return e;
}
/** Folgas de cada turno no dia d. */
export function folgasPorTurno(p: SolveProblem, rows: (Code | null)[][], d: number): number[] {
  const n = (p.turnos ?? []).map(() => 0);
  rows.forEach((row, ei) => {
    const g = p.employees[ei].turno ?? -1;
    if (g >= 0 && row[d] === "F") n[g]++;
  });
  return n;
}
/** Penalidade de concentrar folgas do mesmo turno no mesmo dia (soma de n·(n−1)/2 ÷ tamanho do turno + excesso sobre o teto
 *  + pessoas acima da parte proporcional do turno). */
function penalidadeTurnos(p: SolveProblem, rows: (Code | null)[][]): number {
  if (!p.turnos?.length) return 0;
  let s = 0;
  for (let d = 0; d < p.days.length; d++) {
    if (p.days[d].closed) continue;
    const n = folgasPorTurno(p, rows, d);
    n.forEach((k, g) => (s += (BAL_TURNO * k * (k - 1)) / 2 / Math.max(1, p.turnos![g]) + ACIMA_TETO * Math.max(0, k - tetoTurno(p.turnos![g]))));
    s += PROP_TURNO * excessoTurnos(p.turnos, n);
  }
  return s;
}
/** Custo de cada folga fora da faixa justa do dia (equilíbrio entre os dias da semana): vem antes da cobertura. */
const EQ_DIA = 2000;
/** custo por sábado de folga acima do menor da equipe (rodízio dos sábados) */
const SAB_FILA = 1500;
/** Dias que entram no equilíbrio entre os dias: abertos, fora domingo e feriado (que seguem o rodízio de domingos). */
const diaDeEquilibrio = (p: SolveProblem, d: number) => p.diasIguais !== false && !p.days[d].closed && !p.days[d].special;
/** Folgas de cada dia, sem plantão 12x36 (que segue o revezamento dele). */
function folgasPorDia(p: SolveProblem, rows: (Code | null)[][]): number[] {
  return p.days.map((_, d) => rows.reduce((n, row, ei) => n + (row[d] === "F" && !p.employees[ei].plantao ? 1 : 0), 0));
}
/**
 * Faixa justa de folgas de cada dia de segunda a sábado: as folgas da semana (K) divididas por igual entre os dias,
 * respeitando o que cada dia comporta (limite de folgas do dia e quem pode folgar nele). Com nível L (o menor que
 * comporta K), cada dia fica entre min(cabe, L−1) e min(cabe, L): dois dias nunca diferem em mais de 1 folga,
 * a não ser que um deles já esteja no limite. `K` por semana; ausente = as folgas que estão em `off`.
 */
export function faixaDias(p: SolveProblem, off: number[], K?: number[]): { piso: number[]; teto: number[] } {
  const piso = p.days.map(() => 0);
  const teto = p.days.map(() => Infinity);
  for (let w = 0; w * 7 < p.days.length; w++) {
    const dias = p.days.map((_, d) => d).filter((d) => p.days[d].week === w && diaDeEquilibrio(p, d));
    if (dias.length < 2) continue;
    const cabe = dias.map((d) => {
      const proibido = p.regras?.semFolgaDia[d] === 2;
      const podem = p.employees.filter((e) => !e.plantao && (e.fixed[d] === "F" || (!proibido && e.fixed[d] === null))).length;
      return Math.min(podem, p.days[d].maxOff ?? Infinity);
    });
    const k = K?.[w] ?? dias.reduce((a, d) => a + off[d], 0);
    let L = 0;
    while (L < 1000 && cabe.reduce((a, c) => a + Math.min(c, L), 0) < k) L++;
    dias.forEach((d, i) => {
      teto[d] = Math.min(cabe[i], L);
      piso[d] = Math.min(cabe[i], Math.max(0, L - 1));
    });
  }
  return { piso, teto };
}
/** Custo das folgas do dia d fora da faixa justa. */
const custoFaixa = (n: number, f: ReturnType<typeof faixaDias>, d: number) => EQ_DIA * (Math.max(0, n - f.teto[d]) + Math.max(0, f.piso[d] - n));
function penalidadeDias(p: SolveProblem, rows: (Code | null)[][]): number {
  const off = folgasPorDia(p, rows);
  const f = faixaDias(p, off);
  return off.reduce((s, n, d) => s + (diaDeEquilibrio(p, d) ? custoFaixa(n, f, d) : 0), 0);
}

/** Quanto a folga de uma pessoa do turno g muda o excesso proporcional do dia (delta = +1 ao dar a folga, −1 ao tirar). */
function deltaExcesso(tam: number[], k: number[], g: number, delta: 1 | -1): number {
  const antes = excessoTurnos(tam, k);
  k[g] += delta;
  const depois = excessoTurnos(tam, k);
  k[g] -= delta;
  return depois - antes;
}

/** Máximo de folgas do turno g no dia d (regra 3b); null = sem limite. */
function limTurno(p: SolveProblem, d: number, g: number): number | null {
  return g < 0 ? null : (p.days[d].maxOffTurno?.[g] ?? null);
}
/** Mais uma folga da pessoa no dia d cabe no máximo do turno dela; `k` = folgas de cada turno no dia sem contar a pessoa. */
function cabeLimTurno(p: SolveProblem, ei: number, d: number, k: number[]): boolean {
  const g = p.employees[ei].turno ?? -1;
  const lim = limTurno(p, d, g);
  return lim == null || k[g] + 1 <= lim;
}

/**
 * Na versão simplificada o limite de pessoas de folga por dia não aparece para o usuário (vem dos dados iniciais),
 * então o sistema o aumenta sozinho quando a equipe cresce. Na versão completa, onde o limite é editável, ele é respeitado.
 */
let ajusteAutomaticoFolgas = false;
export function usarAjusteAutomaticoDeFolgas(v: boolean) {
  ajusteAutomaticoFolgas = v;
}

/** Dia em que ninguém folga (Personalizar → Feriados): data exata ou dia/mês de todo ano. */
export function ehDiaSemFolga(cfg: Pick<Store["config"], "diasSemFolga">, iso: string): boolean {
  const l = cfg.diasSemFolga ?? [];
  return l.includes(iso) || l.includes(iso.slice(5));
}

export interface Violation {
  kind: "folgas" | "maxOff" | "minStaff" | "consec" | "sunday" | "weeklyHours" | "fixed" | "regra" | "descanso";
  empId?: string;
  dayIdx?: number;
  week?: number;
  message: string;
}

export interface SolveResult {
  ok: boolean;
  engine: string;
  rows: Code[][];
  violations: Violation[];
  explanations: string[];
  /** faixas impossíveis de cobrir mesmo com todos trabalhando (teto dos turnos) */
  ceilingIssues: string[];
  objective: number;
  deficitSlots: number;
  ms: number;
  /** descansos abaixo do mínimo que não deu para evitar (não impedem a escala; aparecem como aviso) */
  descansoAvisos?: string[];
}

/** Peso de cada descanso curto que sobrou: a escala com menos descansos curtos ganha. */
const PESO_DESCANSO = 400;
/** Violações que impedem aplicar a escala (o descanso curto que não dá para evitar vira só aviso). */
export const impede = (v: Violation) => v.kind !== "descanso";

const INT_W = [0, 1, 2, 3.2];
/** peso do equilíbrio de folgas entre os dias (custo extra por pessoa já de folga no mesmo dia) */
const BAL = 1;
/** custo de uma folga colada em outra quando nenhuma regra fala disso (folgas separadas desligada e "preferir juntas" desligada):
 *  pequeno, só para desempatar — a cobertura mínima continua mandando */
const SEP = 12;
/** a preferência padrão por folgas separadas vale para esta pessoa? */
function sepPadrao(p: SolveProblem, ei: number) {
  if (p.employees[ei].plantao) return false;
  const R = p.regras;
  // quem tem parceiro de folga (regra "preferem folgar juntas") acompanha o parceiro
  return !R || (!R.juntas && !R.semPref && R.separadas === 0 && !R.parSim[ei]?.length && !R.extSim[ei]?.length);
}

/** Monta o problema a partir da loja/setor. keepLocks: células bloqueadas são mantidas. */
/** Sábados de folga gravados nas semanas antes do período (tantas quanto o período tem). */
function sabadosAntes(sector: Sector, empId: string, days: CalDay[]): number {
  if (!days.length) return 0;
  let n = 0;
  for (let i = 1; i <= days.length; i++) {
    const dt = addDays(days[0].date, -i);
    if (weekdayOf(dt) === 6 && sector.schedule[empId]?.[dt]?.c === "F") n++;
  }
  return n;
}

/**
 * Turnos do setor pelo horário de cada pessoa (para dividir as folgas entre quem abre, o intermediário e quem fecha):
 * entra até 1h depois da primeira entrada = abertura; senão, sai até 1h antes da última saída = fechamento.
 */
export function turnosDoSetor(store: Store, sector: Sector): { chaves: TurnoChave[]; nomes: string[]; tamanhos: number[]; horarios: string[][]; de: Map<string, number> } {
  const emps = sectorEmployees(store, sector.id);
  const horario = new Map(emps.filter((e) => !isPlantao(e)).map((e) => [e.id, employeeShift(store, sector, e, false)]));
  const hs = [...horario.values()].filter((r) => r.shift);
  const ini0 = Math.min(...hs.map((r) => r.start));
  const fim0 = Math.max(...hs.map((r) => r.end));
  const grupoDe = (id: string) => {
    const r = horario.get(id);
    if (!r?.shift) return -1;
    return r.start <= ini0 + 60 ? 0 : r.end >= fim0 - 60 ? 2 : 1;
  };
  const CHAVES: TurnoChave[] = ["abertura", "intermediario", "fechamento"];
  const NOMES = ["Abertura", "Intermediário", "Fechamento"];
  const grupos = [0, 1, 2].filter((g) => emps.some((e) => grupoDe(e.id) === g));
  const de = new Map(emps.filter((e) => grupoDe(e.id) >= 0).map((e) => [e.id, grupos.indexOf(grupoDe(e.id))]));
  return {
    chaves: grupos.map((g) => CHAVES[g]),
    nomes: grupos.map((g) => NOMES[g]),
    tamanhos: grupos.map((_, g) => [...de.values()].filter((x) => x === g).length),
    // nomes dos horários cadastrados (Horários) de quem está em cada turno
    horarios: grupos.map((_, g) => [...new Set([...de].filter(([, x]) => x === g).map(([id]) => horario.get(id)?.shift?.name).filter((n): n is string => !!n))]),
    de,
  };
}

export function buildProblem(store: Store, sectorId: string, opts: { keepLocks: boolean; days?: CalDay[]; ajustarLimiteFolgas?: boolean } = { keepLocks: true }): SolveProblem {
  const sector = store.sectors.find((s) => s.id === sectorId)!;
  // regras avançadas próprias do setor (se houver) valem por cima das da loja
  const cfg = configDoSetor(store.config, sector);
  const days = opts.days ?? buildDays(cfg);
  const axis = slotAxis(cfg, days);
  const emps = sectorEmployees(store, sectorId);

  // semanas com dia sem folga: as folgas vão para os outros dias, então o limite de folgas por dia sobe na mesma proporção
  const semFolgaPorSemana = new Map<number, number>();
  for (const d of days) if (!d.closed && ehDiaSemFolga(cfg, d.date)) semFolgaPorSemana.set(d.week, (semFolgaPorSemana.get(d.week) ?? 0) + 1);
  const abertosPorSemana = new Map<number, number>();
  for (const d of days) if (!d.closed) abertosPorSemana.set(d.week, (abertosPorSemana.get(d.week) ?? 0) + 1);
  const pdays: ProblemDay[] = days.map((d) => {
    const mvBase = sector.movement[d.special ? 0 : d.weekday] ?? { intensity: 2, maxOff: null, minStaff: null };
    // limite escolhido pelo usuário (Regras avançadas): em pessoas ou em % da equipe
    const lf = sector.limiteFolga;
    const lfv = lf ? lf.valores[d.special ? 0 : d.weekday] : undefined;
    const mv0 = lf ? { ...mvBase, maxOff: lfv == null ? null : lf.modo === "pct" ? Math.max(0, Math.floor((emps.length * lfv) / 100)) : lfv } : mvBase;
    const k = semFolgaPorSemana.get(d.week) ?? 0;
    const abertos = abertosPorSemana.get(d.week) ?? 7;
    const mv = k && mv0.maxOff != null && abertos > k ? { ...mv0, maxOff: Math.ceil((mv0.maxOff * abertos) / (abertos - k)) } : mv0;
    const req = axis.map((t) => (d.closed ? 0 : requirementAt(sector, d, t).min));
    const ideal = axis.map((t) => (d.closed ? 0 : requirementAt(sector, d, t).ideal));
    return {
      date: d.date,
      weekday: d.weekday,
      week: d.week,
      closed: d.closed,
      special: d.special,
      intensity: mv.intensity,
      maxOff: mv.maxOff,
      minStaff: mv.minStaff,
      req,
      ideal,
    };
  });

  // cobertura externa (pessoas de outros setores remanejadas para cá) — fixa
  const external = days.map(() => axis.map(() => 0));
  const outsiders = relevantEmployees(store, sectorId).filter((e) => e.sectorId !== sectorId);
  for (const e of outsiders) {
    days.forEach((d, di) => {
      if (d.closed) return;
      const st = daySlotStates(store, e, d, axis);
      st.forEach((s, i) => {
        if (countsFor(s, e, sectorId)) external[di][i]++;
      });
    });
  }

  const { de: turnoIdx, tamanhos: turnos, nomes: turnoNomes, chaves: turnoChaves } = turnosDoSetor(store, sector);
  // regra 3b: máximo de folgas de cada turno em cada dia da semana
  const ltf = sector.limiteFolgaTurno;
  if (ltf)
    pdays.forEach((d, i) => {
      if (d.closed) return;
      const v = turnoChaves.map((c) => ltf[c]?.[d.special ? 0 : d.weekday] ?? null);
      if (v.some((x) => x != null)) pdays[i] = { ...d, maxOffTurno: v };
    });
  // folgas fixas do cadastro (até duas), nunca mais do que as folgas da semana da pessoa
  const fixas = (e: (typeof emps)[number]) => (isPlantao(e) ? [] : folgasFixas(e).slice(0, Math.max(1, folgasDe(store, e))));
  // descanso entre jornadas (Regras avançadas, item 14 — opcional): para cada dia, quanto a pessoa descansaria
  // se trabalhasse nele e no anterior, com o turno de cada dia (o da semana, o de domingo/feriado ou o escolhido no dia)
  const minRest = cfg.regras?.descansoObrigatorio ?? 0;
  const descansoDaPessoa = (e: (typeof emps)[number]): (number | null)[] | undefined => {
    if (!minRest || isPlantao(e)) return undefined;
    const hs = days.map((d) => (d.closed ? null : dayShift(store, sector, e, d)));
    let algum = false;
    const out = days.map((_, d) => {
      const a = hs[d - 1];
      const b = hs[d];
      if (!a || !b || !a.shift || !b.shift) return null;
      const rest = b.start + 1440 - a.end;
      if (rest >= minRest) return null;
      algum = true;
      return rest;
    });
    return algum ? out : undefined;
  };
  // sábado que não pode ter folga (dia da semana sem folga nas Regras avançadas, ou trabalho fixado à mão)
  const sfr = cfg.regras?.diasSemFolgaSemana;
  const sabadoSemFolga = !!sfr && sfr.forca === "proibir" && sfr.dias.includes(6) && (!sfr.setores?.length || sfr.setores.includes(sectorId));
  const domingosTrocados = new Map<string, number>();
  const domingoSemDescanso = (e: (typeof emps)[number], d: CalDay) => {
    if (!minRest) return false;
    const i = days.findIndex((x) => x.date === d.date);
    const sab = days[i - 1];
    if (!sab || sab.closed || sab.weekday !== 6) return false;
    const cel = sector.schedule[e.id]?.[sab.date];
    const sabTrava = sabadoSemFolga || (!!cel?.lock && (cel.c === "T" || cel.c === "D"));
    if (!sabTrava) return false;
    const a = dayShift(store, sector, e, sab);
    const b = dayShift(store, sector, e, d);
    return !!a.shift && !!b.shift && b.start + 1440 - a.end < minRest;
  };
  const employees: ProblemEmp[] = emps.map((e) => {
    const row = sector.schedule[e.id] ?? {};
    const fixed: (Code | null)[] = days.map((d) => {
      const cell = row[d.date];
      if (cell && (cell.c === "A" || cell.c === "M" || cell.c === "V")) return cell.c;
      if (cell && opts.keepLocks && cell.lock) return cell.c === "T" && d.special ? "D" : cell.c === "D" && !d.special ? "T" : cell.c;
      if (d.closed) return d.holiday && !d.holiday.open ? "H" : "F";
      // 12x36: dia sim, dia não, em qualquer dia da semana (domingo e feriado seguem o revezamento)
      if (isPlantao(e)) return plantaoTrabalha(e, d.date) ? (d.special ? "D" : "T") : "F";
      // dia sem folga (ex.: 24/12 e 31/12): todos trabalham, menos quem não trabalha aos domingos
      if (ehDiaSemFolga(cfg, d.date) && !(d.weekday === 0 && (e.sundayCycle === 0 || folgaFixaDomingo(e)))) return d.special ? "D" : "T";
      // folga fixa do cadastro (inclusive no domingo): travada, vale antes do rodízio de domingos
      if (fixas(e).includes(d.weekday)) return "F";
      if (d.weekday === 0 && d.special) {
        if (e.sundayCycle === 0) return "F";
        if (e.sundayOffset > 0) {
          const N = Math.max(1, e.sundayCycle);
          const k = (e.sundayOffset - 1) % N;
          const idx = sundayIndex(d.date);
          if ((((idx - k) % N) + N) % N === 0) return "F";
          // descanso entre jornadas: fecha no sábado (que não pode ter folga) e o domingo abriria cedo → folga no domingo
          if (domingoSemDescanso(e, d)) {
            domingosTrocados.set(e.name || e.func, (domingosTrocados.get(e.name || e.func) ?? 0) + 1);
            return "F";
          }
          return "D";
        }
      }
      return null;
    });
    return {
      id: e.id,
      name: e.name || e.func,
      fixed,
      contrib: days.map((d) => (d.closed ? [] : contributionSlots(store, e, d, axis, sectorId))),
      workMin: days.map((d) => dayWorkMin(store, e, d, d.special ? "D" : "T")),
      fixedOffWeekday: isPlantao(e) ? null : e.fixedOff,
      fixedOffWeekdays: fixas(e),
      plantao: isPlantao(e),
      folgas: folgasDe(store, e),
      turno: turnoIdx.get(e.id) ?? -1,
      prefWeekday: e.variableOff,
      sundayWindow: cfg.sundayOpen && !isPlantao(e) && e.sundayCycle > 0 && e.sundayOffset === 0 && !folgaFixaDomingo(e) ? e.sundayCycle : null,
      descansoCurto: descansoDaPessoa(e),
      sabAntes: sabadosAntes(sector, e.id, days),
    };
  });

  // o limite de folgas por dia foi pensado para uma equipe menor? se as folgas da semana não cabem,
  // sobe o limite na mesma proporção (senão a escala fica impossível, com avisos que não explicam o motivo)
  const avisos: string[] = [];
  // duplas com pessoas de outros setores: a escala atual delas entra como pronta
  const regras = regrasDoProblema(cfg, sector, emps, days, {
    employees: store.employees,
    setorNome: (id) => store.sectors.find((x) => x.id === id)?.name ?? "",
    folga: (empId, d) => {
      const o = store.employees.find((e) => e.id === empId);
      const sec = o && store.sectors.find((x) => x.id === o.sectorId);
      return !!sec && !days[d].closed && cellCode(sec, empId, days[d]) === "F";
    },
  });
  const probe = { folgas: cfg.folgasPorSemana, feriadoFolga: cfg.feriadoContaFolga !== false } as SolveProblem;
  const subiu = new Map<number, { de: number; para: number }>();
  // (limite escolhido pelo usuário em Regras avançadas é respeitado: não sobe sozinho)
  for (let w = 0; (opts.ajustarLimiteFolgas ?? ajusteAutomaticoFolgas) && !sector.limiteFolga && w * 7 < pdays.length; w++) {
    // dias em que a folga variável é proibida (Regras avançadas) não recebem folgas: ficam fora da conta
    const idx = pdays.map((_, i) => i).filter((i) => pdays[i].week === w && !pdays[i].closed && regras?.semFolgaDia[i] !== 2);
    const lim = idx.filter((i) => pdays[i].maxOff != null);
    if (!lim.length) continue;
    // domingo e feriado não contam como dia livre para as folgas da semana: a folga deles segue o rodízio de domingos
    // (nem todos podem folgar no mesmo domingo), então as folgas da semana precisam caber nos dias com limite
    const livres = idx.filter((i) => pdays[i].maxOff == null && !pdays[i].special);
    const cap = lim.reduce((a, i) => a + (pdays[i].maxOff as number), 0);
    let precisaNosLimitados = 0;
    for (const e of employees) {
      if (e.plantao) continue;
      const req = requiredFolgas(probe, e.fixed, w, e.folgas);
      const fixasLim = lim.filter((i) => e.fixed[i] === "F").length;
      const fixasTotal = idx.filter((i) => e.fixed[i] === "F").length;
      const variaveis = Math.max(0, req - fixasTotal);
      const podemIrLivres = Math.min(variaveis, livres.filter((i) => e.fixed[i] === null).length);
      precisaNosLimitados += fixasLim + (variaveis - podemIrLivres);
    }
    if (precisaNosLimitados > cap) {
      const f = precisaNosLimitados / cap;
      for (const i of lim) {
        const de = pdays[i].maxOff as number;
        const para = Math.ceil(de * f) + 1;
        pdays[i] = { ...pdays[i], maxOff: para };
        const wd = pdays[i].weekday;
        if (!subiu.has(wd) || subiu.get(wd)!.para < para) subiu.set(wd, { de, para });
      }
    }
  }
  if (domingosTrocados.size) {
    const nomes = [...domingosTrocados.keys()];
    avisos.push(
      `Descanso mínimo de ${fmtDur(minRest)} entre jornadas: ${nomes.slice(0, 4).join(", ")}${nomes.length > 4 ? ` e mais ${nomes.length - 4}` : ""} ${nomes.length === 1 ? "fecha" : "fecham"} no sábado (que não pode ter folga) e o turno de domingo abre cedo, então ${nomes.length === 1 ? "folga" : "folgam"} nesses domingos em vez de seguir o time. Para manter o time, crie em Horários um turno de domingo que comece mais tarde.`,
    );
  }
  if (subiu.size) {
    const NOMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
    const ex = Array.from(subiu.entries()).slice(0, 3).map(([wd, v]) => `${NOMES[wd]} ${v.de} → ${v.para}`).join(", ");
    const semDia = regras?.semFolgaDia.some((x) => x === 2);
    avisos.push(`Com ${employees.length} pessoas${semDia ? " e dia da semana sem folga" : ""}, o limite automático de pessoas de folga por dia não cabia todas as folgas da semana (a folga de domingo segue o rodízio): o sistema aumentou o limite na mesma proporção (${ex}).`);
  }

  // "segunda com domingo": a segunda comporta pelo menos as pessoas que a regra deixa folgar domingo e segunda
  if (regras?.domSeg != null)
    pdays.forEach((d, i) => {
      if (d.weekday === 1 && d.maxOff != null && pdays[i - 1]?.weekday === 0) pdays[i] = { ...d, maxOff: Math.max(d.maxOff, regras.domSeg as number) };
    });
  // regras avançadas: emenda de feriado proibida vira limite de folgas no dia antes/depois
  if (regras && regras.emendaForca === 2)
    regras.emendaMax.forEach((m, i) => {
      if (m != null) pdays[i] = { ...pdays[i], maxOff: pdays[i].maxOff == null ? m : Math.min(pdays[i].maxOff as number, m) };
    });

  return {
    avisos,
    regras,
    turnos,
    turnoNomes,
    diasIguais: cfg.regras?.folgasDiasIguais !== false,
    sectorId,
    slot: cfg.slot,
    axis,
    days: pdays,
    minRestMin: minRest || undefined,
    external,
    employees,
    folgas: cfg.folgasPorSemana,
    maxConsec: cfg.maxConsecutive,
    weeks: cfg.weeks,
    weeklyMaxMin: cfg.weeklyMaxMin,
    feriadoFolga: cfg.feriadoContaFolga !== false,
  };
}

const isOffCode = (c: Code | null) => c === "F" || c === "A" || c === "M" || c === "V" || c === "H";
const isWork = (c: Code | null) => c === "T" || c === "D";

export function requiredFolgas(p: SolveProblem, fixedRow: (Code | null)[], w: number, folgas = p.folgas): number {
  // semana toda definida (12x36, ou tudo fixado à mão): as folgas são as que já estão lá
  const wk = fixedRow.slice(w * 7, w * 7 + 7);
  if (wk.length === 7 && wk.every((c) => c !== null)) return wk.filter((c) => c === "F").length;
  let unavailable = 0;
  let feriados = 0;
  for (let d = w * 7; d < w * 7 + 7; d++) {
    const c = fixedRow[d];
    if (c === "A" || c === "M" || c === "V" || c === "H") unavailable++;
    if (c === "H") feriados++;
  }
  // feriado com a loja fechada vale como uma das folgas da semana
  const f = p.feriadoFolga ? Math.max(0, folgas - feriados) : folgas;
  return Math.max(0, Math.min(f, 7 - unavailable));
}

function maxRun(row: (Code | null)[]): { len: number; end: number } {
  let best = 0;
  let cur = 0;
  let end = -1;
  for (let i = 0; i < row.length; i++) {
    if (isWork(row[i]) || row[i] === null) {
      cur++;
      if (cur > best) {
        best = cur;
        end = i;
      }
    } else cur = 0;
  }
  return { len: best, end };
}

/** Dias de trabalho além do máximo seguido, somando todas as sequências (0 = tudo certo). */
function excessoSeguidos(row: (Code | null)[], max: number): number {
  let total = 0;
  let cur = 0;
  for (let i = 0; i <= row.length; i++) {
    if (i < row.length && (isWork(row[i]) || row[i] === null)) cur++;
    else {
      if (cur > max) total += cur - max;
      cur = 0;
    }
  }
  return total;
}

/** Avaliação da escala: déficit ponderado por intensidade + preferências. */
export function evaluate(p: SolveProblem, rows: Code[][]) {
  const nD = p.days.length;
  const nS = p.axis.length;
  const cnt = p.external.map((r) => r.slice());
  rows.forEach((row, e) => {
    for (let d = 0; d < nD; d++) if (isWork(row[d])) for (const s of p.employees[e].contrib[d]) cnt[d][s]++;
  });
  let obj = 0;
  let deficit = 0;
  for (let d = 0; d < nD; d++) {
    const W = INT_W[p.days[d].intensity] ?? 2;
    for (let s = 0; s < nS; s++) {
      const miss = p.days[d].req[s] - cnt[d][s];
      if (miss > 0) {
        obj += W * 10 * miss;
        deficit += miss;
      }
      const missI = p.days[d].ideal[s] - cnt[d][s];
      if (missI > 0) obj += W * missI;
    }
  }
  // equilíbrio: folgas espalhadas pelos dias (evita concentrar todo mundo de folga no mesmo dia, ex.: domingo)
  for (let d = 0; d < nD; d++) {
    if (p.days[d].closed) continue;
    let off = 0;
    for (const row of rows) if (row[d] === "F") off++;
    obj += (BAL * off * (off - 1)) / 2;
  }
  rows.forEach((row, e) => {
    const pref = p.employees[e].prefWeekday;
    for (let d = 0; d < nD; d++) {
      if (row[d] === "F" && p.employees[e].fixed[d] === null) {
        obj += p.days[d].intensity * 0.6;
        if (pref != null && p.days[d].weekday === pref) obj -= 1.5;
      }
    }
  });
  rows.forEach((row, e) => {
    if (!sepPadrao(p, e)) return;
    const fx = p.employees[e].fixed;
    for (let d = 0; d + 1 < nD; d++) if (row[d] === "F" && row[d + 1] === "F" && !parFds(p, d, d + 1) && (fx[d] === null || fx[d + 1] === null)) obj += SEP;
  });
  obj += penalidadeRegras(p, rows);
  obj += penalidadeTurnos(p, rows);
  obj += penalidadeDias(p, rows);
  obj += penalidadeSabados(p, rows);
  if (p.minRestMin) rows.forEach((row, e) => (obj += PESO_DESCANSO * descansosCurtos(p, e, row)));
  return { obj, deficit, cnt };
}

/** Validação das restrições obrigatórias. Usada para o motor local e para o CP-SAT. */
export function validate(p: SolveProblem, rows: Code[][]): Violation[] {
  const v: Violation[] = [];
  const nD = p.days.length;
  rows.forEach((row, e) => {
    const emp = p.employees[e];
    for (let w = 0; w < p.weeks && !emp.plantao; w++) {
      const need = requiredFolgas(p, emp.fixed, w, emp.folgas);
      let f = 0;
      let mins = 0;
      for (let d = w * 7; d < w * 7 + 7 && d < nD; d++) {
        if (row[d] === "F") f++;
        if (isWork(row[d])) mins += emp.workMin[d];
      }
      if (f < need)
        v.push({ kind: "folgas", empId: emp.id, week: w, message: `${emp.name}: semana ${w + 1} com ${f} folga(s); o mínimo é ${need}.` });
      // folgas além do necessário só são aceitas quando definidas/bloqueadas manualmente
      const fixedF = emp.fixed.slice(w * 7, w * 7 + 7).filter((c) => c === "F").length;
      if (f > Math.max(need, fixedF))
        v.push({ kind: "folgas", empId: emp.id, week: w, message: `${emp.name}: semana ${w + 1} com ${f} folgas (esperado ${need}).` });
      if (mins > p.weeklyMaxMin)
        v.push({
          kind: "weeklyHours",
          empId: emp.id,
          week: w,
          message: `${emp.name}: semana ${w + 1} soma ${fmtDur(mins)}, acima do limite semanal de ${fmtDur(p.weeklyMaxMin)}.`,
        });
    }
    // dias fixos (folga fixa, domingos do time, férias, faltas, atestados, edições à mão) não podem mudar
    for (let d = 0; d < nD; d++) {
      const fx = emp.fixed[d];
      if (fx && fx !== row[d] && !(isWork(fx) && isWork(row[d])))
        v.push({ kind: "fixed", empId: emp.id, dayIdx: d, message: `${emp.name}: ${fmtDateBR(p.days[d].date, false)} deveria ser ${fx === "F" ? "folga" : fx} e ficou ${row[d]}.` });
    }
    let run = 0;
    for (let d = 0; d < nD && !emp.plantao; d++) {
      run = isWork(row[d]) ? run + 1 : 0;
      if (run === p.maxConsec + 1)
        v.push({
          kind: "consec",
          empId: emp.id,
          dayIdx: d,
          message: `${emp.name}: ${run} dias seguidos de trabalho até ${fmtDateBR(p.days[d].date, false)} (máximo ${p.maxConsec}).`,
        });
    }
    // descanso mínimo entre jornadas (só quando algum dos dois dias foi escolhido pelo sistema)
    const dc = emp.descansoCurto;
    if (dc && p.minRestMin)
      for (let d = 1; d < nD; d++)
        if (dc[d] != null && isWork(row[d - 1]) && isWork(row[d]) && (emp.fixed[d - 1] === null || emp.fixed[d] === null))
          v.push({
            kind: "descanso",
            empId: emp.id,
            dayIdx: d,
            message: `${emp.name}: descanso de ${fmtDur(dc[d] as number)} entre ${WEEKDAY_SHORT[p.days[d - 1].weekday].toLowerCase()} ${fmtDateBR(p.days[d - 1].date, false)} e ${WEEKDAY_SHORT[p.days[d].weekday].toLowerCase()} ${fmtDateBR(p.days[d].date, false)} (mínimo ${fmtDur(p.minRestMin)} entre jornadas).`,
          });
    if (emp.sundayWindow) {
      const sundays = p.days.map((d, i) => ({ d, i })).filter((x) => x.d.weekday === 0 && !x.d.closed);
      const N = emp.sundayWindow;
      for (let k = 0; k + N <= sundays.length; k++) {
        const win = sundays.slice(k, k + N);
        if (!win.some((x) => !isWork(row[x.i])))
          v.push({
            kind: "sunday",
            empId: emp.id,
            dayIdx: win[N - 1].i,
            message: `${emp.name}: sem folga em ${N} domingos seguidos (até ${fmtDateBR(win[N - 1].d.date, false)}).`,
          });
      }
    }
  });
  for (let d = 0; d < nD; d++) {
    const day = p.days[d];
    if (day.closed) continue;
    let off = 0;
    let work = 0;
    rows.forEach((row, e) => {
      if (row[d] === "F") off++;
      if (isWork(row[d])) work++;
    });
    if (day.maxOff != null && off > day.maxOff)
      v.push({ kind: "maxOff", dayIdx: d, message: `${WEEKDAY_LONG[day.weekday]} ${fmtDateBR(day.date, false)}: ${off} pessoas de folga (limite ${day.maxOff}).` });
    day.maxOffTurno?.forEach((lim, g) => {
      if (lim == null) return;
      const n = rows.filter((row, ei) => row[d] === "F" && p.employees[ei].turno === g).length;
      if (n > lim)
        v.push({ kind: "maxOff", dayIdx: d, message: `${WEEKDAY_LONG[day.weekday]} ${fmtDateBR(day.date, false)}: ${n} pessoas de ${p.turnoNomes?.[g] ?? "um turno"} de folga (máximo ${lim}).` });
    });
    if (day.minStaff != null && work < day.minStaff)
      v.push({ kind: "minStaff", dayIdx: d, message: `${WEEKDAY_LONG[day.weekday]} ${fmtDateBR(day.date, false)}: ${work} trabalhando (mínimo diário ${day.minStaff}).` });
  }
  for (const x of violacoesRegras(p, rows)) v.push({ kind: "regra", ...x });
  return v;
}

/** Explica por que não há solução que respeite todas as restrições obrigatórias. */
export function explainInfeasibility(p: SolveProblem): string[] {
  const out: string[] = [];
  const nE = p.employees.length;
  for (let w = 0; w < p.weeks; w++) {
    const need = p.employees.reduce((a, e) => a + requiredFolgas(p, e.fixed, w, e.folgas), 0);
    let cap = 0;
    let unlimited = false;
    for (let d = w * 7; d < w * 7 + 7; d++) {
      const day = p.days[d];
      if (day.closed) {
        cap += nE;
        continue;
      }
      if (day.maxOff == null) unlimited = true;
      else cap += day.maxOff;
    }
    if (!unlimited && need > cap)
      out.push(
        `Semana ${w + 1}: a equipe precisa de ${need} folgas, mas os limites diários de folga somam ${cap}. Aumente o "máximo de folgas" em algum dia ou reduza a equipe/folgas.`,
      );
    // máximo por turno (regra 3b): os máximos do turno na semana comportam as folgas de quem é dele?
    (p.turnos ?? []).forEach((_, g) => {
      const doTurno = p.employees.filter((e) => e.turno === g);
      if (!doTurno.length) return;
      const needT = doTurno.reduce((a, e) => a + requiredFolgas(p, e.fixed, w, e.folgas), 0);
      let capT = 0;
      for (let d = w * 7; d < w * 7 + 7 && d < p.days.length; d++) {
        const day = p.days[d];
        const podem = day.closed ? doTurno.length : doTurno.filter((e) => e.fixed[d] === null || e.fixed[d] === "F").length;
        capT += Math.min(limTurno(p, d, g) ?? podem, podem);
      }
      if (needT > capT)
        out.push(
          `Semana ${w + 1}: ${p.turnoNomes?.[g] ?? "um turno"} precisa de ${needT} folgas, mas os máximos de folga desse turno nos dias da semana somam ${capT}. Aumente o máximo do turno em algum dia (regra 3b).`,
        );
    });
    // mínimo diário vs. capacidade de jornadas
    let minDays = 0;
    for (let d = w * 7; d < w * 7 + 7; d++) if (p.days[d].minStaff) minDays += p.days[d].minStaff!;
    const jornadas = p.employees.reduce((a, e) => a + (7 - requiredFolgas(p, e.fixed, w, e.folgas) - e.fixed.slice(w * 7, w * 7 + 7).filter((c) => c === "A" || c === "M" || c === "V" || c === "H").length), 0);
    if (minDays > jornadas)
      out.push(`Semana ${w + 1}: os mínimos diários somam ${minDays} jornadas, mas a equipe oferece ${jornadas} no 5x2. Reduza os mínimos diários ou aumente a equipe.`);
  }
  // 6x1 com folga só em alguns domingos: na semana da folga de domingo a única folga é o domingo, então de segunda a sábado
  // já são 6 dias; somados ao domingo anterior (trabalhado), passa do máximo de dias seguidos
  const temDomingo = p.days.some((d) => d.weekday === 0 && !d.closed);
  if (temDomingo && p.maxConsec <= 6)
    for (const e of p.employees) {
      if (e.plantao || (e.folgas ?? p.folgas) !== 1) continue;
      const domFixo = (e.fixedOffWeekdays ?? (e.fixedOffWeekday != null ? [e.fixedOffWeekday] : [])).includes(0);
      if (domFixo || e.sundayWindow == null || e.sundayWindow === 1) continue;
      out.push(
        `${e.name}: em 6x1 com folga em 1 de cada ${e.sundayWindow} domingos não dá para cumprir o máximo de ${p.maxConsec} dias seguidos — na semana da folga de domingo, a única folga é o domingo, então de segunda a sábado já são 6 dias, somados ao domingo anterior trabalhado. Para 6x1, escolha "Não trabalha domingo" para essa pessoa em Equipe (a folga da semana fica sempre no domingo) ou passe para 5x2.`,
      );
    }
  for (let d = 0; d < p.days.length; d++) {
    const day = p.days[d];
    if (day.closed || day.minStaff == null) continue;
    const fixa = (e: ProblemEmp) => (e.fixedOffWeekdays ?? (e.fixedOffWeekday != null ? [e.fixedOffWeekday] : [])).includes(day.weekday);
    const avail = p.employees.filter((e) => !isOffCode(e.fixed[d]) && !(fixa(e) && e.fixed[d] === null)).length;
    if (avail < day.minStaff)
      out.push(
        `${WEEKDAY_LONG[day.weekday]} ${fmtDateBR(day.date, false)}: mínimo diário de ${day.minStaff}, mas só ${avail} pessoas podem trabalhar (folgas fixas, férias, ausências ou bloqueios).`,
      );
    if (day.maxOff != null) {
      const forcedOff = p.employees.filter((e) => e.fixed[d] === "F" || (fixa(e) && e.fixed[d] === null)).length;
      if (forcedOff > day.maxOff)
        out.push(
          `${WEEKDAY_LONG[day.weekday]} ${fmtDateBR(day.date, false)}: ${forcedOff} folgas já são obrigatórias (fixas/domingo/bloqueadas), acima do limite de ${day.maxOff}.`,
        );
    }
  }
  for (const e of p.employees) {
    if (e.plantao) continue;
    for (let w = 0; w < p.weeks; w++) {
      let mins = 0;
      const workDays = 7 - requiredFolgas(p, e.fixed, w, e.folgas) - e.fixed.slice(w * 7, w * 7 + 7).filter((c) => c === "A" || c === "M" || c === "V" || c === "H").length;
      const wm = e.workMin.slice(w * 7, w * 7 + 7).filter((_, i) => !p.days[w * 7 + i].closed);
      const sorted = wm.slice().sort((a, b) => a - b);
      for (let i = 0; i < Math.min(workDays, sorted.length); i++) mins += sorted[i];
      if (mins > p.weeklyMaxMin) {
        out.push(
          `${e.name}: ${workDays} dias de trabalho somam ao menos ${fmtDur(mins)} na semana ${w + 1}, acima do limite de ${fmtDur(p.weeklyMaxMin)}. Reduza a jornada diária do turno ou ajuste o limite semanal.`,
        );
        break;
      }
    }
  }
  return dedupe(out);
}

function dedupe(a: string[]) {
  return Array.from(new Set(a));
}

/** Teto de cobertura: faixas em que nem todos trabalhando atingiriam o mínimo. */
export function coverageCeiling(p: SolveProblem): string[] {
  const out: string[] = [];
  const byKey = new Map<string, { wd: number; s: number; e: number; need: number; have: number; weeks: Set<number> }>();
  for (let d = 0; d < p.days.length; d++) {
    const day = p.days[d];
    if (day.closed) continue;
    const ceil = p.external[d].slice();
    p.employees.forEach((e) => {
      if (isOffCode(e.fixed[d])) return;
      for (const s of e.contrib[d]) ceil[s]++;
    });
    let runStart = -1;
    for (let s = 0; s <= p.axis.length; s++) {
      const bad = s < p.axis.length && day.req[s] > ceil[s];
      if (bad && runStart < 0) runStart = s;
      if (!bad && runStart >= 0) {
        const need = Math.max(...day.req.slice(runStart, s));
        const have = Math.min(...ceil.slice(runStart, s));
        const key = `${day.weekday}|${runStart}|${s}`;
        const cur = byKey.get(key) ?? { wd: day.weekday, s: runStart, e: s, need, have, weeks: new Set<number>() };
        cur.weeks.add(day.week);
        byKey.set(key, cur);
        runStart = -1;
      }
    }
  }
  for (const v of byKey.values()) {
    out.push(
      `${WEEKDAY_SHORT[v.wd]} ${fmtTime(p.axis[v.s])}–${fmtTime(p.axis[v.e - 1] + p.slot)}: o mínimo pede ${v.need}, mas no máximo ${v.have} pessoa(s) estariam no posto mesmo sem nenhuma folga (turnos/intervalos não cobrem). Ajuste turnos, intervalos ou o mínimo.`,
    );
  }
  return out.slice(0, 12);
}

/** Motor local: gulosa ponderada por movimento + busca local com restrições obrigatórias. */
export function solveHeuristic(p: SolveProblem, seed = 1): SolveResult {
  const t0 = Date.now();
  const nE = p.employees.length;
  const nD = p.days.length;
  const nS = p.axis.length;
  let rnd = seed * 9301 + 49297;
  const rand = () => {
    rnd = (rnd * 9301 + 49297) % 233280;
    return rnd / 233280;
  };

  const rows: (Code | null)[][] = p.employees.map((e) => e.fixed.slice());

  const pinned = new Set<number>();
  // 1) domingos automáticos: escolhe o deslocamento do ciclo que equilibra folgas dominicais
  const sundayIdx = p.days.map((d, i) => (d.weekday === 0 && !d.closed ? i : -1)).filter((i) => i >= 0);
  const sundayOff = sundayIdx.map((i) => rows.filter((r) => r[i] === "F").length);
  // folgas de cada turno em cada domingo: o domingo de folga também é dividido entre os turnos na proporção de cada um
  const sundayOffT = sundayIdx.map((i) => folgasPorTurno(p, rows, i));
  // escolhe o deslocamento de cada pessoa (gulosa) e depois revê cada escolha com as dos outros já feitas,
  // até nada melhorar: menos gente de folga no mesmo domingo e as folgas divididas entre os turnos
  const kDe = new Map<number, number>();
  const marca = (ei: number, k: number, delta: 1 | -1) => {
    const N = p.employees[ei].sundayWindow!;
    const g = p.employees[ei].turno ?? -1;
    sundayIdx.forEach((di, j) => {
      if (rows[ei][di] !== null || j % N !== k) return;
      sundayOff[j] += delta;
      if (g >= 0) sundayOffT[j][g] += delta;
    });
  };
  const nota = (ei: number, k: number) => {
    const N = p.employees[ei].sundayWindow!;
    const g = p.employees[ei].turno ?? -1;
    let score = 0;
    sundayIdx.forEach((di, j) => {
      if (rows[ei][di] !== null || j % N !== k) return;
      const day = p.days[di];
      score += (sundayOff[j] + 1) * 5;
      if (g >= 0 && p.turnos) score += 6 * deltaExcesso(p.turnos, sundayOffT[j], g, 1) + (2 * (sundayOffT[j][g] + 1)) / Math.max(1, p.turnos[g]);
      if (day.maxOff != null && sundayOff[j] + 1 > day.maxOff) score += 1000;
      const lt = limTurno(p, di, g);
      if (lt != null && sundayOffT[j][g] + 1 > lt) score += 1000;
    });
    return score;
  };
  const melhorK = (ei: number) => {
    let bestK = 0;
    let bestScore = Infinity;
    for (let k = 0; k < p.employees[ei].sundayWindow!; k++) {
      const sc = nota(ei, k);
      if (sc < bestScore - 1e-9) (bestScore = sc), (bestK = k);
    }
    return bestK;
  };
  p.employees.forEach((e, ei) => {
    if (!e.sundayWindow) return;
    const k = melhorK(ei);
    kDe.set(ei, k);
    marca(ei, k, 1);
  });
  for (let pass = 0; pass < 6; pass++) {
    let mudou = false;
    for (const [ei, k0] of kDe) {
      marca(ei, k0, -1);
      const k = melhorK(ei);
      const fica = nota(ei, k0) <= nota(ei, k) + 1e-9 ? k0 : k;
      marca(ei, fica, 1);
      if (fica !== k0) (kDe.set(ei, fica), (mudou = true));
    }
    if (!mudou) break;
  }
  p.employees.forEach((e, ei) => {
    if (!e.sundayWindow) return;
    const N = e.sundayWindow;
    const bestK = kDe.get(ei)!;
    sundayIdx.forEach((di, j) => {
      if (rows[ei][di] !== null) return;
      // sai tarde no sábado e não pode folgar no sábado: trabalhar no domingo daria descanso curto, então folga
      const sab = di - 1;
      const sabTrava = sab >= 0 && (isWork(rows[ei][sab]) || p.regras?.semFolgaDia[sab] === 2);
      if (j % N === bestK || (e.descansoCurto?.[di] != null && sabTrava)) rows[ei][di] = "F";
      else rows[ei][di] = "D";
      pinned.add(ei * nD + di); // o rodízio de domingos não é desfeito pela busca local
    });
  });

  // 2) folgas fixas
  p.employees.forEach((e, ei) => {
    const fx = e.fixedOffWeekdays ?? (e.fixedOffWeekday != null ? [e.fixedOffWeekday] : []);
    if (!fx.length) return;
    for (let d = 0; d < nD; d++) if (fx.includes(p.days[d].weekday) && rows[ei][d] === null) rows[ei][d] = "F";
  });

  // 2b) "sábado com domingo": quem folga no domingo também folga no sábado anterior, até o máximo por fim de semana,
  //     em rodadas (todo mundo que pode ganha 1 fim de semana inteiro antes de alguém ganhar o 2º). Semana começando
  //     na segunda: para não passar de 6 dias seguidos, a pessoa também folga no domingo anterior (rodízio do sistema)
  //     ou, se o domingo é de time fixo, no sábado anterior.
  if (p.regras?.sabDom != null) {
    const max = p.regras.sabDom;
    const folgasSem = (ei: number, w: number) => rows[ei].slice(w * 7, w * 7 + 7).filter((c) => c === "F").length;
    const fdsDe = new Array(nE).fill(0);
    // fins de semana do período (sábado + domingo abertos)
    const fds = p.days
      .map((d, sun) => sun)
      .filter((sun) => sun > 0 && p.days[sun].weekday === 0 && p.days[sun - 1].weekday === 6 && !p.days[sun].closed && !p.days[sun - 1].closed);
    const paresEm = (sun: number) => paresFds(rows, sun - 1);
    const noSab = (sab: number) => rows.filter((r) => r[sab] === "F").length;
    /**
     * O que a semana anterior precisa para ninguém passar de 6 dias seguidos — só quando sábado e domingo caem na
     * mesma semana (semana começando na segunda): "ok" (nada), o domingo anterior (se foi o rodízio do sistema que
     * escolheu) ou, quando o domingo é de time fixo, o sábado anterior. null = não dá.
     */
    /** mais uma folga do turno da pessoa no sábado não passa da parte do turno (divisão proporcional entre os turnos) */
    const cabeNoTurno = (ei: number, sab: number) => {
      const gT = p.employees[ei].turno ?? -1;
      const k = folgasPorTurno(p, rows, sab);
      if (!cabeLimTurno(p, ei, sab, k)) return false;
      return gT < 0 || !p.turnos || p.turnos.length < 2 || deltaExcesso(p.turnos, k, gT, 1) <= 0;
    };
    const antes = (ei: number, sun: number): "ok" | "dom" | "sab" | null => {
      const e = p.employees[ei];
      const ant = p.days[sun - 1].week === p.days[sun].week ? sun - 7 : -1;
      if (ant < 0 || p.days[ant].closed || rows[ei][ant] === "F") return "ok";
      const wa = p.days[ant].week;
      if (folgasSem(ei, wa) + 1 > requiredFolgas(p, e.fixed, wa, e.folgas)) return null;
      if (e.fixed[ant] === null && pinned.has(ei * nD + ant)) return "dom";
      const sa = ant - 1;
      if (sa < 0) return "ok";
      if (rows[ei][sa] === "F") return "ok";
      if (p.days[sa].closed || p.days[sa].weekday !== 6 || rows[ei][sa] !== null || e.fixed[sa] !== null) return null;
      const limA = p.days[sa].maxOff;
      if (limA != null && noSab(sa) >= limA) return null;
      if (!cabeNoTurno(ei, sa)) return null;
      return podeFolgarRegras(p, rows, ei, sa) ? "sab" : null;
    };
    const pode = (ei: number, sun: number): "ok" | "dom" | "sab" | null => {
      const e = p.employees[ei];
      const sab = sun - 1;
      if (e.plantao || rows[ei][sun] !== "F" || rows[ei][sab] !== null || e.fixed[sab] !== null) return null;
      if (paresEm(sun) >= max) return null;
      const lim = p.days[sab].maxOff;
      if (lim != null && noSab(sab) >= lim) return null;
      if (!cabeNoTurno(ei, sab)) return null;
      const w = p.days[sab].week;
      if (folgasSem(ei, w) + 1 > requiredFolgas(p, e.fixed, w, e.folgas)) return null;
      if (!podeFolgarRegras(p, rows, ei, sab)) return null;
      return antes(ei, sun);
    };
    // rodadas: em cada rodada, cada pessoa ganha no máximo um fim de semana inteiro — ninguém ganha o 2º antes de
    // todos que podem terem ganhado o 1º. Dentro da rodada, primeiro quem tem menos fins de semana possíveis
    // (menos chances); o fim de semana escolhido é o que tem mais vaga e fica mais longe dos que a pessoa já ganhou.
    const ganhou: number[][] = p.employees.map(() => []);
    for (let rodada = 0; rodada < fds.length; rodada++) {
      let deu = false;
      const feitos = new Set<number>();
      for (;;) {
        // a cada escolha, quem ficou com menos opções passa na frente
        let ei = -1;
        let menos = Infinity;
        for (let x = 0; x < nE; x++) {
          if (feitos.has(x) || fdsDe[x] !== rodada) continue;
          const n = fds.filter((sun) => pode(x, sun) != null).length;
          const k = n * nE + ((x + rodada * 7) % nE);
          if (n > 0 && k < menos) (menos = k), (ei = x);
        }
        if (ei < 0) break;
        feitos.add(ei);
        let melhor = -1;
        let nota = -Infinity;
        for (const sun of fds) {
          const prec = pode(ei, sun);
          if (prec == null) continue;
          // prefere: fim de semana que não pede folga extra na semana anterior, longe dos que a pessoa já ganhou
          // (nunca colado), e depois o que tem mais vaga
          const vaga = max - paresEm(sun);
          const longe = ganhou[ei].length ? Math.min(...ganhou[ei].map((g) => Math.abs(g - sun))) : nD;
          if (longe <= 7 && fds.some((o) => o !== sun && pode(ei, o) != null && (!ganhou[ei].length || Math.min(...ganhou[ei].map((g) => Math.abs(g - o))) > 7))) continue;
          // e o sábado em que o turno da pessoa ainda está abaixo da parte proporcional dele
          const gT = p.employees[ei].turno ?? -1;
          let prop = gT >= 0 && p.turnos ? deltaExcesso(p.turnos, folgasPorTurno(p, rows, sun - 1), gT, 1) : 0;
          // o domingo anterior que a pessoa também ganha (semana começando na segunda) conta do mesmo jeito
          if (gT >= 0 && p.turnos && prec === "dom") prop += deltaExcesso(p.turnos, folgasPorTurno(p, rows, sun - 7), gT, 1);
          if (gT >= 0 && p.turnos && prec === "sab") prop += deltaExcesso(p.turnos, folgasPorTurno(p, rows, sun - 8), gT, 1);
          const n = (prec === "ok" ? 10000 : 0) + Math.min(longe, 28) * 100 - prop * 250 + vaga;
          if (n > nota) (nota = n), (melhor = sun);
        }
        if (melhor < 0) continue;
        const prec = pode(ei, melhor)!;
        const ant = melhor - 7;
        if (prec === "dom") rows[ei][ant] = "F";
        // o sábado anterior não fica travado: o rodízio dos sábados pode trocá-lo, se os dias seguidos deixarem
        if (prec === "sab") rows[ei][ant - 1] = "F";
        rows[ei][melhor - 1] = "F";
        pinned.add(ei * nD + melhor - 1);
        fdsDe[ei]++;
        ganhou[ei].push(melhor);
        deu = true;
      }
      if (!deu) break;
    }
  }

  // 2c) "segunda com domingo": quem folga no domingo também folga na segunda seguinte, até o máximo por domingo.
  //     A segunda é uma das folgas da semana dela (se a semana começa na segunda, é a primeira folga da semana
  //     seguinte). Revezando: primeiro quem teve menos pares; quem já ganhou o sábado (regra 5b) fica por último.
  if (p.regras?.domSeg != null) {
    const max = p.regras.domSeg;
    const parDe = new Array(nE).fill(0);
    const folgasSem = (ei: number, w: number) => rows[ei].slice(w * 7, w * 7 + 7).filter((c) => c === "F").length;
    for (let sun = 0; sun + 1 < nD; sun++) {
      const seg = sun + 1;
      if (p.days[sun].weekday !== 0 || p.days[seg].weekday !== 1 || p.days[sun].closed || p.days[seg].closed) continue;
      let pares = paresFds(rows, sun);
      const lim = p.days[seg].maxOff;
      let naSeg = rows.filter((r) => r[seg] === "F").length;
      const w = p.days[seg].week;
      const cand = p.employees
        .map((e, ei) => ({ e, ei, sab: sun > 0 && rows[ei][sun - 1] === "F" ? 1 : 0 }))
        .filter(({ e, ei }) => !e.plantao && rows[ei][sun] === "F" && rows[ei][seg] === null && e.fixed[seg] === null && folgasSem(ei, w) + 1 <= requiredFolgas(p, e.fixed, w, e.folgas) && podeFolgarRegras(p, rows, ei, seg))
        .sort((a, b) => a.sab - b.sab || parDe[a.ei] - parDe[b.ei] || ((a.ei + sun) % nE) - ((b.ei + sun) % nE));
      for (const { ei } of cand) {
        if (pares >= max || (lim != null && naSeg >= lim)) break;
        if (!cabeLimTurno(p, ei, seg, folgasPorTurno(p, rows, seg))) continue;
        rows[ei][seg] = "F";
        pinned.add(ei * nD + seg);
        pares++;
        naSeg++;
        parDe[ei]++;
      }
    }
  }

  // estado incremental
  const cnt = p.external.map((r) => r.slice());
  const offCnt = new Array(nD).fill(0);
  const workCnt = new Array(nD).fill(0);
  rows.forEach((row, ei) => {
    for (let d = 0; d < nD; d++) {
      if (row[d] === "F") offCnt[d]++;
      if (row[d] === null || isWork(row[d])) {
        workCnt[d]++;
        for (const s of p.employees[ei].contrib[d]) cnt[d][s]++;
      }
    }
  });
  const W = p.days.map((d) => INT_W[d.intensity] ?? 2);
  // folgas de cada turno em cada dia (equilíbrio por turno)
  const nT = p.turnos?.length ?? 0;
  const offT = p.days.map(() => new Array(nT).fill(0));
  rows.forEach((row, ei) => {
    const g = p.employees[ei].turno ?? -1;
    if (g >= 0) for (let d = 0; d < nD; d++) if (row[d] === "F") offT[d][g]++;
  });
  const tamT = (g: number) => Math.max(1, p.turnos![g]);
  // equilíbrio entre os dias da semana: folgas de cada dia (sem plantão) e a faixa justa de cada dia. Antes da gulosa,
  // a faixa sai das folgas que a semana vai ter (as que faltam dar + as já dadas); depois, das que ficaram.
  const offEq = folgasPorDia(p, rows);
  const Kest = Array.from({ length: Math.ceil(nD / 7) }, (_, w) => {
    let k = 0;
    p.employees.forEach((e, ei) => {
      if (e.plantao) return;
      let fora = 0;
      for (let d = w * 7; d < w * 7 + 7 && d < nD; d++) if (rows[ei][d] === "F" && !diaDeEquilibrio(p, d)) fora++;
      k += Math.max(0, requiredFolgas(p, e.fixed, w, e.folgas) - fora);
    });
    return k;
  });
  let faixa = faixaDias(p, offEq, Kest);
  /** quanto dar (+1) ou tirar (−1) uma folga da pessoa no dia d muda o custo da faixa do dia */
  const eqDelta = (ei: number, d: number, delta: 1 | -1) =>
    p.employees[ei].plantao || !diaDeEquilibrio(p, d) ? 0 : custoFaixa(offEq[d] + delta, faixa, d) - custoFaixa(offEq[d], faixa, d);

  // fila dos sábados de folga (com o período anterior): sábado para quem já tem mais que o menor custa caro
  const sabsFila = p.days.map((x, i) => i).filter((i) => p.days[i].weekday === 6 && !p.days[i].closed);
  const elegFila = p.employees.map((e, ei) => ei).filter((ei) => !p.employees[ei].plantao && sabadoLivre(p, ei, sabsFila));
  const naFila = new Set(elegFila);
  const baseFila = basesSabado(p, elegFila);
  const sabTot = (ei: number) => baseFila[ei] + sabsFila.filter((x) => rows[ei][x] === "F").length;
  /** quantos sábados a pessoa ficaria acima do menor da equipe (0 = é a vez dela) */
  const filaSab = (ei: number, d: number, delta: 1 | -1) => {
    if (!naFila.has(ei) || p.days[d].weekday !== 6 || p.days[d].closed || elegFila.length < 2) return 0;
    let mn = Infinity;
    for (const ej of elegFila) if (ej !== ei) mn = Math.min(mn, sabTot(ej));
    const meu = sabTot(ei) + (delta === 1 ? 0 : -1);
    return SAB_FILA * Math.max(0, meu - mn);
  };
  /** custo marginal de tirar a pessoa do dia d (folga) */
  const offCost = (ei: number, d: number) => {
    let c = filaSab(ei, d, 1);
    for (const s of p.employees[ei].contrib[d]) {
      if (cnt[d][s] <= p.days[d].req[s]) c += W[d] * 10;
      if (cnt[d][s] <= p.days[d].ideal[s]) c += W[d];
    }
    c += p.days[d].intensity * 0.6;
    c += BAL * offCnt[d];
    if (p.employees[ei].prefWeekday != null && p.days[d].weekday === p.employees[ei].prefWeekday) c -= 1.5;
    if (p.regras) c += custoRegras(p, rows, ei, d, { off: offCnt, work: workCnt });
    if (sepPadrao(p, ei)) c += SEP * vizinhasF(p, rows[ei], d);
    const g = p.employees[ei].turno ?? -1;
    if (g >= 0) c += (BAL_TURNO * offT[d][g]) / tamT(g) + (offT[d][g] >= tetoTurno(tamT(g)) ? ACIMA_TETO : 0) + PROP_TURNO * deltaExcesso(p.turnos!, offT[d], g, 1);
    c += eqDelta(ei, d, 1);
    return c;
  };
  /** regras avançadas que proíbem a folga da pessoa no dia d (olha os vizinhos) */
  /** cabe no máximo do turno (regra 3b), esteja a folga já dada em d ou não */
  const turnoCabe = (ei: number, d: number) => {
    const g = p.employees[ei].turno ?? -1;
    const lim = limTurno(p, d, g);
    return lim == null || offT[d][g] - (rows[ei][d] === "F" ? 1 : 0) + 1 <= lim;
  };
  const podeFolgar = (ei: number, d: number) => turnoCabe(ei, d) && (!p.regras || podeFolgarRegras(p, rows, ei, d));
  /** ganho (custo negativo) de colocar a pessoa para trabalhar no dia d */
  const onGain = (ei: number, d: number) => {
    let c = -filaSab(ei, d, -1);
    for (const s of p.employees[ei].contrib[d]) {
      if (cnt[d][s] < p.days[d].req[s]) c += W[d] * 10;
      if (cnt[d][s] < p.days[d].ideal[s]) c += W[d];
    }
    c += p.days[d].intensity * 0.6;
    c += BAL * Math.max(0, offCnt[d] - 1);
    if (p.employees[ei].prefWeekday != null && p.days[d].weekday === p.employees[ei].prefWeekday) c -= 1.5;
    if (p.regras) {
      offCnt[d]--;
      c += custoRegras(p, rows, ei, d, { off: offCnt, work: workCnt });
      offCnt[d]++;
    }
    if (sepPadrao(p, ei)) c += SEP * vizinhasF(p, rows[ei], d);
    const g = p.employees[ei].turno ?? -1;
    if (g >= 0) c += (BAL_TURNO * Math.max(0, offT[d][g] - 1)) / tamT(g) + (offT[d][g] - 1 >= tetoTurno(tamT(g)) ? ACIMA_TETO : 0) - PROP_TURNO * deltaExcesso(p.turnos!, offT[d], g, -1);
    c -= eqDelta(ei, d, -1);
    return c;
  };
  const setOff = (ei: number, d: number) => {
    rows[ei][d] = "F";
    offCnt[d]++;
    if (!p.employees[ei].plantao) offEq[d]++;
    const gT = p.employees[ei].turno ?? -1;
    if (gT >= 0) offT[d][gT]++;
    workCnt[d]--;
    for (const s of p.employees[ei].contrib[d]) cnt[d][s]--;
  };
  const setOn = (ei: number, d: number) => {
    rows[ei][d] = p.days[d].special ? "D" : "T";
    offCnt[d]--;
    if (!p.employees[ei].plantao) offEq[d]--;
    const gT = p.employees[ei].turno ?? -1;
    if (gT >= 0) offT[d][gT]--;
    workCnt[d]++;
    for (const s of p.employees[ei].contrib[d]) cnt[d][s]++;
  };
  const canOff = (d: number) => {
    const day = p.days[d];
    if (day.maxOff != null && offCnt[d] + 1 > day.maxOff) return false;
    if (day.minStaff != null && workCnt[d] - 1 < day.minStaff) return false;
    return true;
  };
  // descanso entre jornadas: depois da gulosa, nenhuma mudança pode aumentar os descansos curtos de ninguém
  let restBase: number[] | null = null;
  const curtos = (ei: number) => descansosCurtos(p, ei, rows[ei]);
  const runOk = (ei: number) => maxRun(rows[ei]).len <= p.maxConsec && (restBase === null || curtos(ei) <= restBase[ei]);

  // 3) folgas variáveis — gulosa por unidade (pessoa, semana), mais restritas primeiro
  type Unit = { ei: number; w: number; need: number };
  const units: Unit[] = [];
  p.employees.forEach((e, ei) => {
    for (let w = 0; w < p.weeks; w++) {
      const req = requiredFolgas(p, e.fixed, w, e.folgas);
      let have = 0;
      for (let d = w * 7; d < w * 7 + 7; d++) if (rows[ei][d] === "F") have++;
      if (req - have > 0) units.push({ ei, w, need: req - have });
    }
  });
  const candidates = (u: Unit) => {
    const out: number[] = [];
    for (let d = u.w * 7; d < u.w * 7 + 7; d++) if (rows[u.ei][d] === null && !p.days[d].closed) out.push(d);
    return out;
  };
  let guard = 0;
  while (units.some((u) => u.need > 0) && guard++ < 10000) {
    const open = units.filter((u) => u.need > 0);
    open.sort((a, b) => candidates(a).filter(canOff).length - candidates(b).filter(canOff).length || rand() - 0.5);
    const u = open[0];
    const cands = candidates(u);
    if (!cands.length) {
      u.need = 0; // impossível: será apontado pelo validador
      continue;
    }
    let best = -1;
    let bestC = Infinity;
    for (const d of cands) {
      let c = offCost(u.ei, d) + rand() * 0.01;
      if (!canOff(d)) c += 1e6;
      if (!podeFolgar(u.ei, d)) c += 5e5;
      // evita sequência longa de trabalho: prefere quebrar a maior sequência
      rows[u.ei][d] = "F";
      if (!runOk(u.ei)) c += 5e3;
      c += 3e3 * curtos(u.ei);
      rows[u.ei][d] = null;
      if (c < bestC) {
        bestC = c;
        best = d;
      }
    }
    setOff(u.ei, best);
    u.need--;
  }
  // dias restantes: trabalho
  for (let ei = 0; ei < nE; ei++) for (let d = 0; d < nD; d++) if (rows[ei][d] === null) rows[ei][d] = p.days[d].special ? "D" : "T";
  faixa = faixaDias(p, offEq);

  const movable = (ei: number, d: number) => p.employees[ei].fixed[d] === null && !p.days[d].closed && !pinned.has(ei * nD + d);

  // 3a) descanso entre jornadas: põe uma folga num dos dois dias de cada par com descanso curto
  //     (move uma folga da mesma semana ou troca com alguém), sem passar dos dias seguidos nem dos limites
  const consertaDescanso = () => {
    restBase = null;
    for (let ei = 0; ei < nE; ei++) {
      const dc = p.employees[ei].descansoCurto;
      if (!dc) continue;
      for (let guard = 0; curtos(ei) > 0 && guard < 40; guard++) {
        const antes = curtos(ei);
        let best: { from: number; to: number; ej: number; c: number } | null = null;
        for (let d = 1; d < nD; d++) {
          if (dc[d] == null || !isWork(rows[ei][d - 1]) || !isWork(rows[ei][d])) continue;
          for (const to of [d - 1, d]) {
            if (!movable(ei, to)) continue;
            const w = p.days[to].week;
            for (let f = w * 7; f < w * 7 + 7 && f < nD; f++) {
              if (rows[ei][f] !== "F" || !movable(ei, f)) continue;
              // a) mover a própria folga
              setOn(ei, f);
              if (canOff(to)) {
                setOff(ei, to);
                if (maxRun(rows[ei]).len <= p.maxConsec && curtos(ei) < antes && podeFolgar(ei, to)) {
                  const c = offCost(ei, to);
                  if (!best || c < best.c) best = { from: f, to, ej: -1, c };
                }
                setOn(ei, to);
              }
              setOff(ei, f);
              // b) trocar com alguém que folga em "to" e trabalha em f (contagens do dia não mudam)
              for (let ej = 0; ej < nE; ej++) {
                if (ej === ei || rows[ej][to] !== "F" || !movable(ej, to) || !isWork(rows[ej][f]) || !movable(ej, f)) continue;
                const ejAntes = curtos(ej);
                setOn(ei, f);
                setOff(ei, to);
                setOn(ej, to);
                setOff(ej, f);
                const ok = maxRun(rows[ei]).len <= p.maxConsec && maxRun(rows[ej]).len <= p.maxConsec && curtos(ei) < antes && curtos(ej) <= ejAntes && podeFolgar(ei, to) && podeFolgar(ej, f);
                const c = ok ? offCost(ei, to) + offCost(ej, f) + 5 : 0;
                setOn(ej, f);
                setOff(ej, to);
                setOn(ei, to);
                setOff(ei, f);
                if (ok && (!best || c < best.c)) best = { from: f, to, ej, c };
              }
            }
          }
        }
        if (!best) break;
        setOn(ei, best.from);
        setOff(ei, best.to);
        if (best.ej >= 0) {
          setOn(best.ej, best.to);
          setOff(best.ej, best.from);
        }
      }
    }
    restBase = p.employees.map((_, ei) => curtos(ei));
  };
  consertaDescanso();

  // 3b) reparo de limites diários (máximo de folgas / mínimo de pessoas): move folgas para dias com folga de capacidade
  const overDay = (d: number) => {
    const day = p.days[d];
    return (day.maxOff != null && offCnt[d] > day.maxOff) || (day.minStaff != null && workCnt[d] < day.minStaff);
  };
  for (let round = 0; round < 3; round++) {
    let changed = false;
    for (let d = 0; d < nD; d++) {
      let safety = 0;
      while (overDay(d) && safety++ < nE) {
        const w = p.days[d].week;
        let best: { ei: number; d2: number; c: number } | null = null;
        for (let ei = 0; ei < nE; ei++) {
          if (rows[ei][d] !== "F" || !movable(ei, d)) continue;
          for (let d2 = w * 7; d2 < w * 7 + 7; d2++) {
            if (d2 === d || !isWork(rows[ei][d2]) || !movable(ei, d2) || !canOff(d2)) continue;
            setOn(ei, d);
            setOff(ei, d2);
            const ok = runOk(ei) && podeFolgar(ei, d2);
            const c = offCost(ei, d2);
            setOn(ei, d2);
            setOff(ei, d);
            if (ok && (!best || c < best.c)) best = { ei, d2, c };
          }
        }
        if (!best) break;
        setOn(best.ei, d);
        setOff(best.ei, best.d2);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // 3c) máximo de folgas por turno (regra 3b): no dia em que um turno passou do máximo, a folga de alguém desse turno
  //     vai para outro dia da semana, ou troca com a folga de alguém de outro turno (as contagens do dia não mudam)
  const consertaTurnos = () => {
    if (!p.days.some((d) => d.maxOffTurno)) return;
    for (let round = 0; round < 3; round++) {
      let changed = false;
      for (let d = 0; d < nD; d++) {
        for (let g = 0; g < nT; g++) {
          const lim = limTurno(p, d, g);
          let safety = 0;
          while (lim != null && offT[d][g] > lim && safety++ < nE) {
            const w = p.days[d].week;
            let best: { ei: number; d2: number; ej: number; c: number } | null = null;
            for (let ei = 0; ei < nE; ei++) {
              if ((p.employees[ei].turno ?? -1) !== g || rows[ei][d] !== "F" || !movable(ei, d)) continue;
              for (let d2 = w * 7; d2 < w * 7 + 7 && d2 < nD; d2++) {
                if (d2 === d || !isWork(rows[ei][d2]) || !movable(ei, d2)) continue;
                if (canOff(d2)) {
                  setOn(ei, d);
                  setOff(ei, d2);
                  const ok = runOk(ei) && podeFolgar(ei, d2);
                  const c = offCost(ei, d2);
                  setOn(ei, d2);
                  setOff(ei, d);
                  if (ok && (!best || c < best.c)) best = { ei, d2, ej: -1, c };
                }
                for (let ej = 0; ej < nE; ej++) {
                  if (ej === ei || (p.employees[ej].turno ?? -1) === g || rows[ej][d2] !== "F" || !movable(ej, d2) || !isWork(rows[ej][d]) || !movable(ej, d)) continue;
                  setOn(ei, d);
                  setOff(ei, d2);
                  setOn(ej, d2);
                  setOff(ej, d);
                  const ok = runOk(ei) && runOk(ej) && podeFolgar(ei, d2) && podeFolgar(ej, d);
                  const c = ok ? offCost(ei, d2) + offCost(ej, d) + 5 : 0;
                  setOn(ej, d);
                  setOff(ej, d2);
                  setOn(ei, d2);
                  setOff(ei, d);
                  if (ok && (!best || c < best.c)) best = { ei, d2, ej, c };
                }
              }
            }
            if (!best) break;
            setOn(best.ei, d);
            setOff(best.ei, best.d2);
            if (best.ej >= 0) {
              setOn(best.ej, best.d2);
              setOff(best.ej, d);
            }
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
  };
  consertaTurnos();

  // 4) busca local: mover folga variável dentro da semana, aceitar apenas melhora e sem violar restrições.
  //    `semSabado`: não mexe nas folgas de sábado (depois do rodízio dos sábados)
  const sabado = (d: number) => p.days[d].weekday === 6 && !p.days[d].closed;
  const buscaLocal = (semSabado = false) => {
  for (let pass = 0; pass < 40; pass++) {
    let improved = false;
    for (let ei = 0; ei < nE; ei++) {
      for (let w = 0; w < p.weeks; w++) {
        for (let d = w * 7; d < w * 7 + 7; d++) {
          if (rows[ei][d] !== "F" || !movable(ei, d) || (semSabado && sabado(d))) continue;
          // custo atual de estar de folga em d vs. trabalhar
          const gainOn = onGain(ei, d);
          let bestD = -1;
          let bestDelta = -1e-6;
          for (let d2 = w * 7; d2 < w * 7 + 7; d2++) {
            if (d2 === d || !isWork(rows[ei][d2]) || !movable(ei, d2) || (semSabado && sabado(d2))) continue;
            const day2 = p.days[d2];
            if (day2.maxOff != null && offCnt[d2] + 1 > day2.maxOff) continue;
            if (day2.minStaff != null && workCnt[d2] - 1 < day2.minStaff) continue;
            // aplica temporariamente para custo exato
            setOn(ei, d);
            const lose = offCost(ei, d2);
            const regraOk = podeFolgar(ei, d2);
            setOff(ei, d);
            if (!regraOk) continue;
            const delta = lose - gainOn;
            if (delta < bestDelta) {
              rows[ei][d] = "T";
              rows[ei][d2] = "F";
              const ok = runOk(ei);
              rows[ei][d] = "F";
              rows[ei][d2] = day2.special ? "D" : "T";
              if (ok) {
                bestDelta = delta;
                bestD = d2;
              }
            }
          }
          if (bestD >= 0) {
            setOn(ei, d);
            setOff(ei, bestD);
            improved = true;
          }
        }
      }
    }
    if (!improved) break;
  }
  };
  buscaLocal();
  // 4a) troca de folgas entre duas pessoas na mesma semana (o total de folgas de cada dia não muda, então o equilíbrio
  //     entre os dias fica): aceita quando melhora cobertura, preferências (folgas separadas, duplas) e turnos
  const trocasLivres = (semSabado = false) => {
    for (let pass = 0; pass < 4; pass++) {
      let trocou = false;
      for (let ei = 0; ei < nE; ei++) {
        for (let d = 0; d < nD; d++) {
          if (rows[ei][d] !== "F" || !movable(ei, d) || (semSabado && sabado(d))) continue;
          const w = p.days[d].week;
          let feito = false;
          for (let d2 = w * 7; d2 < w * 7 + 7 && d2 < nD && !feito; d2++) {
            if (d2 === d || !isWork(rows[ei][d2]) || !movable(ei, d2) || (semSabado && sabado(d2))) continue;
            for (let ej = 0; ej < nE && !feito; ej++) {
              if (ej === ei || rows[ej][d2] !== "F" || !movable(ej, d2) || !isWork(rows[ej][d]) || !movable(ej, d)) continue;
              const antes = onGain(ei, d) + onGain(ej, d2);
              setOn(ei, d);
              setOn(ej, d2);
              const depois = offCost(ei, d2) + offCost(ej, d);
              setOff(ei, d2);
              setOff(ej, d);
              if (depois < antes - 1e-6 && runOk(ei) && runOk(ej) && podeFolgar(ei, d2) && podeFolgar(ej, d)) {
                feito = true;
                trocou = true;
              } else {
                setOn(ei, d2);
                setOn(ej, d);
                setOff(ei, d);
                setOff(ej, d2);
              }
            }
          }
        }
      }
      if (!trocou) break;
    }
  };
  trocasLivres();

  // 4b) troca de folgas entre pessoas de turnos diferentes (o total de folgas de cada dia não muda):
  //     espalha as folgas de cada turno pelos dias da semana, sem piorar a cobertura
  if (nT > 1) {
    for (let pass = 0; pass < 6; pass++) {
      let trocou = false;
      for (let ei = 0; ei < nE; ei++) {
        const gi = p.employees[ei].turno ?? -1;
        if (gi < 0) continue;
        for (let d = 0; d < nD; d++) {
          if (rows[ei][d] !== "F" || !movable(ei, d) || offT[d][gi] < 2) continue;
          const w = p.days[d].week;
          let feito = false;
          for (let d2 = w * 7; d2 < w * 7 + 7 && d2 < nD && !feito; d2++) {
            if (d2 === d || !isWork(rows[ei][d2]) || !movable(ei, d2)) continue;
            // só vale se o turno da pessoa está mais folgado em d2 do que em d
            if (offT[d2][gi] + 1 >= offT[d][gi]) continue;
            for (let ej = 0; ej < nE && !feito; ej++) {
              const gj = p.employees[ej].turno ?? -1;
              if (ej === ei || gj < 0 || gj === gi || rows[ej][d2] !== "F" || !movable(ej, d2) || !isWork(rows[ej][d]) || !movable(ej, d)) continue;
              const antes = onGain(ei, d) + onGain(ej, d2);
              setOn(ei, d);
              setOn(ej, d2);
              const depois = offCost(ei, d2) + offCost(ej, d);
              setOff(ei, d2);
              setOff(ej, d);
              const ok = depois < antes - 1e-6 && runOk(ei) && runOk(ej) && podeFolgar(ei, d2) && podeFolgar(ej, d);
              if (ok) {
                feito = true;
                trocou = true;
              } else {
                setOn(ei, d2);
                setOn(ej, d);
                setOff(ei, d);
                setOff(ej, d2);
              }
            }
          }
        }
      }
      if (!trocou) break;
    }
  }

  // 5) reparo de dias consecutivos (respeitando limites diários)
  for (let ei = 0; ei < nE; ei++) {
    let tries = 0;
    while (!runOk(ei) && tries++ < 30) {
      const mr = maxRun(rows[ei]);
      const start = mr.end - mr.len + 1;
      let best: { from: number; to: number; c: number } | null = null;
      // mede o excesso somando todas as sequências: consertar uma sequência longa conta mesmo se houver outra
      const exc0 = excessoSeguidos(rows[ei], p.maxConsec);
      for (let target = start + 1; target < mr.end; target++) {
        if (!movable(ei, target) || !isWork(rows[ei][target]) || !canOff(target)) continue;
        const w = p.days[target].week;
        for (let d = w * 7; d < w * 7 + 7; d++) {
          if (rows[ei][d] !== "F" || !movable(ei, d)) continue;
          setOn(ei, d);
          setOff(ei, target);
          const exc = excessoSeguidos(rows[ei], p.maxConsec) + (podeFolgar(ei, target) ? 0 : 99);
          const c = offCost(ei, target) + 1000 * exc;
          setOn(ei, target);
          setOff(ei, d);
          if (exc < exc0 && (!best || c < best.c)) best = { from: d, to: target, c };
        }
      }
      if (best) {
        setOn(ei, best.from);
        setOff(ei, best.to);
        continue;
      }
      // troca com outra pessoa (mantém as contagens diárias: limites de folga e mínimos não mudam)
      let swapped = false;
      for (let target = start + 1; target < mr.end && !swapped; target++) {
        if (!movable(ei, target) || !isWork(rows[ei][target])) continue;
        const w = p.days[target].week;
        for (let d = w * 7; d < w * 7 + 7 && !swapped; d++) {
          if (rows[ei][d] !== "F" || !movable(ei, d)) continue;
          for (let ej = 0; ej < nE && !swapped; ej++) {
            if (ej === ei || rows[ej][target] !== "F" || !movable(ej, target) || !isWork(rows[ej][d]) || !movable(ej, d)) continue;
            const excEj0 = excessoSeguidos(rows[ej], p.maxConsec);
            setOn(ei, d);
            setOff(ei, target);
            setOn(ej, target);
            setOff(ej, d);
            // a troca só vale se melhora quem tinha o problema sem piorar a outra pessoa
            if (excessoSeguidos(rows[ei], p.maxConsec) < exc0 && excessoSeguidos(rows[ej], p.maxConsec) <= excEj0 && podeFolgar(ei, target) && podeFolgar(ej, d)) swapped = true;
            else {
              setOn(ej, d);
              setOff(ej, target);
              setOn(ei, target);
              setOff(ei, d);
            }
          }
        }
      }
      if (!swapped) break;
    }
  }

  // 6) reparo das regras proibitivas (Regras avançadas): muda a folga de dia na mesma semana
  //    ou troca com outra pessoa, sem quebrar limites diários, dias seguidos e as outras regras
  if (p.regras) {
    for (let round = 0; round < 4; round++) {
      let mexeu = false;
      for (let ei = 0; ei < nE; ei++) {
        for (let d = 0; d < nD; d++) {
          if (rows[ei][d] !== "F" || !movable(ei, d) || podeFolgar(ei, d)) continue;
          const w = p.days[d].week;
          let best: { d2: number; ej: number; c: number } | null = null;
          for (let d2 = w * 7; d2 < w * 7 + 7 && d2 < nD; d2++) {
            if (d2 === d || !isWork(rows[ei][d2]) || !movable(ei, d2)) continue;
            // a) mover a própria folga
            setOn(ei, d);
            if (canOff(d2)) {
              setOff(ei, d2);
              if (podeFolgar(ei, d2) && runOk(ei)) {
                const c = offCost(ei, d2);
                if (!best || c < best.c) best = { d2, ej: -1, c };
              }
              setOn(ei, d2);
            }
            setOff(ei, d);
            // b) trocar com alguém que folga em d2 e trabalha em d
            for (let ej = 0; ej < nE; ej++) {
              if (ej === ei || rows[ej][d2] !== "F" || !movable(ej, d2) || !isWork(rows[ej][d]) || !movable(ej, d)) continue;
              setOn(ei, d);
              setOff(ei, d2);
              setOn(ej, d2);
              setOff(ej, d);
              const ok = podeFolgar(ei, d2) && podeFolgar(ej, d) && runOk(ei) && runOk(ej);
              const c = ok ? offCost(ei, d2) + offCost(ej, d) + 5 : 0;
              setOn(ej, d);
              setOff(ej, d2);
              setOn(ei, d2);
              setOff(ei, d);
              if (ok && (!best || c < best.c)) best = { d2, ej, c };
            }
          }
          if (!best) continue;
          setOn(ei, d);
          setOff(ei, best.d2);
          if (best.ej >= 0) {
            setOn(best.ej, best.d2);
            setOff(best.ej, d);
          }
          mexeu = true;
        }
      }
      if (!mexeu) break;
    }
  }
  // rodízio das folgas de sábado (sempre): ninguém ganha mais um sábado de folga enquanto outra pessoa tiver menos
  // (contando o período anterior). Troca, na mesma semana, o sábado de quem tem mais pela folga de quem tem menos
  // (as contagens do dia não mudam); folga fixa, dia travado e fim de semana da regra 5b não são mexidos.
  {
    const sabs = p.days.map((d, i) => i).filter((i) => p.days[i].weekday === 6 && !p.days[i].closed);
    const eleg = p.employees.map((e, ei) => ei).filter((ei) => !p.employees[ei].plantao && sabadoLivre(p, ei, sabs));
    const base = basesSabado(p, eleg);
    const conta = (ei: number) => base[ei] + sabs.filter((s) => rows[ei][s] === "F").length;
    // primeiro só trocas que não concentram folgas num turno; se nenhuma servir, o rodízio dos sábados vem antes
    let exigeProp = true;
    /** `a` passa o sábado s para `b` e fica com uma folga de `b` na mesma semana; devolve como desfazer (ou null) */
    const passa = (a: number, b: number, s: number): (() => void) | null => {
      if (rows[a][s] !== "F" || !movable(a, s) || !isWork(rows[b][s]) || !movable(b, s)) return null;
      const w = p.days[s].week;
      for (let d = w * 7; d < w * 7 + 7 && d < nD; d++) {
        if (d === s || rows[b][d] !== "F" || !movable(b, d) || !isWork(rows[a][d]) || !movable(a, d)) continue;
        const propAntes = nT > 1 ? excessoTurnos(p.turnos!, offT[s]) + excessoTurnos(p.turnos!, offT[d]) : 0;
        setOn(a, s);
        setOff(a, d);
        setOn(b, d);
        setOff(b, s);
        const desfaz = () => {
          setOn(b, s);
          setOff(b, d);
          setOn(a, d);
          setOff(a, s);
        };
        // a troca não pode concentrar folgas num turno (divisão proporcional entre os turnos)
        const propOk = !exigeProp || nT < 2 || excessoTurnos(p.turnos!, offT[s]) + excessoTurnos(p.turnos!, offT[d]) <= propAntes;
        if (propOk && podeFolgar(a, d) && podeFolgar(b, s) && runOk(a) && runOk(b)) return desfaz;
        desfaz();
      }
      return null;
    };
    for (let guard = 0; guard < 300 && eleg.length > 1; guard++) {
      const cnt = new Map(eleg.map((ei) => [ei, conta(ei)]));
      const ordem = [...eleg].sort((a, b) => cnt.get(b)! - cnt.get(a)!);
      let feito = false;
      busca: for (const hi of ordem) {
        for (const lo of [...ordem].reverse()) {
          if (cnt.get(hi)! - cnt.get(lo)! <= 1) break;
          for (const s of sabs) if (passa(hi, lo, s)) {
            feito = true;
            break busca;
          }
          // em cadeia: hi passa o sábado dele para alguém, que passa um sábado dele (de outra semana) para lo
          for (const mid of eleg) {
            if (mid === hi || mid === lo) continue;
            for (const s of sabs) {
              const volta = passa(hi, mid, s);
              if (!volta) continue;
              for (const s2 of sabs) if (s2 !== s && passa(mid, lo, s2)) {
                feito = true;
                break busca;
              }
              volta();
            }
          }
        }
      }
      if (!feito) {
        if (!exigeProp) break;
        exigeProp = false;
      } else exigeProp = true;
    }
  }
  // divisão proporcional das folgas entre os turnos: num dia em que um turno (abertura, fechamento…) ficou com mais
  // folgas que a parte dele, troca, na mesma semana, a folga de alguém desse turno com a de alguém de um turno que
  // ficou abaixo da parte dele. Só aceita se o custo total da escala cair (cobertura, regras e turnos juntos) e sem
  // mexer no rodízio dos sábados (ninguém fica com 2 sábados a mais que outro).
  if (nT > 1) {
    const sabsP = p.days.map((d, i) => i).filter((i) => p.days[i].weekday === 6 && !p.days[i].closed);
    const elegP = p.employees.map((e, ei) => ei).filter((ei) => !p.employees[ei].plantao && sabadoLivre(p, ei, sabsP));
    const baseP = basesSabado(p, elegP);
    const sabsDe = (ei: number) => baseP[ei] + sabsP.filter((x) => rows[ei][x] === "F").length;
    const sabsOk = () => {
      const cs = elegP.map(sabsDe);
      return !cs.length || Math.max(...cs) - Math.min(...cs) <= 1;
    };
    const sabsOkAntes = sabsOk();
    let obj = evaluate(p, rows as Code[][]).obj;
    for (let pass = 0; pass < 4; pass++) {
      let trocou = false;
      for (let d = 0; d < nD; d++) {
        if (p.days[d].closed || excessoTurnos(p.turnos!, offT[d]) === 0) continue;
        const w = p.days[d].week;
        for (let ei = 0; ei < nE; ei++) {
          const gi = p.employees[ei].turno ?? -1;
          if (gi < 0 || rows[ei][d] !== "F" || !movable(ei, d)) continue;
          if (deltaExcesso(p.turnos!, offT[d], gi, -1) >= 0) continue; // tirar esta folga não ajuda o dia
          let feito = false;
          for (let ej = 0; ej < nE && !feito; ej++) {
            const gj = p.employees[ej].turno ?? -1;
            if (ej === ei || gj < 0 || gj === gi || !isWork(rows[ej][d]) || !movable(ej, d)) continue;
            for (let d2 = w * 7; d2 < w * 7 + 7 && d2 < nD && !feito; d2++) {
              if (d2 === d || rows[ej][d2] !== "F" || !movable(ej, d2) || !isWork(rows[ei][d2]) || !movable(ei, d2)) continue;
              setOn(ei, d);
              setOff(ei, d2);
              setOn(ej, d2);
              setOff(ej, d);
              const novo = evaluate(p, rows as Code[][]).obj;
              const ok = novo < obj - 1e-6 && runOk(ei) && runOk(ej) && podeFolgar(ei, d2) && podeFolgar(ej, d) && (!sabsOkAntes || sabsOk());
              if (ok) {
                obj = novo;
                feito = true;
                trocou = true;
              } else {
                setOn(ej, d);
                setOff(ej, d2);
                setOn(ei, d2);
                setOff(ei, d);
              }
            }
          }
        }
      }
      if (!trocou) break;
    }
  }
  // o reparo de dias seguidos e o das regras não olham o descanso: confere de novo no fim
  consertaDescanso();
  // os reparos acima mexem nas folgas sem olhar o equilíbrio entre os dias: equilibra de novo (sábados ficam como estão)
  buscaLocal(true);
  trocasLivres(true);
  consertaTurnos();

  const finalRows = rows as Code[][];
  const violations = validate(p, finalRows);
  const ev = evaluate(p, finalRows);
  const bloqueiam = violations.filter(impede);
  const descansoAvisos = violations.filter((v) => !impede(v)).map((v) => v.message);
  const explanations = bloqueiam.length ? explainInfeasibility(p) : [];
  return {
    ok: bloqueiam.length === 0,
    engine: "Motor local (heurística + busca local)",
    rows: finalRows,
    violations: bloqueiam,
    descansoAvisos,
    explanations,
    ceilingIssues: coverageCeiling(p),
    objective: ev.obj,
    deficitSlots: ev.deficit,
    ms: Date.now() - t0,
  };
}

/** Tenta algumas sementes e devolve a melhor solução válida. */
export function solveBest(p: SolveProblem, tries = 4): SolveResult {
  let best: SolveResult | null = null;
  for (let s = 1; s <= tries; s++) {
    const r = solveHeuristic(p, s);
    if (!best || (r.ok && !best.ok) || (r.ok === best.ok && r.objective < best.objective)) best = r;
  }
  return best!;
}

/** Aplica o resultado na escala do setor, preservando bloqueios e células fora do período. */
export function applyResult(sector: Sector, p: SolveProblem, rows: Code[][]): Sector {
  const schedule: Record<string, Record<string, Cell>> = { ...sector.schedule };
  p.employees.forEach((e, ei) => {
    const row = { ...(schedule[e.id] ?? {}) };
    p.days.forEach((d, di) => {
      const prev = row[d.date];
      // mantém a marca de fixado, o turno do dia (e se foi troca automática) e o almoço do dia (horário, duração, escolhido à mão)
      row[d.date] = {
        c: rows[ei][di],
        ...(prev?.lock ? { lock: true } : {}),
        ...(prev?.shiftId ? { shiftId: prev.shiftId } : {}),
        ...(prev?.shiftId && prev.auto ? { auto: true } : {}),
        ...(prev?.brk ? { brk: prev.brk } : {}),
        ...(prev?.brkMin ? { brkMin: prev.brkMin } : {}),
        ...(prev?.brkFix ? { brkFix: true } : {}),
      };
    });
    schedule[e.id] = row;
  });
  return { ...sector, schedule };
}

/** Preenche dias ainda sem escala (ex.: período ampliado) mantendo o que já existe. */
export function fillMissing(store: Store, sectorId: string): Sector | null {
  const sector = store.sectors.find((s) => s.id === sectorId)!;
  const emps = sectorEmployees(store, sectorId);
  if (!emps.length) return null;
  const days = buildDays(store.config);
  // meses limpos ficam em branco até "Gerar escala": não são preenchidos sozinhos
  const limpo = new Set(sector.limpo ?? []);
  const missing = emps.some((e) => days.some((d) => !limpo.has(d.date.slice(0, 7)) && !sector.schedule[e.id]?.[d.date]));
  if (!missing) return null;
  // trata o que já existe como fixo
  const tmpSector: Sector = {
    ...sector,
    schedule: Object.fromEntries(
      Object.entries(sector.schedule).map(([k, row]) => [k, Object.fromEntries(Object.entries(row).map(([dt, c]) => [dt, { ...c, lock: true }]))]),
    ),
  };
  const tmpStore: Store = { ...store, sectors: store.sectors.map((s) => (s.id === sectorId ? tmpSector : s)) };
  const p = buildProblem(tmpStore, sectorId, { keepLocks: true, days });
  const r = solveBest(p, 2);
  const out = applyResult(sector, p, r.rows);
  if (!limpo.size) return out;
  // tira de novo o que caiu nos meses em branco (só fica o que já existia lá)
  return {
    ...out,
    schedule: Object.fromEntries(Object.entries(out.schedule).map(([emp, row]) => [emp, Object.fromEntries(Object.entries(row).filter(([d]) => !limpo.has(d.slice(0, 7)) || !!sector.schedule[emp]?.[d]))])),
  };
}

/** Horas por semana de cada colaborador. */
export function weeklyMinutes(store: Store, sectorId: string, days: CalDay[]): Record<string, number[]> {
  const sector = store.sectors.find((s) => s.id === sectorId)!;
  const out: Record<string, number[]> = {};
  const weeks = Math.ceil(days.length / 7);
  for (const e of sectorEmployees(store, sectorId)) {
    const arr = new Array(weeks).fill(0);
    for (const d of days) {
      const c = cellCode(sector, e.id, d);
      if (c === "T" || c === "D") arr[d.week] += dayShift(store, sector, e, d).workMin;
    }
    out[e.id] = arr;
  }
  return out;
}

/** Apaga as células não bloqueadas do período atual; ao salvar, a escala é refeita respeitando os bloqueios. */
export function clearUnlocked(store: Store, sectorId?: string): Store {
  const dates = new Set(buildDays(store.config).map((d) => d.date));
  return {
    ...store,
    sectors: store.sectors.map((s) => sectorId && s.id !== sectorId ? s : ({
      ...s,
      schedule: Object.fromEntries(
        Object.entries(s.schedule).map(([emp, row]) => [emp, Object.fromEntries(Object.entries(row).filter(([d, c]) => !dates.has(d) || c.lock || c.c === "A" || c.c === "M" || c.c === "V"))]),
      ),
    })),
  };
}

/**
 * Fins de semana e sábados de folga de cada pessoa (sem plantão nem quem tem todos os sábados travados):
 * quantos sábados de folga, quantos fins de semana inteiros (sábado + domingo) e quantos pares domingo + segunda.
 */
export function resumoFds(p: SolveProblem, rows: (Code | null)[][]): { sabMin: number; sabMax: number; parMin: number; parMax: number; pares: number; segPares: number; desequilibrio: number } {
  const nD = p.days.length;
  const sabs = p.days.map((d, i) => i).filter((i) => p.days[i].weekday === 6 && !p.days[i].closed);
  const eleg = p.employees.map((e, ei) => ei).filter((ei) => !p.employees[ei].plantao && sabadoLivre(p, ei, sabs));
  const parDe = (ei: number) => sabs.filter((s) => s + 1 < nD && p.days[s + 1].weekday === 0 && rows[ei][s] === "F" && rows[ei][s + 1] === "F").length;
  // fins de semana inteiros: quem tem folga fixa num dia da semana só entra quando sobra folga, então fica fora da comparação
  const semFixa = eleg.filter((ei) => !(p.employees[ei].fixedOffWeekdays?.length || p.employees[ei].fixedOffWeekday != null));
  const par = semFixa.map(parDe);
  const sab = semFixa.map((ei) => sabs.filter((s) => rows[ei][s] === "F").length);
  let segPares = 0;
  for (let d = 0; d + 1 < nD; d++) if (p.days[d].weekday === 0 && p.days[d + 1].weekday === 1) segPares += eleg.filter((ei) => rows[ei][d] === "F" && rows[ei][d + 1] === "F").length;
  const mn = (a: number[]) => (a.length ? Math.min(...a) : 0);
  const mx = (a: number[]) => (a.length ? Math.max(...a) : 0);
  return { sabMin: mn(sab), sabMax: mx(sab), parMin: mn(par), parMax: mx(par), pares: eleg.map(parDe).reduce((a, b) => a + b, 0), segPares, desequilibrio: mx(sab) - mn(sab) };
}
