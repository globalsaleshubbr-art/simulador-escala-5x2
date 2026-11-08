"use client";
import React, { useState } from "react";
import { useSim, pct } from "./state";
import { Btn, Pill } from "./ui";
import { fmtDur, fmtNum, WEEKDAY_SHORT } from "../engine/time";

function Card({ label, value, unit, sub, tone = "neutral" }: { label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode; tone?: "neutral" | "red" | "green" | "amber" }) {
  const toneCls = tone === "red" ? "text-red" : tone === "green" ? "text-green" : tone === "amber" ? "text-amber-ink" : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4 min-w-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted leading-tight">{label}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`text-[26px] font-extrabold leading-none tnum ${toneCls}`}>{value}</span>
        {unit && <span className="text-[12px] text-muted">{unit}</span>}
      </div>
      {sub && <div className="mt-2 text-[12px] text-muted leading-relaxed">{sub}</div>}
    </div>
  );
}

export function Indicators() {
  const { analysis, store, sector } = useSim();
  const i = analysis.indicators;
  const cfg = store.config;
  const lost = i.workDays6x1 - i.workDaysPerWeek;
  return (
    <section id="indicadores" aria-label="Indicadores" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      <Card label="Pessoas no setor" value={i.people} sub={cfg.sundayOpen ? <>{fmtNum(i.sundayAvg, 1)} em média no domingo</> : "loja fechada aos domingos"} />
      <Card
        label="Pessoas por dia · seg a sáb"
        value={fmtNum(i.perDayAvgMonSat, 1)}
        unit={cfg.folgasPorSemana === 2 ? "no 5x2" : "na escala"}
        sub={
          <>
            no 6x1 seriam {fmtNum(i.perDay6x1, 1)} ·{" "}
            {[1, 2, 3, 4, 5, 6].map((d) => (
              <span key={d} className="tnum">
                {WEEKDAY_SHORT[d].slice(0, 3)} {fmtNum(i.perDayByWeekday[d], 1)}
                {d < 6 ? " · " : ""}
              </span>
            ))}
          </>
        }
      />
      <Card label="Dias de trabalho / semana" value={fmtNum(i.workDaysPerWeek, 0)} unit={`de ${i.workDays6x1}`} sub={lost > 0 ? `${fmtNum(lost, 0)} jornada(s) a menos que no 6x1` : "igual ou acima do 6x1"} />
      <Card label="Horas médias / pessoa" value={fmtDur(i.avgWeeklyHours * 60)} unit="por semana" sub={cfg.sundayOpen ? `domingos de ${sector.shifts.find((s) => s.id === sector.defaultSundayShiftId) ? fmtDur((sector.shifts.find((s) => s.id === sector.defaultSundayShiftId)!.workMin ?? cfg.dailyMin)) : "—"} puxam a média` : "sem domingos"} />
      <Card label="Cobertura operacional" value={pct(i.coveragePct)} tone={i.coveragePct >= 99.5 ? "green" : i.coveragePct >= 95 ? "amber" : "red"} sub="dos mínimos por faixa horária atendidos" />
      <Card
        label="Déficit de profissionais"
        value={fmtDur(i.deficitHoursWeek * 60)}
        unit="por semana"
        tone={i.deficitHoursWeek > 0 ? "red" : "green"}
        sub={i.peakMissing > 0 ? `pico: faltam ${i.peakMissing} ao mesmo tempo` : "todos os mínimos cobertos"}
      />
    </section>
  );
}

export function RunBanner() {
  const sim = useSim();
  const r = sim.report;
  const me = sim.manualEdit;
  if (me && me.sectorId === sim.sector.id && !r)
    return (
      <div className="rounded-xl border border-yellow bg-surface px-5 py-4 flex flex-wrap items-center justify-between gap-2" role="status">
        <span className="text-[13px]">
          {me.count} alteração(ões) manual(is) no calendário. A cobertura já foi recalculada.{" "}
          {sim.store.config.lockManual ? "As células alteradas ficaram bloqueadas." : "As células alteradas não estão bloqueadas."}
        </span>
        <div className="flex gap-2">
          <Btn kind="orange" onClick={() => sim.redistribute()} disabled={sim.running}>
            Redistribuir mantendo bloqueios
          </Btn>
          <Btn onClick={sim.clearManualEdit}>Agora não</Btn>
        </div>
      </div>
    );
  if (!r || r.sectorId !== sim.sector.id) return null;
  return (
    <div className={`rounded-xl border px-5 py-4 ${r.ok ? "border-green bg-surface" : "border-red bg-pink"}`} role="status">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={r.ok ? "green" : "red"}>{r.ok ? "Escala gerada" : "Sem solução válida"}</Pill>
            <span className="text-[12px] text-muted">
              {r.engine} · {r.ms} ms · {r.at}
            </span>
          </div>
          {r.ok ? (
            <p className="mt-1.5 text-[13.5px]">
              {!r.applied && <>Nenhuma troca melhora a escala atual (os dias de movimento forte têm prioridade). </>}
              Cobertura dos mínimos <strong className="tnum">{pct(r.before.pct)}</strong> → <strong className="tnum">{pct(r.after.pct)}</strong>; déficit{" "}
              <strong className="tnum">{fmtDur(r.before.def * 60)}</strong> → <strong className="tnum">{fmtDur(r.after.def * 60)}</strong> por semana. Todas as restrições obrigatórias foram respeitadas e os bloqueios mantidos. O déficit é ponderado pelo movimento: dias fortes têm prioridade.
            </p>
          ) : (
            <p className="mt-1.5 text-[13.5px]">
              Não existe escala que respeite todas as restrições obrigatórias com os parâmetros atuais. A escala atual <strong>não foi alterada</strong>. Ajuste:
            </p>
          )}
        </div>
        <Btn onClick={() => sim.setReport(null)} aria-label="Fechar aviso">
          Fechar
        </Btn>
      </div>
      {!r.ok && (
        <ul className="mt-2 list-disc pl-5 text-[13px] space-y-0.5">
          {(r.explanations.length ? r.explanations : r.violations.map((v) => v.message)).slice(0, 12).map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
      {!r.ok && r.pendingRows && !r.applied && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
          <Btn onClick={sim.applyDraft}>Aplicar como rascunho mesmo assim</Btn>
          <span>As violações ficarão destacadas nos alertas.</span>
        </div>
      )}
      {r.ok && r.remainingRed > 0 && (
        <div className="mt-2 text-[13px]">
          <strong className="text-red">Não é possível cumprir todos os mínimos operacionais</strong> com a equipe, os turnos e as restrições atuais: ainda há {r.remainingRed} célula(s) de 15/30 min abaixo do mínimo (veja
          os alertas e o mapa de cobertura).
          {r.ceiling.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-[12.5px] text-muted space-y-0.5">
              {r.ceiling.slice(0, 6).map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function Alerts() {
  const sim = useSim();
  const { analysis } = sim;
  const [all, setAll] = useState(false);
  const alerts = analysis.alerts;
  const shown = all ? alerts : alerts.slice(0, 8);
  const slot = sim.store.config.slot;
  return (
    <section id="alertas" aria-label="O que precisa de atenção" className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-[19px] font-bold">O que precisa de atenção</h2>
        <span className="text-[12px] text-muted">
          {alerts.length ? `${alerts.length} aviso(s) calculado(s) a partir da escala, dos turnos e dos mínimos` : ""}
        </span>
      </div>
      {!alerts.length && (
        <div className="rounded-md border border-green bg-surface-2 px-3 py-2 text-[13px]">
          <Pill tone="green">Tudo certo</Pill> <span className="ml-1">Nenhum horário abaixo do mínimo e nenhuma restrição violada neste setor.</span>
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {shown.map((a) => (
          <li key={a.id} className={`rounded-lg border px-4 py-3 ${a.severity === "problema" ? "bg-pink border-pink-line" : "bg-surface-2 border-line"}`}>
            <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
              <Pill tone={a.severity === "problema" ? "red" : "amber"}>{a.severity === "problema" ? "Problema" : "Atenção"}</Pill>
              <button type="button" className="text-left text-[13px] hover:underline min-w-0" onClick={() => a.target && sim.focus(a.target)} disabled={!a.target}>
                <strong>{a.title}:</strong> {a.text}
              </button>
            </div>
            {a.ranges && (
              <div className="mt-2.5 flex flex-wrap gap-2 pl-1">
                {a.ranges.slice(0, 10).map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => sim.focus({ kind: "coverage", week: r.firstWeek, weekday: Number(a.id.split("-")[1]), from: r.from, to: r.to })}
                    className="rounded-md border border-pink-line bg-surface px-2.5 py-1 text-[12.5px] hover:border-red tnum"
                    title="Ver no mapa de cobertura"
                  >
                    {r.label} · {r.weeks}/{Math.ceil(analysis.days.length / 7)} sem.
                  </button>
                ))}
                {a.ranges.length > 10 && <span className="text-[12px] text-muted self-center">+{a.ranges.length - 10} faixas</span>}
              </div>
            )}
          </li>
        ))}
      </ul>
      {alerts.length > 8 && (
        <div className="mt-2">
          <Btn onClick={() => setAll(!all)}>{all ? "Mostrar menos" : `Mostrar todos (${alerts.length})`}</Btn>
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-muted">Faixas em intervalos de {slot} min. Clique em um aviso para destacá-lo no calendário ou no mapa de cobertura.</p>
    </section>
  );
}
