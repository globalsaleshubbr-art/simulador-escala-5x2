// Férias programadas (sem admissão): de … até; escolha automática espalha cada setor pelos próximos 12 meses.
import { describe, expect, it } from "vitest";
import { demoStore } from "../src/engine/seed";
import { escolherMeses, mesDe, nomeMes, planoFerias, programadasAcimaDoLimite, setVacation } from "../src/simple/vacations";

const HOJE = "2026-11-06";
describe("férias programadas (de … até)", () => {
  it("nomes, meses e período", () => {
    expect(nomeMes("2027-07")).toBe("julho/2027");
    expect(mesDe(HOJE, 2)).toBe("2027-01");
    const e: any = { feriasDe: "2027-03-10", feriasAte: "2027-03-24" };
    expect(planoFerias(e, 30)).toEqual({ ini: "2027-03-10", fim: "2027-03-24", dias: 15 });
    // formato antigo (só o mês) vira do dia 1 pelos dias da loja
    expect(planoFerias({ feriasMes: "2027-07" } as any, 30)).toEqual({ ini: "2027-07-01", fim: "2027-07-30", dias: 30 });
    expect(planoFerias({} as any, 30)).toBeNull();
  });
  it("espalha cada setor pelos 12 meses seguintes, sem mexer em quem já tem período", () => {
    let st = demoStore({ start: "2026-11-02" });
    const fixo = st.employees[0];
    st = { ...st, employees: st.employees.map((e) => (e.id === fixo.id ? { ...e, feriasDe: "2027-03-10", feriasAte: "2027-03-20" } : e)) };
    const r = escolherMeses(st, HOJE, null, undefined, 30);
    expect(r.store.employees.find((e) => e.id === fixo.id)!).toMatchObject({ feriasDe: "2027-03-10", feriasAte: "2027-03-20" });
    expect(r.store.employees.every((e) => e.feriasDe && e.feriasAte)).toBe(true);
    for (const e of r.store.employees) {
      if (e.id === fixo.id) continue;
      expect(e.feriasDe! >= "2026-12-01" && e.feriasDe! <= "2027-11-16").toBe(true);
      expect(planoFerias(e, 30)!.dias).toBe(30);
    }
    // setor pequeno: um por mês, sem repetir
    const sec = st.sectors.find((s) => { const n = st.employees.filter((e) => e.sectorId === s.id).length; return n >= 6 && n <= 11; })!;
    const ms = r.store.employees.filter((e) => e.sectorId === sec.id && e.id !== fixo.id).map((e) => e.feriasDe!.slice(0, 7));
    expect(new Set(ms).size).toBe(ms.length);
  });
  it("respeita o limite de pessoas ao mesmo tempo e quem já tem férias lançadas fica de fora", () => {
    let st = demoStore({ start: "2026-11-02" });
    const sec = st.sectors.find((s) => { const n = st.employees.filter((e) => e.sectorId === s.id).length; return n >= 6 && n <= 11; })!;
    const quem = st.employees.find((e) => e.sectorId === sec.id)!;
    st = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? setVacation(s, quem.id, "2027-02-01", 30) : s)) };
    const r = escolherMeses(st, HOJE, 1, new Set([sec.id]), 30);
    expect(r.store.employees.find((e) => e.id === quem.id)!.feriasDe ?? null).toBeNull();
    expect(r.acima).toBe(0);
    expect(programadasAcimaDoLimite(r.store, r.store.sectors.find((s) => s.id === sec.id)!, 1, 30)).toEqual([]);
  });
});
