export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const WEEKDAY_LONG = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
/** Ordem de exibição segunda → domingo. */
export const WEEK_ORDER_MON = [1, 2, 3, 4, 5, 6, 0];

export function toMin(hhmm: string | null | undefined): number {
  if (!hhmm) return 0;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function fmtTime(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** 504 -> "8h24" ; 2520 -> "42h" ; 2256 -> "37h36" */
export function fmtDur(min: number): string {
  const sign = min < 0 ? "-" : "";
  const a = Math.abs(Math.round(min));
  const h = Math.floor(a / 60);
  const m = a % 60;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h${String(m).padStart(2, "0")}`;
}

/** "8h24" | "8:24" | "8" -> minutos */
export function parseDur(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/\s/g, "");
  let m = /^(\d{1,3})h(\d{1,2})?m?$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0);
  m = /^(\d{1,3}):(\d{2})$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d{1,3})(?:[.,](\d+))?$/.exec(t);
  if (m) return Math.round(parseFloat(`${m[1]}.${m[2] ?? 0}`) * 60);
  return null;
}

// Datas em ISO (YYYY-MM-DD) tratadas em UTC para evitar fuso.
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}
export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** Data de hoje no fuso do computador (não em UTC). */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Soma meses (dia 31 + 1 mês = último dia do mês seguinte). */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return toISO(t);
}
/** Dias de a até b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}
export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}
export function weekdayOf(iso: string): number {
  return parseISO(iso).getUTCDay();
}
export function dayNum(iso: string): number {
  return parseISO(iso).getUTCDate();
}
export function fmtDateBR(iso: string, withYear = true): string {
  const [y, m, d] = iso.split("-");
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}
/** Dias desde 1970-01-01 (usado para ciclos que continuam entre períodos). */
export function epochDay(iso: string): number {
  return Math.floor(parseISO(iso).getTime() / 86400000);
}
/** Índice absoluto do domingo (contínuo no tempo). */
export function sundayIndex(iso: string): number {
  // 1970-01-04 foi domingo (epochDay 3)
  return Math.floor((epochDay(iso) - 3) / 7);
}
export function nextSunday(iso: string): string {
  const wd = weekdayOf(iso);
  return wd === 0 ? iso : addDays(iso, 7 - wd);
}

export function uid(prefix = ""): string {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

export function pluralize(n: number, s: string, p: string) {
  return n === 1 ? s : p;
}

export function fmtNum(n: number, digits = 1): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function fmtMoney(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** Início da semana (dia `ws`) que contém a data. */
export function weekStartOf(iso: string, ws: number): string {
  return addDays(iso, -((weekdayOf(iso) - ws + 7) % 7));
}
/** Próximo início de semana (dia `ws`) a partir da data, inclusive. */
export function nextWeekStart(iso: string, ws: number): string {
  return addDays(iso, (ws - weekdayOf(iso) + 7) % 7);
}
