"use client";
import React from "react";
import { useSim } from "./state";
import { Btn, ConfirmBtn, DurInput, NumInput, Section, Select, TextInput, TimeInput, WeekdayPicker, daysLabel } from "./ui";
import type { MinRule, Shift } from "../engine/types";
import { shiftEnd, shiftWorkMin } from "../engine/model";
import { fmtDur, fmtTime, toMin, uid } from "../engine/time";

export function ShiftsTable() {
  const sim = useSim();
  const { sector, store } = sim;
  const cfg = store.config;
  const regular = sector.shifts.filter((s) => !s.special);
  const special = sector.shifts.filter((s) => s.special);
  const setShift = (id: string, patch: Partial<Shift>) => sim.updateSector((s) => ({ ...s, shifts: s.shifts.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const count = (id: string, sp: boolean) => store.employees.filter((e) => e.sectorId === sector.id && (sp ? (e.sundayShiftId ?? sector.defaultSundayShiftId) === id : e.shiftId === id)).length;
  const remove = (id: string) =>
    sim.updateStore((st) => {
      const sec = st.sectors.find((s) => s.id === sector.id)!;
      const rest = sec.shifts.filter((x) => x.id !== id);
      const fallback = rest.find((x) => !x.special)?.id ?? "";
      return {
        ...st,
        sectors: st.sectors.map((s) => (s.id === sector.id ? { ...s, shifts: rest, defaultSundayShiftId: s.defaultSundayShiftId === id ? rest.find((x) => x.special)?.id ?? null : s.defaultSundayShiftId } : s)),
        employees: st.employees.map((e) => (e.sectorId !== sector.id ? e : { ...e, shiftId: e.shiftId === id ? fallback : e.shiftId, sundayShiftId: e.sundayShiftId === id ? null : e.sundayShiftId })),
      };
    });
  const add = (sp: boolean) =>
    sim.updateSector((s) => ({
      ...s,
      shifts: [...s.shifts, sp ? { id: uid("sh_"), name: "Domingo/feriado", start: cfg.sundayStart, breakStart: null, breakMin: 0, workMin: 240, special: true } : { id: uid("sh_"), name: `Turno ${regular.length + 1}`, start: "09:00", breakStart: "13:00", breakMin: 60, workMin: null, special: false }],
      defaultSundayShiftId: sp && !s.defaultSundayShiftId ? null : s.defaultSundayShiftId,
    }));

  const row = (s: Shift) => {
    const end = shiftEnd(cfg, s);
    const work = shiftWorkMin(cfg, s);
    const closeMin = toMin(s.special ? cfg.sundayEnd : cfg.close);
    return (
      <tr key={s.id}>
        <td className="td">
          <TextInput id={`sh-name-${s.id}`} aria-label="Nome do turno" className="w-28" value={s.name} onChange={(v) => setShift(s.id, { name: v })} />
        </td>
        <td className="td">
          <TimeInput id={`sh-start-${s.id}`} aria-label="Entrada" value={s.start} onChange={(v) => setShift(s.id, { start: v })} />
        </td>
        <td className="td">
          <div className="flex items-center gap-1">
            <input id={`sh-hasbrk-${s.id}`} type="checkbox" aria-label="Tem intervalo" checked={!!s.breakStart} onChange={(e) => setShift(s.id, e.target.checked ? { breakStart: fmtTime(toMin(s.start) + 240), breakMin: s.breakMin || 60 } : { breakStart: null })} />
            {s.breakStart ? <TimeInput id={`sh-brk-${s.id}`} aria-label="Início do intervalo" value={s.breakStart} onChange={(v) => setShift(s.id, { breakStart: v })} /> : <span className="text-muted text-[12px]">sem</span>}
          </div>
        </td>
        <td className="td">
          {s.breakStart ? (
            <Select
              id={`sh-brkdur-${s.id}`}
              aria-label="Duração do intervalo"
              value={s.breakMin}
              onChange={(v) => setShift(s.id, { breakMin: v })}
              options={Array.from(new Set([15, 30, 45, 60, 75, 90, 105, 120, 150, 180, s.breakMin])).sort((a, b) => a - b).map((m) => ({ value: m, label: fmtDur(m) }))}
            />
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="td">
          <div className="flex items-center gap-1">
            <Select
              id={`sh-mode-${s.id}`}
              aria-label="Jornada"
              value={s.workMin == null ? "std" : "own"}
              onChange={(v) => setShift(s.id, { workMin: v === "std" ? null : work })}
              options={[
                { value: "std", label: `Padrão (${fmtDur(cfg.dailyMin)})` },
                { value: "own", label: "Própria" },
              ]}
            />
            {s.workMin != null && <DurInput id={`sh-work-${s.id}`} aria-label="Jornada efetiva" value={s.workMin} onChange={(v) => setShift(s.id, { workMin: v })} />}
          </div>
        </td>
        <td className={`td font-bold tnum ${end > closeMin + 60 ? "text-amber-ink" : ""}`} title={`${s.start} + ${fmtDur(work)}${s.breakStart ? ` + ${fmtDur(s.breakMin)}` : ""}`}>
          {fmtTime(end)}
        </td>
        <td className="td text-muted tnum text-center">{count(s.id, s.special)}</td>
        <td className="td">
          <ConfirmBtn label="Excluir" confirmLabel="Excluir turno" onConfirm={() => remove(s.id)} />
        </td>
      </tr>
    );
  };

  return (
    <Section id="turnos" title="Turnos" subtitle="A saída é calculada: entrada + jornada efetiva + intervalo não computado. Mudar um turno atualiza a escala, as horas e o mapa de cobertura.">
      <div className="scroll-x">
        <table className="text-[13px] w-full">
          <thead>
            <tr>
              <th className="th">Turno</th>
              <th className="th">Entrada</th>
              <th className="th">Início do intervalo</th>
              <th className="th">Duração do intervalo</th>
              <th className="th">Jornada efetiva</th>
              <th className="th">Saída</th>
              <th className="th text-center">Pessoas</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>{regular.map(row)}</tbody>
        </table>
      </div>
      <div className="mt-2">
        <Btn onClick={() => add(false)}>+ Turno</Btn>
      </div>
      <h3 className="mt-4 mb-1 text-[13.5px] font-bold">Domingos e feriados (jornada específica)</h3>
      <p className="text-[12px] text-muted mb-1">Usado em domingos e feriados com loja aberta ({cfg.sundayStart}–{cfg.sundayEnd}). Cada pessoa pode ter o seu; sem escolha, vale o padrão do setor.</p>
      <div className="scroll-x">
        <table className="text-[13px] w-full">
          <tbody>{special.map(row)}</tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
        <Btn onClick={() => add(true)}>+ Turno de domingo/feriado</Btn>
        <label className="inline-flex items-center gap-1.5">
          Padrão do setor:
          <Select
            id="sh-sunday-default"
            aria-label="Turno padrão de domingo"
            value={sector.defaultSundayShiftId ?? ""}
            onChange={(v) => sim.updateSector((s) => ({ ...s, defaultSundayShiftId: v || null }))}
            options={[{ value: "", label: "usar turno normal" }, ...special.map((s) => ({ value: s.id, label: s.name }))]}
          />
        </label>
      </div>
    </Section>
  );
}

export function MinRulesTable() {
  const sim = useSim();
  const { sector } = sim;
  const set = (id: string, patch: Partial<MinRule>) => sim.updateSector((s) => ({ ...s, minRules: s.minRules.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const presets: [string, number[]][] = [
    ["Seg a sex", [1, 2, 3, 4, 5]],
    ["Sábado", [6]],
    ["Domingo", [0]],
    ["Seg a sáb", [1, 2, 3, 4, 5, 6]],
  ];
  return (
    <Section
      id="minimos"
      title="Mínimo de pessoas no posto"
      subtitle={`Quantos ${sector.rolePlural} precisam estar no posto em cada faixa. Uma faixa com dias mais específicos (ou uma data) vale no lugar da faixa geral naquele horário. O ideal é opcional: abaixo dele o mapa fica amarelo.`}
    >
      <div className="scroll-x">
        <table className="text-[13px] w-full">
          <thead>
            <tr>
              <th className="th">Dias</th>
              <th className="th">De</th>
              <th className="th">Até</th>
              <th className="th">Mínimo</th>
              <th className="th">Ideal</th>
              <th className="th">Observação</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {sector.minRules.map((r) => (
              <tr key={r.id}>
                <td className="td">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {r.date ? (
                      <input id={`mr-date-${r.id}`} type="date" aria-label="Data específica" className="field" value={r.date} onChange={(e) => set(r.id, { date: e.target.value || null })} />
                    ) : (
                      <WeekdayPicker idPrefix={`mr-${r.id}`} value={r.days} onChange={(v) => set(r.id, { days: v })} />
                    )}
                    <span className="text-[11.5px] text-muted whitespace-nowrap">{r.date ? "data específica" : daysLabel(r.days)}</span>
                    <button type="button" className="text-[11px] underline text-muted hover:text-ink" onClick={() => set(r.id, r.date ? { date: null } : { date: sim.store.config.startDate })}>
                      {r.date ? "usar dias" : "usar data"}
                    </button>
                  </div>
                </td>
                <td className="td">
                  <TimeInput id={`mr-start-${r.id}`} aria-label="De" value={r.start} onChange={(v) => set(r.id, { start: v })} />
                </td>
                <td className="td">
                  <TimeInput id={`mr-end-${r.id}`} aria-label="Até" value={r.end} onChange={(v) => set(r.id, { end: v })} />
                </td>
                <td className="td">
                  <NumInput id={`mr-min-${r.id}`} aria-label="Mínimo" value={r.min} min={0} max={500} onChange={(v) => v != null && set(r.id, { min: v })} className="font-bold" />
                </td>
                <td className="td">
                  <NumInput id={`mr-ideal-${r.id}`} aria-label="Ideal" allowEmpty placeholder="—" value={r.ideal ?? null} min={0} max={500} onChange={(v) => set(r.id, { ideal: v })} />
                </td>
                <td className="td">
                  <TextInput id={`mr-label-${r.id}`} aria-label="Observação" className="w-36" value={r.label ?? ""} onChange={(v) => set(r.id, { label: v })} />
                </td>
                <td className="td">
                  <ConfirmBtn label="Excluir" confirmLabel="Excluir faixa" onConfirm={() => sim.updateSector((s) => ({ ...s, minRules: s.minRules.filter((x) => x.id !== r.id) }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Btn
          kind="primary"
          onClick={() =>
            sim.updateSector((s) => ({ ...s, minRules: [...s.minRules, { id: uid("mr_"), days: [1, 2, 3, 4, 5], start: "09:00", end: "12:00", min: 2, ideal: null, date: null, label: "" }] }))
          }
        >
          + Adicionar faixa de mínimo
        </Btn>
        <span className="text-[12px] text-muted">Atalhos:</span>
        {presets.map(([l, d]) => (
          <Btn key={l} onClick={() => sim.updateSector((s) => ({ ...s, minRules: [...s.minRules, { id: uid("mr_"), days: d, start: d.includes(0) && d.length === 1 ? sim.store.config.sundayStart : sim.store.config.open, end: d.includes(0) && d.length === 1 ? sim.store.config.sundayEnd : sim.store.config.close, min: 1, ideal: null, date: null, label: "" }] }))}>
            + {l}
          </Btn>
        ))}
      </div>
    </Section>
  );
}
