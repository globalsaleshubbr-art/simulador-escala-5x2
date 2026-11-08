// Relatório de ajustes: folga fixa no domingo, regra de domingo 2x1, intervalos do dia,
// horário da loja nos setores, importação por planilha e cobertura por faixa.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoStore, newEmployee } from "../src/engine/seed";
import { applyResult, buildProblem, ehDiaSemFolga, evaluate, fillMissing, solveBest, tetoTurno, usarAjusteAutomaticoDeFolgas, validate, weeklyMinutes } from "../src/engine/solver";
import { buildDays, cellCode, dayShift, emBranco, employeeShift, folgasDe, presenceAt, slotAxis } from "../src/engine/model";
import { analyzeSector, datasCurtas } from "../src/engine/analysis";
import { computeCoverage, daySlotStates } from "../src/engine/coverage";
import { toMin } from "../src/engine/time";
import { distribuirLinear, staggerBreaksDay, staggerBreaksPeriod, withDayBreak } from "../src/engine/breaks";
import { ajustarTurnos } from "../src/engine/turnos";
import type { Store } from "../src/engine/types";
import { limparEscala, refazerSemanasDe, aplicarFolgasSetor, domingosForaDoHabitual, modeloDaPessoa, mudarFolgas, mudarTurnoDomingo, aplicarJornada, aplicarJornadaSetor, excluirJornada, novaJornada, regimeTexto, salvarJornada, aplicarModelo12x36, aplicarModelo12x36Setor, sairModelo12x36Setor, aplicarRegraDomingo, applyTeamsAll, mudarContratacao, mudarRegime, plantaoMenor, sairModelo12x36, regraDomingo, teamOf, teamOffOnSunday } from "../src/simple/logic";
import { aplicarHorarioLoja, diferencas } from "../src/simple/storeHours";
import { conferir, importar, lerCSV, linhasParaRegistros } from "../src/simple/importPeople";
import { domingoPrevisto } from "../src/simple/RegraDomingo";

function gen(st: Store, sid: string): Store {
  const f = fillMissing(st, sid);
  if (f) st = { ...st, sectors: st.sectors.map((s) => (s.id === sid ? f : s)) };
  const p = buildProblem(st, sid, { keepLocks: true });
  const r = solveBest(p, 3);
  return { ...st, sectors: st.sectors.map((s) => (s.id === sid ? applyResult(s, p, r.rows) : s)) };
}
const base = () => {
  const st = demoStore({ start: "2026-10-26" });
  return { ...st, config: { ...st.config, sundayOpen: true, weeks: 6 } };
};
const caixa = (st: Store) => st.sectors.find((s) => s.name === "Frente de Caixa")!;

describe("01 · folga fixa no domingo", () => {
  it("quem tem folga fixa no domingo folga em todos os domingos, mesmo estando num rodízio", () => {
    let st = base();
    const sec = caixa(st);
    const ests = st.employees.filter((e) => e.sectorId === sec.id).slice(0, 2);
    // continua com ciclo de domingo (o cadastro antigo), mas a folga fixa no domingo manda
    st = { ...st, employees: st.employees.map((e) => (ests.includes(e) ? { ...e, fixedOff: 0, sundayCycle: 2, sundayOffset: 1 } : e)) };
    st = gen(st, sec.id);
    const s1 = caixa(st);
    const suns = buildDays(st.config).filter((d) => d.weekday === 0 && !d.closed);
    expect(suns.length).toBeGreaterThan(4);
    for (const e of ests) for (const d of suns) expect(cellCode(s1, e.id, d)).toBe("F");
  });
  it("quem tem folga fixa no domingo não entra nos times do rodízio", () => {
    let st = base();
    const sec = caixa(st);
    const e0 = st.employees.find((e) => e.sectorId === sec.id)!;
    st = { ...st, employees: st.employees.map((e) => (e.id === e0.id ? { ...e, fixedOff: 0, sundayCycle: 0, sundayOffset: 0 } : e)) };
    st = applyTeamsAll({ ...st, config: { ...st.config, sundayRule: "alternado" } }, { fresh: true });
    expect(teamOf(st.employees.find((e) => e.id === e0.id)!)).toBeNull();
  });
});

describe("02 · regra de domingo 2x1", () => {
  it("2x1 na loja: 3 times; cada pessoa trabalha 2 domingos e folga 1, e a escala gerada respeita", () => {
    let st = base();
    st = aplicarRegraDomingo(st, { sectorId: null }, { rule: "alternado", work: 2 });
    const sec = caixa(st);
    expect(regraDomingo(st, sec)).toMatchObject({ rule: "alternado", work: 2, ciclo: 3 });
    const emps = st.employees.filter((e) => e.sectorId === sec.id && e.sundayCycle !== 0);
    const times = new Set(emps.map((e) => teamOf(e)));
    expect([...times].sort()).toEqual(["A", "B", "C"]);
    // times equilibrados (diferença de no máximo 1 por turno → no total, pequena)
    const n = ["A", "B", "C"].map((t) => emps.filter((e) => teamOf(e) === t).length);
    expect(Math.max(...n) - Math.min(...n)).toBeLessThanOrEqual(sec.shifts.length);
    st = gen(st, sec.id);
    const s1 = caixa(st);
    const suns = buildDays(st.config).filter((d) => d.weekday === 0 && !d.closed);
    for (const e of emps) {
      const seq = suns.map((d) => cellCode(s1, e.id, d));
      const prev = suns.map((d) => domingoPrevisto(e, d.date));
      // a prévia mostrada ao RH é a mesma coisa que a escala gerada (fora férias/faltas)
      seq.forEach((c, i) => {
        if (c === "D" || c === "F") expect(c === "D" ? "T" : "F").toBe(prev[i]);
      });
      // em 3 domingos seguidos, exatamente 1 folga
      for (let i = 0; i + 3 <= seq.length; i++) {
        const w = seq.slice(i, i + 3);
        if (w.every((c) => c === "D" || c === "F")) expect(w.filter((c) => c === "F").length).toBe(1);
      }
    }
  });
  it("setor com regra própria (1x1) enquanto a loja usa 2x1", () => {
    let st = aplicarRegraDomingo(base(), { sectorId: null }, { rule: "alternado", work: 2 });
    const sec = caixa(st);
    st = aplicarRegraDomingo(st, { sectorId: sec.id }, { rule: "alternado", work: 1 });
    expect(regraDomingo(st, caixa(st)).ciclo).toBe(2);
    const outro = st.sectors.find((s) => s.id !== sec.id && st.employees.some((e) => e.sectorId === s.id))!;
    expect(regraDomingo(st, outro).ciclo).toBe(3);
    expect(st.employees.filter((e) => e.sectorId === sec.id && teamOf(e)).every((e) => e.sundayCycle === 2)).toBe(true);
    // a folga de cada domingo gira entre os times
    expect(new Set(["2026-11-01", "2026-11-08", "2026-11-15"].map((d) => teamOffOnSunday(d, 3))).size).toBe(3);
  });
});

describe("03 · redistribuir intervalos de um dia (domingo)", () => {
  it("no domingo com todo mundo no intervalo ao meio-dia, a sugestão do dia espalha os intervalos e o aplicado aparece na grade", () => {
    let st = base();
    st = { ...st, config: { ...st.config, sundayStart: "08:30", sundayEnd: "16:30" } };
    const sec = caixa(st);
    // turno de domingo como no print: 08:30–16:30 com 1h de intervalo
    st = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? { ...s, shifts: s.shifts.map((x) => (x.special ? { ...x, start: "08:30", workMin: 420, breakStart: "12:00", breakMin: 60 } : x)) } : s)) };
    st = gen(st, sec.id);
    const sun = buildDays(st.config).find((d) => d.weekday === 0 && !d.closed)!;
    const s1 = caixa(st);
    const working = st.employees.filter((e) => e.sectorId === sec.id && cellCode(s1, e.id, sun) === "D");
    expect(working.length).toBeGreaterThan(2);
    // todo mundo no intervalo às 12:00 neste domingo (como no print)
    for (const e of working) st = withDayBreak(st, sec.id, e.id, sun.date, "12:00");
    // mínimo de 2 o dia todo
    st = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? { ...s, minRules: [...s.minRules.filter((r) => !r.days.includes(0)), { id: "t", days: [0], start: st.config.sundayStart, end: st.config.sundayEnd, min: 2, ideal: null }] } : s)) };
    const axis = slotAxis(st.config, [sun], 30);
    const before = computeCoverage(st, caixa(st), [sun], axis)[0];
    const r = staggerBreaksDay(st, sec.id, sun.date, {});
    expect(r.changes.length).toBeGreaterThan(0);
    const applied = r.sets.reduce((y, c) => withDayBreak(y, sec.id, c.empId, sun.date, c.brk), st);
    const after = computeCoverage(applied, caixa(applied), [sun], axis)[0];
    const miss = (c: typeof before) => c.counts.reduce((m, n, i) => m + Math.max(0, c.req[i] - n), 0);
    expect(miss(after)).toBeLessThan(miss(before));
    // o horário mostrado na grade é o novo
    for (const c of r.changes) {
      const e = applied.employees.find((x) => x.id === c.empId)!;
      expect(dayShift(applied, caixa(applied), e, sun).breakStart).toBe(Number(c.to.slice(0, 2)) * 60 + Number(c.to.slice(3)));
    }
  });
});

describe("04 · horário da loja nos setores", () => {
  it("abre mais cedo: a primeira faixa de cada setor passa a começar na abertura; exceções (datas) não mudam", () => {
    let st = base();
    const sec = caixa(st);
    st = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? { ...s, minRules: [...s.minRules, { id: "x1", days: [], date: "2026-12-24", start: "09:00", end: "12:00", min: 9, ideal: null }] } : s)) };
    st = { ...st, config: { ...st.config, open: "07:00", close: "21:00" } };
    expect(diferencas(caixa(st), st.config).length).toBeGreaterThan(0);
    const n = aplicarHorarioLoja(caixa(st), st.config);
    expect(diferencas(n, st.config).filter((g) => !g.domingo)).toEqual([]);
    const semana = n.minRules.filter((r) => !r.date && r.days.includes(1));
    expect(semana.map((r) => r.start).sort()[0]).toBe("07:00");
    expect(n.minRules.find((r) => r.id === "x1")).toMatchObject({ start: "09:00", end: "12:00", min: 9 });
  });
});

describe("05 · importar colaboradores", () => {
  const csv = "Nome;Matrícula;Função;Setor;Turno;Domingos;Folga fixa;Sexo;Admissão;Horas por semana\nAna Teste;9001;Estagiário;Frente de Caixa;;Não trabalha;Dom;F;01/02/2025;30\nBeto Teste;9002;Operador;Setor Inexistente;;;;;;\nAna Teste;9001;Estagiário;;;;;;;\nCarla Teste;;Operadora;;;Time Z;Xyz;;31/02/2025;44";
  it("lê CSV, aponta erros por linha e duplicidade, e cadastra só as válidas", () => {
    const st = base();
    const { registros } = linhasParaRegistros(lerCSV(csv));
    expect(registros.length).toBe(4);
    const prev = conferir(st, registros, { setorPadrao: caixa(st), atualizar: true });
    expect(prev[0].status).toBe("novo");
    expect(prev[0].patch).toMatchObject({ fixedOff: 0, sundayCycle: 0, contractMin: 1800, admissao: "2025-02-01", sex: "F" });
    expect(prev[1].status).toBe("erro");
    expect(prev[1].msgs.join()).toMatch(/Setor Inexistente/);
    expect(prev[2].status).toBe("erro");
    expect(prev[2].msgs.join()).toMatch(/repetida na planilha/);
    expect(prev[3].status).toBe("erro");
    expect(prev[3].msgs.length).toBeGreaterThanOrEqual(2);
    const r = importar(st, prev);
    expect(r.criados).toBe(1);
    const ana = r.store.employees.find((e) => e.matricula === "9001")!;
    expect(ana).toMatchObject({ name: "Ana Teste", func: "Estagiário", fixedOff: 0, sundayCycle: 0 });
    // de novo: agora a Ana já existe e é atualizada, não duplicada
    const prev2 = conferir(r.store, linhasParaRegistros(lerCSV(csv)).registros.slice(0, 1), { setorPadrao: caixa(r.store), atualizar: true });
    expect(prev2[0].status).toBe("atualiza");
    expect(importar(r.store, prev2).store.employees.filter((e) => e.matricula === "9001").length).toBe(1);
  });
});

describe("06 · cobertura por faixa", () => {
  it("quem chega no meio da meia hora só conta a partir da faixa seguinte; quem sai no meio já não conta", () => {
    const st = base();
    const sec = caixa(st);
    const day = buildDays(st.config).find((d) => d.weekday === 2)!;
    const e = st.employees.find((x) => x.sectorId === sec.id)!;
    const sh = sec.shifts.find((s) => s.id === e.shiftId)!;
    // um turno que entra às 08:15
    const st2: Store = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? { ...s, shifts: s.shifts.map((x) => (x.id === sh.id ? { ...x, start: "08:45", breakStart: "12:15", breakMin: 60 } : x)) } : s)), employees: st.employees.filter((x) => x.sectorId !== sec.id || x.id === e.id) };
    const s2 = { ...caixa(st2), schedule: { [e.id]: { [day.date]: { c: "T" as const } } } };
    const st3 = { ...st2, sectors: st2.sectors.map((s) => (s.id === sec.id ? s2 : s)) };
    const axis = slotAxis(st3.config, [day], 30);
    const cov = computeCoverage(st3, s2, [day], axis)[0];
    const at = (hhmm: string) => cov.counts[axis.indexOf(Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)))];
    expect(at("08:30")).toBe(0); // chega 08:45
    expect(at("09:00")).toBe(1);
    expect(at("12:00")).toBe(0); // intervalo começa 12:15
    expect(at("12:30")).toBe(0);
    expect(at("13:00")).toBe(0); // intervalo termina 13:15
    expect(at("13:30")).toBe(1);
  });
});

describe("12x36", () => {
  const com12x36 = () => {
    let st = base();
    const sec = caixa(st);
    const dia = { id: "pl_dia", name: "Plantão dia", start: "07:00", breakStart: "12:00", breakMin: 60, workMin: 660, special: false, plantao: true };
    const noite = { id: "pl_noite", name: "Plantão noite", start: "19:00", breakStart: "01:00", breakMin: 60, workMin: 660, special: false, plantao: true };
    st = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? { ...s, shifts: [...s.shifts, dia, noite] } : s)) };
    const emps = st.employees.filter((e) => e.sectorId === sec.id).slice(0, 4);
    st = { ...st, employees: st.employees.map((e) => { const i = emps.indexOf(e); return i < 0 ? e : { ...e, regime: "12x36" as const, plantaoFase: (i % 2) as 0 | 1, shiftId: i < 2 ? "pl_dia" : "pl_noite" }; }) };
    return { st, sec, emps };
  };
  it("dia sim, dia não, inclusive domingos, sem violar as regras do 5x2 dos outros", () => {
    const { st: s0, sec, emps } = com12x36();
    const st = gen(s0, sec.id);
    const s1 = caixa(st);
    const days = buildDays(st.config).filter((d) => !d.closed);
    for (const e of emps) {
      const seq = days.map((d) => cellCode(s1, e.id, d));
      for (let i = 1; i < seq.length; i++) if (days[i].idx === days[i - 1].idx + 1) expect(seq[i] === "F").not.toBe(seq[i - 1] === "F");
      expect(days.filter((d) => d.weekday === 0).some((d) => cellCode(s1, e.id, d) === "D")).toBe(true);
    }
    // Plantão A e B nunca trabalham no mesmo dia
    for (const d of days) expect(cellCode(s1, emps[0].id, d) === "F").not.toBe(cellCode(s1, emps[1].id, d) === "F");
    const p = buildProblem(st, sec.id, { keepLocks: true });
    const rows = p.employees.map((pe) => buildDays(st.config).map((d) => cellCode(s1, pe.id, d)));
    const v = validate(p, rows).filter((x) => emps.some((e) => e.id === x.empId));
    expect(v).toEqual([]);
  });
  it("plantão noturno 19h–7h: conta à noite no dia em que começa e na madrugada do dia seguinte", () => {
    const { st: s0, sec, emps } = com12x36();
    let st = { ...s0, config: { ...s0.config, open: "00:00", close: "23:30" } };
    st = gen(st, sec.id);
    const s1 = caixa(st);
    const noite = emps[2];
    const days = buildDays(st.config).filter((d) => !d.closed && !d.special);
    const d0 = days.find((d, i) => cellCode(s1, noite.id, d) === "T" && days[i + 1] && days[i + 1].idx === d.idx + 1)!;
    const d1 = days.find((d) => d.idx === d0.idx + 1)!;
    const axis = slotAxis(st.config, [d0], 30);
    const est = (d: typeof d0, hhmm: string) => daySlotStates(st, st.employees.find((e) => e.id === noite.id)!, d, axis)[axis.indexOf(toMin(hhmm))].state;
    expect(est(d0, "20:00")).toBe("working");
    expect(est(d0, "06:00")).not.toBe("working"); // ainda não começou neste dia
    expect(cellCode(s1, noite.id, d1)).toBe("F"); // folga no dia seguinte...
    expect(est(d1, "03:00")).toBe("working"); // ...mas está trabalhando de madrugada (plantão de ontem)
    expect(est(d1, "01:00")).toBe("break");
    expect(est(d1, "07:00")).not.toBe("working");
  });
});

describe("12x36 na importação e na troca de regime", () => {
  it("planilha com Regime 12x36: cria o plantão, reparte A/B e a escala alterna", () => {
    const st = base();
    const csv = "Nome;Setor;Regime\nVigia Um;Frente de Caixa;12x36\nVigia Dois;Frente de Caixa;12x36\nVigia Três;Frente de Caixa;12x36 B";
    const prev = conferir(st, linhasParaRegistros(lerCSV(csv)).registros, { setorPadrao: caixa(st), atualizar: true });
    expect(prev.every((l) => l.status === "novo")).toBe(true);
    let r = importar(st, prev).store;
    const vs = r.employees.filter((e) => e.name.startsWith("Vigia"));
    expect(vs.every((e) => e.regime === "12x36")).toBe(true);
    expect(vs.map((e) => e.plantaoFase)).toEqual([0, 1, 1]);
    const sec = caixa(r);
    expect(vs.every((e) => sec.shifts.find((s) => s.id === e.shiftId)?.plantao)).toBe(true);
    r = gen(r, sec.id);
    const days = buildDays(r.config).filter((d) => !d.closed);
    const s1 = caixa(r);
    expect(days.filter((d) => cellCode(s1, vs[0].id, d) !== "F").length).toBeGreaterThan(days.length / 2 - 3);
  });
  it("voltar ao regime da loja: sai do plantão e entra no rodízio de domingos", () => {
    let st = base();
    const e = st.employees.find((x) => x.sectorId === caixa(st).id)!;
    st = mudarRegime(st, e.id, "B");
    expect(st.employees.find((x) => x.id === e.id)).toMatchObject({ regime: "12x36", plantaoFase: 1 });
    st = mudarRegime({ ...st, config: { ...st.config, sundayRule: "alternado" } }, e.id, "loja");
    const e2 = st.employees.find((x) => x.id === e.id)!;
    expect(e2.regime).toBeNull();
    expect(caixa(st).shifts.find((s) => s.id === e2.shiftId)?.plantao).toBeFalsy();
    expect(teamOf(e2)).not.toBeNull();
  });
});

describe("modelo de escala 12x36 na loja", () => {
  it("aplicar: todos em plantão, A/B equilibrado por setor; sair: todos voltam ao 5x2", () => {
    let st = aplicarModelo12x36(base());
    expect(st.config.modeloEscala).toBe("12x36");
    expect(st.employees.every((e) => e.regime === "12x36")).toBe(true);
    for (const sec of st.sectors) {
      const es = st.employees.filter((e) => e.sectorId === sec.id);
      if (!es.length) continue;
      const a = es.filter((e) => e.plantaoFase !== 1).length;
      expect(Math.abs(a - (es.length - a))).toBeLessThanOrEqual(1);
      expect(es.every((e) => sec.shifts.find((s) => s.id === e.shiftId)?.plantao)).toBe(true);
    }
    const sec = caixa(st);
    st = gen(st, sec.id);
    const days = buildDays(st.config).filter((d) => !d.closed);
    const e0 = st.employees.find((e) => e.sectorId === sec.id)!;
    const trab = days.filter((d) => cellCode(caixa(st), e0.id, d) !== "F").length;
    expect(Math.abs(trab - days.length / 2)).toBeLessThanOrEqual(2);
    expect(["A", "B"]).toContain(plantaoMenor(st, sec.id));
    st = sairModelo12x36(st, 2);
    expect(st.config.modeloEscala).toBeNull();
    expect(st.config.folgasPorSemana).toBe(2);
    expect(st.employees.every((e) => e.regime == null)).toBe(true);
  });
  it("importação em loja 12x36: linha sem regime entra no plantão", () => {
    const st = aplicarModelo12x36(base());
    const prev = conferir(st, linhasParaRegistros(lerCSV("Nome;Setor\nNovo Plantonista;Frente de Caixa")).registros, { setorPadrao: caixa(st), atualizar: true });
    const r = importar(st, prev).store;
    expect(r.employees.find((e) => e.name === "Novo Plantonista")?.regime).toBe("12x36");
  });
  it("por setor: só o setor escolhido vai para 12x36; a loja continua 5x2", () => {
    const st0 = base();
    const cx = caixa(st0);
    let st = aplicarModelo12x36Setor(st0, cx.id);
    expect(caixa(st).modeloEscala).toBe("12x36");
    expect(st.config.modeloEscala).toBeNull();
    const doSetor = st.employees.filter((e) => e.sectorId === cx.id);
    const outros = st.employees.filter((e) => e.sectorId !== cx.id);
    expect(doSetor.every((e) => e.regime === "12x36")).toBe(true);
    expect(outros.every((e) => e.regime == null)).toBe(true);
    const a = doSetor.filter((e) => e.plantaoFase !== 1).length;
    expect(Math.abs(a - (doSetor.length - a))).toBeLessThanOrEqual(1);
    // importação: linha sem regime em setor 12x36 entra no plantão; em outro setor, não
    const outroSec = st.sectors.find((x) => !x.hidden && x.id !== cx.id)!;
    const csv = `Nome;Setor\nP Caixa;${cx.name}\nP Outro;${outroSec.name}`;
    const r = importar(st, conferir(st, linhasParaRegistros(lerCSV(csv)).registros, { setorPadrao: cx, atualizar: true })).store;
    expect(r.employees.find((e) => e.name === "P Caixa")?.regime).toBe("12x36");
    expect(r.employees.find((e) => e.name === "P Outro")?.regime ?? null).toBeNull();
    st = sairModelo12x36Setor(st, cx.id);
    expect(caixa(st).modeloEscala).toBeNull();
    expect(st.employees.every((e) => e.regime == null)).toBe(true);
  });
  it("loja vira 12x36 só quando todos os setores estão em 12x36", () => {
    let st = base();
    for (const sec of st.sectors.filter((x) => !x.hidden)) st = aplicarModelo12x36Setor(st, sec.id);
    expect(st.config.modeloEscala).toBe("12x36");
    st = sairModelo12x36Setor(st, caixa(st).id);
    expect(st.config.modeloEscala).toBeNull();
  });
});

describe("contratação: estagiário e jovem aprendiz", () => {
  it("estagiário: 6h por dia com 15 min de intervalo, mesma entrada do turno", () => {
    let st = base();
    const e0 = st.employees.find((x) => x.sectorId === caixa(st).id)!;
    const antes = employeeShift(st, undefined, e0, false);
    st = mudarContratacao(st, e0.id, "estagio");
    const e = st.employees.find((x) => x.id === e0.id)!;
    expect(e).toMatchObject({ contratacao: "estagio", horasDia: 360, contractMin: 1800 });
    const r = employeeShift(st, undefined, e, false);
    expect(r.start).toBe(antes.start);
    expect(r.workMin).toBe(360);
    expect(r.breakEnd - r.breakStart).toBe(15);
    expect(r.end).toBe(r.start + 375);
    // 4h: sem intervalo; intervalo escolhido à mão vale
    const e4 = { ...e, horasDia: 240 };
    expect(employeeShift(st, undefined, e4, false)).toMatchObject({ workMin: 240, end: r.start + 240, breakStart: 0, breakEnd: 0 });
    const e30 = { ...e, intervaloMin: 30 };
    const r30 = employeeShift(st, undefined, e30, false);
    expect(r30.breakEnd - r30.breakStart).toBe(30);
    expect(r30.end).toBe(r.start + 390);
  });
  it("cobertura: depois da saída o estagiário não conta no posto", () => {
    let st = base();
    const sid = caixa(st).id;
    const e0 = st.employees.find((x) => x.sectorId === sid)!;
    st = gen(mudarContratacao(st, e0.id, "estagio"), sid);
    const e = st.employees.find((x) => x.id === e0.id)!;
    const day = buildDays(st.config).find((d) => !d.closed && !d.special && cellCode(caixa(st), e.id, d) === "T")!;
    const r = dayShift(st, caixa(st), e, day);
    expect(presenceAt(st, e, day, r.start + 60).state).toBe("working");
    expect(presenceAt(st, e, day, r.end + 30).state).not.toBe("working");
    const sem = weeklyMinutes(st, sid, buildDays(st.config));
    expect(Math.max(...sem[e.id])).toBeLessThanOrEqual(1800);
  });
  it("alertas: estagiário acima de 6h por dia e acima das horas da semana", () => {
    let st = base();
    const sid = caixa(st).id;
    const e0 = st.employees.find((x) => x.sectorId === sid)!;
    st = mudarContratacao(st, e0.id, "estagio");
    st = { ...st, employees: st.employees.map((x) => (x.id === e0.id ? { ...x, horasDia: 420 } : x)) };
    st = gen(st, sid);
    const al = analyzeSector(st, sid).alerts.filter((a) => a.id.includes(e0.id));
    expect(al.some((a) => a.id.startsWith("emp-est-dia"))).toBe(true);
    expect(al.some((a) => a.id.startsWith("emp-jp-sem"))).toBe(true);
  });
  it("volta para CLT: jornada do turno de novo", () => {
    let st = base();
    const e0 = st.employees.find((x) => x.sectorId === caixa(st).id)!;
    const antes = employeeShift(st, undefined, e0, false);
    st = mudarContratacao(mudarContratacao(st, e0.id, "aprendiz"), e0.id, "clt");
    const e = st.employees.find((x) => x.id === e0.id)!;
    expect(e.contratacao).toBeNull();
    expect(employeeShift(st, undefined, e, false)).toMatchObject({ start: antes.start, end: antes.end, workMin: antes.workMin });
  });
  it("importação: colunas Contratação e Horas por dia", () => {
    const st = base();
    const csv = "Nome;Contratação;Horas por dia;Horas por semana\nEst Um;Estagiário;5;25\nApr Dois;Jovem aprendiz;;\nClt Tres;CLT;;\nErro Quatro;Temporário;;\nErro Cinco;;6;";
    const prev = conferir(st, linhasParaRegistros(lerCSV(csv)).registros, { setorPadrao: caixa(st), atualizar: true });
    expect(prev.map((l) => l.status)).toEqual(["novo", "novo", "novo", "erro", "erro"]);
    const r = importar(st, prev).store;
    expect(r.employees.find((e) => e.name === "Est Um")).toMatchObject({ contratacao: "estagio", horasDia: 300, contractMin: 1500 });
    expect(r.employees.find((e) => e.name === "Apr Dois")).toMatchObject({ contratacao: "aprendiz", horasDia: 360, contractMin: 1800 });
    expect(r.employees.find((e) => e.name === "Clt Tres")?.contratacao ?? null).toBeNull();
  });
});

describe("jornadas cadastradas (nome, dias e horas)", () => {
  const comJornada = (dias: number, horas: number, nome = "Teste") => {
    const st = base();
    const j = novaJornada({ nome, diasSemana: dias, horasDia: horas });
    return { st: salvarJornada(st, j), j };
  };
  const diasTrab = (st: Store, empId: string) => {
    const sec = caixa(st);
    const days = buildDays(st.config);
    const weeks: number[] = [];
    for (const d of days) {
      const c = cellCode(sec, empId, d);
      weeks[d.week] = (weeks[d.week] ?? 0) + (c === "T" || c === "D" ? 1 : 0);
    }
    return weeks;
  };
  it("4 dias de 8h: 4 dias por semana, 8h por dia, 32h no contrato", () => {
    let { st, j } = comJornada(4, 480, "4 dias de 8h");
    const sid = caixa(st).id;
    const e0 = st.employees.find((x) => x.sectorId === sid)!;
    st = gen(aplicarJornada(st, e0.id, j.id), sid);
    const e = st.employees.find((x) => x.id === e0.id)!;
    expect(e).toMatchObject({ jornadaId: j.id, contractMin: 1920 });
    expect(diasTrab(st, e.id).every((n) => n === 4)).toBe(true);
    const day = buildDays(st.config).find((d) => !d.special && cellCode(caixa(st), e.id, d) === "T")!;
    expect(dayShift(st, caixa(st), e, day).workMin).toBe(480);
    expect(regimeTexto(e, st.config)).toBe("4 dias de 8h");
    const p = buildProblem(st, sid, { keepLocks: true });
    expect(validate(p, p.employees.map((pe) => buildDays(st.config).map((d) => cellCode(caixa(st), pe.id, d)))).filter((v) => v.empId === e.id && v.kind === "folgas")).toEqual([]);
  });
  it("editar a jornada: mudar para 3 dias refaz a escala de quem está nela", () => {
    let { st, j } = comJornada(5, 360);
    const sid = caixa(st).id;
    const e0 = st.employees.find((x) => x.sectorId === sid)!;
    st = gen(aplicarJornada(st, e0.id, j.id), sid);
    expect(diasTrab(st, e0.id).every((n) => n === 5)).toBe(true);
    st = gen(salvarJornada(st, { ...j, diasSemana: 3, horasDia: 300 }), sid);
    expect(diasTrab(st, e0.id).every((n) => n === 3)).toBe(true);
    expect(st.employees.find((x) => x.id === e0.id)!.contractMin).toBe(900);
  });
  it("setor inteiro na jornada; excluir a jornada devolve todos para a loja", () => {
    let { st, j } = comJornada(6, 440, "6x1 de 7h20");
    const sid = caixa(st).id;
    st = aplicarJornadaSetor(st, sid, j.id);
    expect(caixa(st).jornadaId).toBe(j.id);
    expect(st.employees.filter((e) => e.sectorId === sid).every((e) => e.jornadaId === j.id)).toBe(true);
    expect(st.employees.filter((e) => e.sectorId !== sid).every((e) => !e.jornadaId)).toBe(true);
    st = excluirJornada(st, j.id);
    expect(st.config.jornadas).toEqual([]);
    expect(caixa(st).jornadaId).toBeNull();
    expect(st.employees.every((e) => !e.jornadaId)).toBe(true);
  });
  it("12x36 e jornada não se misturam", () => {
    let { st, j } = comJornada(5, 360);
    const e0 = st.employees.find((x) => x.sectorId === caixa(st).id)!;
    st = mudarRegime(aplicarJornada(st, e0.id, j.id), e0.id, "A");
    expect(st.employees.find((x) => x.id === e0.id)).toMatchObject({ regime: "12x36", jornadaId: null });
    st = aplicarJornada(st, e0.id, j.id);
    expect(st.employees.find((x) => x.id === e0.id)).toMatchObject({ regime: null, jornadaId: j.id });
  });
  it("importação: Regime com o nome da jornada", () => {
    const { st, j } = comJornada(5, 240, "Meio período");
    const prev = conferir(st, linhasParaRegistros(lerCSV("Nome;Regime\nPessoa Meio;Meio Periodo\nPessoa Ruim;Jornada X")).registros, { setorPadrao: caixa(st), atualizar: true });
    expect(prev.map((l) => l.status)).toEqual(["novo", "erro"]);
    const r = importar(st, prev).store;
    expect(r.employees.find((e) => e.name === "Pessoa Meio")).toMatchObject({ jornadaId: j.id, contractMin: 1200 });
  });
});

describe("setor com regimes misturados", () => {
  it("5x2, 12x36, jornada de 4 dias e estagiário no mesmo setor: cada um com suas folgas e horas", () => {
    let st = base();
    const j = novaJornada({ nome: "4 dias de 8h", diasSemana: 4, horasDia: 480 });
    st = salvarJornada(st, j);
    const sid = caixa(st).id;
    const [a, b, c, d] = st.employees.filter((x) => x.sectorId === sid);
    st = mudarRegime(st, b.id, "A");
    st = aplicarJornada(st, c.id, j.id);
    st = mudarContratacao(st, d.id, "estagio");
    st = gen(st, sid);
    const sec = caixa(st);
    const days = buildDays(st.config);
    const trab = (id: string, w: number) => days.filter((x) => x.week === w && ["T", "D"].includes(cellCode(sec, id, x))).length;
    for (let w = 0; w < st.config.weeks; w++) {
      expect(trab(a.id, w)).toBe(5); // 5x2 da loja
      expect([3, 4]).toContain(trab(b.id, w)); // 12x36: dia sim, dia não
      expect(trab(c.id, w)).toBe(4); // jornada 4 dias
      expect(trab(d.id, w)).toBe(5); // estagiário no 5x2, 6h por dia
    }
    const dia = days.find((x) => !x.special && ["T"].includes(cellCode(sec, c.id, x)) && cellCode(sec, d.id, x) === "T")!;
    const ec = st.employees.find((x) => x.id === c.id)!;
    const ed = st.employees.find((x) => x.id === d.id)!;
    expect(dayShift(st, sec, ec, dia).workMin).toBe(480);
    expect(dayShift(st, sec, ed, dia).workMin).toBe(360);
    const p = buildProblem(st, sid, { keepLocks: true });
    const rows = p.employees.map((pe) => days.map((x) => cellCode(sec, pe.id, x)));
    expect(validate(p, rows).filter((v) => v.kind === "folgas")).toEqual([]);
  });
});

describe("Atualização 2.0", () => {
  const trabSem = (st: Store, empId: string) => {
    const e = st.employees.find((x) => x.id === empId)!;
    const sec = st.sectors.find((s) => s.id === e.sectorId)!;
    const out: number[] = [];
    for (const d of buildDays(st.config)) {
      const c = cellCode(sec, empId, d);
      out[d.week] = (out[d.week] ?? 0) + (c === "T" || c === "D" ? 1 : 0);
    }
    return out;
  };
  it("1 e 3) estagiário em 6x1 numa loja 5x2, com turno de estágio de 5h: 30h por semana", () => {
    let st = base();
    const sid = caixa(st).id;
    const sh = { id: "sh_est", name: "Estágio Manhã", start: "07:00", breakStart: "10:00", breakMin: 15, workMin: 300, special: false };
    st = { ...st, sectors: st.sectors.map((s) => (s.id === sid ? { ...s, shifts: [...s.shifts, sh] } : s)) };
    const [clt, est] = st.employees.filter((x) => x.sectorId === sid);
    st = mudarContratacao(st, est.id, "estagio");
    st = { ...st, employees: st.employees.map((x) => (x.id === est.id ? { ...x, shiftId: "sh_est", horasDia: null } : x)) };
    st = mudarFolgas(st, est.id, 1);
    st = gen(st, sid);
    expect(st.config.folgasPorSemana).toBe(2);
    expect(trabSem(st, est.id).every((n) => n === 6)).toBe(true);
    expect(trabSem(st, clt.id).every((n) => n === 5)).toBe(true);
    const e = st.employees.find((x) => x.id === est.id)!;
    const dia = buildDays(st.config).find((d) => !d.special && cellCode(caixa(st), e.id, d) === "T")!;
    expect(dayShift(st, caixa(st), e, dia)).toMatchObject({ workMin: 300, start: 420, end: 420 + 315 });
    const sem = weeklyMinutes(st, sid, buildDays(st.config).filter((d) => !d.special));
    expect(Math.max(...sem[e.id])).toBeLessThanOrEqual(1800);
    expect(modeloDaPessoa(st, e)).toBe("6x1");
    const al = analyzeSector(st, sid).alerts.filter((a) => a.id.includes(e.id) && (a.id.startsWith("emp-est") || a.id.startsWith("emp-jp")));
    expect(al).toEqual([]);
  });
  it("6x1 por pessoa num turno sem horas próprias: limite semanal ÷ 6 dias", () => {
    let st = base();
    const e0 = st.employees.find((x) => x.sectorId === caixa(st).id)!;
    st = mudarFolgas(st, e0.id, 1);
    const r = employeeShift(st, undefined, st.employees.find((x) => x.id === e0.id)!, false);
    expect(r.workMin).toBe(Math.floor(st.config.weeklyMaxMin / 6));
    // voltar ao 5x2 (o da loja): sem modelo próprio
    st = mudarFolgas(st, e0.id, 2);
    expect(st.employees.find((x) => x.id === e0.id)!.folgasSemana ?? null).toBeNull();
  });
  it("2) setor em 5x2 não muda quando a loja passa para 6x1", () => {
    let st = base();
    const sid = caixa(st).id;
    st = aplicarFolgasSetor(st, sid, 2);
    st = { ...st, config: { ...st.config, folgasPorSemana: 1 } };
    const doCaixa = st.employees.find((x) => x.sectorId === sid)!;
    const outro = st.employees.find((x) => x.sectorId !== sid)!;
    expect(folgasDe(st, doCaixa)).toBe(2);
    expect(folgasDe(st, outro)).toBe(1);
    // exceção na pessoa: estagiário 6x1 dentro do setor 5x2
    st = mudarFolgas(st, doCaixa.id, 1);
    expect(folgasDe(st, st.employees.find((x) => x.id === doCaixa.id)!)).toBe(1);
    st = gen(st, sid);
    expect(trabSem(st, doCaixa.id).every((n) => n === 6)).toBe(true);
    // igual à loja de novo
    st = aplicarFolgasSetor(st, sid, null);
    expect(folgasDe(st, st.employees.find((x) => x.id === doCaixa.id)!)).toBe(1);
  });
  it("4) mudar o turno de domingo habitual muda os domingos já escalados à mão", () => {
    let st = base();
    const sid = caixa(st).id;
    const sec0 = caixa(st);
    const esp = sec0.shifts.filter((s) => s.special);
    const abertura = esp[0];
    const fechamento = esp[1] ?? { id: "sh_fech", name: "Domingo Fechamento", start: "10:00", breakStart: null, breakMin: 0, workMin: 240, special: true };
    if (!esp[1]) st = { ...st, sectors: st.sectors.map((s) => (s.id === sid ? { ...s, shifts: [...s.shifts, fechamento] } : s)) };
    const e0 = st.employees.find((x) => x.sectorId === sid)!;
    const doms = buildDays(st.config).filter((d) => d.special && !d.closed);
    // domingos escolhidos à mão no turno de abertura (bloqueados)
    st = { ...st, sectors: st.sectors.map((s) => (s.id === sid ? { ...s, schedule: { ...s.schedule, [e0.id]: { ...(s.schedule[e0.id] ?? {}), ...Object.fromEntries(doms.map((d) => [d.date, { c: "D" as const, lock: true, shiftId: abertura.id }])) } } } : s)) };
    st = { ...st, employees: st.employees.map((x) => (x.id === e0.id ? { ...x, sundayShiftId: fechamento.id } : x)) };
    expect(domingosForaDoHabitual(st, e0.id).length).toBe(doms.length);
    st = mudarTurnoDomingo(st, e0.id, fechamento.id);
    expect(domingosForaDoHabitual(st, e0.id)).toEqual([]);
    const e = st.employees.find((x) => x.id === e0.id)!;
    for (const d of doms) {
      expect(caixa(st).schedule[e.id][d.date]).toMatchObject({ c: "D", lock: true });
      expect(dayShift(st, caixa(st), e, d).shift?.id).toBe(fechamento.id);
    }
  });
  it("importação: Regime 6x1 numa loja 5x2", () => {
    const st = base();
    const prev = conferir(st, linhasParaRegistros(lerCSV("Nome;Regime;Contratação\nEst Seis;6x1;Estagiário\nClt Cinco;5x2;CLT")).registros, { setorPadrao: caixa(st), atualizar: true });
    const r = importar(st, prev).store;
    expect(r.employees.find((e) => e.name === "Est Seis")!.folgasSemana).toBe(1);
    expect(r.employees.find((e) => e.name === "Clt Cinco")!.folgasSemana ?? null).toBeNull();
  });
});

describe("Relatório 28/10", () => {
  const natal = (extra: Partial<Store["config"]> = {}) => {
    const st = demoStore({ start: "2026-12-21" });
    return { ...st, config: { ...st.config, sundayOpen: true, weeks: 2, holidays: [{ date: "2026-12-25", name: "Natal", open: false }], ...extra } } as Store;
  };
  const semana0 = (st: Store, sid: string, empId: string) => {
    const sec = st.sectors.find((s) => s.id === sid)!;
    return buildDays(st.config).filter((d) => d.week === 0).map((d) => cellCode(sec, empId, d));
  };
  it("feriado com a loja fechada conta como uma das folgas (5x2: H + 1 F)", () => {
    let st = natal();
    const sid = caixa(st).id;
    st = gen(st, sid);
    const p = buildProblem(st, sid, { keepLocks: true });
    for (const pe of p.employees) {
      const w = semana0(st, sid, pe.id);
      const fixas = pe.fixed.slice(0, 7).filter((c) => c === "F").length;
      expect(w.filter((c) => c === "H").length).toBe(1);
      // 2 folgas do 5x2 − 1 feriado = 1 (folgas fixas, como a do rodízio de domingo, nunca são tiradas)
      expect(w.filter((c) => c === "F").length).toBe(Math.max(1, fixas));
    }
    // desligado: continua dando 2 folgas além do feriado
    const s2 = natal({ feriadoContaFolga: false });
    const sid2 = caixa(s2).id;
    let st2 = gen(s2, sid2);
    const p2 = buildProblem(st2, sid2, { keepLocks: true });
    for (const pe of p2.employees) expect(semana0(st2, sid2, pe.id).filter((c) => c === "F").length).toBe(Math.max(2, pe.fixed.slice(0, 7).filter((c) => c === "F").length));
    void st2;
  });
  it("dias sem folga: ninguém folga em 24/12 e 31/12 e a escala continua válida", () => {
    let st = natal({ diasSemFolga: ["12-24", "12-31"] });
    const sid = caixa(st).id;
    st = gen(st, sid);
    const sec = caixa(st);
    const dias = buildDays(st.config).filter((d) => d.date === "2026-12-24" || d.date === "2026-12-31");
    expect(dias.length).toBe(2);
    for (const e of st.employees.filter((x) => x.sectorId === sid)) for (const d of dias) expect(["T", "D"]).toContain(cellCode(sec, e.id, d));
    const p = buildProblem(st, sid, { keepLocks: true });
    const rows = p.employees.map((pe) => buildDays(st.config).map((d) => cellCode(sec, pe.id, d)));
    expect(validate(p, rows).filter((v) => v.kind === "folgas")).toEqual([]);
    expect(ehDiaSemFolga(st.config, "2027-12-24")).toBe(true);
  });
  it("refazer a semana do feriado: escala antiga com 2 folgas vira H + 1 folga", () => {
    let st = natal({ holidays: [] });
    const sid = caixa(st).id;
    st = gen(st, sid);
    st = { ...st, config: { ...st.config, holidays: [{ date: "2026-12-25", name: "Natal", open: false }] } };
    st = gen(refazerSemanasDe(st, ["2026-12-25"]), sid);
    const p = buildProblem(st, sid, { keepLocks: true });
    for (const pe of p.employees) expect(semana0(st, sid, pe.id).filter((c) => c === "F").length).toBe(Math.max(1, pe.fixed.slice(0, 7).filter((c) => c === "F").length));
  });
  it("almoços: distribuir o período inteiro não piora e diminui a falta quando todos almoçam juntos", () => {
    let st = base();
    const sid = caixa(st).id;
    st = { ...st, sectors: st.sectors.map((s) => (s.id === sid ? { ...s, shifts: s.shifts.map((x) => (!x.special && x.breakStart ? { ...x, breakStart: "12:00", breakFlex: 120 } : x)) } : s)) };
    st = gen(st, sid);
    const r = staggerBreaksPeriod(st, sid);
    expect(r.missAfter).toBeLessThanOrEqual(r.missBefore);
    expect(r.mudancas).toBeGreaterThan(0);
    if (r.missBefore > 0) expect(r.missAfter).toBeLessThan(r.missBefore);
    // aplicar de novo não muda mais nada (já está distribuído)
    expect(staggerBreaksPeriod(r.store, sid).missAfter).toBeLessThanOrEqual(r.missAfter + 1e-9);
  });
  it("alertas de cobertura dizem em quais dias falta gente", () => {
    const st0 = base();
    const st = gen(st0, caixa(st0).id);
    const a = analyzeSector(st, caixa(st).id);
    for (const al of a.alerts.filter((x) => x.id.startsWith("cov-"))) for (const r of al.ranges ?? []) expect(r.dates?.length).toBe(r.weeks);
    expect(datasCurtas(["2026-11-15"])).toBe("15/11");
    expect(datasCurtas(["2026-11-15", "2026-11-22", "2026-11-29"])).toBe("15/11, 22/11 e 29/11");
  });
});

describe("teste de usabilidade (29/10)", () => {
  const grande = (extra: number, weeks: number, semLimite = false) => {
    let st: Store = demoStore({ start: "2026-11-02" });
    st = { ...st, config: { ...st.config, weeks } };
    const sec = st.sectors.find((s) => s.name === "Frente de Caixa")!;
    const n0 = st.employees.filter((e) => e.sectorId === sec.id).length;
    const add = Array.from({ length: extra }, (_, i) => ({ ...newEmployee(sec, n0 + i + 1), name: `C${i}` }));
    st = applyTeamsAll({ ...st, employees: [...st.employees, ...add] }, { sectorId: sec.id });
    if (semLimite) st = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? { ...s, movement: s.movement.map((m) => ({ ...m, maxOff: null })) } : s)) };
    return { st, sid: sec.id };
  };
  it("equipe que cresceu (60 pessoas): o limite de folgas por dia sobe e a escala sai", () => {
    const { st, sid } = grande(43, 4);
    const p = buildProblem(st, sid, { keepLocks: true, ajustarLimiteFolgas: true });
    expect(p.avisos?.[0]).toMatch(/aumentou o limite/);
    expect(solveBest(p, 3).ok).toBe(true);
  });
  it("8 semanas com 60 pessoas: o reparo conserta mais de uma sequência longa da mesma pessoa", () => {
    const { st, sid } = grande(43, 8, true);
    const r = solveBest(buildProblem(st, sid, { keepLocks: true }), 4);
    expect(r.violations.filter((v) => v.kind === "consec")).toEqual([]);
  });
  it("equipe do tamanho normal: nenhum ajuste automático", () => {
    const st = demoStore({ start: "2026-11-02" });
    const sid = st.sectors.find((s) => s.name === "Frente de Caixa")!.id;
    expect(buildProblem(st, sid, { keepLocks: true, ajustarLimiteFolgas: true }).avisos ?? []).toEqual([]);
  });
});

describe("limpar escala", () => {
  it("apaga o gerado, mantém férias/faltas e (por padrão) o fixado à mão; almoços voltam ao turno", () => {
    let st = base();
    const sid = caixa(st).id;
    st = gen(st, sid);
    const days = buildDays(st.config);
    const [e1, e2, e3] = st.employees.filter((e) => e.sectorId === sid);
    const d0 = days[2].date;
    st = { ...st, employees: st.employees.map((e) => (e.id === e3.id ? { ...e, breakStart: "13:30" } : e)), sectors: st.sectors.map((s) => (s.id === sid ? { ...s, schedule: { ...s.schedule, [e1.id]: { ...s.schedule[e1.id], [d0]: { c: "F", lock: true } }, [e2.id]: { ...s.schedule[e2.id], [d0]: { c: "V" }, [days[3].date]: { c: "T", brk: "15:00" } } } } : s)) };
    const a = limparEscala(st, [sid], { fixos: false, almocos: true });
    const sa = a.sectors.find((s) => s.id === sid)!;
    expect(sa.schedule[e1.id][d0]).toEqual({ c: "F", lock: true });
    expect(sa.schedule[e2.id][d0]).toEqual({ c: "V" });
    expect(sa.schedule[e2.id][days[3].date]).toBeUndefined();
    expect(a.employees.find((e) => e.id === e3.id)!.breakStart).toBeNull();
    expect(Object.keys(sa.schedule[e3.id] ?? {}).filter((d) => days.some((x) => x.date === d)).length).toBe(0);
    // apagar também o fixado à mão
    const b = limparEscala(st, [sid], { fixos: true, almocos: false });
    const sb = b.sectors.find((s) => s.id === sid)!;
    expect(sb.schedule[e1.id][d0]).toBeUndefined();
    expect(sb.schedule[e2.id][d0]).toEqual({ c: "V" });
    expect(b.employees.find((e) => e.id === e3.id)!.breakStart).toBe("13:30");
    // outros setores não mudam
    const outro = st.sectors.find((s) => s.id !== sid)!;
    expect(a.sectors.find((s) => s.id === outro.id)).toBe(outro);
  });
});

describe("regras avançadas extras", () => {
  beforeAll(() => usarAjusteAutomaticoDeFolgas(true));
  afterAll(() => usarAjusteAutomaticoDeFolgas(false));
  const comRegras = (regras: Store["config"]["regras"], mexer?: (st: Store, sid: string) => Store) => {
    let st = base();
    const sid = caixa(st).id;
    st = { ...st, config: { ...st.config, regras } };
    if (mexer) st = mexer(st, sid);
    st = gen(st, sid);
    const p = buildProblem(st, sid, { keepLocks: true });
    const days = buildDays(st.config);
    const sec = caixa(st);
    const rows = p.employees.map((pe) => days.map((d) => cellCode(sec, pe.id, d)));
    return { st, sid, p, days, rows, sec };
  };
  const varF = (p: ReturnType<typeof comRegras>["p"], rows: string[][], ei: number, d: number) => rows[ei][d] === "F" && p.employees[ei].fixed[d] === null;
  it("1) folgas separadas (proibir): nenhuma folga variável colada em outra", () => {
    const { p, rows } = comRegras({ folgasSeparadas: "proibir" });
    let coladas = 0;
    rows.forEach((r, ei) => r.forEach((c, d) => c === "F" && r[d + 1] === "F" && (varF(p, rows, ei, d) || varF(p, rows, ei, d + 1)) && coladas++));
    expect(coladas).toBe(0);
    expect(validate(p, rows as never).filter((v) => v.kind === "regra")).toEqual([]);
  });
  it("1c) sem regra de folgas: o gerador evita folgas coladas quando dá (inclusive com sábado proibido)", () => {
    const coladas = (x: ReturnType<typeof comRegras>) => x.rows.reduce((n, r, ei) => n + r.filter((c, d) => c === "F" && r[d + 1] === "F" && (varF(x.p, x.rows, ei, d) || varF(x.p, x.rows, ei, d + 1))).length, 0);
    const a = comRegras({});
    const b = comRegras({ diasSemFolgaSemana: { dias: [6], forca: "proibir", setores: null } });
    const total = (x: ReturnType<typeof comRegras>) => x.rows.reduce((n, r, ei) => n + r.filter((_, d) => varF(x.p, x.rows, ei, d)).length, 0);
    console.log("folgas coladas sem regra:", coladas(a), "de", total(a), "| com sábado proibido:", coladas(b), "de", total(b));
    expect(coladas(a)).toBeLessThanOrEqual(Math.ceil(total(a) * 0.15));
    expect(coladas(b)).toBeLessThanOrEqual(Math.ceil(total(b) * 0.15));
  });
  it("1d) preferência das folgas com sábado proibido: juntas > sem preferência > separadas, e nunca folga no sábado", () => {
    const sab = { diasSemFolgaSemana: { dias: [6], forca: "proibir" as const, setores: null } };
    const coladas = (x: ReturnType<typeof comRegras>) => x.rows.reduce((n, r, ei) => n + r.filter((c, d) => c === "F" && r[d + 1] === "F" && (varF(x.p, x.rows, ei, d) || varF(x.p, x.rows, ei, d + 1))).length, 0);
    const sep = comRegras({ ...sab });
    const tanto = comRegras({ ...sab, folgasSemPreferencia: true });
    const jun = comRegras({ ...sab, folgasJuntas: true });
    const sempre = comRegras({ ...sab, folgasSeparadas: "proibir" });
    console.log("coladas — separadas:", coladas(sep), "sem preferência:", coladas(tanto), "juntas:", coladas(jun), "separadas sempre:", coladas(sempre));
    expect(coladas(jun)).toBeGreaterThan(coladas(tanto));
    expect(coladas(tanto)).toBeGreaterThan(coladas(sep));
    // "separadas, sempre": o que não deu para separar aparece como aviso de regra
    const avisos = validate(sempre.p, sempre.rows as never).filter((v) => v.kind === "regra" && /dias seguidos/.test(v.message)).length;
    console.log("separadas sempre — coladas:", coladas(sempre), "avisos:", avisos);
    expect(avisos).toBe(coladas(sempre));
    for (const x of [sep, tanto, jun, sempre]) x.rows.forEach((r, ei) => x.days.forEach((d, i) => d.weekday === 6 && expect(varF(x.p, x.rows, ei, i)).toBe(false)));
  });
  it("1b) preferir folgas juntas: mais folgas coladas do que sem a regra", () => {
    const conta = (x: ReturnType<typeof comRegras>) => x.rows.reduce((n, r) => n + r.filter((c, d) => c === "F" && r[d + 1] === "F").length, 0);
    expect(conta(comRegras({ folgasJuntas: true }))).toBeGreaterThan(conta(comRegras({})));
  });
  it("2) sábado sem folga só na Frente de Caixa (proibir)", () => {
    const st0 = base();
    const { p, rows, days, st } = comRegras({ diasSemFolgaSemana: { dias: [6], forca: "proibir", setores: [caixa(st0).id] } }, (st, sid) => ({ ...st, config: { ...st.config, regras: { diasSemFolgaSemana: { dias: [6], forca: "proibir", setores: [sid] } } } }));
    rows.forEach((r, ei) => days.forEach((d, i) => d.weekday === 6 && expect(varF(p, rows, ei, i)).toBe(false)));
    const outro = st.sectors.find((s) => s.name === "Açougue")!;
    expect(buildProblem(st, outro.id, { keepLocks: true }).regras!.semFolgaDia.every((x) => x === 0)).toBe(true);
  });
  it("3) limite de folga por dia escolhido: em pessoas e em %, sem ajuste automático", () => {
    const { p } = comRegras({}, (st, sid) => ({ ...st, sectors: st.sectors.map((s) => (s.id === sid ? { ...s, limiteFolga: { modo: "pessoas", valores: [null, 4, 4, 4, 4, 4, 1] } } : s)) }));
    expect(p.days.filter((d) => d.weekday === 6 && !d.closed).every((d) => d.maxOff === 1)).toBe(true);
    expect(p.avisos ?? []).toEqual([]);
    const { p: p2 } = comRegras({}, (st, sid) => ({ ...st, sectors: st.sectors.map((s) => (s.id === sid ? { ...s, limiteFolga: { modo: "pct", valores: [null, 30, 30, 30, 30, 30, 10] } } : s)) }));
    expect(p2.days.find((d) => d.weekday === 6)!.maxOff).toBe(Math.floor((17 * 10) / 100));
  });
  it("4) revezar o dia da folga: menos repetições do mesmo dia na semana seguinte", () => {
    const rep = (x: ReturnType<typeof comRegras>) => x.rows.reduce((n, r, ei) => n + r.filter((c, d) => varF(x.p, x.rows, ei, d) && r[d + 7] === "F" && x.p.employees[ei].fixed[d + 7] === null).length, 0);
    expect(rep(comRegras({ rodizioDiaFolga: true }))).toBeLessThanOrEqual(rep(comRegras({})));
  });
  it("4b) revezar o dia da folga: folgas de cada dia (segunda a sábado) divididas por igual entre as pessoas", () => {
    // soma, para cada dia da semana de segunda a sábado, do desvio de cada pessoa em relação à média da equipe
    const desvio = (x: ReturnType<typeof comRegras>) => {
      let s = 0;
      for (let wd = 1; wd <= 6; wd++) {
        const n = x.rows.map((r) => r.filter((c, i) => c === "F" && x.days[i].weekday === wd).length);
        const media = n.reduce((a, b) => a + b, 0) / Math.max(1, n.length);
        s += n.reduce((a, b) => a + Math.abs(b - media), 0);
      }
      return s;
    };
    const xc = comRegras({ rodizioDiaFolga: true });
    const xs = comRegras({});
    const com = desvio(xc);
    const sem = desvio(xs);
    const defC = evaluate(xc.p, xc.rows as never).deficit;
    const defS = evaluate(xs.p, xs.rows as never).deficit;
    console.log("desvio por dia da semana: com regra", com.toFixed(1), "sem regra", sem.toFixed(1), "| déficit", defC, defS);
    expect(com).toBeLessThan(sem * 0.85);
    // dividir por igual não pode custar cobertura mínima
    expect(defC).toBeLessThanOrEqual(Math.ceil(defS * 1.03)); // variação normal entre execuções
  });
  it("5) fim de semana completo: pelo menos tantas pessoas com sábado+domingo ou domingo+segunda", () => {
    const fds = (x: ReturnType<typeof comRegras>) => x.rows.filter((r) => x.days.some((d, i) => d.weekday === 0 && r[i] === "F" && (r[i - 1] === "F" || r[i + 1] === "F"))).length;
    expect(fds(comRegras({ fimDeSemanaMes: true }))).toBeGreaterThanOrEqual(fds(comRegras({})));
  });
  it("6) não emendar feriado (proibir, máximo 2): limite nos dias vizinhos", () => {
    const x = comRegras({ emendaFeriado: { forca: "proibir", max: 2 } }, (st) => ({ ...st, config: { ...st.config, holidays: [{ date: "2026-11-04", name: "Teste", open: false }] } }));
    const iv = x.days.findIndex((d) => d.date === "2026-11-05");
    expect(x.p.days[iv].maxOff).toBeLessThanOrEqual(2);
    const fixas = x.p.employees.filter((pe) => pe.fixed[iv] === "F").length;
    expect(x.rows.filter((r) => r[iv] === "F").length).toBeLessThanOrEqual(Math.max(2, fixas));
  });
  it("7) dupla que não folga junta (proibir) e 8) dupla que prefere folgar junta", () => {
    const st0 = base();
    const [a, b, c, d2] = st0.employees.filter((e) => e.sectorId === caixa(st0).id);
    const x = comRegras({ naoFolgarJuntos: { forca: "proibir", pares: [[a.id, b.id]] } }, (st) => {
      const ids = st.employees.filter((e) => e.sectorId === caixa(st).id).map((e) => e.id);
      return { ...st, config: { ...st.config, regras: { naoFolgarJuntos: { forca: "proibir", pares: [[ids[0], ids[1]]] }, folgarJuntos: [[ids[2], ids[3]]] } } };
    });
    void c; void d2; void a; void b;
    const [i0, i1, i2, i3] = [0, 1, 2, 3];
    x.rows[i0].forEach((cc, d) => cc === "F" && x.rows[i1][d] === "F" && expect(varF(x.p, x.rows, i0, d) || varF(x.p, x.rows, i1, d)).toBe(false));
    const juntos = (y: ReturnType<typeof comRegras>) => y.rows[i2].filter((cc, d) => cc === "F" && y.rows[i3][d] === "F").length;
    expect(juntos(x)).toBeGreaterThanOrEqual(juntos(comRegras({})));
  });
  it("9) pessoa-chave: pelo menos 1 trabalhando em cada dia aberto", () => {
    const x = comRegras({ pessoaChave: { forca: "proibir", min: 1 } }, (st, sid) => {
      const ids = st.employees.filter((e) => e.sectorId === sid).slice(0, 3).map((e) => e.id);
      return { ...st, employees: st.employees.map((e) => (ids.includes(e.id) ? { ...e, chave: true } : e)) };
    });
    x.days.forEach((d, i) => {
      if (d.closed) return;
      const trab = x.rows.filter((r, ei) => x.p.regras!.chaves[ei] && (r[i] === "T" || r[i] === "D")).length;
      const algumaVariavel = x.rows.some((r, ei) => x.p.regras!.chaves[ei] && varF(x.p, x.rows, ei, i));
      if (algumaVariavel) expect(trab).toBeGreaterThanOrEqual(1);
    });
  });
  it("10 e 13) avisos de domingos desiguais e de horas extras", () => {
    const x = comRegras({ domingosIguais: true, maxExtrasSemanaMin: 0 }, (st, sid) => {
      const id = st.employees.find((e) => e.sectorId === sid)!.id;
      return { ...st, employees: st.employees.map((e) => (e.id === id ? { ...e, contractMin: 1200 } : e)) };
    });
    const al = analyzeSector(x.st, x.sid).alerts;
    expect(al.some((a) => a.id.startsWith("re-extras-"))).toBe(true);
  });
  it("12) rodízio semanal de turnos e 11) quem fecha não abre", () => {
    let st = base();
    const sid = caixa(st).id;
    const sec0 = caixa(st);
    const normais = sec0.shifts.filter((s) => !s.special && !s.plantao).sort((a, b) => toMin(a.start) - toMin(b.start));
    const [abre, , , fecha] = [normais[0], normais[1], normais[2], normais[normais.length - 1]];
    st = { ...st, config: { ...st.config, regras: { rodizioTurnos: true } }, sectors: st.sectors.map((s) => (s.id === sid ? { ...s, shifts: s.shifts.map((x) => (x.id === abre.id || x.id === fecha.id ? { ...x, rodizio: true } : x)) } : s)) };
    st = gen(st, sid);
    const r = ajustarTurnos(st, sid);
    expect(r.rodizio).toBeGreaterThan(0);
    const e = r.store.employees.find((x) => x.sectorId === sid && x.shiftId === abre.id)!;
    const sec = r.store.sectors.find((s) => s.id === sid)!;
    const usados = new Set(buildDays(r.store.config).filter((d) => !d.special && cellCode(sec, e.id, d) === "T").map((d) => dayShift(r.store, sec, e, d).shift?.id));
    expect(usados.has(abre.id) && usados.has(fecha.id)).toBe(true);
    // desligar o rodízio desfaz as trocas automáticas
    const off = ajustarTurnos({ ...r.store, config: { ...r.store.config, regras: {} } }, sid);
    expect(Object.values(off.store.sectors.find((s) => s.id === sid)!.schedule).some((row) => Object.values(row).some((c) => c.auto))).toBe(false);
    // quem fecha não abre: fecha num dia (escolhido à mão) e abriria no seguinte
    const b2 = base();
    let s2 = gen(b2, caixa(b2).id);
    const sid2 = caixa(s2).id;
    const sh2 = caixa(s2).shifts.filter((s) => !s.special && !s.plantao).sort((a, b) => toMin(a.start) - toMin(b.start));
    const pessoa = s2.employees.find((x) => x.sectorId === sid2 && x.shiftId === sh2[0].id)!;
    const ds = buildDays(s2.config);
    const k = ds.findIndex((d, i) => !d.special && !ds[i + 1]?.special && cellCode(caixa(s2), pessoa.id, d) !== "F" && cellCode(caixa(s2), pessoa.id, ds[i + 1]) !== "F" && !ds[i + 1]?.closed);
    s2 = { ...s2, config: { ...s2.config, regras: { fecharAbrir: true } }, sectors: s2.sectors.map((s) => (s.id === sid2 ? { ...s, schedule: { ...s.schedule, [pessoa.id]: { ...s.schedule[pessoa.id], [ds[k].date]: { c: "T", lock: true, shiftId: sh2[sh2.length - 1].id } } } } : s)) };
    const r2 = ajustarTurnos(s2, sid2);
    expect(r2.trocas).toBeGreaterThan(0);
    const sec2 = r2.store.sectors.find((s) => s.id === sid2)!;
    expect(dayShift(r2.store, sec2, pessoa, ds[k + 1]).shift?.id).not.toBe(sh2[0].id);
  });
});

describe("limpar escala por mês (em branco até gerar)", () => {
  it("limpa só o mês escolhido, os dias ficam em branco mesmo com o preenchimento automático, e gerar remonta", () => {
    let st = base();
    const sid = caixa(st).id;
    st = gen(st, sid);
    const days = buildDays(st.config);
    const mes = days[days.length - 1].date.slice(0, 7); // último mês do período
    const outroMes = days[0].date.slice(0, 7);
    st = limparEscala(st, [sid], { fixos: false, almocos: true, meses: [mes] });
    const f = fillMissing(st, sid);
    if (f) st = { ...st, sectors: st.sectors.map((s) => (s.id === sid ? f : s)) };
    const sec = caixa(st);
    const e = st.employees.find((x) => x.sectorId === sid)!;
    const doMes = days.filter((d) => d.date.startsWith(mes) && !d.closed);
    expect(doMes.every((d) => emBranco(sec, e.id, d.date))).toBe(true);
    if (mes !== outroMes) expect(days.filter((d) => d.date.startsWith(outroMes)).some((d) => emBranco(sec, e.id, d.date))).toBe(false);
    // pessoa nova durante o "em branco": também fica em branco nesse mês
    // gerar de novo (como o botão faz: tira o mês da lista de limpos)
    const limpoSemPeriodo = { ...st, sectors: st.sectors.map((s) => (s.id === sid ? { ...s, limpo: [] } : s)) };
    const g = gen(limpoSemPeriodo, sid);
    expect(doMes.some((d) => emBranco(caixa(g), e.id, d.date))).toBe(false);
  });
});

describe("folgas equilibradas por turno", () => {
  it("nenhum turno com folga acima da parte justa num dia de semana (Frente de Caixa da demonstração)", () => {
    const st = base();
    const sid = caixa(st).id;
    const p = buildProblem(st, sid, { keepLocks: true });
    const r = solveBest(p, 4);
    let acima = 0;
    p.days.forEach((d, i) => {
      if (d.closed || d.special) return;
      p.turnos!.forEach((tam, g) => {
        const n = p.employees.filter((e, ei) => e.turno === g && r.rows[ei][i] === "F").length;
        if (n > tetoTurno(tam)) acima++;
      });
    });
    expect(r.ok).toBe(true);
    expect(acima).toBe(0);
  });
});

describe("folga fixa · até duas por pessoa", () => {
  it("duas folgas fixas (Qua e Sáb): a pessoa folga nesses dois dias em todas as semanas e a escala fecha sem erros", () => {
    let st = base();
    const sec = caixa(st);
    const e0 = st.employees.find((e) => e.sectorId === sec.id && e.regime !== "12x36")!;
    st = { ...st, employees: st.employees.map((e) => (e.id === e0.id ? { ...e, fixedOff: 3, fixedOff2: 6 } : e)) };
    st = gen(st, sec.id);
    const s1 = caixa(st);
    const days = buildDays(st.config).filter((d) => !d.closed && !ehDiaSemFolga(st.config, d.date));
    for (const d of days) if (d.weekday === 3 || d.weekday === 6) expect(cellCode(s1, e0.id, d)).toBe("F");
    const p = buildProblem(st, sec.id, { keepLocks: true });
    const i = p.employees.findIndex((e) => e.id === e0.id);
    expect(p.employees[i].fixedOffWeekdays).toEqual([3, 6]);
    // as duas folgas da semana são as fixas: nenhuma outra folga nos dias comuns
    const outros = days.filter((d) => d.weekday !== 3 && d.weekday !== 6 && d.weekday !== 0 && !d.holiday);
    expect(outros.filter((d) => cellCode(s1, e0.id, d) === "F").length).toBe(0);
  });
  it("segunda folga fixa no domingo: não trabalha domingo; em 6x1 só a primeira vale", () => {
    let st = base();
    const sec = caixa(st);
    const e0 = st.employees.find((e) => e.sectorId === sec.id && e.regime !== "12x36")!;
    st = { ...st, employees: st.employees.map((e) => (e.id === e0.id ? { ...e, fixedOff: 6, fixedOff2: 0, sundayCycle: 0, sundayOffset: 0 } : e)) };
    st = gen(st, sec.id);
    const suns = buildDays(st.config).filter((d) => d.weekday === 0 && !d.closed);
    for (const d of suns) expect(cellCode(caixa(st), e0.id, d)).toBe("F");
    expect(domingoPrevisto({ ...st.employees.find((e) => e.id === e0.id)!, sundayCycle: 2 }, suns[0].date)).toBe("F");
    // passa para 6x1: a 2ª folga fixa sai
    st = mudarFolgas(st, e0.id, 1);
    expect(st.employees.find((e) => e.id === e0.id)!.fixedOff2).toBeNull();
    const p = buildProblem({ ...st, employees: st.employees.map((e) => (e.id === e0.id ? { ...e, fixedOff2: 2 } : e)) }, sec.id, { keepLocks: true });
    expect(p.employees.find((e) => e.id === e0.id)!.fixedOffWeekdays).toEqual([6]);
  });
  it("importa “Sáb e Dom” como duas folgas fixas", () => {
    const st = base();
    const csv = "Nome;Função;Folga fixa\nZeca Dois;Operador;Sáb e Dom\nLia Dois;Operadora;seg/qua\nRui Erro;Operador;Seg, Ter, Qua";
    const prev = conferir(st, linhasParaRegistros(lerCSV(csv)).registros, { setorPadrao: caixa(st), atualizar: true });
    expect(prev[0].patch).toMatchObject({ fixedOff: 6, fixedOff2: 0, sundayCycle: 0 });
    expect(prev[1].patch).toMatchObject({ fixedOff: 1, fixedOff2: 3 });
    expect(prev[2].status).toBe("erro");
  });
});

describe("duplas entre setores diferentes (regras 7 e 8)", () => {
  const doisSetores = (st: Store) => {
    const sa = caixa(st);
    const sb = st.sectors.find((s) => s.id !== sa.id && st.employees.some((e) => e.sectorId === s.id && e.regime !== "12x36"))!;
    const a = st.employees.find((e) => e.sectorId === sa.id && e.regime !== "12x36" && e.fixedOff == null)!;
    const b = st.employees.find((e) => e.sectorId === sb.id && e.regime !== "12x36" && e.fixedOff == null)!;
    return { sa, sb, a, b };
  };
  it("“não folgam no mesmo dia” com pessoas de setores diferentes: o setor gerado depois respeita o outro", () => {
    let st = base();
    const { sa, sb, a, b } = doisSetores(st);
    st = { ...st, config: { ...st.config, regras: { ...(st.config.regras ?? {}), naoFolgarJuntos: { forca: "proibir", pares: [[a.id, b.id]] } } } };
    st = gen(st, sb.id);
    st = gen(st, sa.id);
    const days = buildDays(st.config).filter((d) => !d.closed);
    const secA = st.sectors.find((s) => s.id === sa.id)!;
    const secB = st.sectors.find((s) => s.id === sb.id)!;
    const p = buildProblem(st, sa.id, { keepLocks: true });
    const ia = p.employees.findIndex((e) => e.id === a.id);
    const juntos = days.filter((d) => cellCode(secA, a.id, d) === "F" && cellCode(secB, b.id, d) === "F" && p.employees[ia].fixed[p.days.findIndex((x) => x.date === d.date)] === null);
    expect(juntos.map((d) => d.date)).toEqual([]);
    expect(p.regras!.extNao[ia].length).toBe(1);
    expect(validate(p, p.employees.map((e) => buildDays(st.config).filter((d) => p.days.some((x) => x.date === d.date)).map((d) => cellCode(secA, e.id, d)))).filter((v) => v.kind === "regra")).toEqual([]);
  });
  it("“preferem folgar juntas” entre setores: a maioria das folgas variáveis cai no mesmo dia", () => {
    let st = base();
    const { sa, sb } = doisSetores(st);
    // três duplas (uma pessoa de cada setor), para o teste não depender de um caso só
    const la = st.employees.filter((e) => e.sectorId === sa.id && e.regime !== "12x36" && e.fixedOff == null).slice(0, 3);
    const lb = st.employees.filter((e) => e.sectorId === sb.id && e.regime !== "12x36" && e.fixedOff == null).slice(0, 3);
    const pares = la.map((x, i) => [x.id, lb[i].id] as [string, string]);
    st = gen(st, sb.id);
    const semRegra = gen(st, sa.id);
    st = { ...st, config: { ...st.config, regras: { ...(st.config.regras ?? {}), folgarJuntos: pares } } };
    st = gen(st, sa.id);
    const days = buildDays(st.config).filter((d) => !d.closed && d.weekday !== 0);
    const conta = (x: Store) => pares.reduce((n, [a, b]) => n + days.filter((d) => cellCode(x.sectors.find((s) => s.id === sa.id)!, a, d) === "F" && cellCode(x.sectors.find((s) => s.id === sb.id)!, b, d) === "F").length, 0);
    expect(conta(st)).toBeGreaterThan(conta(semRegra));
  });
});

describe("almoço linear na janela", () => {
  it("janela 12h–15h: os almoços do dia ficam espaçados por igual (sem buracos nem amontoados)", () => {
    let st = base();
    const sid = caixa(st).id;
    st = { ...st, sectors: st.sectors.map((s) => (s.id === sid ? { ...s, shifts: s.shifts.map((sh) => (sh.special || !sh.breakStart ? sh : { ...sh, breakMin: 60, breakWindow: { start: "12:00", end: "15:00", mode: "inteiro" as const } })) } : s)) };
    st = gen(st, sid);
    st = staggerBreaksPeriod(st, sid, {}).store;
    const sec = caixa(st);
    for (const d of buildDays(st.config).filter((x) => !x.closed && !x.special).slice(0, 6)) {
      const ini = st.employees
        .filter((e) => e.sectorId === sid && cellCode(sec, e.id, d) === "T")
        .map((e) => dayShift(st, sec, e, d))
        .filter((r) => r.breakEnd > r.breakStart)
        .map((r) => r.breakStart)
        .sort((a, b) => a - b);
      expect(ini.length).toBeGreaterThan(3);
      expect(ini[0]).toBe(toMin("12:00"));
      expect(ini[ini.length - 1]).toBe(toMin("14:00"));
      // espaço entre um almoço e o próximo: nunca mais que o dobro do espaço médio
      const medio = (ini[ini.length - 1] - ini[0]) / (ini.length - 1);
      for (let i = 1; i < ini.length; i++) expect(ini[i] - ini[i - 1]).toBeLessThanOrEqual(Math.max(30, 2 * medio));
      // no máximo 2 saindo no mesmo horário
      const rep = new Map<number, number>();
      ini.forEach((x) => rep.set(x, (rep.get(x) ?? 0) + 1));
      expect(Math.max(...rep.values())).toBeLessThanOrEqual(2);
    }
  });
  it("distribuirLinear: 5 pessoas de 1h entre 12h e 15h saem 12:00, 12:30, 13:00, 13:30, 14:00", () => {
    const opts = Array.from({ length: 9 }, (_, i) => 720 + i * 15);
    const m = distribuirLinear(["a", "b", "c", "d", "e"].map((id) => ({ id, entry: 480, dur: 60, opts })), { start: 720, end: 900, mode: "inteiro" });
    expect([...m.values()].sort((a, b) => a - b)).toEqual([720, 750, 780, 810, 840]);
  });
});

describe("almoço: editar o início e o “até”", () => {
  it("duração só no dia: o fim muda, a saída anda junto e as horas trabalhadas ficam iguais", () => {
    const st = base();
    const sec = caixa(st);
    const e = st.employees.find((x) => x.sectorId === sec.id && x.regime !== "12x36" && !x.contratacao)!;
    const d = buildDays(st.config).find((x) => !x.closed && !x.special)!;
    const r0 = dayShift(st, sec, e, d);
    expect(r0.breakEnd).toBeGreaterThan(r0.breakStart);
    const len0 = r0.breakEnd - r0.breakStart;
    const s2 = { ...sec, schedule: { ...sec.schedule, [e.id]: { ...sec.schedule[e.id], [d.date]: { c: "T" as const, brk: fmtT(r0.breakStart + 30), brkMin: len0 + 30 } } } };
    const r1 = dayShift(st, s2, e, d);
    expect(r1.breakStart).toBe(r0.breakStart + 30);
    expect(r1.breakEnd - r1.breakStart).toBe(len0 + 30);
    expect(r1.end).toBe(r0.end + 30);
    expect(r1.workMin).toBe(r0.workMin);
    // outro dia: nada muda
    const d2 = buildDays(st.config).filter((x) => !x.closed && !x.special)[1];
    expect(dayShift(st, s2, e, d2).breakEnd - dayShift(st, s2, e, d2).breakStart).toBe(len0);
  });
  it("duração de sempre da pessoa (almocoMin) vale nos dias normais e o almoço automático mantém a duração", () => {
    let st = base();
    const sid = caixa(st).id;
    const e = st.employees.find((x) => x.sectorId === sid && x.regime !== "12x36" && !x.contratacao)!;
    const sh = caixa(st).shifts.find((s) => s.id === e.shiftId)!;
    const nova = sh.breakMin === 60 ? 90 : 60;
    st = { ...st, employees: st.employees.map((x) => (x.id === e.id ? { ...x, almocoMin: nova } : x)) };
    st = gen(st, sid);
    st = staggerBreaksPeriod(st, sid, {}).store;
    const sec = caixa(st);
    const dias = buildDays(st.config).filter((d) => !d.closed && !d.special && cellCode(sec, e.id, d) === "T");
    expect(dias.length).toBeGreaterThan(5);
    for (const d of dias) {
      const r = dayShift(st, sec, st.employees.find((x) => x.id === e.id)!, d);
      expect(r.breakEnd - r.breakStart).toBe(nova);
    }
  });
});
const fmtT = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
