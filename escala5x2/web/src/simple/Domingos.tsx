"use client";
// Tela Domingos: escala exclusiva de domingo (quem trabalha, em qual turno, quem folga),
// cópia de um domingo para outros, modelos reutilizáveis e alertas — por loja, setor, função e colaborador.
import React, { useMemo, useState } from "react";
import { useSim } from "../components/state";
import { Btn, ConfirmBtn, Select } from "../components/ui";
import { Card, CardTitle, PageHead, type PageId } from "./SimpleApp";
import { analyzeSector } from "../engine/analysis";
import { buildDays, dayShift, employeeShift, resolveShiftObj } from "../engine/model";
import type { CalDay, Employee, Sector, Store } from "../engine/types";
import { addDays, fmtDateBR, fmtTime, weekdayOf, weekStartOf } from "../engine/time";
import { cicloDosTimes, domingosForaDoHabitual, domingosNoHabitual, mudarTurnoDomingo, teamOf, teamOnSunday } from "./logic";
import { PlantaoPill, TeamPill } from "./MonthView";
import { applyToSundays, setSunday, sundayEntry, templateFromSunday, type SundayEntry } from "./sundays";
import { codeStyle, colorVars } from "./colors";
import { useStoreScope } from "./StoreScope";

export const matchSector = (st: Store, name: string) => st.sectors.find((s) => s.name === name && !s.hidden) ?? null;

export function DomingosPage({ go }: { go: (p: PageId) => void }) {
  const sim = useSim();
  const secName = sim.sector.name;
  const [func, setFunc] = useState("all");
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("all");
  const [ord, setOrd] = useState<OrdemDom>("cadastro");
  const [desc, setDesc] = useState(false);
  const sc = useStoreScope("dom-store");
  const funcs = Array.from(new Set(sc.stores.flatMap((st) => st.employees.filter((e) => matchSector(st, secName)?.id === e.sectorId).map((e) => e.func.trim()).filter(Boolean)))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const multi = sc.stores.length > 1;
  return (
    <>
      <PageHead
        title={`Domingos · ${secName}`}
        sub="Escala própria de domingo: quem trabalha, em qual horário e quem folga em cada domingo, sem mexer nos horários da semana. Toda mudança aqui fica fixa quando o sistema gerar de novo."
        go={go}
      />
      <Card>
        <div className="flex flex-wrap items-end gap-4" role="group" aria-label="Filtros dos domingos">
          {sc.select && (
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Loja</span>
              {sc.select}
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Função</span>
            <Select id="dom-func" value={funcs.includes(func) ? func : "all"} onChange={setFunc} options={[{ value: "all", label: "Todas" }, ...funcs.map((f) => ({ value: f, label: f }))]} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Rodízio</span>
            <Select
              id="dom-team"
              value={team}
              onChange={setTeam}
              options={[
                { value: "all", label: "Todos" },
                ...Array.from(new Set(sc.stores.flatMap((st) => st.employees.map((e) => teamOf(e)).filter((t): t is string => !!t))))
                  .sort()
                  .map((t) => ({ value: t, label: `Time ${t}` })),
                { value: "none", label: "Sem time" },
              ]}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Colaborador</span>
            <input id="dom-q" className="field w-52" placeholder="Nome" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Ordenar por</span>
            <div className="flex items-center gap-2">
              <Select id="dom-ord" aria-label="Ordenar por" value={ord} onChange={(v) => setOrd(v as OrdemDom)} options={ORDENS_DOM} />
              <Btn id="dom-ord-dir" onClick={() => setDesc(!desc)} aria-label={desc ? "Ordem decrescente" : "Ordem crescente"} title={desc ? "Decrescente" : "Crescente"}>
                {desc ? "▼ Decrescente" : "▲ Crescente"}
              </Btn>
            </div>
          </div>
          <p className="pb-2 text-[12.5px] text-muted max-w-[60ch]">
            Horários de domingo ficam em{" "}
            <button type="button" className="underline" onClick={() => go("horarios")}>
              Horários
            </button>{" "}
            (você pode criar vários turnos de domingo). O rodízio Time A / Time B fica em{" "}
            <button type="button" className="underline" onClick={() => go("equipe")}>
              Equipe
            </button>
            .
          </p>
        </div>
      </Card>
      {sc.stores.map((st) => (
        <StoreSundays
          key={st.id}
          st={st}
          secName={secName}
          multi={multi || st.id !== sim.store.id}
          func={funcs.includes(func) ? func : "all"}
          team={team}
          q={q}
          ord={ord}
          desc={desc}
          onSort={(o) => {
            // clicar no cabeçalho já escolhido inverte a ordem
            if (o === ord) setDesc(!desc);
            else {
              setOrd(o);
              setDesc(false);
            }
          }}
        />
      ))}
    </>
  );
}

type OrdemDom = "cadastro" | "nome" | "turnoDomingo" | "turnoSemana";
const ORDENS_DOM: { value: OrdemDom; label: string }[] = [
  { value: "cadastro", label: "Ordem de cadastro" },
  { value: "nome", label: "Pessoa (A–Z)" },
  { value: "turnoDomingo", label: "Turno de domingo (entrada)" },
  { value: "turnoSemana", label: "Turno da semana (entrada)" },
];

/** Ordena as pessoas da escala de domingo: por cadastro, nome ou horário de entrada do turno (empate: o outro turno e o nome). */
function ordenarDomingo(st: Store, sec: Sector, emps: Employee[], ord: OrdemDom, desc: boolean): Employee[] {
  if (ord === "cadastro") return desc ? [...emps].reverse() : emps;
  const nome = (e: Employee) => (e.name || e.func).toLocaleLowerCase("pt-BR");
  const dom = (e: Employee) => employeeShift(st, sec, e, true).start;
  const sem = (e: Employee) => employeeShift(st, sec, e, false).start;
  const cmp = (a: Employee, b: Employee) => {
    let d = 0;
    if (ord === "turnoDomingo") d = dom(a) - dom(b) || sem(a) - sem(b);
    else if (ord === "turnoSemana") d = sem(a) - sem(b) || dom(a) - dom(b);
    // empate pelo nome, no mesmo sentido (decrescente = lista invertida)
    const t = d || nome(a).localeCompare(nome(b), "pt-BR");
    return desc ? -t : t;
  };
  return [...emps].sort(cmp);
}

function shiftLabel(st: Store, sec: Sector, id: string) {
  const sh = sec.shifts.find((s) => s.id === id);
  if (!sh) return "";
  const r = resolveShiftObj(st.config, sh);
  return `${sh.name} ${fmtTime(r.start)}–${fmtTime(r.end)}`;
}

function StoreSundays({ st, secName, multi, func, team, q, ord, desc, onSort }: { st: Store; secName: string; multi: boolean; func: string; team: string; q: string; ord: OrdemDom; desc: boolean; onSort: (o: OrdemDom) => void }) {
  const sim = useSim();
  const sec = matchSector(st, secName);
  const upd = (fn: (s: Store) => Store) => sim.updateStoreById(st.id, fn);
  const allSundays = useMemo(() => buildDays(st.config).filter((d) => d.weekday === 0), [st.config]);
  const days = useMemo(() => allSundays.filter((d) => !d.closed), [allSundays]);
  const [edited, setEdited] = useState(0);
  const [tool, setTool] = useState<"copy" | "tpl" | null>(null);
  const a = useMemo(() => (sec ? analyzeSector(st, sec.id, { slot: 30 }) : null), [st, sec]);
  if (!sec)
    return (
      <Card>
        <CardTitle>{st.name}</CardTitle>
        <p className="text-[14px] text-muted">Esta loja não tem o setor {secName}.</p>
      </Card>
    );
  if (!st.config.sundayOpen)
    return (
      <Card>
        <CardTitle>{multi ? `${st.name} · ` : ""}Domingos</CardTitle>
        <p className="text-[14px] text-muted">A loja fica fechada aos domingos (mude em Personalizar → Funcionamento e jornada).</p>
      </Card>
    );
  const all = st.employees.filter((e) => e.sectorId === sec.id);
  const filtrados = all.filter(
    (e) =>
      (func === "all" || e.func.trim() === func) &&
      (team === "all" || (team === "none" ? !teamOf(e) : teamOf(e) === team)) &&
      (!q.trim() || (e.name || e.func).toLowerCase().includes(q.trim().toLowerCase())),
  );
  const emps = ordenarDomingo(st, sec, filtrados, ord, desc);
  const seta = (o: OrdemDom) => (ord === o ? (desc ? " ▼" : " ▲") : " ↕");
  const special = sec.shifts.filter((s) => s.special);
  const regular = sec.shifts.filter((s) => !s.special);
  const defSun = sec.shifts.find((s) => s.id === sec.defaultSundayShiftId) ?? special[0];
  const writeSector = (fn: (s: Sector) => Sector) => upd((x) => ({ ...x, sectors: x.sectors.map((s) => (s.id === sec.id ? fn(s) : s)) }));
  const setCell = (e: Employee, d: CalDay, v: string) => {
    const entry: SundayEntry = v === "F" ? { c: "F" } : v === "default" ? { c: "D" } : { c: "D", shiftId: v };
    writeSector((s) => setSunday(s, e.id, d.date, entry));
    setEdited((n) => n + 1);
  };
  const cov = (d: CalDay) => a?.coverage.find((c) => c.day.date === d.date);
  // navegar pelos domingos: o período planejado da loja (o mesmo da Escala) passa a começar na semana pedida
  const cfg = st.config;
  const ws = cfg.weekStart ?? weekdayOf(cfg.startDate);
  const moverPeriodo = (start: string) => {
    if (start === cfg.startDate) return;
    upd((x) => ({ ...x, config: { ...x.config, startDate: start } }));
  };
  const irPara = (date: string) => {
    // o domingo da semana da data (ou a própria data, se for domingo) já aparece: nada muda
    const dom = weekdayOf(date) === 0 ? date : addDays(weekStartOf(date, ws), (7 - ws) % 7);
    if (allSundays.some((d) => d.date === dom)) return;
    moverPeriodo(weekStartOf(date, ws));
  };
  const sundayAlerts = (a?.alerts ?? []).filter((x) => x.severity === "problema" && (x.title === "Domingos" || x.title === "Folgas" || x.title === "Jornada semanal" || x.title === "Dias seguidos" || (x.target?.kind === "cell" && days.some((d) => x.target?.kind === "cell" && d.date === x.target.date))));

  return (
    <Card id={`dom-${st.id}`} style={colorVars(st.config) as React.CSSProperties}>
      <CardTitle
        sub={`${days.length} ${days.length === 1 ? "domingo" : "domingos"} no planejamento (${days.length ? `${fmtDateBR(days[0].date, false)} a ${fmtDateBR(days[days.length - 1].date, false)}` : "—"}). Escolha em cada célula: folga ou o turno do dia.`}
        actions={
          <>
            <Btn onClick={() => setTool(tool === "copy" ? null : "copy")} aria-expanded={tool === "copy"}>
              Copiar um domingo…
            </Btn>
            <Btn onClick={() => setTool(tool === "tpl" ? null : "tpl")} aria-expanded={tool === "tpl"}>
              Modelos de domingo…
            </Btn>
          </>
        }
      >
        {multi ? `${st.name} · ` : ""}Escala de domingo · {sec.name}
      </CardTitle>

      <div className="mb-4 flex flex-wrap items-center gap-3" role="group" aria-label="Datas dos domingos">
        <div className="inline-flex items-center gap-2">
          <Btn id={`dom-prev-${st.id}`} onClick={() => moverPeriodo(addDays(cfg.startDate, -cfg.weeks * 7))} aria-label="Domingos anteriores">
            ‹
          </Btn>
          <span className="min-w-[200px] text-center text-[15px] font-bold tnum" id={`dom-range-${st.id}`}>
            {allSundays.length ? `Dom ${fmtDateBR(allSundays[0].date, false)} a Dom ${fmtDateBR(allSundays[allSundays.length - 1].date, false)}` : "—"}
          </span>
          <Btn id={`dom-next-${st.id}`} onClick={() => moverPeriodo(addDays(cfg.startDate, cfg.weeks * 7))} aria-label="Próximos domingos">
            ›
          </Btn>
        </div>
        <label className="inline-flex items-center gap-2 text-[13px] text-muted">
          Ir para
          <input id={`dom-date-${st.id}`} type="date" className="field" value={allSundays[0]?.date ?? cfg.startDate} onChange={(e) => e.target.value && irPara(e.target.value)} />
        </label>
        <span className="text-[12.5px] text-muted">Muda as datas do planejamento da loja (as mesmas da Escala). O que já foi feito em outras datas continua guardado.</span>
      </div>

      {edited > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-navy-2 px-5 py-3 text-[13.5px]" role="status">
          <span>Você mudou {edited} domingo(s) à mão. Se alguém ficou com folga a mais ou a menos na semana, reorganize as outras folgas (os domingos que você escolheu ficam como estão).</span>
          <Btn
            kind="primary"
            disabled={sim.running}
            onClick={async () => {
              await sim.redistribute(sec.id, st.id);
              setEdited(0);
              sim.setToast(`Folgas de ${sec.name} reorganizadas mantendo os domingos escolhidos.`);
            }}
          >
            Reorganizar as folgas da semana
          </Btn>
        </div>
      )}

      {tool === "copy" && <CopySunday key={cfg.startDate} sec={sec} days={days} empIds={all.map((e) => e.id)} onDone={() => setTool(null)} write={writeSector} />}
      {tool === "tpl" && <Templates key={cfg.startDate} sec={sec} days={days} empIds={all.map((e) => e.id)} write={writeSector} />}

      {!days.length ? (
        <p className="text-[14px] text-muted">Nenhum domingo aberto no período planejado.</p>
      ) : !emps.length ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-[14px] text-muted">Ninguém encontrado com esses filtros.</p>
      ) : (
        <div className="cov-scroll rounded-xl border border-line" style={{ maxHeight: "min(72vh, 760px)" }}>
          <table className="border-collapse text-[13px] tnum" style={{ minWidth: "100%" }}>
            <thead>
              <tr>
                <th className="th sticky left-0 top-0 z-30 bg-surface-2 border-b border-r border-line" style={{ minWidth: 200 }} aria-sort={ord === "nome" ? (desc ? "descending" : "ascending") : undefined}>
                  <button type="button" id={`dom-sort-nome-${st.id}`} className="uppercase tracking-wide hover:text-ink" onClick={() => onSort("nome")} title="Ordenar por pessoa">
                    Pessoa{seta("nome")}
                  </button>
                </th>
                <th className="th sticky top-0 z-20 bg-surface-2 border-b border-line" aria-sort={ord === "turnoDomingo" ? (desc ? "descending" : "ascending") : undefined}>
                  <button type="button" id={`dom-sort-turno-${st.id}`} className="uppercase tracking-wide hover:text-ink text-left" onClick={() => onSort("turnoDomingo")} title="Ordenar pelo horário de entrada do turno de domingo">
                    Turno de domingo habitual{seta("turnoDomingo")}
                  </button>
                </th>
                {days.map((d) => (
                  <th key={d.date} className="th sticky top-0 z-20 bg-surface-2 border-b border-line text-center" style={{ minWidth: 210 }}>
                    <span className="block text-ink text-[13px] normal-case tracking-normal">Dom {fmtDateBR(d.date, false)}</span>
                    {cicloDosTimes(all) > 2 ? (
                      <span className="block font-normal normal-case tracking-normal">Trabalham os times {teamOnSunday(d.date, cicloDosTimes(all))}</span>
                    ) : (
                      <span className="block font-normal normal-case tracking-normal">Trabalha o Time {teamOnSunday(d.date)}</span>
                    )}
                  </th>
                ))}
                <th className="th sticky top-0 z-20 bg-surface-2 border-b border-line text-center">Trabalha</th>
              </tr>
            </thead>
            <tbody>
              {emps.map((e) => {
                let worked = 0;
                const t = teamOf(e);
                return (
                  <tr key={e.id}>
                    <th scope="row" className="sticky left-0 z-10 bg-surface border-t border-r border-line px-3 py-2 text-left font-semibold whitespace-nowrap">
                      {e.name || e.func}
                      {t && <TeamPill t={t} />}
                      <PlantaoPill e={e} />
                      <span className="block text-[11.5px] font-normal text-muted">
                        {((sh) => (sh ? `${sh.name} ${fmtTime(employeeShift(st, sec, e, false).start)}` : ""))(sec.shifts.find((x) => x.id === e.shiftId))}
                      </span>
                    </th>
                    <td className="border-t border-line px-2 py-2">
                      <Select
                        id={`dom-def-${e.id}`}
                        aria-label={`Turno de domingo habitual de ${e.name || e.func}`}
                        value={e.sundayShiftId && special.some((s) => s.id === e.sundayShiftId) ? e.sundayShiftId : "sector"}
                        onChange={(v) => {
                          const n = domingosForaDoHabitual(st, e.id).length + (sec.schedule[e.id] ? Object.values(sec.schedule[e.id]).filter((c) => c.shiftId && c.shiftId === (v === "sector" ? sec.defaultSundayShiftId : v)).length : 0);
                          upd((x) => mudarTurnoDomingo(x, e.id, v === "sector" ? null : v));
                          sim.setToast(`Turno de domingo de ${e.name || e.func}: ${shiftLabel(st, sec, v === "sector" ? sec.defaultSundayShiftId ?? "" : v) || "padrão do setor"}. ${n ? "Os domingos já escalados (inclusive os escolhidos à mão) passaram para esse turno." : "Vale para todos os domingos do planejamento."}`);
                        }}
                        options={[{ value: "sector", label: defSun ? `Padrão do setor (${shiftLabel(st, sec, defSun.id)})` : "Padrão do setor" }, ...special.map((s) => ({ value: s.id, label: shiftLabel(st, sec, s.id) }))]}
                      />
                      {(() => {
                        const fora = domingosForaDoHabitual(st, e.id);
                        if (!fora.length) return null;
                        return (
                          <span className="mt-1 block text-[11.5px] text-muted" id={`dom-fora-${e.id}`}>
                            {fora.length} {fora.length === 1 ? "domingo está" : "domingos estão"} com outro horário escolhido à mão ·{" "}
                            <button
                              type="button"
                              className="underline hover:text-ink"
                              id={`dom-habitual-${e.id}`}
                              onClick={() => {
                                upd((x) => domingosNoHabitual(x, e.id));
                                sim.setToast(`${e.name || e.func}: ${fora.length} ${fora.length === 1 ? "domingo voltou" : "domingos voltaram"} para o turno habitual.`);
                              }}
                            >
                              usar o habitual em todos
                            </button>
                          </span>
                        );
                      })()}
                    </td>
                    {days.map((d) => {
                      const en = sundayEntry(sec, e.id, d);
                      const locked = sec.schedule[e.id]?.[d.date]?.lock;
                      if (en?.c === "D") worked++;
                      if (!en) {
                        const code = sec.schedule[e.id]?.[d.date]?.c;
                        return (
                          <td key={d.date} className="border-t border-line px-2 py-2 text-center">
                            <span className="inline-block rounded-md px-2 py-1.5 text-[12.5px]" style={codeStyle(code ?? "V")}>
                              {code === "A" ? "Falta" : code === "M" ? "Atestado" : "Férias"}
                            </span>
                          </td>
                        );
                      }
                      const sh = en.c === "D" ? dayShift(st, sec, e, d) : null;
                      return (
                        <td key={d.date} className="border-t border-line px-2 py-2">
                          <div className="relative rounded-lg p-1" style={codeStyle(en.c)}>
                            <select
                              id={`dom-${e.id}-${d.date}`}
                              aria-label={`${e.name || e.func}, domingo ${fmtDateBR(d.date)}`}
                              className="w-full rounded-md bg-transparent px-1.5 py-1 text-[12.5px] font-semibold outline-none"
                              style={{ color: "inherit" }}
                              value={en.c === "F" ? "F" : en.shiftId ?? "default"}
                              onChange={(ev) => setCell(e, d, ev.target.value)}
                            >
                              <option value="F">Folga</option>
                              <option value="default">Habitual: {shiftLabel(st, sec, employeeShift(st, sec, e, true).shift?.id ?? "") || "Turno de domingo"}</option>
                              <optgroup label="Turnos de domingo">
                                {special.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {shiftLabel(st, sec, s.id)}
                                  </option>
                                ))}
                              </optgroup>
                              {regular.length > 0 && (
                                <optgroup label="Horários da semana">
                                  {regular.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {shiftLabel(st, sec, s.id)}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                            {locked && <span className="pointer-events-none absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden title="Fixado à mão" />}
                          </div>
                          {sh && <div className="mt-1 text-center text-[11px] text-muted">{`${fmtTime(sh.start)}–${fmtTime(sh.end)}`}</div>}
                        </td>
                      );
                    })}
                    <td className="border-t border-line px-3 text-center font-semibold">
                      {worked}/{days.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2">
                <th scope="row" className="sticky left-0 z-10 bg-surface-2 border-t-2 border-r border-line px-3 py-2 text-left">
                  Trabalhando
                </th>
                <td className="border-t-2 border-line" />
                {days.map((d) => {
                  const n = all.filter((e) => sundayEntry(sec, e.id, d)?.c === "D").length;
                  const c = cov(d);
                  const peak = c ? Math.max(0, ...c.req) : 0;
                  const miss = c ? c.req.reduce((m, r, i) => Math.max(m, r - c.counts[i]), 0) : 0;
                  return (
                    <td key={d.date} className="border-t-2 border-line px-2 py-2 text-center">
                      <div className="text-[15px] font-bold">{n}</div>
                      {peak > 0 && <div className={`text-[11.5px] font-semibold ${miss > 0 ? "text-red" : "text-green"}`}>{miss > 0 ? `Falta ${miss} (pico ${peak})` : `Completo (pico ${peak})`}</div>}
                    </td>
                  );
                })}
                <td className="border-t-2 border-line" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {sundayAlerts.length > 0 && (
        <div className="mt-4 rounded-xl border border-pink-line bg-pink px-5 py-4 text-[13.5px]" role="alert">
          <div className="font-bold">Atenção às regras ({sundayAlerts.length})</div>
          <ul className="mt-1.5 list-disc pl-5 leading-relaxed">
            {sundayAlerts.slice(0, 8).map((x) => (
              <li key={x.id}>
                <b>{x.title}:</b> {x.text}
              </li>
            ))}
          </ul>
          {sundayAlerts.length > 8 && <div className="mt-1 text-muted">E mais {sundayAlerts.length - 8}. Veja todos na tela Escala.</div>}
        </div>
      )}
    </Card>
  );
}

function SundayPicker({ days, value, onChange, exclude, id }: { days: CalDay[]; value: string[]; onChange: (v: string[]) => void; exclude?: string; id: string }) {
  return (
    <div className="flex flex-wrap gap-2" id={id}>
      {days
        .filter((d) => d.date !== exclude)
        .map((d) => {
          const on = value.includes(d.date);
          return (
            <button key={d.date} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== d.date) : [...value, d.date])} className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${on ? "bg-navy text-navy-ink border-navy" : "bg-surface border-line text-muted hover:text-ink"}`}>
              Dom {fmtDateBR(d.date, false)}
              {on && " ✓"}
            </button>
          );
        })}
      <button type="button" className="text-[12.5px] underline text-muted hover:text-ink" onClick={() => onChange(days.filter((d) => d.date !== exclude).map((d) => d.date))}>
        Todos
      </button>
    </div>
  );
}

function CopySunday({ sec, days, empIds, onDone, write }: { sec: Sector; days: CalDay[]; empIds: string[]; onDone: () => void; write: (fn: (s: Sector) => Sector) => void }) {
  const sim = useSim();
  const [from, setFrom] = useState(days[0]?.date ?? "");
  const [to, setTo] = useState<string[]>([]);
  const fromDay = days.find((d) => d.date === from);
  const entries = useMemo(() => {
    const out: Record<string, SundayEntry> = {};
    if (!fromDay) return out;
    for (const id of empIds) {
      const e = sundayEntry(sec, id, fromDay);
      if (e) out[id] = e;
    }
    return out;
  }, [sec, empIds, fromDay]);
  const dest = days.filter((d) => to.includes(d.date));
  const preview = useMemo(() => applyToSundays(sec, entries, dest).changed, [sec, entries, dest]);
  const work = Object.values(entries).filter((e) => e.c === "D").length;
  return (
    <div className="mb-5 rounded-xl border border-navy-2 p-5" id="dom-copy">
      <div className="text-[15px] font-bold">Copiar a configuração de um domingo para outros</div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[13.5px]">
        Copiar o domingo
        <Select id="dom-copy-from" value={from} onChange={(v) => { setFrom(v); setTo((t) => t.filter((x) => x !== v)); }} options={days.map((d) => ({ value: d.date, label: fmtDateBR(d.date) }))} />
        <span className="text-muted">
          ({work} trabalham, {Object.keys(entries).length - work} folgam)
        </span>
      </div>
      <div className="mt-3 text-[12px] font-bold uppercase tracking-wide text-muted">Para</div>
      <div className="mt-1.5">
        <SundayPicker id="dom-copy-to" days={days} value={to} onChange={setTo} exclude={from} />
      </div>
      {dest.length > 0 && (
        <p className="mt-3 text-[13.5px]">
          Prévia: {dest.map((d) => `${fmtDateBR(d.date, false)}: ${preview[d.date] ?? 0} ${preview[d.date] === 1 ? "mudança" : "mudanças"}`).join(" · ")}. Quem está de férias ou com falta não muda. Os domingos copiados ficam fixos.
        </p>
      )}
      <div className="mt-3 flex gap-2.5">
        <ConfirmBtn
          kind="primary"
          label={`Copiar para ${dest.length} ${dest.length === 1 ? "domingo" : "domingos"}`}
          confirmLabel="Confirmar cópia (substitui esses domingos)"
          onConfirm={() => {
            if (!dest.length) return;
            write((s) => applyToSundays(s, entries, dest).sector);
            sim.setToast(`Domingo ${fmtDateBR(from, false)} copiado para ${dest.length} ${dest.length === 1 ? "domingo" : "domingos"}. Reorganize as folgas da semana se alguém ficou com folga a mais ou a menos.`);
            onDone();
          }}
        />
        <Btn onClick={onDone}>Cancelar</Btn>
      </div>
    </div>
  );
}

function Templates({ sec, days, empIds, write }: { sec: Sector; days: CalDay[]; empIds: string[]; write: (fn: (s: Sector) => Sector) => void }) {
  const sim = useSim();
  const [from, setFrom] = useState(days[0]?.date ?? "");
  const [name, setName] = useState("");
  const [applyTo, setApplyTo] = useState<Record<string, string[]>>({});
  const tpls = sec.sundayTemplates ?? [];
  const save = () => {
    const d = days.find((x) => x.date === from);
    if (!d) return;
    const t = templateFromSunday(sec, empIds, d, name || `Domingo ${fmtDateBR(d.date, false)}`);
    write((s) => ({ ...s, sundayTemplates: [...(s.sundayTemplates ?? []), t] }));
    setName("");
    sim.setToast(`Modelo "${t.name}" salvo.`);
  };
  return (
    <div className="mb-5 rounded-xl border border-navy-2 p-5" id="dom-tpl">
      <div className="text-[15px] font-bold">Modelos de domingo</div>
      <p className="mt-1 text-[13px] text-muted">Guarde a configuração de um domingo (quem trabalha, em qual turno, quem folga) e aplique em outros domingos quando quiser.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">A partir do domingo</span>
          <Select id="tpl-from" value={from} onChange={setFrom} options={days.map((d) => ({ value: d.date, label: fmtDateBR(d.date) }))} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Nome do modelo</span>
          <input id="tpl-name" className="field w-56" placeholder="Ex.: Domingo de movimento forte" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <Btn kind="primary" onClick={save} disabled={!from}>
          Salvar como modelo
        </Btn>
      </div>
      {tpls.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {tpls.map((t) => {
            const vals = Object.values(t.entries);
            const w = vals.filter((v) => v.c === "D").length;
            const sel = applyTo[t.id] ?? [];
            const dest = days.filter((d) => sel.includes(d.date));
            const entries = Object.fromEntries(Object.entries(t.entries).filter(([k]) => empIds.includes(k)));
            const changed = applyToSundays(sec, entries, dest).changed;
            return (
              <li key={t.id} className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-[13.5px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <b>{t.name}</b> <span className="text-muted">· {w} trabalham · {vals.length - w} folgam</span>
                  </span>
                  <ConfirmBtn label="Excluir" confirmLabel="Excluir modelo" onConfirm={() => write((s) => ({ ...s, sundayTemplates: (s.sundayTemplates ?? []).filter((x) => x.id !== t.id) }))} />
                </div>
                <div className="mt-2 text-[12px] font-bold uppercase tracking-wide text-muted">Aplicar em</div>
                <div className="mt-1">
                  <SundayPicker id={`tpl-to-${t.id}`} days={days} value={sel} onChange={(v) => setApplyTo({ ...applyTo, [t.id]: v })} />
                </div>
                {dest.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className="text-muted">{dest.map((d) => `${fmtDateBR(d.date, false)}: ${changed[d.date] ?? 0} mudança(s)`).join(" · ")}</span>
                    <ConfirmBtn
                      kind="primary"
                      label={`Aplicar em ${dest.length} ${dest.length === 1 ? "domingo" : "domingos"}`}
                      confirmLabel="Confirmar (substitui esses domingos)"
                      onConfirm={() => {
                        write((s) => applyToSundays(s, entries, dest).sector);
                        setApplyTo({ ...applyTo, [t.id]: [] });
                        sim.setToast(`Modelo "${t.name}" aplicado em ${dest.length} ${dest.length === 1 ? "domingo" : "domingos"}.`);
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
