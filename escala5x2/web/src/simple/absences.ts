// Ranking de faltas (células "A") e de atestados (células "M"), lidos da escala de todas as lojas e setores.
// Não altera nada; só conta.
import type { CalDay, Code, Employee, Sector, Store } from "../engine/types";
import { buildDays, cellCode } from "../engine/model";
import { addDays, weekdayOf } from "../engine/time";

export interface AbsFilters {
  /** datas inclusivas (AAAA-MM-DD); null = sem limite */
  from: string | null;
  to: string | null;
  storeId: string; // "all" ou id
  sector: string; // "all" ou nome do setor
  shift: string; // "all" ou nome do turno
  func: string; // "all" ou função
  weekday: number; // -1 = todos
  q: string;
}
export const NO_FILTERS: AbsFilters = { from: null, to: null, storeId: "all", sector: "all", shift: "all", func: "all", weekday: -1, q: "" };

export interface AbsRow {
  key: string;
  store: Store;
  sector: Sector;
  emp: Employee;
  name: string;
  shiftName: string;
  func: string;
  /** datas das faltas, em ordem */
  dates: string[];
  /** faltas seguidas contam como uma ocorrência (folgas no meio não separam) */
  occurrences: number;
  /** faltas no dia antes ou depois de uma folga/feriado */
  nearOff: string[];
  /** dias em que a pessoa estava escalada para trabalhar (trabalhou ou faltou) */
  scheduled: number;
  /** dias escalados estimados (datas sem escala gravada, fora do período planejado) */
  estimated: number;
  /** faltas ÷ dias escalados (0 a 1) */
  rate: number;
  last: string | null;
  byWeekday: number[];
}

const inRange = (d: string, f: AbsFilters) => (!f.from || d >= f.from) && (!f.to || d <= f.to);
const OFF = new Set<Code>(["F", "H"]);

/** Dia do calendário da loja para qualquer data (fechado, domingo/feriado etc.). */
function dayMaker(st: Store) {
  const cache = new Map<string, CalDay>();
  return (date: string): CalDay => {
    let d = cache.get(date);
    if (!d) {
      d = buildDays(st.config, date, 1)[0];
      cache.set(date, d);
    }
    return d;
  };
}

export type AbsCode = "A" | "M";

/** Uma linha por pessoa que passa nos filtros (inclusive quem não teve nenhum registro). */
export function absenceRows(stores: Store[], f: AbsFilters, kind: AbsCode = "A"): AbsRow[] {
  const out: AbsRow[] = [];
  const q = f.q.trim().toLowerCase();
  for (const st of stores) {
    if (f.storeId !== "all" && st.id !== f.storeId) continue;
    const day = dayMaker(st);
    const period = buildDays(st.config).map((d) => d.date);
    // limites da conta: o filtro de período ou, sem filtro, do primeiro ao último dia com escala conhecida
    const allDates = st.sectors.flatMap((s) => Object.values(s.schedule).flatMap((r) => Object.keys(r)));
    const lo = f.from ?? [period[0], ...allDates].sort()[0];
    const hi = f.to ?? [period[period.length - 1], ...allDates].sort().pop()!;
    // fora do período planejado e sem escala gravada, a pessoa trabalha (7 − folgas) de cada 7 dias abertos
    const workShare = (7 - st.config.folgasPorSemana) / 7;
    for (const sec of st.sectors) {
      if (f.sector !== "all" && sec.name !== f.sector) continue;
      for (const emp of st.employees) {
        if (emp.sectorId !== sec.id) continue;
        const shiftName = sec.shifts.find((s) => s.id === emp.shiftId)?.name.trim() ?? "";
        const func = emp.func.trim();
        const name = (emp.name || emp.func).trim();
        if (f.shift !== "all" && shiftName !== f.shift) continue;
        if (f.func !== "all" && func !== f.func) continue;
        if (q && !name.toLowerCase().includes(q) && !emp.matricula.includes(f.q.trim())) continue;
        const row = sec.schedule[emp.id] ?? {};
        // datas conhecidas: período planejado + tudo que já foi gravado para a pessoa
        const known = Array.from(new Set([...period, ...Object.keys(row)])).filter((d) => inRange(d, f) && (f.weekday < 0 || weekdayOf(d) === f.weekday)).sort();
        const code = (d: string) => cellCode(sec, emp.id, day(d));
        const dates: string[] = [];
        let scheduled = 0;
        for (const d of known) {
          const c = code(d);
          if (c === kind) dates.push(d);
          if (c === "A" || c === "M" || c === "T" || c === "D") scheduled++;
        }
        const knownSet = new Set(known);
        let est = 0;
        for (let d = lo; d <= hi; d = addDays(d, 1)) {
          if (knownSet.has(d) || period.includes(d) || row[d] || (f.weekday >= 0 && weekdayOf(d) !== f.weekday) || (emp.admissao && d < emp.admissao)) continue;
          if (!day(d).closed) est += emp.regime === "12x36" ? 0.5 : workShare;
        }
        const estimated = Math.round(est);
        scheduled += estimated;
        const byWeekday = [0, 0, 0, 0, 0, 0, 0];
        const nearOff: string[] = [];
        let occurrences = 0;
        let prev: string | null = null;
        for (const d of dates) {
          byWeekday[weekdayOf(d)]++;
          const before = code(addDays(d, -1));
          const after = code(addDays(d, 1));
          if (OFF.has(before) || OFF.has(after) || day(addDays(d, -1)).closed || day(addDays(d, 1)).closed) nearOff.push(d);
          // nova ocorrência se entre a falta anterior e esta houve dia trabalhado (ou mais de 2 semanas)
          let joined = false;
          if (prev) {
            joined = true;
            for (let x = addDays(prev, 1), n = 0; x < d; x = addDays(x, 1), n++) {
              const c = code(x);
              if (n > 14 || c === "T" || c === "D" || c === "V") {
                joined = false;
                break;
              }
            }
          }
          if (!joined) occurrences++;
          prev = d;
        }
        out.push({
          key: `${st.id}|${emp.id}`,
          store: st,
          sector: sec,
          emp,
          name,
          shiftName,
          func,
          dates,
          estimated,
          occurrences,
          nearOff,
          scheduled,
          rate: scheduled ? dates.length / scheduled : 0,
          last: dates[dates.length - 1] ?? null,
          byWeekday,
        });
      }
    }
  }
  return out;
}

export type AbsSort = "dias" | "ocorrencias" | "emendadas" | "taxa" | "nome";
export function sortRows(rows: AbsRow[], key: AbsSort, desc = true): AbsRow[] {
  const v = (r: AbsRow): number | string =>
    key === "dias" ? r.dates.length : key === "ocorrencias" ? r.occurrences : key === "emendadas" ? r.nearOff.length : key === "taxa" ? r.rate : r.name.toLowerCase();
  return [...rows].sort((a, b) => {
    const x = v(a);
    const y = v(b);
    const c = typeof x === "string" ? x.localeCompare(y as string, "pt-BR") : (x as number) - (y as number);
    // empate: mais faltas, depois maior taxa, depois nome
    return (desc ? -c : c) || b.dates.length - a.dates.length || b.rate - a.rate || a.name.localeCompare(b.name, "pt-BR");
  });
}

/** Posição no ranking (empates dividem a mesma posição). */
export function ranks(rows: AbsRow[], key: AbsSort): number[] {
  const v = (r: AbsRow) => (key === "dias" || key === "nome" ? r.dates.length : key === "ocorrencias" ? r.occurrences : key === "emendadas" ? r.nearOff.length : r.rate);
  const out: number[] = [];
  rows.forEach((r, i) => out.push(i > 0 && v(rows[i - 1]) === v(r) ? out[i - 1] : i + 1));
  return out;
}

export interface AbsSummary {
  total: number;
  people: number;
  withAbs: number;
  scheduled: number;
  /** quantos dos dias escalados foram estimados */
  estimated: number;
  rate: number;
  nearOff: number;
  occurrences: number;
  byWeekday: number[];
  /** semana (segunda-feira) → faltas */
  byWeek: { week: string; n: number }[];
}
export function summarize(rows: AbsRow[]): AbsSummary {
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  const weeks = new Map<string, number>();
  let total = 0;
  let scheduled = 0;
  let estimated = 0;
  let near = 0;
  let occ = 0;
  for (const r of rows) {
    total += r.dates.length;
    scheduled += r.scheduled;
    estimated += r.estimated;
    near += r.nearOff.length;
    occ += r.occurrences;
    r.byWeekday.forEach((n, i) => (byWeekday[i] += n));
    for (const d of r.dates) {
      const w = addDays(d, -((weekdayOf(d) + 6) % 7));
      weeks.set(w, (weeks.get(w) ?? 0) + 1);
    }
  }
  // semanas sem falta entre a primeira e a última também aparecem (zero)
  const byWeek: { week: string; n: number }[] = [];
  const ks = Array.from(weeks.keys()).sort();
  if (ks.length) for (let w = ks[0]; w <= ks[ks.length - 1]; w = addDays(w, 7)) byWeek.push({ week: w, n: weeks.get(w) ?? 0 });
  return { total, people: rows.length, withAbs: rows.filter((r) => r.dates.length).length, scheduled, estimated, rate: scheduled ? total / scheduled : 0, nearOff: near, occurrences: occ, byWeekday, byWeek };
}

export type AbsGroup = "setor" | "turno" | "loja" | "funcao";
export function groupTotals(rows: AbsRow[], by: AbsGroup): { label: string; n: number; people: number; scheduled: number }[] {
  const m = new Map<string, { label: string; n: number; people: number; scheduled: number }>();
  for (const r of rows) {
    const label = (by === "setor" ? r.sector.name : by === "turno" ? r.shiftName : by === "loja" ? r.store.name : r.func) || "—";
    const g = m.get(label) ?? { label, n: 0, people: 0, scheduled: 0 };
    g.n += r.dates.length;
    g.people++;
    g.scheduled += r.scheduled;
    m.set(label, g);
  }
  return Array.from(m.values()).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "pt-BR"));
}
