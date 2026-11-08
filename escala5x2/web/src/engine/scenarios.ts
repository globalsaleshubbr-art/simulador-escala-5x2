// Comparador de cenários 5x2 x 6x1: simula a mesma equipe com regras de jornada diferentes.
import type { Employee, Store } from "./types";
import { analyzeSector } from "./analysis";
import { applyResult, buildProblem, solveHeuristic } from "./solver";
import { sectorEmployees, shiftWorkMin } from "./model";
import { fmtDur, uid } from "./time";

export interface ScenarioDef {
  id: string;
  label: string;
  daysPerWeek: number; // 5 = 5x2, 6 = 6x1
  weeklyMin: number; // horas semanais contratuais (min)
}

export interface ScenarioResult {
  def: ScenarioDef;
  dailyMin: number;
  people: number;
  workDaysWeek: number;
  hoursWeek: number; // horas efetivamente escaladas por semana (após domingos de jornada reduzida)
  hoursContract: number;
  coveragePct: number;
  deficitHoursWeek: number;
  peakMissing: number;
  hires: number | null; // contratações para igualar a cobertura de referência
  hiresCapped: boolean;
  coverageWithHires: number;
  monthlyCost: number;
  monthlyCostWithHires: number;
  premises: string[];
  feasible: boolean;
}

export const DEFAULT_SCENARIOS: ScenarioDef[] = [
  { id: "s6x1", label: "6x1 · 44h", daysPerWeek: 6, weeklyMin: 44 * 60 },
  { id: "s5x2-40", label: "5x2 · 40h", daysPerWeek: 5, weeklyMin: 40 * 60 },
  { id: "s5x2-42", label: "5x2 · 42h", daysPerWeek: 5, weeklyMin: 42 * 60 },
];

/** Aplica as regras do cenário numa cópia da loja (só o setor simulado é reescalado). */
export function scenarioStore(store: Store, sectorId: string, def: ScenarioDef, extra = 0): Store {
  const dailyMin = Math.round(def.weeklyMin / def.daysPerWeek);
  const cfg = { ...store.config, folgasPorSemana: 7 - def.daysPerWeek, dailyMin, weeklyMaxMin: def.weeklyMin, weeks: Math.min(store.config.weeks, 4) };
  const sector = store.sectors.find((s) => s.id === sectorId)!;
  const shifts = sector.shifts.map((s) => (s.special ? s : { ...s, workMin: null }));
  let emps = sectorEmployees(store, sectorId).map((e) => ({ ...e, contractMin: def.weeklyMin, fixedOff: def.daysPerWeek === 6 ? null : e.fixedOff }));
  // contratações simuladas: copiam o perfil mais comum em rodízio de turnos
  const regular = shifts.filter((s) => !s.special);
  for (let i = 0; i < extra; i++) {
    const base: Employee = emps[i % Math.max(1, emps.length)] ?? ({} as Employee);
    emps = emps.concat({
      ...base,
      id: uid("sim_"),
      name: `Contratação ${i + 1}`,
      func: "Simulada",
      shiftId: regular[i % Math.max(1, regular.length)]?.id ?? base.shiftId,
      fixedOff: null,
      sundayOffset: 0,
    });
  }
  const others = store.employees.filter((e) => e.sectorId !== sectorId);
  return {
    ...store,
    config: cfg,
    sectors: store.sectors.map((s) => (s.id === sectorId ? { ...s, shifts, schedule: {} } : s)),
    employees: others.concat(emps),
  };
}

function runScenario(store: Store, sectorId: string, def: ScenarioDef, extra: number) {
  let st = scenarioStore(store, sectorId, def, extra);
  const p = buildProblem(st, sectorId, { keepLocks: false });
  const r = solveHeuristic(p, 1);
  st = { ...st, sectors: st.sectors.map((s) => (s.id === sectorId ? applyResult(s, p, r.rows) : s)) };
  const a = analyzeSector(st, sectorId);
  return { a, ok: r.ok, store: st };
}

const yieldUI = () => new Promise((r) => setTimeout(r, 0));

export async function compareScenarios(
  store: Store,
  sectorId: string,
  defs: ScenarioDef[],
  onProgress?: (msg: string) => void,
  target: "ref" | "full" = "ref",
): Promise<ScenarioResult[]> {
  const out: ScenarioResult[] = [];
  const baseRuns = [];
  for (const def of defs) {
    onProgress?.(`Simulando ${def.label}…`);
    await yieldUI();
    baseRuns.push(runScenario(store, sectorId, def, 0));
  }
  const reference = target === "full" ? 100 : baseRuns[0]?.a.totals.pct ?? 100;
  const cost = store.config.monthlyCost * (1 + store.config.chargesPct / 100);
  const sector = store.sectors.find((s) => s.id === sectorId)!;
  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const run = baseRuns[i];
    const a = run.a;
    const n = a.employees.length;
    let hires: number | null = 0;
    let covHires = a.totals.pct;
    let capped = false;
    if (n > 0 && a.totals.pct + 0.05 < reference - (target === "full" ? 0.05 : 0)) {
      hires = null;
      for (let k = 1; k <= 12; k++) {
        onProgress?.(`${def.label}: testando +${k} contratação(ões)…`);
        await yieldUI();
        const r2 = runScenario(store, sectorId, def, k);
        covHires = r2.a.totals.pct;
        if (covHires + 0.05 >= reference) {
          hires = k;
          break;
        }
      }
      if (hires === null) capped = true;
    }
    let hoursWeek = 0;
    Object.values(a.weekly).forEach((arr) => arr.forEach((m) => (hoursWeek += m)));
    hoursWeek = hoursWeek / 60 / Math.max(1, a.days.length / 7);
    const dailyMin = Math.round(def.weeklyMin / def.daysPerWeek);
    const sundayShift = sector.shifts.find((s) => s.id === sector.defaultSundayShiftId) ?? sector.shifts.find((s) => s.special);
    const premises = [
      `${def.daysPerWeek} dias de trabalho e ${7 - def.daysPerWeek} folga(s) por semana`,
      `jornada diária de ${fmtDur(dailyMin)} (${fmtDur(def.weeklyMin)} ÷ ${def.daysPerWeek} dias)`,
      `mesmos turnos de entrada e intervalos do setor; saídas recalculadas`,
      store.config.sundayOpen && sundayShift
        ? `domingo trabalhado com jornada de ${fmtDur(shiftWorkMin(store.config, sundayShift))} e o mesmo rodízio dominical de cada pessoa`
        : "loja fechada aos domingos",
      `mesmos mínimos por faixa horária e movimento por dia`,
      `custo mensal por pessoa: salário + ${store.config.chargesPct}% de encargos`,
    ];
    out.push({
      def,
      dailyMin,
      people: n,
      workDaysWeek: a.indicators.workDaysPerWeek,
      hoursWeek,
      hoursContract: (n * def.weeklyMin) / 60,
      coveragePct: a.totals.pct,
      deficitHoursWeek: a.totals.deficitHoursPerWeek,
      peakMissing: a.totals.peakMissing,
      hires,
      hiresCapped: capped,
      coverageWithHires: covHires,
      monthlyCost: n * cost,
      monthlyCostWithHires: (n + (hires ?? 12)) * cost,
      premises,
      feasible: run.ok,
    });
  }
  return out;
}
