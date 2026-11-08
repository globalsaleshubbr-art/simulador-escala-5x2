// Escala de almoço, modelo 2: horário fixo sugerido por pessoa, rodízio só para quem for marcado,
// ajustes à mão nunca sobrescritos, migração do modelo antigo.
import { describe, expect, it } from "vitest";
import { demoStore } from "../src/engine/seed";
import { fillMissing } from "../src/engine/solver";
import { aplicarAlmocos, almocosEmDia, almocosJuntos, assinaturaAlmoco2, migrarAlmoco, sugerirHorarios } from "../src/engine/almoco";
import { buildDays, cellCode, dayShift } from "../src/engine/model";
import { fmtTime, toMin } from "../src/engine/time";
import type { Store } from "../src/engine/types";

/** Frente de Caixa: turnos entrando 08:00 e 12:00, almoço de 1h com horário de intervalo 11–14 e 15–17. */
function base(): { st: Store; sid: string } {
  let st: Store = demoStore({ start: "2026-11-02" });
  st = { ...st, config: { ...st.config, slot: 30 } };
  const cx = st.sectors.find((s) => s.name === "Frente de Caixa")!;
  const normais = cx.shifts.filter((s) => !s.special);
  const shifts = cx.shifts.map((s) =>
    s.special ? s : s.id === normais[normais.length - 1].id
      ? { ...s, start: "12:00", breakStart: "15:00", breakMin: 60, breakWindow: { start: "15:00", end: "17:00", mode: "inteiro" as const } }
      : { ...s, start: "08:00", breakStart: "12:00", breakMin: 60, breakWindow: { start: "11:00", end: "14:00", mode: "inteiro" as const } },
  );
  st = { ...st, sectors: st.sectors.map((s) => (s.id === cx.id ? { ...s, shifts, almocoVersao: 2 } : s)), employees: st.employees.map((e) => (e.sectorId === cx.id ? { ...e, breakStart: null, almocoFixo: false } : e)) };
  st = { ...st, sectors: st.sectors.map((s) => (s.id === cx.id ? fillMissing(st, s.id)! : s)) };
  return { st, sid: cx.id };
}
const pessoas = (st: Store, sid: string) => st.employees.filter((e) => e.sectorId === sid && e.regime !== "12x36");
/** horários de almoço de cada pessoa nos dias normais trabalhados */
function horarios(st: Store, sid: string) {
  const sec = st.sectors.find((s) => s.id === sid)!;
  const out = new Map<string, string[]>();
  for (const d of buildDays(st.config)) {
    if (d.closed || d.special) continue;
    for (const e of pessoas(st, sid)) {
      if (cellCode(sec, e.id, d) !== "T") continue;
      out.set(e.id, [...(out.get(e.id) ?? []), fmtTime(dayShift(st, sec, e, d).breakStart)]);
    }
  }
  return out;
}
const picoMax = (st: Store, sid: string) => Math.max(...buildDays(st.config).filter((d) => !d.closed && !d.special).map((d) => almocosJuntos(st, sid, d).pico));

describe("almoço modelo 2", () => {
  it("sugestão: cada pessoa ganha um horário fixo, dentro do horário de intervalo do turno, espalhado", () => {
    const { st, sid } = base();
    const juntos0 = picoMax(st, sid); // todos no horário do turno
    const r = almocosEmDia(st, sid);
    const st2 = r.store;
    for (const e of pessoas(st2, sid)) {
      expect(e.breakStart).toBeTruthy();
      const t = toMin(e.breakStart!);
      const sh = st2.sectors.find((s) => s.id === sid)!.shifts.find((s) => s.id === e.shiftId)!;
      expect(t >= toMin(sh.breakWindow!.start) && t + 60 <= toMin(sh.breakWindow!.end)).toBe(true);
    }
    // todos os dias normais no mesmo horário
    for (const [, v] of horarios(st2, sid)) expect(new Set(v).size).toBe(1);
    // menos gente almoçando junto do que todo mundo no horário do turno
    expect(picoMax(st2, sid)).toBeLessThan(juntos0);
  });
  it("horário fixo não fica gravado dia a dia (nada para o sistema sobrescrever)", () => {
    const { st, sid } = base();
    const st2 = almocosEmDia(st, sid).store;
    const sec = st2.sectors.find((s) => s.id === sid)!;
    const comBrk = Object.values(sec.schedule).flatMap((row) => Object.values(row)).filter((c) => c.brk && !c.brkFix);
    // só domingos/feriados (turno do dia) podem ter horário gravado pelo sistema
    expect(comBrk.length).toBe(0);
  });
  it("o horário escolhido pela pessoa fica: o sistema só sugere para quem não tem", () => {
    let { st, sid } = base();
    const [a] = pessoas(st, sid);
    st = { ...st, employees: st.employees.map((e) => (e.id === a.id ? { ...e, breakStart: "13:00" } : e)) };
    const st2 = almocosEmDia(st, sid).store;
    expect(st2.employees.find((e) => e.id === a.id)!.breakStart).toBe("13:00");
    expect(new Set(horarios(st2, sid).get(a.id))).toEqual(new Set(["13:00"]));
    // e de novo (mais uma passada) continua igual
    const st3 = almocosEmDia(st2, sid).store;
    expect(st3.employees.find((e) => e.id === a.id)!.breakStart).toBe("13:00");
  });
  it("“só neste dia” (escolha à mão) nunca é mudado, nem ao sugerir de novo para todos", () => {
    let { st, sid } = base();
    st = almocosEmDia(st, sid).store;
    const [a] = pessoas(st, sid);
    const sec = st.sectors.find((s) => s.id === sid)!;
    const dia = buildDays(st.config).find((d) => !d.closed && !d.special && cellCode(sec, a.id, d) === "T")!;
    st = { ...st, sectors: st.sectors.map((s) => (s.id === sid ? { ...s, schedule: { ...s.schedule, [a.id]: { ...(s.schedule[a.id] ?? {}), [dia.date]: { c: "T", brk: "13:30", brkFix: true } } } } : s)) };
    st = sugerirHorarios(st, sid, { todos: true }).store;
    st = aplicarAlmocos(st, sid).store;
    const sec2 = st.sectors.find((s) => s.id === sid)!;
    expect(fmtTime(dayShift(st, sec2, st.employees.find((e) => e.id === a.id)!, dia).breakStart)).toBe("13:30");
  });
  it("rodízio só para quem for marcado: muda a cada dia, dentro do horário de intervalo", () => {
    let { st, sid } = base();
    const ps = pessoas(st, sid).slice(0, 4).map((e) => e.id);
    st = { ...st, employees: st.employees.map((e) => (ps.includes(e.id) ? { ...e, almocoRodizio: true } : e)) };
    const st2 = almocosEmDia(st, sid).store;
    const h = horarios(st2, sid);
    const variam = ps.filter((id) => new Set(h.get(id)).size > 1).length;
    expect(variam).toBeGreaterThanOrEqual(2);
    for (const [id, v] of h) if (!ps.includes(id)) expect(new Set(v).size).toBe(1);
  });
  it("migração do modelo antigo: horários gravados dia a dia saem; quem tinha horário próprio fica com ele", () => {
    let { st, sid } = base();
    const [a, b] = pessoas(st, sid);
    const sec = st.sectors.find((s) => s.id === sid)!;
    const dias = buildDays(st.config).filter((d) => !d.closed && !d.special && cellCode(sec, b.id, d) === "T").slice(0, 3);
    st = {
      ...st,
      employees: st.employees.map((e) => (e.id === a.id ? { ...e, breakStart: "11:30" } : e)),
      sectors: st.sectors.map((s) => (s.id === sid ? { ...s, almocoVersao: undefined, schedule: { ...s.schedule, [b.id]: { ...(s.schedule[b.id] ?? {}), ...Object.fromEntries(dias.map((d) => [d.date, { c: "T" as const, brk: "13:00" }])) } } } : s)),
    };
    const st2 = migrarAlmoco(st, sid);
    expect(st2.sectors.find((s) => s.id === sid)!.almocoVersao).toBe(2);
    expect(st2.employees.find((e) => e.id === a.id)!.breakStart).toBe("11:30");
    const h = horarios(st2, sid);
    expect(new Set(h.get(b.id)).size).toBe(1); // o 13:00 antigo, gravado em 3 dias, saiu
    expect(migrarAlmoco(st2, sid)).toBe(st2); // uma vez só
  });
  it("assinatura: muda com folga trocada, não muda com o que o próprio sistema grava", () => {
    let { st, sid } = base();
    const r = almocosEmDia(st, sid);
    st = r.store;
    const ass = assinaturaAlmoco2(st, sid);
    expect(st.sectors.find((s) => s.id === sid)!.almocoAssinatura).toBe(ass);
    expect(almocosEmDia(st, sid).mudancas).toBe(0);
    const [a] = pessoas(st, sid);
    const d = buildDays(st.config).find((x) => !x.closed && !x.special)!;
    const st2 = { ...st, sectors: st.sectors.map((s) => (s.id === sid ? { ...s, schedule: { ...s.schedule, [a.id]: { ...(s.schedule[a.id] ?? {}), [d.date]: { c: "F" as const, lock: true } } } } : s)) };
    expect(assinaturaAlmoco2(st2, sid)).not.toBe(ass);
  });
});

import { extractCellShifts, applyCellShifts } from "../src/storage/storage";
describe("gravação do almoço do dia", () => {
  it("guarda horário, duração e a marca 'só neste dia'", () => {
    const sched: any = { a: { "2026-11-02": { code: "T", brk: "13:00", brkFix: true, brkMin: 45 }, "2026-11-03": { code: "T", shiftId: "s2" }, "2026-11-04": { code: "T", brk: "12:00" } } };
    const map = extractCellShifts(sched);
    const novo: any = { a: { "2026-11-02": { code: "T" }, "2026-11-03": { code: "T" }, "2026-11-04": { code: "T" } } };
    applyCellShifts(novo, JSON.parse(JSON.stringify(map)));
    expect(novo.a["2026-11-02"]).toMatchObject({ brk: "13:00", brkFix: true, brkMin: 45 });
    expect(novo.a["2026-11-03"]).toMatchObject({ shiftId: "s2" });
    expect(novo.a["2026-11-03"].brkFix).toBeUndefined();
    expect(novo.a["2026-11-04"]).toMatchObject({ brk: "12:00" });
    expect(novo.a["2026-11-04"].brkFix).toBeUndefined();
  });
});

describe("gravação do turno automático do dia", () => {
  it("guarda a marca de turno trocado pelas regras", () => {
    const sched: any = { a: { "2026-11-02": { code: "T", shiftId: "s2", auto: true }, "2026-11-03": { code: "T", shiftId: "s3" } } };
    const map = extractCellShifts(sched);
    const novo: any = { a: { "2026-11-02": { code: "T" }, "2026-11-03": { code: "T" } } };
    applyCellShifts(novo, JSON.parse(JSON.stringify(map)));
    expect(novo.a["2026-11-02"]).toMatchObject({ shiftId: "s2", auto: true });
    expect(novo.a["2026-11-03"].auto).toBeUndefined();
  });
});
