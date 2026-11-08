// Almoço próprio do domingo por pessoa: horário e tempo só do domingo, inclusive em turno de domingo sem intervalo.
import { describe, expect, it } from "vitest";
import { demoStore } from "../src/engine/seed";
import { fillMissing } from "../src/engine/solver";
import { aplicarAlmocos, definirAlmocoDomingo } from "../src/engine/almoco";
import { buildDays, cellCode, dayShift, isWorking } from "../src/engine/model";
import { fmtTime } from "../src/engine/time";
import type { Store } from "../src/engine/types";

function base(comIntervaloDomingo: boolean) {
  let st: Store = demoStore({ start: "2026-11-02" });
  st = { ...st, config: { ...st.config, sundayOpen: true } };
  const cx = st.sectors.find((s) => s.name === "Frente de Caixa")!;
  const shifts = cx.shifts.map((s) => (s.special ? { ...s, start: "08:00", workMin: comIntervaloDomingo ? 420 : 300, breakStart: comIntervaloDomingo ? "11:30" : null, breakMin: comIntervaloDomingo ? 60 : 0 } : s));
  st = { ...st, sectors: st.sectors.map((s) => (s.id === cx.id ? { ...s, shifts, almocoVersao: 2 } : s)) };
  st = { ...st, sectors: st.sectors.map((s) => (s.id === cx.id ? fillMissing(st, s.id)! : s)) };
  st = aplicarAlmocos(st, cx.id).store;
  return { st, sid: cx.id };
}
/** domingos em que a pessoa trabalha */
const domingos = (st: Store, sid: string, eid: string) => {
  const sec = st.sectors.find((s) => s.id === sid)!;
  return buildDays(st.config).filter((d) => d.weekday === 0 && !d.closed && isWorking(cellCode(sec, eid, d)));
};

describe("almoço do domingo por pessoa", () => {
  it("horário e tempo próprios valem só no domingo; a saída anda junto", () => {
    const { st, sid } = base(true);
    const e = st.employees.find((x) => x.sectorId === sid && domingos(st, sid, x.id).length > 0)!;
    const sec0 = st.sectors.find((s) => s.id === sid)!;
    const d = domingos(st, sid, e.id)[0];
    const antes = dayShift(st, sec0, e, d);
    const seg = buildDays(st.config).find((x) => x.weekday === 1 && isWorking(cellCode(sec0, e.id, x)))!;
    const segAntes = dayShift(st, sec0, e, seg);
    const st2 = definirAlmocoDomingo(definirAlmocoDomingo(st, e.id, { hora: "13:00" }), e.id, { min: 30 });
    const sec = st2.sectors.find((s) => s.id === sid)!;
    const e2 = st2.employees.find((x) => x.id === e.id)!;
    for (const dd of domingos(st2, sid, e.id)) {
      const r = dayShift(st2, sec, e2, dd);
      expect(fmtTime(r.breakStart)).toBe("13:00");
      expect(r.breakEnd - r.breakStart).toBe(30);
      expect(r.end).toBe(antes.end - 30);
    }
    // dia de semana não muda
    const segDepois = dayShift(st2, sec, e2, seg);
    expect([segDepois.breakStart, segDepois.breakEnd, segDepois.end]).toEqual([segAntes.breakStart, segAntes.breakEnd, segAntes.end]);
    // distribuir de novo não mexe
    const st3 = aplicarAlmocos(st2, sid).store;
    expect(fmtTime(dayShift(st3, st3.sectors.find((s) => s.id === sid)!, e2, d).breakStart)).toBe("13:00");
  });
  it("turno de domingo sem intervalo: o tempo escolhido cria o almoço, fora do pico do domingo", () => {
    const { st, sid } = base(false);
    const quem = st.employees.filter((x) => x.sectorId === sid && x.regime !== "12x36" && domingos(st, sid, x.id).length > 0).slice(0, 4);
    let st2 = st;
    for (const e of quem) st2 = definirAlmocoDomingo(st2, e.id, { min: 60 });
    const sec = st2.sectors.find((s) => s.id === sid)!;
    const d = buildDays(st2.config).find((x) => x.weekday === 0 && quem.filter((e) => isWorking(cellCode(sec, e.id, x))).length >= 2)!;
    const rs = quem.filter((e) => isWorking(cellCode(sec, e.id, d))).map((e) => dayShift(st2, sec, st2.employees.find((x) => x.id === e.id)!, d));
    for (const r of rs) {
      expect(r.breakEnd - r.breakStart).toBe(60);
      expect(r.breakStart - r.start).toBeGreaterThanOrEqual(120);
      expect(r.end - r.breakEnd).toBeGreaterThanOrEqual(60);
    }
    // a loja pede 6 no posto das 09:00 às 12:00 no domingo: o almoço fica depois do pico, sem desfalcar o posto
    for (const r of rs) expect(r.breakStart >= 12 * 60 || r.breakEnd <= 9 * 60).toBe(true);
    // quem não escolheu continua sem almoço no domingo
    const outro = st2.employees.find((x) => x.sectorId === sid && !quem.some((q) => q.id === x.id) && isWorking(cellCode(sec, x.id, d)));
    if (outro) {
      const r = dayShift(st2, sec, outro, d);
      expect(r.breakEnd - r.breakStart).toBe(0);
    }
  });
});
