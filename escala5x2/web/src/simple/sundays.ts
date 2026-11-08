// Escala de domingo: situação de cada pessoa em um domingo, cópia entre domingos e modelos reutilizáveis.
import type { CalDay, Sector, SundayTemplate } from "../engine/types";
import { cellCode } from "../engine/model";
import { uid } from "../engine/time";

export type SundayEntry = { c: "D" | "F"; shiftId?: string };

/** Situação da pessoa no domingo (trabalha em qual turno, ou folga). Férias, falta e loja fechada não entram. */
export function sundayEntry(sec: Sector, empId: string, day: CalDay): SundayEntry | null {
  const c = cellCode(sec, empId, day);
  if (c === "F") return { c: "F" };
  if (c === "D") {
    const sid = sec.schedule[empId]?.[day.date]?.shiftId;
    return sid ? { c: "D", shiftId: sid } : { c: "D" };
  }
  return null;
}

/** Grava a situação de um domingo (fixada, como toda edição manual). */
export function setSunday(sec: Sector, empId: string, date: string, e: SundayEntry): Sector {
  const row = { ...(sec.schedule[empId] ?? {}) };
  row[date] = { c: e.c, lock: true, ...(e.c === "D" && e.shiftId ? { shiftId: e.shiftId } : {}) };
  return { ...sec, schedule: { ...sec.schedule, [empId]: row } };
}

/**
 * Aplica as situações em vários domingos. Quem está de férias ou falta no domingo de destino não muda.
 * Devolve o setor novo e quantas células mudaram por data.
 */
export function applyToSundays(sec: Sector, entries: Record<string, SundayEntry>, days: CalDay[]): { sector: Sector; changed: Record<string, number> } {
  let out = sec;
  const changed: Record<string, number> = {};
  for (const d of days) {
    changed[d.date] = 0;
    if (d.closed) continue;
    for (const [empId, e] of Object.entries(entries)) {
      const cur = cellCode(out, empId, d);
      if (cur === "V" || cur === "A" || cur === "M") continue;
      const curShift = out.schedule[empId]?.[d.date]?.shiftId;
      const same = cur === e.c && (e.c === "F" || (curShift ?? "") === (e.shiftId ?? ""));
      if (same && out.schedule[empId]?.[d.date]?.lock) continue;
      out = setSunday(out, empId, d.date, e);
      if (!same) changed[d.date]++;
    }
  }
  return { sector: out, changed };
}

/** Modelo a partir de um domingo: guarda quem trabalha (e em qual turno) e quem folga. */
export function templateFromSunday(sec: Sector, empIds: string[], day: CalDay, name: string): SundayTemplate {
  const entries: Record<string, SundayEntry> = {};
  for (const id of empIds) {
    const e = sundayEntry(sec, id, day);
    if (e) entries[id] = e;
  }
  return { id: uid("tpl_"), name: name.trim() || "Modelo de domingo", entries };
}
