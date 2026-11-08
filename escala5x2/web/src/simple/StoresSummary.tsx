"use client";
// Resumo por loja e setor (dashboard "Lojas").
import React from "react";
import { useSim, pct } from "../components/state";
import { Card, CardTitle, type PageId } from "./SimpleApp";
import { analyzeSectorCached } from "../engine/analysis";
import { fmtDur } from "../engine/time";
import { useStoreScope } from "./StoreScope";

/** Resumo por loja × setor quando há várias lojas marcadas no filtro. */
export function StoresSummary({ go }: { go: (p: PageId) => void }) {
  const sim = useSim();
  const sc = useStoreScope("sum-store");
  const rows = sc.stores.flatMap((st) =>
    st.sectors
      .filter((sec) => !sec.hidden)
      .map((sec) => {
        const n = st.employees.filter((e) => e.sectorId === sec.id).length;
        if (!n && !sec.minRules.length) return null;
        const an = analyzeSectorCached(st, sec.id);
        return { st, sec, n, pct: an.totals.pct, def: an.totals.deficitHoursPerWeek, prob: an.alerts.filter((x) => x.severity === "problema").length, att: an.alerts.filter((x) => x.severity === "atencao").length };
      })
      .filter(<T,>(x: T | null): x is T => !!x),
  );
  return (
    <Card id="stores-summary">
      <CardTitle
        sub="Uma linha por loja e setor. Clique no nome da loja para editá-la (Horários, Fluxo alto e Personalizar passam a valer para ela)."
        actions={
          sc.select ? (
            <label className="inline-flex items-center gap-2 text-[13px] text-muted">
              Loja
              {sc.select}
            </label>
          ) : undefined
        }
      >
        Resumo das lojas
      </CardTitle>
      <div className="scroll-x">
        <table className="w-full text-[13.5px] tnum">
          <thead>
            <tr>
              <th className="th">Loja</th>
              <th className="th">Setor</th>
              <th className="th text-right">Pessoas</th>
              <th className="th text-right">Horários cobertos</th>
              <th className="th text-right">Horas faltando/sem.</th>
              <th className="th text-right">Problemas</th>
              <th className="th text-right">Atenção</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const here = r.st.id === sim.store.id && r.sec.id === sim.sector.id;
              return (
                <tr key={r.st.id + r.sec.id} className={here ? "bg-surface-2" : ""}>
                  <td className="td">
                    {r.st.id === sim.store.id ? (
                      <b>{r.st.name}</b>
                    ) : (
                      <button type="button" className="underline hover:text-ink" onClick={() => sim.setStoreId(r.st.id)}>
                        {r.st.name}
                      </button>
                    )}
                  </td>
                  <td className="td">
                    <button
                      type="button"
                      className={`underline hover:text-ink ${here ? "font-bold" : ""}`}
                      onClick={() => {
                        if (r.st.id !== sim.store.id) sim.setStoreId(r.st.id);
                        sim.setSectorId(r.sec.id);
                        go("escala");
                      }}
                    >
                      {r.sec.name}
                    </button>
                  </td>
                  <td className="td text-right">{r.n}</td>
                  <td className={`td text-right font-bold ${!r.sec.minRules.length ? "text-muted" : r.pct >= 99.5 ? "text-green" : r.pct >= 95 ? "text-amber-ink" : "text-red"}`}>{r.sec.minRules.length ? pct(r.pct) : "sem necessidade"}</td>
                  <td className={`td text-right ${r.def > 0 ? "text-red font-bold" : ""}`}>{fmtDur(r.def * 60)}</td>
                  <td className={`td text-right ${r.prob ? "text-red font-bold" : "text-muted"}`}>{r.prob}</td>
                  <td className="td text-right text-muted">{r.att}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

