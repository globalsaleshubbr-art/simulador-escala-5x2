// Horário de almoço fixo por pessoa: quem tem horário fixo almoça sempre nele (dias normais) e fica fora do rodízio;
// os outros continuam no rodízio, dentro da janela, evitando os horários já ocupados pelos fixos.
import { describe, expect, it } from "vitest";
import { demoStore } from "../src/engine/seed";
import { fillMissing } from "../src/engine/solver";
import { assinaturaAlmoco, resetBreaks, staggerBreaksPeriod, withDayBreak } from "../src/engine/breaks";
import { buildDays, cellCode, dayShift } from "../src/engine/model";
import { fmtTime, toMin } from "../src/engine/time";
import type { Store } from "../src/engine/types";

function base(): { st: Store; sid: string; a: string; b: string } {
  let st: Store = demoStore({ start: "2026-11-02" });
  st = { ...st, config: { ...st.config, slot: 30 } };
  const cx = st.sectors.find((s) => s.name === "Frente de Caixa")!;
  const shifts = cx.shifts.map((s) => (s.special ? s : { ...s, start: "08:00", breakStart: "12:00", breakMin: 60, breakWindow: { start: "11:00", end: "14:00", mode: "inteiro" as const } }));
  st = { ...st, sectors: st.sectors.map((s) => (s.id === cx.id ? { ...s, shifts } : s)) };
  st = { ...st, sectors: st.sectors.map((s) => (s.id === cx.id ? fillMissing(st, s.id)! : s)) };
  const pessoas = st.employees.filter((e) => e.sectorId === cx.id && e.regime !== "12x36");
  return { st, sid: cx.id, a: pessoas[0].id, b: pessoas[1].id };
}
const fixar = (st: Store, id: string, hora: string): Store => ({ ...st, employees: st.employees.map((e) => (e.id === id ? { ...e, breakStart: hora, almocoFixo: true } : e)) });

/** Horários de almoço de cada pessoa nos dias normais trabalhados. */
function horarios(st: Store, sid: string) {
  const sec = st.sectors.find((s) => s.id === sid)!;
  const out = new Map<string, string[]>();
  for (const d of buildDays(st.config)) {
    if (d.closed || d.special) continue;
    for (const e of st.employees.filter((x) => x.sectorId === sid && x.regime !== "12x36")) {
      if (cellCode(sec, e.id, d) !== "T") continue;
      const r = dayShift(st, sec, e, d);
      out.set(e.id, [...(out.get(e.id) ?? []), fmtTime(r.breakStart)]);
    }
  }
  return out;
}

describe("almoço com horário fixo por pessoa", () => {
  it("quem é fixo almoça sempre no horário dele; os outros seguem no rodízio, na janela", () => {
    let { st, sid, a, b } = base();
    st = fixar(fixar(st, a, "12:00"), b, "13:00");
    st = staggerBreaksPeriod(st, sid, {}).store;
    const h = horarios(st, sid);
    expect(new Set(h.get(a))).toEqual(new Set(["12:00"]));
    expect(new Set(h.get(b))).toEqual(new Set(["13:00"]));
    const outros = [...h.entries()].filter(([id]) => id !== a && id !== b);
    expect(outros.filter(([, v]) => new Set(v).size > 1).length).toBeGreaterThan(outros.length / 2); // rodízio
    for (const [, v] of outros) for (const t of v) expect(toMin(t) >= toMin("11:00") && toMin(t) + 60 <= toMin("14:00")).toBe(true);
  });
  it("um almoço mudado só num dia (rodízio de antes) sai quando a pessoa vira fixa", () => {
    let { st, sid, a } = base();
    st = staggerBreaksPeriod(st, sid, {}).store; // rodízio grava horários dia a dia
    const sec = st.sectors.find((s) => s.id === sid)!;
    const dia = buildDays(st.config).find((d) => !d.special && !d.closed && cellCode(sec, a, d) === "T")!;
    st = withDayBreak(st, sid, a, dia.date, "13:30");
    st = staggerBreaksPeriod(fixar(st, a, "11:30"), sid, {}).store;
    expect(new Set(horarios(st, sid).get(a))).toEqual(new Set(["11:30"]));
  });
  it("os outros evitam o horário dos fixos", () => {
    let { st, sid, a, b } = base();
    const conta = (s: Store, hora: string, sem: string[]) => [...horarios(s, sid).entries()].filter(([id]) => !sem.includes(id)).reduce((n, [, v]) => n + v.filter((t) => t === hora).length, 0);
    const sem = staggerBreaksPeriod(st, sid, {}).store;
    st = staggerBreaksPeriod(fixar(fixar(st, a, "12:00"), b, "12:00"), sid, {}).store;
    expect(conta(st, "12:00", [a, b])).toBeLessThan(conta(sem, "12:00", [a, b]));
  });
  it("“voltar ao horário do turno” não apaga o horário fixo; mudar o fixo muda a assinatura", () => {
    let { st, sid, a } = base();
    const s0 = assinaturaAlmoco(st, sid);
    st = fixar(st, a, "12:30");
    expect(assinaturaAlmoco(st, sid)).not.toBe(s0);
    st = resetBreaks(st, sid);
    expect(st.employees.find((e) => e.id === a)?.breakStart).toBe("12:30");
  });
});
