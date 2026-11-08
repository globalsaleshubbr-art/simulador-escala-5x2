// Descanso mínimo entre jornadas ao gerar (Regras avançadas, item 14 — opcional, o cliente preenche):
// preenchido, o gerador não escala ninguém em dois dias seguidos com menos descanso; em branco, nada muda.
import { describe, expect, it } from "vitest";
import { demoStore } from "../src/engine/seed";
import { applyResult, buildProblem, solveBest, validate } from "../src/engine/solver";
import { buildDays, cellCode, dayShift, isWorking } from "../src/engine/model";
import { regrasParaSetor } from "../src/engine/regrasSetor";
import type { Code, Store } from "../src/engine/types";

/** Frente de Caixa com um turno que fecha tarde e domingo que abre cedo. */
function loja(sabadoSemFolga: boolean, descanso: number | null): { st: Store; sid: string } {
  let st: Store = demoStore({ start: "2026-11-02" });
  st = {
    ...st,
    config: { ...st.config, sundayOpen: true, weeks: 6, regras: { ...(sabadoSemFolga ? { diasSemFolgaSemana: { dias: [6], forca: "proibir" as const, setores: null } } : {}), descansoObrigatorio: descanso } },
  };
  const cx = st.sectors.find((s) => s.name === "Frente de Caixa")!;
  const normais = cx.shifts.filter((s) => !s.special);
  const tarde = normais[normais.length - 1];
  const shifts = cx.shifts.map((s) => (s.id === tarde.id ? { ...s, start: "13:00", breakStart: "17:00", breakWindow: null } : s.special ? { ...s, start: "07:00" } : s));
  st = { ...st, sectors: st.sectors.map((s) => (s.id === cx.id ? { ...s, shifts } : s)) };
  return { st, sid: cx.id };
}

/** Conferência independente: pares de dias seguidos trabalhados com descanso abaixo de 11h. */
function curtos(st: Store, sid: string) {
  const sec = st.sectors.find((s) => s.id === sid)!;
  const days = buildDays(st.config);
  const out: string[] = [];
  for (const e of st.employees.filter((x) => x.sectorId === sid && x.regime !== "12x36"))
    for (let i = 1; i < days.length; i++) {
      if (!isWorking(cellCode(sec, e.id, days[i - 1])) || !isWorking(cellCode(sec, e.id, days[i]))) continue;
      const rest = dayShift(st, sec, e, days[i]).start + 1440 - dayShift(st, sec, e, days[i - 1]).end;
      if (rest < 660) out.push(`${e.name} ${days[i - 1].date}→${days[i].date}: ${rest} min`);
    }
  return out;
}
const gerar = (st: Store, sid: string) => {
  const p = buildProblem(st, sid, { keepLocks: false });
  const r = solveBest(p, 3);
  return { p, r, st2: { ...st, sectors: st.sectors.map((s) => (s.id === sid ? applyResult(s, p, r.rows) : s)) } };
};

describe("descanso mínimo entre jornadas ao gerar (opcional)", () => {
  it("em branco: o gerador não considera o descanso (como antes)", () => {
    const { st, sid } = loja(false, null);
    const { p, r, st2 } = gerar(st, sid);
    expect(p.minRestMin).toBeUndefined();
    expect(p.employees.every((e) => !e.descansoCurto)).toBe(true);
    expect(r.ok).toBe(true);
    expect(curtos(st2, sid).length).toBeGreaterThan(0); // o caso existe e não é tratado
  });
  it("preenchido (11h) + sábado sem folga: nenhum descanso abaixo de 11h", () => {
    const { st, sid } = loja(true, 660);
    const { p, r, st2 } = gerar(st, sid);
    expect(p.minRestMin).toBe(660);
    expect(r.ok).toBe(true);
    expect(r.descansoAvisos).toEqual([]);
    expect(curtos(st2, sid)).toEqual([]);
  });
  it("preenchido + sábado livre: reduz os descansos curtos; o que sobra (conflito real) vira aviso, sem travar a escala", () => {
    const l0 = loja(false, null);
    const sem = gerar(l0.st, l0.sid);
    const { st, sid } = loja(false, 660);
    const { r, st2 } = gerar(st, sid);
    expect(r.ok).toBe(true);
    const sobra = curtos(st2, sid);
    const antes = curtos(sem.st2, l0.sid);
    console.log("descansos curtos: sem a regra", antes.length, "com a regra", sobra.length);
    expect(r.descansoAvisos?.length).toBe(sobra.length);
    expect(sobra.length).toBeLessThan(antes.length);
  });
  it("a validação acusa dois dias seguidos com descanso curto", () => {
    const { st, sid } = loja(false, 660);
    const p = buildProblem(st, sid, { keepLocks: false });
    const ei = p.employees.findIndex((e) => e.descansoCurto?.some((x) => x != null));
    const rows = p.employees.map(() => p.days.map((x) => (x.special ? "D" : "T")) as Code[]);
    const v = validate(p, rows).filter((x) => x.kind === "descanso" && x.empId === p.employees[ei].id);
    expect(v[0].message).toMatch(/descanso de \d+h\d*.*mínimo 11h entre jornadas/);
  });
  it("vale só nos setores escolhidos em “Onde vale”", () => {
    const st = demoStore({ start: "2026-11-02" });
    const [a, b] = st.sectors;
    const r = { descansoObrigatorio: 660, ondeVale: { descansoObrigatorio: [a.id] } };
    expect(regrasParaSetor(r, a.id)?.descansoObrigatorio).toBe(660);
    expect(regrasParaSetor(r, b.id)?.descansoObrigatorio ?? null).toBeNull();
  });
});
