// Ranking de faltas: contagem, ocorrências, faltas emendadas à folga, taxa e filtros.
import { describe, expect, it } from "vitest";
import { cloneStore, demoStore } from "../src/engine/seed";
import { fillMissing } from "../src/engine/solver";
import { buildDays, cellCode } from "../src/engine/model";
import { absenceRows, groupTotals, ranks, sortRows, summarize, NO_FILTERS } from "../src/simple/absences";
import type { Store } from "../src/engine/types";

const START = "2026-10-26"; // segunda
function filled(store: Store): Store {
  let st = store;
  for (const sec of st.sectors) {
    const f = fillMissing(st, sec.id);
    if (f) st = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? f : s)) };
  }
  return st;
}
const base = filled(demoStore({ start: START }));
const caixa = base.sectors.find((s) => s.name === "Frente de Caixa")!;
const emps = base.employees.filter((e) => e.sectorId === caixa.id);
const days = buildDays(base.config);

/** marca faltas (A) nas datas, para a pessoa */
function absent(st: Store, empId: string, dates: string[]): Store {
  return {
    ...st,
    sectors: st.sectors.map((s) => {
      if (!st.employees.some((e) => e.id === empId && e.sectorId === s.id)) return s;
      const row = { ...(s.schedule[empId] ?? {}) };
      for (const d of dates) row[d] = { c: "A", lock: true };
      return { ...s, schedule: { ...s.schedule, [empId]: row } };
    }),
  };
}
// dias trabalhados (T) da pessoa, em ordem
const workDays = (empId: string) => days.filter((d) => cellCode(caixa, empId, d) === "T").map((d) => d.date);

describe("ranking de faltas", () => {
  it("sem faltas lançadas, todos ficam com zero e a taxa é zero", () => {
    const rows = absenceRows([base], NO_FILTERS);
    expect(rows.length).toBe(base.employees.length);
    const s = summarize(rows);
    expect(s.total).toBe(0);
    expect(s.rate).toBe(0);
    expect(s.withAbs).toBe(0);
  });

  it("conta faltas, dias escalados, taxa e ordena quem mais faltou primeiro", () => {
    const [a, b] = emps;
    const wa = workDays(a.id);
    let st = absent(base, a.id, wa.slice(0, 3));
    st = absent(st, b.id, workDays(b.id).slice(0, 1));
    const rows = absenceRows([st], NO_FILTERS);
    const ra = rows.find((r) => r.emp.id === a.id)!;
    expect(ra.dates).toEqual(wa.slice(0, 3));
    // escalados = trabalhados + faltas (a falta não muda o número de dias escalados)
    const esc = days.filter((d) => ["T", "D"].includes(cellCode(caixa, a.id, d))).length;
    expect(ra.scheduled).toBe(esc);
    expect(ra.rate).toBeCloseTo(3 / esc, 6);
    const sorted = sortRows(rows.filter((r) => r.dates.length), "dias");
    expect(sorted.map((r) => r.emp.id)).toEqual([a.id, b.id]);
    expect(ranks(sorted, "dias")).toEqual([1, 2]);
    expect(summarize(rows).total).toBe(4);
  });

  it("faltas seguidas são uma ocorrência; folga no meio não separa; dia trabalhado separa", () => {
    const e = emps[2];
    // procura dois dias trabalhados com só folgas entre eles, e um terceiro bem depois
    const all = days.map((d) => ({ d: d.date, c: cellCode(caixa, e.id, d) }));
    let pair: [string, string] | null = null;
    for (let i = 0; i < all.length && !pair; i++) {
      if (all[i].c !== "T") continue;
      let j = i + 1;
      while (j < all.length && all[j].c === "F") j++;
      if (j > i + 1 && j < all.length && all[j].c === "T") pair = [all[i].d, all[j].d];
    }
    expect(pair).not.toBeNull();
    const later = all.filter((x) => x.c === "T" && x.d > pair![1]).map((x) => x.d)[3];
    const st = absent(base, e.id, [pair![0], pair![1], later]);
    const r = absenceRows([st], NO_FILTERS).find((x) => x.emp.id === e.id)!;
    expect(r.dates.length).toBe(3);
    expect(r.occurrences).toBe(2);
    // as duas primeiras encostam numa folga
    expect(r.nearOff).toEqual(expect.arrayContaining([pair![0], pair![1]]));
  });

  it("filtra por período, dia da semana, turno, função, setor e loja", () => {
    const e = emps[0];
    const wd = workDays(e.id);
    const st = absent(base, e.id, wd.slice(0, 4));
    const first = wd[0];
    const r1 = absenceRows([st], { ...NO_FILTERS, from: first, to: first });
    expect(summarize(r1).total).toBe(1);
    const wday = new Date(`${first}T12:00:00`).getDay();
    const r2 = absenceRows([st], { ...NO_FILTERS, weekday: wday });
    expect(summarize(r2).total).toBe(wd.slice(0, 4).filter((d) => new Date(`${d}T12:00:00`).getDay() === wday).length);
    const sh = caixa.shifts.find((s) => s.id === e.shiftId)!.name;
    expect(absenceRows([st], { ...NO_FILTERS, shift: sh }).every((r) => r.shiftName === sh)).toBe(true);
    expect(absenceRows([st], { ...NO_FILTERS, func: e.func.trim() }).every((r) => r.func === e.func.trim())).toBe(true);
    expect(absenceRows([st], { ...NO_FILTERS, sector: "Padaria" }).every((r) => r.sector.name === "Padaria")).toBe(true);
    expect(summarize(absenceRows([st], { ...NO_FILTERS, sector: "Padaria" })).total).toBe(0);
    // duas lojas: filtra por loja e agrupa por loja
    const loja2 = absent(filled(cloneStore(base, "Loja 2", 5)), "", []);
    const e2 = loja2.employees.find((x) => loja2.sectors.find((s) => s.id === x.sectorId)!.name === "Açougue")!;
    const sec2 = loja2.sectors.find((s) => s.id === e2.sectorId)!;
    const d2 = buildDays(loja2.config).find((d) => cellCode(sec2, e2.id, d) === "T")!.date;
    const l2 = absent(loja2, e2.id, [d2]);
    const both = absenceRows([st, l2], NO_FILTERS);
    expect(summarize(both).total).toBe(5);
    expect(summarize(absenceRows([st, l2], { ...NO_FILTERS, storeId: l2.id })).total).toBe(1);
    const g = groupTotals(both, "loja");
    expect(g.map((x) => [x.label, x.n])).toEqual([
      [st.name, 4],
      ["Loja 2", 1],
    ]);
  });

  it("empates dividem a mesma posição", () => {
    const [a, b, c] = emps;
    let st = absent(base, a.id, workDays(a.id).slice(0, 2));
    st = absent(st, b.id, workDays(b.id).slice(0, 2));
    st = absent(st, c.id, workDays(c.id).slice(0, 1));
    const sorted = sortRows(absenceRows([st], NO_FILTERS).filter((r) => r.dates.length), "dias");
    expect(ranks(sorted, "dias")).toEqual([1, 1, 3]);
  });

  it("faltas registradas fora do período planejado também contam", () => {
    const e = emps[0];
    const old = "2026-09-15"; // antes do período
    const st = absent(base, e.id, [old]);
    const r = absenceRows([st], NO_FILTERS).find((x) => x.emp.id === e.id)!;
    expect(r.dates).toContain(old);
    expect(summarize(absenceRows([st], { ...NO_FILTERS, from: "2026-09-01", to: "2026-09-30" })).total).toBe(1);
  });
});

describe("atestados (mesmo painel das faltas)", () => {
  /** marca atestado (M) nas datas */
  function sick(st: Store, empId: string, dates: string[]): Store {
    return {
      ...st,
      sectors: st.sectors.map((s) => {
        if (!st.employees.some((e) => e.id === empId && e.sectorId === s.id)) return s;
        const row = { ...(s.schedule[empId] ?? {}) };
        for (const d of dates) row[d] = { c: "M", lock: true };
        return { ...s, schedule: { ...s.schedule, [empId]: row } };
      }),
    };
  }
  it("conta atestados separado das faltas, com ocorrências e dias escalados", () => {
    const [a, b] = emps;
    const wa = workDays(a.id);
    let st = sick(base, a.id, wa.slice(0, 3));
    st = absent(st, b.id, workDays(b.id).slice(0, 2));
    const m = absenceRows([st], NO_FILTERS, "M");
    const f = absenceRows([st], NO_FILTERS, "A");
    expect(summarize(m).total).toBe(3);
    expect(summarize(f).total).toBe(2);
    const ra = m.find((r) => r.emp.id === a.id)!;
    expect(ra.dates).toEqual(wa.slice(0, 3));
    // dias com atestado continuam contando como dias escalados (para a taxa)
    const esc = days.filter((d) => ["T", "D"].includes(cellCode(caixa, a.id, d))).length;
    expect(ra.scheduled).toBe(esc);
    expect(f.find((r) => r.emp.id === a.id)!.scheduled).toBe(esc);
  });
  it("atestado é salvo e lido de volta, conta como ausência na cobertura e a escala continua válida", async () => {
    const { encodeSchedule, decodeSchedule } = await import("../src/storage/storage");
    const { analyzeSector } = await import("../src/engine/analysis");
    const { buildProblem, validate } = await import("../src/engine/solver");
    const { presenceAt } = await import("../src/engine/model");
    const e = emps[0];
    const d = workDays(e.id)[0];
    const st = sick(base, e.id, [d]);
    const sec = st.sectors.find((s) => s.id === caixa.id)!;
    expect(decodeSchedule(encodeSchedule(sec.schedule))[e.id][d]).toEqual({ c: "M", lock: true });
    const day = days.find((x) => x.date === d)!;
    expect(cellCode(sec, e.id, day)).toBe("M");
    expect(presenceAt(st, e, day, day.openMin + 120).state).toBe("absent");
    expect(analyzeSector(st, caixa.id).totals.pct).toBeLessThanOrEqual(analyzeSector(base, caixa.id).totals.pct);
    const p = buildProblem(st, caixa.id, { keepLocks: true });
    const rows = p.employees.map((pe) => days.map((x) => cellCode(sec, pe.id, x)));
    expect(validate(p, rows)).toEqual([]);
  });
});

describe("taxa fora do período planejado", () => {
  it("falta num mês sem escala gravada não vira 100%: os dias escalados são estimados", () => {
    const e = emps[0];
    const st = absent(base, e.id, ["2026-09-15"]);
    const r = absenceRows([st], { ...NO_FILTERS, from: "2026-09-01", to: "2026-09-30" }).find((x) => x.emp.id === e.id)!;
    expect(r.dates).toEqual(["2026-09-15"]);
    // setembro: 30 dias, domingos abertos na demonstração → ~30 × 5/7 ≈ 21 dias escalados
    expect(r.scheduled).toBeGreaterThan(18);
    expect(r.scheduled).toBeLessThan(24);
    expect(r.estimated).toBe(r.scheduled - 1);
    expect(r.rate).toBeLessThan(0.07);
    // dentro do período planejado nada é estimado
    const r2 = absenceRows([st], { ...NO_FILTERS, from: days[0].date, to: days[days.length - 1].date }).find((x) => x.emp.id === e.id)!;
    expect(r2.estimated).toBe(0);
  });
});
