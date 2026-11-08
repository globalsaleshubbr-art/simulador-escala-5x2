"use client";
import React, { useEffect, useRef, useState } from "react";
import { useSim } from "../components/state";

/**
 * Filtro de lojas (uma, várias ou todas). A loja em uso (a que as telas de configuração editam)
 * sempre faz parte da seleção; a seleção fica guardada neste navegador.
 */
export function StoreFilter() {
  const sim = useSim();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", on);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", on);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const sel = sim.storeSel;
  const n = sel.length;
  const list = sim.stores.filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string) => {
    if (sel.includes(id)) {
      if (n === 1) return; // ao menos uma loja
      sim.setStoreSel(sel.filter((x) => x !== id));
    } else sim.setStoreSel([...sel, id]);
  };
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        id="store-filter"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
        className="w-full rounded-xl bg-navy-2 px-3.5 py-2.5 text-left hover:brightness-110"
      >
        <div className="text-[14px] font-bold leading-tight truncate">{n === 1 ? sim.store.name : `${n} lojas selecionadas`}</div>
        <div className="text-[12px] truncate">{n === 1 ? sim.store.network : `em edição: ${sim.store.name}`} ▾</div>
      </button>
      {open && (
        <div role="dialog" aria-label="Escolher lojas" className="absolute left-0 right-0 z-40 mt-2 rounded-xl border border-line bg-surface p-3 text-ink shadow-xl lg:right-auto lg:w-[300px]">
          <input id="store-q" className="field w-full" placeholder="Buscar loja pelo nome" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-2 flex justify-between text-[12.5px]">
            <button type="button" className="underline text-muted hover:text-ink" onClick={() => sim.setStoreSel(sim.stores.map((s) => s.id))}>
              Selecionar todas
            </button>
            <button type="button" className="underline text-muted hover:text-ink" onClick={() => sim.setStoreSel([sim.store.id])} title="Fica só a loja em edição">
              Limpar seleção
            </button>
          </div>
          <ul className="mt-2 max-h-[300px] overflow-auto">
            {list.map((s) => {
              const on = sel.includes(s.id);
              const editing = s.id === sim.store.id;
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[13.5px]">
                    <input type="checkbox" checked={on} disabled={on && n === 1} onChange={() => toggle(s.id)} />
                    <span className="truncate">{s.name}</span>
                  </label>
                  {editing ? (
                    <span className="shrink-0 text-[11px] font-bold uppercase text-muted">Em edição</span>
                  ) : (
                    <button
                      type="button"
                      className="shrink-0 text-[12px] underline text-muted hover:text-ink"
                      onClick={() => {
                        if (!on) sim.setStoreSel([...sel, s.id]);
                        sim.setStoreId(s.id);
                      }}
                      title="Horários, Fluxo alto e Personalizar passam a editar esta loja"
                    >
                      Editar esta
                    </button>
                  )}
                </li>
              );
            })}
            {!list.length && <li className="px-2 py-2 text-[13px] text-muted">Nenhuma loja com esse nome.</li>}
          </ul>
          <button
            type="button"
            id="store-manage"
            className="mt-2 w-full rounded-lg border border-dashed border-line px-3 py-2 text-[13px] font-semibold hover:bg-surface-2"
            onClick={() => {
              setOpen(false);
              window.location.hash = "lojas";
            }}
          >
            + Cadastrar lojas
          </button>
          <p className="mt-2 text-[11.5px] text-muted">Este é o mesmo filtro “Loja” de todas as telas: mudar aqui ou numa tela muda em todas. Com uma loja só, ela é a que Horários, Fluxo alto e Personalizar editam.</p>
        </div>
      )}
    </div>
  );
}
