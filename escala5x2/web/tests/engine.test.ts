// Testes obrigatórios do motor (seção 16 da especificação).
import { describe, expect, it } from "vitest";
import { demoStore, eightOperatorsExample, newEmployee, cloneStore } from "../src/engine/seed";
import { analyzeSector } from "../src/engine/analysis";
import { applyResult, buildProblem, fillMissing, solveBest, validate, evaluate, coverageCeiling, explainInfeasibility } from "../src/engine/solver";
import { buildDays, cellCode, isWorking, shiftEnd, slotAxis } from "../src/engine/model";
import { computeCoverage, daySlotStates } from "../src/engine/coverage";
import { encodeSchedule, decodeSchedule } from "../src/storage/storage";
import { compareScenarios, DEFAULT_SCENARIOS } from "../src/engine/scenarios";
import { toMin } from "../src/engine/time";
import type { Store } from "../src/engine/types";

const START = "2026-10-25"; // domingo

function filled(store: Store): Store {
  let st = store;
  for (const sec of st.sectors) {
    const f = fillMissing(st, sec.id);
    if (f) st = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? f : s)) };
  }
  return st;
}
const caixaId = (s: Store) => s.sectors.find((x) => x.name === "Frente de Caixa")!.id;
const sec = (s: Store, id: string) => s.sectors.find((x) => x.id === id)!;
function redistribute(st: Store, sid: string) {
  const p = buildProblem(st, sid, { keepLocks: true });
  const r = solveBest(p, 3);
  return { store: { ...st, sectors: st.sectors.map((s) => (s.id === sid ? applyResult(s, p, r.rows) : s)) }, r, p };
}

describe("demonstração", () => {
  it("cria uma loja com 60 colaboradores em frente de caixa, açougue, padaria, hortifruti e reposição", () => {
    const st = demoStore({ start: START });
    expect(st.employees.length).toBe(60);
    const names = new Set(st.employees.map((e) => sec(st, e.sectorId).name));
    for (const n of ["Frente de Caixa", "Açougue", "Padaria", "Hortifruti", "Reposição"]) expect(names.has(n)).toBe(true);
  });
  it("gera escalas válidas para todos os setores", () => {
    const st = filled(demoStore({ start: START }));
    for (const s of st.sectors) {
      if (!st.employees.some((e) => e.sectorId === s.id)) continue;
      const p = buildProblem(st, s.id, { keepLocks: true });
      const rows = p.employees.map((pe) => buildDays(st.config).map((d) => cellCode(s, pe.id, d)));
      expect(validate(p, rows)).toEqual([]);
    }
  });
});

describe("testes obrigatórios", () => {
  const base = filled(demoStore({ start: START }));
  const cx = caixaId(base);

  it("alterar a jornada modifica os horários e os totais corretamente", () => {
    const a1 = analyzeSector(base, cx);
    const st2: Store = { ...base, config: { ...base.config, dailyMin: 480 } };
    const a2 = analyzeSector(st2, cx);
    const sh = sec(base, cx).shifts.find((s) => s.name === "Abertura")!;
    expect(shiftEnd(base.config, sh) - shiftEnd(st2.config, sh)).toBe(24); // 18:39 -> 18:15
    expect(shiftEnd(base.config, sh)).toBe(toMin("18:39"));
    // cada dia normal trabalhado perde 24 min
    const e = a1.employees[0];
    const days = a1.days.filter((d) => d.week === 0 && !d.special && isWorking(cellCode(sec(base, cx), e.id, d))).length;
    expect(a1.weekly[e.id][0] - a2.weekly[e.id][0]).toBe(days * 24);
  });

  it("adicionar um funcionário aumenta a capacidade real de cobertura", () => {
    const a1 = analyzeSector(base, cx);
    const ne = newEmployee(sec(base, cx), 99);
    const st2 = filled({ ...base, employees: [...base.employees, ne] });
    const a2 = analyzeSector(st2, cx);
    const sum = (a: typeof a1) => a.coverage.reduce((x, c) => x + c.counts.reduce((y, n) => y + n, 0), 0);
    expect(sum(a2)).toBeGreaterThan(sum(a1));
    expect(a2.totals.metSlots).toBeGreaterThanOrEqual(a1.totals.metSlots);
    expect(a2.employees.length).toBe(a1.employees.length + 1);
  });

  it("excluir uma pessoa atualiza calendário e déficits", () => {
    const a1 = analyzeSector(base, cx);
    const gone = a1.employees[0].id;
    const st2: Store = { ...base, employees: base.employees.filter((e) => e.id !== gone), assignments: base.assignments.filter((a) => a.employeeId !== gone) };
    const a2 = analyzeSector(st2, cx);
    expect(a2.employees.find((e) => e.id === gone)).toBeUndefined();
    expect(a2.totals.deficitSlots).toBeGreaterThanOrEqual(a1.totals.deficitSlots);
    expect(a2.indicators.workDaysPerWeek).toBeLessThan(a1.indicators.workDaysPerWeek);
  });

  it("alterar uma folga modifica a cobertura daquele dia", () => {
    const s = sec(base, cx);
    const a1 = analyzeSector(base, cx);
    const day = a1.days.find((d) => d.weekday === 3)!;
    const emp = a1.employees.find((e) => cellCode(s, e.id, day) === "T")!;
    const st2: Store = { ...base, sectors: base.sectors.map((x) => (x.id === cx ? { ...x, schedule: { ...x.schedule, [emp.id]: { ...x.schedule[emp.id], [day.date]: { c: "F", lock: true } } } } : x)) };
    const a2 = analyzeSector(st2, cx);
    const before = a1.coverage[day.idx].counts.reduce((a, b) => a + b, 0);
    const after = a2.coverage[day.idx].counts.reduce((a, b) => a + b, 0);
    expect(after).toBeLessThan(before);
    // outros dias não mudam
    expect(a2.coverage[day.idx + 1].counts).toEqual(a1.coverage[day.idx + 1].counts);
  });

  it("mudar o intervalo altera corretamente a disponibilidade horária", () => {
    const s = sec(base, cx);
    const sh = s.shifts.find((x) => x.name === "Abertura")!;
    const a1 = analyzeSector(base, cx);
    const st2: Store = { ...base, sectors: base.sectors.map((x) => (x.id === cx ? { ...x, shifts: x.shifts.map((y) => (y.id === sh.id ? { ...y, breakStart: "13:00" } : y)) } : x)) };
    const a2 = analyzeSector(st2, cx);
    const day = a1.days.find((d) => d.weekday === 2)!;
    const opening = a1.employees.filter((e) => e.shiftId === sh.id && isWorking(cellCode(s, e.id, day))).length;
    const i1030 = a1.axis.indexOf(toMin("10:30"));
    const i1300 = a1.axis.indexOf(toMin("13:00"));
    expect(a2.coverage[day.idx].counts[i1030] - a1.coverage[day.idx].counts[i1030]).toBe(opening);
    expect(a1.coverage[day.idx].counts[i1300] - a2.coverage[day.idx].counts[i1300]).toBe(opening);
  });

  it("alterar o mínimo exigido transforma células verdes em vermelhas", () => {
    const a1 = analyzeSector(base, cx);
    const rule = sec(base, cx).minRules.find((r) => r.start === "12:00" && r.days.length === 5)!;
    const st2: Store = { ...base, sectors: base.sectors.map((x) => (x.id === cx ? { ...x, minRules: x.minRules.map((r) => (r.id === rule.id ? { ...r, min: 12, ideal: null } : r)) } : x)) };
    const a2 = analyzeSector(st2, cx);
    const red = (a: typeof a1) => a.coverage.reduce((n, c) => n + c.status.filter((s) => s === "red").length, 0);
    expect(red(a2)).toBeGreaterThan(red(a1));
    const turned = a1.coverage.some((c, di) => c.status.some((s, i) => (s === "green" || s === "light") && a2.coverage[di].status[i] === "red"));
    expect(turned).toBe(true);
  });

  it("redistribuir folgas mantém as restrições obrigatórias e as edições bloqueadas", () => {
    const s = sec(base, cx);
    const a1 = analyzeSector(base, cx);
    const day = a1.days.find((d) => d.weekday === 6)!; // sábado forte
    const emp = a1.employees.find((e) => cellCode(s, e.id, day) === "T")!;
    const locked: Store = { ...base, sectors: base.sectors.map((x) => (x.id === cx ? { ...x, schedule: { ...x.schedule, [emp.id]: { ...x.schedule[emp.id], [day.date]: { c: "F", lock: true } } } } : x)) };
    const { store: out, r, p } = redistribute(locked, cx);
    expect(r.ok).toBe(true);
    expect(validate(p, r.rows)).toEqual([]);
    expect(sec(out, cx).schedule[emp.id][day.date]).toEqual({ c: "F", lock: true });
    // a pessoa continua com exatamente 2 folgas nessa semana
    const wk = a1.days.filter((d) => d.week === day.week);
    expect(wk.filter((d) => cellCode(sec(out, cx), emp.id, d) === "F").length).toBe(2);
  });

  it("os domingos são tratados segundo os parâmetros configurados", () => {
    const s = sec(base, cx);
    const a = analyzeSector(base, cx);
    const sundays = a.days.filter((d) => d.weekday === 0);
    // ciclo 2 com deslocamento fixo: folga em domingos alternados
    const e2 = a.employees.find((e) => e.sundayCycle === 2 && e.sundayOffset > 0)!;
    const pattern = sundays.map((d) => cellCode(s, e2.id, d));
    for (let i = 1; i < pattern.length; i++) expect(pattern[i]).not.toBe(pattern[i - 1]);
    // quem não trabalha domingo
    const never = a.employees.find((e) => e.sundayCycle === 0)!;
    expect(sundays.every((d) => cellCode(s, never.id, d) === "F")).toBe(true);
    // domingo trabalhado = jornada específica (4h): 4 dias x 8h24 + 4h = 37h36
    const wk = a.days.filter((d) => d.week === 0);
    const worksSunday = a.employees.find((e) => cellCode(s, e.id, wk[0]) === "D")!;
    expect(a.weekly[worksSunday.id][0]).toBe(4 * 504 + 240);
    // loja fechada no domingo: todos de folga no domingo
    const closed: Store = { ...base, config: { ...base.config, sundayOpen: false } };
    const { store: out, r } = redistribute(closed, cx);
    expect(r.ok).toBe(true);
    const ac = analyzeSector(out, cx);
    expect(ac.days.filter((d) => d.weekday === 0).every((d) => ac.employees.every((e) => cellCode(sec(out, cx), e.id, d) === "F"))).toBe(true);
  });

  it("não há dupla alocação no mesmo horário", () => {
    const fiscalSec = base.sectors.find((x) => x.name === "Fiscais de Caixa")!;
    const fiscal = base.employees.find((e) => e.sectorId === fiscalSec.id)!;
    // dois remanejamentos sobrepostos para setores diferentes
    const st2: Store = {
      ...base,
      reassignments: [
        { id: "r1", employeeId: fiscal.id, toSectorId: cx, date: null, weekdays: [1, 2, 3, 4, 5, 6], start: "10:00", end: "12:00", post: "Caixa 19", note: "" },
        { id: "r2", employeeId: fiscal.id, toSectorId: base.sectors.find((x) => x.name === "Reposição")!.id, date: null, weekdays: [1, 2, 3, 4, 5, 6], start: "11:00", end: "13:00", post: "", note: "" },
      ],
    };
    const days = buildDays(st2.config);
    const axis = slotAxis(st2.config, days);
    const covs = st2.sectors.map((s) => computeCoverage(st2, s, days, axis));
    // em cada slot, a soma das coberturas de todos os setores nunca passa do número de pessoas trabalhando no posto
    for (let di = 0; di < days.length; di++) {
      for (let i = 0; i < axis.length; i++) {
        const total = covs.reduce((a, c) => a + c[di].counts[i], 0);
        const people = st2.employees.filter((e) => {
          const st = daySlotStates(st2, e, days[di], [axis[i]])[0];
          return st.state === "working" || st.state === "out";
        }).length;
        expect(total).toBe(people);
      }
    }
    const a = analyzeSector(st2, cx);
    expect(a.alerts.some((x) => x.text.includes("dois remanejamentos no mesmo horário"))).toBe(true);
  });

  it("navegar entre semanas e mudar o período preserva os dados", () => {
    const s = sec(base, cx);
    const st8 = filled({ ...base, config: { ...base.config, weeks: 8 } });
    const st4 = { ...st8, config: { ...st8.config, weeks: 4 } };
    for (const e of analyzeSector(base, cx).employees) for (const d of buildDays(base.config)) expect(cellCode(sec(st4, cx), e.id, d)).toBe(cellCode(s, e.id, d));
    expect(Object.keys(sec(st8, cx).schedule[analyzeSector(base, cx).employees[0].id]).length).toBe(56);
  });

  it("setores diferentes mantêm escalas independentes", () => {
    const ac = base.sectors.find((x) => x.name === "Açougue")!;
    const { store: out } = redistribute(base, cx);
    expect(sec(out, ac.id).schedule).toEqual(ac.schedule);
  });

  it("informa explicitamente quando não é possível cumprir os mínimos e quando não há solução", () => {
    const rule = sec(base, cx).minRules[0];
    const impossible: Store = { ...base, sectors: base.sectors.map((x) => (x.id === cx ? { ...x, minRules: x.minRules.map((r) => (r.id === rule.id ? { ...r, min: 40 } : r)) } : x)) };
    const p = buildProblem(impossible, cx, { keepLocks: true });
    expect(coverageCeiling(p).length).toBeGreaterThan(0);
    // restrição obrigatória impossível: no máximo 1 folga por dia para 17 pessoas
    const noOff: Store = { ...base, sectors: base.sectors.map((x) => (x.id === cx ? { ...x, movement: x.movement.map((m) => ({ ...m, maxOff: 1 })) } : x)) };
    const p2 = buildProblem(noOff, cx, { keepLocks: true });
    const r2 = solveBest(p2, 2);
    expect(r2.ok).toBe(false);
    expect(r2.violations.length).toBeGreaterThan(0);
    expect(explainInfeasibility(p2).join(" ")).toMatch(/limites diários de folga/);
  });

  it("os cálculos de horas e dias disponíveis são matematicamente consistentes", () => {
    const st = filled(eightOperatorsExample(base, cx));
    const a = analyzeSector(st, cx);
    expect(a.employees.length).toBe(8);
    // 8 pessoas no 5x2 = 40 jornadas por semana; no 6x1 seriam 48
    expect(a.indicators.workDaysPerWeek).toBe(40);
    expect(a.indicators.workDays6x1).toBe(48);
    // horas = soma das jornadas dos dias trabalhados
    for (const e of a.employees) {
      for (let w = 0; w < st.config.weeks; w++) {
        const wk = a.days.filter((d) => d.week === w);
        const exp = wk.reduce((m, d) => {
          const c = cellCode(sec(st, cx), e.id, d);
          return m + (c === "T" ? 504 : c === "D" ? 240 : 0);
        }, 0);
        expect(a.weekly[e.id][w]).toBe(exp);
        expect([2520, 2256]).toContain(a.weekly[e.id][w]); // 42h ou 37h36
      }
    }
    const total = Object.values(a.weekly).flat().reduce((x, y) => x + y, 0);
    expect(a.indicators.avgWeeklyHours * 60 * 8 * st.config.weeks).toBeCloseTo(total, 6);
  });
});

describe("persistência e escala", () => {
  it("codec compacto preserva códigos e bloqueios", () => {
    const st = filled(demoStore({ start: START }));
    const s = sec(st, caixaId(st));
    const k = Object.keys(s.schedule)[0];
    s.schedule[k][START] = { c: "V", lock: true };
    expect(decodeSchedule(encodeSchedule(s.schedule))).toEqual(s.schedule);
  });

  it("rede com 1.200 colaboradores é consolidada em tempo razoável", () => {
    const base = filled(demoStore({ start: START }));
    const stores = [base, ...Array.from({ length: 19 }, (_, i) => cloneStore(base, `Loja ${i + 2}`, i + 4))];
    expect(stores.reduce((a, s) => a + s.employees.length, 0)).toBe(1200);
    const t0 = Date.now();
    let req = 0;
    for (const st of stores) for (const s of st.sectors) if (st.employees.some((e) => e.sectorId === s.id)) req += analyzeSector(st, s.id).totals.reqSlots;
    const ms = Date.now() - t0;
    expect(req).toBeGreaterThan(0);
    expect(ms).toBeLessThan(30000);
    console.log(`consolidação de 1.200 colaboradores: ${ms} ms`);
  });

  it("comparador de cenários: 6x1 oferece mais jornadas que 5x2 com a mesma equipe", async () => {
    const st = filled(demoStore({ start: START }));
    const res = await compareScenarios(st, caixaId(st), DEFAULT_SCENARIOS);
    const [s6, s40, s42] = res;
    expect(s6.workDaysWeek).toBe(17 * 6);
    expect(s40.workDaysWeek).toBe(17 * 5);
    expect(s40.dailyMin).toBe(480);
    expect(s42.dailyMin).toBe(504);
    expect(s6.dailyMin).toBe(440);
    expect(s42.hoursContract).toBeCloseTo(17 * 42, 6);
  }, 60000);

  it("evaluate e validate concordam com o motor", () => {
    const st = filled(demoStore({ start: START }));
    const p = buildProblem(st, caixaId(st), { keepLocks: true });
    const r = solveBest(p, 2);
    expect(evaluate(p, r.rows).obj).toBeCloseTo(r.objective, 6);
  });
});

import { staggerBreaks } from "../src/engine/breaks";
import { simpleDemoStore } from "../src/engine/seed";
import { employeeShift as empShift2 } from "../src/engine/model";

describe("escalonar intervalos", () => {
  it("espalha os intervalos sem mudar entrada, saída, jornada nem folgas", () => {
    const st = simpleDemoStore();
    for (const sec of st.sectors.filter((s) => st.employees.some((e) => e.sectorId === s.id))) {
      // o horário do intervalo de cada turno ("entre A e B") é a referência: os almoços ficam espaçados por igual dentro dele
      const r = staggerBreaks(st, sec.id);
      for (const e of r.store.employees.filter((x) => x.sectorId === sec.id)) {
        const old = st.employees.find((x) => x.id === e.id)!;
        const a = empShift2(st, sec, old, false);
        const b = empShift2(r.store, sec, e, false);
        expect(b.start).toBe(a.start);
        expect(b.end).toBe(a.end);
        expect(b.workMin).toBe(a.workMin);
        expect(b.breakEnd - b.breakStart).toBe(a.breakEnd - a.breakStart);
        // só quem foi movido precisa respeitar as regras de posição (o horário do turno é sempre aceito)
        if (a.breakEnd > a.breakStart && b.breakStart !== a.breakStart) {
          // dentro do horário do intervalo (o do turno ± o limite), com a duração cadastrada
          expect(Math.abs(b.breakStart - a.breakStart)).toBeLessThanOrEqual(sec.shifts.find((x) => x.id === e.shiftId)?.breakFlex ?? 60);
          expect(b.breakEnd - b.breakStart).toBe(sec.shifts.find((x) => x.id === e.shiftId)!.breakMin);
          expect(b.breakStart - b.start).toBeGreaterThanOrEqual(60);
          expect(b.end - b.breakEnd).toBeGreaterThanOrEqual(60);
        }
      }
      expect(r.store.sectors).toBe(st.sectors); // folgas intactas
    }
  });
});

describe("escalonar respeita o cadastro do turno", () => {
  it("turno com intervalo fixo não muda; limite de 30 min é respeitado", () => {
    const st = simpleDemoStore();
    const sec = st.sectors[0];
    const fixed = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? { ...s, shifts: s.shifts.map((x) => ({ ...x, breakFlex: 0 })) } : s)) };
    const r0 = staggerBreaks(fixed, sec.id);
    // horário do intervalo do tamanho do intervalo = horário fixo: ninguém muda
    expect(r0.changes.length).toBe(0);
    const half = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? { ...s, shifts: s.shifts.map((x) => ({ ...x, breakFlex: 30 })) } : s)) };
    const r1 = staggerBreaks(half, sec.id);
    for (const c of r1.changes) expect(Math.abs(toMin(c.to) - toMin(c.from))).toBeLessThanOrEqual(30);
  });
  it("intervalo fora da regra da loja não é mexido", () => {
    const st = simpleDemoStore();
    const sec = st.sectors[0];
    const bad = { ...st, config: { ...st.config, breakMax: 30 } };
    const r = staggerBreaks(bad, sec.id);
    expect(r.changes.length).toBe(0);
    expect(r.skipped.some((t) => t.includes("fora da regra"))).toBe(true);
  });
});

import { splitTeams, teamOnSunday, teamPatch } from "../src/simple/logic";
import { buildProblem as bp2, solveBest as sb2 } from "../src/engine/solver";

describe("domingos em Time A e Time B", () => {
  it("cada domingo trabalha só o time da vez, e a escala continua válida", () => {
    const st = simpleDemoStore();
    const sec = st.sectors.find((s) => st.employees.some((e) => e.sectorId === s.id))!;
    const map = splitTeams(st, sec.id);
    const st2 = { ...st, employees: st.employees.map((e) => (map[e.id] ? { ...e, ...teamPatch(map[e.id]) } : e)) };
    const p = bp2(st2, sec.id, { keepLocks: false });
    const r = sb2(p);
    expect(r.ok).toBe(true);
    p.days.forEach((d, di) => {
      if (d.weekday !== 0 || d.closed) return;
      const team = teamOnSunday(d.date);
      p.employees.forEach((e, ei) => {
        const t = map[e.id];
        if (!t) return;
        expect(r.rows[ei][di] === "D").toBe(t === team);
      });
    });
    const a = Object.values(map).filter((t) => t === "A").length;
    expect(Math.abs(a - (Object.keys(map).length - a))).toBeLessThanOrEqual(1);
  });
  it("o rodízio de domingo não é desfeito: no ciclo de 2, metade trabalha em cada domingo", () => {
    const st = simpleDemoStore();
    const sec = st.sectors.find((s) => st.employees.some((e) => e.sectorId === s.id))!;
    const st2 = { ...st, employees: st.employees.map((e) => (e.sectorId === sec.id ? { ...e, sundayCycle: 2, sundayOffset: 0 } : e)) };
    const p = bp2(st2, sec.id, { keepLocks: false });
    const r = sb2(p);
    const n = p.employees.length;
    p.days.forEach((d, di) => {
      if (d.weekday !== 0 || d.closed) return;
      const working = r.rows.filter((row) => row[di] === "D").length;
      expect(working).toBeGreaterThanOrEqual(Math.floor(n / 2) - 1);
    });
  });
});
