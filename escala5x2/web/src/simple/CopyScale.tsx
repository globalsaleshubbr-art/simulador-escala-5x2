"use client";
import React, { useState } from "react";
import { useSim } from "../components/state";
import { Btn, Select } from "../components/ui";
import { Card, CardTitle } from "./SimpleApp";
import { copyToTargets, type CopyParts, type CopyPreview, type CopyTarget } from "./scaleCopy";

const PARTS: { key: keyof CopyParts; label: string; hint: string }[] = [
  { key: "turnos", label: "Turnos e intervalos", hint: "Inclui turnos de domingo, janelas de intervalo e cores; as pessoas do destino vão para o turno de mesmo nome" },
  { key: "necessidade", label: "Fluxo alto (pessoas por horário)", hint: "Faixas por horário e exceções" },
  { key: "regras", label: "Regras de folga das pessoas", hint: "Turno, folga fixa, preferência e domingos (Time A/B), pela posição na lista" },
  { key: "folgas", label: "Folgas já geradas no período", hint: "Dia a dia, pela posição na lista; dias fixados à mão, férias e faltas não mudam" },
  { key: "vagas", label: "Criar as vagas que faltam no destino", hint: "Se o destino tiver menos pessoas que a origem, cria pessoas sem nome para a escala ficar inteira (os nomes você preenche em Equipe)" },
];
const ALL: Required<CopyParts> = { turnos: true, necessidade: true, regras: true, folgas: true, vagas: true };

/** Painel "Copiar escala": origem, destinos (vários, inclusive em outras lojas), componentes, prévia e confirmação. */
export function CopyScalePanel({ onClose, whole }: { onClose: () => void; /** abre com "Toda a escala" marcada (a partir da tela Escala) */ whole?: boolean }) {
  const sim = useSim();
  const multiStore = sim.stores.length > 1;
  const key = (storeId: string, sectorId: string) => `${storeId}|${sectorId}`;
  const options = sim.stores.flatMap((st) => st.sectors.filter((s) => !s.hidden).map((s) => ({ value: key(st.id, s.id), label: multiStore ? `${st.name} · ${s.name}` : s.name, storeId: st.id, sectorId: s.id })));
  const [src, setSrc] = useState(key(sim.store.id, sim.sector.id));
  const [dests, setDests] = useState<string[]>([]);
  const [parts, setParts] = useState<CopyParts>(whole ? ALL : { turnos: true, necessidade: true, regras: false, folgas: false, vagas: false });
  const [preview, setPreview] = useState<CopyPreview[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const srcOpt = options.find((o) => o.value === src) ?? options[0];
  const targets: CopyTarget[] = dests.filter((d) => d !== src).map((d) => ({ storeId: d.split("|")[0], sectorId: d.split("|")[1] }));
  const allParts = PARTS.every((p) => !!parts[p.key]);
  const anyPart = PARTS.some((p) => p.key !== "vagas" && parts[p.key]);
  const reset = () => {
    setPreview(null);
    setConfirm(false);
  };
  const needsConfirm = !!preview?.some((p) => p.replaces);
  const apply = () => {
    const r = copyToTargets(sim.stores, srcOpt.storeId, srcOpt.sectorId, targets, parts);
    r.stores.forEach((st, id) => sim.updateStoreById(id, () => ({ ...st })));
    sim.setToast(`Escala copiada para ${r.previews.length} ${r.previews.length === 1 ? "setor" : "setores"}. Cada um pode ser editado separadamente; gere a escala de cada setor para reorganizar as folgas.`);
    onClose();
  };

  return (
    <Card id="copy-scale">
      <CardTitle sub="Use a estrutura de um setor em outros setores (da mesma loja ou de outras) sem configurar tudo de novo. Nada é substituído sem a sua confirmação." actions={<Btn onClick={onClose}>Fechar</Btn>}>
        Copiar escala
      </CardTitle>
      <div className="grid gap-5 lg:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-bold uppercase tracking-wide text-muted">Copiar de</span>
          <Select
            id="cp-src"
            value={srcOpt.value}
            onChange={(v) => {
              setSrc(v);
              setDests((d) => d.filter((x) => x !== v));
              reset();
            }}
            options={options.map((o) => ({ value: o.value, label: o.label }))}
          />
        </label>
        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-[12px] font-bold uppercase tracking-wide text-muted">Para (escolha um ou mais)</span>
          <div className="flex flex-wrap gap-2" id="cp-dests">
            {options
              .filter((o) => o.value !== srcOpt.value)
              .map((o) => {
                const on = dests.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setDests(on ? dests.filter((x) => x !== o.value) : [...dests, o.value]);
                      reset();
                    }}
                    className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${on ? "bg-navy text-navy-ink border-navy" : "bg-surface border-line text-muted hover:text-ink"}`}
                  >
                    {o.label}
                    {on && " ✓"}
                  </button>
                );
              })}
          </div>
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <span className="text-[12px] font-bold uppercase tracking-wide text-muted">O que copiar</span>
          <label className="inline-flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              id="cp-all"
              checked={allParts}
              onChange={(e) => {
                setParts(e.target.checked ? ALL : { turnos: false, necessidade: false, regras: false, folgas: false, vagas: false });
                reset();
              }}
            />
            Toda a escala
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {PARTS.map((p) => (
            <label key={p.key} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[13.5px]">
              <input
                type="checkbox"
                id={`cp-${p.key}`}
                className="mt-1"
                checked={!!parts[p.key]}
                onChange={(e) => {
                  setParts({ ...parts, [p.key]: e.target.checked });
                  reset();
                }}
              />
              <span>
                <b>{p.label}</b>
                <span className="block text-[12.5px] text-muted">{p.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2.5">
        <Btn
          kind="primary"
          id="cp-preview"
          disabled={!targets.length || !anyPart}
          onClick={() => {
            setPreview(copyToTargets(sim.stores, srcOpt.storeId, srcOpt.sectorId, targets, parts).previews);
            setConfirm(false);
          }}
        >
          Ver prévia
        </Btn>
        {!targets.length && <span className="self-center text-[13px] text-muted">Escolha pelo menos um setor de destino.</span>}
      </div>
      {preview && (
        <div className="mt-5 flex flex-col gap-3" id="cp-result">
          {preview.map((p) => (
            <div key={p.label} className="rounded-xl border border-line px-5 py-4 text-[13.5px]">
              <div className="text-[14.5px] font-bold">
                {srcOpt.label} → {p.label}
              </div>
              <ul className="mt-2 list-disc pl-5 leading-relaxed">
                {p.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              {p.warnings.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-amber-ink">
                  {p.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              {p.pairs.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[13px] underline text-muted">Ver quem recebe o padrão de quem ({p.pairs.length})</summary>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2 text-[13px]">
                    {p.pairs.map((x) => (
                      <li key={x.dest + x.src}>
                        <b>{x.dest}</b> ← {x.src}: <span className="text-muted">{x.detail}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
          {needsConfirm && (
            <label className="inline-flex items-start gap-2.5 rounded-xl border border-pink-line bg-pink px-4 py-3 text-[13.5px]">
              <input type="checkbox" id="cp-confirm" className="mt-1" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
              Entendo que o que já existe nos setores de destino, como listado acima, será substituído.
            </label>
          )}
          <div className="flex flex-wrap gap-2.5">
            <Btn kind="primary" id="cp-apply" disabled={(needsConfirm && !confirm) || preview.every((p) => !p.lines.length)} onClick={apply}>
              Copiar para {preview.length} {preview.length === 1 ? "setor" : "setores"}
            </Btn>
            <Btn onClick={reset}>Cancelar</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}
