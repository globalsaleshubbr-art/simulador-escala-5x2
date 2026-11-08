// Regras avançadas 5b: quem folga no domingo também folga no sábado (liga/desliga), até o limite de folgas do sábado.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { demoStore } from "../src/engine/seed";
import { buildProblem, solveBest, usarAjusteAutomaticoDeFolgas } from "../src/engine/solver";
import type { RegrasExtras, Store } from "../src/engine/types";

function loja(regras: RegrasExtras) {
  let st: Store = demoStore({ start: "2026-11-02" });
  const cx = st.sectors.find((s) => s.name === "Frente de Caixa")!;
  st = {
    ...st,
    config: { ...st.config, sundayOpen: true, weeks: 8, regras },
    // domingo escolhido pelo sistema (como quem é cadastrado novo)
    employees: st.employees.map((e) => (e.sectorId === cx.id ? { ...e, sundayOffset: 0 } : e)),
  };
  const p = buildProblem(st, cx.id, { keepLocks: false });
  const r = solveBest(p, 3);
  const n = p.employees.filter((e) => !e.plantao).length;
  // fins de semana: índice do sábado de cada um
  const sabs = p.days.map((d, i) => i).filter((i) => p.days[i].weekday === 6 && p.days[i + 1]?.weekday === 0);
  const pares = sabs.map((s) => r.rows.filter((row, ei) => !p.employees[ei].plantao && row[s] === "F" && row[s + 1] === "F").length);
  // quem tem folga fixa num dia da semana já usa uma das duas folgas: não entra no par
  const porPessoa = p.employees.map((e, ei) => (e.plantao || e.fixedOffWeekdays?.length || e.fixedOffWeekday != null ? -1 : sabs.filter((s) => r.rows[ei][s] === "F" && r.rows[ei][s + 1] === "F").length)).filter((x) => x >= 0);
  const sabSozinho = sabs.reduce((a, s) => a + r.rows.filter((row, ei) => !p.employees[ei].plantao && p.employees[ei].fixed[s] === null && row[s] === "F" && row[s + 1] !== "F").length, 0);
  return { p, r, n, pares, porPessoa, sabSozinho };
}
const semLimite = (p: { days: { maxOff?: number | null }[] }, i: number) => p.days[i].maxOff ?? Infinity;
const SAB_PROIBIDO = { diasSemFolgaSemana: { dias: [6], forca: "proibir" as const, setores: null } };

describe("quem folga no domingo também folga no sábado (liga/desliga)", () => {
  beforeAll(() => usarAjusteAutomaticoDeFolgas(true));
  afterAll(() => usarAjusteAutomaticoDeFolgas(false));
  it("ligada: fins de semana inteiros aparecem e o sábado nunca passa do limite de folgas do dia", () => {
    const sem = loja({});
    const com = loja({ sabadoComDomingo: true });
    expect(com.r.ok).toBe(true);
    for (const [i, s] of com.p.days.map((d, i) => [i, d] as const)) if (s.weekday === 6 && s.maxOff != null) expect(com.r.rows.filter((r) => r[i] === "F").length).toBeLessThanOrEqual(semLimite(sem.p, i));
    expect(com.pares.filter((x) => x > 0).length).toBeGreaterThanOrEqual(com.pares.length - 1);
    expect(com.pares.reduce((a, b) => a + b, 0)).toBeGreaterThan(sem.pares.reduce((a, b) => a + b, 0));
  });
  it("reveza quem ganha o fim de semana inteiro (entre quem não tem folga fixa na semana)", () => {
    const com = loja({ sabadoComDomingo: true });
    expect(Math.max(...com.porPessoa) - Math.min(...com.porPessoa)).toBeLessThanOrEqual(2);
  });
  it("com o sábado sem folga: o sábado só vira folga colado ao domingo (exceção da regra)", () => {
    const com = loja({ ...SAB_PROIBIDO, sabadoComDomingo: true });
    expect(com.r.ok).toBe(true);
    expect(com.sabSozinho).toBe(0);
    expect(com.pares.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    // sem a regra, nenhum sábado de folga
    const sem = loja(SAB_PROIBIDO);
    expect(sem.pares.reduce((a, b) => a + b, 0)).toBe(0);
  });
  it("com “Separadas, sempre”: o par sábado + domingo não conta como folgas coladas", () => {
    const com = loja({ folgasSeparadas: "proibir", sabadoComDomingo: true });
    expect(com.r.ok).toBe(true);
    expect(com.pares.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
  it("ligada não aumenta o limite de folgas do sábado", () => {
    const sem = loja({});
    const com = loja({ sabadoComDomingo: true });
    com.p.days.forEach((d, i) => d.weekday === 6 && expect(d.maxOff).toBe(sem.p.days[i].maxOff));
  });
  it("aceita o formato antigo com % (conta como ligada)", () => {
    const antigo = loja({ sabadoComDomingo: { pct: 0 } } as RegrasExtras);
    expect(antigo.pares.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});

import { resumoFds } from "../src/engine/solver";
describe("rodízio dos sábados de folga", () => {
  beforeAll(() => usarAjusteAutomaticoDeFolgas(true));
  afterAll(() => usarAjusteAutomaticoDeFolgas(false));
  it("sem regra: os sábados de folga ficam divididos (diferença de no máximo 1)", () => {
    const { p, r } = loja({});
    const f = resumoFds(p, r.rows);
    expect(r.ok).toBe(true);
    expect(f.sabMax - f.sabMin).toBeLessThanOrEqual(1);
  });
  it("com a 5b: fins de semana inteiros divididos por igual (diferença de no máximo 1)", () => {
    const { p, r } = loja({ sabadoComDomingo: true });
    const f = resumoFds(p, r.rows);
    expect(r.ok).toBe(true);
    expect(f.parMax - f.parMin).toBeLessThanOrEqual(1);
    expect(f.sabMax - f.sabMin).toBeLessThanOrEqual(2);
  });
});
