// Testes das melhorias: domingo com turno próprio, cópia de escala entre setores, janelas de intervalo,
// escala de almoço (alertas), cores personalizadas e filtro de várias lojas.
import { describe, expect, it } from "vitest";
import { cloneStore, demoStore } from "../src/engine/seed";
import { analyzeSector } from "../src/engine/analysis";
import { buildProblem, fillMissing, validate, weeklyMinutes } from "../src/engine/solver";
import { buildDays, cellCode, dayShift, employeeShift, presenceAt } from "../src/engine/model";
import { breakIssues, staggerBreaks, validWindow } from "../src/engine/breaks";
import { applyCellShifts, decodeSchedule, encodeSchedule, extractCellShifts } from "../src/storage/storage";
import { copyToTargets } from "../src/simple/scaleCopy";
import { applyToSundays, setSunday, sundayEntry, templateFromSunday } from "../src/simple/sundays";
import { COLOR_KEYS, SWATCHES, colorVars, contrast, hexOf, inkFor } from "../src/simple/colors";
import { resolveStoreSel } from "../src/components/storeSel";
import { fmtTime, toMin } from "../src/engine/time";
import type { CalDay, Sector, Shift, Store } from "../src/engine/types";

const START = "2026-10-26"; // segunda

function filled(store: Store): Store {
  let st = store;
  for (const sec of st.sectors) {
    const f = fillMissing(st, sec.id);
    if (f) st = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? f : s)) };
  }
  return st;
}
const byName = (s: Store, n: string) => s.sectors.find((x) => x.name === n)!;
const withSector = (st: Store, sec: Sector): Store => ({ ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? sec : s)) });
const setShift = (st: Store, secId: string, shId: string, patch: Partial<Shift>): Store => ({
  ...st,
  sectors: st.sectors.map((s) => (s.id === secId ? { ...s, shifts: s.shifts.map((x) => (x.id === shId ? { ...x, ...patch } : x)) } : s)),
});
const sundays = (st: Store): CalDay[] => buildDays(st.config).filter((d) => d.weekday === 0 && !d.closed);

const base = filled(demoStore({ start: START }));
const caixa = byName(base, "Frente de Caixa");
const regular = caixa.shifts.filter((s) => !s.special);

describe("domingo com horário próprio (turno por dia)", () => {
  const sun = sundays(base)[0];
  const worker = base.employees.find((e) => e.sectorId === caixa.id && cellCode(caixa, e.id, sun) === "D")!;
  const other = regular[regular.length - 1];

  it("sem turno escolhido, o domingo usa o turno de domingo habitual", () => {
    expect(worker).toBeTruthy();
    const r = dayShift(base, caixa, worker, sun);
    expect(r.start).toBe(employeeShift(base, caixa, worker, true).start);
  });

  it("com turno escolhido para o dia, horário, horas e presença seguem esse turno", () => {
    const sec2 = setSunday(caixa, worker.id, sun.date, { c: "D", shiftId: other.id });
    const st = withSector(base, sec2);
    const r = dayShift(st, sec2, worker, sun);
    expect(r.start).toBe(toMin(other.start));
    expect(sec2.schedule[worker.id][sun.date].lock).toBe(true);
    // presença no meio do turno escolhido
    const mid = toMin(other.start) + 60;
    expect(presenceAt(st, worker, sun, mid).state).toBe("working");
    // horas da semana usam o turno escolhido
    const wm = weeklyMinutes(st, caixa.id, buildDays(st.config));
    const wmBase = weeklyMinutes(base, caixa.id, buildDays(base.config));
    expect(wm[worker.id][sun.week] - wmBase[worker.id][sun.week]).toBe(r.workMin - dayShift(base, caixa, worker, sun).workMin);
  });

  it("o turno do dia é salvo e lido de volta (código compacto + mapa de turnos)", () => {
    const sec2 = setSunday(caixa, worker.id, sun.date, { c: "D", shiftId: other.id });
    const enc = encodeSchedule(sec2.schedule);
    const map = extractCellShifts(sec2.schedule);
    const back = applyCellShifts(decodeSchedule(enc), JSON.parse(JSON.stringify(map)));
    expect(back[worker.id][sun.date]).toEqual({ c: "D", lock: true, shiftId: other.id });
    // escala sem turnos por dia continua igual (nenhuma migração necessária)
    expect(applyCellShifts(decodeSchedule(encodeSchedule(caixa.schedule)), undefined)).toEqual(decodeSchedule(encodeSchedule(caixa.schedule)));
  });

  it("a escala com turno de domingo escolhido continua válida", () => {
    const sec2 = setSunday(caixa, worker.id, sun.date, { c: "D", shiftId: other.id });
    const st = withSector(base, sec2);
    const p = buildProblem(st, caixa.id, { keepLocks: true });
    const rows = p.employees.map((pe) => buildDays(st.config).map((d) => cellCode(sec2, pe.id, d)));
    expect(validate(p, rows)).toEqual([]);
  });

  it("copiar um domingo para outros não mexe em férias e conta as mudanças", () => {
    const [s1, s2, s3] = sundays(base);
    const emps = base.employees.filter((e) => e.sectorId === caixa.id).map((e) => e.id);
    const vac = emps[0];
    let sec = caixa;
    sec = { ...sec, schedule: { ...sec.schedule, [vac]: { ...sec.schedule[vac], [s2.date]: { c: "V", lock: true } } } };
    const entries = Object.fromEntries(emps.map((id) => [id, sundayEntry(sec, id, s1)!]).filter(([, e]) => e));
    const r = applyToSundays(sec, entries, [s2, s3]);
    expect(cellCode(r.sector, vac, s2)).toBe("V");
    for (const id of emps.slice(1)) if (entries[id]) expect(cellCode(r.sector, id, s2)).toBe(entries[id].c);
    expect(r.changed[s2.date]).toBeGreaterThanOrEqual(0);
    // aplicar de novo não muda nada
    const again = applyToSundays(r.sector, entries, [s2, s3]);
    expect(again.changed[s2.date]).toBe(0);
    expect(again.changed[s3.date]).toBe(0);
  });

  it("modelo de domingo guarda quem trabalha, em qual turno, e quem folga", () => {
    const sec2 = setSunday(caixa, worker.id, sun.date, { c: "D", shiftId: other.id });
    const ids = base.employees.filter((e) => e.sectorId === caixa.id).map((e) => e.id);
    const t = templateFromSunday(sec2, ids, sun, "  ");
    expect(t.name).toBe("Modelo de domingo");
    expect(t.entries[worker.id]).toEqual({ c: "D", shiftId: other.id });
    expect(Object.values(t.entries).some((e) => e.c === "F")).toBe(true);
  });
});

describe("distribuição dos intervalos com janela", () => {
  const sh = regular.find((s) => s.breakStart && s.breakMin > 0)!;
  const bs = toMin(sh.breakStart!);

  it("modo início: todo intervalo escalonado começa dentro da janela e mantém a duração", () => {
    const win = { start: fmtTime(bs - 60), end: fmtTime(bs + 60), mode: "inicio" as const };
    const st = setShift(base, caixa.id, sh.id, { breakWindow: win });
    const r = staggerBreaks(st, caixa.id);
    const sec = byName(r.store, "Frente de Caixa");
    for (const e of r.store.employees.filter((x) => x.sectorId === caixa.id && x.shiftId === sh.id)) {
      const rs = employeeShift(r.store, sec, e, false);
      expect(rs.breakStart).toBeGreaterThanOrEqual(bs - 60);
      expect(rs.breakStart).toBeLessThanOrEqual(bs + 60);
      expect(rs.breakEnd - rs.breakStart).toBe(sh.breakMin);
    }
    expect(breakIssues(r.store, caixa.id)).toEqual([]);
  });

  it("modo intervalo inteiro: o intervalo termina dentro da janela", () => {
    const win = { start: fmtTime(bs - 30), end: fmtTime(bs + sh.breakMin + 30), mode: "inteiro" as const };
    const st = setShift(base, caixa.id, sh.id, { breakWindow: win });
    const r = staggerBreaks(st, caixa.id);
    const sec = byName(r.store, "Frente de Caixa");
    for (const e of r.store.employees.filter((x) => x.sectorId === caixa.id && x.shiftId === sh.id)) {
      const rs = employeeShift(r.store, sec, e, false);
      expect(rs.breakStart).toBeGreaterThanOrEqual(bs - 30);
      expect(rs.breakEnd).toBeLessThanOrEqual(bs + sh.breakMin + 30);
    }
  });

  it("janela que não cumpre as regras de posição: a janela manda e a observação aparece", () => {
    const start = toMin(sh.start);
    const win = { start: fmtTime(start + 15), end: fmtTime(start + 45), mode: "inicio" as const }; // menos de 2h de trabalho antes
    const st = setShift(base, caixa.id, sh.id, { breakWindow: win });
    const r = staggerBreaks(st, caixa.id);
    expect(r.skipped.some((t) => t.startsWith(sh.name))).toBe(false);
    const doTurno = r.store.employees.filter((e) => e.sectorId === caixa.id && e.shiftId === sh.id);
    expect(doTurno.length).toBeGreaterThan(0);
    for (const e of doTurno) {
      const b = toMin(e.breakStart ?? sh.breakStart!);
      expect(b).toBeGreaterThanOrEqual(start + 15);
      expect(b).toBeLessThanOrEqual(start + 45);
    }
    // a observação de "pouco trabalho antes do intervalo" continua aparecendo
    expect(breakIssues(r.store, caixa.id).some((i) => /antes/.test(i.text))).toBe(true);
  });

  it("janela com fim antes do início é ignorada (e vira alerta da escala)", () => {
    expect(validWindow({ breakWindow: { start: "14:00", end: "12:00", mode: "inicio" } })).toBeNull();
    const st = setShift(base, caixa.id, sh.id, { breakWindow: { start: "14:00", end: "12:00", mode: "inicio" } });
    const a = analyzeSector(st, caixa.id);
    expect(a.alerts.some((x) => x.severity === "problema" && /janela/i.test(x.title + x.text))).toBe(true);
  });

  it("intervalo editado à mão fora da janela gera alerta, sem mudar nada sozinho", () => {
    const win = { start: fmtTime(bs - 30), end: fmtTime(bs + 30), mode: "inicio" as const };
    let st = setShift(base, caixa.id, sh.id, { breakWindow: win });
    const e = st.employees.find((x) => x.sectorId === caixa.id && x.shiftId === sh.id)!;
    st = { ...st, employees: st.employees.map((x) => (x.id === e.id ? { ...x, breakStart: fmtTime(bs + 90) } : x)) };
    const issues = breakIssues(st, caixa.id);
    expect(issues.map((i) => i.empId)).toContain(e.id);
    expect(st.employees.find((x) => x.id === e.id)!.breakStart).toBe(fmtTime(bs + 90));
  });
});

describe("copiar escala de um setor para outros", () => {
  const padaria = byName(base, "Padaria");
  const all = { turnos: true, necessidade: true, regras: true, folgas: true };

  it("mostra a prévia e não altera nada até aplicar", () => {
    const snap = JSON.stringify(base);
    const r = copyToTargets([base], base.id, caixa.id, [{ storeId: base.id, sectorId: padaria.id }], all);
    expect(JSON.stringify(base)).toBe(snap);
    expect(r.previews).toHaveLength(1);
    expect(r.previews[0].replaces).toBe(true);
    expect(r.previews[0].lines.length).toBeGreaterThan(0);
  });

  it("copia turnos com ids novos e a cópia é editável sem afetar a origem", () => {
    const r = copyToTargets([base], base.id, caixa.id, [{ storeId: base.id, sectorId: padaria.id }], { turnos: true, necessidade: false, regras: false, folgas: false });
    const st = r.stores.get(base.id)!;
    const dst = byName(st, "Padaria");
    expect(dst.shifts.map((s) => s.name)).toEqual(caixa.shifts.map((s) => s.name));
    expect(dst.shifts.every((s) => !caixa.shifts.some((o) => o.id === s.id))).toBe(true);
    // todas as pessoas do destino apontam para um turno que existe
    for (const e of st.employees.filter((x) => x.sectorId === dst.id)) expect(dst.shifts.some((s) => s.id === e.shiftId)).toBe(true);
    const edited = setShift(st, dst.id, dst.shifts[0].id, { start: "05:00" });
    expect(byName(edited, "Frente de Caixa").shifts[0].start).toBe(caixa.shifts[0].start);
  });

  it("copia para outra loja e para vários destinos de uma vez; folgas fixadas à mão não mudam", () => {
    const loja2 = filled(cloneStore(base, "Loja 2", 7));
    const pad2 = byName(loja2, "Padaria");
    const emp2 = loja2.employees.find((e) => e.sectorId === pad2.id)!;
    const d0 = buildDays(loja2.config).find((d) => d.weekday === 3)!;
    const locked: Store = withSector(loja2, { ...pad2, schedule: { ...pad2.schedule, [emp2.id]: { ...pad2.schedule[emp2.id], [d0.date]: { c: "F", lock: true } } } });
    const r = copyToTargets(
      [base, locked],
      base.id,
      caixa.id,
      [
        { storeId: base.id, sectorId: padaria.id },
        { storeId: locked.id, sectorId: pad2.id },
      ],
      all,
    );
    expect(r.previews).toHaveLength(2);
    expect(r.stores.size).toBe(2);
    const out2 = r.stores.get(locked.id)!;
    expect(byName(out2, "Padaria").schedule[emp2.id][d0.date]).toEqual({ c: "F", lock: true });
    expect(byName(out2, "Padaria").minRules.length).toBe(caixa.minRules.length);
  });

  it("copia a escala existente inteira para um setor com menos pessoas, criando as vagas que faltam", () => {
    const fiscais = byName(base, "Fiscais de Caixa");
    const src = base.employees.filter((e) => e.sectorId === caixa.id);
    const before = base.employees.filter((e) => e.sectorId === fiscais.id).length;
    expect(src.length).toBeGreaterThan(before);
    const r = copyToTargets([base], base.id, caixa.id, [{ storeId: base.id, sectorId: fiscais.id }], { ...all, vagas: true });
    expect(r.previews[0].lines.some((l) => l.startsWith("Vagas:"))).toBe(true);
    const st = r.stores.get(base.id)!;
    const dSec = byName(st, "Fiscais de Caixa");
    const dst = st.employees.filter((e) => e.sectorId === dSec.id);
    expect(dst.length).toBe(src.length);
    // mesma escala, pessoa a pessoa (pela posição), em todos os dias abertos sem bloqueio no destino
    const days = buildDays(st.config).filter((d) => !d.closed);
    for (let k = 0; k < dst.length; k++)
      for (const d of days) expect(cellCode(dSec, dst[k].id, d)).toBe(cellCode(caixa, src[k].id, d));
    // sem a opção de vagas, avisa que só parte da escala será copiada
    const r2 = copyToTargets([base], base.id, caixa.id, [{ storeId: base.id, sectorId: fiscais.id }], all);
    expect(r2.previews[0].warnings.some((w) => w.includes("Criar as vagas"))).toBe(true);
    expect(r2.stores.get(base.id)!.employees.filter((e) => e.sectorId === fiscais.id).length).toBe(before);
  });

  it("a origem nunca é destino de si mesma", () => {
    const r = copyToTargets([base], base.id, caixa.id, [{ storeId: base.id, sectorId: caixa.id }], all);
    expect(r.previews).toHaveLength(0);
  });
});

describe("cores da escala", () => {
  it("contraste WCAG e texto automático legível em toda a paleta", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 0);
    expect(inkFor("#ffffff")).toBe("#000000");
    expect(inkFor("#3d1a6e")).toBe("#ffffff");
    for (const c of SWATCHES) expect(contrast(c, inkFor(c))).toBeGreaterThanOrEqual(4.5);
  });
  it("cor personalizada vira variável CSS; sem personalização ficam as originais", () => {
    const v = colorVars({ ...base.config, colors: { F: "#1baf7a" } });
    expect(v["--c-F"]).toBe("#1baf7a");
    expect(v["--c-T"]).toBe(COLOR_KEYS.find((k) => k.key === "T")!.cssDefault);
    expect(hexOf(base.config, "F")).toBe(COLOR_KEYS.find((k) => k.key === "F")!.def);
    // valor inválido é ignorado
    expect(colorVars({ ...base.config, colors: { F: "roxo" } })["--c-F"]).toBe(COLOR_KEYS.find((k) => k.key === "F")!.cssDefault);
  });
  it("cores só mudam a aparência: a análise da escala é a mesma", () => {
    const st = { ...base, config: { ...base.config, colors: { F: "#e34948", T: "#c4ead3" } } };
    expect(analyzeSector(st, caixa.id).totals).toEqual(analyzeSector(base, caixa.id).totals);
  });
});

describe("várias lojas", () => {
  it("a loja em edição está sempre na seleção e lojas apagadas saem", () => {
    expect(resolveStoreSel(["a", "b", "c"], ["b", "c"], "a")).toEqual(["a", "b", "c"]);
    expect(resolveStoreSel(["a", "b"], ["b", "x"], "b")).toEqual(["b"]);
    expect(resolveStoreSel(["a", "b"], [], "a")).toEqual(["a"]);
    expect(resolveStoreSel(["a", "b", "c"], ["c", "a"], "a")).toEqual(["a", "c"]);
  });
  it("cobertura e alertas de cada loja são independentes", () => {
    const loja2 = filled(cloneStore(base, "Loja 2", 11));
    const c2 = byName(loja2, "Frente de Caixa");
    const before = analyzeSector(base, caixa.id).totals;
    // todo mundo da loja 2 de folga numa terça: só a loja 2 piora
    const tue = buildDays(loja2.config).find((d) => d.weekday === 2)!;
    const sched = Object.fromEntries(Object.entries(c2.schedule).map(([id, row]) => [id, { ...row, [tue.date]: { c: "F" as const, lock: true } }]));
    const l2 = withSector(loja2, { ...c2, schedule: sched });
    expect(analyzeSector(l2, c2.id).totals.pct).toBeLessThan(analyzeSector(loja2, c2.id).totals.pct);
    expect(analyzeSector(base, caixa.id).totals).toEqual(before);
    // e a validação aponta o conflito de folgas a mais na loja 2
    const p = buildProblem(l2, c2.id, { keepLocks: true });
    const rows = p.employees.map((pe) => buildDays(l2.config).map((d) => cellCode(byName(l2, "Frente de Caixa"), pe.id, d)));
    expect(validate(p, rows).length).toBeGreaterThan(0);
  });
});

describe("intervalo só de um dia", () => {
  it("muda o intervalo só no dia escolhido, é salvo e lido de volta e o gerador não apaga", async () => {
    const { applyResult, buildProblem, solveBest } = await import("../src/engine/solver");
    const sh = regular.find((s) => s.breakStart && s.breakMin > 0)!;
    const e = base.employees.find((x) => x.sectorId === caixa.id && x.shiftId === sh.id)!;
    const ds = buildDays(base.config).filter((d) => cellCode(caixa, e.id, d) === "T");
    const [d1, d2] = ds;
    const before = dayShift(base, caixa, e, d1);
    const nb = before.breakStart + 60;
    const row = { ...caixa.schedule[e.id], [d1.date]: { ...caixa.schedule[e.id][d1.date], brk: fmtTime(nb) } };
    const sec = { ...caixa, schedule: { ...caixa.schedule, [e.id]: row } };
    const st = withSector(base, sec);
    const r1 = dayShift(st, sec, e, d1);
    expect(r1.breakStart).toBe(nb);
    expect(r1.breakEnd - r1.breakStart).toBe(before.breakEnd - before.breakStart);
    expect(dayShift(st, sec, e, d2).breakStart).toBe(dayShift(base, caixa, e, d2).breakStart);
    expect(presenceAt(st, e, d1, nb + 10).state).toBe("break");
    // salvo e lido de volta
    const back = applyCellShifts(decodeSchedule(encodeSchedule(sec.schedule)), JSON.parse(JSON.stringify(extractCellShifts(sec.schedule))));
    expect(back[e.id][d1.date].brk).toBe(fmtTime(nb));
    // gerar de novo mantém o intervalo do dia
    const p = buildProblem(st, sec.id, { keepLocks: true });
    const res = solveBest(p, 1);
    const sec2 = applyResult(sec, p, res.rows);
    if (cellCode(sec2, e.id, d1) === "T") expect(sec2.schedule[e.id][d1.date].brk).toBe(fmtTime(nb));
  });
});
