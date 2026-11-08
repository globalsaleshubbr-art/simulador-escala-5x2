// Regra 8b: quando o titular está de folga, o substituto vai para o turno dele naquele dia.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { demoStore } from "../src/engine/seed";
import { buildProblem, fillMissing, solveBest, usarAjusteAutomaticoDeFolgas } from "../src/engine/solver";
import { ajustarTurnos } from "../src/engine/turnos";
import { buildDays, cellCode, dayShift, isWorking } from "../src/engine/model";
import type { RegrasExtras, Store } from "../src/engine/types";

function base(regras: RegrasExtras | ((a: string, b: string) => RegrasExtras)) {
  let st: Store = demoStore({ start: "2026-11-02" });
  const cx = st.sectors.find((s) => s.name === "Frente de Caixa")!;
  const equipe = st.employees.filter((e) => e.sectorId === cx.id && e.regime !== "12x36");
  const a = equipe[0];
  const b = equipe.find((e) => e.shiftId !== a.shiftId)!;
  const rg = typeof regras === "function" ? regras(a.id, b.id) : regras;
  st = { ...st, config: { ...st.config, sundayOpen: true, regras: rg } };
  return { st, sid: cx.id, a, b };
}

describe("quem cobre a folga de quem (8b)", () => {
  beforeAll(() => usarAjusteAutomaticoDeFolgas(true));
  afterAll(() => usarAjusteAutomaticoDeFolgas(false));
  it("na folga do titular, o substituto faz o turno dele; nos outros dias, o próprio", () => {
    const { st: st0, sid, a, b } = base((x, y) => ({ cobrirFolga: { pares: [[x, y]] } }));
    const st1 = { ...st0, sectors: st0.sectors.map((s) => (s.id === sid ? fillMissing(st0, sid)! : s)) };
    const tur = ajustarTurnos(st1, sid);
    const st = tur.store;
    const sec = st.sectors.find((s) => s.id === sid)!;
    let cobertos = 0;
    for (const d of buildDays(st.config)) {
      if (d.closed || !isWorking(cellCode(sec, b.id, d))) continue;
      const rb = dayShift(st, sec, b, d);
      if (cellCode(sec, a.id, d) === "F") {
        const alvo = d.special ? (a.sundayShiftId ?? sec.defaultSundayShiftId ?? sec.shifts.find((s) => s.special)!.id) : a.shiftId;
        expect(rb.shift?.id).toBe(alvo);
        cobertos++;
      } else if (!d.special) {
        expect(rb.shift?.id).toBe(b.shiftId);
      }
    }
    expect(cobertos).toBeGreaterThan(0);
    expect(tur.cobertos).toBeGreaterThan(0);
  });
  it("a geração evita dar folga aos dois no mesmo dia", () => {
    const juntos = (rg: (x: string, y: string) => RegrasExtras) => {
      const { st, sid, a, b } = base(rg);
      const p = buildProblem(st, sid, { keepLocks: false });
      const r = solveBest(p, 3);
      const ia = p.employees.findIndex((e) => e.id === a.id);
      const ib = p.employees.findIndex((e) => e.id === b.id);
      return r.rows[ia].filter((c, d) => c === "F" && r.rows[ib][d] === "F" && p.employees[ia].fixed[d] === null).length;
    };
    const sem = juntos(() => ({}));
    const com = juntos((x, y) => ({ cobrirFolga: { pares: [[x, y]] } }));
    expect(com).toBeLessThanOrEqual(sem);
    expect(com).toBeLessThanOrEqual(1);
  });
  it("tirar a regra desfaz as trocas", () => {
    const { st: st0, sid, a, b } = base((x, y) => ({ cobrirFolga: { pares: [[x, y]] } }));
    const st1 = { ...st0, sectors: st0.sectors.map((s) => (s.id === sid ? fillMissing(st0, sid)! : s)) };
    const com = ajustarTurnos(st1, sid).store;
    const sem = ajustarTurnos({ ...com, config: { ...com.config, regras: {} } }, sid).store;
    const sec = sem.sectors.find((s) => s.id === sid)!;
    expect(Object.values(sec.schedule[b.id] ?? {}).some((c) => c.auto)).toBe(false);
    void a;
  });
});
