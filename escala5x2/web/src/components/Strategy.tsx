"use client";
import React, { useState } from "react";
import { useSim, pct } from "./state";
import { Btn, ConfirmBtn, DurInput, NumInput, Section, TextInput } from "./ui";
import { compareScenarios, DEFAULT_SCENARIOS, type ScenarioDef, type ScenarioResult } from "../engine/scenarios";
import { analyzeSectorCached } from "../engine/analysis";
import { cloneStore, demoStore, emptyStore } from "../engine/seed";
import { fillMissing } from "../engine/solver";
import { fmtDur, fmtMoney, fmtNum, uid } from "../engine/time";
import type { Store } from "../engine/types";

export function ScenarioSection() {
  const sim = useSim();
  const { store, sector } = sim;
  const [defs, setDefs] = useState<ScenarioDef[]>(DEFAULT_SCENARIOS);
  const [res, setRes] = useState<ScenarioResult[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [days, setDays] = useState(5);
  const [hours, setHours] = useState(44 * 60);
  const [target, setTarget] = useState<"ref" | "full">("ref");
  const n = sim.analysis.employees.length;
  const cfg = store.config;

  const run = async () => {
    setBusy("Preparando…");
    try {
      setRes(await compareScenarios(store, sector.id, defs, setBusy, target));
    } finally {
      setBusy(null);
    }
  };

  const rowsSpec: [string, (r: ScenarioResult) => React.ReactNode, string?][] = [
    ["Pessoas na equipe", (r) => r.people],
    ["Jornada diária", (r) => fmtDur(r.dailyMin)],
    ["Jornadas (dias trabalhados) por semana", (r) => fmtNum(r.workDaysWeek, 0), "Ex.: 8 pessoas × 5 dias = 40; × 6 dias = 48"],
    ["Horas contratadas por semana", (r) => fmtDur(r.hoursContract * 60)],
    ["Horas efetivamente escaladas por semana", (r) => fmtDur(r.hoursWeek * 60), "Considera domingos de jornada reduzida e folgas"],
    ["Cobertura dos mínimos", (r) => <span className={r.coveragePct >= 99.5 ? "text-green font-bold" : r.coveragePct >= 95 ? "text-amber-ink font-bold" : "text-red font-bold"}>{pct(r.coveragePct)}</span>],
    ["Déficit por semana", (r) => fmtDur(r.deficitHoursWeek * 60)],
    ["Pico de pessoas faltando", (r) => r.peakMissing],
    [target === "ref" ? "Contratações para igualar a referência" : "Contratações para cobrir 100% dos mínimos", (r) => (r.hires === null ? "mais de 12" : r.hires === 0 ? "nenhuma" : `+${r.hires} (cobertura ${pct(r.coverageWithHires)})`)],
    ["Custo mensal da equipe atual", (r) => fmtMoney(r.monthlyCost)],
    ["Custo mensal com contratações", (r) => fmtMoney(r.monthlyCostWithHires)],
  ];

  return (
    <Section
      id="cenarios"
      title="Comparador de cenários 5x2 × 6x1"
      subtitle={
        <>
          Simula a mesma equipe de {sector.name} ({n} pessoas) com regras de jornada diferentes, gerando uma escala para cada cenário. Reduzir dias de trabalho não reduz as horas semanais na mesma proporção: a jornada
          diária muda junto. O primeiro cenário é a referência para calcular contratações.
        </>
      }
      actions={
        <Btn kind="orange" onClick={run} disabled={!!busy || !n}>
          {busy ? "Simulando…" : "Comparar cenários"}
        </Btn>
      }
    >
      <div className="flex flex-wrap items-center gap-3 mb-5 text-[13px]">
        {defs.map((d, i) => (
          <span key={d.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 font-mono">
            {i === 0 && <span className="text-[10px] uppercase tracking-wider text-muted mr-1">ref.</span>}
            {d.label}
            {defs.length > 1 && (
              <button type="button" aria-label={`Remover ${d.label}`} className="text-muted hover:text-red ml-1" onClick={() => setDefs(defs.filter((x) => x.id !== d.id))}>
                ×
              </button>
            )}
          </span>
        ))}
        <span className="inline-flex flex-wrap items-center gap-1 rounded-md border border-dashed border-line px-2 py-1">
          <NumInput id="sc-days" aria-label="Dias por semana" value={days} min={4} max={6} onChange={(v) => v && setDays(v)} className="w-10" />
          <span>dias ×</span>
          <DurInput id="sc-hours" aria-label="Horas semanais" value={hours} onChange={setHours} />
          <span>/semana</span>
          <Btn onClick={() => setDefs([...defs, { id: uid("sc_"), label: `${days}x${7 - days} · ${fmtDur(hours)}`, daysPerWeek: days, weeklyMin: hours }])}>+ Cenário</Btn>
        </span>
        <label className="inline-flex items-center gap-1">
          Contratações para
          <select id="sc-target" className="field" value={target} onChange={(e) => setTarget(e.target.value as "ref" | "full")}>
            <option value="ref">igualar a cobertura da referência</option>
            <option value="full">cobrir 100% dos mínimos</option>
          </select>
        </label>
        <span className="text-muted">
          Custo: {fmtMoney(cfg.monthlyCost)} +{" "}
          <NumInput id="sc-charges" aria-label="Encargos" value={cfg.chargesPct} min={0} max={200} className="w-12" onChange={(v) => v != null && sim.updateStore((s) => ({ ...s, config: { ...s.config, chargesPct: v } }))} />% encargos · salário{" "}
          <NumInput id="sc-salary" aria-label="Salário médio" value={cfg.monthlyCost} min={0} max={100000} step={10} className="w-20" onChange={(v) => v != null && sim.updateStore((s) => ({ ...s, config: { ...s.config, monthlyCost: v } }))} />
        </span>
      </div>
      {busy && (
        <p className="text-[12.5px] text-muted" role="status">
          {busy}
        </p>
      )}
      {res && (
        <>
          <div className="scroll-x rounded-md border border-line">
            <table className="text-[13px] w-full tnum">
              <thead className="bg-surface-2">
                <tr>
                  <th className="th min-w-[230px]" />
                  {res.map((r) => (
                    <th key={r.def.id} className="th text-right text-[12px] text-ink">
                      {r.def.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsSpec.map(([label, fn, hint]) => (
                  <tr key={label}>
                    <th scope="row" className="td text-left font-medium" title={hint}>
                      {label}
                    </th>
                    {res.map((r) => (
                      <td key={r.def.id} className="td text-right">
                        {fn(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {res.map((r) => (
              <div key={r.def.id} className="rounded-md border border-line bg-surface-2 p-2.5 text-[12px]">
                <div className="font-bold mb-1">Premissas · {r.def.label}</div>
                <ul className="list-disc pl-4 text-muted space-y-0.5">
                  {r.premises.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                  {!r.feasible && <li className="text-red">algumas restrições obrigatórias não puderam ser respeitadas neste cenário</li>}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

interface StoreRow {
  store: Store;
  people: number;
  pct: number;
  def: number;
  problems: number;
  bySector: Record<string, { people: number; pct: number; def: number }>;
}

export function NetworkSection() {
  const sim = useSim();
  const { stores, store } = sim;
  const [rows, setRows] = useState<StoreRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const total = stores.reduce((a, s) => a + s.employees.length, 0);

  const consolidate = async () => {
    const out: StoreRow[] = [];
    const t0 = performance.now();
    for (let i = 0; i < stores.length; i++) {
      const st = stores[i];
      setBusy(`Calculando ${st.name} (${i + 1}/${stores.length})…`);
      await new Promise((r) => setTimeout(r, 0));
      let req = 0;
      let met = 0;
      let def = 0;
      let problems = 0;
      const bySector: StoreRow["bySector"] = {};
      for (const sec of st.sectors) {
        const people = st.employees.filter((e) => e.sectorId === sec.id).length;
        if (!people && !sec.minRules.length) continue;
        const a = analyzeSectorCached(st, sec.id);
        req += a.totals.reqSlots;
        met += a.totals.metSlots;
        def += a.totals.deficitHoursPerWeek;
        problems += a.alerts.filter((x) => x.severity === "problema").length;
        bySector[sec.name] = { people, pct: a.totals.pct, def: a.totals.deficitHoursPerWeek };
      }
      out.push({ store: st, people: st.employees.length, pct: req ? (met / req) * 100 : 100, def, problems, bySector });
    }
    setRows(out);
    setBusy(`Consolidado em ${fmtNum((performance.now() - t0) / 1000, 1)} s`);
  };

  const sectorNames = rows ? Array.from(new Set(rows.flatMap((r) => Object.keys(r.bySector)))) : [];

  return (
    <Section
      id="rede"
      title={`Rede · ${store.network}`}
      subtitle={`${stores.length} loja(s) e ${total.toLocaleString("pt-BR")} colaboradores. Cada loja tem cadastro e configurações próprios; a consolidação soma cobertura e déficit de todos os setores.`}
      actions={
        <Btn kind="primary" onClick={consolidate} disabled={!!busy && busy.includes("…")}>
          {rows ? "Atualizar consolidação" : "Consolidar rede"}
        </Btn>
      }
    >
      <div className="flex flex-wrap items-center gap-3 mb-5 text-[13px]">
        <TextInput id="net-newname" aria-label="Nome da nova loja" placeholder="Nome da nova loja" className="w-48" value={newName} onChange={setNewName} />
        <Btn onClick={() => sim.addStore(emptyStore(newName || `Loja ${stores.length + 1}`, store.network))}>+ Loja vazia</Btn>
        <Btn onClick={() => sim.addStore(demoStore({ name: newName || `Loja ${stores.length + 1}`, network: store.network, seed: stores.length + 11, start: store.config.startDate }))}>+ Loja de demonstração (60)</Btn>
        <ConfirmBtn
          kind="ghost"
          label="Gerar rede de teste: 20 lojas · 1.200 colaboradores"
          confirmLabel="Substituir todas as lojas"
          onConfirm={async () => {
            setBusy("Gerando 20 lojas…");
            await new Promise((r) => setTimeout(r, 30));
            const t0 = performance.now();
            let base = demoStore({ name: "Loja 01", network: store.network, seed: 3, start: store.config.startDate });
            for (const sec of base.sectors) {
              const f = fillMissing(base, sec.id);
              if (f) base = { ...base, sectors: base.sectors.map((x) => (x.id === sec.id ? f : x)) };
            }
            const list = [base, ...Array.from({ length: 19 }, (_, i) => cloneStore(base, `Loja ${String(i + 2).padStart(2, "0")}`, i + 4))];
            sim.replaceStores(list);
            setRows(null);
            setBusy(`Rede gerada (${fmtNum((performance.now() - t0) / 1000, 1)} s). Clique em Consolidar rede.`);
          }}
        />
        {busy && (
          <span className="text-muted" role="status">
            {busy}
          </span>
        )}
      </div>
      <div className="scroll-x rounded-md border border-line">
        <table className="text-[12.5px] w-full tnum">
          <thead className="bg-surface-2">
            <tr>
              <th className="th">Loja</th>
              <th className="th text-right">Colaboradores</th>
              <th className="th text-right">Cobertura</th>
              <th className="th text-right">Déficit/semana</th>
              <th className="th text-right">Problemas</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => {
              const r = rows?.find((x) => x.store.id === s.id);
              return (
                <tr key={s.id} className={s.id === store.id ? "bg-surface-2" : ""}>
                  <td className="td font-semibold">
                    {s.name}
                    {s.id === store.id && <span className="ml-1 text-[11px] text-muted font-normal">(aberta)</span>}
                  </td>
                  <td className="td text-right">{s.employees.length}</td>
                  <td className={`td text-right ${r ? (r.pct >= 99.5 ? "text-green" : r.pct >= 95 ? "text-amber-ink" : "text-red") : "text-muted"}`}>{r ? pct(r.pct) : "—"}</td>
                  <td className="td text-right">{r ? fmtDur(r.def * 60) : "—"}</td>
                  <td className="td text-right">{r ? r.problems : "—"}</td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      {s.id !== store.id && <Btn onClick={() => sim.setStoreId(s.id)}>Abrir</Btn>}
                      <Btn onClick={() => sim.addStore({ ...JSON.parse(JSON.stringify(s)), id: uid("loja_"), name: `${s.name} (cópia)` })}>Duplicar</Btn>
                      {stores.length > 1 && <ConfirmBtn label="Excluir" confirmLabel="Excluir loja" onConfirm={() => sim.removeStore(s.id)} />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows && (
            <tfoot>
              <tr className="font-bold bg-surface-2">
                <td className="td">Rede</td>
                <td className="td text-right">{rows.reduce((a, r) => a + r.people, 0).toLocaleString("pt-BR")}</td>
                <td className="td text-right">{pct(rows.reduce((a, r) => a + r.pct, 0) / Math.max(1, rows.length))}</td>
                <td className="td text-right">{fmtDur(rows.reduce((a, r) => a + r.def, 0) * 60)}</td>
                <td className="td text-right">{rows.reduce((a, r) => a + r.problems, 0)}</td>
                <td className="td" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {rows && sectorNames.length > 0 && (
        <>
          <h3 className="mt-4 mb-1 text-[13px] font-bold">Cobertura por setor em cada loja</h3>
          <div className="scroll-x rounded-md border border-line">
            <table className="text-[12px] tnum">
              <thead className="bg-surface-2">
                <tr>
                  <th className="th">Loja</th>
                  {sectorNames.map((n) => (
                    <th key={n} className="th text-right">
                      {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.store.id}>
                    <td className="td font-semibold whitespace-nowrap">{r.store.name}</td>
                    {sectorNames.map((n) => {
                      const v = r.bySector[n];
                      return (
                        <td key={n} className={`td text-right whitespace-nowrap ${!v ? "text-muted" : v.pct >= 99.5 ? "text-green" : v.pct >= 95 ? "text-amber-ink" : "text-red font-semibold"}`}>
                          {v ? `${fmtNum(v.pct, 0)}% · ${v.people}p` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
        <ConfirmBtn kind="ghost" label="Restaurar esta loja para a demonstração" confirmLabel="Substituir dados da loja" onConfirm={() => sim.updateStore((s) => ({ ...demoStore({ name: s.name, network: s.network, start: s.config.startDate }), id: s.id }))} />
      </div>
    </Section>
  );
}
