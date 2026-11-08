// Ajustes de turno depois de gerar as folgas (Regras avançadas):
// 12) rodízio semanal entre os turnos marcados em Horários;
// 11) quem fecha não abre no dia seguinte (troca o turno do dia seguinte quando há outro);
// 8b) quando o titular está de folga, o substituto escolhido vai para o turno dele naquele dia.
// As trocas ficam marcadas como automáticas (cell.auto) e são refeitas a cada geração;
// turno escolhido à mão num dia nunca é mexido.
import type { CalDay, Shift, Store } from "./types";
import { configDoSetor } from "./regrasSetor";
import { buildDays, cellCode, dayShift, isPlantao } from "./model";
import { epochDay, toMin, weekStartOf, weekdayOf } from "./time";

export interface AjusteTurnos {
  store: Store;
  /** dias com turno trocado pelo rodízio */
  rodizio: number;
  /** aberturas trocadas porque a pessoa tinha fechado na véspera */
  trocas: number;
  /** casos sem turno alternativo (continuam fechando e abrindo) */
  semAlternativa: number;
  /** dias em que o substituto foi para o turno de quem está de folga (8b) */
  cobertos: number;
  /** dias de folga do titular em que o substituto também não trabalha (8b) */
  semCobertura: number;
}

export function ajustarTurnos(store: Store, sectorId: string): AjusteTurnos {
  const sec0 = store.sectors.find((s) => s.id === sectorId);
  const r = configDoSetor(store.config, sec0).regras;
  const out: AjusteTurnos = { store, rodizio: 0, trocas: 0, semAlternativa: 0, cobertos: 0, semCobertura: 0 };
  if (!sec0) return out;
  const temAuto = Object.values(sec0.schedule).some((row) => Object.values(row).some((c) => c.auto));
  const ids = new Set(store.employees.filter((e) => e.sectorId === sectorId).map((e) => e.id));
  const cobre = (r?.cobrirFolga?.pares ?? []).filter(([a, b]) => a !== b && ids.has(a) && ids.has(b));
  if (!r?.rodizioTurnos && !r?.fecharAbrir && !cobre.length && !temAuto) return out;
  const days = buildDays(store.config);
  // 1) desfaz as trocas automáticas anteriores
  const schedule: typeof sec0.schedule = Object.fromEntries(
    Object.entries(sec0.schedule).map(([emp, row]) => [
      emp,
      Object.fromEntries(
        Object.entries(row).map(([d, c]) => {
          if (!c.auto) return [d, c];
          const { shiftId: _s, auto: _a, ...resto } = c;
          return [d, resto];
        }),
      ),
    ]),
  );
  let sec = { ...sec0, schedule };
  const emps = store.employees.filter((e) => e.sectorId === sectorId && !isPlantao(e));
  const set = (empId: string, d: CalDay, shiftId: string | null) => {
    const row = { ...(sec.schedule[empId] ?? {}) };
    const cur = row[d.date] ?? { c: cellCode(sec, empId, d) };
    const { shiftId: _s, auto: _a, ...resto } = cur;
    row[d.date] = shiftId ? { ...resto, shiftId, auto: true } : resto;
    sec = { ...sec, schedule: { ...sec.schedule, [empId]: row } };
  };
  const manual = (empId: string, d: CalDay) => {
    const c = sec.schedule[empId]?.[d.date];
    return !!c?.shiftId && !c.auto;
  };
  const trabalha = (empId: string, d: CalDay) => {
    const c = cellCode(sec, empId, d);
    return c === "T" || c === "D";
  };

  // 2) rodízio semanal entre os turnos marcados
  if (r?.rodizioTurnos) {
    const rot = sec.shifts.filter((s) => s.rodizio && !s.special && !s.plantao).sort((a, b) => toMin(a.start) - toMin(b.start));
    if (rot.length >= 2) {
      const ws = store.config.weekStart ?? weekdayOf(store.config.startDate);
      for (const e of emps) {
        const i = rot.findIndex((s) => s.id === e.shiftId);
        if (i < 0) continue;
        for (const d of days) {
          if (d.special || d.closed || !trabalha(e.id, d) || manual(e.id, d)) continue;
          const semana = Math.floor(epochDay(weekStartOf(d.date, ws)) / 7);
          const alvo = rot[(((i + semana) % rot.length) + rot.length) % rot.length];
          if (alvo.id !== e.shiftId) {
            set(e.id, d, alvo.id);
            out.rodizio++;
          }
        }
      }
    }
  }

  // 3) quem fecha não abre no dia seguinte
  if (r?.fecharAbrir) {
    const doTipo = (d: CalDay): Shift[] => sec.shifts.filter((s) => !s.plantao && (d.special ? s.special : !s.special));
    const st = () => ({ ...store, sectors: store.sectors.map((s) => (s.id === sectorId ? sec : s)) });
    for (const e of emps) {
      for (let k = 0; k + 1 < days.length; k++) {
        const d1 = days[k];
        const d2 = days[k + 1];
        if (!trabalha(e.id, d1) || !trabalha(e.id, d2) || d2.closed) continue;
        const s1 = dayShift(st(), sec, e, d1);
        const s2 = dayShift(st(), sec, e, d2);
        if (!s1.shift || !s2.shift) continue;
        const t1 = doTipo(d1);
        const t2 = doTipo(d2);
        if (t1.length < 2 || t2.length < 2) continue;
        const fimMax = Math.max(...t1.map((x) => dayShift(st(), { ...sec, schedule: { ...sec.schedule, [e.id]: { ...sec.schedule[e.id], [d1.date]: { c: d1.special ? "D" : "T", shiftId: x.id } } } }, e, d1).end));
        const iniMin = Math.min(...t2.map((x) => toMin(x.start)));
        const fecha = s1.end >= fimMax - 30;
        const abre = s2.start <= iniMin + 30;
        if (!fecha || !abre) continue;
        if (manual(e.id, d2)) continue;
        // outro turno do mesmo tipo que não seja de abertura: o que começa mais cedo depois da abertura
        const alt = t2.filter((x) => toMin(x.start) > iniMin + 30).sort((a, b) => toMin(a.start) - toMin(b.start))[0];
        if (!alt) {
          out.semAlternativa++;
          continue;
        }
        set(e.id, d2, alt.id === e.shiftId && !d2.special ? null : alt.id);
        out.trocas++;
      }
    }
  }
  // 4) quem cobre a folga de quem (8b): no dia de folga do titular, o substituto vai para o turno do titular
  //    (o turno de domingo/feriado do titular nesses dias). Dia com turno escolhido à mão não é mexido.
  if (cobre.length) {
    const ausente = (c: string) => c === "F" || (!!r?.cobrirFolga?.ausencias && (c === "V" || c === "A" || c === "M"));
    const porId = new Map(store.employees.map((e) => [e.id, e]));
    for (const d of days) {
      if (d.closed) continue;
      for (const [a, b] of cobre) {
        const titular = porId.get(a)!;
        const subst = porId.get(b)!;
        if (isPlantao(titular) || isPlantao(subst) || !ausente(cellCode(sec, a, d))) continue;
        if (!trabalha(b, d)) {
          out.semCobertura++;
          continue;
        }
        if (manual(b, d)) continue;
        // turno do titular nesse tipo de dia: o escolhido para ele no dia (se houver), senão o habitual
        const doDia = sec.schedule[a]?.[d.date]?.shiftId;
        const alvo = doDia ?? (d.special ? (titular.sundayShiftId ?? sec.defaultSundayShiftId ?? sec.shifts.find((s) => s.special)?.id) : titular.shiftId);
        if (!alvo || !sec.shifts.some((s) => s.id === alvo)) continue;
        const proprio = d.special ? (subst.sundayShiftId ?? sec.defaultSundayShiftId ?? sec.shifts.find((s) => s.special)?.id) : subst.shiftId;
        const atual = sec.schedule[b]?.[d.date]?.shiftId ?? proprio;
        if (atual === alvo) continue;
        set(b, d, alvo === proprio ? null : alvo);
        out.cobertos++;
      }
    }
  }
  out.store = { ...store, sectors: store.sectors.map((s) => (s.id === sectorId ? sec : s)) };
  return out;
}
