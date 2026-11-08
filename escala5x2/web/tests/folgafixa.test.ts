// Folga fixa do cadastro: o gerador nunca tira do lugar (só uma edição à mão no dia muda).
import { describe, expect, it } from "vitest";
import { demoStore } from "../src/engine/seed";
import { applyResult, buildProblem, fillMissing, solveBest, validate } from "../src/engine/solver";
import { buildDays, cellCode } from "../src/engine/model";
import type { Store } from "../src/engine/types";

function gen(st: Store, sid: string) {
  const p = buildProblem(st, sid, { keepLocks: true });
  const r = solveBest(p, 3);
  return { st: { ...st, sectors: st.sectors.map((s) => (s.id === sid ? applyResult(s, p, r.rows) : s)) }, p, r };
}

describe("folga fixa", () => {
  it("1 em cada 3 pessoas com folga fixa: todas ficam no lugar em todos os setores (vários cenários)", () => {
    let moved = 0;
    let total = 0;
    for (const seed of [1, 2, 3, 4]) {
      let st = demoStore({ start: "2026-10-26", seed });
      // folga fixa para 1 em cada 3 pessoas, em dias variados
      st = { ...st, employees: st.employees.map((e, i) => (i % 3 === 0 ? { ...e, fixedOff: 1 + (i % 6) } : { ...e, fixedOff: null })) };
      for (const sec of st.sectors) {
        if (!st.employees.some((e) => e.sectorId === sec.id)) continue;
        const f = fillMissing(st, sec.id);
        if (f) st = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? f : s)) };
        const g = gen(st, sec.id);
        st = g.st;
        const s1 = st.sectors.find((s) => s.id === sec.id)!;
        const days = buildDays(st.config);
        for (const e of st.employees.filter((x) => x.sectorId === sec.id && x.fixedOff != null))
          for (const d of days.filter((x) => x.weekday === e.fixedOff && !x.closed)) {
            total++;
            if (cellCode(s1, e.id, d) !== "F") moved++;
          }
        expect(g.r.violations ?? []).toEqual([]);
        const rows = g.p.employees.map((pe) => days.map((d) => cellCode(s1, pe.id, d)));
        expect(validate(g.p, rows).filter((v) => v.kind === "fixed")).toEqual([]);
      }
    }
    expect(total).toBeGreaterThan(80);
    expect(moved).toBe(0);
  });

  it("edição à mão no dia da folga fixa vale mais que o cadastro", () => {
    let st = demoStore({ start: "2026-10-26" });
    const sec = st.sectors.find((s) => s.name === "Frente de Caixa")!;
    const e = st.employees.find((x) => x.sectorId === sec.id)!;
    st = { ...st, employees: st.employees.map((x) => (x.id === e.id ? { ...x, fixedOff: 3 } : x)) };
    const wed = buildDays(st.config).find((d) => d.weekday === 3)!;
    st = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? { ...s, schedule: { ...s.schedule, [e.id]: { ...(s.schedule[e.id] ?? {}), [wed.date]: { c: "T", lock: true } } } } : s)) };
    const g = gen(st, sec.id);
    expect(cellCode(g.st.sectors.find((s) => s.id === sec.id)!, e.id, wed)).toBe("T");
  });
});
