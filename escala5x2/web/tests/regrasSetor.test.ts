// Regras avançadas por setor: um setor pode seguir a loja ou ter regras próprias.
import { describe, expect, it } from "vitest";
import { demoStore } from "../src/engine/seed";
import { buildProblem, fillMissing, solveBest, validate } from "../src/engine/solver";
import { analyzeSector } from "../src/engine/analysis";
import { configDoSetor, refDaLoja } from "../src/engine/regrasSetor";
import type { Store } from "../src/engine/types";

const base = (): Store => {
  const st = demoStore({ start: "2026-11-02" });
  return { ...st, sectors: st.sectors.map((s) => { const f = fillMissing(st, s.id); return f ?? s; }) };
};

describe("regras avançadas por setor", () => {
  it("sem regras próprias, o setor usa as da loja", () => {
    const st = base();
    const sec = st.sectors.find((s) => s.name === "Açougue")!;
    expect(configDoSetor(st.config, sec)).toBe(st.config);
    expect(buildProblem(st, sec.id).maxConsec).toBe(st.config.maxConsecutive);
  });

  it("regras próprias valem só para o setor", () => {
    const st0 = base();
    const ac = st0.sectors.find((s) => s.name === "Açougue")!;
    const pa = st0.sectors.find((s) => s.name === "Padaria")!;
    const st: Store = { ...st0, sectors: st0.sectors.map((s) => (s.id === ac.id ? { ...s, regrasProprias: { ref: { ...refDaLoja(st0.config), maxConsecutive: 5 }, regras: { rodizioDiaFolga: true } } } : s)) };
    const pA = buildProblem(st, ac.id);
    const pP = buildProblem(st, pa.id);
    expect(pA.maxConsec).toBe(5);
    expect(pA.regras).toBeTruthy();
    expect(pP.maxConsec).toBe(st.config.maxConsecutive);
    expect(pP.regras).toBeUndefined();
    // a escala gerada do açougue respeita o máximo próprio de 5 dias seguidos
    const r = solveBest(pA, 2);
    expect(r.ok).toBe(true);
    expect(validate(pA, r.rows)).toEqual([]);
    for (const row of r.rows) {
      let run = 0, max = 0;
      for (const c of row) { run = c === "T" || c === "D" ? run + 1 : 0; max = Math.max(max, run); }
      expect(max).toBeLessThanOrEqual(5);
    }
  });

  it("alertas usam os valores de referência do setor", () => {
    const st0 = base();
    const ac = st0.sectors.find((s) => s.name === "Açougue")!;
    // intervalo máximo de 1h no açougue: os turnos de 1h30 passam a gerar aviso só nele
    const st: Store = { ...st0, sectors: st0.sectors.map((s) => (s.id === ac.id ? { ...s, regrasProprias: { ref: { ...refDaLoja(st0.config), breakMax: 60 }, regras: {} } } : s)) };
    const temAviso = (sid: string) => analyzeSector(st, sid).alerts.some((a) => a.text.includes("acima do máximo configurado"));
    expect(temAviso(ac.id)).toBe(true);
    const re = st.sectors.find((s) => s.name === "Reposição")!; // também tem turnos de 1h30, mas segue a loja (máximo 2h)
    expect(temAviso(re.id)).toBe(false);
  });
});
