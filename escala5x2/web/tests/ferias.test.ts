// Controle de férias: períodos, saldo por período aquisitivo, vencimento, alertas e lançamento na escala.
import { describe, expect, it } from "vitest";
import { demoStore } from "../src/engine/seed";
import { fillMissing } from "../src/engine/solver";
import { buildDays, cellCode } from "../src/engine/model";
import { addMonths, daysBetween } from "../src/engine/time";
import { DEFAULT_VAC, overLimit, paidUntilFor, removeVacation, setVacation, vacBlocks, vacInfo, vacationConflicts } from "../src/simple/vacations";
import type { Employee, Sector, Store } from "../src/engine/types";

const base = (() => {
  let st = demoStore({ start: "2026-10-26" });
  for (const sec of st.sectors) {
    const f = fillMissing(st, sec.id);
    if (f) st = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? f : s)) };
  }
  return st;
})();
const caixa = base.sectors.find((s) => s.name === "Frente de Caixa")!;
const emp = (i = 0) => base.employees.filter((e) => e.sectorId === caixa.id)[i];
const info = (sec: Sector, e: Employee, today: string, rules = DEFAULT_VAC) => vacInfo(base, sec, e, rules, today);

describe("datas", () => {
  it("soma meses respeitando o fim do mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-02-29", 12)).toBe("2025-02-28");
    expect(addMonths("2025-03-10", 12)).toBe("2026-03-10");
    expect(daysBetween("2026-10-21", "2026-11-20")).toBe(30);
  });
});

describe("controle de férias", () => {
  it("lança férias como dias V fixados, em dias corridos, e remove deixando a escala normal", () => {
    const e = emp();
    const sec = setVacation(caixa, e.id, "2026-11-02", 15);
    const b = vacBlocks(sec, e.id);
    expect(b).toEqual([{ start: "2026-11-02", end: "2026-11-16", days: 15 }]);
    const days = buildDays(base.config).filter((d) => d.date >= "2026-11-02" && d.date <= "2026-11-16");
    expect(days.every((d) => cellCode(sec, e.id, d) === "V")).toBe(true);
    expect(sec.schedule[e.id]["2026-11-05"]).toEqual({ c: "V", lock: true });
    const back = removeVacation(sec, e.id, b[0]);
    expect(vacBlocks(back, e.id)).toEqual([]);
    expect(back.schedule[e.id]["2026-11-05"]).toBeUndefined();
  });

  it("sem admissão não calcula saldo, mas lista as férias", () => {
    const e = emp();
    const sec = setVacation(caixa, e.id, "2026-12-01", 30);
    const i = info(sec, e, "2026-10-21");
    expect(i.status).toBe("sem-admissao");
    expect(i.next).toEqual({ start: "2026-12-01", end: "2026-12-30", days: 30 });
  });

  it("saldo e vencimento por período aquisitivo", () => {
    const e = { ...emp(), admissao: "2025-03-10" };
    // 1º período: 10/03/2025 a 09/03/2026; vence em 09/03/2027
    let i = info(caixa, e, "2026-10-21");
    expect(i.saldo).toBe(30);
    expect(i.nextDeadline).toBe("2027-03-09");
    expect(i.status).toBe("em-dia");
    expect(i.current?.start).toBe("2026-03-10");
    // programadas 20 dias: saldo 10
    const sec = setVacation(caixa, e.id, "2026-12-01", 20);
    i = info(sec, e, "2026-10-21");
    expect(i.saldo).toBe(10);
    // perto do vencimento: aviso
    expect(info(sec, e, "2027-01-20").status).toBe("vence-breve");
    // depois do vencimento com saldo: vencida
    const late = info(sec, e, "2027-03-20");
    expect(late.status).toBe("vencida");
    expect(late.issues.some((t) => t.includes("vencidos"))).toBe(true);
    // ainda no primeiro ano
    expect(info(caixa, { ...emp(), admissao: "2026-05-01" }, "2026-10-21").status).toBe("adquirindo");
  });

  it("férias programadas depois do vencimento geram aviso", () => {
    const e = { ...emp(), admissao: "2025-03-10" };
    const sec = setVacation(caixa, e.id, "2027-03-01", 30); // vence 09/03/2027
    const i = info(sec, e, "2026-10-21");
    expect(i.saldo).toBe(0);
    expect(i.issues.some((t) => t.includes("depois do vencimento"))).toBe(true);
  });

  it("partes curtas demais, partes demais e nenhuma parte longa geram aviso", () => {
    const e = { ...emp(), admissao: "2025-03-10" };
    let sec = setVacation(caixa, e.id, "2026-11-02", 10);
    sec = setVacation(sec, e.id, "2026-12-01", 10);
    sec = setVacation(sec, e.id, "2027-01-04", 6);
    sec = setVacation(sec, e.id, "2027-02-01", 4);
    const i = info(sec, e, "2026-10-21");
    expect(i.issues.some((t) => t.includes("mínimo da loja: 5"))).toBe(true);
    expect(i.issues.some((t) => t.includes("divididas em 4 partes"))).toBe(true);
    expect(i.issues.some((t) => t.includes("nenhuma parte tem 14"))).toBe(true);
    // as regras são da loja: com outras regras os avisos somem
    const j = info(sec, e, "2026-10-21", { ...DEFAULT_VAC, minPeriodo: 1, maxPeriodos: 4, periodoLongo: 10 });
    expect(j.issues).toEqual([]);
  });

  it("ao informar a admissão, períodos já vencidos antes de hoje contam como quitados", () => {
    // período 2024/2025 venceu em 09/03/2026 (antes de hoje): fica como quitado
    expect(paidUntilFor("2020-03-10", "2026-10-21")).toBe("2025-03-09");
    const e = { ...emp(), admissao: "2020-03-10", vacPaidUntil: paidUntilFor("2020-03-10", "2026-10-21") };
    const i = info(caixa, e, "2026-10-21");
    expect(i.periods.filter((p) => !p.paid).map((p) => p.start)).toEqual(["2025-03-10", "2026-03-10"]);
    expect(i.status).toBe("em-dia");
    expect(i.saldo).toBe(30);
    // se o usuário disser que nada foi quitado, os períodos antigos aparecem como vencidos
    expect(info(caixa, { ...e, vacPaidUntil: null }, "2026-10-21").status).toBe("vencida");
  });

  it("avisa o que será trocado e quando o setor passa do limite de pessoas de férias", () => {
    const [a, b] = [emp(0), emp(1)];
    let sec: Sector = { ...caixa, schedule: { ...caixa.schedule, [a.id]: { ...caixa.schedule[a.id], "2026-11-03": { c: "A", lock: true } } } };
    const c = vacationConflicts(sec, a.id, "2026-11-02", 10);
    expect(c.faltas).toEqual(["2026-11-03"]);
    sec = setVacation(sec, b.id, "2026-11-05", 10);
    const st: Store = { ...base, sectors: base.sectors.map((s) => (s.id === sec.id ? sec : s)) };
    expect(overLimit(st, sec, 1, { empId: a.id, start: "2026-11-02", days: 10 })).toEqual([{ start: "2026-11-05", end: "2026-11-11", n: 2 }]);
    expect(overLimit(st, sec, null, { empId: a.id, start: "2026-11-02", days: 10 })).toEqual([]);
  });
});

describe("férias: faltas e confirmação", () => {
  it("faltas sem atestado no período aquisitivo reduzem os dias (tabela da CLT, regra configurável)", async () => {
    const { vacDaysAfterAbsences } = await import("../src/simple/vacations");
    expect([0, 5, 6, 14, 15, 23, 24, 32, 33].map((n) => vacDaysAfterAbsences(30, n))).toEqual([30, 30, 24, 24, 18, 18, 12, 12, 0]);
    const e = { ...emp(), admissao: "2025-03-10", vacPaidConfirmed: true };
    // 8 faltas e 2 atestados no 1º período (10/03/2025 a 09/03/2026)
    const row = { ...(caixa.schedule[e.id] ?? {}) };
    for (let i = 0; i < 8; i++) row[`2025-06-${String(2 + i).padStart(2, "0")}`] = { c: "A", lock: true };
    row["2025-07-01"] = { c: "M", lock: true };
    row["2025-07-02"] = { c: "M", lock: true };
    const sec = { ...caixa, schedule: { ...caixa.schedule, [e.id]: row } };
    const i = info(sec, e, "2026-10-21");
    expect(i.periods[0].faltas).toBe(8);
    expect(i.periods[0].entitled).toBe(24);
    expect(i.saldo).toBe(24);
    expect(i.issues.some((t) => t.includes("CLT art. 130"))).toBe(true);
    // regra desligada: 30 dias
    expect(info(sec, e, "2026-10-21", { ...DEFAULT_VAC, descontoFaltas: false }).saldo).toBe(30);
  });

  it("férias antigas consideradas tiradas ficam 'a confirmar' até o usuário confirmar", () => {
    const e = { ...emp(), admissao: "2020-03-10", vacPaidUntil: paidUntilFor("2020-03-10", "2026-10-21") };
    expect(info(caixa, e, "2026-10-21").needsConfirm).toBe(true);
    expect(info(caixa, e, "2026-10-21").issues.some((t) => t.startsWith("Confirme"))).toBe(true);
    expect(info(caixa, { ...e, vacPaidConfirmed: true }, "2026-10-21").needsConfirm).toBe(false);
  });
});
