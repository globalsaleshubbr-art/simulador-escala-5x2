import { describe, expect, it } from "vitest";
import { simpleDemoStore } from "../src/engine/seed";
import { gerarSetor } from "../src/engine/gerar";
import { filaSabados } from "../src/engine/solver";
import { buildDays, cellCode, isPlantao } from "../src/engine/model";
import { addDays } from "../src/engine/time";
import type { Store } from "../src/engine/types";

function caixaComLimite(): { st: Store; sid: string } {
  const st0 = simpleDemoStore("2026-11-09");
  const cx = st0.sectors.find((s) => s.name === "Frente de Caixa")!;
  const valores: (number | null)[] = [null, null, null, null, null, null, 2];
  const st: Store = { ...st0, config: { ...st0.config, weeks: 4 }, sectors: st0.sectors.map((s) => (s.id === cx.id ? { ...s, limiteFolga: { modo: "pessoas", valores } } : s)) };
  return { st, sid: cx.id };
}

const sabadosDeFolga = (st: Store, sid: string, starts: string[]) => {
  const sec = st.sectors.find((s) => s.id === sid)!;
  const emps = st.employees.filter((e) => e.sectorId === sid && !isPlantao(e));
  const conta = new Map(emps.map((e) => [e.name, 0]));
  for (const ini of starts)
    for (const d of buildDays(st.config, ini)) if (d.weekday === 6 && !d.closed) for (const e of emps) if (cellCode(sec, e.id, d) === "F") conta.set(e.name, conta.get(e.name)! + 1);
  return conta;
};

describe("rodízio dos sábados de folga", () => {
  it("dentro do período, ninguém repete sábado antes de todos terem folgado um", () => {
    const { st, sid } = caixaComLimite();
    const g = gerarSetor(st, sid).store;
    const c = [...sabadosDeFolga(g, sid, [st.config.startDate]).values()];
    expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(1);
  });
  it("o período seguinte continua a fila: quem ficou sem sábado folga antes de alguém repetir", () => {
    const { st, sid } = caixaComLimite();
    const g1 = gerarSetor(st, sid).store;
    expect(Math.min(...sabadosDeFolga(g1, sid, [st.config.startDate]).values())).toBe(0);
    const g2 = gerarSetor({ ...g1, config: { ...g1.config, startDate: addDays(st.config.startDate, 28) } }, sid);
    expect(g2.p.employees.some((e) => (e.sabAntes ?? 0) > 0)).toBe(true);
    const { tot } = filaSabados(g2.p, g2.rows);
    expect(Math.max(...tot) - Math.min(...tot)).toBeLessThanOrEqual(1);
  });
});

import lojaUsuario from "./loja_usuario.json";
import { excessoTurnos, folgasPorTurno } from "../src/engine/solver";
describe("sábado com domingo (5b) respeita a divisão das folgas entre os turnos", () => {
  it("loja real (Abertura 5 × Tarde 5, sábado com até 2 folgas): nenhum sábado com as 2 folgas no mesmo turno", () => {
    const st = lojaUsuario as unknown as Store;
    const g = gerarSetor(st, "sec_hnsvjniwm");
    const sabs = g.p.days.map((d, i) => i).filter((i) => g.p.days[i].weekday === 6);
    for (const s of sabs) expect([s, excessoTurnos(g.p.turnos!, folgasPorTurno(g.p, g.rows, s))]).toEqual([s, 0]);
  });
});
