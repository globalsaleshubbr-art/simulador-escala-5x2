// Equipe grande com sábado sem folga: o limite automático de folgas por dia precisa caber todas as folgas da semana,
// e a explicação de 6x1 com folga só em alguns domingos.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { demoStore } from "../src/engine/seed";
import { buildProblem, explainInfeasibility, solveBest, usarAjusteAutomaticoDeFolgas } from "../src/engine/solver";
import type { Store } from "../src/engine/types";

function comEquipe(n: number): { st: Store; sid: string } {
  let st: Store = demoStore({ start: "2026-11-02" });
  st = { ...st, config: { ...st.config, sundayOpen: true, weeks: 4, regras: { diasSemFolgaSemana: { dias: [6], forca: "proibir", setores: null } } } };
  const cx = st.sectors.find((s) => s.name === "Frente de Caixa")!;
  // domingo escolhido pelo sistema (sundayOffset 0), como fica quem é cadastrado novo
  const base = st.employees.filter((e) => e.sectorId === cx.id && e.regime !== "12x36" && e.fixedOff == null).map((e) => ({ ...e, sundayOffset: 0 }));
  const extra = Array.from({ length: Math.max(0, n - base.length) }, (_, i) => ({ ...base[i % base.length], id: `x${i}`, name: `Extra ${i}`, matricula: `9${i}` }));
  st = { ...st, employees: [...st.employees.filter((e) => e.sectorId !== cx.id), ...base, ...extra] };
  return { st, sid: cx.id };
}

describe("equipe grande", () => {
  beforeAll(() => usarAjusteAutomaticoDeFolgas(true));
  afterAll(() => usarAjusteAutomaticoDeFolgas(false));
  it("20 e 30 pessoas com sábado proibido: o limite de folgas por dia sobe o bastante e a escala sai", () => {
    for (const n of [20, 30]) {
      const { st, sid } = comEquipe(n);
      const p = buildProblem(st, sid, { keepLocks: true });
      const r = solveBest(p, 3);
      expect(r.violations.map((v) => v.message)).toEqual([]);
      expect(r.ok).toBe(true);
    }
  });
  it("6x1 com folga só em alguns domingos: explica por que não cabe e como resolver", () => {
    const { st, sid } = comEquipe(10);
    const alvo = st.employees.find((e) => e.sectorId === sid)!;
    const st2 = { ...st, employees: st.employees.map((e) => (e.id === alvo.id ? { ...e, folgasSemana: 1, sundayCycle: 2, sundayOffset: 0 } : e)) };
    const p = buildProblem(st2, sid, { keepLocks: true });
    const ex = explainInfeasibility(p).find((t) => t.startsWith(alvo.name));
    expect(ex).toMatch(/6x1/);
    expect(ex).toMatch(/Não trabalha domingo/);
    // com "Não trabalha domingo", não há explicação para essa pessoa
    const st3 = { ...st, employees: st.employees.map((e) => (e.id === alvo.id ? { ...e, folgasSemana: 1, sundayCycle: 0, sundayOffset: 0 } : e)) };
    const p3 = buildProblem(st3, sid, { keepLocks: true });
    expect(explainInfeasibility(p3).some((t) => t.startsWith(alvo.name))).toBe(false);
    // e a escala sai, sem passar de 6 dias seguidos
    const r3 = solveBest(p3, 3);
    expect(r3.violations.filter((v) => v.kind === "consec")).toEqual([]);
  });
});
