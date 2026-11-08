"use client";
// Lojas: cadastrar (uma ou várias), duplicar, renomear, escolher qual editar e excluir.
import React, { useState } from "react";
import { useSim } from "../components/state";
import { Btn, ConfirmBtn, Select, TextInput } from "../components/ui";
import { Card, CardTitle, PageHead, type PageId } from "./SimpleApp";
import type { Store } from "../engine/types";
import { SECTOR_CATALOG, simpleEmptyStore } from "../engine/seed";
import { buildDays } from "../engine/model";
import { fmtDateBR } from "../engine/time";
import { duplicateStore, parseStoreNames } from "./storeOps";

type Mode = "estrutura" | "branco";

export function LojasPage({ go }: { go: (p: PageId) => void }) {
  const sim = useSim();
  const [names, setNames] = useState("");
  const [network, setNetwork] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("estrutura");
  const [baseId, setBaseId] = useState(sim.store.id);
  const allSectorNames = Array.from(new Set([...sim.stores.flatMap((st) => st.sectors.filter((s) => !s.hidden).map((s) => s.name)), ...SECTOR_CATALOG.map((c) => c.name)]));
  const [blankSecs, setBlankSecs] = useState<string[] | null>(null);
  const chosenSecs = blankSecs ?? sim.store.sectors.filter((s) => !s.hidden).map((s) => s.name);
  const [q, setQ] = useState("");
  const base = sim.stores.find((s) => s.id === baseId) ?? sim.store;
  const net = network ?? sim.store.network;
  const list = parseStoreNames(names);
  const clash = list.filter((n) => sim.stores.some((s) => s.name.trim().toLowerCase() === n.toLowerCase()));

  const make = (name: string, from: Store, how: Mode): Store => {
    if (how === "branco") {
      const extra = chosenSecs.filter((n) => !SECTOR_CATALOG.some((c) => c.name === n)).map((n) => ({ name: n, sing: "colaborador", plur: "colaboradores" }));
      return { ...simpleEmptyStore(name, net, chosenSecs, extra), config: { ...simpleEmptyStore(name, net, chosenSecs).config, theme: sim.store.config.theme } };
    }
    return duplicateStore(from, name, net, false);
  };
  const create = () => {
    if (!list.length) return sim.setToast("Digite o nome da loja (uma por linha para cadastrar várias).");
    if (mode === "branco" && !chosenSecs.length) return sim.setToast("Escolha ao menos um setor.");
    const made = list.map((n) => make(n, base, mode));
    made.forEach((s) => sim.addStore(s));
    // as lojas novas entram no filtro do menu; com uma loja só, ela passa a ser a loja em edição
    sim.setStoreSel(Array.from(new Set([...sim.storeSel, ...made.map((s) => s.id)])));
    if (made.length === 1) sim.setStoreId(made[0].id);
    setNames("");
    sim.setToast(
      made.length === 1
        ? `Loja “${made[0].name}” criada e aberta para edição. ${mode === "estrutura" ? "Regras e montagem da escala copiadas; cadastre a equipe em Equipe." : "Confira Horários e Fluxo alto e cadastre a equipe."}`
        : `${made.length} lojas criadas. Use “Editar” na lista para configurar cada uma.`,
    );
  };
  const upd = (id: string, patch: Partial<Store>) => sim.updateStoreById(id, (s) => ({ ...s, ...patch }));
  const toggleSel = (id: string) => {
    const on = sim.storeSel.includes(id);
    if (on && sim.storeSel.length === 1) return;
    sim.setStoreSel(on ? sim.storeSel.filter((x) => x !== id) : [...sim.storeSel, id]);
  };
  const shown = sim.stores.filter((s) => !q.trim() || `${s.name} ${s.network}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <PageHead title="Lojas" sub="Cadastre uma ou várias lojas de uma vez, copie a estrutura de uma loja pronta, renomeie, escolha qual editar e quais aparecem nas telas." go={go} showSectors={false} />

      <Card id="new-store">
        <CardTitle sub="Para cadastrar várias, digite um nome por linha.">Nova loja</CardTitle>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-bold uppercase tracking-wide text-muted">Nome da loja</span>
              <textarea id="ns-names" className="field min-h-[96px] text-[14px]" placeholder={"Loja 2 — Shopping\nLoja 3 — Centro"} value={names} onChange={(e) => setNames(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-bold uppercase tracking-wide text-muted">Rede / empresa</span>
              <input id="ns-network" className="field" value={net} onChange={(e) => setNetwork(e.target.value)} />
            </label>
          </div>
          <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Começar a partir de">
            <span className="text-[12px] font-bold uppercase tracking-wide text-muted">Começar a partir de</span>
            <ModeCard id="ns-mode-estrutura" on={mode === "estrutura"} onClick={() => setMode("estrutura")} title="Copiar de outra loja" hint="Copia as regras avançadas e a montagem da escala: setores, turnos e intervalos, necessidade de pessoas, regra de domingo, jornadas, horário de funcionamento, feriados, dias sem folga e cores. Não copia os funcionários: cada loja cadastra a sua equipe.">
              {mode === "estrutura" && <BasePick stores={sim.stores} value={base.id} onChange={setBaseId} />}
            </ModeCard>
            <ModeCard id="ns-mode-branco" on={mode === "branco"} onClick={() => setMode("branco")} title="Em branco" hint="Só os setores que você escolher, com turnos e necessidade iniciais para ajustar.">
              {mode === "branco" && (
                <div className="mt-2 flex flex-wrap gap-2" id="ns-secs">
                  {allSectorNames.map((n) => {
                    const on = chosenSecs.includes(n);
                    return (
                      <button key={n} type="button" aria-pressed={on} onClick={(e) => (e.stopPropagation(), setBlankSecs(on ? chosenSecs.filter((x) => x !== n) : [...chosenSecs, n]))} className={`rounded-full border px-3 py-1 text-[12.5px] ${on ? "bg-navy text-navy-ink border-navy" : "border-line bg-surface"}`}>
                        {n}
                      </button>
                    );
                  })}
                </div>
              )}
            </ModeCard>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Btn kind="primary" id="ns-create" onClick={create} disabled={!list.length}>
            {list.length > 1 ? `Criar ${list.length} lojas` : "Criar loja"}
          </Btn>
          {clash.length > 0 && <span className="text-[13px] text-amber-ink">Já existe loja com o nome {clash.map((n) => `“${n}”`).join(", ")}. Ela será criada mesmo assim; você pode renomear depois.</span>}
        </div>
      </Card>

      <Card id="store-list">
        <CardTitle
          sub="“Nas telas” = aparece nas telas de escala e nos filtros por padrão. “Editar” abre a loja em Horários, Fluxo alto e Personalizar."
          actions={
            sim.stores.length > 5 ? <input id="sl-q" className="field w-56" placeholder="Buscar loja" value={q} onChange={(e) => setQ(e.target.value)} /> : undefined
          }
        >
          Suas lojas ({sim.stores.length})
        </CardTitle>
        <div className="scroll-x">
          <table className="w-full text-[13.5px] tnum">
            <thead>
              <tr>
                <th className="th">Nome da loja</th>
                <th className="th">Rede / empresa</th>
                <th className="th text-right">Pessoas</th>
                <th className="th text-right">Setores</th>
                <th className="th">Período planejado</th>
                <th className="th text-center">Nas telas</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const ds = buildDays(s.config);
                const editing = s.id === sim.store.id;
                return (
                  <tr key={s.id} className={editing ? "bg-surface-2" : ""} data-store={s.id}>
                    <td className="td">
                      <TextInput aria-label="Nome da loja" className="w-full min-w-[170px] font-semibold" value={s.name} onChange={(v) => upd(s.id, { name: v })} />
                      {editing && <span className="mt-1 block text-[11.5px] font-bold uppercase tracking-wide text-muted">Em edição</span>}
                    </td>
                    <td className="td">
                      <TextInput aria-label="Rede" className="w-full min-w-[120px]" value={s.network} onChange={(v) => upd(s.id, { network: v })} />
                    </td>
                    <td className="td text-right">{s.employees.length}</td>
                    <td className="td text-right">{s.sectors.filter((x) => !x.hidden).length}</td>
                    <td className="td whitespace-nowrap">{ds.length ? `${fmtDateBR(ds[0].date, false)} a ${fmtDateBR(ds[ds.length - 1].date)}` : "—"}</td>
                    <td className="td text-center">
                      <input type="checkbox" aria-label={`Mostrar ${s.name} nas telas`} checked={sim.storeSel.includes(s.id)} disabled={sim.storeSel.includes(s.id) && sim.storeSel.length === 1} onChange={() => toggleSel(s.id)} />
                    </td>
                    <td className="td whitespace-nowrap text-right">
                      <span className="inline-flex justify-end gap-2">
                        {!editing && (
                          <Btn
                            onClick={() => {
                              sim.setStoreId(s.id);
                              sim.setToast(`Editando ${s.name}.`);
                            }}
                          >
                            Editar
                          </Btn>
                        )}
                        <Dup s={s} />
                        {sim.stores.length > 1 && <ConfirmBtn label="Excluir" confirmLabel={`Excluir ${s.name} e todos os dados`} onConfirm={() => sim.removeStore(s.id)} />}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!shown.length && (
                <tr>
                  <td className="td text-muted" colSpan={7}>
                    Nenhuma loja com esse nome.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function ModeCard({ id, on, onClick, title, hint, children }: { id: string; on: boolean; onClick: () => void; title: string; hint: string; children?: React.ReactNode }) {
  return (
    <div
      id={id}
      role="radio"
      aria-checked={on}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), onClick())}
      className={`cursor-pointer rounded-xl border px-4 py-3 text-[13.5px] ${on ? "border-navy bg-surface-2" : "border-line bg-surface hover:border-navy-2"}`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${on ? "border-navy" : "border-line"}`} aria-hidden>
          {on && <span className="h-2 w-2 rounded-full bg-navy" />}
        </span>
        <b>{title}</b>
      </div>
      <p className="mt-1 pl-[26px] text-[12.5px] text-muted">{hint}</p>
      {children && (
        <div className="pl-[26px]" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
}

function BasePick({ stores, value, onChange }: { stores: Store[]; value: string; onChange: (v: string) => void }) {
  return (
    <label className="mt-2 inline-flex items-center gap-2 text-[13px]">
      Copiar de
      <Select id="ns-base" value={value} onChange={onChange} options={stores.map((s) => ({ value: s.id, label: `${s.name} (${s.employees.length} pessoas)` }))} />
    </label>
  );
}

/** Duplicar uma loja: copia as regras e a montagem da escala, sem os funcionários. */
function Dup({ s }: { s: Store }) {
  const sim = useSim();
  const run = () => {
    const copy = duplicateStore(s, `${s.name} (cópia)`, s.network, false);
    sim.addStore(copy);
    sim.setStoreSel(Array.from(new Set([...sim.storeSel, copy.id])));
    sim.setToast(`“${copy.name}” criada com as regras e a montagem da escala (sem funcionários). Renomeie na lista.`);
  };
  return (
    <Btn onClick={run} title="Copia regras avançadas, setores, turnos, necessidade, horários, feriados e cores. Sem funcionários.">
      Duplicar
    </Btn>
  );
}
