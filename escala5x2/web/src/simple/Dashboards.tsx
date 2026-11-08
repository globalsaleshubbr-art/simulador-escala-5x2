"use client";
// Dashboards: todos os painéis de leitura num lugar só (faltas, atestados, colaboradores e lojas).
import React from "react";
import { PageHead, type PageId } from "./SimpleApp";
import { AtestadosPage, FaltasPage } from "./Faltas";
import { PeopleCharts } from "./Charts";
import { StoresSummary } from "./StoresSummary";

export type DashTab = "faltas" | "atestados" | "colaboradores" | "lojas";
export const DASH_TABS: { id: DashTab; label: string; hint: string }[] = [
  { id: "faltas", label: "Faltas", hint: "Ranking de faltas" },
  { id: "atestados", label: "Atestados", hint: "Ranking de dias de atestado" },
  { id: "colaboradores", label: "Colaboradores", hint: "Por setor e por função" },
  { id: "lojas", label: "Lojas", hint: "Resumo de cada loja e setor" },
];

export function DashboardsPage({ go, tab }: { go: (p: PageId) => void; tab: DashTab }) {
  const open = (t: DashTab) => {
    try {
      window.location.hash = `dashboards/${t}`;
      window.scrollTo({ top: 0 });
    } catch {
      /* ok */
    }
  };
  return (
    <>
      <div role="tablist" aria-label="Dashboards" className="-mb-2 flex flex-wrap items-center gap-2" id="dash-tabs">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.08em] text-muted">Dashboards</span>
        {DASH_TABS.map((t) => {
          const on = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => open(t.id)}
              title={t.hint}
              className={`rounded-full border px-4 py-2 text-[13.5px] font-semibold transition ${on ? "bg-navy text-navy-ink border-navy" : "bg-surface border-line hover:border-navy-2"}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === "faltas" && <FaltasPage go={go} />}
      {tab === "atestados" && <AtestadosPage go={go} />}
      {tab === "colaboradores" && (
        <>
          <PageHead title="Colaboradores" sub="Quantas pessoas há em cada setor ou função, somando as lojas ou uma por loja." go={go} showSectors={false} />
          <PeopleCharts />
        </>
      )}
      {tab === "lojas" && (
        <>
          <PageHead title="Resumo das lojas" sub="Equipe e cobertura de cada loja, setor a setor." go={go} showSectors={false} />
          <StoresSummary go={go} />
        </>
      )}
    </>
  );
}
