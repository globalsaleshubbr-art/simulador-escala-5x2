// Análise completa de um setor: cobertura, indicadores e alertas — tudo calculado a partir dos dados reais.
import type { CalDay, Code, Employee, Sector, Store } from "./types";
import { configDoSetor } from "./regrasSetor";
import { buildDays, cellCode, folgaFixaDomingo, CONTRATACAO_NOME, contratacaoDe, folgasDe, isPlantao, nomeFolgas, jornadaDe, jornadaPessoal, dayShift, employeeShift, isWorking, sectorEmployees, shiftEnd, shiftWorkMin, slotAxis, reassignmentsOn } from "./model";
import { computeCoverage, coverageTotals, type CoverageTotals, type DayCoverage } from "./coverage";
import { buildProblem, impede, validate, weeklyMinutes, type Violation } from "./solver";
import { breakIssues } from "./breaks";
import { WEEKDAY_LONG, WEEK_ORDER_MON, fmtDateBR, fmtDur, fmtTime, toMin } from "./time";

export type AlertTarget =
  | { kind: "coverage"; week: number; weekday: number; from: number; to: number }
  | { kind: "cell"; empId: string; date: string }
  | { kind: "section"; id: string };

export interface AlertRange {
  from: number; // índice de slot
  to: number; // exclusivo
  missing: number;
  weeks: number;
  firstWeek: number;
  label: string;
  /** dias (AAAA-MM-DD) em que falta gente nessa faixa */
  dates?: string[];
}

/** "15/11" ou "15/11, 22/11 e 29/11" (até 5 datas; depois "e mais N"). */
export function datasCurtas(dates: string[], max = 5): string {
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const l = dates.slice(0, max).map(dm);
  const resto = dates.length - l.length;
  if (resto > 0) return `${l.join(", ")} e mais ${resto}`;
  return l.length > 1 ? `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}` : l[0] ?? "";
}

export interface Alert {
  id: string;
  severity: "problema" | "atencao";
  title: string;
  text: string;
  ranges?: AlertRange[];
  target?: AlertTarget;
}

export interface SectorAnalysis {
  sector: Sector;
  employees: Employee[];
  days: CalDay[];
  axis: number[];
  coverage: DayCoverage[];
  totals: CoverageTotals;
  weekly: Record<string, number[]>;
  alerts: Alert[];
  violations: Violation[];
  indicators: Indicators;
}

export interface Indicators {
  people: number;
  sundayAvg: number;
  perDayAvgMonSat: number;
  perDay6x1: number;
  perDayByWeekday: number[]; // média de pessoas trabalhando por dia da semana (0..6)
  workDaysPerWeek: number;
  workDays6x1: number;
  avgWeeklyHours: number;
  coveragePct: number;
  deficitHoursWeek: number;
  peakMissing: number;
}

export function analyzeSector(store: Store, sectorId: string, opts: { days?: CalDay[]; slot?: 15 | 30 } = {}): SectorAnalysis {
  const sector = store.sectors.find((s) => s.id === sectorId)!;
  const cfg = configDoSetor(store.config, sector);
  const days = opts.days ?? buildDays(cfg);
  const slot = opts.slot ?? cfg.slot;
  const axis = slotAxis(cfg, days, slot);
  const employees = sectorEmployees(store, sectorId);
  const coverage = computeCoverage(store, sector, days, axis);
  const weeks = Math.ceil(days.length / 7);
  const totals = coverageTotals(coverage, slot, weeks);
  const weekly = weeklyMinutes(store, sectorId, days);

  // indicadores
  const workingByDay = days.map((d) => employees.filter((e) => isWorking(cellCode(sector, e.id, d))).length);
  const byWd = [0, 0, 0, 0, 0, 0, 0];
  const nWd = [0, 0, 0, 0, 0, 0, 0];
  days.forEach((d, i) => {
    if (d.closed) return;
    byWd[d.weekday] += workingByDay[i];
    nWd[d.weekday]++;
  });
  const perDayByWeekday = byWd.map((v, i) => (nWd[i] ? v / nWd[i] : 0));
  const monSat = days.filter((d) => d.weekday !== 0 && !d.closed);
  const perDayAvgMonSat = monSat.length ? monSat.reduce((a, d) => a + workingByDay[d.idx], 0) / monSat.length : 0;
  const sundays = days.filter((d) => d.weekday === 0 && !d.closed);
  const sundayAvg = sundays.length ? sundays.reduce((a, d) => a + workingByDay[d.idx], 0) / sundays.length : 0;
  const workDaysTotal = workingByDay.reduce((a, b) => a + b, 0);
  const workDaysPerWeek = workDaysTotal / weeks;
  const n = employees.length;
  const workDays6x1 = n * 6;
  // 6x1 com o mesmo padrão de domingos: jornadas restantes distribuídas de seg a sáb
  const perDay6x1 = cfg.sundayOpen ? (n * 6 - sundayAvg) / 6 : n * 6 / 6;
  let totalMin = 0;
  Object.values(weekly).forEach((arr) => arr.forEach((m) => (totalMin += m)));
  const avgWeeklyHours = n ? totalMin / n / weeks / 60 : 0;

  const indicators: Indicators = {
    people: n,
    sundayAvg,
    perDayAvgMonSat,
    perDay6x1,
    perDayByWeekday,
    workDaysPerWeek,
    workDays6x1,
    avgWeeklyHours,
    coveragePct: totals.pct,
    deficitHoursWeek: totals.deficitHoursPerWeek,
    peakMissing: totals.peakMissing,
  };

  const alerts: Alert[] = [];
  alerts.push(...coverageAlerts(sector, coverage, axis, slot, weeks));

  // restrições obrigatórias sobre a escala atual
  const p = buildProblem(store, sectorId, { keepLocks: true, days });
  const rows: Code[][] = p.employees.map((pe) => days.map((d) => cellCode(sector, pe.id, d)));
  // o descanso entre jornadas tem aviso próprio (abaixo), com todos os dias
  const violations = validate(p, rows).filter(impede);
  for (const v of violations) {
    const d = v.dayIdx != null ? days[v.dayIdx] : v.week != null ? days[v.week * 7] : null;
    alerts.push({
      id: `v-${v.kind}-${v.empId ?? ""}-${v.dayIdx ?? v.week}`,
      severity: "problema",
      title: v.kind === "folgas" ? "Folgas" : v.kind === "weeklyHours" ? "Jornada semanal" : v.kind === "consec" ? "Dias seguidos" : v.kind === "sunday" ? "Domingos" : "Limite diário",
      text: v.message,
      target: v.empId && d ? { kind: "cell", empId: v.empId, date: d.date } : d ? { kind: "cell", empId: "", date: d.date } : undefined,
    });
  }

  alerts.push(...ruleAlerts(store, sector, employees, days));
  return { sector, employees, days, axis, coverage, totals, weekly, alerts, violations, indicators };
}

function coverageAlerts(sector: Sector, coverage: DayCoverage[], axis: number[], slot: number, weeks: number): Alert[] {
  const out: Alert[] = [];
  const role = (k: number) => (k === 1 ? sector.roleSingular : sector.rolePlural);
  for (const wd of WEEK_ORDER_MON) {
    const dayCovs = coverage.filter((c) => c.day.weekday === wd && !c.day.closed);
    if (!dayCovs.length) continue;
    const nS = axis.length;
    const maxMiss = new Array(nS).fill(0);
    const weeksMiss = new Array(nS).fill(0);
    const firstWeek = new Array(nS).fill(-1);
    const datesMiss: string[][] = Array.from({ length: nS }, () => []);
    for (const c of dayCovs) {
      for (let i = 0; i < nS; i++) {
        const m = c.req[i] - c.counts[i];
        if (m > 0) {
          weeksMiss[i]++;
          datesMiss[i].push(c.day.date);
          if (m > maxMiss[i]) maxMiss[i] = m;
          if (firstWeek[i] < 0) firstWeek[i] = c.day.week;
        }
      }
    }
    const ranges: AlertRange[] = [];
    let i = 0;
    while (i < nS) {
      if (maxMiss[i] <= 0) {
        i++;
        continue;
      }
      let j = i + 1;
      while (j < nS && maxMiss[j] === maxMiss[i] && weeksMiss[j] === weeksMiss[i] && datesMiss[j].join() === datesMiss[i].join()) j++;
      const k = maxMiss[i];
      const parcial = datesMiss[i].length < dayCovs.length;
      ranges.push({
        from: i,
        to: j,
        missing: k,
        weeks: weeksMiss[i],
        firstWeek: firstWeek[i],
        dates: datesMiss[i],
        label: `${k === 1 ? "falta" : "faltam"} ${k} ${role(k)} entre ${fmtTime(axis[i])} e ${fmtTime(axis[j - 1] + slot)}${parcial ? ` em ${datasCurtas(datesMiss[i])}` : ""}`,
      });
      i = j;
    }
    if (!ranges.length) continue;
    const weeksWithIssue = dayCovs.filter((c) => c.req.some((r, x) => r > c.counts[x])).length;
    const total = dayCovs.length;
    const main = ranges.slice().sort((a, b) => b.missing * (b.to - b.from) - a.missing * (a.to - a.from))[0];
    out.push({
      id: `cov-${wd}`,
      severity: "problema",
      title: WEEKDAY_LONG[wd],
      text: `cobertura insuficiente em ${weeksWithIssue} de ${total} ${total === 1 ? "semana" : "semanas"}${weeksWithIssue < total ? ` (${datasCurtas(dayCovs.filter((c) => c.req.some((r, x) => r > c.counts[x])).map((c) => c.day.date))})` : ""}`,
      ranges,
      target: { kind: "coverage", week: main.firstWeek, weekday: wd, from: main.from, to: main.to },
    });
  }
  return out;
}

function ruleAlerts(store: Store, sector: Sector, employees: Employee[], days: CalDay[]): Alert[] {
  const cfg = configDoSetor(store.config, sector);
  const out: Alert[] = [];
  let weeklyCache: Record<string, number[]> | undefined;
  // turnos
  for (const s of sector.shifts) {
    const work = shiftWorkMin(cfg, s);
    const brk = s.breakStart ? s.breakMin : 0;
    if (work > 360 && brk < cfg.breakMinOver6h)
      out.push({
        id: `sh-brk-${s.id}`,
        severity: "problema",
        title: `Turno ${s.name}`,
        text: `jornada de ${fmtDur(work)} com intervalo de ${fmtDur(brk)}; o parâmetro configurado exige ao menos ${fmtDur(cfg.breakMinOver6h)} para jornadas acima de 6h.`,
        target: { kind: "section", id: "turnos" },
      });
    if (brk > cfg.breakMax)
      out.push({
        id: `sh-brkmax-${s.id}`,
        severity: "atencao",
        title: `Turno ${s.name}`,
        text: `intervalo de ${fmtDur(brk)} acima do máximo configurado (${fmtDur(cfg.breakMax)}). Verifique acordo/convenção.`,
        target: { kind: "section", id: "turnos" },
      });
    if (work > cfg.maxDailyMin && !s.plantao)
      out.push({
        id: `sh-day-${s.id}`,
        severity: "problema",
        title: `Turno ${s.name}`,
        text: `jornada de ${fmtDur(work)} acima do limite diário configurado (${fmtDur(cfg.maxDailyMin)}).`,
        target: { kind: "section", id: "turnos" },
      });
    if (s.breakStart) {
      // turno que passa da meia-noite: intervalo de madrugada conta como do dia seguinte
      const bs = toMin(s.breakStart) + (toMin(s.breakStart) < toMin(s.start) && shiftEnd(cfg, s) > 1440 ? 1440 : 0);
      if (bs < toMin(s.start) || bs + s.breakMin > shiftEnd(cfg, s))
        out.push({
          id: `sh-pos-${s.id}`,
          severity: "problema",
          title: `Turno ${s.name}`,
          text: `o intervalo (${s.breakStart}) está fora do horário do turno.`,
          target: { kind: "section", id: "turnos" },
        });
    }
  }
  // janelas de intervalo
  for (const s of sector.shifts) {
    if (s.breakWindow && toMin(s.breakWindow.end) <= toMin(s.breakWindow.start))
      out.push({ id: `sh-win-${s.id}`, severity: "problema", title: `Turno ${s.name}`, text: `a janela do intervalo (${s.breakWindow.start}–${s.breakWindow.end}) termina antes de começar.`, target: { kind: "section", id: "turnos" } });
  }
  for (const b of breakIssues(store, sector.id))
    out.push({ id: `brk-${b.empId}-${b.text.length}`, severity: "atencao", title: "Intervalo", text: b.text, target: { kind: "section", id: "almoco" } });
  // pessoas
  for (const e of employees) {
    const nm = e.name || e.func;
    if (!sector.shifts.some((s) => s.id === e.shiftId))
      out.push({ id: `emp-shift-${e.id}`, severity: "problema", title: nm, text: "sem turno definido.", target: { kind: "section", id: "pessoas" } });
    if (e.contractMin > cfg.weeklyMaxMin)
      out.push({
        id: `emp-contract-${e.id}`,
        severity: "atencao",
        title: nm,
        text: `jornada contratual de ${fmtDur(e.contractMin)} acima do limite semanal configurado (${fmtDur(cfg.weeklyMaxMin)}).`,
        target: { kind: "section", id: "pessoas" },
      });
    // estagiário / jovem aprendiz: horas por dia e por semana do contrato
    // horas reais por dia de quem tem jornada própria, contratação especial ou modelo diferente do da loja
    const proprio = !isPlantao(e) && (jornadaPessoal(e, cfg) != null || contratacaoDe(e) !== "clt" || folgasDe(store, e) !== cfg.folgasPorSemana);
    const jp = proprio ? employeeShift(store, sector, e, false).workMin : null;
    if (jp != null && jp > 0) {
      const jc = jornadaDe(cfg, e);
      const tipo = jc ? `na jornada “${jc.nome}”` : contratacaoDe(e) !== "clt" ? CONTRATACAO_NOME[contratacaoDe(e)].toLowerCase() : `no ${nomeFolgas(folgasDe(store, e))}`;
      if (contratacaoDe(e) === "estagio" && jp > 360)
        out.push({ id: `emp-est-dia-${e.id}`, severity: "problema", title: nm, text: `estagiário com ${fmtDur(jp)} por dia; a Lei do Estágio (11.788/2008) permite até 6h por dia (8h só em períodos sem aula, se previsto no curso e no termo de compromisso).`, target: { kind: "section", id: "pessoas" } });
      if (contratacaoDe(e) === "aprendiz" && jp > 360)
        out.push({ id: `emp-apr-dia-${e.id}`, severity: "atencao", title: nm, text: `jovem aprendiz com ${fmtDur(jp)} por dia; o limite é 6h, ou até 8h para quem já concluiu o ensino fundamental, contando as horas de aprendizagem teórica.`, target: { kind: "section", id: "pessoas" } });
      const sem = (weeklyCache ??= weeklyMinutes(store, sector.id, days))[e.id] ?? [];
      const acima = sem.map((m, w) => ({ m, w })).filter((x) => x.m > e.contractMin);
      if (acima.length)
        out.push({
          id: `emp-jp-sem-${e.id}`,
          severity: "problema",
          title: nm,
          text: `${tipo} com ${acima.map((x) => `${fmtDur(x.m)} na semana ${x.w + 1}`).join(", ")}, acima das ${fmtDur(e.contractMin)} por semana do contrato. Dê mais folgas na semana ou diminua as horas por dia.`,
          target: { kind: "section", id: "pessoas" },
        });
    }
    // rodízio dominical vs. parâmetro de referência (o 12x36 segue o próprio revezamento)
    if (cfg.sundayOpen && e.sundayCycle > 0 && e.regime !== "12x36") {
      const limit = e.sex === "F" ? cfg.sundayMaxCycleF : cfg.sundayMaxCycleM;
      if (e.sundayCycle > limit)
        out.push({
          id: `emp-sun-${e.id}`,
          severity: "atencao",
          title: nm,
          text: `regime de folga 1 domingo a cada ${e.sundayCycle} excede o parâmetro de referência configurado (1 a cada ${limit}). Confirme na legislação e na convenção coletiva aplicável.`,
          target: { kind: "section", id: "pessoas" },
        });
      const sundays = days.filter((d) => d.weekday === 0 && !d.closed);
      let run = 0;
      for (const d of sundays) {
        run = isWorking(cellCode(sector, e.id, d)) ? run + 1 : 0;
        if (run === limit) {
          out.push({
            id: `emp-sunrun-${e.id}`,
            severity: "problema",
            title: nm,
            text: `trabalha ${run} domingos seguidos até ${fmtDateBR(d.date, false)} (referência: folga ao menos 1 a cada ${limit}).`,
            target: { kind: "cell", empId: e.id, date: d.date },
          });
          break;
        }
      }
    }
    // interjornada
    for (let i = 0; i + 1 < days.length; i++) {
      const a = days[i];
      const b = days[i + 1];
      if (!isWorking(cellCode(sector, e.id, a)) || !isWorking(cellCode(sector, e.id, b))) continue;
      const sa = dayShift(store, sector, e, a);
      const sb = dayShift(store, sector, e, b);
      const rest = 1440 - sa.end + sb.start;
      if (rest < cfg.minRestMin) {
        out.push({
          id: `emp-rest-${e.id}`,
          severity: "problema",
          title: nm,
          text: `descanso de ${fmtDur(rest)} entre ${fmtDateBR(a.date, false)} e ${fmtDateBR(b.date, false)}, abaixo do mínimo de ${fmtDur(cfg.minRestMin)}.`,
          target: { kind: "cell", empId: e.id, date: b.date },
        });
        break;
      }
    }
  }
  // remanejamentos sobrepostos (dupla alocação) envolvendo este setor
  const rs = store.reassignments;
  for (let i = 0; i < rs.length; i++)
    for (let j = i + 1; j < rs.length; j++) {
      const A = rs[i];
      const B = rs[j];
      if (A.employeeId !== B.employeeId) continue;
      const e = store.employees.find((x) => x.id === A.employeeId);
      if (!e || (e.sectorId !== sector.id && A.toSectorId !== sector.id && B.toSectorId !== sector.id)) continue;
      const sameDay = A.date && B.date ? A.date === B.date : A.date ? B.weekdays.length > 0 : B.date ? A.weekdays.length > 0 : A.weekdays.some((w) => B.weekdays.includes(w));
      if (sameDay && toMin(A.start) < toMin(B.end) && toMin(B.start) < toMin(A.end))
        out.push({
          id: `re-dup-${A.id}-${B.id}`,
          severity: "problema",
          title: e.name || e.func,
          text: `dois remanejamentos no mesmo horário (${A.start}–${A.end} e ${B.start}–${B.end}). A pessoa só é contada no primeiro.`,
          target: { kind: "section", id: "coringas" },
        });
    }
  // remanejamentos que chegam neste setor
  for (const r of store.reassignments.filter((x) => x.toSectorId === sector.id)) {
    const e = store.employees.find((x) => x.id === r.employeeId);
    if (!e) continue;
    if (e.sectorId !== sector.id && !e.quals.includes(sector.id))
      out.push({
        id: `re-qual-${r.id}`,
        severity: "atencao",
        title: e.name || e.func,
        text: `remanejado(a) para ${sector.name} sem habilitação cadastrada para este setor.`,
        target: { kind: "section", id: "coringas" },
      });
    // em dias de trabalho, verifica se o horário cai no turno
    const d = days.find((x) => (r.date ? x.date === r.date : r.weekdays.includes(x.weekday)) && !x.closed);
    if (d) {
      const sh = dayShift(store, undefined, e, d);
      if (toMin(r.start) < sh.start || toMin(r.end) > sh.end)
        out.push({
          id: `re-shift-${r.id}`,
          severity: "atencao",
          title: e.name || e.func,
          text: `remanejamento ${r.start}–${r.end} fora do turno da pessoa (${fmtTime(sh.start)}–${fmtTime(sh.end)}); só conta enquanto ela está trabalhando.`,
          target: { kind: "section", id: "coringas" },
        });
    }
  }
  void reassignmentsOn;
  // regras avançadas: avisos
  const rg = cfg.regras;
  if (rg?.maxExtrasSemanaMin != null) {
    const sem = (weeklyCache ??= weeklyMinutes(store, sector.id, days));
    for (const e of employees) {
      if (isPlantao(e) || !e.contractMin) continue;
      const acima = (sem[e.id] ?? []).map((m, w) => ({ w, extra: m - e.contractMin })).filter((x) => x.extra > (rg.maxExtrasSemanaMin as number));
      if (acima.length)
        out.push({
          id: `re-extras-${e.id}`,
          severity: "atencao",
          title: e.name || e.func,
          text: `horas extras acima do limite (${fmtDur(rg.maxExtrasSemanaMin)} por semana): ${acima.map((x) => `${fmtDur(x.extra)} na semana ${x.w + 1}`).join(", ")}.`,
          target: { kind: "section", id: "pessoas" },
        });
    }
  }
  if (rg?.domingosIguais && cfg.sundayOpen) {
    const doms = days.filter((d) => d.weekday === 0 && !d.closed);
    const cont = employees.filter((e) => !isPlantao(e) && e.sundayCycle > 0 && !folgaFixaDomingo(e)).map((e) => ({ e, n: doms.filter((d) => { const c = cellCode(sector, e.id, d); return c === "D" || c === "T"; }).length }));
    if (cont.length > 1) {
      const max = Math.max(...cont.map((x) => x.n));
      const min = Math.min(...cont.map((x) => x.n));
      if (max - min > 1)
        out.push({
          id: `re-domingos`,
          severity: "atencao",
          title: "Domingos",
          text: `domingos trabalhados desiguais no período: ${cont.filter((x) => x.n === max).map((x) => x.e.name || x.e.func).slice(0, 3).join(", ")} com ${max}; ${cont.filter((x) => x.n === min).map((x) => x.e.name || x.e.func).slice(0, 3).join(", ")} com ${min}. Ajuste os times em Equipe ou gere a escala de novo.`,
          target: { kind: "section", id: "pessoas" },
        });
    }
  }
  if (rg?.pessoaChave) {
    const n = employees.filter((e) => e.chave).length;
    const min = Math.max(1, rg.pessoaChave.min);
    if (n <= min)
      out.push({
        id: `re-chave`,
        severity: "atencao",
        title: "Pessoas-chave",
        text: n === 0 ? `nenhuma pessoa-chave marcada em ${sector.name} (marque em Equipe → mais detalhes).` : `só ${n} ${n === 1 ? "pessoa-chave" : "pessoas-chave"} em ${sector.name}: nos dias de folga dela${n === 1 ? "" : "s"} fica abaixo do mínimo de ${min}. Marque mais alguém em Equipe → mais detalhes.`,
        target: { kind: "section", id: "pessoas" },
      });
  }
  return out;
}

/** Resumo rápido de um setor para abas e consolidação (sem alertas detalhados). */
export function quickSectorSummary(store: Store, sectorId: string) {
  const a = analyzeSector(store, sectorId);
  return {
    people: a.employees.length,
    coveragePct: a.totals.pct,
    deficitHoursWeek: a.totals.deficitHoursPerWeek,
    problems: a.alerts.filter((x) => x.severity === "problema").length,
    hasRules: a.sector.minRules.length > 0,
  };
}

const cache = new WeakMap<Sector, { cfg: unknown; emps: unknown; re: unknown; as: unknown; secs: unknown; res: SectorAnalysis }>();
/** Versão com cache por identidade dos dados (edições em um setor não recalculam os outros). */
export function analyzeSectorCached(store: Store, sectorId: string): SectorAnalysis {
  const sector = store.sectors.find((s) => s.id === sectorId)!;
  const hit = cache.get(sector);
  // remanejamentos ligam setores; a lista de setores entra na chave só quando há remanejamentos
  const secsKey = store.reassignments.length ? store.sectors : null;
  if (hit && hit.cfg === store.config && hit.emps === store.employees && hit.re === store.reassignments && hit.as === store.assignments && hit.secs === secsKey) return hit.res;
  const res = analyzeSector(store, sectorId);
  cache.set(sector, { cfg: store.config, emps: store.employees, re: store.reassignments, as: store.assignments, secs: secsKey, res });
  return res;
}
