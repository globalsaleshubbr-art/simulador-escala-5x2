"use client";
// Limpar a escala de um ou mais meses: os dias ficam em branco (quadradinhos vazios) até "Gerar escala".
// Férias, faltas e atestados nunca são apagados. Pode ser desfeito.
import React, { useState } from "react";
import { useSim } from "../components/state";
import { Btn } from "../components/ui";
import { buildDays } from "../engine/model";
import { limparEscala } from "./logic";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;

export function LimparEscalaPanel({ onClose, sectorId, mes }: { onClose: () => void; /** setor mostrado (ex.: o escolhido na visão do mês); padrão: o da tela */ sectorId?: string; /** mês já marcado ("AAAA-MM"), ex.: o mês aberto na visão do mês */ mes?: string }) {
  const sim = useSim();
  const { store } = sim;
  const sector = (sectorId && store.sectors.find((s) => s.id === sectorId)) || sim.sector;
  const [onde, setOnde] = useState<"setor" | "loja">("setor");
  const [fixos, setFixos] = useState(false);
  const [almocos, setAlmocos] = useState(false);
  const secs = onde === "setor" ? [sector] : store.sectors.filter((s) => !s.hidden);
  // meses que dá para limpar: os do período planejado e os que já têm escala lançada
  const periodo = buildDays(store.config).map((d) => d.date.slice(0, 7));
  const comEscala = secs.flatMap((s) => Object.values(s.schedule).flatMap((row) => Object.keys(row).map((d) => d.slice(0, 7))));
  const opcoes = Array.from(new Set([...periodo, ...comEscala, ...(mes ? [mes] : [])])).sort();
  const [meses, setMeses] = useState<string[]>(() => (mes ? [mes] : Array.from(new Set(periodo))));
  const marcados = new Set(meses);
  const nFixos = secs.reduce((n, s) => n + Object.values(s.schedule).reduce((m, row) => m + Object.entries(row).filter(([d, c]) => marcados.has(d.slice(0, 7)) && c.lock && c.c !== "A" && c.c !== "M" && c.c !== "V").length, 0), 0);
  const nomes = meses.slice().sort().map(nomeMes);
  const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}` : nomes[0] ?? "";
  const aplicar = () => {
    if (!meses.length) return;
    sim.updateStore((st) => limparEscala(st, secs.map((s) => s.id), { fixos, almocos, meses }));
    sim.setReport(null);
    sim.clearManualEdit();
    sim.setToast(`Escala de ${lista} limpa ${onde === "setor" ? `em ${sector.name}` : "em todos os setores"}: os dias ficaram em branco.${!fixos && nFixos ? ` Os ${nFixos} dias fixados à mão foram mantidos.` : ""} Clique em Gerar escala para montar de novo.`);
    onClose();
  };
  return (
    <div className="rounded-2xl border border-navy-2 bg-surface px-6 py-5" role="region" aria-label="Limpar escala" id="limpar-painel">
      <div className="text-[16px] font-bold">Limpar escala</div>
      <p className="mt-1 max-w-[90ch] text-[13.5px] text-muted">
        Apaga a escala dos meses escolhidos: os dias ficam em branco até você clicar em <b>Gerar escala</b>. Férias, faltas e atestados nunca são apagados. Se mudar de ideia, use <b>Desfazer</b> logo depois.
      </p>
      <div className="mt-4 flex flex-col gap-3.5 text-[14px]">
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-bold uppercase tracking-wide text-muted">Meses</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Meses para limpar" id="limpar-meses">
            {opcoes.map((m) => {
              const on = marcados.has(m);
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={on}
                  data-mes={m}
                  onClick={() => setMeses(on ? meses.filter((x) => x !== m) : [...meses, m])}
                  className={`rounded-xl border px-3.5 py-1.5 text-[13.5px] font-semibold capitalize ${on ? "border-navy bg-navy text-navy-ink" : "border-line bg-surface hover:bg-surface-2"}`}
                >
                  {on ? "✓ " : ""}
                  {nomeMes(m)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Onde limpar">
          {(
            [
              ["setor", `Só ${sector.name}`],
              ["loja", "Todos os setores desta loja"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={onde === k} id={`limpar-${k}`} onClick={() => setOnde(k)} className={`rounded-xl border px-4 py-2 text-[13.5px] font-semibold ${onde === k ? "border-navy bg-navy text-navy-ink" : "border-line bg-surface hover:bg-surface-2"}`}>
              {l}
            </button>
          ))}
        </div>
        <label className="inline-flex items-start gap-2.5">
          <input type="checkbox" id="limpar-fixos" className="mt-1" checked={fixos} onChange={(e) => setFixos(e.target.checked)} />
          <span>
            Apagar também os dias que eu fixei à mão
            <span className="block text-[12.5px] text-muted">{nFixos ? `${nFixos} ${nFixos === 1 ? "dia fixado" : "dias fixados"} nos meses escolhidos (trocas de folga, domingos escolhidos). Sem marcar, eles ficam.` : "Não há dias fixados à mão nos meses escolhidos."}</span>
          </span>
        </label>
        <label className="inline-flex items-start gap-2.5">
          <input type="checkbox" id="limpar-almocos" className="mt-1" checked={almocos} onChange={(e) => setAlmocos(e.target.checked)} />
          <span>
            Apagar também os horários de almoço
            <span className="block text-[12.5px] text-muted">O horário fixo de cada pessoa e os mudados só num dia. O sistema sugere horários novos na hora. Sem marcar, os almoços ficam como estão.</span>
          </span>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Btn kind="primary" id="limpar-ok" onClick={aplicar} disabled={!meses.length}>
          {meses.length ? `Limpar ${lista}` : "Escolha pelo menos um mês"}
        </Btn>
        <Btn onClick={onClose}>Cancelar</Btn>
      </div>
    </div>
  );
}
