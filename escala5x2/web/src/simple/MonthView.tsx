"use client";
// Aba "Mês": todos os dias do mês lado a lado, uma pessoa por linha — uma grade por loja selecionada.
import React, { useEffect, useMemo, useState } from "react";
import { useSim } from "../components/state";
import { Btn, Select } from "../components/ui";
import { Card, CardTitle } from "./SimpleApp";
import { buildDays, cellCode, dayShift, emBranco, employeeShift, isWorking } from "../engine/model";
import type { CalDay, Code, Employee, Sector, Store, StoreConfig } from "../engine/types";
import { fmtDateBR, fmtDur, fmtTime, weekStartOf, WEEKDAY_LONG, WEEKDAY_SHORT } from "../engine/time";
import { saveFile } from "../storage/storage";
import { cicloDosTimes, teamOf, teamOffOnSunday, teamOnSunday } from "./logic";
import { codeStyle, colorVars, inkRgb, rgbOf } from "./colors";
import { ColorLegend } from "./ColorPicker";
import { useStoreScope } from "./StoreScope";
import { tetoTurno } from "../engine/solver";
import { LimparEscalaPanel } from "./LimparEscala";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const ym = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} de ${key.slice(0, 4)}`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const shiftMonth = (key: string, n: number) => {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}`;
};
const daysInMonth = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate();

const CODE_LABEL: Record<Code, string> = { T: "Trabalho", D: "Trabalho (domingo/feriado)", F: "Folga", A: "Falta", M: "Atestado", V: "Férias", H: "Feriado" };
type MDay = CalDay & { inPeriod: boolean };
type SortKey = "cadastro" | "nome" | "turno" | "saida" | "folgas" | "dom" | "horas";

/** Dias do mês para uma loja (com as regras de calendário dela) e se estão no período planejado. */
function monthDays(cfg: StoreConfig, month: string): { days: MDay[]; pStart: string; pEnd: string; covered: boolean } {
  const period = buildDays(cfg);
  const pStart = period[0].date;
  const pEnd = period[period.length - 1].date;
  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const days = buildDays(cfg, `${month}-01`, 6)
    .filter((d) => d.date <= last)
    .map((d) => ({ ...d, inPeriod: d.date >= pStart && d.date <= pEnd }));
  return { days, pStart, pEnd, covered: days.every((d) => d.inPeriod) };
}

/** Amplia o planejamento da loja para cobrir o mês inteiro (até 8 semanas). */
function coverMonthCfg(cfg: StoreConfig, month: string): Pick<StoreConfig, "startDate" | "weeks"> {
  const { pStart, pEnd } = monthDays(cfg, month);
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const mStart = weekStartOf(first, cfg.weekStart ?? 1);
  const wk = (a: string, b: string) => Math.ceil((Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1) / 7);
  let start = mStart < pStart ? mStart : pStart;
  if (wk(start, last) > 8) start = mStart;
  const weeks = Math.min(8, Math.max(wk(start, last), start <= pStart ? Math.min(8, wk(start, pEnd)) : 0));
  return { startDate: start, weeks };
}

function rowStats(st: Store, sec: Sector, e: Employee, days: MDay[]) {
  let min = 0;
  let folgas = 0;
  let dom = 0;
  for (const d of days) {
    if (!d.inPeriod || emBranco(sec, e.id, d.date)) continue;
    const c = cellCode(sec, e.id, d);
    if (isWorking(c)) {
      min += dayShift(st, sec, e, d).workMin;
      if (d.weekday === 0) dom++;
    } else if (c === "F") folgas++;
  }
  return { min, folgas, dom };
}

export type DayTool = "folga" | "V" | "A" | "M";
export const DAY_TOOLS: [DayTool, string][] = [
  ["folga", "Trabalho ↔ folga"],
  ["V", "Férias"],
  ["A", "Falta"],
  ["M", "Atestado"],
];
/** Código do dia depois do clique: alterna trabalho/folga, ou marca/desmarca férias ou falta. */
export function nextCode(tool: DayTool, cur: Code, special: boolean): Code {
  const work: Code = special ? "D" : "T";
  if (tool === "folga") return cur === "F" || cur === "A" || cur === "M" || cur === "V" ? work : "F";
  return cur === tool ? work : tool;
}

export function MonthView({ refDate }: { refDate: string }) {
  const sim = useSim();
  const sc = useStoreScope("mes-store");
  const stores = sc.stores;
  const multi = stores.length > 1;
  const [monthRaw, setMonth] = useState<string | null>(null);
  const month = monthRaw ?? ym(refDate);
  const names = Array.from(new Set(stores.flatMap((st) => st.sectors.filter((s) => !s.hidden).map((s) => s.name))));
  const [secRaw, setSec] = useState<string>("page");
  const [tool, setTool] = useState<DayTool>("folga");
  const [limparOpen, setLimparOpen] = useState(false);
  const secName = secRaw !== "page" && names.includes(secRaw) ? secRaw : sim.sector.name;
  const [shiftF, setShiftF] = useState("all");
  const [funcF, setFuncF] = useState("all");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("turno");
  const [sortDesc, setSortDesc] = useState(false);
  const clickSort = (k: SortKey) => {
    if (sortKey === k) setSortDesc(!sortDesc);
    else {
      setSortKey(k);
      setSortDesc(false);
    }
  };

  // por loja: setor de mesmo nome, dias do mês, pessoas filtradas e ordenadas
  const blocks = stores.map((st) => {
    const sec = st.sectors.find((s) => s.name === secName && !s.hidden) ?? null;
    const md = monthDays(st.config, month);
    return { st, sec, ...md };
  });
  const shiftNames = Array.from(new Set(blocks.flatMap((b) => (b.sec ? b.sec.shifts.filter((s) => !s.special).map((s) => s.name) : []))));
  const funcs = Array.from(new Set(blocks.flatMap((b) => (b.sec ? b.st.employees.filter((e) => e.sectorId === b.sec!.id).map((e) => e.func.trim()) : [])).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const shiftOk = shiftNames.includes(shiftF) ? shiftF : "all";
  const funcOk = funcs.includes(funcF) ? funcF : "all";
  const listFor = (st: Store, sec: Sector, days: MDay[]) => {
    const filtered = st.employees.filter(
      (e) =>
        e.sectorId === sec.id &&
        (shiftOk === "all" || sec.shifts.find((s) => s.id === e.shiftId)?.name === shiftOk) &&
        (funcOk === "all" || e.func.trim() === funcOk) &&
        (!q.trim() || (e.name || e.func).toLowerCase().includes(q.trim().toLowerCase())),
    );
    const nm = (e: Employee) => (e.name || e.func).toLocaleLowerCase("pt-BR");
    if (sortKey === "cadastro") return sortDesc ? [...filtered].reverse() : filtered;
    const val = (e: Employee): number | string => {
      if (sortKey === "nome") return nm(e);
      if (sortKey === "turno" || sortKey === "saida") {
        const sh = employeeShift(st, sec, e, false);
        return sh.shift ? (sortKey === "turno" ? sh.start : sh.end) : 99999;
      }
      const r = rowStats(st, sec, e, days);
      return sortKey === "folgas" ? r.folgas : sortKey === "dom" ? r.dom : r.min;
    };
    const dir = sortDesc ? -1 : 1;
    return filtered
      .map((e) => ({ e, v: val(e) }))
      .sort((a, b) => {
        const c = typeof a.v === "string" ? a.v.localeCompare(b.v as string, "pt-BR") : a.v - (b.v as number);
        // empate pelo nome, no mesmo sentido (decrescente = lista invertida)
        return (c !== 0 ? c : nm(a.e).localeCompare(nm(b.e), "pt-BR")) * dir;
      })
      .map((x) => x.e);
  };
  const total = blocks.reduce((n, b) => n + (b.sec ? listFor(b.st, b.sec, b.days).length : 0), 0);

  // gerar escala inteligente: amplia o período de cada loja (se preciso) e gera o setor, uma loja por vez
  const [pending, setPending] = useState<string[]>([]);
  useEffect(() => {
    if (!pending.length || sim.running) return;
    const id = pending[0];
    const b = blocks.find((x) => x.st.id === id);
    if (!b || !b.sec) return setPending(pending.slice(1));
    if (!b.covered) return; // espera o período ser ampliado
    setPending(pending.slice(1));
    const name = `${multi ? `${b.st.name} · ` : ""}${b.sec.name}`;
    void sim.redistribute(b.sec.id, b.st.id).then(() => sim.setToast(`Escala de ${name} gerada. Os dias que você fixou à mão foram mantidos.`));
  }, [pending, blocks, sim, multi]);
  const generate = () => {
    const ids: string[] = [];
    for (const b of blocks) {
      if (!b.sec) continue;
      if (b.st.id === sim.store.id && b.sec.id !== sim.sector.id) sim.setSectorId(b.sec.id);
      if (!b.covered) sim.updateStoreById(b.st.id, (x) => ({ ...x, config: { ...x.config, ...coverMonthCfg(x.config, month) } }));
      ids.push(b.st.id);
    }
    setMonth(month);
    setPending(ids);
  };
  const cover = (st: Store) => {
    setMonth(month);
    sim.updateStoreById(st.id, (x) => ({ ...x, config: { ...x.config, ...coverMonthCfg(x.config, month) } }));
    sim.setToast(`Planejamento de ${st.name} ampliado para cobrir ${monthLabel(month)}. A escala dos dias novos foi gerada; o que já existia foi mantido.`);
  };

  const downloadPDF = async () => {
    try {
      const pages = blocks.filter((b) => b.sec).map((b) => ({ store: b.st, sec: b.sec!, days: b.days, empIds: listFor(b.st, b.sec!, b.days).map((e) => e.id) }));
      const blob = await monthPDF(pages, monthLabel(month));
      const r = await saveFile(`escala-${secName}-${month}${multi ? `-${pages.length}-lojas` : ""}.pdf`.toLowerCase().replace(/[^a-z0-9à-ú.-]+/gi, "-"), blob);
      sim.setToast(r === "saved" ? "PDF do mês gerado." : r === "declined" ? "Download cancelado." : "Não foi possível baixar o arquivo aqui.");
    } catch (err) {
      sim.setToast(`Falha ao gerar o arquivo: ${(err as Error).message}`);
    }
  };
  const busy = sim.running || pending.length > 0;

  return (
    <Card id="mes">
      <CardTitle
        sub={`Todos os dias do mês lado a lado${multi ? ", uma grade por loja selecionada" : ""}. Clique num dia para trocar trabalho por folga, ou lançar férias, falta ou atestado (escolha em “Ao clicar num dia”). O que você muda fica fixo, como na Semana.`}
        actions={
          <>
            <Btn className="self-start" onClick={downloadPDF}>Baixar mês (PDF)</Btn>
            <span className="flex flex-col items-stretch gap-2">
              <Btn kind="yellow" onClick={generate} disabled={busy} title="Refaz as folgas do setor respeitando todas as regras e o que você fixou à mão">
                {busy ? "Gerando…" : multi ? `Gerar escala inteligente (${blocks.filter((b) => b.sec).length} lojas)` : "Gerar escala inteligente"}
              </Btn>
              <span className="flex gap-2">
                <Btn kind="green" id="mes-limpar" className="flex-1" onClick={() => setLimparOpen(!limparOpen)} aria-expanded={limparOpen} disabled={busy} title="Apagar a escala dos meses que você escolher (os dias ficam em branco até gerar de novo)">
                  Limpar escala
                </Btn>
                <Btn id="mes-desfazer" onClick={() => sim.setToast(sim.desfazer() ? "Mudança desfeita: voltou a como estava antes." : "Não há nada para desfazer.")} disabled={!sim.podeDesfazer || busy} title="Volta a última mudança (atalho: Ctrl+Z)">
                  ↶ Desfazer
                </Btn>
              </span>
            </span>
          </>
        }
      >
        Mês
      </CardTitle>
      {limparOpen && (
        <div className="mb-4">
          <LimparEscalaPanel onClose={() => setLimparOpen(false)} sectorId={blocks.find((b) => b.st.id === sim.store.id)?.sec?.id} mes={month} />
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-xl bg-surface-2 px-5 py-4">
        <div className="flex flex-col gap-1">
          <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Mês</span>
          <div className="inline-flex items-center gap-2">
            <Btn onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior">
              ‹
            </Btn>
            <span className="min-w-[170px] text-center text-[15px] font-bold" id="mes-label">
              {cap(monthLabel(month))}
            </span>
            <Btn onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Próximo mês">
              ›
            </Btn>
          </div>
        </div>
        {sc.select && (
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Loja</span>
            {sc.select}
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Setor</span>
          <Select id="mes-sector" value={secName} onChange={(v) => setSec(v)} options={names.map((x) => ({ value: x, label: x }))} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Turno</span>
          <Select id="mes-shift" value={shiftOk} onChange={setShiftF} options={[{ value: "all", label: "Todos os turnos" }, ...shiftNames.map((x) => ({ value: x, label: x }))]} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Função</span>
          <Select id="mes-func" value={funcOk} onChange={setFuncF} options={[{ value: "all", label: "Todas" }, ...funcs.map((x) => ({ value: x, label: x }))]} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Buscar pessoa</span>
          <input id="mes-q" className="field w-44" placeholder="Nome" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Ordenar por</span>
          <Select
            id="mes-sort"
            value={sortKey}
            onChange={(v) => {
              setSortKey(v as SortKey);
              setSortDesc(false);
            }}
            options={[
              { value: "cadastro", label: "Ordem de cadastro" },
              { value: "nome", label: "Nome (A–Z)" },
              { value: "turno", label: "Turno (horário de entrada)" },
              { value: "saida", label: "Horário de saída" },
              { value: "folgas", label: "Folgas no mês" },
              { value: "dom", label: "Domingos trabalhados" },
              { value: "horas", label: "Horas no mês" },
            ]}
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Ordem</span>
          <div className="inline-flex rounded-xl border border-line overflow-hidden" role="radiogroup" aria-label="Ordem" id="mes-dir">
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
        <div className="flex flex-col gap-1">
          <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Ao clicar num dia</span>
          <div className="inline-flex rounded-xl border border-line overflow-hidden" role="radiogroup" aria-label="Ao clicar num dia" id="mes-tool">
            {DAY_TOOLS.map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={tool === k} onClick={() => setTool(k)} className={`px-3.5 py-2 text-[13px] font-semibold border-r border-line last:border-r-0 ${tool === k ? "bg-navy text-navy-ink" : "bg-surface hover:bg-surface-2"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <span className="pb-2 text-[13px] text-muted">
          {total} {total === 1 ? "pessoa" : "pessoas"}
          {multi ? ` em ${blocks.filter((b) => b.sec).length} lojas` : ""}
        </span>
      </div>

      <ColorLegend>
        <span>Passe o mouse num dia para ver o horário.</span>
      </ColorLegend>

      <div className="flex flex-col gap-6">
        {blocks.map((b) => (
          <div key={b.st.id} style={colorVars(b.st.config) as React.CSSProperties}>
            {(multi || b.st.id !== sim.store.id) && <h3 className="mb-2 text-[15px] font-bold">{b.st.name}</h3>}
            {!b.sec ? (
              <p className="rounded-xl border border-dashed border-line p-5 text-center text-[13.5px] text-muted">Esta loja não tem o setor {secName}.</p>
            ) : (
              <MonthGrid
                st={b.st}
                sec={b.sec}
                days={b.days}
                covered={b.covered}
                pStart={b.pStart}
                pEnd={b.pEnd}
                emps={listFor(b.st, b.sec, b.days)}
                month={month}
                sortKey={sortKey}
                sortDesc={sortDesc}
                clickSort={clickSort}
                onCover={() => cover(b.st)}
                tool={tool}
                busy={busy}
              />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function MonthGrid({
  st,
  sec,
  days,
  covered,
  pStart,
  pEnd,
  emps,
  month,
  sortKey,
  sortDesc,
  clickSort,
  onCover,
  busy,
  tool,
}: {
  st: Store;
  sec: Sector;
  days: MDay[];
  covered: boolean;
  pStart: string;
  pEnd: string;
  emps: Employee[];
  month: string;
  sortKey: SortKey;
  sortDesc: boolean;
  clickSort: (k: SortKey) => void;
  onCover: () => void;
  busy: boolean;
  tool: DayTool;
}) {
  const sim = useSim();
  const cfg = st.config;
  const first = `${month}-01`;
  // equipe do setor por turno habitual (12x36 fora): mostra quantos de cada turno trabalham em cada dia
  const porTurno = sec.shifts
    .filter((x) => !x.special)
    .map((x) => ({ id: x.id, nome: x.name, pessoas: st.employees.filter((e) => e.sectorId === sec.id && e.shiftId === x.id && e.regime !== "12x36") }))
    .filter((g) => g.pessoas.length > 0);
  const hasTeams = emps.some((e) => teamOf(e));
  const ciclo = cicloDosTimes(emps);
  const arrow = (k: SortKey) => (sortKey === k ? (sortDesc ? " ▼" : " ▲") : "");
  const ariaSort = (k: SortKey) => (sortKey === k ? (sortDesc ? "descending" : "ascending") : undefined);
  const sepCls = (d: MDay) => (d.weekday === (cfg.weekStart ?? 1) && d.date !== first ? "border-l-2 border-l-line" : "");
  const toggle = (empId: string, d: CalDay) => {
    if (d.closed) return;
    sim.updateStoreById(st.id, (x: Store) => ({
      ...x,
      sectors: x.sectors.map((s) => {
        if (s.id !== sec.id) return s;
        const cur = cellCode(s, empId, d);
        const c: Code = nextCode(tool, cur, d.special);
        return { ...s, schedule: { ...s.schedule, [empId]: { ...(s.schedule[empId] ?? {}), [d.date]: { ...(s.schedule[empId]?.[d.date] ?? {}), c, lock: true } } } };
      }),
    }));
    if (st.id === sim.store.id) {
      if (sec.id !== sim.sector.id) sim.setSectorId(sec.id);
      sim.noteManualEdit();
    }
  };
  return (
    <>
      {!covered && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pink-line bg-pink px-5 py-3.5 text-[13.5px]">
          <span>
            Parte deste mês está fora do período planejado ({fmtDateBR(pStart, false)} a {fmtDateBR(pEnd, false)}). Esses dias aparecem em branco.
          </span>
          <Btn kind="primary" onClick={onCover} disabled={busy}>
            Gerar escala do mês inteiro
          </Btn>
        </div>
      )}
      {!emps.length ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-[14px] text-muted">Ninguém encontrado com esses filtros.</p>
      ) : (
        <div className="cov-scroll rounded-xl border border-line" style={{ maxHeight: "min(72vh, 760px)" }} id={`mes-grid-${st.id}`}>
          <table className="border-collapse tnum text-[12.5px]" style={{ minWidth: "100%" }}>
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 bg-surface-2 th border-b border-r border-line" style={{ minWidth: 170 }} aria-sort={ariaSort("nome") ?? ariaSort("turno")}>
                  <button type="button" className="uppercase hover:text-ink" onClick={() => clickSort("nome")} title="Ordenar por nome">
                    Pessoa{arrow("nome")}
                  </button>
                  <span className="mx-1.5 text-line">|</span>
                  <button type="button" className="uppercase hover:text-ink" onClick={() => clickSort("turno")} title="Ordenar por turno (horário de entrada)">
                    Turno{arrow("turno")}
                  </button>
                </th>
                {days.map((d) => (
                  <th
                    key={d.date}
                    className={`sticky top-0 z-20 border-b border-line px-0.5 py-2 text-center font-semibold ${d.weekday === 0 ? "bg-cell-sun" : "bg-surface-2"} ${sepCls(d)}`}
                    style={{ minWidth: 34 }}
                    title={`${WEEKDAY_LONG[d.weekday]} ${fmtDateBR(d.date)}${d.holiday ? ` · ${d.holiday.name}` : ""}${d.closed ? " · loja fechada" : ""}`}
                  >
                    <span className="block text-[10.5px] font-semibold text-muted">{WEEKDAY_SHORT[d.weekday].slice(0, 1)}</span>
                    <span className={`block text-[13px] ${d.holiday ? "text-red" : "text-ink"}`}>{Number(d.date.slice(8, 10))}</span>
                    {hasTeams && d.weekday === 0 && !d.closed && (
                      <span className="block text-[10px] font-bold text-navy-2" title={`Trabalha${ciclo > 2 ? "m os times" : " o Time"} ${teamOnSunday(d.date, ciclo)}`}>
                        {ciclo > 2 ? `−${teamOffOnSunday(d.date, ciclo)}` : teamOnSunday(d.date)}
                      </span>
                    )}
                  </th>
                ))}
                <th className="sticky top-0 z-20 bg-surface-2 th border-b border-l border-line text-center" aria-sort={ariaSort("folgas")}>
                  <button type="button" className="uppercase hover:text-ink" onClick={() => clickSort("folgas")}>
                    Folgas{arrow("folgas")}
                  </button>
                </th>
                <th className="sticky top-0 z-20 bg-surface-2 th border-b border-line text-center" aria-sort={ariaSort("dom")}>
                  <button type="button" className="uppercase hover:text-ink" onClick={() => clickSort("dom")}>
                    Dom. trab.{arrow("dom")}
                  </button>
                </th>
                <th className="sticky top-0 z-20 bg-surface-2 th border-b border-line text-right" aria-sort={ariaSort("horas")}>
                  <button type="button" className="uppercase hover:text-ink" onClick={() => clickSort("horas")}>
                    Horas{arrow("horas")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {emps.map((e) => {
                const rs0 = rowStats(st, sec, e, days);
                const rs = employeeShift(st, sec, e, false);
                const shName = rs.shift ? `${rs.shift.name} · ${fmtTime(rs.start)}–${fmtTime(rs.end)}` : "";
                const team = teamOf(e);
                return (
                  <tr key={e.id} className="hover:bg-surface-2">
                    <th scope="row" className="sticky left-0 z-10 bg-surface border-t border-r border-line px-3 py-1.5 text-left font-semibold whitespace-nowrap">
                      {e.name || e.func}
                      {team && <TeamPill t={team} />}
                      <PlantaoPill e={e} />
                      <span className="block text-[11px] font-normal text-muted">{shName}</span>
                    </th>
                    {days.map((d) => {
                      if (!d.inPeriod)
                        return (
                          <td key={d.date} className={`border-t border-line p-0.5 ${sepCls(d)}`}>
                            <div className="h-[30px] rounded-md bg-[repeating-linear-gradient(45deg,transparent_0_4px,var(--line)_4px_5px)]" title="Fora do período planejado" />
                          </td>
                        );
                      if (emBranco(sec, e.id, d.date) && !d.closed)
                        return (
                          <td key={d.date} className={`border-t border-line p-0.5 ${sepCls(d)}`}>
                            <button
                              type="button"
                              data-branco
                              onClick={() => toggle(e.id, d)}
                              title={`${e.name || e.func} · ${fmtDateBR(d.date)}: em branco (escala limpa). Clique em Gerar escala para montar, ou clique aqui para lançar à mão.`}
                              aria-label={`${e.name || e.func}, ${fmtDateBR(d.date)}: em branco`}
                              className="block h-[30px] w-full rounded-md border border-dashed border-line bg-surface hover:outline hover:outline-2 hover:outline-focus"
                            />
                          </td>
                        );
                      const c = cellCode(sec, e.id, d);
                      const locked = sec.schedule[e.id]?.[d.date]?.lock;
                      const sh = isWorking(c) ? dayShift(st, sec, e, d) : null;
                      const tip = `${e.name || e.func} · ${WEEKDAY_LONG[d.weekday]} ${fmtDateBR(d.date)}: ${CODE_LABEL[c]}${sh ? ` ${sh.shift?.name ?? ""} ${fmtTime(sh.start)}–${fmtTime(sh.end)}${sh.breakEnd > sh.breakStart ? ` (intervalo ${fmtTime(sh.breakStart)}–${fmtTime(sh.breakEnd)})` : ""}` : ""}${locked ? " · fixado à mão" : ""}`;
                      return (
                        <td key={d.date} className={`border-t border-line p-0.5 ${sepCls(d)}`}>
                          <button
                            type="button"
                            disabled={d.closed}
                            onClick={() => toggle(e.id, d)}
                            title={tip}
                            aria-label={tip}
                            className={`relative block h-[30px] w-full rounded-md text-center text-[12px] leading-[30px] hover:outline hover:outline-2 hover:outline-focus ${c === "T" ? "border border-line" : ""} ${c === "F" || c === "A" || c === "M" ? "font-bold" : ""}`}
                            style={{ ...codeStyle(c), ...(sh?.shift?.color && isWorking(c) ? { boxShadow: `inset 0 -3px 0 ${sh.shift.color}` } : {}) }}
                          >
                            {c}
                            {locked && <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-current opacity-70" aria-hidden />}
                          </button>
                        </td>
                      );
                    })}
                    <td className="border-t border-l border-line px-2 text-center font-semibold">{rs0.folgas}</td>
                    <td className="border-t border-line px-2 text-center">{rs0.dom}</td>
                    <td className="border-t border-line px-3 text-right font-semibold whitespace-nowrap">{fmtDur(rs0.min)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="sticky left-0 z-10 bg-surface-2 border-t-2 border-r border-line px-3 py-2 text-left">
                  Trabalhando
                </th>
                {days.map((d) => (
                  <td key={d.date} className="border-t-2 border-line bg-surface-2 py-2 text-center font-bold">
                    {!d.inPeriod || d.closed ? "–" : emps.every((e) => emBranco(sec, e.id, d.date)) ? "" : emps.filter((e) => !emBranco(sec, e.id, d.date) && isWorking(cellCode(sec, e.id, d))).length}
                  </td>
                ))}
                <td className="border-t-2 border-line bg-surface-2" colSpan={3} />
              </tr>
              {porTurno.length > 1 &&
                porTurno.map((g) => (
                  <tr key={g.id} data-turno-linha={g.nome}>
                    <th scope="row" className="sticky left-0 z-10 bg-surface-2 border-r border-line px-3 py-1 text-left text-[12px] font-semibold text-muted whitespace-nowrap">
                      {g.nome} <span className="font-normal">({g.pessoas.length})</span>
                    </th>
                    {days.map((d) => {
                      if (!d.inPeriod || d.closed || d.special || g.pessoas.every((e) => emBranco(sec, e.id, d.date)))
                        return (
                          <td key={d.date} className="bg-surface-2 py-1 text-center text-[12px] text-muted" title={d.special && !d.closed ? "Domingo/feriado: todos usam o turno de domingo (veja em Domingos)" : undefined}>
                            {!d.inPeriod || d.closed ? "–" : d.special ? "·" : ""}
                          </td>
                        );
                      const folga = g.pessoas.filter((e) => cellCode(sec, e.id, d) === "F").length;
                      const trab = g.pessoas.filter((e) => !emBranco(sec, e.id, d.date) && isWorking(cellCode(sec, e.id, d))).length;
                      const demais = d.weekday !== 0 && folga > tetoTurno(g.pessoas.length);
                      return (
                        <td key={d.date} className={`bg-surface-2 py-1 text-center text-[12px] ${demais ? "font-bold text-red" : "text-muted"}`} title={`${g.nome}, ${fmtDateBR(d.date)}: ${trab} trabalhando, ${folga} de folga${demais ? ` (mais que o normal para um turno de ${g.pessoas.length})` : ""}`}>
                          {trab}
                        </td>
                      );
                    })}
                    <td className="bg-surface-2" colSpan={3} />
                  </tr>
                ))}
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}

/** PDF do mês (A4 deitado): uma página por loja, com a grade do setor. */
async function monthPDF(pages: { store: Store; sec: Sector; days: MDay[]; empIds: string[] }[], title: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  pages.forEach(({ store, sec, days, empIds }, i) => {
    if (i > 0) doc.addPage();
    const cfg = store.config;
    doc.setFontSize(15);
    doc.text(`Simulador Escala 5x2 · ${store.name} · ${sec.name}`, 28, 34);
    doc.setFontSize(10);
    doc.text(`Escala de ${title}  ·  T trabalho · D domingo/feriado · F folga · V férias · A falta`, 28, 50);
    const emps = empIds.map((id) => store.employees.find((e) => e.id === id)!).filter(Boolean);
    autoTable(doc, {
      startY: 60,
      margin: { left: 20, right: 20 },
      head: [["Pessoa", ...days.map((d) => `${WEEKDAY_SHORT[d.weekday].slice(0, 1)}\n${Number(d.date.slice(8, 10))}`), "Folgas", "Horas"]],
      body: emps.map((e) => {
        let min = 0;
        let f = 0;
        const cells = days.map((d) => {
          if (!d.inPeriod) return "";
          const c = cellCode(sec, e.id, d);
          if (isWorking(c)) min += dayShift(store, sec, e, d).workMin;
          if (c === "F") f++;
          return c;
        });
        return [e.name || e.func, ...cells, String(f), fmtDur(min)];
      }),
      styles: { fontSize: 7.5, cellPadding: 2.5, halign: "center", valign: "middle", lineColor: [224, 217, 236], lineWidth: 0.4 },
      headStyles: { fillColor: [61, 26, 110], textColor: [255, 255, 255], fontSize: 7 },
      columnStyles: { 0: { halign: "left", fontStyle: "bold", cellWidth: 110 } },
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index === 0 || data.column.index > days.length) return;
        const v = String(data.cell.raw);
        if (v === "F" || v === "D" || v === "V" || v === "A" || v === "M" || v === "H") {
          data.cell.styles.fillColor = rgbOf(cfg, v);
          data.cell.styles.textColor = v === "A" && !cfg.colors?.A ? [200, 40, 60] : inkRgb(cfg, v);
          if (v === "F" || v === "A" || v === "M") data.cell.styles.fontStyle = "bold";
        }
      },
    });
  });
  return doc.output("blob");
}

/** Selo do 12x36 (Plantão A ou B). */
export function PlantaoPill({ e }: { e: { regime?: string | null; plantaoFase?: 0 | 1; contratacao?: string | null; horasDia?: number | null; chave?: boolean } }) {
  const ctr = e.contratacao === "estagio" ? "Estágio" : e.contratacao === "aprendiz" ? "Aprendiz" : null;
  return (
    <>
      {e.regime === "12x36" && (
        <span className="ml-1.5 inline-block rounded-full border border-navy-2 px-1.5 py-px align-middle text-[10px] font-bold text-navy-2" title={`12x36 · Plantão ${e.plantaoFase === 1 ? "B" : "A"}: trabalha dia sim, dia não`}>
          12x36 {e.plantaoFase === 1 ? "B" : "A"}
        </span>
      )}
      {e.chave && (
        <span className="ml-1.5 inline-block rounded-full bg-amber px-1.5 py-px align-middle text-[10px] font-bold text-amber-ink" title="Pessoa-chave (Regras avançadas)" data-chave>
          Chave
        </span>
      )}
      {ctr && (
        <span className="ml-1.5 inline-block rounded-full border border-dashed border-navy-2 px-1.5 py-px align-middle text-[10px] font-bold text-navy-2" data-contratacao={e.contratacao} title={`${ctr === "Estágio" ? "Estagiário" : "Jovem aprendiz"}${e.horasDia ? ` · ${Math.floor(e.horasDia / 60)}h${e.horasDia % 60 ? String(e.horasDia % 60).padStart(2, "0") : ""} por dia` : ""}`}>
          {ctr}
          {e.horasDia && e.regime !== "12x36" ? ` ${Math.floor(e.horasDia / 60)}h${e.horasDia % 60 ? String(e.horasDia % 60).padStart(2, "0") : ""}` : ""}
        </span>
      )}
    </>
  );
}
const PILL: Record<string, string> = { A: "bg-navy text-navy-ink", B: "bg-yellow text-yellow-ink", C: "bg-green text-green-ink", D: "bg-amber text-amber-ink" };
export function TeamPill({ t }: { t: string }) {
  return (
    <span className={`ml-1.5 inline-block rounded-full px-1.5 py-px align-middle text-[10px] font-bold ${PILL[t] ?? "bg-surface-2 text-ink"}`} title={`Time ${t} de domingo`}>
      {t}
    </span>
  );
}
