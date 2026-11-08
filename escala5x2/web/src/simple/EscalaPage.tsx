"use client";
import React, { useMemo, useState } from "react";
import { useSim, pct } from "../components/state";
import { Btn, NumInput, Pill } from "../components/ui";
import { Card, CardTitle, PageHead, type PageId } from "./SimpleApp";
import { analyzeSector, analyzeSectorCached } from "../engine/analysis";
import { cicloDosTimes, teamOf, teamOnSunday, topSuggestions } from "./logic";
import { buildDays, cellCode, dayShift, emBranco, employeeShift, isWorking, folgasDe, jornadaDe, jornadaPessoal, nomeFolgas, presenceAt, slotLen } from "../engine/model";
import type { CalDay, Code, Employee, Sector, Store } from "../engine/types";
import { toMin as toMinE } from "../engine/time";
import { addDays, dayNum, fmtDateBR, fmtDur, fmtTime, nextWeekStart, weekdayOf, weekStartOf, WEEKDAY_LONG, WEEKDAY_SHORT, WEEK_ORDER_MON } from "../engine/time";
import { saveFile } from "../storage/storage";
import { exportExcelStores } from "../components/exporters";
import { codeStyle, colorVars, inkFor, inkRgb, isHex, mixHex, rgbOf } from "./colors";
import { ColorLegend, ColorPicker } from "./ColorPicker";
import { STATUS_CLS } from "../components/Coverage";
import { clearUnlocked } from "../engine/solver";
import { LimparEscalaPanel, nomeMes } from "./LimparEscala";
import { CopyScalePanel } from "./CopyScale";
import { useStoreScope } from "./StoreScope";
import { Select } from "../components/ui";
import { MonthView, PlantaoPill, TeamPill } from "./MonthView";
import { personalPDF } from "./pdfs";

type Tool = "folga" | "V" | "A" | "M";

export function EscalaPage({ go }: { go: (p: PageId) => void }) {
  const sim = useSim();
  const { store, sector } = sim;
  const cfg = store.config;
  // almoços do setor distribuídos sozinhos quando turnos, equipe ou período mudaram
  const a = useMemo(() => (cfg.slot === 30 ? sim.analysis : analyzeSector(store, sector.id, { slot: 30 })), [cfg.slot, sim.analysis, store, sector.id]);
  const weeks = Math.max(1, Math.ceil(a.days.length / 7));
  const [weekRaw, setWeek] = useState(0);
  const week = Math.min(weekRaw, weeks - 1);
  const [showAll, setShowAll] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [limparOpen, setLimparOpen] = useState(false);
  const sugg = useMemo(() => topSuggestions(store, a, 3), [store, a]);
  const hard = a.alerts.filter((x) => !x.id.startsWith("cov-"));
  const emps = a.employees;
  // meses do período que estão em branco (escala limpa, ainda não gerada)
  const mesesBranco = Array.from(new Set(buildDays(cfg).map((d) => d.date.slice(0, 7)))).filter((m) => sector.limpo?.includes(m) && emps.some((e) => buildDays(cfg).some((d) => d.date.startsWith(m) && !d.closed && emBranco(sector, e.id, d.date))));

  const steps = [
    { ok: emps.length > 0, label: "Cadastre a equipe do setor", page: "equipe" as PageId },
    { ok: sector.shifts.some((s) => !s.special), label: "Confira os horários (turnos e intervalos)", page: "horarios" as PageId },
    { ok: sector.minRules.length > 0, label: "Diga quantas pessoas você precisa em cada horário", page: "necessidade" as PageId },
    { ok: !!sector.lastRun, label: "Clique em Gerar escala", page: null },
  ];
  const pending = steps.filter((s) => !s.ok).length;

  const r = sim.report && sim.report.sectorId === sector.id ? sim.report : null;
  const me = sim.manualEdit && sim.manualEdit.sectorId === sector.id ? sim.manualEdit : null;

  return (
    <>
      <PageHead
        title={`Escala · ${sector.name}`}
        sub={`${emps.length} ${emps.length === 1 ? "pessoa" : "pessoas"} · planejamento de ${fmtDateBR(cfg.startDate)} a ${fmtDateBR(addDays(cfg.startDate, weeks * 7 - 1))} · ${sector.modeloEscala === "12x36" ? `12x36 (dia sim, dia não)${((n) => (n ? ` · ${n} em ${cfg.folgasPorSemana === 2 ? "5x2" : "6x1"}` : ""))(emps.filter((e) => e.regime !== "12x36").length)}` : `${cfg.folgasPorSemana === 2 ? "5x2" : `${7 - cfg.folgasPorSemana}x${cfg.folgasPorSemana}`}, ${fmtDur(cfg.dailyMin)} por dia${((n) => (n ? ` · ${n} em 12x36` : ""))(emps.filter((e) => e.regime === "12x36").length)}`}`}
        go={go}
        actions={
          <>
            <Btn id="esc-desfazer" onClick={() => sim.setToast(sim.desfazer() ? "Mudança desfeita: voltou a como estava antes." : "Não há nada para desfazer.")} disabled={!sim.podeDesfazer} title="Volta a última mudança (atalho: Ctrl+Z)">
              ↶ Desfazer
            </Btn>
            <Btn kind="green" id="esc-limpar" disabled={sim.running} onClick={() => setLimparOpen(!limparOpen)} aria-expanded={limparOpen} title="Apagar a escala dos meses que você escolher (os dias ficam em branco até gerar de novo)">
              Limpar escala
            </Btn>
            <Btn id="esc-copy" onClick={() => setCopyOpen(!copyOpen)} aria-expanded={copyOpen} title="Copiar a escala deste setor para outros setores (ou de outro setor para este)">
              Copiar escala…
            </Btn>
            <Btn kind="yellow" className="!px-6 !py-3 !text-[15px]" onClick={() => sim.redistribute()} disabled={sim.running || !emps.length}>
              {sim.running ? "Gerando…" : "Gerar escala"}
            </Btn>
          </>
        }
      />
      {copyOpen && <CopyScalePanel whole onClose={() => setCopyOpen(false)} />}
      {limparOpen && <LimparEscalaPanel onClose={() => setLimparOpen(false)} />}

      {pending > 0 && (
        <Card>
          <CardTitle sub="Siga estes passos para montar a escala deste setor.">Primeiros passos</CardTitle>
          <ol className="grid gap-3 sm:grid-cols-2">
            {steps.map((s, i) => (
              <li key={i} className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 ${s.ok ? "border-line bg-surface-2" : "border-navy-2 bg-surface"}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold ${s.ok ? "bg-green text-green-ink" : "bg-navy text-navy-ink"}`}>{s.ok ? "✓" : i + 1}</span>
                <span className={`flex-1 text-[14px] ${s.ok ? "text-muted line-through" : "font-semibold"}`}>{s.label}</span>
                {!s.ok && s.page && <Btn onClick={() => go(s.page!)}>Abrir</Btn>}
                {!s.ok && !s.page && (
                  <Btn kind="primary" onClick={() => sim.redistribute()} disabled={!emps.length}>
                    Gerar
                  </Btn>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {me && !r && (
        <div className="rounded-2xl border border-navy-2 bg-surface px-6 py-4 flex flex-wrap items-center justify-between gap-3" role="status">
          <span className="text-[14px]">Você mudou {me.count} dia(s) à mão. Essas mudanças ficam fixas; o sistema pode reorganizar o resto da escala.</span>
          <div className="flex gap-2.5">
            <Btn kind="primary" onClick={() => sim.redistribute()} disabled={sim.running}>
              Reorganizar o resto
            </Btn>
            <Btn onClick={sim.clearManualEdit}>Agora não</Btn>
          </div>
        </div>
      )}
      {r && (
        <div className={`rounded-2xl border px-6 py-4 ${r.ok ? "border-green bg-surface" : "border-red bg-pink"}`} role="status">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-[14px] leading-relaxed min-w-0">
              {r.ok ? (
                <>
                  <Pill tone="green">{r.applied ? "Escala gerada" : "Escala mantida"}</Pill>{" "}
                  {r.applied ? (
                    <>
                      Cobertura foi de <strong>{pct(r.before.pct)}</strong> para <strong>{pct(r.after.pct)}</strong>. Folgas, domingos e dias fixados foram respeitados.
                    </>
                  ) : (
                    <>Nenhuma troca de folgas melhora a escala atual.</>
                  )}
                  {r.almoco && (
                    <span id="rep-almoco">
                      {" "}
                      Almoços: colocados onde sobra gente no posto (Fluxo alto), sem mexer nos horários escolhidos à mão — veja e mude na Escala de Almoço.
                    </span>
                  )}
                  {r.remainingRed > 0 && <> Ainda falta gente em alguns horários: veja as sugestões abaixo.</>}
                  {r.turnos && (
                    <span className="mt-1.5 block text-[13px]" id="rep-turnos">
                      {r.turnos.rodizio > 0 && `Rodízio de turnos: ${r.turnos.rodizio} ${r.turnos.rodizio === 1 ? "dia" : "dias"} com o turno da semana. `}
                      {r.turnos.trocas > 0 && `Quem fechou não abre no dia seguinte: ${r.turnos.trocas} ${r.turnos.trocas === 1 ? "turno trocado" : "turnos trocados"}. `}
                      {r.turnos.semAlternativa > 0 && `${r.turnos.semAlternativa} ${r.turnos.semAlternativa === 1 ? "caso continua" : "casos continuam"} fechando e abrindo em seguida (não há outro turno no dia). `}
                      {!!r.turnos.cobertos && `Cobertura de folga: ${r.turnos.cobertos} ${r.turnos.cobertos === 1 ? "dia" : "dias"} com o substituto no turno de quem folgou. `}
                      {!!r.turnos.semCobertura && `${r.turnos.semCobertura} ${r.turnos.semCobertura === 1 ? "folga ficou" : "folgas ficaram"} sem cobertura (o substituto também não trabalhava no dia).`}
                    </span>
                  )}
                  {r.fds && (
                    <span className="mt-1.5 block text-[13px]" id="rep-fds">
                      Sábados de folga em rodízio: {r.fds.sabMin === r.fds.sabMax ? `${r.fds.sabMin}` : `de ${r.fds.sabMin} a ${r.fds.sabMax}`} por pessoa no período (sem contar quem tem folga fixa na semana).
                      {r.fds.comPares && ` Fins de semana inteiros (regra 5b): ${r.fds.pares} no total — ${r.fds.parMin === r.fds.parMax ? `${r.fds.parMin}` : `de ${r.fds.parMin} a ${r.fds.parMax}`} por pessoa.`}
                    </span>
                  )}
                  {r.divTurnos && (
                    <span className="mt-1.5 block text-[13px]" id="rep-div-turnos">
                      Folgas divididas entre quem abre e quem fecha ({r.divTurnos.nomes.join(", ")} pessoas) na proporção de cada um:{" "}
                      {r.divTurnos.acima === 0
                        ? `todos os ${r.divTurnos.dias} dias dentro da proporção.`
                        : `${r.divTurnos.dias - r.divTurnos.acima} de ${r.divTurnos.dias} dias dentro da proporção; em ${r.divTurnos.acima} ${r.divTurnos.acima === 1 ? "dia" : "dias"} algum turno passou da parte dele (em geral domingos e fins de semana da regra 5b, que seguem o rodízio, ou quando trocar deixaria faltar gente).`}
                    </span>
                  )}
                  {r.divDias && (
                    <span className="mt-1.5 block text-[13px]" id="rep-div-dias">
                      Folgas por dia, de segunda a sábado: {r.divDias.map((x, i) => `semana ${i + 1}: ${x.min === x.max ? x.min : `${x.min} a ${x.max}`}`).join(" · ")}
                      {r.divDias.some((x) => x.max - x.min > 1) ? " (dia com limite de folgas menor fica com menos)." : "."}
                    </span>
                  )}
                  {r.avisos?.map((t) => (
                    <span key={t} className="mt-1.5 block text-[13px] text-muted" id="rep-aviso">
                      {t}
                    </span>
                  ))}
                </>
              ) : (
                <>
                  <Pill tone="red">Não foi possível gerar</Pill> A escala atual não foi alterada. O que impede:
                  <ul className="mt-2 list-disc pl-5">
                    {(r.explanations.length ? r.explanations : r.violations.map((v) => v.message)).slice(0, 6).map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <Btn onClick={() => sim.setReport(null)}>Fechar</Btn>
          </div>
        </div>
      )}

      {!emps.length && (
        <Card>
          <p className="text-[14px]" id="setor-vazio">
            Ainda não há ninguém em {sector.name}. Cadastre a equipe em{" "}
            <button type="button" className="font-semibold underline" onClick={() => go("equipe")}>
              Equipe
            </button>{" "}
            (uma a uma, várias de uma vez ou por planilha). A cobertura e os avisos aparecem aqui depois disso.
          </p>
        </Card>
      )}
      {emps.length > 0 && mesesBranco.length > 0 && (
        <div className="rounded-2xl border border-navy-2 bg-surface px-6 py-4 text-[14px]" role="status" id="aviso-branco">
          <b>Escala em branco</b> em {sector.name}: {mesesBranco.map(nomeMes).join(", ")}. Os quadradinhos ficam vazios até você clicar em{" "}
          <button type="button" className="font-semibold underline" onClick={() => sim.redistribute()} disabled={sim.running}>
            Gerar escala
          </button>
          {sim.podeDesfazer ? (
            <>
              {" "}
              (ou{" "}
              <button type="button" className="underline" onClick={() => sim.setToast(sim.desfazer() ? "Mudança desfeita: voltou a como estava antes." : "Não há nada para desfazer.")}>
                Desfazer
              </button>
              ).
            </>
          ) : (
            "."
          )}
        </div>
      )}
      {emps.length > 0 && !mesesBranco.length && (
      <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Horários cobertos" value={pct(a.totals.pct)} tone={a.totals.pct >= 99.5 ? "green" : a.totals.pct >= 95 ? "amber" : "red"} sub="Da necessidade que você informou" />
        <Stat label="Horas faltando" value={fmtDur(a.totals.deficitHoursPerWeek * 60)} tone={a.totals.deficitHoursPerWeek > 0 ? "red" : "green"} sub="Por semana, somando todos os buracos" />
        <Stat label="Horas por pessoa" value={fmtDur(a.indicators.avgWeeklyHours * 60)} sub={`Média semanal (limite ${fmtDur(cfg.weeklyMaxMin)})`} />
      </div>


      <Card>
        <CardTitle
          sub={sugg.length ? "Os horários mais críticos, com o que fazer em cada um." : undefined}
          actions={
            a.alerts.length > sugg.length ? (
              <Btn onClick={() => setShowAll(!showAll)}>{showAll ? "Esconder lista completa" : `Ver todos os avisos (${a.alerts.length})`}</Btn>
            ) : undefined
          }
        >
          Onde vai faltar gente
        </CardTitle>
        {!sugg.length && !hard.length && <p className="text-[14px] text-green font-semibold">Nenhum horário abaixo da necessidade. A escala está completa.</p>}
        <div className="flex flex-col gap-3">
          {sugg.map((s, i) => (
            <div key={i} className="rounded-xl border border-pink-line bg-pink px-5 py-4">
              <div className="text-[14.5px] font-bold">{s.title}</div>
              <div className="mt-1 text-[13.5px] leading-relaxed">{s.action}</div>
            </div>
          ))}
          {hard.slice(0, showAll ? 99 : 2).map((h) => (
            <div key={h.id} className="rounded-xl border border-line bg-surface-2 px-5 py-3.5 text-[13.5px]">
              <strong>{h.title}:</strong> {h.text}
            </div>
          ))}
        </div>
        {showAll && (
          <ul className="mt-4 flex flex-col gap-2 text-[13px]">
            {a.alerts
              .filter((x) => x.ranges)
              .map((x) => (
                <li key={x.id} className="rounded-lg border border-line px-4 py-2.5">
                  <strong>{x.title}:</strong> {x.ranges!.map((r) => `${r.label} (${r.weeks}/${weeks} sem.)`).join(" · ")}
                </li>
              ))}
          </ul>
        )}
      </Card>
      </>
      )}

      <WeekRoster week={week} setWeek={setWeek} weeks={weeks} />

      <WeekMap week={week} semCobertura={mesesBranco.length > 0} />

    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "green" | "red" | "amber" }) {
  const c = tone === "green" ? "text-green" : tone === "red" ? "text-red" : tone === "amber" ? "text-amber-ink" : "text-ink";
  return (
    <div className="rounded-2xl border border-line bg-surface px-6 py-5">
      <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className={`mt-2 text-[32px] font-bold leading-none tnum ${c}`}>{value}</div>
      <div className="mt-2 text-[13px] text-muted">{sub}</div>
    </div>
  );
}

function useSectorFilter() {
  const sim = useSim();
  const [raw, setRaw] = useState<string>("page");
  const visible = sim.store.sectors.filter((x) => !x.hidden);
  const id = raw === "page" || (raw !== "all" && !sim.store.sectors.some((x) => x.id === raw)) ? sim.sector.id : raw;
  return { id, set: setRaw, visible };
}

function WeekRoster({ week, setWeek, weeks }: { week: number; setWeek: (w: number) => void; weeks: number }) {
  const sim = useSim();
  const { store } = sim;
  const cfg = store.config;
  const sc = useStoreScope("sem-store");
  const stores = sc.stores;
  const multiStore = stores.length > 1;
  // mostrando outra loja que não a em edição: o nome dela aparece nos grupos
  const otherStore = !multiStore && stores[0]?.id !== store.id;
  // nomes de setor visíveis nas lojas selecionadas (ordem da loja em edição primeiro)
  const visibleNames = Array.from(new Set(stores.flatMap((st) => st.sectors.filter((x) => !x.hidden).map((x) => x.name))));
  const colorOf = (name: string) => stores.flatMap((st) => st.sectors).find((s) => s.name === name)?.color;
  const countOf = (name: string) => stores.reduce((n, st) => n + st.employees.filter((e) => e.sectorId === st.sectors.find((s) => s.name === name && !s.hidden)?.id).length, 0);
  // setores escolhidos no filtro (null = acompanha o setor selecionado no topo da página)
  const [selRaw, setSel] = useState<string[] | null>(null);
  const selValid = (selRaw ?? []).filter((n) => visibleNames.includes(n));
  const names = selValid.length ? visibleNames.filter((n) => selValid.includes(n)) : [sim.sector.name];
  const multiSector = names.length > 1;
  const toggleSector = (n: string) => {
    if (names.includes(n)) {
      if (names.length === 1) return; // sempre pelo menos um setor
      setSel(names.filter((x) => x !== n));
    } else setSel([...names, n]);
  };
  const [shiftF, setShiftF] = useState("all");
  const [funcF, setFuncF] = useState("all");
  const [q, setQ] = useState("");
  const [tool, setTool] = useState<Tool>("folga");
  // ordenação estilo Excel: cadastro, nome, entrada, saída, horas ou entrada num dia da semana ("dia:<weekday>")
  const [sortKey, setSortKey] = useState<string>("entrada");
  const [sortDesc, setSortDesc] = useState(false);
  const clickSort = (k: string) => {
    if (sortKey === k) setSortDesc(!sortDesc);
    else {
      setSortKey(k);
      setSortDesc(false);
    }
  };
  const arrow = (k: string) => (sortKey === k ? (sortDesc ? " ▼" : " ▲") : "");
  const one = stores[0] ?? store;
  const single = !multiStore && !multiSector ? one.sectors.find((x) => x.name === names[0] && !x.hidden) ?? null : null;
  const a1 = useMemo(() => (single && one.id === store.id ? analyzeSector(one, single.id, { slot: 30 }) : null), [one, store.id, single]);
  const allDays = useMemo(() => buildDays(store.config), [store.config]);
  const days = allDays.filter((d) => d.week === week);
  // dias das outras lojas nas mesmas datas (com o calendário e o período de cada uma)
  const daysOf = (st: Store) => {
    if (st.id === store.id) return days.map((d) => ({ ...d, inPeriod: true }));
    const p = buildDays(st.config);
    const start = p[0].date;
    const end = p[p.length - 1].date;
    return buildDays(st.config, days[0].date, 1).map((d) => ({ ...p.find((x) => x.date === d.date), ...d, inPeriod: d.date >= start && d.date <= end }));
  };
  const matched = stores.flatMap((st) => names.map((n) => ({ st, sec: st.sectors.find((s) => s.name === n && !s.hidden) ?? null })).filter((x): x is { st: Store; sec: Sector } => !!x.sec));
  const shiftNames = names.length === 1 ? Array.from(new Set(matched.flatMap((m) => m.sec.shifts.filter((s) => !s.special).map((s) => s.name)))) : [];
  const shiftOk = shiftNames.includes(shiftF) ? shiftF : "all";
  const funcs = Array.from(new Set(matched.flatMap((m) => m.st.employees.filter((e) => e.sectorId === m.sec.id).map((e) => e.func.trim())).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const funcOk = funcs.includes(funcF) ? funcF : "all";
  const weekMin = (st: Store, sec: Sector, e: Employee, ds: (CalDay & { inPeriod: boolean })[]) => ds.reduce((m, d) => (d.inPeriod && !emBranco(sec, e.id, d.date) && isWorking(cellCode(sec, e.id, d)) ? m + dayShift(st, sec, e, d).workMin : m), 0);
  function sortEmps(st: Store, sec: Sector, list: Employee[], ds: (CalDay & { inPeriod: boolean })[]) {
    if (sortKey === "cadastro") return sortDesc ? [...list].reverse() : list;
    const nm = (e: Employee) => (e.name || e.func).toLocaleLowerCase("pt-BR");
    // valor de cada pessoa; null = sem horário (folga, férias, falta) e vai sempre para o fim, como no Excel
    const val = (e: Employee): number | string | null => {
      if (sortKey === "nome") return nm(e);
      if (sortKey === "horas") return weekMin(st, sec, e, ds);
      if (sortKey === "entrada" || sortKey === "saida") {
        const sh = employeeShift(st, sec, e, false);
        return sortKey === "entrada" ? sh.start : sh.end;
      }
      if (sortKey.startsWith("dia:")) {
        const d = ds.find((x) => x.weekday === Number(sortKey.slice(4)));
        if (!d || !d.inPeriod) return null;
        const c = cellCode(sec, e.id, d);
        return isWorking(c) ? dayShift(st, sec, e, d).start : null;
      }
      return null;
    };
    const dir = sortDesc ? -1 : 1;
    return list
      .map((e) => ({ e, v: val(e) }))
      .sort((x, y) => {
        if (x.v === null || y.v === null) return x.v === y.v ? nm(x.e).localeCompare(nm(y.e), "pt-BR") : x.v === null ? 1 : -1;
        const c = typeof x.v === "string" ? x.v.localeCompare(y.v as string, "pt-BR") : x.v - (y.v as number);
        // empate pelo nome, no mesmo sentido (decrescente = lista invertida)
        return (c !== 0 ? c : nm(x.e).localeCompare(nm(y.e), "pt-BR")) * dir;
      })
      .map((x) => x.e);
  }
  const groups = matched
    .map(({ st, sec }) => {
      const ds = daysOf(st);
      const emps = st.employees.filter(
        (e) =>
          e.sectorId === sec.id &&
          (shiftOk === "all" || sec.shifts.find((s) => s.id === e.shiftId)?.name === shiftOk) &&
          (funcOk === "all" || e.func.trim() === funcOk) &&
          (!q.trim() || (e.name || e.func).toLowerCase().includes(q.trim().toLowerCase())),
      );
      return { st, sec, ds, emps: sortEmps(st, sec, emps, ds) };
    })
    .filter((g) => g.emps.length || !(multiSector || multiStore));
  const grouped = multiSector || multiStore || otherStore;
  const total = groups.reduce((n, g) => n + g.emps.length, 0);
  const ws = cfg.weekStart ?? weekdayOf(cfg.startDate);
  // linha grossa entre pessoas de turnos diferentes (o usuário escolhe; padrão: ligada)
  const linhaTurno = cfg.linhaTurno !== false;

  /** Mostra a semana que contém a data; fora do planejamento, o planejamento passa a começar nessa semana. */
  const goToDate = (date: string) => {
    const idx = allDays.findIndex((d) => d.date === date);
    if (idx >= 0) return setWeek(Math.floor(idx / 7));
    const start = weekStartOf(date, ws);
    sim.updateStore((st) => ({ ...st, config: { ...st.config, startDate: start } }));
    setWeek(0);
  };
  const setWeekStart = (v: number) => {
    if (v === ws) return;
    const start = nextWeekStart(cfg.startDate, v);
    sim.updateStore((st) => clearUnlocked({ ...st, config: { ...st.config, weekStart: v, startDate: start } }));
    setWeek(0);
    sim.setToast(`A semana agora começa ${v === 1 ? "na segunda" : "no domingo"}. As folgas foram reorganizadas; dias fixados à mão foram mantidos.`);
  };

  const setDay = (st: Store, secId: string, empId: string, day: CalDay) => {
    sim.updateStoreById(st.id, (x: Store) => ({
      ...x,
      sectors: x.sectors.map((sec) => {
        if (sec.id !== secId) return sec;
        const row = { ...(sec.schedule[empId] ?? {}) };
        const cur = cellCode(sec, empId, day);
        let c: Code;
        if (tool === "folga") c = cur === "F" || cur === "A" || cur === "M" || cur === "V" ? (day.special ? "D" : "T") : "F";
        else c = cur === tool ? (day.special ? "D" : "T") : tool;
        if (day.closed && (c === "T" || c === "D")) return sec;
        row[day.date] = { ...(row[day.date] ?? {}), c, lock: true };
        return { ...sec, schedule: { ...sec.schedule, [empId]: row } };
      }),
    }));
    if (st.id === store.id) {
      if (secId !== sim.sector.id) sim.setSectorId(secId);
      sim.noteManualEdit();
    }
  };

  const fileTag = (ext: string) =>
    `escala-${multiStore ? `${stores.length}-lojas-` : ""}${names.length === 1 ? names[0] : `${names.length}-setores`}-${days[0].date}.${ext}`.toLowerCase().replace(/[^a-z0-9à-ú.-]+/gi, "-");
  const download = async (kind: "pdf" | "xlsx") => {
    try {
      const blob = kind === "pdf" ? await weekPDF(matched, days.map((d) => d.date)) : await exportExcelStores(stores, names);
      const r = await saveFile(fileTag(kind), blob);
      sim.setToast(r === "saved" ? "Arquivo gerado." : r === "declined" ? "Download cancelado." : "Não foi possível baixar o arquivo aqui.");
    } catch (e) {
      sim.setToast(`Falha ao gerar o arquivo: ${(e as Error).message}`);
    }
  };

  const downloadPersonal = async () => {
    try {
      const list = groups.flatMap((g) => g.emps.map((e) => ({ store: g.st, emp: e })));
      if (!list.length) return sim.setToast("Ninguém na lista com esses filtros.");
      const blob = await personalPDF(list);
      const name = `escala-individual-${list.length === 1 ? list[0].emp.name || list[0].emp.func : `${list.length}-pessoas`}-${allDays[0].date}.pdf`.toLowerCase().replace(/[^a-z0-9à-ú.-]+/gi, "-");
      const r = await saveFile(name, blob);
      sim.setToast(r === "saved" ? `PDF com ${list.length} ${list.length === 1 ? "escala" : "escalas"} individuais gerado.` : r === "declined" ? "Download cancelado." : "Não foi possível baixar o arquivo aqui.");
    } catch (e) {
      sim.setToast(`Falha ao gerar o arquivo: ${(e as Error).message}`);
    }
  };

  return (
    <Card id="semana">
      <CardTitle
        sub={`Clique num dia para trocar trabalho por folga, ou lançar férias, falta ou atestado (escolha em “Ao clicar num dia”). O que você muda à mão fica fixo quando o sistema gerar de novo.${multiStore ? ` Mostrando ${stores.length} lojas nas mesmas datas.` : ""}`}
        actions={
          <>
            <Btn onClick={() => download("pdf")}>Baixar semana (PDF)</Btn>
            <Btn onClick={downloadPersonal} title="Uma página por pessoa, com o período todo, para imprimir ou mandar no WhatsApp">
              Escala por pessoa (PDF)
            </Btn>
            <Btn onClick={() => download("xlsx")}>Excel</Btn>
          </>
        }
      >
        Semana
      </CardTitle>
      <div className="mb-5 flex flex-col gap-4 rounded-xl bg-surface-2 px-5 py-4" role="group" aria-label="Filtros da semana">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Ver colaboradores dos setores</span>
            <span className="flex gap-3 text-[12.5px]">
              <button type="button" className="underline text-muted hover:text-ink" onClick={() => setSel(visibleNames)}>
                Todos
              </button>
              <button type="button" className="underline text-muted hover:text-ink" onClick={() => setSel(null)}>
                Só {sim.sector.name}
              </button>
            </span>
          </div>
          <div className="flex flex-wrap gap-2" id="sem-sectors">
            {visibleNames.map((n) => {
              const on = names.includes(n);
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSector(n)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${on ? "bg-navy text-navy-ink border-navy" : "bg-surface border-line text-muted hover:border-navy-2 hover:text-ink"}`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(n) ?? "var(--yellow)" }} aria-hidden />
                  {n}
                  <span className="font-normal">{countOf(n)}</span>
                  {on && <span aria-hidden>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          {sc.select && (
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Loja</span>
              {sc.select}
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Turno</span>
            <Select id="sem-shift" value={shiftOk} onChange={setShiftF} options={[{ value: "all", label: names.length === 1 ? "Todos os turnos" : "Todos (escolha 1 setor para filtrar)" }, ...shiftNames.map((x) => ({ value: x, label: x }))]} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Função</span>
            <Select id="sem-func" value={funcOk} onChange={setFuncF} options={[{ value: "all", label: "Todas" }, ...funcs.map((x) => ({ value: x, label: x }))]} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Buscar pessoa</span>
            <input id="sem-q" className="field w-48" placeholder="Nome" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Ordenar por</span>
            <Select
              id="sem-sort"
              value={sortKey}
              onChange={(v) => {
                setSortKey(v);
                setSortDesc(false);
              }}
              options={[
                { value: "cadastro", label: "Ordem de cadastro" },
                { value: "nome", label: "Nome (A–Z)" },
                { value: "entrada", label: "Horário de entrada" },
                { value: "saida", label: "Horário de saída" },
                { value: "horas", label: "Horas na semana" },
                ...WEEK_ORDER_MON.filter((wd) => days.some((d) => d.weekday === wd)).map((wd) => ({ value: `dia:${wd}`, label: `Entrada na ${WEEKDAY_LONG[wd].toLowerCase()}` })),
              ]}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Ordem</span>
            <div className="inline-flex rounded-xl border border-line overflow-hidden" role="radiogroup" aria-label="Ordem">
              {(
                [
                  [false, "▲ Crescente"],
                  [true, "▼ Decrescente"],
                ] as [boolean, string][]
              ).map(([v, l]) => (
                <button key={l} type="button" role="radio" aria-checked={sortDesc === v} onClick={() => setSortDesc(v)} className={`px-3.5 py-2 text-[13px] font-semibold border-r border-line last:border-r-0 ${sortDesc === v ? "bg-navy text-navy-ink" : "bg-surface hover:bg-surface-2"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <span className="pb-2 text-[13px] text-muted">
            {total} {total === 1 ? "pessoa" : "pessoas"}
            {multiSector ? ` em ${names.length} setores` : ""}
            {multiStore ? ` de ${stores.length} lojas` : ""}
          </span>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2">
            <Btn onClick={() => (week > 0 ? setWeek(week - 1) : goToDate(addDays(days[0].date, -7)))} aria-label="Semana anterior">
              ‹
            </Btn>
            <span className="min-w-[230px] text-center text-[15px] font-bold tnum">
              {WEEKDAY_SHORT[days[0].weekday]} {fmtDateBR(days[0].date, false)} a {WEEKDAY_SHORT[days[days.length - 1].weekday]} {fmtDateBR(days[days.length - 1].date, false)}
            </span>
            <Btn onClick={() => (week < weeks - 1 ? setWeek(week + 1) : goToDate(addDays(days[0].date, 7)))} aria-label="Próxima semana">
              ›
            </Btn>
          </div>
          <label className="inline-flex items-center gap-2 text-[13px] text-muted">
            Ir para
            <input id="sem-date" type="date" className="field" value={days[0].date} onChange={(e) => e.target.value && goToDate(e.target.value)} />
          </label>
          <label className="inline-flex items-center gap-2 text-[13px] text-muted">
            Semana começa
            <Select id="sem-ws" value={ws} onChange={setWeekStart} options={[{ value: 1, label: "Na segunda" }, { value: 0, label: "No domingo" }]} />
          </label>
        </div>
        <div className="flex flex-col gap-1">
        <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Ao clicar num dia</span>
        <div className="inline-flex rounded-xl border border-line overflow-hidden" role="radiogroup" aria-label="Ao clicar num dia">
          {(
            [
              ["folga", "Trabalho ↔ folga"],
              ["V", "Férias"],
              ["A", "Falta"],
              ["M", "Atestado"],
            ] as [Tool, string][]
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={tool === k} onClick={() => setTool(k)} className={`px-4 py-2 text-[13px] font-semibold border-r border-line last:border-r-0 ${tool === k ? "bg-navy text-navy-ink" : "bg-surface hover:bg-surface-2"}`}>
              {l}
            </button>
          ))}
        </div>
        </div>
      </div>
      {total > 0 && (
        <ColorLegend codes={["T", "D", "F", "V", "A", "M", "H"]}>
          <span className="inline-flex items-center gap-2">
            <i className="inline-block h-5 w-1.5 rounded-sm bg-navy" aria-hidden /> faixa lateral = cor do turno (Horários)
          </span>
          <label className="inline-flex items-center gap-2 cursor-pointer" title="Separa com uma linha grossa as pessoas de turnos diferentes (melhor com a ordem por horário de entrada)">
            <input id="sem-linha-turno" type="checkbox" checked={linhaTurno} onChange={(ev) => sim.updateStore((st) => ({ ...st, config: { ...st.config, linhaTurno: ev.target.checked } }))} />
            <i className="inline-block h-[3px] w-6" style={{ background: "var(--turno-div)" }} aria-hidden /> Linha grossa entre turnos
          </label>
        </ColorLegend>
      )}
      {!total ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-[14px] text-muted">Ninguém encontrado com esses filtros.</p>
      ) : (
        <div className="scroll-x rounded-xl border border-line">
          <table className="w-full border-collapse text-[13px] tnum">
            <thead className="bg-surface-2">
              <tr>
                <th className="th min-w-[180px]" aria-sort={sortKey === "nome" ? (sortDesc ? "descending" : "ascending") : undefined}>
                  <button type="button" className="uppercase hover:text-ink" onClick={() => clickSort("nome")} title="Ordenar por nome">
                    Pessoa{arrow("nome")}
                  </button>
                </th>
                {days.map((d) => (
                  <th key={d.date} className="th text-center min-w-[112px]" aria-sort={sortKey === `dia:${d.weekday}` ? (sortDesc ? "descending" : "ascending") : undefined}>
                    <button type="button" className="w-full rounded-md hover:bg-surface" onClick={() => clickSort(`dia:${d.weekday}`)} title="Ordenar pelo horário de entrada neste dia (folgas vão para o fim)">
                      <span className="block text-ink text-[13px] normal-case tracking-normal">
                        {WEEKDAY_SHORT[d.weekday]}
                        {arrow(`dia:${d.weekday}`)}
                      </span>
                      <span className="block font-normal normal-case tracking-normal">
                        {dayNum(d.date)}
                        {d.holiday ? " · feriado" : ""}
                        {d.weekday === 0 && !d.closed && groups.some((g) => g.emps.some((e) => teamOf(e))) ? ((n) => (n > 2 ? ` · Times ${teamOnSunday(d.date, n)}` : ` · Time ${teamOnSunday(d.date)}`))(cicloDosTimes(groups.flatMap((g) => g.emps))) : ""}
                      </span>
                    </button>
                  </th>
                ))}
                <th className="th text-right" aria-sort={sortKey === "horas" ? (sortDesc ? "descending" : "ascending") : undefined}>
                  <button type="button" className="uppercase hover:text-ink" onClick={() => clickSort("horas")} title="Ordenar por horas">
                    Horas{arrow("horas")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map(({ st, sec, ds, emps }) => (
                <React.Fragment key={st.id + sec.id}>
                  {grouped && (
                    <tr>
                      <th colSpan={days.length + 2} scope="colgroup" className="border-t border-line bg-surface px-3 pt-4 pb-2 text-left text-[13.5px] font-bold">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: sec.color ?? "var(--yellow)" }} aria-hidden />
                        {multiStore || otherStore ? `${st.name} · ` : ""}
                        {sec.name} <span className="font-normal text-muted">· {emps.length}</span>
                      </th>
                    </tr>
                  )}
                  {emps.map((e, ei) => {
                    const wmin = weekMin(st, sec, e, ds);
                    // pessoa de turno diferente da linha de cima: linha grossa separando os turnos
                    const novoTurno = linhaTurno && ei > 0 && emps[ei - 1].shiftId !== e.shiftId;
                    const div: React.CSSProperties | undefined = novoTurno ? { borderTop: "3px solid var(--turno-div)" } : undefined;
                    return (
                      <tr key={e.id} data-novo-turno={novoTurno || undefined} style={multiStore ? (colorVars(st.config) as React.CSSProperties) : undefined}>
                        <th scope="row" className="td text-left font-semibold whitespace-nowrap" style={div}>
                          {e.name || e.func}
                          {teamOf(e) && <TeamPill t={teamOf(e)!} />}
                          <PlantaoPill e={e} />
                          <span className="block text-[11.5px] font-normal text-muted">
                            {sec.shifts.find((x) => x.id === e.shiftId)?.name}
                            {((j) => (j ? ` · ${j.nome}` : e.regime !== "12x36" && folgasDe(st, e) !== st.config.folgasPorSemana ? ` · ${nomeFolgas(folgasDe(st, e))}` : ""))(jornadaDe(st.config, e))}
                          </span>
                        </th>
                        {ds.map((d) => {
                          if (!d.inPeriod)
                            return (
                              <td key={d.date} className="border-t border-line p-1.5 text-center text-[12px] text-muted" style={div} title="Fora do período planejado desta loja">
                                —
                              </td>
                            );
                          if (emBranco(sec, e.id, d.date) && !d.closed)
                            return (
                              <td key={d.date} className="border-t border-line p-1.5" style={div}>
                                <button
                                  type="button"
                                  data-branco
                                  onClick={() => setDay(st, sec.id, e.id, d)}
                                  className="w-full rounded-lg border border-dashed border-line bg-surface px-2 py-2 text-[12.5px] leading-tight text-transparent hover:outline hover:outline-2 hover:outline-focus"
                                  aria-label={`${e.name || e.func}, ${WEEKDAY_LONG[d.weekday]} ${fmtDateBR(d.date)}: em branco`}
                                  title="Em branco (escala limpa). Clique em Gerar escala para montar, ou clique aqui para lançar à mão."
                                >
                                  .
                                </button>
                              </td>
                            );
                          const c = cellCode(sec, e.id, d);
                          const locked = sec.schedule[e.id]?.[d.date]?.lock;
                          const sh = dayShift(st, sec, e, d);
                          const label = isWorking(c) ? `${fmtTime(sh.start)}–${fmtTime(sh.end)}${sh.end > 1440 ? " +1" : ""}` : c === "F" ? "Folga" : c === "V" ? "Férias" : c === "A" ? "Falta" : c === "M" ? "Atestado" : "Feriado";
                          const brkTxt = isWorking(c) && sh.breakEnd > sh.breakStart ? `intervalo ${fmtTime(sh.breakStart)}–${fmtTime(sh.breakEnd)}` : "";
                          const shiftTxt = isWorking(c) && sh.shift ? sh.shift.name : "";
                          return (
                            <td key={d.date} className="border-t border-line p-1.5" style={div}>
                              <button
                                type="button"
                                onClick={() => setDay(st, sec.id, e.id, d)}
                                className={`relative w-full rounded-lg px-2 py-2 text-[12.5px] leading-tight hover:outline hover:outline-2 hover:outline-focus ${c === "F" || c === "A" || c === "M" ? "font-semibold" : ""}`}
                                style={{ ...codeStyle(c), ...(isWorking(c) && sh.shift?.color ? { boxShadow: `inset 4px 0 0 ${sh.shift.color}` } : {}) }}
                                aria-label={`${e.name || e.func}, ${WEEKDAY_LONG[d.weekday]} ${fmtDateBR(d.date)}: ${label}${brkTxt ? `, ${brkTxt}` : ""}${locked ? ", fixado" : ""}`}
                                title={isWorking(c) ? `${shiftTxt} ${label}${brkTxt ? ` · ${brkTxt}` : ""}` : undefined}
                              >
                                {label}
                                {locked && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />}
                              </button>
                            </td>
                          );
                        })}
                        <td style={div} className={`td text-right whitespace-nowrap font-semibold ${e.regime !== "12x36" && wmin > (jornadaPessoal(e, st.config) != null ? Math.min(e.contractMin, st.config.weeklyMaxMin) : st.config.weeklyMaxMin) ? "text-red" : ""}`} title={e.regime === "12x36" ? "12x36: alterna semanas de 3 e 4 plantões (média de 42h por semana)" : jornadaPessoal(e, st.config) != null ? `Contrato: ${fmtDur(e.contractMin)} por semana` : undefined}>{fmtDur(wmin)}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2">
                <th scope="row" className="td text-left">
                  Trabalhando
                </th>
                {days.map((d, di) => {
                  const n = groups.reduce((m, g) => m + g.emps.filter((e) => g.ds[di].inPeriod && !emBranco(g.sec, e.id, g.ds[di].date) && isWorking(cellCode(g.sec, e.id, g.ds[di]))).length, 0);
                  const cov = a1 && shiftOk === "all" && funcOk === "all" && !q.trim() ? a1.coverage[d.idx] : null;
                  const miss = cov ? cov.req.reduce((m, r, i) => Math.max(m, r - cov.counts[i]), 0) : 0;
                  return (
                    <td key={d.date} className="td text-center">
                      <div className="text-[15px] font-bold">{d.closed && !multiStore ? "–" : n}</div>
                      {!d.closed && cov && <div className={`text-[11.5px] font-semibold ${miss > 0 ? "text-red" : "text-green"}`}>{miss > 0 ? `Falta ${miss}` : "Completo"}</div>}
                    </td>
                  );
                })}
                <td className="td" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

type ZoomKey = "P" | "M" | "G";
const ZOOM: Record<ZoomKey, { w: number; h: number; f: number; gap: number }> = {
  P: { w: 30, h: 34, f: 12.5, gap: 8 },
  M: { w: 46, h: 44, f: 15, gap: 12 },
  G: { w: 62, h: 54, f: 17, gap: 16 },
};

/** Arrastar com o mouse para rolar a área (como "mãozinha"); um arrasto não conta como clique. */
function useDragPan() {
  const ref = React.useRef<HTMLDivElement>(null);
  const st = React.useRef({ down: false, x: 0, y: 0, sl: 0, st: 0, moved: false });
  const [dragging, setDragging] = useState(false);
  return {
    ref,
    dragging,
    moved: () => st.current.moved,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType !== "mouse" || e.button !== 0 || !ref.current) return;
        st.current = { down: true, x: e.clientX, y: e.clientY, sl: ref.current.scrollLeft, st: ref.current.scrollTop, moved: false };
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = st.current;
        if (!s.down || !ref.current) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (!s.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
        if (!s.moved) {
          s.moved = true;
          setDragging(true);
        }
        ref.current.scrollLeft = s.sl - dx;
        ref.current.scrollTop = s.st - dy;
      },
      onPointerUp: () => {
        st.current.down = false;
        setDragging(false);
        // "moved" fica ligado até o clique que vem logo depois ser ignorado
        setTimeout(() => (st.current.moved = false), 0);
      },
      onPointerLeave: () => {
        st.current.down = false;
        setDragging(false);
      },
    },
  };
}

/** Cores originais do mapa de cobertura (as do tema claro). */
const COV_DEF = { low: "#c62a43", midLow: "#f3d36b", mid: "#c4ead3", high: "#1e8f4e" };
/** campos "até" de cada faixa de cor, pela quantidade de cores */
const LIM_IDS: Record<number, string[]> = { 2: ["cov-low"], 3: ["cov-low", "cov-high"], 4: ["cov-low", "cov-mid", "cov-high"] };

/** Amostra clicável da cor de uma faixa do mapa. */
function CovPick({ id, label, value, def, onChange }: { id: string; label: string; value?: string; def: string; onChange: (c: string | undefined) => void }) {
  return <ColorPicker id={id} label={label} value={isHex(value) ? value : def} onChange={onChange} allowNone compact />;
}

function WeekMap({ week, semCobertura = false }: { week: number; /** escala em branco: esconde o mapa de cobertura (mostra só o mês) */ semCobertura?: boolean }) {
  const sim = useSim();
  const f = useSectorFilter();
  const sid = f.id === "all" ? sim.sector.id : f.id;
  const a = useMemo(() => analyzeSector(sim.store, sid, { slot: 30 }), [sim.store, sid]);
  const [sel, setSel] = useState<{ idx: number; slot: number } | null>(null);
  const rows = WEEK_ORDER_MON.map((wd) => a.coverage.find((c) => c.day.week === week && c.day.weekday === wd)).filter((c): c is NonNullable<typeof c> => !!c);
  const step = a.axis[1] - a.axis[0] || 30;
  // colunas agrupadas de hora em hora (cada hora centralizada sobre as suas colunas de :00 e :30)
  const hours: { from: number; n: number; label: string }[] = [];
  a.axis.forEach((t, i) => {
    const h = Math.floor(t / 60);
    const g = hours[hours.length - 1];
    if (g && Math.floor(a.axis[g.from] / 60) === h) g.n++;
    else hours.push({ from: i, n: 1, label: t % 60 === 0 ? `${h}h` : `${h}h${String(t % 60).padStart(2, "0")}` });
  });
  const hourStart = new Set(hours.map((g) => g.from));
  // tamanho das células (preferência deste navegador)
  const [zoom, setZoomRaw] = useState<ZoomKey>(() => {
    try {
      const v = localStorage.getItem("cov-zoom");
      if (v === "P" || v === "M" || v === "G") return v;
    } catch {}
    return "M";
  });
  const setZoom = (z: ZoomKey) => {
    setZoomRaw(z);
    try {
      localStorage.setItem("cov-zoom", z);
    } catch {}
  };
  const Z = ZOOM[zoom];
  const padL = (i: number) => (i > 0 && hourStart.has(i) ? Z.gap : 3);
  const pan = useDragPan();
  // cores: % do quadro do setor (padrão) ou necessidade informada
  const cc = sim.store.config.coverageColor ?? { mode: "quadro" as const, low: 50, high: 80 };
  const setCC = (patch: Partial<typeof cc>) => sim.updateStore((st) => ({ ...st, config: { ...st.config, coverageColor: { ...cc, ...patch } } }));
  const quadro = sim.store.employees.filter((e) => e.sectorId === sid).length;
  const peak = Math.max(0, ...rows.flatMap((c) => c.counts.filter((_, i) => c.open[i])));
  const base = quadro > 0 ? quadro : peak; // setor sem quadro próprio (só remanejados): usa o pico da semana
  // quantas cores (2, 3 ou 4) no estilo de faixas
  const bands = cc.style === "degrade" ? 3 : cc.bands ?? 3;
  // com 4 cores: limite entre "abaixo do médio" e "número médio" (padrão: no meio, de 5 em 5)
  const midPct = Math.max(cc.low, Math.min(cc.high, cc.mid ?? Math.round((cc.low + cc.high) / 2 / 5) * 5));
  const lowN = Math.ceil((base * cc.low) / 100); // abaixo disso: vermelho
  const midN = Math.ceil((base * midPct) / 100); // com 4 cores: a partir disso, número médio
  const highN = Math.ceil((base * cc.high) / 100); // a partir disso: verde escuro
  // faixas de cor do critério "% do quadro": limites entre elas (fim de uma = começo da seguinte)
  const limites = bands === 2 ? [cc.low] : bands === 4 ? [cc.low, midPct, cc.high] : [cc.low, cc.high];
  const limMin = (j: number) => (j === 0 ? 0 : limites[j - 1]);
  const limMax = (j: number) => (j === limites.length - 1 ? 100 : limites[j + 1]);
  const setLimite = (j: number, v: number) => {
    const x = Math.max(limMin(j), Math.min(limMax(j), Math.round(v)));
    const keys: ("low" | "mid" | "high")[] = bands === 2 ? ["low"] : bands === 4 ? ["low", "mid", "high"] : ["low", "high"];
    setCC({ [keys[j]]: x } as Partial<typeof cc>);
  };
  const nPessoas = (n: number) => `${n} ${n === 1 ? "pessoa" : "pessoas"}`;
  const faixasCor = (() => {
    const nomes: { k: "low" | "midLow" | "mid" | "high"; nome: string }[] =
      bands === 2
        ? [{ k: "low", nome: "Menos funcionários" }, { k: "high", nome: "Gente suficiente" }]
        : bands === 4
          ? [{ k: "low", nome: "Menos funcionários" }, { k: "midLow", nome: "Abaixo do médio" }, { k: "mid", nome: "Número médio" }, { k: "high", nome: "Mais funcionários" }]
          : [{ k: "low", nome: "Menos funcionários" }, { k: "mid", nome: "Número médio" }, { k: "high", nome: "Mais funcionários" }];
    const cortes = limites.map((p) => Math.ceil((base * p) / 100));
    return nomes.map((x, i) => {
      const de = i === 0 ? 0 : cortes[i - 1];
      const ate = i === nomes.length - 1 ? null : cortes[i] - 1;
      const pessoas = ate == null ? `(${nPessoas(Math.max(de, 1))} ou mais)` : ate < de ? "(nenhuma quantidade)" : de === ate ? `(${nPessoas(de)})` : `(${de} a ${nPessoas(ate)})`;
      return { ...x, pessoas };
    });
  })();
  // cores escolhidas pelo usuário (ou as padrão)
  const cust = cc.colors ?? {};
  const lvl = { low: { cls: "bg-red text-red-ink font-bold", hex: cust.low }, midLow: { cls: "bg-amber text-amber-ink font-semibold", hex: cust.midLow }, mid: { cls: "bg-green-light text-green-light-ink", hex: cust.mid }, high: { cls: "bg-green text-green-ink font-semibold", hex: cust.high } };
  const paint = (k: keyof typeof lvl, extra = ""): { className: string; style?: React.CSSProperties } => {
    const h = lvl[k].hex;
    return isHex(h) ? { className: `${extra} ${k === "low" ? "font-bold" : "font-semibold"}`, style: { background: h, color: inkFor(h) } } : { className: lvl[k].cls };
  };
  const gradHex = isHex(cust.high) ? cust.high : COV_DEF.high;
  const setColor = (k: "low" | "midLow" | "mid" | "high", c: string | undefined) => {
    const next = { ...(cc.colors ?? {}) };
    if (c) next[k] = c;
    else delete next[k];
    setCC({ colors: Object.keys(next).length ? next : undefined });
  };
  const cellLook = (c: (typeof rows)[number], i: number): { className: string; style?: React.CSSProperties } => {
    const n = c.counts[i];
    if (cc.mode === "necessidade") {
      const s = c.status[i];
      return s === "red" ? paint("low") : s === "light" ? paint("mid") : s === "green" ? paint("high") : { className: STATUS_CLS[s] };
    }
    if ((cc.style ?? "faixas") === "degrade") {
      const top = Math.max(1, base, peak);
      const bg = mixHex(gradHex, "#ffffff", Math.min(1, 0.12 + 0.88 * (n / top)));
      return { className: n < lowN ? "font-bold" : "font-semibold", style: { background: bg, color: inkFor(bg), boxShadow: n < lowN ? `inset 0 0 0 2px ${isHex(cust.low) ? cust.low : "var(--red)"}` : undefined } };
    }
    if (n < lowN || n === 0) return paint("low");
    if (bands === 2) return paint("high");
    if (n >= highN) return paint("high");
    if (bands === 4 && n < midN) return paint("midLow");
    return paint("mid");
  };
  const detail = useMemo(() => {
    if (!sel) return null;
    const day = a.days[sel.idx];
    const t = a.axis[sel.slot];
    const here: string[] = [];
    const brk: string[] = [];
    for (const e of sim.store.employees) {
      const home = sim.store.sectors.find((s) => s.id === e.sectorId)!;
      const p = presenceAt(sim.store, e, day, t, cellCode(home, e.id, day), slotLen(a.axis, sim.store.config.slot));
      const counts = (p.state === "working" || p.state === "out") && p.sectorId === a.sector.id;
      if (counts) here.push(e.name || e.func);
      else if (e.sectorId === a.sector.id && p.state === "break") brk.push(e.name || e.func);
    }
    return { day, t, here, brk, req: a.coverage[sel.idx].req[sel.slot] };
  }, [sel, a, sim.store]);
  const hfmt = (h: number) => `${(Math.round(h * 10) / 10).toLocaleString("pt-BR")}h`;
  return (
    <>
    {!semCobertura && (
    <>
    <Card>
      <CardTitle
        sub={`Quantas pessoas estão no posto a cada ${step} minutos nesta semana, já descontando intervalos e folgas. Clique num horário para ver quem está lá.`}
        actions={
          <label className="inline-flex items-center gap-2 text-[13px] text-muted">
            Setor
            <Select
              id="cov-sector"
              aria-label="Setor do mapa de cobertura"
              value={sid}
              onChange={(v) => {
                f.set(v);
                setSel(null);
              }}
              options={f.visible.map((x) => ({ value: x.id, label: x.name }))}
            />
          </label>
        }
      >
        Cobertura da semana · {a.sector.name}
      </CardTitle>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted">
        <label className="inline-flex items-center gap-2">
          Cores por
          <Select
            id="cov-mode"
            aria-label="Critério das cores do mapa"
            value={cc.mode}
            onChange={(v) => setCC({ mode: v as "quadro" | "necessidade" })}
            options={[
              { value: "quadro", label: "% do quadro do setor" },
              { value: "necessidade", label: "Fluxo alto (mínimo)" },
            ]}
          />
        </label>
        {cc.mode === "quadro" && (
          <>
            <label className="inline-flex items-center gap-2">
              Estilo
              <Select
                id="cov-style"
                aria-label="Estilo das cores do mapa"
                value={cc.style === "degrade" ? "degrade" : String(bands)}
                onChange={(v) => {
                  if (v === "degrade") return setCC({ style: "degrade" });
                  const b = Number(v) as 2 | 3 | 4;
                  // com 2 cores só vale "pouca gente"; ao voltar para 3 ou 4, "muita gente" não fica abaixo dela
                  setCC({ style: "faixas", bands: b, ...(b > 2 && cc.high < cc.low ? { high: cc.low } : {}) });
                }}
                options={[
                  { value: "2", label: "2 cores" },
                  { value: "3", label: "3 cores" },
                  { value: "4", label: "4 cores" },
                  { value: "degrade", label: "Degradê de uma cor" },
                ]}
              />
            </label>
            {cc.style === "degrade" && (
              <>
                <label className="inline-flex items-center gap-2">
                  Pouca gente abaixo de
                  <NumInput id="cov-low" aria-label="Pouca gente abaixo de (%)" className="!w-[64px]" value={cc.low} min={0} max={cc.high} onChange={(v) => setCC({ low: v ?? 0 })} />%
                </label>
                <label className="inline-flex items-center gap-2">
                  Muita gente a partir de
                  <NumInput id="cov-high" aria-label="Muita gente a partir de (%)" className="!w-[64px]" value={cc.high} min={cc.low} max={100} onChange={(v) => setCC({ high: v ?? 100 })} />%
                </label>
              </>
            )}
            <span>
              Quadro do setor: <b className="text-ink">{base} {base === 1 ? "pessoa" : "pessoas"}</b>
            </span>
          </>
        )}
      </div>
      <div className="relative z-40 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-muted" id="cov-legend">
        {cc.mode === "quadro" && (cc.style ?? "faixas") === "degrade" ? (
          <>
            <span className="inline-flex items-center gap-2">
              <CovPick id="cov-c-high" label="Cor da quantidade" value={cust.high} def={COV_DEF.high} onChange={(c) => setColor("high", c)} />
              <i className="inline-block h-3.5 w-28 rounded" style={{ background: `linear-gradient(90deg, ${mixHex(gradHex, "#ffffff", 0.12)}, ${gradHex})` }} aria-hidden />
              De pouca a muita gente (mais forte = mais funcionários)
            </span>
            <span className="inline-flex items-center gap-2">
              <CovPick id="cov-c-low" label="Contorno de pouca gente" value={cust.low} def={COV_DEF.low} onChange={(c) => setColor("low", c)} />
              Contorno quando há menos de {lowN} ({cc.low}% do quadro)
            </span>
          </>
        ) : cc.mode === "quadro" ? (
          <div className="w-full">
            <div className="mb-2 text-[12.5px]">Cada cor vale para uma faixa do quadro do setor. Mudar o fim de uma faixa muda o começo da seguinte.</div>
            <div className="grid gap-y-2" id="cov-faixas">
              {faixasCor.map((fx, i) => (
                <div key={fx.k} className="flex flex-wrap items-center gap-2 min-w-0" id={`cov-faixa-${i + 1}`}>
                  <CovPick id={`cov-c-${fx.k === "midLow" ? "midlow" : fx.k}`} label={`Cor de ${fx.nome.toLowerCase()}`} value={cust[fx.k]} def={COV_DEF[fx.k]} onChange={(c) => setColor(fx.k, c)} />
                  <span className="font-semibold text-ink min-w-[9.5rem]">{fx.nome}</span>
                  <span className="inline-flex items-center gap-1.5">
                    de
                    {i === 0 ? (
                      <span className="inline-block w-[52px] text-right tnum text-ink">0</span>
                    ) : (
                      <NumInput id={`cov-de-${i + 1}`} aria-label={`${fx.nome}: de (%)`} className="!w-[56px]" value={limites[i - 1]} min={limMin(i - 1)} max={limMax(i - 1)} onChange={(v) => setLimite(i - 1, v ?? 0)} />
                    )}
                    % a
                    {i === faixasCor.length - 1 ? (
                      <span className="inline-block w-[52px] text-right tnum text-ink">100</span>
                    ) : (
                      <NumInput id={LIM_IDS[faixasCor.length][i]} aria-label={`${fx.nome}: até (%)`} className="!w-[56px]" value={limites[i]} min={limMin(i)} max={limMax(i)} onChange={(v) => setLimite(i, v ?? 0)} />
                    )}
                    %
                  </span>
                  <span className="text-[12px]">{fx.pessoas}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <span className="inline-flex items-center gap-2">
              <CovPick id="cov-c-low" label="Cor de falta gente" value={cust.low} def={COV_DEF.low} onChange={(c) => setColor("low", c)} />
              Falta gente
            </span>
            <span className="inline-flex items-center gap-2">
              <CovPick id="cov-c-mid" label="Cor de no limite" value={cust.mid} def={COV_DEF.mid} onChange={(c) => setColor("mid", c)} />
              No limite
            </span>
            <span className="inline-flex items-center gap-2">
              <CovPick id="cov-c-high" label="Cor de folga de gente" value={cust.high} def={COV_DEF.high} onChange={(c) => setColor("high", c)} />
              Folga de gente
            </span>
            {a.coverage.some((c) => c.status.includes("none") && c.counts.some((n, i) => c.status[i] === "none" && n > 0)) && (
              <span className="inline-flex items-center gap-2">
                <i className="inline-block h-3.5 w-5 rounded bg-surface-2 border border-line" /> Sem necessidade definida (ajuste em Fluxo alto)
              </span>
            )}
            {a.coverage.some((c) => c.status.includes("yellow")) && (
              <span className="inline-flex items-center gap-2">
                <i className="inline-block h-3.5 w-5 rounded bg-amber" /> Abaixo do ideal
              </span>
            )}
          </>
        )}
        {(cust.low || cust.midLow || cust.mid || cust.high) && (
          <button type="button" id="cov-c-reset" className="underline hover:text-ink" onClick={() => setCC({ colors: undefined })}>
            Voltar às cores originais
          </button>
        )}
        <span className="text-[12px]">Clique na cor para trocar.</span>
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-muted">
        <span>Arraste com o mouse (ou use as barras de rolagem) para andar para os lados e para cima e para baixo.</span>
        <div className="inline-flex items-center gap-2">
          Tamanho
          <div className="inline-flex rounded-xl border border-line overflow-hidden" role="radiogroup" aria-label="Tamanho das células" id="cov-zoom">
            {(
              [
                ["P", "Pequeno"],
                ["M", "Médio"],
                ["G", "Grande"],
              ] as [ZoomKey, string][]
            ).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={zoom === k} onClick={() => setZoom(k)} className={`px-3 py-1.5 text-[12.5px] font-semibold border-r border-line last:border-r-0 ${zoom === k ? "bg-navy text-navy-ink" : "bg-surface hover:bg-surface-2"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        ref={pan.ref}
        {...pan.handlers}
        id="cov-scroll"
        className="cov-scroll rounded-xl border border-line"
        style={{ maxHeight: "min(68vh, 720px)", cursor: pan.dragging ? "grabbing" : "grab" }}
      >
        <table className="border-collapse tnum" style={{ fontSize: Z.f, minWidth: "100%" }}>
          <thead>
            <tr>
              <th rowSpan={2} className="sticky left-0 top-0 z-30 bg-surface" style={{ minWidth: 92 }} />
              {hours.map((g) => (
                <th key={g.from} colSpan={g.n} className="sticky top-0 z-20 bg-surface pt-3 pb-0 align-bottom" style={{ paddingLeft: padL(g.from), paddingRight: 3, height: 48 }}>
                  <div className="text-center font-bold text-ink whitespace-nowrap" style={{ fontSize: Z.f }}>
                    {g.label}
                  </div>
                  <div className="mt-1 h-[7px] rounded-t-md border-x-2 border-t-2 border-line" aria-hidden />
                </th>
              ))}
            </tr>
            <tr>
              {a.axis.map((t, i) => (
                <th key={i} className="sticky z-20 bg-surface pb-1.5 pt-0.5 text-center text-[11px] font-semibold text-muted border-b border-line" style={{ top: 48, paddingLeft: padL(i), paddingRight: 3, minWidth: Z.w }}>
                  :{String(t % 60).padStart(2, "0")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.day.date}>
                <th scope="row" className="sticky left-0 z-10 bg-surface pl-3 pr-3 text-left font-semibold whitespace-nowrap border-r border-line" style={{ fontSize: Math.max(14, Z.f) }}>
                  {WEEKDAY_SHORT[c.day.weekday]} {dayNum(c.day.date)}
                </th>
                {a.axis.map((_, i) => {
                  const show = !c.day.closed && (c.open[i] || c.req[i] > 0 || c.counts[i] > 0);
                  const isSel = sel && sel.idx === c.day.idx && sel.slot === i;
                  return (
                    <td key={i} style={{ paddingLeft: padL(i), paddingRight: 3, paddingTop: 5, paddingBottom: 5 }}>
                      <button
                        type="button"
                        disabled={!show}
                        onClick={() => !pan.moved() && setSel({ idx: c.day.idx, slot: i })}
                        className={`block w-full select-none rounded-lg text-center ${show ? cellLook(c, i).className : "bg-transparent"} ${isSel ? "outline outline-2 outline-focus" : ""}`}
                        style={{ minWidth: Z.w, height: Z.h, lineHeight: `${Z.h}px`, fontSize: Z.f, cursor: "inherit", ...(show ? cellLook(c, i).style : {}) }}
                        aria-label={`${WEEKDAY_LONG[c.day.weekday]} ${fmtTime(a.axis[i])}: ${c.counts[i]} no posto, precisa de ${c.req[i]}`}
                        title={`${fmtTime(a.axis[i])}–${fmtTime(a.axis[i] + step)} · ${c.counts[i]} no posto${base ? ` (${Math.round((c.counts[i] / base) * 100)}% do quadro)` : ""}${c.req[i] ? ` · precisa de ${c.req[i]}` : " · sem necessidade definida"}`}
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
      {detail && (
        <div className="mt-5 rounded-xl border border-line bg-surface-2 p-5 text-[13.5px]" role="region" aria-label="Quem está no horário">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-[15px]">
              {WEEKDAY_LONG[detail.day.weekday]}, {fmtTime(detail.t)}–{fmtTime(detail.t + step)}: {detail.here.length} no posto, precisa de {detail.req}
              {detail.req > detail.here.length && <span className="text-red"> · faltam {detail.req - detail.here.length}</span>}
            </strong>
            <Btn onClick={() => setSel(null)}>Fechar</Btn>
          </div>
          <p className="mt-2">
            <span className="text-muted">No posto:</span> {detail.here.join(", ") || "ninguém"}
          </p>
          {detail.brk.length > 0 && (
            <p className="mt-1">
              <span className="text-muted">Em intervalo:</span> {detail.brk.join(", ")}
            </p>
          )}
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-4" id="brk-tool">
        <p className="max-w-[640px] text-[13px] text-muted">
          <b className="text-ink">Almoço:</b> cada pessoa de {a.sector.name} tem um horário de almoço fixo (sugerido pelo sistema, espalhado no horário de intervalo do turno) ou em rodízio. Veja e mude na Escala de Almoço — o mapa acima já desconta os almoços.
        </p>
        <Btn onClick={() => (window.location.hash = "almoco")}>Abrir Escala de Almoço</Btn>
      </div>
    </Card>
    </>
    )}
    <MonthView refDate={a.coverage.find((c) => c.day.week === week)?.day.date ?? sim.store.config.startDate} />
    </>
  );
}

/** PDF de uma semana para imprimir e colocar no mural (uma página por loja e setor). */
async function weekPDF(pages: { st: Store; sec: Sector }[], dates: string[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  pages.forEach(({ st: store, sec: sector }, i) => {
    if (i > 0) doc.addPage();
    const cfg = store.config;
    const dayObjs = buildDays(cfg, dates[0], 1);
    doc.setFontSize(16);
    doc.text(`Simulador Escala 5x2 · ${store.name} · ${sector.name}`, 32, 40);
    doc.setFontSize(10);
    doc.text(`Escala da semana ${fmtDateBR(dates[0])} a ${fmtDateBR(dates[dates.length - 1])}`, 32, 58);
    const emps = store.employees.filter((e) => e.sectorId === sector.id);
    autoTable(doc, {
      startY: 72,
      head: [["Pessoa", ...dayObjs.map((d) => `${WEEKDAY_SHORT[d.weekday]} ${dayNum(d.date)}`)]],
      body: emps.map((e) => [
        e.name || e.func,
        ...dayObjs.map((d) => {
          const c = cellCode(sector, e.id, d);
          if (isWorking(c)) {
            const sh = dayShift(store, sector, e, d);
            return `${fmtTime(sh.start)}–${fmtTime(sh.end)}${sh.breakEnd > sh.breakStart ? `\nint. ${fmtTime(sh.breakStart)}` : ""}`;
          }
          return c === "F" ? "FOLGA" : c === "V" ? "FÉRIAS" : c === "A" ? "FALTA" : c === "M" ? "ATESTADO" : "FERIADO";
        }),
      ]),
      styles: { fontSize: 9, cellPadding: 5, halign: "center", valign: "middle" },
      headStyles: { fillColor: [61, 26, 110], textColor: [255, 255, 255] },
      columnStyles: { 0: { halign: "left", fontStyle: "bold", cellWidth: 150 } },
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index === 0) return;
        const raw = String(data.cell.raw);
        const k = raw === "FOLGA" ? "F" : raw === "FÉRIAS" ? "V" : raw === "FALTA" ? "A" : raw === "ATESTADO" ? "M" : raw === "FERIADO" ? "H" : null;
        if (k) {
          data.cell.styles.fillColor = rgbOf(cfg, k);
          data.cell.styles.textColor = k === "A" && !cfg.colors?.A ? [200, 40, 60] : inkRgb(cfg, k);
          if (k === "F") data.cell.styles.fontStyle = "bold";
        }
      },
    });
  });
  return doc.output("blob");
}
