// Cada regra avançada da loja pode valer só em alguns setores.
import { describe, expect, it } from "vitest";
import { demoStore } from "../src/engine/seed";
import { buildProblem, fillMissing } from "../src/engine/solver";
import { configDoSetor, regrasParaSetor } from "../src/engine/regrasSetor";
import { ajustarTurnos } from "../src/engine/turnos";
import type { Store } from "../src/engine/types";

const base = (): Store => {
  const st = demoStore({ start: "2026-11-02" });
  return { ...st, sectors: st.sectors.map((s) => fillMissing(st, s.id) ?? s) };
};

describe("onde vale cada regra", () => {
  it("regra ligada só num setor não vale nos outros", () => {
    const st0 = base();
    const ac = st0.sectors.find((s) => s.name === "Açougue")!;
    const pa = st0.sectors.find((s) => s.name === "Padaria")!;
    const st: Store = { ...st0, config: { ...st0.config, regras: { folgasSeparadas: "evitar", rodizioDiaFolga: true, ondeVale: { folgasSeparadas: [ac.id] } } } };
    expect(configDoSetor(st.config, ac).regras?.folgasSeparadas).toBe("evitar");
    expect(configDoSetor(st.config, pa).regras?.folgasSeparadas).toBeNull();
    // a regra sem "onde vale" continua em todos
    expect(configDoSetor(st.config, pa).regras?.rodizioDiaFolga).toBe(true);
    expect(buildProblem(st, ac.id).regras).toBeTruthy();
  });

  it("lista vazia = todos os setores; dias sem folga respeitam os setores escolhidos", () => {
    const r = { fimDeSemanaMes: true, ondeVale: { fimDeSemanaMes: [] }, diasSemFolgaSemana: { dias: [6], forca: "proibir" as const, setores: ["x"] } };
    expect(regrasParaSetor(r, "y")?.fimDeSemanaMes).toBe(true);
    expect(regrasParaSetor(r, "y")?.diasSemFolgaSemana).toBeNull();
    expect(regrasParaSetor(r, "x")?.diasSemFolgaSemana?.dias).toEqual([6]);
  });

  it("rodízio de turnos só no setor escolhido", () => {
    const st0 = base();
    const cx = st0.sectors.find((s) => s.name === "Frente de Caixa")!;
    const re = st0.sectors.find((s) => s.name === "Reposição")!;
    const marca = (s: Store["sectors"][number]) => ({ ...s, shifts: s.shifts.map((x) => (x.special ? x : { ...x, rodizio: true })) });
    const st: Store = { ...st0, config: { ...st0.config, regras: { rodizioTurnos: true, ondeVale: { rodizioTurnos: [re.id] } } }, sectors: st0.sectors.map((s) => (s.id === cx.id || s.id === re.id ? marca(s) : s)) };
    expect(ajustarTurnos(st, cx.id).rodizio).toBe(0);
    expect(ajustarTurnos(st, re.id).rodizio).toBeGreaterThan(0);
  });
});
