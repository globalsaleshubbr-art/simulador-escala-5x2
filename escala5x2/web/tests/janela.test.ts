// A janela de almoço "de hora a tal hora" manda: o intervalo fica dentro dela mesmo quando as regras de posição não cabem.
import { describe, expect, it } from "vitest";
import { demoStore } from "../src/engine/seed";
import { fillMissing } from "../src/engine/solver";
import { opcoesNaJanela, staggerBreaksPeriod } from "../src/engine/breaks";
import { buildDays, cellCode, dayShift } from "../src/engine/model";
import { toMin } from "../src/engine/time";
import type { Store } from "../src/engine/types";

describe("janela de almoço", () => {
  it("sem horário que cumpra as regras, usa a janela (cabendo no expediente)", () => {
    const win = { start: toMin("11:00"), end: toMin("12:30"), mode: "inteiro" as const };
    // entra 10:00: as regras pedem 2h de trabalho antes (12:00), que não cabe numa janela que termina 12:30 com 1h
    const ok = (b: number) => b - toMin("10:00") >= 120;
    expect(opcoesNaJanela(win, 60, toMin("10:00"), toMin("19:00"), ok, 30)).toEqual([toMin("11:00"), toMin("11:30")]);
    // com horário que cumpre, só os que cumprem
    const win2 = { start: toMin("11:00"), end: toMin("14:00"), mode: "inteiro" as const };
    expect(opcoesNaJanela(win2, 60, toMin("10:00"), toMin("19:00"), ok, 30)).toEqual([toMin("12:00"), toMin("12:30"), toMin("13:00")]);
  });

  it("gerar os almoços deixa todos dentro da janela, inclusive turnos que entram perto dela", () => {
    let st: Store = demoStore({ start: "2026-11-02" });
    st = { ...st, config: { ...st.config, slot: 30 } };
    const cx = st.sectors.find((s) => s.name === "Frente de Caixa")!;
    const shifts = cx.shifts.map((s) => (s.special ? s : { ...s, start: "10:00", breakStart: "15:00", breakMin: 60, workMin: 360, breakWindow: { start: "11:00", end: "12:30", mode: "inteiro" as const } }));
    st = { ...st, sectors: st.sectors.map((s) => (s.id === cx.id ? { ...s, shifts } : s)) };
    st = { ...st, sectors: st.sectors.map((s) => (s.id === cx.id ? fillMissing(st, s.id)! : s)) };
    const r = staggerBreaksPeriod(st, cx.id, {});
    const sec = r.store.sectors.find((s) => s.id === cx.id)!;
    let n = 0;
    for (const d of buildDays(r.store.config)) {
      if (d.closed || d.special) continue;
      for (const e of r.store.employees.filter((x) => x.sectorId === cx.id)) {
        if (cellCode(sec, e.id, d) !== "T") continue;
        const x = dayShift(r.store, sec, e, d);
        expect(x.breakStart).toBeGreaterThanOrEqual(toMin("11:00"));
        expect(x.breakEnd).toBeLessThanOrEqual(toMin("12:30"));
        n++;
      }
    }
    expect(n).toBeGreaterThan(50);
  });
});
