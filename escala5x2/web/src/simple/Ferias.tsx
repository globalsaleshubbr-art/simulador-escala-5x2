"use client";
// Controle de férias: programar férias por período, mapa do ano, saldo e vencimentos, alertas.
import React, { useMemo, useState } from "react";
import { useSim } from "../components/state";
import { Btn, ConfirmBtn, Pill, Select } from "../components/ui";
import { Card, CardTitle, PageHead, type PageId } from "./SimpleApp";
import type { Store } from "../engine/types";
import { analyzeSector } from "../engine/analysis";
import { buildDays } from "../engine/model";
import { addDays, daysBetween, fmtDateBR, fmtNum, todayISO } from "../engine/time";
import { saveFile } from "../storage/storage";
import { StorePick, useStoreScope } from "./StoreScope";
import {
  DEFAULT_VAC,
  escolherMeses,
  mesDe,
  planoFerias,
  planoLancado,
  programadasAcimaDoLimite,
  overLimit,
  removeVacation,
  setVacation,
  vacInfo,
  vacRules,
  vacationConflicts,
  type VacBlock,
  type VacInfo,
} from "./vacations";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
type Situacao = "all" | "ferias" | "programadas" | "comMes" | "semMes";
const SITUACOES: { value: Situacao; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "ferias", label: "De férias hoje" },
  { value: "programadas", label: "Com férias lançadas" },
  { value: "comMes", label: "Com período programado" },
  { value: "semMes", label: "Sem período programado" },
];
/** período programado da pessoa (de/até), pelos dias de férias da loja quando falta o fim */
const plano = (i: VacInfo) => planoFerias(i.emp, vacRules(i.store.config).dias);
const passa = (st: Situacao) => (i: VacInfo) =>
  st === "all" ? true : st === "ferias" ? !!i.onVacation : st === "programadas" ? !!i.next : st === "comMes" ? !!plano(i) : !plano(i);
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
const periodTxt = (b: { start: string; end: string }) => `${fmtDateBR(b.start)} a ${fmtDateBR(b.end)}`;

type Form = { key: string; start: string; days: number; editing: VacBlock | null };

export function FeriasPage({ go }: { go: (p: PageId) => void }) {
  const sim = useSim();
  const sc = useStoreScope("vac-store");
  const stores = sc.stores;
  const multi = stores.length > 1;
  const today = todayISO();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const storeId: string = "all";
  const setStoreId = (v: string) => sc.setPick(v === "all" ? null : v);
  const [sector, setSector] = useState("all");
  const [shift, setShift] = useState("all");
  const [func, setFunc] = useState("all");
  const [status, setStatus] = useState<Situacao>("all");
  const [q, setQ] = useState("");
  const [form, setForm] = useState<Form>({ key: "", start: addDays(today, 30), days: vacRules(sim.store.config).dias, editing: null });
  // filtros do formulário: null = acompanham os filtros da tela
  const [formStore, setFormStore] = useState<string | null>(null);
  const [formSec, setFormSec] = useState<string | null>(null);
  const [allRows, setAllRows] = useState(false);

  const uniq = (xs: string[]) => Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const scope = stores.filter((st) => storeId === "all" || st.id === storeId);
  const sectorNames = uniq(scope.flatMap((st) => st.sectors.filter((s) => st.employees.some((e) => e.sectorId === s.id)).map((s) => s.name)));
  const fSector = sectorNames.includes(sector) ? sector : "all";
  const secScope = scope.flatMap((st) => st.sectors.filter((s) => fSector === "all" || s.name === fSector).map((s) => ({ st, s })));
  const shiftNames = uniq(secScope.flatMap(({ s }) => s.shifts.filter((x) => !x.special).map((x) => x.name)));
  const funcs = uniq(secScope.flatMap(({ st, s }) => st.employees.filter((e) => e.sectorId === s.id).map((e) => e.func)));
  const fShift = shiftNames.includes(shift) ? shift : "all";
  const fFunc = funcs.includes(func) ? func : "all";

  // todas as pessoas das lojas marcadas (para o formulário) e as filtradas (para a tela)
  const everyone = useMemo(
    // sem admissão: o controle é pelas férias programadas (saldo e vencimento não são calculados)
    () => stores.flatMap((st) => st.sectors.flatMap((sec) => st.employees.filter((e) => e.sectorId === sec.id).map((e) => vacInfo(st, sec, { ...e, admissao: null }, vacRules(st.config), today)))),
    [stores, today],
  );
  const qq = q.trim().toLowerCase();
  // filtros da tela, menos o setor (o mapa tem o seu próprio filtro de setor)
  const noSector = everyone
    .filter((i) => storeId === "all" || i.store.id === storeId)
    .filter((i) => fShift === "all" || i.shiftName === fShift)
    .filter((i) => fFunc === "all" || i.func === fFunc)
    .filter((i) => !qq || i.name.toLowerCase().includes(qq) || i.emp.matricula.includes(q.trim()))
    .filter(passa(status));
  const [mapSec, setMapSec] = useState<string | null>(null);
  const [tblSec, setTblSec] = useState<string | null>(null);
  const [mapStore, setMapStore] = useState("all");
  const [tblStore, setTblStore] = useState("all");
  const infos = everyone
    .filter((i) => storeId === "all" || i.store.id === storeId)
    .filter((i) => fSector === "all" || i.sector.name === fSector)
    .filter((i) => fShift === "all" || i.shiftName === fShift)
    .filter((i) => fFunc === "all" || i.func === fFunc)
    .filter((i) => !qq || i.name.toLowerCase().includes(qq) || i.emp.matricula.includes(q.trim()))
    .filter(passa(status));
  const filtering = fSector !== "all" || fShift !== "all" || fFunc !== "all" || status !== "all" || !!qq;
  const clear = () => {
    setSector("all");
    setShift("all");
    setFunc("all");
    setStatus("all");
    setQ("");
  };

  const base = everyone.filter((i) => (storeId === "all" || i.store.id === storeId) && (fSector === "all" || i.sector.name === fSector) && (fShift === "all" || i.shiftName === fShift) && (fFunc === "all" || i.func === fFunc));
  const k = {
    now: base.filter((i) => i.onVacation).length,
    soon: base.filter((i) => i.next && daysBetween(today, i.next.start) <= 90).length,
    comMes: base.filter((i) => !!plano(i)).length,
    semMes: base.filter((i) => !plano(i)).length,
  };
  const rulesNow = vacRules(sim.store.config);

  // alertas: problemas por pessoa + setores com gente demais de férias ao mesmo tempo
  const limitAlerts = scope.flatMap((st) => {
    const r = vacRules(st.config);
    return st.sectors
      .filter((s) => fSector === "all" || s.name === fSector)
      .flatMap((s) => [
        ...overLimit(st, s, r.maxSimultaneo).map((x) => `${multi ? `${st.name} · ` : ""}${s.name}: ${x.n} pessoas de férias ao mesmo tempo ${x.start === x.end ? `em ${fmtDateBR(x.start)}` : `de ${fmtDateBR(x.start)} a ${fmtDateBR(x.end)}`} (limite da loja: ${r.maxSimultaneo}).`),
        ...programadasAcimaDoLimite(st, s, r.maxSimultaneo, r.dias).map((x) => `${multi ? `${st.name} · ` : ""}${s.name}: contando as férias programadas, ${x.n} pessoas de férias ao mesmo tempo ${x.start === x.end ? `em ${fmtDateBR(x.start)}` : `de ${fmtDateBR(x.start)} a ${fmtDateBR(x.end)}`} (limite da loja: ${r.maxSimultaneo}).`),
      ]);
  });
  const personAlerts = infos.flatMap((i) => i.issues.map((t) => ({ who: i, t })));

  const updEmp = (st: Store, empId: string, patch: Record<string, unknown>) => sim.updateStoreById(st.id, (x) => ({ ...x, employees: x.employees.map((e) => (e.id === empId ? { ...e, ...patch } : e)) }));
  const openForm = (i: VacInfo, b?: VacBlock) => {
    setFormStore(null);
    setFormSec(null);
    const r = vacRules(i.store.config);
    // sem período escolhido: vem o período programado da pessoa (se ainda não passou)
    const pl = plano(i);
    const usa = pl && pl.ini > today;
    setForm(b ? { key: i.key, start: b.start, days: b.days, editing: b } : { key: i.key, start: usa ? pl!.ini : addDays(today, 30), days: usa ? pl!.dias : r.dias, editing: null });
    setTimeout(() => document.getElementById("vac-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const newForm = () => {
    setForm({ ...form, start: addDays(today, 30), days: rulesNow.dias, editing: null });
    setTimeout(() => document.getElementById("vac-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const exportXlsx = async () => {
    if (!infos.length) return sim.setToast("Ninguém na lista com esses filtros.");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Férias por pessoa");
      const h = ws.addRow(["Colaborador", "Matrícula", "Loja", "Setor", "Turno", "Função", "Férias programadas", "De férias agora", "Próximas férias"]);
      h.font = { bold: true };
      for (const i of infos)
        ws.addRow([i.name, i.emp.matricula, i.store.name, i.sector.name, i.shiftName, i.func, plano(i) ? periodTxt({ start: plano(i)!.ini, end: plano(i)!.fim }) : "", i.onVacation ? periodTxt(i.onVacation) : "", i.next ? periodTxt(i.next) : ""]);
      ws.columns.forEach((c, n) => (c.width = [28, 12, 20, 18, 16, 18, 18, 26, 26][n]));
      const ws2 = wb.addWorksheet("Períodos de férias");
      ws2.addRow(["Colaborador", "Loja", "Setor", "Início", "Fim", "Dias"]).font = { bold: true };
      for (const i of infos) for (const b of i.blocks) ws2.addRow([i.name, i.store.name, i.sector.name, fmtDateBR(b.start), fmtDateBR(b.end), b.days]);
      ws2.columns.forEach((c, n) => (c.width = [28, 20, 18, 12, 12, 8][n]));
      const buf = await wb.xlsx.writeBuffer();
      const r = await saveFile(`controle-de-ferias-${today}.xlsx`, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      sim.setToast(r === "saved" ? "Planilha de férias gerada." : r === "declined" ? "Download cancelado." : "Não foi possível baixar o arquivo aqui.");
    } catch (err) {
      sim.setToast(`Falha ao gerar o arquivo: ${(err as Error).message}`);
    }
  };

  // tabela de saldo: filtro de setor próprio (começa igual ao da tela)
  const tblBase = noSector.filter((i) => tblStore === "all" || !stores.some((x) => x.id === tblStore) || i.store.id === tblStore);
  const tblSecNames = Array.from(new Set(tblBase.map((i) => i.sector.name))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const tblSecRaw = tblSec ?? fSector;
  const tblSecF = tblSecRaw === "all" || tblSecNames.includes(tblSecRaw) ? tblSecRaw : "all";
  // ordem: quem não tem período primeiro, depois pelo início programado e pelo nome
  const sorted = tblBase.filter((i) => tblSecF === "all" || i.sector.name === tblSecF).sort((a, b) => (plano(a)?.ini ?? "").localeCompare(plano(b)?.ini ?? "") || a.name.localeCompare(b.name, "pt-BR"));
  /** grava o período programado; `de` sozinho completa o fim com os dias de férias da loja (ou mantém a duração) */
  const setPlano = (i: VacInfo, de: string | null, ate: string | null) => {
    if (!de) {
      updEmp(i.store, i.emp.id, { feriasDe: null, feriasAte: null, feriasMes: null });
      return sim.setToast(`${i.name}: sem férias programadas.`);
    }
    if (ate && ate < de) return sim.setToast("A data final precisa ser igual ou depois da inicial.");
    const fim = ate ?? addDays(de, vacRules(i.store.config).dias - 1);
    updEmp(i.store, i.emp.id, { feriasDe: de, feriasAte: fim, feriasMes: null });
    sim.setToast(`${i.name}: férias programadas de ${periodTxt({ start: de, end: fim })} (${plural(daysBetween(de, fim) + 1, "dia", "dias")}).`);
  };
  // escolha automática: só para quem ainda não tem período nem férias lançadas nos próximos 12 meses (lojas e setor da tabela)
  const semMesTbl = sorted.filter((i) => !plano(i) && !i.blocks.some((b) => b.end >= today && b.start < `${mesDe(today, 13)}-01`));
  const escolherAuto = () => {
    let total = 0;
    let acima = 0;
    const porLoja = new Map<string, Set<string>>();
    for (const i of semMesTbl) (porLoja.get(i.store.id) ?? porLoja.set(i.store.id, new Set()).get(i.store.id)!).add(i.sector.id);
    for (const [stId, secs] of porLoja) {
      const st = stores.find((x) => x.id === stId);
      if (!st) continue;
      const r = escolherMeses(st, today, vacRules(st.config).maxSimultaneo, secs, vacRules(st.config).dias);
      total += r.escolhidos;
      acima += r.acima;
      sim.updateStoreById(stId, (x) => ({ ...x, employees: x.employees.map((e) => r.store.employees.find((y) => y.id === e.id) ?? e) }));
    }
    sim.setToast(
      total
        ? `Férias programadas para ${plural(total, "pessoa", "pessoas")}, espalhando cada setor pelos próximos 12 meses.${acima ? ` Em ${plural(acima, "caso", "casos")} não coube no limite de pessoas do setor ao mesmo tempo.` : ""}`
        : "Todo mundo já tem férias programadas ou lançadas.",
    );
  };

  return (
    <>
      <PageHead
        title="Controle de férias"
        sub={`Programe de quando até quando vão as férias de cada pessoa (ou deixe o sistema escolher), lance na escala e veja quem sai quando${multi ? ` em ${stores.length} lojas` : ""}. As férias lançadas entram na escala como dias de férias (V).`}
        go={go}
        showSectors={false}
        actions={
          <>
            <Btn onClick={exportXlsx}>Baixar (Excel)</Btn>
            <Btn kind="primary" id="vac-new" onClick={newForm} disabled={!everyone.length}>
              Programar férias
            </Btn>
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-4" role="group" aria-label="Filtros das férias">
          {sc.select && <Field label="Loja">{sc.select}</Field>}
          <Field label="Setor">
            <Select id="vac-sector" value={fSector} onChange={setSector} options={[{ value: "all", label: "Todos" }, ...sectorNames.map((x) => ({ value: x, label: x }))]} />
          </Field>
          <Field label="Turno">
            <Select id="vac-shift" value={fShift} onChange={setShift} options={[{ value: "all", label: "Todos" }, ...shiftNames.map((x) => ({ value: x, label: x }))]} />
          </Field>
          <Field label="Função">
            <Select id="vac-func" value={fFunc} onChange={setFunc} options={[{ value: "all", label: "Todas" }, ...funcs.map((x) => ({ value: x, label: x }))]} />
          </Field>
          <Field label="Situação">
            <Select
              id="vac-status"
              value={status}
              onChange={(v) => setStatus(v as typeof status)}
              options={SITUACOES}
            />
          </Field>
          <Field label="Colaborador">
            <input id="vac-q" className="field w-44" placeholder="Nome ou matrícula" value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
          <span className="pb-2.5 text-[13px] text-muted">
            {plural(infos.length, "pessoa", "pessoas")}
            {filtering && (
              <>
                {" · "}
                <button type="button" className="underline hover:text-ink" onClick={clear}>
                  Limpar filtros
                </button>
              </>
            )}
          </span>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" id="vac-kpis">
        <Kpi label="De férias hoje" value={k.now} sub={fmtDateBR(today)} onClick={() => setStatus("ferias")} />
        <Kpi label="Saem nos próximos 90 dias" value={k.soon} sub="Com férias lançadas" onClick={() => setStatus("programadas")} />
        <Kpi label="Com férias programadas" value={k.comMes} sub="Período de … até escolhido" onClick={() => setStatus("comMes")} />
        <Kpi label="Sem férias programadas" value={k.semMes} sub="Escolha as datas ou use a escolha automática" tone={k.semMes ? "amber" : undefined} onClick={() => setStatus("semMes")} />
      </div>

      {everyone.length > 0 && <VacForm form={form} setForm={setForm} everyone={everyone} today={today} pageStore={storeId} pageSector={fSector} fStore={formStore} setFStore={setFormStore} fSec={formSec} setFSec={setFormSec} />}

      {(limitAlerts.length > 0 || personAlerts.length > 0) && (
        <Card id="vac-alerts">
          <CardTitle sub="Avisos pelas regras de férias da loja. Nada é mudado sozinho.">Atenção</CardTitle>
          <ul className="flex flex-col gap-2 text-[13.5px]">
            {limitAlerts.map((t) => (
              <li key={t} className="rounded-lg border border-pink-line bg-pink px-4 py-2.5">
                {t}
              </li>
            ))}
            {personAlerts.slice(0, 30).map(({ who, t }) => (
              <li key={who.key + t} className="rounded-lg border border-line px-4 py-2.5">
                <b>{who.name}</b>
                {multi ? ` (${who.store.name})` : ""}: {t}
              </li>
            ))}
            {personAlerts.length > 30 && <li className="text-muted">E mais {personAlerts.length - 30} avisos.</li>}
          </ul>
        </Card>
      )}

      <Timeline infos={noSector} stores={stores} store={mapStore} setStore={setMapStore} sector={mapSec ?? fSector} setSector={setMapSec} year={year} setYear={setYear} today={today} multi={multi} allRows={allRows} setAllRows={setAllRows} onBar={openForm} onPlan={(i) => openForm(i)} />

      <Card id="vac-table">
        <CardTitle
          sub="Escolha no calendário de quando até quando vão as férias de cada pessoa. É só planejamento: as férias entram na escala quando você lança em “Programar”."
          actions={
            <span className="flex flex-wrap items-center gap-3">
              <StorePick id="vac-tbl-store" stores={stores} value={tblStore} onChange={setTblStore} />
              <label className="inline-flex items-center gap-2 text-[13px] text-muted">
                Setor
                <Select id="vac-tbl-sector" value={tblSecF} onChange={setTblSec} options={[{ value: "all", label: "Todos" }, ...tblSecNames.map((x) => ({ value: x, label: x }))]} />
              </label>
              <span className="text-[13px] text-muted">{plural(sorted.length, "pessoa", "pessoas")}</span>
              <span id="vac-auto">
              <ConfirmBtn
                label="Escolher automaticamente"
                confirmLabel={semMesTbl.length ? `Escolher para ${plural(semMesTbl.length, "pessoa", "pessoas")}` : "Ninguém sem férias"}
                title="Para quem ainda não tem férias programadas nem lançadas nos próximos 12 meses: espalha cada setor pelos próximos 12 meses (começando no dia 1 ou 16), respeitando o máximo de pessoas do mesmo setor ao mesmo tempo e separando quem tem a mesma função. Quem já tem período não muda."
                onConfirm={escolherAuto}
              />
              </span>
            </span>
          }
        >
          Férias programadas
        </CardTitle>
        {!sorted.length ? (
          <p className="text-[14px] text-muted">Ninguém com esses filtros.</p>
        ) : (
          <div className="scroll-x">
            <table className="w-full text-[13.5px] tnum">
              <thead>
                <tr>
                  <th className="th">Colaborador</th>
                  <th className="th">Férias programadas (de … até)</th>
                  <th className="th">Férias lançadas</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((i) => {
                  const pl = plano(i);
                  const lancada = !!pl && planoLancado(i.blocks, pl);
                  return (
                    <tr key={i.key} data-pessoa={i.emp.id}>
                      <td className="td min-w-[170px]">
                        <span className="font-semibold">{i.name}</span>
                        <span className="block text-[12px] text-muted">{[multi ? i.store.name : "", i.sector.name, i.shiftName, i.func].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td className="td">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <input
                            type="date"
                            id={`vac-de-${i.emp.id}`}
                            className="field !py-1.5"
                            aria-label={`Férias de ${i.name}: de`}
                            value={pl?.ini ?? ""}
                            onChange={(e) => {
                              const de = e.target.value || null;
                              // mudar o início mantém a duração já escolhida
                              setPlano(i, de, de && pl ? addDays(de, pl.dias - 1) : null);
                            }}
                          />
                          <span className="text-[12.5px] text-muted">até</span>
                          <input
                            type="date"
                            id={`vac-ate-${i.emp.id}`}
                            className="field !py-1.5"
                            aria-label={`Férias de ${i.name}: até`}
                            value={pl?.fim ?? ""}
                            min={pl?.ini}
                            disabled={!pl}
                            onChange={(e) => e.target.value && pl && setPlano(i, pl.ini, e.target.value)}
                          />
                          {pl && (
                            <>
                              <span className="text-[12.5px] font-semibold tnum" id={`vac-dias-${i.emp.id}`}>
                                {plural(pl.dias, "dia", "dias")}
                              </span>
                              <button type="button" id={`vac-limpa-${i.emp.id}`} className="rounded px-1.5 text-[13px] text-muted hover:text-ink" aria-label={`Tirar as férias programadas de ${i.name}`} title="Tirar as férias programadas" onClick={() => setPlano(i, null, null)}>
                                ×
                              </button>
                            </>
                          )}
                        </span>
                        {lancada && <span className="mt-1 block text-[11.5px] font-semibold text-green">Lançadas na escala</span>}
                        {!!pl && !lancada && pl.fim < today && <span className="mt-1 block text-[11.5px] font-semibold text-amber-ink">Já passou sem férias lançadas</span>}
                      </td>
                      <td className="td min-w-[170px] text-[12.5px]">
                        {i.onVacation && <span className="block font-semibold">De férias até {fmtDateBR(i.onVacation.end, false)}</span>}
                        {i.next && <span className="block">Próximas: {periodTxt(i.next)}</span>}
                        {!i.onVacation && !i.next && <span className="text-muted">Nada lançado</span>}
                      </td>
                      <td className="td text-right">
                        <Btn onClick={() => openForm(i)}>Programar</Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <RulesCard />
    </>
  );
}

function Kpi({ label, value, sub, tone, onClick }: { label: string; value: number; sub: string; tone?: "red" | "amber"; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-line bg-surface px-5 py-4 text-left hover:border-navy-2" title="Clique para filtrar">
      <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className={`mt-2 text-[32px] font-bold leading-none tnum ${tone === "red" ? "text-red" : tone === "amber" ? "text-amber-ink" : ""}`}>{value}</div>
      <div className="mt-2 text-[12.5px] text-muted">{sub}</div>
    </button>
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

// ------------------------------------------------------------------ programar férias
function VacForm({
  form,
  setForm,
  everyone,
  today,
  pageStore,
  pageSector,
  fStore,
  setFStore,
  fSec,
  setFSec,
}: {
  form: Form;
  setForm: (f: Form) => void;
  everyone: VacInfo[];
  today: string;
  pageStore: string;
  pageSector: string;
  fStore: string | null;
  setFStore: (v: string | null) => void;
  fSec: string | null;
  setFSec: (v: string | null) => void;
}) {
  const sim = useSim();
  const [ok, setOk] = useState(false);
  // filtros próprios do formulário (começam iguais aos da tela)
  const storeSel = fStore ?? pageStore;
  const stores = Array.from(new Map(everyone.map((i) => [i.store.id, i.store])).values());
  const inStore = everyone.filter((i) => storeSel === "all" || i.store.id === storeSel);
  const secNames = Array.from(new Set(inStore.map((i) => i.sector.name))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const secSel = fSec ?? pageSector;
  const secF = secSel === "all" || secNames.includes(secSel) ? secSel : "all";
  const list = inStore.filter((i) => secF === "all" || i.sector.name === secF).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const who = list.find((i) => i.key === form.key) ?? list[0] ?? everyone.find((i) => i.key === form.key) ?? everyone[0];
  if (!who) return null;
  const st = who.store;
  const r = vacRules(st.config);
  const days = Math.max(1, Math.min(365, Math.round(form.days || r.dias)));
  const reset = () => {
    setOk(false);
    setForm({ key: who.key, start: addDays(today, 30), days: r.dias, editing: null });
  };
  // férias da pessoa que encostam no período escolhido (para alterar em vez de lançar de novo)
  const endSel = addDays(form.start, days - 1);
  const overlap = form.editing ? null : who.blocks.find((b) => b.start <= endSel && b.end >= form.start) ?? null;
  const upcoming = who.blocks.filter((b) => b.end >= today);
  const end = addDays(form.start, days - 1);
  // situação sem o período que está sendo alterado
  const secNow = form.editing ? removeVacation(who.sector, who.emp.id, form.editing) : who.sector;
  const conf = vacationConflicts(secNow, who.emp.id, form.start, days);
  const lim = overLimit({ ...st, sectors: st.sectors.map((s) => (s.id === secNow.id ? secNow : s)) }, secNow, r.maxSimultaneo, { empId: who.emp.id, start: form.start, days });
  const after = setVacation(secNow, who.emp.id, form.start, days);
  const stAfter = { ...st, sectors: st.sectors.map((s) => (s.id === after.id ? after : s)) };
  const infoAfter = vacInfo(stAfter, after, who.emp, r, today);
  const newIssues = infoAfter.issues.filter((t) => !who.issues.includes(t));
  // efeito na cobertura do período planejado
  const period = buildDays(st.config);
  const touches = period.length && form.start <= period[period.length - 1].date && end >= period[0].date;
  const cov = touches ? { before: analyzeSector({ ...st, sectors: st.sectors.map((s) => (s.id === secNow.id ? secNow : s)) }, who.sector.id).totals, after: analyzeSector(stAfter, who.sector.id).totals } : null;
  const needsOk = conf.faltas.length > 0 || conf.atestados.length > 0 || conf.fixed.length > 0;
  const save = () => {
    sim.updateStoreById(st.id, (x) => ({ ...x, sectors: x.sectors.map((s) => (s.id === who.sector.id ? setVacation(form.editing ? removeVacation(s, who.emp.id, form.editing) : s, who.emp.id, form.start, days) : s)) }));
    if (touches && st.id === sim.store.id) sim.noteManualEdit();
    sim.setToast(`Férias de ${who.name} lançadas: ${periodTxt({ start: form.start, end })} (${days} dias).${touches ? " Gere a escala de novo para reorganizar as folgas das outras pessoas." : ""}`);
    reset();
  };
  const remove = () => {
    if (!form.editing) return;
    sim.updateStoreById(st.id, (x) => ({ ...x, sectors: x.sectors.map((s) => (s.id === who.sector.id ? removeVacation(s, who.emp.id, form.editing!) : s)) }));
    sim.setToast(`Férias de ${who.name} (${periodTxt(form.editing)}) removidas. Os dias voltam para a escala normal; gere a escala para reorganizar as folgas.`);
    reset();
  };
  const multi = new Set(everyone.map((i) => i.store.id)).size > 1;
  return (
    <Card id="vac-form">
      <CardTitle sub="As férias entram na escala como dias de férias (fixados). Revise os avisos antes de lançar." actions={form.editing ? <Btn onClick={reset}>Programar outras férias</Btn> : undefined}>
        {form.editing ? `Alterar férias de ${who.name}` : "Programar férias"}
      </CardTitle>
      <div className="flex flex-wrap items-end gap-4">
        {multi && (
          <Field label="Loja">
            <Select
              id="vac-f-store"
              value={storeSel}
              onChange={(v) => {
                setFStore(v);
                setOk(false);
                setForm({ ...form, editing: null });
              }}
              options={[{ value: "all", label: "Todas" }, ...stores.map((x) => ({ value: x.id, label: x.name }))]}
            />
          </Field>
        )}
        <Field label="Setor">
          <Select
            id="vac-f-sector"
            value={secF}
            onChange={(v) => {
              setFSec(v);
              setOk(false);
              setForm({ ...form, editing: null });
            }}
            options={[{ value: "all", label: "Todos" }, ...secNames.map((x) => ({ value: x, label: x }))]}
          />
        </Field>
        <Field label={`Colaborador (${list.length})`}>
          <Select
            id="vac-who"
            value={who.key}
            onChange={(v) => {
              setOk(false);
              setForm({ ...form, key: v, editing: null });
            }}
            options={(list.length ? list : [who]).map((i) => ({ value: i.key, label: `${i.name}${secF === "all" ? ` — ${multi && storeSel === "all" ? `${i.store.name} · ` : ""}${i.sector.name}` : ""}` }))}
            className="max-w-[340px]"
          />
        </Field>
        <Field label="Início">
          <input id="vac-start" type="date" className="field" value={form.start} onChange={(e) => e.target.value && (setOk(false), setForm({ ...form, start: e.target.value }))} />
        </Field>
        <Field label="Dias corridos">
          <input id="vac-days" type="number" min={1} max={365} className="field w-24" placeholder={String(r.dias)} value={form.days ? form.days : ""} onChange={(e) => (setOk(false), setForm({ ...form, days: Number(e.target.value) }))} />
        </Field>
        <Field label="Volta ao trabalho">
          <div className="field !bg-surface-2 font-bold tnum">{fmtDateBR(addDays(end, 1))}</div>
        </Field>
      </div>
      <ul className="mt-4 flex flex-col gap-1.5 text-[13.5px]" id="vac-preview">
        <li>
          <b>{periodTxt({ start: form.start, end })}</b> · {plural(days, "dia", "dias")}
          {plano(who) && <span className="text-muted"> · programadas: {periodTxt({ start: plano(who)!.ini, end: plano(who)!.fim })}</span>}
        </li>
        {overlap && (
          <li className="text-amber-ink">
            {who.name} já tem férias de {periodTxt(overlap)} ({overlap.days} dias) nesse período.{" "}
            <button type="button" id="vac-edit-overlap" className="font-semibold underline" onClick={() => setForm({ ...form, start: overlap.start, days: overlap.days, editing: overlap })}>
              Alterar essas férias
            </button>
          </li>
        )}
        {conf.faltas.length > 0 && <li className="text-red">{plural(conf.faltas.length, "falta lançada", "faltas lançadas")} ({conf.faltas.map((d) => fmtDateBR(d, false)).join(", ")}) {conf.faltas.length === 1 ? "será trocada" : "serão trocadas"} por férias.</li>}
        {conf.atestados.length > 0 && <li className="text-red">{plural(conf.atestados.length, "dia de atestado", "dias de atestado")} ({conf.atestados.map((d) => fmtDateBR(d, false)).join(", ")}) {conf.atestados.length === 1 ? "será trocado" : "serão trocados"} por férias.</li>}
        {conf.fixed.length > 0 && <li className="text-amber-ink">{plural(conf.fixed.length, "dia fixado à mão será trocado", "dias fixados à mão serão trocados")} por férias.</li>}
        {lim.map((x) => (
          <li key={x.start} className="text-red">
            {who.sector.name} ficaria com {x.n} pessoas de férias ao mesmo tempo {x.start === x.end ? `em ${fmtDateBR(x.start)}` : `de ${fmtDateBR(x.start)} a ${fmtDateBR(x.end)}`} (limite: {r.maxSimultaneo}).
          </li>
        ))}
        {newIssues.map((t) => (
          <li key={t} className="text-amber-ink">
            {t}
          </li>
        ))}
        {cov && (
          <li className={cov.after.pct < cov.before.pct - 0.05 ? "text-amber-ink" : "text-muted"}>
            Cobertura de {who.sector.name} no período planejado: {fmtNum(cov.before.pct, 1)}% → {fmtNum(cov.after.pct, 1)}%{cov.after.deficitHoursPerWeek > cov.before.deficitHoursPerWeek ? ` (faltam mais ${fmtNum(cov.after.deficitHoursPerWeek - cov.before.deficitHoursPerWeek, 1)} h por semana)` : ""}.
          </li>
        )}
      </ul>
      {needsOk && (
        <label className="mt-3 inline-flex items-start gap-2.5 rounded-xl border border-pink-line bg-pink px-4 py-3 text-[13.5px]">
          <input type="checkbox" id="vac-ok" className="mt-1" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          Entendo que os dias listados acima serão trocados por férias.
        </label>
      )}
      <div className="mt-4 flex flex-wrap gap-2.5">
        <Btn kind="primary" id="vac-save" onClick={save} disabled={needsOk && !ok}>
          {form.editing ? "Salvar alteração" : "Lançar férias"}
        </Btn>
        {form.editing && <ConfirmBtn label="Remover estas férias" confirmLabel="Confirmar remoção" onConfirm={remove} />}
        <Btn onClick={reset}>Limpar</Btn>
      </div>
      {upcoming.length > 0 && (
        <div className="mt-4 border-t border-line pt-3 text-[13px]">
          <span className="text-muted">Férias de {who.name} já lançadas: </span>
          {upcoming.map((b, n) => (
            <React.Fragment key={b.start}>
              {n > 0 && " · "}
              <button type="button" className={`underline hover:text-ink ${form.editing?.start === b.start ? "font-bold" : ""}`} onClick={() => setForm({ ...form, start: b.start, days: b.days, editing: b })}>
                {periodTxt(b)} ({b.days} dias)
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ mapa do ano
function Timeline({ infos: allStores, stores, store, setStore, sector, setSector, year, setYear, today, multi, allRows, setAllRows, onBar, onPlan }: { infos: VacInfo[]; stores: Store[]; store: string; setStore: (v: string) => void; sector: string; setSector: (v: string) => void; year: number; setYear: (y: number) => void; today: string; multi: boolean; allRows: boolean; setAllRows: (v: boolean) => void; onBar: (i: VacInfo, b: VacBlock) => void; onPlan: (i: VacInfo) => void }) {
  const all = allStores.filter((i) => store === "all" || !stores.some((x) => x.id === store) || i.store.id === store);
  const secNames = Array.from(new Set(all.map((i) => i.sector.name))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const sec = sector === "all" || secNames.includes(sector) ? sector : "all";
  const infos = all.filter((i) => sec === "all" || i.sector.name === sec);
  const y0 = `${year}-01-01`;
  const y1 = `${year}-12-31`;
  const N = daysBetween(y0, y1) + 1;
  const inYear = (b: VacBlock) => b.end >= y0 && b.start <= y1;
  // férias programadas no ano, ainda não lançadas: aparecem tracejadas
  const progr = (i: VacInfo) => {
    const p = plano(i);
    return p && p.fim >= y0 && p.ini <= y1 && !planoLancado(i.blocks, p) ? p : null;
  };
  const chave = (i: VacInfo) => [i.blocks.find(inYear)?.start, progr(i)?.ini].filter(Boolean).sort()[0] ?? "9";
  const nPlano = infos.filter((i) => progr(i)).length;
  const rows = infos.filter((i) => allRows || i.blocks.some(inYear) || progr(i)).sort((a, b) => chave(a).localeCompare(chave(b)) || a.name.localeCompare(b.name, "pt-BR"));
  const [hover, setHover] = useState<string | null>(null);
  // quantas pessoas de férias em cada dia do ano
  const dens = new Array(N).fill(0);
  for (const i of rows)
    for (const b of i.blocks.filter(inYear)) {
      const a = Math.max(0, daysBetween(y0, b.start));
      const z = Math.min(N - 1, daysBetween(y0, b.end));
      for (let d = a; d <= z; d++) dens[d]++;
    }
  const peak = Math.max(0, ...dens);
  const peakDay = dens.indexOf(peak);
  const monthStarts = MONTHS.map((_, m) => daysBetween(y0, `${year}-${String(m + 1).padStart(2, "0")}-01`));
  const todayX = today >= y0 && today <= y1 ? (daysBetween(y0, today) / N) * 100 : null;
  const pctX = (d: string) => (Math.max(0, daysBetween(y0, d)) / N) * 100;
  return (
    <Card id="vac-map">
      <CardTitle
        sub="Cada barra cheia é um período de férias lançado na escala; tracejado é o período programado, ainda não lançado. Clique numa barra para alterar, remover ou lançar."
        actions={
          <span className="flex flex-wrap items-center gap-3">
            <StorePick id="vac-map-store" stores={stores} value={store} onChange={setStore} />
            <label className="inline-flex items-center gap-2 text-[13px] text-muted">
              Setor
              <Select id="vac-map-sector" value={sec} onChange={setSector} options={[{ value: "all", label: "Todos" }, ...secNames.map((x) => ({ value: x, label: x }))]} />
            </label>
            <label className="inline-flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={allRows} onChange={(e) => setAllRows(e.target.checked)} />
              Mostrar quem não tem férias no ano
            </label>
            <span className="inline-flex items-center gap-1.5">
              <Btn onClick={() => setYear(year - 1)} aria-label="Ano anterior">
                ‹
              </Btn>
              <b className="min-w-[52px] text-center text-[15px] tnum" id="vac-year">
                {year}
              </b>
              <Btn onClick={() => setYear(year + 1)} aria-label="Próximo ano">
                ›
              </Btn>
            </span>
          </span>
        }
      >
        Mapa de férias
      </CardTitle>
      <p className="mb-2 h-5 text-[13px] text-muted tnum" aria-live="polite">
        {hover ??
          [peak ? `Pico: ${plural(peak, "pessoa", "pessoas")} de férias em ${fmtDateBR(addDays(y0, peakDay))}` : `Nenhuma férias lançada em ${year} com esses filtros.`, nPlano ? `${plural(nPlano, "pessoa", "pessoas")} com férias programadas, ainda não lançadas (tracejado).` : ""].filter(Boolean).join(" ")}
      </p>
      <div className="scroll-x">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[200px_1fr] items-end">
            <span className="pb-1 text-[11.5px] font-bold uppercase tracking-wide text-muted">De férias por dia</span>
            <svg viewBox={`0 0 ${N} 40`} preserveAspectRatio="none" className="h-10 w-full" role="img" aria-label={`Pessoas de férias por dia em ${year}; pico de ${peak}`}>
              {dens.map((n, d) => (n ? <rect key={d} x={d} y={40 - (n / Math.max(1, peak)) * 38} width={1} height={(n / Math.max(1, peak)) * 38} fill="var(--yellow)" /> : null))}
            </svg>
          </div>
          <div className="grid grid-cols-[200px_1fr] border-b border-line">
            <span />
            <div className="relative h-6">
              {MONTHS.map((m, i) => (
                <span key={m} className="absolute top-1 text-[11.5px] text-muted" style={{ left: `calc(${(monthStarts[i] / N) * 100}% + 4px)` }}>
                  {m}
                </span>
              ))}
            </div>
          </div>
          {!rows.length && <p className="py-6 text-center text-[13.5px] text-muted">Ninguém de férias em {year}.</p>}
          {rows.map((i) => (
            <div key={i.key} className="grid grid-cols-[200px_1fr] items-center border-b border-line/60">
              <div className="truncate py-1.5 pr-3 text-[13px]" title={i.name}>
                <span className="font-semibold">{i.name}</span>
                <span className="block truncate text-[11.5px] text-muted">
                  <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: i.sector.color ?? "var(--yellow)" }} aria-hidden />
                  {[multi ? i.store.name : "", i.sector.name].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className="relative h-9">
                {monthStarts.map((x, m) => (
                  <span key={m} className="absolute inset-y-0 w-px bg-line" style={{ left: `${(x / N) * 100}%` }} aria-hidden />
                ))}
                {todayX != null && <span className="absolute inset-y-0 w-[2px] bg-ink/60" style={{ left: `${todayX}%` }} title={`Hoje, ${fmtDateBR(today)}`} aria-hidden />}
                {progr(i) &&
                  (() => {
                    const p = progr(i)!;
                    const ini = p.ini < y0 ? y0 : p.ini;
                    const fim = p.fim > y1 ? y1 : p.fim;
                    const txt = `${i.name}: férias programadas de ${periodTxt({ start: p.ini, end: p.fim })} (${p.dias} dias, ainda não lançadas)`;
                    return (
                      <button
                        type="button"
                        data-plano={p.ini}
                        className="absolute top-1.5 bottom-1.5 rounded-[4px] border-2 border-dashed text-[11px] font-semibold"
                        style={{ left: `${pctX(ini)}%`, width: `${((daysBetween(ini, fim) + 1) / N) * 100}%`, borderColor: "color-mix(in srgb, var(--c-V) 70%, var(--ink))", color: "var(--muted)" }}
                        onMouseEnter={() => setHover(txt)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(txt)}
                        onBlur={() => setHover(null)}
                        onClick={() => onPlan(i)}
                        aria-label={`${txt}. Lançar na escala`}
                        title={txt}
                      >
                        {((daysBetween(ini, fim) + 1) / N) * 100 > 4 ? `${p.dias}d` : ""}
                      </button>
                    );
                  })()}
                {i.blocks.filter(inYear).map((b) => {
                  const l = pctX(b.start < y0 ? y0 : b.start);
                  const w = Math.max(0.4, ((daysBetween(b.start < y0 ? y0 : b.start, b.end > y1 ? y1 : b.end) + 1) / N) * 100);
                  const txt = `${i.name}: ${periodTxt(b)} (${b.days} dias)`;
                  return (
                    <button
                      key={b.start}
                      type="button"
                      className="absolute top-1.5 bottom-1.5 rounded-[4px] text-[11px] font-semibold"
                      style={{ left: `${l}%`, width: `${w}%`, background: "var(--c-V)", color: "var(--c-V-ink)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--c-V) 55%, var(--ink))" }}
                      onMouseEnter={() => setHover(txt)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(txt)}
                      onBlur={() => setHover(null)}
                      onClick={() => onBar(i, b)}
                      aria-label={`${txt}. Alterar`}
                      title={txt}
                    >
                      {w > 4 ? `${b.days}d` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ regras
function RulesCard() {
  const sim = useSim();
  const r = vacRules(sim.store.config);
  const set = (patch: Partial<typeof r>) => sim.updateStore((s) => ({ ...s, config: { ...s.config, vacation: { ...(s.config.vacation ?? {}), ...patch } } }));
  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || min)));
  return (
    <Card id="vac-rules">
      <CardTitle sub={`Valem para ${sim.store.name} e só geram avisos: nada é bloqueado. Os valores iniciais seguem a regra geral da CLT; confira com o RH as regras da sua empresa e convenção coletiva.`}>Regras de férias da loja</CardTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Dias por período">
          <input id="vr-dias" type="number" className="field" min={1} max={60} value={r.dias} onChange={(e) => set({ dias: num(e.target.value, 1, 60) })} />
        </Field>
        <Field label="Menor parte (dias)">
          <input id="vr-min" type="number" className="field" min={1} max={60} value={r.minPeriodo} onChange={(e) => set({ minPeriodo: num(e.target.value, 1, 60) })} />
        </Field>
        <Field label="Uma parte com ao menos">
          <input id="vr-long" type="number" className="field" min={1} max={60} value={r.periodoLongo} onChange={(e) => set({ periodoLongo: num(e.target.value, 1, 60) })} />
        </Field>
        <Field label="Máximo de partes">
          <input id="vr-parts" type="number" className="field" min={1} max={12} value={r.maxPeriodos} onChange={(e) => set({ maxPeriodos: num(e.target.value, 1, 12) })} />
        </Field>
        <Field label="Máx. no mesmo setor ao mesmo tempo">
          <input id="vr-sim" type="number" className="field" min={0} max={99} placeholder="Sem limite" value={r.maxSimultaneo ?? ""} onChange={(e) => set({ maxSimultaneo: e.target.value === "" || Number(e.target.value) <= 0 ? null : num(e.target.value, 1, 99) })} />
        </Field>
      </div>
      <div className="mt-4">
        <Btn onClick={() => sim.updateStore((s) => ({ ...s, config: { ...s.config, vacation: undefined } }))} disabled={JSON.stringify(r) === JSON.stringify(DEFAULT_VAC)}>
          Voltar aos valores iniciais
        </Btn>
      </div>
    </Card>
  );
}
