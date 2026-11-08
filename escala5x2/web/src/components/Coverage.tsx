"use client";
import React, { useMemo, useState } from "react";
import { useSim } from "./state";
import { Btn, NumInput, Section, Select } from "./ui";
import type { SlotStatus } from "../engine/coverage";
import { cellCode, presenceAt, requirementAt } from "../engine/model";
import { analyzeSectorCached as analyzeSector } from "../engine/analysis";
import { fmtDateBR, fmtTime, WEEKDAY_LONG, WEEKDAY_SHORT, WEEK_ORDER_MON, fmtNum } from "../engine/time";
import type { Employee } from "../engine/types";

export const STATUS_CLS: Record<SlotStatus, string> = {
  closed: "bg-transparent text-transparent",
  none: "bg-surface-2 text-muted",
  red: "bg-red text-red-ink font-bold",
  yellow: "bg-amber text-amber-ink font-semibold",
  light: "bg-green-light text-green-light-ink",
  green: "bg-green text-green-ink font-semibold",
};

export function MovementTable() {
  const sim = useSim();
  const { sector, analysis } = sim;
  const order = [1, 2, 3, 4, 5, 6, 0];
  const set = (wd: number, patch: Partial<(typeof sector.movement)[number]>) =>
    sim.updateSector((s) => ({ ...s, movement: s.movement.map((m, i) => (i === wd ? { ...m, ...patch } : m)) }));
  const offAvg = useMemo(() => {
    const out = [0, 0, 0, 0, 0, 0, 0];
    const n = [0, 0, 0, 0, 0, 0, 0];
    for (const d of analysis.days) {
      if (d.closed) continue;
      n[d.weekday]++;
      out[d.weekday] += analysis.employees.filter((e) => cellCode(sector, e.id, d) === "F").length;
    }
    return out.map((v, i) => (n[i] ? v / n[i] : 0));
  }, [analysis, sector]);
  return (
    <Section
      id="movimento"
      title="Movimento e limite de folgas"
      subtitle="Dias de movimento forte recebem prioridade de cobertura; as folgas variáveis vão preferencialmente para os dias fracos, sempre respeitando as restrições obrigatórias. Altere e clique em Redistribuir."
      actions={
        <Btn kind="orange" onClick={() => sim.redistribute()} disabled={sim.running}>
          Redistribuir folgas
        </Btn>
      }
    >
      <div className="scroll-x">
        <table className="text-[12.5px] tnum">
          <thead>
            <tr>
              <th className="th min-w-[170px]" />
              {order.map((d) => (
                <th key={d} className="th text-center w-[100px]">
                  {WEEKDAY_SHORT[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="td text-left font-medium">
                Movimento <span className="text-muted font-normal">(1 fraco · 3 forte)</span>
              </th>
              {order.map((d) => (
                <td key={d} className="td text-center">
                  <Select
                    id={`mv-int-${d}`}
                    aria-label={`Movimento ${WEEKDAY_SHORT[d]}`}
                    value={sector.movement[d].intensity}
                    onChange={(v) => set(d, { intensity: v })}
                    options={[
                      { value: 1, label: "1 fraco" },
                      { value: 2, label: "2 médio" },
                      { value: 3, label: "3 forte" },
                    ]}
                    className={sector.movement[d].intensity === 3 ? "!bg-pink" : sector.movement[d].intensity === 1 ? "!bg-surface-2" : ""}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="td text-left font-medium">
                Máximo de pessoas de folga
              </th>
              {order.map((d) => (
                <td key={d} className="td text-center">
                  <NumInput id={`mv-max-${d}`} aria-label={`Máximo de folgas ${WEEKDAY_SHORT[d]}`} allowEmpty placeholder="livre" value={sector.movement[d].maxOff} min={0} max={200} onChange={(v) => set(d, { maxOff: v })} />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="td text-left font-medium">
                Mínimo de pessoas no dia
              </th>
              {order.map((d) => (
                <td key={d} className="td text-center">
                  <NumInput id={`mv-min-${d}`} aria-label={`Mínimo diário ${WEEKDAY_SHORT[d]}`} allowEmpty placeholder="—" value={sector.movement[d].minStaff} min={0} max={200} onChange={(v) => set(d, { minStaff: v })} />
                </td>
              ))}
            </tr>
            <tr className="text-muted">
              <th scope="row" className="td text-left font-normal">
                Hoje na escala: média de folgas / trabalhando
              </th>
              {order.map((d) => (
                <td key={d} className="td text-center">
                  {fmtNum(offAvg[d], 1)} / {fmtNum(analysis.indicators.perDayByWeekday[d], 1)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function CoverageMap() {
  const sim = useSim();
  const { store, sector, analysis } = sim;
  const cfg = store.config;
  const [sel, setSel] = useState<{ dayIdx: number; slot: number } | null>(null);
  const weeks = Math.ceil(analysis.days.length / 7);
  const week = Math.min(sim.coverageWeek, weeks - 1);
  const cov = analysis.coverage.filter((c) => c.day.week === week);
  const rows = WEEK_ORDER_MON.map((wd) => cov.find((c) => c.day.weekday === wd)).filter((c): c is NonNullable<typeof c> => !!c);
  const axis = analysis.axis;
  const hl = sim.highlight?.kind === "coverage" && sim.highlight.week === week ? sim.highlight : null;
  const slot = cfg.slot;

  return (
    <Section
      id="cobertura"
      title="Mapa de cobertura"
      subtitle={
        <>
          Quantas pessoas estão no posto a cada {slot} minutos, já descontando intervalos, folgas, ausências, férias e quem está em outro posto ou atividade. Clique numa célula para ver quem está disponível.
        </>
      }
      actions={
        <>
          <Select id="cov-slot" aria-label="Intervalo do mapa" value={cfg.slot} onChange={(v) => sim.updateStore((s) => ({ ...s, config: { ...s.config, slot: v } }))} options={[{ value: 15, label: "15 min" }, { value: 30, label: "30 min" }]} />
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2 mb-4" role="tablist" aria-label="Semanas">
        {Array.from({ length: weeks }, (_, w) => {
          const d0 = analysis.days[w * 7];
          const d6 = analysis.days[w * 7 + 6];
          const bad = analysis.coverage.some((c) => c.day.week === w && c.status.includes("red"));
          return (
            <button
              key={w}
              role="tab"
              aria-selected={w === week}
              type="button"
              onClick={() => {
                sim.setCoverageWeek(w);
                setSel(null);
              }}
              className={`rounded-full px-4 py-1.5 text-[12.5px] font-mono border ${w === week ? "bg-navy text-navy-ink border-navy" : "bg-surface border-line hover:bg-surface-2"}`}
            >
              {fmtDateBR(d0.date, false)}–{fmtDateBR(d6.date, false)}
              {bad && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-red align-middle" aria-label="com faltas" />}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-muted mb-3">
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-3 w-4 rounded-sm bg-red" /> abaixo do mínimo
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-3 w-4 rounded-sm bg-amber" /> no mínimo, abaixo do ideal
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-3 w-4 rounded-sm bg-green-light border border-line" /> exatamente o mínimo
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-3 w-4 rounded-sm bg-green" /> acima do mínimo
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-3 w-4 rounded-sm bg-surface-2 border border-line" /> sem mínimo definido
        </span>
      </div>
      <div className="scroll-x rounded-md border border-line">
        <table className="border-collapse tnum text-[11px]">
          <thead>
            <tr>
              <th className="th sticky left-0 bg-surface z-10 min-w-[64px]" />
              {axis.map((t, i) => (
                <th key={i} className="p-0 text-left align-bottom font-semibold text-muted" style={{ minWidth: slot === 15 ? 27 : 37 }}>
                  {t % 60 === 0 ? <span className="pl-0.5 text-[10.5px]">{t / 60}h</span> : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.day.date}>
                <th scope="row" className="sticky left-0 z-10 bg-surface px-2 text-left font-semibold whitespace-nowrap text-[11.5px]">
                  {WEEKDAY_SHORT[c.day.weekday]} {fmtDateBR(c.day.date, false).slice(0, 2)}
                  {c.day.holiday && <span className="ml-1 text-red">feriado</span>}
                </th>
                {axis.map((_, i) => {
                  const st = c.day.closed ? "closed" : c.status[i];
                  const inHl = hl && hl.weekday === c.day.weekday && i >= hl.from && i < hl.to;
                  const isSel = sel && sel.dayIdx === c.day.idx && sel.slot === i;
                  const show = st !== "closed" && (c.open[i] || c.counts[i] > 0 || c.req[i] > 0);
                  return (
                    <td key={i} className="p-[1.5px]">
                      <button
                        type="button"
                        key={inHl ? `h${sim.highlight?.nonce}` : "n"}
                        disabled={!show}
                        onClick={() => setSel({ dayIdx: c.day.idx, slot: i })}
                        aria-label={`${WEEKDAY_LONG[c.day.weekday]} ${fmtTime(axis[i])}: ${c.counts[i]} pessoas, mínimo ${c.req[i]}`}
                        className={`block h-[26px] w-full rounded-[4px] text-center leading-[26px] ${show ? STATUS_CLS[st] : "bg-transparent"} ${inHl ? "outline outline-2 outline-ink hl-pulse" : ""} ${isSel ? "outline outline-2 outline-focus" : ""}`}
                        style={{ minWidth: slot === 15 ? 24 : 34 }}
                      >
                        {show ? c.counts[i] : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel && <SlotDetail dayIdx={sel.dayIdx} slot={sel.slot} onClose={() => setSel(null)} />}
    </Section>
  );
}

function names(list: Employee[]) {
  return list.map((e) => e.name || e.func);
}

function SlotDetail({ dayIdx, slot, onClose }: { dayIdx: number; slot: number; onClose: () => void }) {
  const sim = useSim();
  const { store, sector, analysis } = sim;
  const day = analysis.days[dayIdx];
  const t = analysis.axis[slot];
  const req = requirementAt(sector, day, t);
  const groups = useMemo(() => {
    const avail: { e: Employee; post: string; from?: string }[] = [];
    const brk: Employee[] = [];
    const other: { e: Employee; where: string }[] = [];
    const off: { e: Employee; why: string }[] = [];
    const outside: Employee[] = [];
    const movable: { e: Employee; from: string; safe: boolean; note: string }[] = [];
    for (const e of store.employees) {
      const home = store.sectors.find((s) => s.id === e.sectorId)!;
      const p = presenceAt(store, e, day, t, cellCode(home, e.id, day));
      if (e.sectorId === sector.id) {
        if (p.state === "working") avail.push({ e, post: p.post });
        else if (p.state === "break") brk.push(e);
        else if (p.state === "out") other.push({ e, where: `${store.sectors.find((s) => s.id === p.sectorId)?.name ?? ""}${p.post ? ` · ${p.post}` : ""}` });
        else if (p.state === "activity") other.push({ e, where: p.post });
        else if (p.state === "before" || p.state === "after") outside.push(e);
        else off.push({ e, why: p.state === "absent" ? "ausente" : p.state === "vacation" ? "férias" : p.state === "holiday" ? "feriado" : "folga" });
      } else {
        if (p.state === "out" && p.sectorId === sector.id) avail.push({ e, post: p.post, from: home.name });
        else if (p.state === "working" && (e.quals.includes(sector.id) || e.joker)) {
          const a = analyzeSector(store, home.id);
          const dc = a.coverage[dayIdx];
          const ci = a.axis.indexOf(t);
          const count = ci >= 0 ? dc.counts[ci] : 0;
          const min = ci >= 0 ? dc.req[ci] : 0;
          movable.push({ e, from: home.name, safe: count - 1 >= min, note: `${home.name} fica com ${count - 1} (mín. ${min})` });
        }
      }
    }
    return { avail, brk, other, off, outside, movable };
  }, [store, sector, day, t, dayIdx]);
  const count = analysis.coverage[dayIdx].counts[slot];
  const missing = Math.max(0, req.min - count);
  const end = t + store.config.slot;
  return (
    <div className="mt-5 rounded-xl border border-line bg-surface-2 p-5" role="region" aria-label="Detalhe do horário">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[15px] font-bold">
            {WEEKDAY_LONG[day.weekday]}, {fmtDateBR(day.date)} · {fmtTime(t)}–{fmtTime(end)}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-[13px] tnum">
            <span>
              Necessário: <strong>{req.min}</strong>
              {req.ideal > req.min && <span className="text-muted"> (ideal {req.ideal})</span>}
            </span>
            <span>
              No posto: <strong>{count}</strong>
            </span>
            <span className={missing ? "text-red font-bold" : "text-green font-semibold"}>{missing ? `Faltam ${missing}` : "Mínimo atendido"}</span>
          </div>
        </div>
        <Btn onClick={onClose}>Fechar</Btn>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-[12.5px]">
        <Group title={`Disponíveis no setor (${groups.avail.length})`}>
          {groups.avail.map(({ e, post, from }) => (
            <li key={e.id}>
              {e.name || e.func} <span className="text-muted">· {post}{from ? ` · apoio de ${from}` : ""}</span>
            </li>
          ))}
        </Group>
        <Group title={`Em intervalo (${groups.brk.length})`}>
          {names(groups.brk).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </Group>
        <Group title={`Em outro posto ou atividade (${groups.other.length})`}>
          {groups.other.map(({ e, where }) => (
            <li key={e.id}>
              {e.name || e.func} <span className="text-muted">· {where}</span>
            </li>
          ))}
        </Group>
        <Group title={`De folga, ausentes ou de férias (${groups.off.length})`}>
          {groups.off.map(({ e, why }) => (
            <li key={e.id}>
              {e.name || e.func} <span className="text-muted">· {why}</span>
            </li>
          ))}
        </Group>
        <Group title={`Fora do turno neste horário (${groups.outside.length})`}>
          {names(groups.outside).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </Group>
        <Group title={`Habilitados que poderiam ser remanejados (${groups.movable.length})`}>
          {groups.movable.map(({ e, from, safe, note }) => (
            <li key={e.id}>
              {e.name || e.func} <span className="text-muted">· {from}</span> <span className={safe ? "text-green" : "text-red"}>· {note}</span>
            </li>
          ))}
          {!groups.movable.length && <li className="text-muted">Ninguém de outro setor habilitado está trabalhando agora.</li>}
        </Group>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3 min-w-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted mb-1">{title}</div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}
