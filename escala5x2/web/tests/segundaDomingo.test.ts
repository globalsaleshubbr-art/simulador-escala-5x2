// Regras avançadas 5c: quem folga no domingo também folga na segunda, até uma % da equipe por domingo.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { demoStore } from "../src/engine/seed";
import { buildProblem, solveBest, usarAjusteAutomaticoDeFolgas, validate } from "../src/engine/solver";
import type { RegrasExtras, Store } from "../src/engine/types";

function loja(regras: RegrasExtras, weekStart?: number) {
  let st: Store = demoStore({ start: "2026-11-02" });
  const cx = st.sectors.find((s) => s.name === "Frente de Caixa")!;
  st = {
    ...st,
    config: { ...st.config, sundayOpen: true, weeks: 8, regras, ...(weekStart != null ? { weekStart } : {}) },
    employees: st.employees.map((e) => (e.sectorId === cx.id ? { ...e, sundayOffset: 0 } : e)),
  };
  const p = buildProblem(st, cx.id, { keepLocks: false });
  const r = solveBest(p, 3);
  const n = p.employees.filter((e) => !e.plantao).length;
  const doms = p.days.map((d, i) => i).filter((i) => p.days[i].weekday === 0 && p.days[i + 1]?.weekday === 1);
  const livre = (ei: number) => !p.employees[ei].plantao;
  const pares = doms.map((s) => r.rows.filter((row, ei) => livre(ei) && row[s] === "F" && row[s + 1] === "F").length);
  const porPessoa = p.employees.map((e, ei) => (e.plantao || e.fixedOffWeekdays?.length || e.fixedOffWeekday != null ? -1 : doms.filter((s) => r.rows[ei][s] === "F" && r.rows[ei][s + 1] === "F").length)).filter((x) => x >= 0);
  const segSozinha = doms.reduce((a, s) => a + r.rows.filter((row, ei) => livre(ei) && p.employees[ei].fixed[s + 1] === null && row[s + 1] === "F" && row[s] !== "F").length, 0);
  return { p, r, n, pares, porPessoa, segSozinha };
}
const SEG_PROIBIDA = { diasSemFolgaSemana: { dias: [1], forca: "proibir" as const, setores: null } };

describe("quem folga no domingo também folga na segunda (até % por domingo)", () => {
  beforeAll(() => usarAjusteAutomaticoDeFolgas(true));
  afterAll(() => usarAjusteAutomaticoDeFolgas(false));
  it("ligada (30%): pares domingo + segunda aparecem, nunca passam do máximo e a escala fica válida", () => {
    const sem = loja({});
    const com = loja({ segundaComDomingo: { pct: 30 } });
    const max = Math.floor(0.3 * com.n);
    expect(com.r.ok).toBe(true);
    expect(Math.max(...com.pares)).toBeLessThanOrEqual(max);
    expect(com.pares.filter((x) => x > 0).length).toBeGreaterThanOrEqual(com.pares.length - 1);
    expect(com.pares.reduce((a, b) => a + b, 0)).toBeGreaterThan(sem.pares.reduce((a, b) => a + b, 0));
    // ninguém passa dos dias seguidos
    expect(validate(com.p, com.r.rows).filter((v) => /dias seguidos/.test(v.message))).toEqual([]);
  });
  it("reveza quem ganha domingo + segunda", () => {
    const com = loja({ segundaComDomingo: { pct: 30 } });
    expect(Math.max(...com.porPessoa) - Math.min(...com.porPessoa)).toBeLessThanOrEqual(2);
  });
  it("com a segunda sem folga: a segunda só vira folga colada ao domingo (exceção da regra)", () => {
    const com = loja({ ...SEG_PROIBIDA, segundaComDomingo: { pct: 30 } });
    expect(com.r.ok).toBe(true);
    expect(com.segSozinha).toBe(0);
    expect(Math.max(...com.pares)).toBeLessThanOrEqual(Math.floor(0.3 * com.n));
    expect(com.pares.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    const sem = loja(SEG_PROIBIDA);
    expect(sem.pares.reduce((a, b) => a + b, 0)).toBe(0);
  });
  it("com “Separadas, sempre”: o par domingo + segunda não conta como folgas coladas", () => {
    const com = loja({ folgasSeparadas: "proibir", segundaComDomingo: { pct: 30 } });
    expect(com.r.ok).toBe(true);
    expect(com.pares.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
  it("semana começando no domingo: também funciona sem passar dos dias seguidos", () => {
    const com = loja({ segundaComDomingo: { pct: 30 } }, 0);
    expect(com.r.ok).toBe(true);
    expect(Math.max(...com.pares)).toBeLessThanOrEqual(Math.floor(0.3 * com.n));
    expect(com.pares.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(validate(com.p, com.r.rows).filter((v) => /dias seguidos/.test(v.message))).toEqual([]);
  });
  it("junto com a 5b (sábado com domingo): as duas valem, cada uma no seu máximo", () => {
    const com = loja({ sabadoComDomingo: true, segundaComDomingo: { pct: 20 } });
    expect(com.r.ok).toBe(true);
    expect(Math.max(...com.pares)).toBeLessThanOrEqual(Math.floor(0.2 * com.n));
    expect(com.pares.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
  it("0%: ninguém ganha domingo + segunda por causa da regra", () => {
    const com = loja({ ...SEG_PROIBIDA, segundaComDomingo: { pct: 0 } });
    expect(com.pares.reduce((a, b) => a + b, 0)).toBe(0);
  });
});
