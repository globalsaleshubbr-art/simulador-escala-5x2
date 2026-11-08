"use client";
// Painéis de faltas e de atestados: ranking dos colaboradores com filtros por loja, setor, turno, função, dia da semana e período.
import React, { useMemo, useState } from "react";
import { useSim } from "../components/state";
import { Btn, Select } from "../components/ui";
import { Card, CardTitle, PageHead, type PageId } from "./SimpleApp";
import { absenceRows, type AbsCode, groupTotals, ranks, sortRows, summarize, type AbsFilters, type AbsGroup, type AbsRow, type AbsSort } from "./absences";
import { addDays, fmtDateBR, fmtNum, todayISO, WEEKDAY_LONG, WEEKDAY_SHORT, WEEK_ORDER_MON } from "../engine/time";
import { buildDays } from "../engine/model";
import { saveFile } from "../storage/storage";
import { useStoreScope } from "./StoreScope";

type Preset = "tudo" | "planejado" | "mes" | "mes-ant" | "30" | "90" | "ano" | "custom";
const PRESETS: { value: Preset; label: string }[] = [
  { value: "tudo", label: "Todas as datas" },
  { value: "planejado", label: "Período planejado" },
  { value: "mes", label: "Este mês" },
  { value: "mes-ant", label: "Mês passado" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "ano", label: "Este ano" },
  { value: "custom", label: "Escolher datas…" },
];
const BAR = "var(--yellow)"; // cor de destaque do tema (série única)
const pctTxt = (x: number) => `${fmtNum(x * 100, 1)}%`;
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/** Textos de cada painel (faltas e atestados funcionam igual). */
const TXT = {
  A: {
    title: "Ranking de faltas",
    one: "falta",
    many: "faltas",
    Many: "Faltas",
    kpi: "Faltas",
    people: "Pessoas com falta",
    rate: "Taxa de faltas",
    top: "Quem mais faltou",
    dayMost: "Dia com mais faltas",
    none: "Nenhuma falta registrada",
    noneSub: "O ranking aparece assim que houver faltas lançadas.",
    tool: "Falta",
    step3: "Clique no dia em que a pessoa faltou. A falta fica fixada e entra neste ranking.",
    nobody: "Ninguém faltou com esses filtros.",
    showZero: "Mostrar quem não faltou",
    launch: "Lançar falta na escala",
    file: "ranking-de-faltas",
    col: "Faltas",
    colXls: "Faltas (dias)",
    last: "Última falta",
    seq: "faltas seguidas contam uma vez",
    nearOf: "das faltas",
    dates: "Datas das faltas de",
    chip: "A",
  },
  M: {
    title: "Ranking de atestados",
    one: "dia de atestado",
    many: "dias de atestado",
    Many: "Atestados",
    kpi: "Dias de atestado",
    people: "Pessoas com atestado",
    rate: "Taxa de atestados",
    top: "Quem mais teve atestado",
    dayMost: "Dia com mais atestados",
    none: "Nenhum atestado registrado",
    noneSub: "O ranking aparece assim que houver atestados lançados.",
    tool: "Atestado",
    step3: "Clique em cada dia coberto pelo atestado. O dia fica fixado e entra neste ranking.",
    nobody: "Ninguém teve atestado com esses filtros.",
    showZero: "Mostrar quem não teve atestado",
    launch: "Lançar atestado na escala",
    file: "ranking-de-atestados",
    col: "Dias",
    colXls: "Dias de atestado",
    last: "Último atestado",
    seq: "dias seguidos contam como um atestado",
    nearOf: "dos dias de atestado",
    dates: "Dias de atestado de",
    chip: "M",
  },
} as const;

export function FaltasPage({ go }: { go: (p: PageId) => void }) {
  return <AbsencePage go={go} kind="A" />;
}
export function AtestadosPage({ go }: { go: (p: PageId) => void }) {
  return <AbsencePage go={go} kind="M" />;
}

function AbsencePage({ go, kind }: { go: (p: PageId) => void; kind: AbsCode }) {
  const L = TXT[kind];
  const sim = useSim();
  const sc = useStoreScope("ft-store");
  const stores = sc.stores;
  const today = todayISO();
  const [preset, setPreset] = useState<Preset>("tudo");
  const [from, setFrom] = useState(addDays(today, -30));
  const [to, setTo] = useState(today);
  const storeId: string = "all";
  const setStoreId = (v: string) => sc.setPick(v === "all" ? null : v);
  const [sector, setSector] = useState("all");
  const [shift, setShift] = useState("all");
  const [func, setFunc] = useState("all");
  const [weekday, setWeekday] = useState(-1);
  const [q, setQ] = useState("");
  const [showZero, setShowZero] = useState(false);
  const [sortKey, setSortKey] = useState<AbsSort>("dias");
  const [desc, setDesc] = useState(true);
  const [groupBy, setGroupBy] = useState<AbsGroup>("setor");
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(25);

  const range = useMemo((): { from: string | null; to: string | null } => {
    const m0 = `${today.slice(0, 7)}-01`;
    switch (preset) {
      case "tudo":
        return { from: null, to: null };
      case "planejado": {
        const ds = stores.flatMap((st) => buildDays(st.config).map((d) => d.date)).sort();
        return { from: ds[0] ?? null, to: ds[ds.length - 1] ?? null };
      }
      case "mes":
        return { from: m0, to: addDays(`${addDays(m0, 32).slice(0, 7)}-01`, -1) };
      case "mes-ant": {
        const prev = `${addDays(m0, -1).slice(0, 7)}-01`;
        return { from: prev, to: addDays(m0, -1) };
      }
      case "30":
        return { from: addDays(today, -29), to: today };
      case "90":
        return { from: addDays(today, -89), to: today };
      case "ano":
        return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
      default:
        return from <= to ? { from, to } : { from: to, to: from };
    }
  }, [preset, from, to, today, stores]);

  // opções dos filtros a partir das lojas marcadas
  const scope = stores.filter((st) => storeId === "all" || st.id === storeId);
  const uniq = (xs: string[]) => Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const sectorNames = uniq(scope.flatMap((st) => st.sectors.filter((s) => !s.hidden || st.employees.some((e) => e.sectorId === s.id)).map((s) => s.name)));
  const scopeSecs = scope.flatMap((st) => st.sectors.filter((s) => sector === "all" || s.name === sector).map((s) => ({ st, s })));
  const shiftNames = uniq(scopeSecs.flatMap(({ s }) => s.shifts.filter((x) => !x.special).map((x) => x.name)));
  const funcs = uniq(scopeSecs.flatMap(({ st, s }) => st.employees.filter((e) => e.sectorId === s.id).map((e) => e.func)));
  const f: AbsFilters = {
    ...range,
    storeId: storeId !== "all" && stores.some((s) => s.id === storeId) ? storeId : "all",
    sector: sectorNames.includes(sector) ? sector : "all",
    shift: shiftNames.includes(shift) ? shift : "all",
    func: funcs.includes(func) ? func : "all",
    weekday,
    q,
  };
  const rows = useMemo(() => absenceRows(stores, f, kind), [kind, stores, f.from, f.to, f.storeId, f.sector, f.shift, f.func, f.weekday, f.q]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = useMemo(() => summarize(rows), [rows]);
  const everAny = useMemo(() => stores.some((st) => st.sectors.some((s) => Object.values(s.schedule).some((row) => Object.values(row).some((c) => c.c === kind)))), [stores, kind]);
  const listed = sortRows(showZero ? rows : rows.filter((r) => r.dates.length), sortKey, desc);
  const pos = ranks(listed, sortKey);
  const maxN = Math.max(1, ...listed.map((r) => r.dates.length));
  const groups = groupTotals(rows, groupBy);
  const filtering = preset !== "tudo" || f.sector !== "all" || f.shift !== "all" || f.func !== "all" || weekday >= 0 || !!q.trim();
  const clear = () => {
    setPreset("tudo");
    setSector("all");
    setShift("all");
    setFunc("all");
    setWeekday(-1);
    setQ("");
  };
  const multi = stores.length > 1;
  const top = listed[0];
  const worstDay = WEEK_ORDER_MON.reduce((b, d) => (sum.byWeekday[d] > sum.byWeekday[b] ? d : b), WEEK_ORDER_MON[0]);
  const sortBy = (k: AbsSort) => {
    if (k === sortKey) setDesc(!desc);
    else {
      setSortKey(k);
      setDesc(k !== "nome");
    }
  };
  const periodTxt = f.from && f.to ? `${fmtDateBR(f.from)} a ${fmtDateBR(f.to)}` : "todas as datas registradas";

  const exportXlsx = async () => {
    if (!listed.length) return sim.setToast("Nada para exportar com esses filtros.");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(L.title);
      ws.addRow([`${L.title} · ${periodTxt}`]);
      ws.addRow([`Filtros: ${[f.storeId !== "all" ? stores.find((s) => s.id === f.storeId)?.name : multi ? `${stores.length} lojas` : stores[0]?.name, f.sector !== "all" ? f.sector : "todos os setores", f.shift !== "all" ? `turno ${f.shift}` : "todos os turnos", f.func !== "all" ? f.func : "", weekday >= 0 ? WEEKDAY_LONG[weekday] : ""].filter(Boolean).join(" · ")}`]);
      ws.addRow([]);
      const head = ws.addRow(["Posição", "Colaborador", "Matrícula", "Loja", "Setor", "Turno", "Função", L.colXls, "Ocorrências", "Emendadas à folga", "Dias escalados", L.rate, L.last, "Datas"]);
      head.font = { bold: true };
      listed.forEach((r, i) =>
        ws.addRow([pos[i], r.name, r.emp.matricula, r.store.name, r.sector.name, r.shiftName, r.func, r.dates.length, r.occurrences, r.nearOff.length, r.scheduled, r.rate, r.last ? fmtDateBR(r.last) : "", r.dates.map((d) => fmtDateBR(d, false)).join(", ")]).getCell(12).numFmt = "0.0%",
      );
      ws.columns.forEach((c, i) => (c.width = [9, 28, 12, 20, 18, 16, 18, 13, 12, 17, 14, 13, 13, 60][i]));
      const buf = await wb.xlsx.writeBuffer();
      const r = await saveFile(`${L.file}-${today}.xlsx`, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      sim.setToast(r === "saved" ? `Planilha do ${L.title.toLowerCase()} gerada.` : r === "declined" ? "Download cancelado." : "Não foi possível baixar o arquivo aqui.");
    } catch (err) {
      sim.setToast(`Falha ao gerar o arquivo: ${(err as Error).message}`);
    }
  };

  return (
    <>
      <PageHead
        title={L.title}
        sub={`${L.Many} lançados na escala${multi ? ` de ${stores.length} lojas` : ` de ${stores[0]?.name ?? ""}`} · ${periodTxt}. Para lançar: Escala → Semana (ou Mês) → “${L.tool}” e clique no dia.`.replace("Faltas lançados", "Faltas lançadas")}
        go={go}
        showSectors={false}
        actions={
          <>
            <Btn onClick={exportXlsx}>Baixar ranking (Excel)</Btn>
            <Btn kind="primary" onClick={() => go("escala")}>
              {L.launch}
            </Btn>
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-4" role="group" aria-label={`Filtros: ${L.Many.toLowerCase()}`}>
          <Field label="Período">
            <Select id="ft-period" value={preset} onChange={(v) => setPreset(v as Preset)} options={PRESETS} />
          </Field>
          {preset === "custom" && (
            <>
              <Field label="De">
                <input id="ft-from" type="date" className="field" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
              </Field>
              <Field label="Até">
                <input id="ft-to" type="date" className="field" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
              </Field>
            </>
          )}
          {sc.select && <Field label="Loja">{sc.select}</Field>}
          <Field label="Setor">
            <Select id="ft-sector" value={f.sector} onChange={setSector} options={[{ value: "all", label: "Todos" }, ...sectorNames.map((x) => ({ value: x, label: x }))]} />
          </Field>
          <Field label="Turno">
            <Select id="ft-shift" value={f.shift} onChange={setShift} options={[{ value: "all", label: "Todos" }, ...shiftNames.map((x) => ({ value: x, label: x }))]} />
          </Field>
          <Field label="Função">
            <Select id="ft-func" value={f.func} onChange={setFunc} options={[{ value: "all", label: "Todas" }, ...funcs.map((x) => ({ value: x, label: x }))]} />
          </Field>
          <Field label="Dia da semana">
            <Select id="ft-wd" value={weekday} onChange={setWeekday} options={[{ value: -1, label: "Todos" }, ...WEEK_ORDER_MON.map((d) => ({ value: d, label: WEEKDAY_LONG[d] }))]} />
          </Field>
          <Field label="Colaborador">
            <input id="ft-q" className="field w-44" placeholder="Nome ou matrícula" value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
          {filtering && (
            <button type="button" className="pb-2.5 text-[13px] underline text-muted hover:text-ink" onClick={clear}>
              Limpar filtros
            </button>
          )}
        </div>
      </Card>

      {!everAny ? (
        <Card>
          <CardTitle sub={L.noneSub}>{L.none}</CardTitle>
          <ol className="list-decimal pl-5 text-[14px] leading-relaxed">
            <li>Abra a Escala e vá até a Semana (ou o Mês).</li>
            <li>No seletor “Ao clicar num dia”, escolha “{L.tool}”.</li>
            <li>{L.step3}</li>
          </ol>
          <div className="mt-4">
            <Btn kind="primary" onClick={() => go("escala")}>
              Ir para a Escala
            </Btn>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" id="ft-kpis">
            <Kpi label={L.kpi} value={String(sum.total)} sub={sum.total ? `${plural(sum.occurrences, "ocorrência", "ocorrências")} (${L.seq})` : "Nenhum registro com esses filtros"} hero />
            <Kpi label={L.people} value={`${sum.withAbs}`} sub={`De ${plural(sum.people, "pessoa", "pessoas")} (${pctTxt(sum.people ? sum.withAbs / sum.people : 0)})`} />
            <Kpi label={L.rate} value={pctTxt(sum.rate)} sub={`${sum.total} de ${sum.scheduled} dias escalados${sum.estimated ? ` (${sum.estimated} estimados: datas sem escala gravada)` : ""}`} />
            <Kpi label="Emendadas à folga" value={String(sum.nearOff)} sub={sum.total ? `${pctTxt(sum.nearOff / sum.total)} ${L.nearOf}, no dia antes ou depois de folga/feriado` : "No dia antes ou depois de folga"} />
          </div>

          {sum.total > 0 && (
            <p className="-mt-2 text-[13.5px] text-muted" id="ft-insight">
              {top && top.dates.length > 0 && (
                <>
                  {L.top}: <b className="text-ink">{top.name}</b> ({plural(top.dates.length, L.one, L.many)}
                  {multi ? `, ${top.store.name}` : ""}). {""}
                </>
              )}
              {L.dayMost}: <b className="text-ink">{WEEKDAY_LONG[worstDay]}</b> ({sum.byWeekday[worstDay]}).
            </p>
          )}

          <div className="grid gap-7 xl:grid-cols-2">
            <Card>
              <CardTitle sub={`Total de ${L.many} em cada dia da semana.`}>{L.Many} por dia da semana</CardTitle>
              <Columns id="ft-weekday" unit={[L.one, L.many]} items={WEEK_ORDER_MON.map((d) => ({ key: String(d), label: WEEKDAY_SHORT[d], long: WEEKDAY_LONG[d], n: sum.byWeekday[d] }))} labelAll />
            </Card>
            <Card>
              <CardTitle
                sub={`Total de ${L.many} e taxa (${L.many} ÷ dias escalados) de cada grupo.`}
                actions={
                  <label className="inline-flex items-center gap-2 text-[13px] text-muted">
                    Agrupar por
                    <Select
                      id="ft-group"
                      value={groupBy}
                      onChange={(v) => setGroupBy(v as AbsGroup)}
                      options={[{ value: "setor", label: "Setor" }, { value: "turno", label: "Turno" }, ...(multi ? [{ value: "loja", label: "Loja" }] : []), { value: "funcao", label: "Função" }] as { value: AbsGroup; label: string }[]}
                    />
                  </label>
                }
              >
                {L.Many} por {groupBy === "setor" ? "setor" : groupBy === "turno" ? "turno" : groupBy === "loja" ? "loja" : "função"}
              </CardTitle>
              <BarList id="ft-groups" unit={L.many} items={groups.slice(0, 10).map((g) => ({ key: g.label, label: g.label, n: g.n, note: `${pctTxt(g.scheduled ? g.n / g.scheduled : 0)} · ${plural(g.people, "pessoa", "pessoas")}` }))} />
              {groups.length > 10 && <p className="mt-2 text-[12.5px] text-muted">Mostrando os 10 grupos com mais {L.many} de {groups.length}.</p>}
            </Card>
          </div>

          {sum.byWeek.length > 1 && (
            <Card>
              <CardTitle sub="Cada coluna é uma semana (começando na segunda-feira).">{L.Many} por semana</CardTitle>
              <Columns id="ft-weeks" unit={[L.one, L.many]} items={sum.byWeek.map((w) => ({ key: w.week, label: fmtDateBR(w.week, false), long: `Semana de ${fmtDateBR(w.week)}`, n: w.n }))} />
            </Card>
          )}

          <Card id="ft-ranking">
            <CardTitle
              sub="Clique numa pessoa para ver as datas. Empates dividem a mesma posição."
              actions={
                <label className="inline-flex items-center gap-2 text-[13px]">
                  <input type="checkbox" id="ft-zero" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} />
                  {L.showZero}
                </label>
              }
            >
              {L.title}
            </CardTitle>
            {!listed.length ? (
              <p className="text-[14px] text-muted">{L.nobody}</p>
            ) : (
              <div className="scroll-x">
                <table className="w-full text-[13.5px] tnum">
                  <thead>
                    <tr>
                      <th className="th w-12 text-right">#</th>
                      <SortTh k="nome" cur={sortKey} desc={desc} onSort={sortBy}>
                        Colaborador
                      </SortTh>
                      <SortTh k="dias" cur={sortKey} desc={desc} onSort={sortBy} className="min-w-[200px]">
                        {L.col}
                      </SortTh>
                      <SortTh k="ocorrencias" cur={sortKey} desc={desc} onSort={sortBy} right>
                        Ocorrências
                      </SortTh>
                      <SortTh k="emendadas" cur={sortKey} desc={desc} onSort={sortBy} right>
                        Emendadas à folga
                      </SortTh>
                      <th className="th text-right">Dias escalados</th>
                      <SortTh k="taxa" cur={sortKey} desc={desc} onSort={sortBy} right>
                        Taxa
                      </SortTh>
                      <th className="th text-right">{L.last}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listed.slice(0, limit).map((r, i) => (
                      <RankRow key={r.key} L={L} r={r} pos={pos[i]} maxN={maxN} multi={multi} open={open === r.key} toggle={() => setOpen(open === r.key ? null : r.key)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {listed.length > limit && (
              <div className="mt-4">
                <Btn onClick={() => setLimit(limit + 50)}>Ver mais ({listed.length - limit})</Btn>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function RankRow({ L, r, pos, maxN, multi, open, toggle }: { L: (typeof TXT)[AbsCode]; r: AbsRow; pos: number; maxN: number; multi: boolean; open: boolean; toggle: () => void }) {
  const near = new Set(r.nearOff);
  return (
    <>
      <tr className={open ? "bg-surface-2" : ""}>
        <td className="td text-right font-bold text-muted">{r.dates.length ? `${pos}º` : "—"}</td>
        <td className="td">
          <button type="button" className="text-left hover:underline" aria-expanded={open} onClick={toggle} disabled={!r.dates.length}>
            <span className="font-semibold">{r.name}</span>
            <span className="block text-[12px] text-muted">{[multi ? r.store.name : "", r.sector.name, r.shiftName, r.func !== r.name ? r.func : ""].filter(Boolean).join(" · ")}</span>
          </button>
        </td>
        <td className="td">
          <div className="flex items-center gap-2.5" title={plural(r.dates.length, L.one, L.many)}>
            <span className="h-3 flex-1 max-w-[160px]" aria-hidden>
              {r.dates.length > 0 && <span className="block h-3 rounded-r" style={{ width: `${Math.max(4, (r.dates.length / maxN) * 100)}%`, background: BAR }} />}
            </span>
            <b className="w-8 text-right">{r.dates.length}</b>
          </div>
        </td>
        <td className="td text-right">{r.occurrences}</td>
        <td className="td text-right">{r.nearOff.length}</td>
        <td className="td text-right text-muted" title={r.estimated ? `${r.estimated} destes dias foram estimados (sem escala gravada)` : undefined}>{r.estimated ? "≈ " : ""}{r.scheduled}</td>
        <td className="td text-right font-semibold">{pctTxt(r.rate)}</td>
        <td className="td text-right text-muted">{r.last ? fmtDateBR(r.last, false) : "—"}</td>
      </tr>
      {open && (
        <tr>
          <td />
          <td colSpan={7} className="px-3 pb-4">
            <div className="flex flex-wrap gap-1.5" aria-label={`${L.dates} ${r.name}`}>
              {r.dates.map((d) => (
                <span key={d} className="rounded-md px-2 py-1 text-[12px] font-semibold" style={{ background: `var(--c-${L.chip})`, color: `var(--c-${L.chip}-ink)` }} title={near.has(d) ? "No dia antes ou depois de uma folga/feriado" : undefined}>
                  {WEEKDAY_SHORT[new Date(`${d}T12:00:00`).getDay()]} {fmtDateBR(d, false)}
                  {near.has(d) ? " · emendada" : ""}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SortTh({ k, cur, desc, onSort, children, right, className = "" }: { k: AbsSort; cur: AbsSort; desc: boolean; onSort: (k: AbsSort) => void; children: React.ReactNode; right?: boolean; className?: string }) {
  const on = cur === k;
  return (
    <th className={`th ${right ? "text-right" : ""} ${className}`} aria-sort={on ? (desc ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1.5 uppercase tracking-wide hover:text-ink ${on ? "text-ink" : ""}`} title="Clique para ordenar">
        {children}
        <span aria-hidden className="text-[10px]">{on ? (desc ? "▼" : "▲") : "↕"}</span>
      </button>
    </th>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-bold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

function Kpi({ label, value, sub, hero }: { label: string; value: string; sub: string; hero?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-6 py-5">
      <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className={`mt-2 font-bold leading-none tnum ${hero ? "text-[44px]" : "text-[32px]"}`}>{value}</div>
      <div className="mt-2 text-[13px] text-muted">{sub}</div>
    </div>
  );
}

/** Colunas de uma série (um tom), com valor ao passar o mouse. */
function Columns({ id, items, labelAll, unit }: { id: string; unit: readonly [string, string]; items: { key: string; label: string; long: string; n: number }[]; labelAll?: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...items.map((x) => x.n));
  const peak = items.reduce((b, x) => (x.n > b.n ? x : b), items[0]);
  const h = items.find((x) => x.key === hover);
  const H = 160;
  const many = items.length > 14;
  return (
    <div id={id}>
      <p className="mb-3 h-5 text-[13px] text-muted tnum" aria-live="polite">
        {h ? `${h.long}: ${plural(h.n, unit[0], unit[1])}` : `Maior: ${peak?.long} (${peak?.n ?? 0})`}
      </p>
      <div className="scroll-x">
        <div className="flex items-end gap-0.5 border-b border-line" style={{ height: H + 22, minWidth: many ? items.length * 26 : undefined }} role="img" aria-label={items.map((x) => `${x.long}: ${x.n}`).join(", ")}>
          {items.map((x) => {
            const bh = x.n ? Math.max(3, (x.n / max) * H) : 0;
            const showVal = x.n > 0 && (labelAll || items.length <= 12 || x.key === peak.key || x.key === hover);
            return (
              <div key={x.key} className="flex h-full flex-1 flex-col items-center justify-end" onMouseEnter={() => setHover(x.key)} onMouseLeave={() => setHover(null)} title={`${x.long}: ${x.n}`}>
                <span className="mb-1 text-[12px] font-semibold tnum" style={{ visibility: showVal ? "visible" : "hidden" }}>
                  {x.n}
                </span>
                <span className="block w-full max-w-[24px] rounded-t" style={{ height: bh, background: BAR, opacity: hover && hover !== x.key ? 0.45 : 1, transition: "opacity .15s" }} />
              </div>
            );
          })}
        </div>
        <div className="flex gap-0.5 pt-1.5" style={{ minWidth: many ? items.length * 26 : undefined }}>
          {items.map((x, i) => (
            <span key={x.key} className="flex-1 text-center text-[11.5px] text-muted tnum" style={{ visibility: !many || i % Math.ceil(items.length / 10) === 0 ? "visible" : "hidden" }}>
              {x.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Barras horizontais de uma série, valor na ponta. */
function BarList({ id, items, unit }: { id: string; unit: string; items: { key: string; label: string; n: number; note: string }[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...items.map((x) => x.n));
  if (!items.length) return <p className="text-[13.5px] text-muted">Sem dados com esses filtros.</p>;
  return (
    <ul id={id} className="flex flex-col gap-2.5">
      {items.map((x) => (
        <li key={x.key} className={`grid grid-cols-[minmax(90px,150px)_1fr] items-center gap-3 rounded-md ${hover === x.key ? "bg-surface-2" : ""}`} onMouseEnter={() => setHover(x.key)} onMouseLeave={() => setHover(null)} title={`${x.label}: ${x.n} ${unit} · ${x.note}`}>
          <span className="truncate text-[13px]">{x.label}</span>
          <span className="flex min-w-0 items-center gap-2">
            {x.n > 0 && <span className="block h-[18px] rounded-r" style={{ width: `${(x.n / max) * 70}%`, background: BAR, opacity: hover && hover !== x.key ? 0.45 : 1 }} aria-hidden />}
            <span className="shrink-0 text-[13px] tnum">
              <b>{x.n}</b> <span className="text-muted">· {x.note}</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
