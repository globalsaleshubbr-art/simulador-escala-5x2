import { describe, expect, it } from "vitest";
import { simpleDemoStore } from "../src/engine/seed";
import { applyResult, buildProblem, solveBest } from "../src/engine/solver";
import { buildDays } from "../src/engine/model";

const demo = () => simpleDemoStore("2026-11-09");

describe("gerar a escala preserva o que foi escolhido em cada dia", () => {
  it("mantém a marca de turno automático, o almoço escolhido à mão e a duração do almoço do dia", () => {
    const st = demo();
    const sec = st.sectors.find((s) => s.name === "Hortifruti")!;
    const e = st.employees.find((x) => x.sectorId === sec.id)!;
    const d = buildDays(st.config)[1].date;
    const outro = sec.shifts.find((s) => !s.special && s.id !== e.shiftId)!.id;
    const cel = { c: "T" as const, lock: true, shiftId: outro, auto: true, brk: "13:00", brkFix: true, brkMin: 30 };
    const sec1 = { ...sec, schedule: { ...sec.schedule, [e.id]: { [d]: cel } } };
    const st1 = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? sec1 : s)) };
    const p = buildProblem(st1, sec.id, { keepLocks: true });
    const out = applyResult(sec1, p, solveBest(p, 1).rows);
    expect(out.schedule[e.id][d]).toEqual(cel);
  });
});

// ---------- almoço olhando quantas pessoas a loja precisa ----------
import { almocosEmDia, definirAlmoco, sugerirHorarios } from "../src/engine/almoco";
import { cellCode, requirementAt, slotAxis } from "../src/engine/model";
import { daySlotStates } from "../src/engine/coverage";
import { gerarSetor } from "../src/engine/gerar";
import { analyzeSector } from "../src/engine/analysis";
import type { Store } from "../src/engine/types";

/** Hortifruti com um turno só (08:00, almoço de 1h entre 11:00 e 15:00) e necessidade alta das 11 às 13. */
function lojaAlmoco(): { st: Store; sid: string } {
  let st = demo();
  const sec = st.sectors.find((s) => s.name === "Hortifruti")!;
  const normal = { ...sec.shifts.find((s) => !s.special)!, start: "08:00", workMin: 480, breakStart: "12:00", breakMin: 60, breakWindow: { start: "11:00", end: "15:00", mode: "inteiro" as const } };
  const regra = (start: string, end: string, min: number) => ({ id: `r${start}`, days: [1, 2, 3, 4, 5, 6], start, end, min, ideal: null, date: null, label: "" });
  const sec2 = { ...sec, shifts: [normal, ...sec.shifts.filter((s) => s.special)], minRules: [regra("08:30", "11:00", 2), regra("11:00", "13:00", 5), regra("13:00", "16:00", 1)] };
  st = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? sec2 : s)), employees: st.employees.map((e) => (e.sectorId === sec.id ? { ...e, shiftId: normal.id, breakStart: null, almocoFixo: false } : e)) };
  return { st: gerarSetor(st, sec.id).store, sid: sec.id };
}
/** faixas em que falta gente no posto e alguém do setor está almoçando */
function faltaNoAlmoco(st: Store, sid: string): number {
  const sec = st.sectors.find((s) => s.id === sid)!;
  const days = buildDays(st.config);
  const axis = slotAxis(st.config, days);
  const emps = st.employees.filter((e) => e.sectorId === sid);
  let n = 0;
  for (const d of days) {
    if (d.closed || d.special) continue;
    const est = emps.map((e) => daySlotStates(st, e, d, axis));
    axis.forEach((t, i) => {
      const no = est.filter((s) => s[i].state === "working").length;
      const alm = est.filter((s) => s[i].state === "break").length;
      if (alm && no < requirementAt(sec, d, t).min) n++;
    });
  }
  return n;
}

describe("almoço olha a necessidade de pessoas (Fluxo alto)", () => {
  it("ninguém almoça num horário em que o almoço deixaria faltar gente, quando dá para almoçar em outro", () => {
    const { st, sid } = lojaAlmoco();
    expect(faltaNoAlmoco(st, sid)).toBe(0);
  });
  it("ao gerar, o horário sugerido pelo sistema é refeito; o escolhido à mão fica", () => {
    let { st, sid } = lojaAlmoco();
    const [a, b] = st.employees.filter((e) => e.sectorId === sid);
    st = definirAlmoco(st, a.id, { hora: "11:00" });
    // b com um horário sugerido ruim (no meio da necessidade alta)
    st = { ...st, employees: st.employees.map((e) => (e.id === b.id ? { ...e, breakStart: "11:30", almocoFixo: true, almocoAuto: true } : e)) };
    st = gerarSetor(st, sid).store;
    expect(st.employees.find((e) => e.id === a.id)!.breakStart).toBe("11:00");
    expect(st.employees.find((e) => e.id === a.id)!.almocoAuto).toBeFalsy();
    expect(st.employees.find((e) => e.id === b.id)!.breakStart).not.toBe("11:30");
  });
  it("“Sugerir horários de novo” marca os horários como sugeridos pelo sistema", () => {
    const { st, sid } = lojaAlmoco();
    const st2 = sugerirHorarios(st, sid, { todos: true }).store;
    for (const e of st2.employees.filter((x) => x.sectorId === sid)) expect(e.almocoAuto).toBe(true);
  });
});

// ---------- equilíbrio das folgas entre os dias e entre abertura / fechamento ----------
describe("folgas equilibradas entre os dias da semana e entre os turnos", () => {
  it("de segunda a sábado, a diferença de folgas entre dois dias é no máximo 1 (salvo dia no limite de folgas)", () => {
    // a loja de demonstração muda a cada vez (nomes e identificadores sorteados): várias rodadas
    for (let k = 0; k < 8; k++) equilibrioDias(demo());
  });
  function equilibrioDias(st0: Store) {
    let st = st0;
    for (const sec of st.sectors.filter((s) => !s.hidden && st.employees.some((e) => e.sectorId === s.id))) {
      st = gerarSetor(st, sec.id).store;
      const p = buildProblem(st, sec.id, { keepLocks: true });
      const s2 = st.sectors.find((s) => s.id === sec.id)!;
      const pessoas = st.employees.filter((e) => e.sectorId === sec.id && e.regime !== "12x36");
      for (let w = 0; w < p.weeks; w++) {
        const dias = p.days.map((d, i) => ({ d, i })).filter(({ d }) => d.week === w && !d.closed && !d.special);
        const off = dias.map(({ d }) => pessoas.filter((e) => cellCode(s2, e.id, buildDays(st.config)[p.days.indexOf(d)]) === "F").length);
        const cap = dias.map(({ d }) => d.maxOff ?? Infinity);
        let dif = 0;
        for (let a = 0; a < dias.length; a++)
          for (let b = 0; b < dias.length; b++) if (off[b] < cap[b]) dif = Math.max(dif, off[a] - off[b]);
        if (dif > 1) throw new Error(`${sec.name} semana ${w + 1}: folgas por dia ${off.join("/")}`);
      }
    }
  }
  it("turnos agrupados pelo horário: quem abre, intermediário e quem fecha", () => {
    const st = demo();
    const cx = st.sectors.find((s) => s.name === "Frente de Caixa")!;
    const p = buildProblem(st, cx.id, { keepLocks: true });
    // Abertura 08:15, Tarde A 08:45 e Tarde B 09:15 abrem juntos; Intermediário (10:30) é quem fecha
    expect(p.turnoNomes).toEqual(["Abertura", "Fechamento"]);
    expect(p.turnos).toEqual([13, 4]);
  });
});

// ---------- folgas calculadas com os almoços já distribuídos ----------
describe("folgas e almoços calculados juntos", () => {
  it("a geração não deixa mais falta de gente do que gerar as folgas e só depois os almoços", () => {
    for (const nome of ["Frente de Caixa", "Padaria", "Açougue"]) {
      const st = demo();
      const sid = st.sectors.find((s) => s.name === nome)!.id;
      const umaVez = gerarSetor(st, sid, { refinar: false }).store;
      const junto = gerarSetor(st, sid).store;
      expect(analyzeSector(junto, sid).totals.deficitHoursPerWeek).toBeLessThanOrEqual(analyzeSector(umaVez, sid).totals.deficitHoursPerWeek + 1e-9);
    }
  });
});

// ---------- regra 3 (folgas por igual entre os dias) liga e desliga ----------
describe("regra 3: distribuir as folgas por igual entre os dias", () => {
  const comRegra3 = (st: Store, v: boolean | undefined, onde?: string[]): Store => ({ ...st, config: { ...st.config, regras: { ...(st.config.regras ?? {}), folgasDiasIguais: v, ...(onde ? { ondeVale: { folgasDiasIguais: onde } } : {}) } } });
  it("vem ligada (sem nada configurado o equilíbrio vale)", () => {
    const st = demo();
    const cx = st.sectors.find((s) => s.name === "Frente de Caixa")!;
    expect(buildProblem(st, cx.id, { keepLocks: true }).diasIguais).toBe(true);
  });
  it("desligada: o motor não força o equilíbrio entre os dias", () => {
    const st = comRegra3(demo(), false);
    const cx = st.sectors.find((s) => s.name === "Frente de Caixa")!;
    expect(buildProblem(st, cx.id, { keepLocks: true }).diasIguais).toBe(false);
  });
  it("vale só nos setores escolhidos", () => {
    const st0 = demo();
    const cx = st0.sectors.find((s) => s.name === "Frente de Caixa")!;
    const ac = st0.sectors.find((s) => s.name === "Açougue")!;
    const st = comRegra3(st0, true, [cx.id]);
    expect(buildProblem(st, cx.id, { keepLocks: true }).diasIguais).toBe(true);
    expect(buildProblem(st, ac.id, { keepLocks: true }).diasIguais).toBe(false);
  });
});

// ---------- regra 3b: máximo de folgas por dia e por turno ----------
import { explainInfeasibility, validate, impede, turnosDoSetor } from "../src/engine/solver";
describe("regra 3b: máximo de folgas por dia e por turno", () => {
  const comLimiteTurno = (st: Store, sid: string, lim: Record<string, (number | null)[]>): Store => ({ ...st, sectors: st.sectors.map((s) => (s.id === sid ? { ...s, limiteFolgaTurno: lim } : s)) });
  const seg_sab = (n: number | null) => [null, n, n, n, n, n, n];
  it("os turnos do setor saem do horário (quem abre / intermediário / quem fecha)", () => {
    const st = demo();
    const cx = st.sectors.find((s) => s.name === "Frente de Caixa")!;
    const t = turnosDoSetor(st, cx);
    expect(t.chaves).toEqual(["abertura", "fechamento"]);
    expect(t.nomes).toEqual(["Abertura", "Fechamento"]);
    expect(t.tamanhos).toEqual([13, 4]);
  });
  it("o gerador respeita o máximo de cada turno em cada dia", () => {
    const st0 = demo();
    const cx = st0.sectors.find((s) => s.name === "Frente de Caixa")!;
    // Fechamento (4 pessoas): nas semanas em que só uma folga no domingo, são 7 folgas de segunda a sábado
    const fech = [null, 1, 1, 1, 2, 2, 1];
    const abre = [null, 5, 5, 5, 5, 5, 2];
    const st = comLimiteTurno(st0, cx.id, { fechamento: fech, abertura: abre });
    const p = buildProblem(st, cx.id, { keepLocks: true });
    const r = solveBest(p, 4);
    expect(r.ok).toBe(true);
    p.days.forEach((d, i) => {
      if (d.closed || d.special) return;
      const porTurno = [0, 0];
      r.rows.forEach((row, ei) => row[i] === "F" && (p.employees[ei].turno ?? -1) >= 0 && porTurno[p.employees[ei].turno!]++);
      expect(porTurno[0]).toBeLessThanOrEqual(abre[d.weekday]!);
      expect(porTurno[1]).toBeLessThanOrEqual(fech[d.weekday]!);
    });
  });
  it("passar do máximo do turno é apontado na validação", () => {
    const st0 = demo();
    const cx = st0.sectors.find((s) => s.name === "Frente de Caixa")!;
    const st = comLimiteTurno(st0, cx.id, { fechamento: seg_sab(0) });
    const p = buildProblem(st, cx.id, { keepLocks: true });
    const rows = p.employees.map((e) => p.days.map((d) => (d.closed ? "F" : d.special ? "D" : "T"))) as never as import("../src/engine/types").Code[][];
    const seg = p.days.findIndex((d) => d.weekday === 1);
    const f = p.employees.findIndex((e) => e.turno === 1);
    rows[f][seg] = "F";
    expect(validate(p, rows).filter(impede).some((v) => /Fechamento/.test(v.message))).toBe(true);
  });
  it("máximo de 1 folga por dia no Fechamento não cabe quando só uma pessoa do turno folga no domingo: o motivo é explicado", () => {
    const st0 = demo();
    const cx = st0.sectors.find((s) => s.name === "Frente de Caixa")!;
    const p = buildProblem(comLimiteTurno(st0, cx.id, { fechamento: seg_sab(1) }), cx.id, { keepLocks: true });
    expect(explainInfeasibility(p).some((t) => /Semana 2: Fechamento precisa de 8 folgas, mas os máximos .* somam 7/.test(t))).toBe(true);
  });
  it("máximo impossível (o turno não cabe as folgas da semana): o motivo é explicado", () => {
    const st0 = demo();
    const cx = st0.sectors.find((s) => s.name === "Frente de Caixa")!;
    const st = comLimiteTurno(st0, cx.id, { fechamento: seg_sab(0) });
    const p = buildProblem(st, cx.id, { keepLocks: true });
    expect(explainInfeasibility(p).some((t) => /Fechamento/.test(t))).toBe(true);
  });
});
