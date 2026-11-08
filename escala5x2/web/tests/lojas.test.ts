// Cadastro de lojas: cópia da estrutura ou de tudo, sempre com identificadores novos e sem ligação com a original.
import { describe, expect, it } from "vitest";
import { demoStore } from "../src/engine/seed";
import { fillMissing } from "../src/engine/solver";
import { analyzeSector } from "../src/engine/analysis";
import { buildDays, cellCode } from "../src/engine/model";
import { duplicateStore, parseStoreNames } from "../src/simple/storeOps";
import { setSunday } from "../src/simple/sundays";
import type { Store } from "../src/engine/types";

const base: Store = (() => {
  let st = demoStore({ start: "2026-10-26" });
  for (const sec of st.sectors) {
    const f = fillMissing(st, sec.id);
    if (f) st = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? f : s)) };
  }
  // um domingo com turno escolhido e um modelo de domingo, para conferir o remapeamento
  const caixa = st.sectors.find((s) => s.name === "Frente de Caixa")!;
  const e = st.employees.find((x) => x.sectorId === caixa.id)!;
  const sun = buildDays(st.config).find((d) => d.weekday === 0)!;
  const reg = caixa.shifts.find((s) => !s.special)!;
  let sec = setSunday(caixa, e.id, sun.date, { c: "D", shiftId: reg.id });
  sec = { ...sec, sundayTemplates: [{ id: "tpl_x", name: "Modelo", entries: { [e.id]: { c: "D", shiftId: reg.id } } }] };
  return { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? sec : s)) };
})();
const ids = (st: Store) => new Set([st.id, ...st.sectors.map((s) => s.id), ...st.sectors.flatMap((s) => s.shifts.map((x) => x.id)), ...st.sectors.flatMap((s) => s.minRules.map((r) => r.id)), ...st.employees.map((e) => e.id)]);

describe("cadastro de lojas", () => {
  it("copiar a estrutura: setores, turnos, necessidade e regras, sem pessoas e sem escala", () => {
    const c = duplicateStore(base, "Loja 2", "Rede", false);
    expect(c.name).toBe("Loja 2");
    expect(c.employees).toEqual([]);
    expect(c.sectors.every((s) => Object.keys(s.schedule).length === 0 && (s.sundayTemplates ?? []).length === 0)).toBe(true);
    expect(c.sectors.map((s) => s.name)).toEqual(base.sectors.map((s) => s.name));
    expect(c.sectors.map((s) => s.shifts.map((x) => [x.name, x.start, x.breakMin]))).toEqual(base.sectors.map((s) => s.shifts.map((x) => [x.name, x.start, x.breakMin])));
    expect(c.sectors.map((s) => s.minRules.length)).toEqual(base.sectors.map((s) => s.minRules.length));
    expect(c.config).toEqual(base.config);
    // nenhum identificador em comum
    const a = ids(base);
    expect([...ids(c)].some((x) => a.has(x))).toBe(false);
    // turno de domingo padrão aponta para um turno da própria loja nova
    for (const s of c.sectors) if (s.defaultSundayShiftId) expect(s.shifts.some((x) => x.id === s.defaultSundayShiftId)).toBe(true);
  });

  it("copiar tudo: mesmas pessoas e mesma escala, com tudo apontando para a loja nova", () => {
    const c = duplicateStore(base, "Loja 3", "Rede", true);
    expect(c.employees.length).toBe(base.employees.length);
    const days = buildDays(c.config);
    base.sectors.forEach((s0, i) => {
      const s1 = c.sectors[i];
      base.employees
        .filter((e) => e.sectorId === s0.id)
        .forEach((e0) => {
          const e1 = c.employees[base.employees.indexOf(e0)];
          expect(e1.name).toBe(e0.name);
          expect(e1.sectorId).toBe(s1.id);
          expect(s1.shifts.some((x) => x.id === e1.shiftId)).toBe(true);
          for (const d of days) expect(cellCode(s1, e1.id, d)).toBe(cellCode(s0, e0.id, d));
        });
    });
    // turno escolhido no domingo e modelos remapeados
    const cx = c.sectors.find((s) => s.name === "Frente de Caixa")!;
    const shiftIds = new Set(cx.shifts.map((x) => x.id));
    const withShift = Object.values(cx.schedule).flatMap((row) => Object.values(row)).filter((x) => x.shiftId);
    expect(withShift.length).toBe(1);
    expect(withShift.every((x) => shiftIds.has(x.shiftId!))).toBe(true);
    const tpl = cx.sundayTemplates![0];
    expect(Object.keys(tpl.entries).every((k) => c.employees.some((e) => e.id === k))).toBe(true);
    expect(Object.values(tpl.entries).every((v) => !v.shiftId || shiftIds.has(v.shiftId))).toBe(true);
    // mesma cobertura
    expect(analyzeSector(c, cx.id).totals).toEqual(analyzeSector(base, base.sectors.find((s) => s.name === "Frente de Caixa")!.id).totals);
  });

  it("a cópia é independente: mudar a nova não muda a original", () => {
    const c = duplicateStore(base, "Loja 4", "Rede", true);
    c.sectors[0].shifts[0].start = "05:00";
    c.employees[0].name = "Outra pessoa";
    c.config.holidays.push({ date: "2026-12-25", name: "Natal", open: false });
    expect(base.sectors[0].shifts[0].start).not.toBe("05:00");
    expect(base.employees[0].name).not.toBe("Outra pessoa");
    expect(base.config.holidays.some((h) => h.date === "2026-12-25" && h.name === "Natal" && c.config.holidays.length > base.config.holidays.length)).toBe(false);
  });

  it("vários nomes de uma vez: um por linha, sem vazios nem repetidos", () => {
    expect(parseStoreNames("Loja 2\n\n  Loja 3 \nloja 2\nLoja 4")).toEqual(["Loja 2", "Loja 3", "Loja 4"]);
    expect(duplicateStore(base, "  ", "", false).name).toBe(`${base.name} (cópia)`);
  });
});

describe("cópia de loja: regras avançadas vão junto, com os setores novos", () => {
  it("onde vale, dias sem folga e regras próprias passam para os setores da cópia; duplas sem as pessoas saem", () => {
    const base = demoStore({ start: "2026-11-02" });
    const ac = base.sectors.find((s) => s.name === "Açougue")!;
    const [p1, p2] = base.employees.filter((e) => e.sectorId === ac.id);
    const src = {
      ...base,
      config: { ...base.config, regras: { folgasSeparadas: "evitar" as const, ondeVale: { folgasSeparadas: [ac.id] }, diasSemFolgaSemana: { dias: [6], forca: "proibir" as const, setores: [ac.id] }, naoFolgarJuntos: { forca: "proibir" as const, pares: [[p1.id, p2.id]] as [string, string][] } } },
      sectors: base.sectors.map((s) => (s.id === ac.id ? { ...s, regrasProprias: { ref: { maxConsecutive: 5, sundayMaxCycleM: 3, sundayMaxCycleF: 2, minRestMin: 660, breakMinOver6h: 60, breakMax: 120, maxDailyMin: 600 }, regras: { rodizioDiaFolga: true } } } : s)),
    };
    const c = duplicateStore(src, "Loja X", "Rede", false);
    const acNovo = c.sectors.find((s) => s.name === "Açougue")!;
    expect(acNovo.id).not.toBe(ac.id);
    expect(c.employees).toEqual([]);
    expect(c.config.regras?.ondeVale?.folgasSeparadas).toEqual([acNovo.id]);
    expect(c.config.regras?.diasSemFolgaSemana?.setores).toEqual([acNovo.id]);
    expect(c.config.regras?.naoFolgarJuntos?.pares).toEqual([]);
    expect(acNovo.regrasProprias?.ref.maxConsecutive).toBe(5);
    expect(acNovo.regrasProprias?.regras.rodizioDiaFolga).toBe(true);
  });
});
