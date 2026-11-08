// Horário do almoço: rodízio (a ordem varia a cada dia) ou fixo (a pessoa almoça sempre no mesmo horário).
import { describe, expect, it } from "vitest";
import { demoStore } from "../src/engine/seed";
import { fillMissing } from "../src/engine/solver";
import { assinaturaAlmoco, staggerBreaksPeriod } from "../src/engine/breaks";
import { buildDays, cellCode, dayShift } from "../src/engine/model";
import { toMin } from "../src/engine/time";
import type { Store } from "../src/engine/types";

/** Frente de Caixa com todos os turnos de dia normal entrando 08:00 e almoço entre 11:00 e 14:00. */
function base(modo?: "rodizio" | "fixo"): { st: Store; sid: string } {
  let st: Store = demoStore({ start: "2026-11-02" });
  st = { ...st, config: { ...st.config, slot: 30 } };
  const cx = st.sectors.find((s) => s.name === "Frente de Caixa")!;
  const shifts = cx.shifts.map((s) => (s.special ? s : { ...s, start: "08:00", breakStart: "12:00", breakMin: 60, breakWindow: { start: "11:00", end: "14:00", mode: "inteiro" as const } }));
  st = { ...st, sectors: st.sectors.map((s) => (s.id === cx.id ? { ...s, shifts, almocoModo: modo } : s)) };
  st = { ...st, sectors: st.sectors.map((s) => (s.id === cx.id ? fillMissing(st, s.id)! : s)) };
  return { st: staggerBreaksPeriod(st, cx.id, {}).store, sid: cx.id };
}

/** Horários de almoço de cada pessoa nos dias normais que trabalhou. */
function horarios(st: Store, sid: string) {
  const sec = st.sectors.find((s) => s.id === sid)!;
  const out = new Map<string, Set<number>>();
  for (const d of buildDays(st.config)) {
    if (d.closed || d.special) continue;
    for (const e of st.employees.filter((x) => x.sectorId === sid)) {
      if (cellCode(sec, e.id, d) !== "T") continue;
      const x = dayShift(st, sec, e, d);
      if (!out.has(e.id)) out.set(e.id, new Set());
      out.get(e.id)!.add(x.breakStart);
      expect(x.breakStart).toBeGreaterThanOrEqual(toMin("11:00"));
      expect(x.breakEnd).toBeLessThanOrEqual(toMin("14:00"));
    }
  }
  return out;
}

describe("horário do almoço: rodízio ou fixo", () => {
  it("fixo: cada pessoa almoça sempre no mesmo horário nos dias normais", () => {
    const { st, sid } = base("fixo");
    const h = horarios(st, sid);
    expect(h.size).toBeGreaterThan(5);
    for (const [, s] of h) expect(s.size).toBe(1);
    // e os horários continuam espalhados pela janela (não todo mundo junto)
    const distintos = new Set([...h.values()].map((s) => [...s][0]));
    expect(distintos.size).toBeGreaterThanOrEqual(4);
  });
  it("rodízio (padrão): o horário de quem entra no mesmo horário varia de um dia para o outro", () => {
    const { st, sid } = base();
    const h = horarios(st, sid);
    const variam = [...h.values()].filter((s) => s.size > 1).length;
    expect(variam).toBeGreaterThan(h.size / 2);
  });
  it("trocar o modo muda a assinatura (os almoços são redistribuídos sozinhos)", () => {
    const { st, sid } = base();
    const a = assinaturaAlmoco(st, sid);
    const st2 = { ...st, sectors: st.sectors.map((s) => (s.id === sid ? { ...s, almocoModo: "fixo" as const } : s)) };
    expect(assinaturaAlmoco(st2, sid)).not.toBe(a);
  });
});
