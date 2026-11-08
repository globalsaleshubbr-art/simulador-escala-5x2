"use client";
import React, { useState } from "react";
import { configDoSetor } from "../engine/regrasSetor";
import { useSim } from "../components/state";
import { Btn, ConfirmBtn, DurInput, NumInput, Select, TextInput, TimeInput, WeekdayPicker, daysLabel } from "../components/ui";
import { Card, CardTitle, PageHead, type PageId } from "./SimpleApp";
import type { Employee, MinRule, Sector, Shift, Store } from "../engine/types";
import { matchSector } from "./Domingos";
import { useStoreScope } from "./StoreScope";
import { newEmployee } from "../engine/seed";
import { CONTRATACAO_NOME, CONTRATACAO_PADRAO, contratacaoDe, employeeShift, folgaFixaDomingo, folgasDe, folgasFixas, jornadaDe, nomeFolgas, intervaloPessoal, jornadaPessoal, shiftEnd, shiftWorkMin, type Contratacao } from "../engine/model";
import { fmtDur, fmtTime, toMin, uid, WEEKDAY_SHORT } from "../engine/time";
import { aplicarJornada, applyTeamsAll, deriveMovement, limparPessoa, folgasPadraoSetor, jornadaResumo, mudarContratacao, mudarFolgas, mudarRegime, novoPlantao, plantaoMenor, regimeTexto, regraDomingo, splitTeams, teamOf, teamOffOnSunday, teamOnSunday, teamPatch } from "./logic";
import { RegraDomingoEditor } from "./RegraDomingo";
import { ModeloSetorEditor } from "./ModeloSetor";
import { ImportarPlanilha } from "./ImportarPlanilha";
import { personalPDF } from "./pdfs";
import { clearUnlocked } from "../engine/solver";
import { ColorPicker } from "./ColorPicker";
import { CopyScalePanel } from "./CopyScale";
import { DEFAULT_BREAK_FLEX, validWindow } from "../engine/breaks";
import { almocoDoTurno, definirAlmoco, manterAlmoco, problemaAlmoco } from "../engine/almoco";
import { saveFile } from "../storage/storage";

// ------------------------------------------------------------------ Equipe
type EqSortKey = "cadastro" | "nome" | "turno" | "domingos" | "folga";
type EqFilters = { q: string; turno: string; func: string; dom: string; folga: string; regime?: string; contr?: string; sortKey: EqSortKey; sortDir: 1 | -1 };

// chave da regra de domingo: times A/B primeiro, depois ciclos
const domKey = (e: Employee) => {
  const t = teamOf(e);
  return t ? `0${t}` : `1${e.sundayCycle === 0 ? 9 : e.sundayCycle}`;
};
const domLabel = (k: string) => {
  if (k[0] === "0") return `Time ${k[1]}`;
  const c = Number(k.slice(1));
  return c === 9 ? "Não trabalha domingo" : c === 1 ? "Folga todo domingo" : `Folga a cada ${c} domingos`;
};
const empLabel = (e: Employee) => (e.name || e.func).trim();

/** Pessoas do setor na loja, já filtradas e ordenadas (só muda a visualização, nunca o cadastro). */
function teamRows(st: Store, sec: Sector, f: EqFilters) {
  const all = st.employees.filter((e) => e.sectorId === sec.id);
  const shiftOf = (e: Employee) => sec.shifts.find((x) => x.id === e.shiftId);
  const shiftStart = (e: Employee) => {
    const sh = shiftOf(e);
    return sh ? toMin(sh.start) : 99999;
  };
  const cmp: Record<EqSortKey, (a: Employee, b: Employee) => number> = {
    cadastro: (a, b) => all.indexOf(a) - all.indexOf(b),
    nome: (a, b) => empLabel(a).localeCompare(empLabel(b), "pt-BR", { sensitivity: "base" }),
    turno: (a, b) => shiftStart(a) - shiftStart(b) || empLabel(a).localeCompare(empLabel(b), "pt-BR"),
    domingos: (a, b) => domKey(a).localeCompare(domKey(b)) || empLabel(a).localeCompare(empLabel(b), "pt-BR"),
    folga: (a, b) => (a.fixedOff ?? 9) - (b.fixedOff ?? 9) || (a.fixedOff2 ?? 9) - (b.fixedOff2 ?? 9) || empLabel(a).localeCompare(empLabel(b), "pt-BR"),
  };
  const q = f.q.trim().toLowerCase();
  const emps = all
    .filter((e) => !q || empLabel(e).toLowerCase().includes(q) || e.matricula.includes(f.q.trim()))
    .filter((e) => f.turno === "all" || shiftOf(e)?.name === f.turno)
    .filter((e) => f.func === "all" || e.func.trim() === f.func)
    .filter((e) => f.dom === "all" || domKey(e) === f.dom)
    .filter((e) => f.folga === "all" || (f.folga === "none" ? e.fixedOff == null : folgasFixas(e).map(String).includes(f.folga)))
    .filter((e) => !f.regime || f.regime === "all" || (f.regime === "12x36" ? e.regime === "12x36" : f.regime.startsWith("j:") ? e.regime !== "12x36" && e.jornadaId === f.regime.slice(2) : e.regime !== "12x36" && !jornadaDe(st.config, e) && (f.regime === "loja" || `f${folgasDe(st, e)}` === f.regime)))
    .filter((e) => !f.contr || f.contr === "all" || contratacaoDe(e) === f.contr)
    .sort((a, b) => cmp[f.sortKey](a, b) * f.sortDir);
  return { all, emps };
}

export function EquipePage({ go }: { go: (p: PageId) => void }) {
  const sim = useSim();
  const { store, sector } = sim;
  const [sortKey, setSortKey] = useState<EqSortKey>("cadastro");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [fNome, setFNome] = useState("");
  const [fTurno, setFTurno] = useState("all");
  const [fFunc, setFFunc] = useState("all");
  const [fDom, setFDom] = useState("all");
  const [fFolga, setFFolga] = useState("all");
  const [fRegime, setFRegime] = useState("all");
  const [fContr, setFContr] = useState("all");
  const [bulk, setBulk] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const sc = useStoreScope("eq-store");
  const filtering = !!fNome.trim() || fTurno !== "all" || fFunc !== "all" || fDom !== "all" || fFolga !== "all" || fRegime !== "all" || fContr !== "all";
  const clearFilters = () => {
    setFNome("");
    setFTurno("all");
    setFFunc("all");
    setFDom("all");
    setFFolga("all");
    setFRegime("all");
    setFContr("all");
  };
  // a loja em edição usa o setor aberto; as outras, o setor com o mesmo nome
  const blocks = sc.stores
    .map((st) => ({ st, sec: st.id === store.id ? sector : matchSector(st, sector.name) }))
    .filter((b): b is { st: Store; sec: Sector } => !!b.sec);
  const multi = sc.stores.length > 1;
  const everyone = blocks.flatMap((b) => b.st.employees.filter((e) => e.sectorId === b.sec.id));
  const shiftNames = Array.from(new Set(blocks.flatMap((b) => b.sec.shifts.filter((s) => !s.special).map((s) => s.name.trim())))).filter(Boolean);
  const funcs = Array.from(new Set(everyone.map((e) => e.func.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const domOptions = Array.from(new Set(everyone.map(domKey))).sort();
  const f: EqFilters = {
    q: fNome,
    turno: shiftNames.includes(fTurno) ? fTurno : "all",
    func: funcs.includes(fFunc) ? fFunc : "all",
    dom: fDom,
    folga: fFolga,
    regime: fRegime,
    contr: fContr,
    sortKey,
    sortDir,
  };
  const rows = blocks.map((b) => ({ ...b, ...teamRows(b.st, b.sec, f) }));
  const shown = rows.reduce((n, r) => n + r.emps.length, 0);
  // com uma loja só no filtro, "+ Pessoa" cadastra nela; senão, na loja em edição
  const target = sc.stores.length === 1 ? sc.stores[0] : store;
  const targetSec = target.id === store.id ? sector : matchSector(target, sector.name);
  const add = (names: string[]) => {
    if (!targetSec) return sim.setToast(`${target.name} não tem o setor ${sector.name}.`);
    setFNome("");
    setFTurno("all");
    setFFunc("all");
    setFDom("all");
    setFFolga("all");
    sim.updateStoreById(target.id, (st) => {
      const sec = st.sectors.find((s) => s.id === targetSec.id)!;
      const base = st.employees.filter((e) => e.sectorId === sec.id).length;
      const list = names.map((n, i) => ({ ...newEmployee(sec, base + i + 1), name: n.trim() }));
      const next = applyTeamsAll({ ...st, employees: [...st.employees, ...list] }, { sectorId: sec.id });
      // setor em 12x36: quem entra vai para o plantão com menos gente
      if (sec.modeloEscala === "12x36") return list.reduce((x, e) => mudarRegime(x, e.id, plantaoMenor(x, sec.id)), next);
      // setor com jornada cadastrada: quem entra segue a mesma jornada
      if (sec.jornadaId && st.config.jornadas?.some((j) => j.id === sec.jornadaId)) return list.reduce((x, e) => aplicarJornada(x, e.id, sec.jornadaId!), next);
      return next;
    });
  };
  const sortBy = (k: EqSortKey) => {
    if (k === sortKey) setSortDir(sortDir === 1 ? -1 : 1);
    else {
      setSortKey(k);
      setSortDir(1);
    }
  };

  return (
    <>
      <PageHead
        title={`Equipe · ${sector.name}`}
        sub={multi ? `Mostrando ${blocks.length} de ${sc.stores.length} lojas. “+ Pessoa” cadastra em ${store.name} (a loja em edição).` : sc.stores.length === 1 && target.id !== store.id ? `Mostrando ${target.name}. “+ Pessoa” cadastra nesta loja.` : "Nome, turno, como a pessoa folga aos domingos e se tem folga fixa. O resto fica em “mais detalhes”."}
        go={go}
        actions={
          <>
            <Btn
              title="Uma página por pessoa (as que aparecem na lista), com o período todo"
              onClick={async () => {
                const items = rows.flatMap((r) => r.emps.map((e) => ({ store: r.st, emp: e })));
                if (!items.length) return sim.setToast("Ninguém na lista com esses filtros.");
                try {
                  const blob = await personalPDF(items);
                  const r = await saveFile(`escala-individual-${sector.name}-${items.length}-pessoas.pdf`.toLowerCase().replace(/[^a-z0-9à-ú.-]+/gi, "-"), blob);
                  sim.setToast(r === "saved" ? `PDF com ${items.length} ${items.length === 1 ? "escala" : "escalas"} individuais gerado.` : r === "declined" ? "Download cancelado." : "Não foi possível baixar o arquivo aqui.");
                } catch (err) {
                  sim.setToast(`Falha ao gerar o arquivo: ${(err as Error).message}`);
                }
              }}
            >
              Escala por pessoa (PDF)
            </Btn>
            <Btn onClick={() => setImportando(!importando)} id="eq-importar">
              Importar planilha
            </Btn>
            <Btn onClick={() => setBulk(bulk === null ? "" : null)}>Adicionar várias</Btn>
            <Btn kind="primary" onClick={() => add([""])} title={multi ? `Cadastra em ${store.name}` : undefined}>
              + Pessoa
            </Btn>
          </>
        }
      />
      {importando && <ImportarPlanilha onClose={() => setImportando(false)} />}
      {bulk !== null && (
        <Card>
          <CardTitle sub={`Cole ou digite um nome por linha. Os turnos são distribuídos em rodízio e você ajusta depois.${multi ? ` As pessoas entram em ${store.name}.` : ""}`}>Adicionar várias pessoas</CardTitle>
          <textarea id="bulk-names" className="field w-full min-h-[140px] text-[14px]" placeholder={"Maria Souza\nJoão Lima\nAna Paula"} value={bulk} onChange={(e) => setBulk(e.target.value)} />
          <div className="mt-3 flex gap-2.5">
            <Btn
              kind="primary"
              onClick={() => {
                const names = bulk.split(/\n+/).map((s) => s.trim()).filter(Boolean);
                if (names.length) add(names);
                setBulk(null);
              }}
            >
              Adicionar {bulk.split(/\n+/).filter((s) => s.trim()).length || ""} pessoa(s)
            </Btn>
            <Btn onClick={() => setBulk(null)}>Cancelar</Btn>
          </div>
        </Card>
      )}
      {(everyone.length > 0 || sc.select) && (
        <Card>
          <div className="flex flex-wrap items-end gap-4" role="group" aria-label="Ordenar e filtrar a equipe">
            {sc.select && <Field label="Loja">{sc.select}</Field>}
            <Field label="Buscar">
              <input id="eq-q" className="field w-48" placeholder="Nome ou matrícula" value={fNome} onChange={(e) => setFNome(e.target.value)} />
            </Field>
            <Field label="Turno">
              <Select id="eq-turno" value={f.turno} onChange={setFTurno} options={[{ value: "all", label: "Todos" }, ...shiftNames.map((x) => ({ value: x, label: x }))]} />
            </Field>
            <Field label="Função">
              <Select id="eq-func" value={f.func} onChange={setFFunc} options={[{ value: "all", label: "Todas" }, ...funcs.map((x) => ({ value: x, label: x }))]} />
            </Field>
            <Field label="Domingos">
              <Select id="eq-dom" value={fDom} onChange={setFDom} options={[{ value: "all", label: "Todos" }, ...domOptions.map((c) => ({ value: String(c), label: domLabel(c) }))]} />
            </Field>
            <Field label="Folga fixa">
              <Select id="eq-folga" value={fFolga} onChange={setFFolga} options={[{ value: "all", label: "Todas" }, { value: "none", label: "Sem folga fixa" }, ...[0, 1, 2, 3, 4, 5, 6].map((d) => ({ value: String(d), label: WEEKDAY_SHORT[d] }))]} />
            </Field>
            <Field label="Regime">
              <Select id="eq-regime" value={fRegime} onChange={setFRegime} options={[{ value: "all", label: "Todos" }, { value: "f2", label: "5x2" }, { value: "f1", label: "6x1" }, ...(store.config.jornadas ?? []).map((j) => ({ value: `j:${j.id}`, label: j.nome })), { value: "12x36", label: "12x36" }]} />
            </Field>
            <Field label="Contratação">
              <Select id="eq-contr" value={fContr} onChange={setFContr} options={[{ value: "all", label: "Todas" }, { value: "clt", label: "CLT" }, { value: "estagio", label: "Estagiários" }, { value: "aprendiz", label: "Jovens aprendizes" }]} />
            </Field>
            <Field label="Ordenar por">
              <span className="flex gap-2">
                <Select
                  id="eq-sort"
                  value={sortKey}
                  onChange={(v) => {
                    setSortKey(v as EqSortKey);
                    setSortDir(1);
                  }}
                  options={[
                    { value: "cadastro", label: "Ordem de cadastro" },
                    { value: "nome", label: "Nome (A–Z)" },
                    { value: "turno", label: "Turno (horário de entrada)" },
                    { value: "domingos", label: "Domingos" },
                    { value: "folga", label: "Folga fixa" },
                  ]}
                />
                <Btn onClick={() => setSortDir(sortDir === 1 ? -1 : 1)} aria-label={sortDir === 1 ? "Crescente" : "Decrescente"} title={sortDir === 1 ? "Crescente" : "Decrescente"}>
                  {sortDir === 1 ? "▲" : "▼"}
                </Btn>
              </span>
            </Field>
            <span className="pb-2 text-[13px] text-muted">
              {shown} de {everyone.length} {everyone.length === 1 ? "pessoa" : "pessoas"}
              {multi && ` em ${blocks.length} ${blocks.length === 1 ? "loja" : "lojas"}`}
              {filtering && (
                <>
                  {" · "}
                  <button type="button" className="underline hover:text-ink" onClick={clearFilters}>
                    Limpar filtros
                  </button>
                </>
              )}
            </span>
          </div>
          {filtering && shown > 0 && <AlterarMostrados rows={rows} />}
        </Card>
      )}
      {blocks.length < sc.stores.length && (
        <p className="text-[13px] text-muted">
          Sem o setor “{sector.name}”: {sc.stores.filter((st) => !blocks.some((b) => b.st.id === st.id)).map((st) => st.name).join(", ")}.
        </p>
      )}
      {rows.map((r) => (
        <StoreTeam key={r.st.id} st={r.st} sec={r.sec} all={r.all} emps={r.emps} multi={multi || r.st.id !== store.id} sortKey={sortKey} sortDir={sortDir} sortBy={sortBy} />
      ))}
    </>
  );
}

/** Muda de uma vez a folga fixa e os domingos das pessoas que aparecem com os filtros (ex.: todos os estagiários). */
function AlterarMostrados({ rows }: { rows: { st: Store; sec: Sector; emps: Employee[] }[] }) {
  const sim = useSim();
  const [folga, setFolga] = useState("keep");
  const [folga2, setFolga2] = useState("none");
  const [dom, setDom] = useState("keep");
  const [reg, setReg] = useState("keep");
  const n = rows.reduce((k, r) => k + r.emps.length, 0);
  const aplicar = () => {
    // regime primeiro (12x36 divide em Plantão A e B alternando)
    if (reg !== "keep")
      for (const r of rows) {
        if (!r.emps.length) continue;
        sim.updateStoreById(r.st.id, (st) => r.emps.reduce((x, e, i) => (reg.startsWith("j:") ? aplicarJornada(x, e.id, reg.slice(2)) : reg.startsWith("f") ? mudarFolgas(x, e.id, Number(reg.slice(1))) : mudarRegime(x, e.id, reg === "loja" ? "loja" : reg === "AB" ? (i % 2 === 0 ? "A" : "B") : (reg as "A" | "B"))), st));
      }
    for (const r of rows) {
      if (folga === "keep" && dom === "keep") break;
      if (!r.emps.length) continue;
      const ids = new Set(r.emps.map((e) => e.id));
      sim.updateStoreById(r.st.id, (st) => {
        const { rule, ciclo } = regraDomingo(st, r.sec);
        const employees = st.employees.map((e) => {
          if (!ids.has(e.id)) return e;
          const p: Partial<Employee> = {};
          if (folga !== "keep") {
            p.fixedOff = folga === "none" ? null : Number(folga);
            // segunda folga fixa só para quem tem 2 ou mais folgas na semana
            p.fixedOff2 = p.fixedOff != null && folga2 !== "none" && Number(folga2) !== p.fixedOff && folgasDe(st, e) >= 2 ? Number(folga2) : null;
          }
          if (p.fixedOff === 0 || p.fixedOff2 === 0) Object.assign(p, { sundayCycle: 0, sundayOffset: 0 });
          else if (dom === "0") Object.assign(p, { sundayCycle: 0, sundayOffset: 0 });
          else if (dom === "rod") Object.assign(p, { sundayCycle: rule === "alternado" ? ciclo : 2, sundayOffset: 0 }, folgaFixaDomingo(e) && folga === "keep" ? (e.fixedOff === 0 ? { fixedOff: e.fixedOff2 ?? null, fixedOff2: null } : { fixedOff2: null }) : {});
          return { ...e, ...p };
        });
        return clearUnlocked(applyTeamsAll({ ...st, employees }, { sectorId: r.sec.id }), r.sec.id);
      });
    }
    sim.setToast(`${n} ${n === 1 ? "pessoa alterada" : "pessoas alteradas"}. A escala do setor foi refeita (o que você fixou à mão foi mantido).`);
    setFolga("keep");
    setFolga2("none");
    setDom("keep");
    setReg("keep");
  };
  return (
    <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-line pt-4" role="group" aria-label="Alterar as pessoas mostradas">
      <span className="pb-2 text-[13.5px] font-semibold">{n === 1 ? "Alterar a pessoa mostrada:" : `Alterar as ${n} pessoas mostradas:`}</span>
      <Field label="Regime">
        <Select id="eq-bulk-reg" value={reg} onChange={setReg} options={[{ value: "keep", label: "— não mudar —" }, { value: "f2", label: "5x2" }, { value: "f1", label: "6x1" }, ...(sim.store.config.jornadas ?? []).map((j) => ({ value: `j:${j.id}`, label: `Jornada: ${j.nome}` })), { value: "AB", label: "12x36 (divide em Plantão A e B)" }, { value: "A", label: "12x36 · Plantão A" }, { value: "B", label: "12x36 · Plantão B" }]} />
      </Field>
      <Field label="Folga fixa">
        <Select id="eq-bulk-folga" value={folga} onChange={setFolga} options={[{ value: "keep", label: "— não mudar —" }, { value: "none", label: "Sem folga fixa" }, ...[0, 1, 2, 3, 4, 5, 6].map((d) => ({ value: String(d), label: d === 0 ? "Domingo (não trabalha domingo)" : WEEKDAY_SHORT[d] }))]} />
      </Field>
      {folga !== "keep" && folga !== "none" && (
        <Field label="2ª folga fixa">
          <Select id="eq-bulk-folga2" value={folga2} onChange={setFolga2} options={[{ value: "none", label: "Só uma folga fixa" }, ...[0, 1, 2, 3, 4, 5, 6].filter((d) => String(d) !== folga).map((d) => ({ value: String(d), label: d === 0 ? "Domingo (não trabalha domingo)" : WEEKDAY_SHORT[d] }))]} />
        </Field>
      )}
      <Field label="Domingos">
        <Select id="eq-bulk-dom" value={dom} onChange={setDom} options={[{ value: "keep", label: "— não mudar —" }, { value: "rod", label: "Entra no rodízio do setor" }, { value: "0", label: "Não trabalha domingo" }]} />
      </Field>
      {(folga !== "keep" || dom !== "keep" || reg !== "keep") && <ConfirmBtn kind="primary" label="Aplicar" confirmLabel={`Confirmar (${n} ${n === 1 ? "pessoa" : "pessoas"})`} onConfirm={aplicar} />}
    </div>
  );
}

function StoreTeam({ st: store, sec: sector, all, emps, multi, sortKey, sortDir, sortBy }: { st: Store; sec: Sector; all: Employee[]; emps: Employee[]; multi: boolean; sortKey: EqSortKey; sortDir: 1 | -1; sortBy: (k: EqSortKey) => void }) {
  const sim = useSim();
  const upd = (fn: (s: Store) => Store) => sim.updateStoreById(store.id, fn);
  const regular = sector.shifts.filter((s) => !s.special);
  const turnos5x2 = regular.filter((s) => !s.plantao);
  const plantoes = regular.filter((s) => s.plantao);
  const [open, setOpen] = useState<string | null>(null);
  const SortTh = ({ k, children }: { k: EqSortKey; children: React.ReactNode }) => (
    <th className="th" aria-sort={sortKey === k ? (sortDir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => sortBy(k)} className={`inline-flex items-center gap-1.5 uppercase tracking-wide hover:text-ink ${sortKey === k ? "text-ink" : ""}`} title="Clique para ordenar">
        {children}
        <span aria-hidden className="text-[10px]">{sortKey === k ? (sortDir === 1 ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
  const rd = regraDomingo(store, sector);
  const alternado = rd.rule === "alternado";
  const letras = "ABCDEFGH".slice(0, rd.ciclo).split("");
  const porTime = letras.map((l) => ({ l, n: all.filter((e) => teamOf(e) === l && e.sundayCycle === rd.ciclo).length }));
  const nextSun = (() => {
    const d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const doSplit = () => {
    const map = splitTeams(store, sector.id);
    const n = Object.keys(map).length;
    if (!n) return sim.setToast("Ninguém deste setor trabalha aos domingos.");
    upd((st) => clearUnlocked(applyTeamsAll(st, { fresh: true, sectorId: sector.id }), sector.id));
    sim.setToast(`Times de domingo${multi ? ` (${store.name})` : ""}: ${letras.map((l) => `Time ${l} com ${Object.values(map).filter((t) => t === l).length}`).join(", ")}. A escala de ${sector.name} foi refeita (o que você fixou à mão foi mantido).`);
  };
  // domingos da pessoa: valor do select
  const valorDomingo = (e: Employee) => (folgaFixaDomingo(e) ? "fix0" : e.sundayCycle === 0 ? "0" : teamOf(e) ? `g:${e.sundayCycle}:${teamOf(e)}` : `c:${e.sundayCycle}`);
  const opcoesDomingo = (e: Employee) => {
    const v = valorDomingo(e);
    const grupos = alternado
      ? letras.map((l) => ({ value: `g:${rd.ciclo}:${l}`, label: rd.ciclo === 2 ? `Time ${l} (domingo sim, domingo não)` : `Time ${l} (${rd.work}x1: folga 1 a cada ${rd.ciclo})` }))
      : [
          { value: "g:2:A", label: "Time A (domingo sim, domingo não)" },
          { value: "g:2:B", label: "Time B (domingo sim, domingo não)" },
          { value: "c:2", label: "Folga a cada 2 domingos" },
          { value: "c:3", label: "Folga a cada 3 domingos (2x1)" },
          { value: "c:4", label: "Folga a cada 4 domingos (3x1)" },
        ];
    const opts: { value: string; label: string }[] = [...grupos, { value: "0", label: "Não trabalha domingo" }];
    if (v === "fix0") opts.unshift({ value: "fix0", label: "Folga fixa no domingo" });
    else if (!opts.some((o) => o.value === v)) opts.unshift({ value: v, label: teamOf(e) ? `Time ${teamOf(e)} (outro rodízio) — escolha` : alternado ? "— escolha o time —" : e.sundayCycle === 1 ? "Folga todo domingo" : `Folga a cada ${e.sundayCycle}` });
    return opts;
  };
  const mudarDomingo = (e: Employee, v: string) => {
    if (v === "fix0") return;
    const p: Partial<Employee> = v === "0" ? { sundayCycle: 0, sundayOffset: 0 } : v.startsWith("g:") ? teamPatch(v.split(":")[2], Number(v.split(":")[1])) : { sundayCycle: Number(v.slice(2)), sundayOffset: 0 };
    // escolheu trabalhar aos domingos: sai a folga fixa no domingo
    if (folgaFixaDomingo(e) && v !== "0") Object.assign(p, e.fixedOff === 0 ? { fixedOff: e.fixedOff2 ?? null, fixedOff2: null } : { fixedOff2: null });
    setEmp(e.id, p);
  };
  /** Folgas fixas da pessoa (até duas). Sem a primeira, a segunda também sai. */
  const mudarFolgaFixa = (e: Employee, a: number | null, b: number | null = e.fixedOff2 ?? null) => {
    const d2 = a == null || b === a ? null : b;
    const novo = { fixedOff: a, fixedOff2: d2 };
    const domingo = a === 0 || d2 === 0;
    // a escala da pessoa é refeita com as folgas fixas novas (o que foi fixado à mão fica)
    const refazer = (st: Store) => limparPessoa(st, sector.id, e.id);
    const comPatch = (st: Store, patch: Partial<Employee>) => ({ ...st, employees: st.employees.map((x) => (x.id === e.id ? { ...x, ...patch } : x)) });
    if (domingo) return upd((st) => refazer(comPatch(st, { ...novo, sundayCycle: 0, sundayOffset: 0 })));
    if (folgaFixaDomingo(e))
      // deixou de folgar todo domingo: volta ao rodízio do setor (entra no time menor)
      return upd((st) => refazer(applyTeamsAll(comPatch(st, { ...novo, sundayCycle: alternado ? rd.ciclo : 2, sundayOffset: 0 }), { sectorId: sector.id })));
    upd((st) => refazer(comPatch(st, novo)));
  };
  const setEmp = (id: string, patch: Partial<Employee>) => upd((st) => ({ ...st, employees: st.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const remove = (id: string) =>
    upd((st) => ({
      ...st,
      employees: st.employees.filter((e) => e.id !== id),
      reassignments: st.reassignments.filter((r) => r.employeeId !== id),
      assignments: st.assignments.filter((a) => a.employeeId !== id),
      sectors: st.sectors.map((s) => {
        if (!s.schedule[id]) return s;
        const { [id]: _d, ...rest } = s.schedule;
        void _d;
        return { ...s, schedule: rest };
      }),
    }));
  const move = (e: Employee, toId: string) =>
    upd((st) => {
      const to = st.sectors.find((s) => s.id === toId)!;
      const row = st.sectors.find((s) => s.id === e.sectorId)?.schedule[e.id] ?? {};
      return {
        ...st,
        sectors: st.sectors.map((s) => {
          if (s.id === e.sectorId) {
            const { [e.id]: _d, ...rest } = s.schedule;
            void _d;
            return { ...s, schedule: rest };
          }
          return s.id === toId ? { ...s, schedule: { ...s.schedule, [e.id]: row } } : s;
        }),
        employees: st.employees.map((x) => (x.id === e.id ? { ...x, sectorId: toId, shiftId: to.shifts.find((s) => !s.special)?.id ?? "", breakStart: null, sundayShiftId: null, defaultPost: to.posts[0] ?? "" } : x)),
      };
    });

  return (
    <section aria-label={multi ? `Equipe de ${store.name}` : undefined} data-store={store.id} className="flex flex-col gap-4">
      {multi && (
        <h2 className="mt-2 flex items-baseline gap-2 text-[17px] font-bold">
          {store.name}
          <span className="text-[13px] font-normal text-muted">
            {emps.length} de {all.length} {all.length === 1 ? "pessoa" : "pessoas"}
            {store.id === sim.store.id && " · em edição"}
          </span>
        </h2>
      )}
      <Card>
        <ModeloSetorEditor st={store} sectorId={sector.id} />
      </Card>
      {all.length > 0 && store.config.sundayOpen && sector.modeloEscala !== "12x36" && (
        <Card>
          <div className="flex flex-col gap-4" id={multi ? `sun-teams-${store.id}` : "sun-teams"}>
            <div className="max-w-[720px]">
              <div className="text-[15px] font-bold">Domingos: {alternado ? `rodízio ${rd.work}x1` : "cada pessoa com sua regra"}</div>
              <p className="mt-1 text-[13.5px] text-muted">
                {alternado
                  ? rd.ciclo === 2
                    ? "Domingo sim, domingo não: metade da equipe trabalha num domingo e a outra metade no seguinte; as outras folgas vão para os dias de semana."
                    : `Cada pessoa trabalha ${rd.work} domingos seguidos e folga 1. A equipe é dividida em ${rd.ciclo} times; a cada domingo um time folga.`
                  : "Cada pessoa tem sua regra de domingo, escolhida na coluna “Domingos”."}
                {rd.propria ? " Regra própria deste setor." : " Segue a regra da loja."} Quem tem folga fixa no domingo não entra no rodízio.
              </p>
              {alternado && (
                <p className="mt-2 text-[13.5px]">
                  {porTime.some((x) => x.n) ? (
                    <>
                      {porTime.map((x, i) => (
                        <React.Fragment key={x.l}>
                          {i > 0 && " · "}
                          <b>Time {x.l}:</b> {x.n} {x.n === 1 ? "pessoa" : "pessoas"}
                        </React.Fragment>
                      ))}{" "}
                      · no domingo {nextSun.slice(8, 10)}/{nextSun.slice(5, 7)} {rd.ciclo === 2 ? <>trabalha o <b>Time {teamOnSunday(nextSun)}</b></> : <>folga o <b>Time {teamOffOnSunday(nextSun, rd.ciclo)}</b></>}
                    </>
                  ) : (
                    <span className="text-muted">Ninguém está em time ainda. Escolha o time de cada pessoa na coluna “Domingos” ou divida automaticamente.</span>
                  )}
                </p>
              )}
              {alternado && <ConfirmBtn kind="primary" className="mt-3" label="Reequilibrar os times" confirmLabel="Confirmar divisão (muda o time de todos)" onConfirm={doSplit} />}
            </div>
            <RegraDomingoEditor st={store} sectorId={sector.id} />
          </div>
        </Card>
      )}
      <Card>
        {!all.length && <p className="text-[14px] text-muted">Ninguém cadastrado em {sector.name}{multi ? ` de ${store.name}` : ""} ainda.</p>}
        {all.length > 0 && !emps.length && <p className="text-[14px] text-muted">Ninguém com esses filtros.</p>}
        {emps.length > 0 && (
          <div className="scroll-x">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr>
                  <SortTh k="nome">Nome</SortTh>
                  <th className="th">Regime</th>
                  <th className="th">Contratação</th>
                  <SortTh k="turno">Turno</SortTh>
                  <th className="th" title="Horário e tempo de almoço de sempre (também na Escala de Almoço)">Almoço</th>
                  <SortTh k="domingos">Domingos</SortTh>
                  <SortTh k="folga">Folga fixa</SortTh>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {emps.map((e) => (
                  <React.Fragment key={e.id}>
                    <tr>
                      <td className="td" style={{ minWidth: 200 }}>
                        <TextInput id={`s-name-${e.id}`} aria-label="Nome" className="w-full min-w-[180px]" placeholder={e.func} value={e.name} onChange={(v) => setEmp(e.id, { name: v })} />
                      </td>
                      <td className="td">
                        <Select
                          id={`s-reg-${e.id}`}
                          aria-label="Regime"
                          value={valorRegime(e, store)}
                          onChange={(v: string) => {
                            if (v.startsWith("j:")) {
                              const j = store.config.jornadas?.find((x) => x.id === v.slice(2));
                              upd((st) => aplicarJornada(st, e.id, v.slice(2)));
                              if (j) sim.setToast(`${e.name || e.func} agora segue a jornada “${j.nome}”: ${jornadaResumo(j)}.`);
                              return;
                            }
                            if (v.startsWith("f")) {
                              const n = Number(v.slice(1));
                              upd((st) => mudarFolgas(st, e.id, n));
                              sim.setToast(`${e.name || e.func} agora está no ${nomeFolgas(n)}: ${7 - n} dias de trabalho e ${n} ${n === 1 ? "folga" : "folgas"} por semana. A escala dessa pessoa foi refeita.`);
                              return;
                            }
                            upd((st) => mudarRegime(st, e.id, v as "loja" | "A" | "B"));
                            sim.setToast(`${e.name || e.func} agora é 12x36 (Plantão ${v}): trabalha dia sim, dia não, inclusive domingos e feriados.`);
                          }}
                          options={[
                            { value: "f2", label: `5x2${folgasPadraoSetor(store, sector.id) === 2 ? "" : " (2 folgas)"}` },
                            { value: "f1", label: `6x1${folgasPadraoSetor(store, sector.id) === 1 ? "" : " (1 folga)"}` },
                            ...(store.config.jornadas ?? []).map((j) => ({ value: `j:${j.id}`, label: `${j.nome} (${j.diasSemana}d × ${fmtDur(j.horasDia)})` })),
                            { value: "A", label: "12x36 · Plantão A" },
                            { value: "B", label: "12x36 · Plantão B" },
                          ]}
                        />
                      </td>
                      <td className="td">
                        <ContratacaoCell e={e} store={store} onTipo={(t) => {
                          upd((st) => mudarContratacao(st, e.id, t));
                          sim.setToast(t === "clt" ? `${e.name || e.func} voltou para CLT, com a jornada da loja.` : `Contratação de ${e.name || e.func}: ${CONTRATACAO_NOME[t]}, ${sector.shifts.find((x) => x.id === e.shiftId)?.workMin != null ? `com as horas do turno (${fmtDur(sector.shifts.find((x) => x.id === e.shiftId)!.workMin!)})` : `${fmtDur(CONTRATACAO_PADRAO[t].dia)} por dia`} e ${fmtDur(CONTRATACAO_PADRAO[t].semana)} por semana. Ajuste as horas se precisar.`);
                        }} onHoras={(v) => setEmp(e.id, { horasDia: v })} />
                      </td>
                      <td className="td">
                        {(() => {
                          const lista = e.regime === "12x36" ? plantoes : turnos5x2;
                          return (
                            <Select
                              id={`s-shift-${e.id}`}
                              aria-label="Turno"
                              value={e.shiftId}
                              onChange={(v) => {
                                const novo = lista.find((x) => x.id === v);
                                // turno com horas próprias (ex.: "Estágio 5h"): estagiário/aprendiz passa a seguir as horas do turno
                                const segueTurno = novo?.workMin != null && contratacaoDe(e) !== "clt" && e.horasDia != null;
                                // o almoço escolhido fica, se couber no turno novo (senão o sistema sugere outro)
                                upd((st) => manterAlmoco({ ...st, employees: st.employees.map((p) => (p.id === e.id ? { ...p, shiftId: v, ...(segueTurno ? { horasDia: null } : {}) } : p)) }, e.id));
                                if (segueTurno) sim.setToast(`${e.name || e.func} agora segue as horas do turno ${novo!.name} (${fmtDur(novo!.workMin!)} por dia).`);
                              }}
                              options={[...(lista.some((s) => s.id === e.shiftId) ? [] : [{ value: e.shiftId, label: "— escolher —" }]), ...lista.map((s) => ({ value: s.id, label: `${s.name} (${s.start}–${fmtTime(shiftEnd(store.config, s))}${shiftEnd(store.config, s) > 1440 ? " do dia seguinte" : ""})` }))]}
                            />
                          );
                        })()}
                      </td>
                      <td className="td">
                        <AlmocoCell
                          e={e}
                          store={store}
                          onHora={(hora) => {
                            upd((st) => definirAlmoco(st, e.id, { hora }));
                            sim.setToast(`${e.name || e.func}: almoço fixo às ${hora}.`);
                          }}
                          onMin={(min) => {
                            upd((st) => definirAlmoco(st, e.id, { min }));
                            const r = employeeShift({ ...store, employees: store.employees.map((p) => (p.id === e.id ? { ...p, almocoMin: min } : p)) }, sector, { ...e, almocoMin: min }, false);
                            sim.setToast(`${e.name || e.func}: almoço de ${durAlm(r.breakEnd - r.breakStart)}${min == null ? " (o do turno)" : ""}. A saída fica às ${fmtTime(r.end)}, com as mesmas horas de trabalho.`);
                          }}
                        />
                      </td>
                      <td className="td">
                        {e.regime === "12x36" ? (
                          <span className="text-[13px] text-muted" id={`s-sun-${e.id}`}>
                            Dia sim, dia não (12x36)
                          </span>
                        ) : (
                          <Select id={`s-sun-${e.id}`} aria-label="Domingos" value={valorDomingo(e)} onChange={(v: string) => mudarDomingo(e, v)} options={opcoesDomingo(e)} />
                        )}
                      </td>
                      <td className="td">
                        {e.regime === "12x36" ? (
                          <span className="text-[13px] text-muted">—</span>
                        ) : (
                        <div className="flex flex-col gap-1.5">
                          <Select id={`s-fix-${e.id}`} aria-label="Folga fixa" value={e.fixedOff ?? -1} onChange={(v) => mudarFolgaFixa(e, v < 0 ? null : v)} options={[{ value: -1, label: "Sem folga fixa" }, ...[0, 1, 2, 3, 4, 5, 6].map((d) => ({ value: d, label: d === 0 ? "Dom (não trabalha domingo)" : WEEKDAY_SHORT[d] }))]} />
                          {e.fixedOff != null && folgasDe(store, e) >= 2 && (
                            <Select id={`s-fix2-${e.id}`} aria-label="Segunda folga fixa" value={e.fixedOff2 ?? -1} onChange={(v) => mudarFolgaFixa(e, e.fixedOff, v < 0 ? null : v)} options={[{ value: -1, label: "+ 2ª folga fixa: não" }, ...[0, 1, 2, 3, 4, 5, 6].filter((d) => d !== e.fixedOff).map((d) => ({ value: d, label: `e ${d === 0 ? "Dom (não trabalha domingo)" : WEEKDAY_SHORT[d]}` }))]} />
                          )}
                        </div>
                        )}
                      </td>
                      <td className="td whitespace-nowrap text-right">
                        <button type="button" className="mr-3 text-[13px] underline text-muted hover:text-ink" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
                          {open === e.id ? "menos" : "mais detalhes"}
                        </button>
                        <ConfirmBtn label="Excluir" confirmLabel="Excluir pessoa" onConfirm={() => remove(e.id)} />
                      </td>
                    </tr>
                    {open === e.id && (
                      <tr>
                        <td colSpan={8} className="px-3 pb-5">
                          <div className="grid gap-4 rounded-xl bg-surface-2 p-5 sm:grid-cols-2 lg:grid-cols-3">
                            <Field label="Função (cargo da pessoa)">
                              <TextInput id={`s-func-${e.id}`} value={e.func} onChange={(v) => setEmp(e.id, { func: v })} className="w-full" />
                            </Field>
                            <Field label="Matrícula">
                              <TextInput id={`s-mat-${e.id}`} value={e.matricula} onChange={(v) => setEmp(e.id, { matricula: v })} className="w-full" />
                            </Field>
                            <Field label="Sexo (só para a regra de domingos)">
                              <Select id={`s-sex-${e.id}`} value={e.sex} onChange={(v) => setEmp(e.id, { sex: v })} options={[{ value: "", label: "Não informar" }, { value: "F", label: "Feminino" }, { value: "M", label: "Masculino" }]} />
                            </Field>
                            <Field label={jornadaPessoal(e, store.config) != null ? "Horas por semana (contrato)" : "Jornada contratual por semana"}>
                              <DurInput id={`s-contract-${e.id}`} value={e.contractMin} onChange={(v) => setEmp(e.id, { contractMin: v })} />
                            </Field>
                            {(jornadaDe(store.config, e) || (e.regime !== "12x36" && contratacaoDe(e) === "clt" && folgasDe(store, e) !== store.config.folgasPorSemana)) && <JornadaResumo e={e} store={store} />}
                            {contratacaoDe(e) !== "clt" && !jornadaDe(store.config, e) && (
                              <>
                                <Field label="Horas por dia">
                                  <DurInput id={`s-hdia2-${e.id}`} value={e.horasDia ?? employeeShift(store, undefined, e, false).workMin} onChange={(v) => setEmp(e.id, { horasDia: v })} />
                                </Field>
                                <Field label="Intervalo">
                                  <Select
                                    id={`s-int-${e.id}`}
                                    value={e.intervaloMin ?? -1}
                                    onChange={(v) => setEmp(e.id, { intervaloMin: v < 0 ? null : v })}
                                    options={[
                                      { value: -1, label: `Automático (${(() => { const w = e.horasDia ?? 360; const b = intervaloPessoal({}, w, 60); return b ? fmtDur(b) : "sem intervalo"; })()})` },
                                      { value: 0, label: "Sem intervalo" },
                                      ...[15, 30, 60, 90, 120].map((m) => ({ value: m, label: fmtDur(m) })),
                                    ]}
                                  />
                                </Field>
                                <JornadaResumo e={e} store={store} />
                              </>
                            )}
                            <label className="flex items-center gap-2.5 self-end pb-2 text-[13.5px]">
                              <input type="checkbox" id={`s-chave-${e.id}`} checked={!!e.chave} onChange={(ev) => setEmp(e.id, { chave: ev.target.checked })} />
                              <span>
                                <b>Pessoa-chave</b> <span className="text-muted">(fiscal, líder, quem abre o cofre)</span>
                              </span>
                            </label>
                            <Field label="Prefere folgar">
                              <Select id={`s-pref-${e.id}`} value={e.variableOff ?? -1} onChange={(v) => setEmp(e.id, { variableOff: v < 0 ? null : v })} options={[{ value: -1, label: "Tanto faz" }, ...[1, 2, 3, 4, 5, 6].map((d) => ({ value: d, label: WEEKDAY_SHORT[d] }))]} />
                            </Field>
                            <Field label="Mudar de setor">
                              <Select id={`s-move-${e.id}`} value={e.sectorId} onChange={(v) => v !== e.sectorId && move(e, v)} options={store.sectors.filter((s) => !s.hidden || s.id === e.sectorId).map((s) => ({ value: s.id, label: s.name }))} />
                            </Field>
                            <div className="sm:col-span-2 lg:col-span-3">
                              <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-muted">Pode ajudar em</div>
                              <div className="flex flex-wrap gap-2">
                                {store.sectors
                                  .filter((s) => s.id !== e.sectorId && !s.hidden)
                                  .map((s) => {
                                    const on = e.quals.includes(s.id);
                                    return (
                                      <button key={s.id} type="button" aria-pressed={on} onClick={() => setEmp(e.id, { quals: on ? e.quals.filter((q) => q !== s.id) : [...e.quals, s.id] })} className={`rounded-full border px-3.5 py-1.5 text-[13px] ${on ? "bg-navy text-navy-ink border-navy" : "border-line bg-surface"}`}>
                                        {s.name}
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}

/** Valor do seletor de regime: loja, jornada cadastrada (j:id) ou plantão 12x36 (A/B). */
function valorRegime(e: Employee, store: Store): string {
  if (e.regime === "12x36") return e.plantaoFase === 1 ? "B" : "A";
  const j = jornadaDe(store.config, e);
  return j ? `j:${j.id}` : `f${folgasDe(store, e)}`;
}

/** Coluna "Contratação": CLT, estagiário ou jovem aprendiz; os dois últimos com horas por dia. */
function ContratacaoCell({ e, store, onTipo, onHoras }: { e: Employee; store: Store; onTipo: (t: Contratacao) => void; onHoras: (min: number) => void }) {
  const tipo = contratacaoDe(e);
  return (
    <div className="flex flex-col gap-1.5">
      <Select
        id={`s-ctr-${e.id}`}
        aria-label="Contratação"
        value={tipo}
        onChange={(v: string) => v !== tipo && onTipo(v as Contratacao)}
        options={[
          { value: "clt", label: "CLT" },
          { value: "estagio", label: "Estagiário" },
          { value: "aprendiz", label: "Jovem aprendiz" },
        ]}
      />
      {tipo !== "clt" && jornadaDe(store.config, e) && <span className="text-[12px] text-muted">horas da jornada “{jornadaDe(store.config, e)!.nome}”</span>}
      {tipo !== "clt" && !jornadaDe(store.config, e) && e.horasDia == null && (
        <span className="flex items-center gap-1.5 text-[12.5px] text-muted" id={`s-hturno-${e.id}`}>
          horas do turno ({fmtDur(employeeShift(store, undefined, e, false).workMin)})
          <button type="button" className="underline hover:text-ink" onClick={() => onHoras(employeeShift(store, undefined, e, false).workMin)}>
            mudar
          </button>
        </span>
      )}
      {tipo !== "clt" && !jornadaDe(store.config, e) && e.horasDia != null && (
        <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
          <DurInput id={`s-hdia-${e.id}`} aria-label="Horas por dia" value={e.horasDia} onChange={onHoras} />
          por dia{e.regime === "12x36" ? " (não vale no 12x36)" : (() => {
            const r = employeeShift(store, undefined, e, false);
            return r.shift ? ` · sai ${fmtTime(r.end)}` : "";
          })()}
        </span>
      )}
    </div>
  );
}

/** Resumo do dia de quem tem jornada própria: entrada, intervalo e saída no turno da pessoa. */
function JornadaResumo({ e, store }: { e: Employee; store: Store }) {
  const r = employeeShift(store, undefined, e, false);
  if (!r.shift) return null;
  const brk = r.breakEnd > r.breakStart;
  const j = jornadaDe(store.config, e);
  const semanas = 7 - folgasDe(store, e);
  const total = r.workMin * semanas;
  return (
    <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-line bg-surface px-4 py-3 text-[13px]" id={`s-jornada-${e.id}`}>
      {j && (
        <>
          Jornada <b>“{j.nome}”</b>: {jornadaResumo(j)}.{" "}
        </>
      )}
      No turno {r.shift.name}: entra às <b>{fmtTime(r.start)}</b>
      {brk ? (
        <>
          , intervalo das <b>{fmtTime(r.breakStart)}</b> às <b>{fmtTime(r.breakEnd)}</b>
        </>
      ) : (
        ", sem intervalo"
      )}{" "}
      e sai às <b>{fmtTime(r.end)}</b> ({fmtDur(r.workMin)} de trabalho). Com {semanas} dias por semana dá <b className={total > e.contractMin ? "text-red" : ""}>{fmtDur(total)}</b> por semana
      {total > e.contractMin ? `, acima das ${fmtDur(e.contractMin)} do contrato: diminua as horas por dia ou dê mais folgas.` : `, dentro das ${fmtDur(e.contractMin)} do contrato.`}
      {contratacaoDe(e) !== "clt" && <span className="mt-1 block text-[12px] text-muted">
        {contratacaoDe(e) === "estagio"
          ? "Lei do Estágio (11.788/2008): até 6h por dia e 30h por semana para ensino superior, profissional e médio regular; até 4h e 20h para educação especial e anos finais do fundamental. Confira o termo de compromisso."
          : "Jovem aprendiz (CLT, art. 432): até 6h por dia; até 8h para quem já concluiu o ensino fundamental, contando as horas de aprendizagem teórica. Confira o contrato de aprendizagem."}
      </span>}
    </div>
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

// ------------------------------------------------------------------ Horários
/** 45 → "45 min"; 90 → "1h30" */
const durAlm = (m: number) => (m < 60 ? `${m} min` : fmtDur(m));

/** Almoço de sempre da pessoa no cadastro: horário fixo e tempo de almoço (o mesmo da Escala de Almoço). */
function AlmocoCell({ e, store, onHora, onMin }: { e: Employee; store: Store; onHora: (hora: string) => void; onMin: (min: number | null) => void }) {
  const sec = store.sectors.find((s) => s.id === e.sectorId);
  const r = employeeShift(store, sec, e, false);
  if (r.breakEnd <= r.breakStart) return <span className="text-[13px] text-muted">Turno sem intervalo</span>;
  const doTurno = almocoDoTurno(store, e);
  const prob = e.almocoRodizio ? null : problemaAlmoco(r, r.breakStart);
  return (
    <div className="flex flex-col gap-1" id={`s-alm-${e.id}`}>
      <span className="inline-flex items-center gap-1.5">
        <input
          type="time"
          step={60}
          id={`s-alm-hora-${e.id}`}
          aria-label={`Horário de almoço de ${e.name || e.func}`}
          title={e.almocoRodizio ? "Em rodízio (muda a cada dia). Escolher um horário deixa fixo." : "Horário fixo de almoço"}
          className="field !py-1 tnum"
          value={e.almocoRodizio ? "" : fmtTime(r.breakStart)}
          onChange={(ev) => ev.target.value && onHora(ev.target.value)}
        />
        <select
          id={`s-alm-dur-${e.id}`}
          aria-label={`Tempo de almoço de ${e.name || e.func}`}
          title="Tempo de almoço (a saída anda junto)"
          className="field !w-auto !py-1 tnum"
          value={e.almocoMin && e.almocoMin >= 15 ? String(e.almocoMin) : ""}
          onChange={(ev) => onMin(ev.target.value ? Number(ev.target.value) : null)}
        >
          <option value="">{`${durAlm(doTurno)} (turno)`}</option>
          {Array.from({ length: 16 }, (_, i) => (i + 1) * 15)
            .filter((m) => m !== doTurno)
            .concat(e.almocoMin && e.almocoMin > 240 ? [e.almocoMin] : [])
            .map((m) => (
              <option key={m} value={m}>
                {durAlm(m)}
              </option>
            ))}
        </select>
      </span>
      {e.almocoRodizio ? (
        <span className="text-[11.5px] text-muted">↻ rodízio (muda a cada dia)</span>
      ) : (
        <span className="text-[11.5px] text-muted">até {fmtTime(r.breakEnd)}</span>
      )}
      {prob && (
        <span className="max-w-[240px] text-[11.5px] font-semibold text-red" id={`s-alm-aviso-${e.id}`}>
          {prob}
        </span>
      )}
    </div>
  );
}

export function HorariosPage({ go }: { go: (p: PageId) => void }) {
  const sim = useSim();
  const { store, sector } = sim;
  const cfg = store.config;
  // mudou o horário do intervalo, a duração ou a entrada: os almoços do setor são distribuídos de novo
  const [copyOpen, setCopyOpen] = useState(false);
  // mudou entrada/intervalo/jornada/janela do turno: quem tinha intervalo escalonado volta ao do turno
  // mudou entrada ou horas: se o intervalo ficou fora do turno, vai para o meio da jornada
  const ajustaIntervalo = (x: Shift): Shift => {
    if (!x.breakStart || x.breakMin <= 0 || x.plantao) return x;
    const ini = toMin(x.start);
    const fim = shiftEnd(cfg, x);
    const b = toMin(x.breakStart) + (toMin(x.breakStart) < ini && fim > 1440 ? 1440 : 0);
    // a janela do intervalo que ficou fora do turno sai (volta ao horário do intervalo ± o limite)
    const w = x.breakWindow;
    const janelaFora = !!w && !x.plantao && (toMin(w.start) <= ini || toMin(w.end) >= fim);
    const y = janelaFora ? { ...x, breakWindow: null } : x;
    if (b > ini && b + x.breakMin < fim) return y;
    const meio = ini + Math.round(shiftWorkMin(cfg, x) / 2 / 15) * 15;
    return { ...y, breakStart: fmtTime(meio % 1440) };
  };
  /** Horário do intervalo do turno "entre A e B": a janela cadastrada ou, sem ela, o horário do intervalo ± o limite de mudança. */
  const janelaDe = (x: Shift) => {
    const w = x.breakWindow;
    if (w && toMin(w.end) > toMin(w.start)) return { ini: toMin(w.start), fim: toMin(w.end) + (w.mode === "inicio" ? x.breakMin : 0) };
    const b = toMin(x.breakStart ?? x.start);
    const flex = x.breakFlex ?? DEFAULT_BREAK_FLEX;
    return { ini: b - flex, fim: b + x.breakMin + flex };
  };
  /** Grava o horário do intervalo: o intervalo inteiro fica entre A e B, distribuído por igual; o horário-base fica dentro dele. */
  const setJanela = (x: Shift, a: number, b: number) => {
    const base = toMin(x.breakStart ?? fmtTime(a));
    const novoBase = b - a >= x.breakMin ? Math.min(Math.max(base, a), b - x.breakMin) : a;
    set(x.id, { breakWindow: { start: fmtTime(a), end: fmtTime(b), mode: "inteiro", dist: "linear" }, breakStart: fmtTime(novoBase) });
  };
  const set = (id: string, patch: Partial<Shift>) =>
    sim.updateStore((st) => {
      const sectors = st.sectors.map((s) => (s.id === sector.id ? { ...s, shifts: s.shifts.map((x) => (x.id === id ? ("start" in patch || "workMin" in patch ? ajustaIntervalo({ ...x, ...patch }) : { ...x, ...patch }) : x)) } : s));
      if (!["start", "breakStart", "breakMin", "workMin", "breakFlex", "breakWindow"].some((k) => k in patch)) return { ...st, sectors };
      // horário de almoço de cada pessoa do turno: fica, se ainda cabe no turno e no horário do intervalo;
      // senão sai (e o sistema sugere outro na Escala de Almoço)
      const novo = { ...st, sectors };
      const sec2 = sectors.find((s) => s.id === sector.id)!;
      const sh = sec2.shifts.find((x) => x.id === id);
      const win = sh ? validWindow(sh) : null;
      return {
        ...novo,
        employees: st.employees.map((e) => {
          if (e.sectorId !== sector.id || e.shiftId !== id || !e.breakStart || !sh) return e;
          const r = employeeShift(novo, sec2, e, false);
          const ini = toMin(e.breakStart);
          const dur = r.breakEnd - r.breakStart;
          const cabe = dur > 0 && ini - r.start >= 60 && r.end - (ini + dur) >= 60 && (!win || (ini >= win.start && (win.mode === "inteiro" ? ini + dur <= win.end : ini <= win.end)));
          return cabe ? e : { ...e, breakStart: null };
        }),
      };
    });
  const count = (s: Shift) => store.employees.filter((e) => e.sectorId === sector.id && (s.special ? (e.sundayShiftId ?? sector.defaultSundayShiftId) === s.id : e.shiftId === s.id)).length;
  const remove = (id: string) =>
    sim.updateStore((st) => {
      const sec = st.sectors.find((s) => s.id === sector.id)!;
      const rest = sec.shifts.filter((x) => x.id !== id);
      const era = sec.shifts.find((x) => x.id === id);
      // quem estava no turno excluído vai para outro do mesmo tipo (plantão 12x36 ou turno normal)
      const fb = rest.find((x) => !x.special && !!x.plantao === !!era?.plantao)?.id ?? rest.find((x) => !x.special)?.id ?? "";
      return {
        ...st,
        sectors: st.sectors.map((s) =>
          s.id === sector.id
            ? {
                ...s,
                shifts: rest,
                defaultSundayShiftId: s.defaultSundayShiftId === id ? rest.find((x) => x.special)?.id ?? null : s.defaultSundayShiftId,
                // dias que usavam o turno excluído voltam ao turno habitual
                schedule: Object.fromEntries(
                  Object.entries(s.schedule).map(([emp, row]) => [emp, Object.fromEntries(Object.entries(row).map(([d, c]) => [d, c.shiftId === id ? { c: c.c, ...(c.lock ? { lock: true } : {}) } : c]))]),
                ),
                sundayTemplates: (s.sundayTemplates ?? []).map((t) => ({ ...t, entries: Object.fromEntries(Object.entries(t.entries).map(([k, v]) => [k, v.shiftId === id ? { c: v.c } : v])) })),
              }
            : s,
        ),
        employees: st.employees.map((e) => (e.sectorId === sector.id ? { ...e, shiftId: e.shiftId === id ? fb : e.shiftId, sundayShiftId: e.sundayShiftId === id ? null : e.sundayShiftId } : e)),
      };
    });
  // ordem dos turnos: arrastar pela alça (⠿) ou usar as setas; vale só dentro do mesmo grupo
  const grupo = (x: Shift) => (x.special ? "d" : x.plantao ? "p" : "n");
  const doGrupo = (x: Shift) => sector.shifts.filter((y) => grupo(y) === grupo(x));
  const reordenar = (id: string, destino: string) => {
    if (id === destino) return;
    sim.updateSector((sec) => {
      const lista = sec.shifts.slice();
      const de = lista.findIndex((x) => x.id === id);
      const para = lista.findIndex((x) => x.id === destino);
      if (de < 0 || para < 0 || grupo(lista[de]) !== grupo(lista[para])) return sec;
      const [item] = lista.splice(de, 1);
      lista.splice(para, 0, item);
      return { ...sec, shifts: lista };
    });
  };
  const passo = (s: Shift, dir: -1 | 1) => {
    const g = doGrupo(s);
    const i = g.findIndex((x) => x.id === s.id);
    const vizinho = g[i + dir];
    if (vizinho) reordenar(s.id, vizinho.id);
  };
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const card = (s: Shift) => {
    const end = shiftEnd(cfg, s);
    const n = count(s);
    const isDefaultSun = s.special && sector.defaultSundayShiftId === s.id;
    const jan = janelaDe(s);
    const g = doGrupo(s);
    const pos = g.findIndex((x) => x.id === s.id);
    const origem = arrastando ? sector.shifts.find((x) => x.id === arrastando) : null;
    const podeSoltar = !!origem && origem.id !== s.id && grupo(origem) === grupo(s);
    return (
      <div
        key={s.id}
        id={`h-card-${s.id}`}
        data-turno={s.id}
        className={`rounded-2xl border bg-surface p-6 flex flex-col gap-4 min-w-0 transition ${arrastando === s.id ? "opacity-40" : ""} ${podeSoltar && alvo === s.id ? "border-navy-2 ring-2 ring-navy-2" : "border-line"}`}
        style={s.color ? { borderLeft: `6px solid ${s.color}` } : undefined}
        onDragOver={(e) => {
          if (!podeSoltar) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (alvo !== s.id) setAlvo(s.id);
        }}
        onDragLeave={() => alvo === s.id && setAlvo(null)}
        onDrop={(e) => {
          e.preventDefault();
          const id = e.dataTransfer.getData("text/turno") || arrastando;
          if (id) reordenar(id, s.id);
          setArrastando(null);
          setAlvo(null);
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            {g.length > 1 && (
              <span
                draggable
                role="button"
                tabIndex={-1}
                id={`h-drag-${s.id}`}
                title="Arraste para mudar a ordem dos turnos"
                aria-label={`Arrastar o turno ${s.name} para mudar a ordem`}
                className="cursor-grab select-none rounded-md px-1 text-[18px] leading-none text-muted hover:bg-surface-2 hover:text-ink active:cursor-grabbing"
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/turno", s.id);
                  e.dataTransfer.effectAllowed = "move";
                  const el = document.getElementById(`h-card-${s.id}`);
                  if (el) e.dataTransfer.setDragImage(el, 24, 24);
                  setArrastando(s.id);
                }}
                onDragEnd={() => {
                  setArrastando(null);
                  setAlvo(null);
                }}
              >
                ⠿
              </span>
            )}
            <TextInput id={`h-name-${s.id}`} aria-label="Nome do turno" className="!text-[15px] font-bold w-44" value={s.name} onChange={(v) => set(s.id, { name: v })} />
          </span>
          <span className="flex items-center gap-1 text-[12.5px] text-muted">
            {n} {n === 1 ? "pessoa" : "pessoas"}
            {g.length > 1 && (
              <span className="ml-1.5 inline-flex overflow-hidden rounded-lg border border-line">
                <button type="button" id={`h-up-${s.id}`} className="px-1.5 py-0.5 hover:bg-surface-2 disabled:opacity-30" disabled={pos <= 0} onClick={() => passo(s, -1)} aria-label={`Mover ${s.name} para antes`} title="Mover para antes">
                  ‹
                </button>
                <button type="button" id={`h-down-${s.id}`} className="border-l border-line px-1.5 py-0.5 hover:bg-surface-2 disabled:opacity-30" disabled={pos >= g.length - 1} onClick={() => passo(s, 1)} aria-label={`Mover ${s.name} para depois`} title="Mover para depois">
                  ›
                </button>
              </span>
            )}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Entrada">
            <TimeInput id={`h-start-${s.id}`} value={s.start} onChange={(v) => set(s.id, { start: v })} />
          </Field>
          <Field label="Saída (calculada)">
            <div className="field !bg-surface-2 font-bold tnum">{fmtTime(end)}</div>
          </Field>
          <Field label="Horas trabalhadas">
            <span className="flex flex-col gap-1">
              <DurInput id={`h-work-${s.id}`} value={shiftWorkMin(cfg, s)} onChange={(v) => (v > 0 ? set(s.id, { workMin: !s.special && !s.plantao && v === cfg.dailyMin ? null : v }) : undefined)} />
              {!s.special && !s.plantao && (
                <span className="text-[11.5px] font-normal normal-case tracking-normal text-muted" id={`h-work-info-${s.id}`}>
                  {s.workMin == null ? (
                    "jornada da loja"
                  ) : (
                    <>
                      próprio do turno ·{" "}
                      <button type="button" className="underline hover:text-ink" onClick={() => set(s.id, { workMin: null })}>
                        usar a da loja ({fmtDur(cfg.dailyMin)})
                      </button>
                    </>
                  )}
                </span>
              )}
            </span>
          </Field>
          {!s.special && !s.plantao && (configDoSetor(cfg, sector).regras?.rodizioTurnos || s.rodizio) && (
            <label className="col-span-2 inline-flex items-center gap-2 text-[13px]">
              <input type="checkbox" id={`h-rod-${s.id}`} checked={!!s.rodizio} onChange={(e) => set(s.id, { rodizio: e.target.checked })} />
              Entra no rodízio semanal de turnos {!configDoSetor(cfg, sector).regras?.rodizioTurnos && <span className="text-muted">(regra desligada em Regras avançadas{sector.regrasProprias ? ` para ${sector.name}` : ""})</span>}
            </label>
          )}
          <Field label="Duração do intervalo">
            <Select
              id={`h-brkd-${s.id}`}
              value={s.breakStart ? s.breakMin : 0}
              onChange={(v) => set(s.id, v === 0 ? { breakStart: null } : { breakMin: v, breakStart: s.breakStart ?? fmtTime(toMin(s.start) + 240) })}
              options={Array.from(new Set([0, 15, 30, 60, 90, 120, s.breakStart ? s.breakMin : 0]))
                .sort((a, b) => a - b)
                .map((m) => ({ value: m, label: m ? fmtDur(m) : "sem intervalo" }))}
            />
          </Field>
          {s.breakStart && s.breakMin > 0 && (
            <div className="col-span-2 rounded-xl border border-line bg-surface-2 p-3.5 flex flex-col gap-2" id={`h-win-${s.id}`}>
              <div className="text-[12px] font-bold uppercase tracking-wide text-muted">Horário do intervalo</div>
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-muted">entre</span>
                <TimeInput id={`h-win-s-${s.id}`} aria-label="Intervalo pode começar a partir de" value={fmtTime(jan.ini)} onChange={(v) => setJanela(s, toMin(v), jan.fim)} />
                <span className="text-muted">e</span>
                <TimeInput id={`h-win-e-${s.id}`} aria-label="Intervalo precisa terminar até" value={fmtTime(jan.fim)} onChange={(v) => setJanela(s, jan.ini, toMin(v))} />
              </div>
              <span className={`text-[12px] ${jan.fim - jan.ini < s.breakMin ? "font-semibold text-red" : "text-muted"}`} id={`h-win-txt-${s.id}`}>
                {jan.fim - jan.ini < s.breakMin
                  ? `Esse horário não cabe o intervalo de ${fmtDur(s.breakMin)}: aumente o horário ou diminua a duração.`
                  : jan.fim - jan.ini === s.breakMin
                    ? `Intervalo fixo: sempre das ${fmtTime(jan.ini)} às ${fmtTime(jan.fim)}.`
                    : `Os almoços são distribuídos por igual entre ${fmtTime(jan.ini)} e ${fmtTime(jan.fim)}: o intervalo inteiro fica dentro desse horário. Cada pessoa recebe um horário fixo espalhado nesse horário (dá para mudar na Escala de Almoço).`}
              </span>
            </div>
          )}
          <Field label="Cor do turno">
            <ColorPicker id={`h-color-${s.id}`} label="Cor do turno" value={s.color} allowNone onChange={(c) => set(s.id, { color: c })} />
          </Field>
          {s.special && (
            <Field label="Padrão do setor">
              {isDefaultSun ? (
                <span className="text-[13px] font-semibold text-green pt-2">Turno de domingo padrão</span>
              ) : (
                <Btn onClick={() => sim.updateSector((x) => ({ ...x, defaultSundayShiftId: s.id }))}>Usar como padrão</Btn>
              )}
            </Field>
          )}
        </div>
        <p className="text-[12.5px] text-muted">
          {s.start} + {fmtDur(shiftWorkMin(cfg, s))} de trabalho{s.breakStart ? ` + ${fmtDur(s.breakMin)} de intervalo` : ""} = saída às {fmtTime(end)}
          {end > 1440 ? " do dia seguinte" : ""}
          {s.plantao ? " · 12x36: trabalha dia sim, dia não" : ""}
        </p>
        <div>
          <ConfirmBtn label="Excluir turno" confirmLabel={n ? `Excluir (${n} pessoa(s) mudam de turno)` : "Confirmar exclusão"} onConfirm={() => remove(s.id)} />
        </div>
      </div>
    );
  };
  const regular = sector.shifts.filter((s) => !s.special && !s.plantao);
  const plantoes = sector.shifts.filter((s) => s.plantao);
  const special = sector.shifts.filter((s) => s.special);
  const addPlantao = (noturno: boolean) => sim.updateSector((s) => ({ ...s, shifts: [...s.shifts, novoPlantao(noturno)] }));
  const addSunday = () =>
    sim.updateSector((s) => {
      const id = uid("sh_");
      const name = special.length ? `Domingo ${special.length + 1}` : "Domingo";
      return { ...s, shifts: [...s.shifts, { id, name, start: cfg.sundayStart, breakStart: null, breakMin: 0, workMin: 240, special: true }], defaultSundayShiftId: s.defaultSundayShiftId ?? id };
    });
  return (
    <>
      <PageHead
        title={`Horários · ${sector.name}`}
        storePicker
        sub={
          <>
            Loja aberta de segunda a sábado das {cfg.open} às {cfg.close}
            {cfg.sundayOpen ? `, domingo das ${cfg.sundayStart} às ${cfg.sundayEnd}` : ", fechada aos domingos"}. Cada turno usa a jornada da loja, de {fmtDur(cfg.dailyMin)} por dia (mude em{" "}
            <button type="button" className="underline" onClick={() => go("personalizar")}>
              Personalizar
            </button>
            ), ou as horas que você puser no turno (ex.: um turno de estágio de 5h).
          </>
        }
        go={go}
        actions={
          <>
            <Btn onClick={() => setCopyOpen(!copyOpen)} aria-expanded={copyOpen}>
              Copiar escala…
            </Btn>
            <Btn kind="primary" onClick={() => sim.updateSector((s) => ({ ...s, shifts: [...s.shifts, { id: uid("sh_"), name: `Turno ${regular.length + 1}`, start: "09:00", breakStart: "13:00", breakMin: 60, workMin: null, special: false }] }))}>
              + Turno
            </Btn>
          </>
        }
      />
      {copyOpen && <CopyScalePanel onClose={() => setCopyOpen(false)} />}
      {regular.length > 1 && <p className="-mb-2 text-[12.5px] text-muted">Arraste um turno pela alça ⠿ (ou use ‹ ›) para mudar a ordem. A mesma ordem aparece na escolha de turno em Equipe.</p>}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{regular.map(card)}</div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3" id="horarios-plantao">
        <div>
          <h2 className="text-[18px] font-bold">Plantões 12x36</h2>
          <p className="mt-1 max-w-[80ch] text-[13.5px] text-muted">
            12 horas de trabalho por 36 de descanso: a pessoa trabalha dia sim, dia não, inclusive domingos e feriados. Pode passar da meia-noite (ex.: 19h às 7h). Quem é 12x36 você escolhe na coluna “Regime” em{" "}
            <button type="button" className="underline" onClick={() => go("equipe")}>
              Equipe
            </button>
            .
          </p>
        </div>
        <span className="flex gap-2">
          <Btn onClick={() => addPlantao(false)} id="h-add-plantao-dia">
            + Plantão dia (07h–19h)
          </Btn>
          <Btn onClick={() => addPlantao(true)} id="h-add-plantao-noite">
            + Plantão noite (19h–07h)
          </Btn>
        </span>
      </div>
      {plantoes.length > 0 ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{plantoes.map(card)}</div> : <p className="text-[13.5px] text-muted">Nenhum plantão neste setor.</p>}
      {cfg.sundayOpen && (
        <>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-bold">Domingos e feriados</h2>
              <p className="mt-1 text-[13.5px] text-muted max-w-[80ch]">
                Horários usados quando a pessoa trabalha no domingo ou em feriado aberto. Crie quantos turnos precisar; quem trabalha em cada domingo e em qual turno você escolhe em{" "}
                <button type="button" className="underline" onClick={() => go("domingos")}>
                  Domingos
                </button>
                .
              </p>
            </div>
            <Btn kind="primary" onClick={addSunday}>
              + Turno de domingo
            </Btn>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{special.map(card)}</div>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Necessidade
const GROUPS: { key: string; label: string; days: number[] }[] = [
  { key: "semana", label: "Segunda a sexta", days: [1, 2, 3, 4, 5] },
  { key: "sabado", label: "Sábado", days: [6] },
  { key: "domingo", label: "Domingo e feriados", days: [0] },
];
const sameDays = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export function NecessidadePage({ go }: { go: (p: PageId) => void }) {
  const sim = useSim();
  const { store, sector } = sim;
  const cfg = store.config;
  // toda mudança na necessidade também recalcula o movimento de cada dia (dias mais exigentes recebem menos folgas)
  const update = (fn: (rules: MinRule[]) => MinRule[]) =>
    sim.updateSector((s: Sector) => {
      const minRules = fn(s.minRules);
      return { ...s, minRules, movement: deriveMovement({ ...s, minRules }) };
    });
  const setRule = (id: string, patch: Partial<MinRule>) => update((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const others = sector.minRules.filter((r) => r.date || !GROUPS.some((g) => sameDays(g.days, r.days)));
  const role = sector.rolePlural;

  const row = (r: MinRule, custom = false) => (
    <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
      {custom &&
        (r.date ? (
          <input type="date" aria-label="Data" className="field" value={r.date} onChange={(e) => setRule(r.id, { date: e.target.value || null })} />
        ) : (
          <WeekdayPicker idPrefix={`n-${r.id}`} value={r.days} onChange={(v) => setRule(r.id, { days: v })} />
        ))}
      <span className="text-[13.5px] text-muted">das</span>
      <TimeInput id={`n-s-${r.id}`} aria-label="De" value={r.start} onChange={(v) => setRule(r.id, { start: v })} />
      <span className="text-[13.5px] text-muted">às</span>
      <TimeInput id={`n-e-${r.id}`} aria-label="Até" value={r.end} onChange={(v) => setRule(r.id, { end: v })} />
      <span className="text-[13.5px] text-muted">precisa de</span>
      <NumInput id={`n-m-${r.id}`} aria-label="Pessoas" className="!w-16 font-bold !text-[15px]" value={r.min} min={0} max={500} onChange={(v) => v != null && setRule(r.id, { min: v, ideal: null })} />
      <span className="text-[13.5px] text-muted">{role}</span>
      <span className="ml-auto">
        <ConfirmBtn label="Remover" confirmLabel="Remover faixa" onConfirm={() => update((rs) => rs.filter((x) => x.id !== r.id))} />
      </span>
    </div>
  );

  return (
    <>
      <PageHead
        title={`Fluxo alto · ${sector.name}`}
        storePicker
        sub={`Quantos ${role} precisam estar trabalhando em cada horário. O sistema usa isso para decidir onde cabem as folgas e para mostrar onde falta gente.`}
        go={go}
      />
      {GROUPS.filter((g) => g.key !== "domingo" || cfg.sundayOpen).map((g) => {
        const rules = sector.minRules.filter((r) => !r.date && sameDays(r.days, g.days)).sort((a, b) => toMin(a.start) - toMin(b.start));
        const peak = rules.reduce((m, r) => Math.max(m, r.min), 0);
        const isSun = g.key === "domingo";
        return (
          <Card key={g.key}>
            <CardTitle
              sub={rules.length ? `Pico: ${peak} ${role}.` : "Nenhuma faixa ainda."}
              actions={
                <Btn
                  kind="primary"
                  onClick={() => {
                    const last = rules[rules.length - 1];
                    const start = last ? last.end : isSun ? cfg.sundayStart : cfg.open;
                    const endMin = Math.min(toMin(isSun ? cfg.sundayEnd : cfg.close), toMin(start) + 180);
                    update((rs) => [...rs, { id: uid("mr_"), days: g.days, start, end: fmtTime(Math.max(endMin, toMin(start) + 30)), min: last?.min ?? 2, ideal: null, date: null, label: "" }]);
                  }}
                >
                  + Faixa
                </Btn>
              }
            >
              {g.label}
            </CardTitle>
            <div className="flex flex-col gap-3">{rules.map((r) => row(r))}</div>
          </Card>
        );
      })}
      <Card>
        <CardTitle
          sub="Para dias específicos (ex.: só quarta-feira) ou uma data especial (véspera de feriado). Valem no lugar das faixas gerais no mesmo horário."
          actions={
            <>
              <Btn onClick={() => update((rs) => [...rs, { id: uid("mr_"), days: [3], start: cfg.open, end: "12:00", min: 2, ideal: null, date: null, label: "" }])}>+ Dias específicos</Btn>
              <Btn onClick={() => update((rs) => [...rs, { id: uid("mr_"), days: [], start: cfg.open, end: cfg.close, min: 2, ideal: null, date: cfg.startDate, label: "" }])}>+ Data especial</Btn>
            </>
          }
        >
          Exceções
        </CardTitle>
        {others.length ? (
          <div className="flex flex-col gap-3">
            {others.map((r) => (
              <div key={r.id}>
                <div className="mb-1 text-[12px] text-muted">{r.date ? "Data especial" : daysLabel(r.days)}</div>
                {row(r, true)}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13.5px] text-muted">Nenhuma exceção.</p>
        )}
      </Card>
      <p className="text-[12.5px] text-muted">
        Dica: depois de mudar a necessidade, volte em{" "}
        <button type="button" className="underline" onClick={() => go("escala")}>
          Escala
        </button>{" "}
        e clique em Gerar escala.
      </p>
    </>
  );
}
