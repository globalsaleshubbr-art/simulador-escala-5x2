"use client";
// Filtro de loja das telas. É UM filtro só para o sistema inteiro: escolher a loja em qualquer tela
// (ou no menu) vale em todas. Com uma loja escolhida, ela também é a loja que Horários, Necessidade
// e Personalizar editam. "Todas as lojas" mostra todas lado a lado.
import React from "react";
import { useSim } from "../components/state";
import { Select } from "../components/ui";
import type { Store } from "../engine/types";

export interface StoreScope {
  stores: Store[];
  /** null = filtro no padrão (todas, ou a seleção do menu) */
  pick: string | null;
  setPick: (v: string | null) => void;
  /** o seletor, ou null quando o usuário só tem uma loja */
  select: React.ReactNode;
  multi: boolean;
}

export function useStoreScope(id: string): StoreScope {
  const sim = useSim();
  const N = sim.stores.length;
  const k = sim.selStores.length;
  const cur = k >= N ? "all" : k === 1 ? sim.selStores[0].id : "sel";
  const setPick = (v: string | null) => {
    if (v === null || v === "all") return sim.setStoreSel(sim.stores.map((s) => s.id));
    if (v === "sel") return;
    sim.setStoreSel([v]);
    if (v !== sim.store.id) sim.setStoreId(v);
  };
  const options = [{ value: "all", label: `Todas as lojas (${N})` }, ...(cur === "sel" ? [{ value: "sel", label: `${k} lojas escolhidas no menu` }] : []), ...sim.stores.map((s) => ({ value: s.id, label: s.name }))];
  const select = N > 1 ? <Select id={id} aria-label="Loja" value={cur} onChange={setPick} options={options} /> : null;
  return { stores: sim.selStores, pick: cur === "all" ? null : cur, setPick, select, multi: k > 1 };
}

/** Seletor de loja para um quadro, entre as lojas que a tela já mostra. */
export function StorePick({ id, stores, value, onChange }: { id: string; stores: Store[]; value: string; onChange: (v: string) => void }) {
  if (stores.length < 2) return null;
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-muted">
      Loja
      <Select id={id} value={stores.some((s) => s.id === value) ? value : "all"} onChange={onChange} options={[{ value: "all", label: "Todas" }, ...stores.map((s) => ({ value: s.id, label: s.name }))]} />
    </label>
  );
}
