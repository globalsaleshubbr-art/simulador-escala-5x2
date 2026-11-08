"use client";
// Modelo de escala de um setor: segue a loja (5x2/6x1) ou 12x36 (todos em plantão, dia sim, dia não).
// Mudar pede confirmação, porque refaz a escala de todo o setor.
import React, { useState } from "react";
import { useSim } from "../components/state";
import { Btn, Select } from "../components/ui";
import type { Store } from "../engine/types";
import { aplicarFolgasSetor, aplicarJornadaSetor, aplicarModelo12x36Setor, jornadaResumo } from "./logic";

const emps0 = (st: Store, sectorId: string) => st.employees.filter((e) => e.sectorId === sectorId);
import { fmtDur } from "../engine/time";

/** "loja", "f2" (5x2), "f1" (6x1), "12x36" ou "j:<id>" (jornada cadastrada) */
type Modelo = string;

export function nomeModeloLoja(st: Store): string {
  const f = st.config.folgasPorSemana;
  return f === 2 ? "5x2" : f === 1 ? "6x1" : `${7 - f}x${f}`;
}

export function ModeloSetorEditor({ st, sectorId, compacto = false }: { st: Store; sectorId: string; compacto?: boolean }) {
  const sim = useSim();
  const sec = st.sectors.find((s) => s.id === sectorId);
  const [pend, setPend] = useState<Modelo | null>(null);
  if (!sec) return null;
  const jornadas = st.config.jornadas ?? [];
  const jAtual = sec.jornadaId ? jornadas.find((j) => j.id === sec.jornadaId) : undefined;
  const atual: Modelo = sec.modeloEscala === "12x36" ? "12x36" : jAtual ? `j:${jAtual.id}` : sec.folgasSemana != null ? `f${sec.folgasSemana}` : "loja";
  const fPend = pend === "loja" ? st.config.folgasPorSemana : pend?.startsWith("f") ? Number(pend.slice(1)) : null;
  const nomeF = (f: number) => (f === 2 ? "5x2" : f === 1 ? "6x1" : `${7 - f}x${f}`);
  const modeloAtualTxt = sec.folgasSemana != null ? nomeF(sec.folgasSemana) : null;
  const excecoes = emps0(st, sec.id).filter((e) => e.regime === "12x36" || e.jornadaId || e.folgasSemana != null).length;
  const jPend = pend?.startsWith("j:") ? jornadas.find((j) => j.id === pend.slice(2)) : undefined;
  const loja = nomeModeloLoja(st);
  const emps = st.employees.filter((e) => e.sectorId === sec.id);
  const em12 = emps.filter((e) => e.regime === "12x36").length;
  const fora = emps.length - em12;
  const aplicar = () => {
    if (!pend) return;
    const p = pend;
    sim.updateStoreById(st.id, (x) => (p === "12x36" ? aplicarModelo12x36Setor(x, sec.id) : p.startsWith("j:") ? aplicarJornadaSetor(x, sec.id, p.slice(2)) : aplicarFolgasSetor(x, sec.id, p === "loja" ? null : Number(p.slice(1)))));
    sim.setToast(p === "12x36" ? `${sec.name} agora é 12x36: a equipe foi dividida em Plantão A e Plantão B, dia sim, dia não.` : jPend ? `${sec.name} agora segue a jornada “${jPend.nome}”: ${jornadaResumo(jPend)}.` : `${sec.name} agora está no ${nomeF(fPend!)}${p === "loja" ? " (igual à loja)" : ""}. A escala do setor foi refeita.`);
    setPend(null);
  };
  return (
    <div className="flex flex-col gap-3" data-modelo-setor={sec.id}>
      <div className={compacto ? "" : "flex flex-wrap items-end gap-x-6 gap-y-2"}>
        <label className="flex max-w-[480px] flex-col gap-1.5">
          <span className="text-[12px] font-bold uppercase tracking-wide text-muted">{compacto ? sec.name : `Modelo de escala de ${sec.name}`}</span>
          <Select
            id={`modelo-setor-${sec.id}`}
            value={pend ?? atual}
            onChange={(v: Modelo) => setPend(v === atual ? null : v)}
            options={[
              { value: "loja", label: `Igual à loja (${loja})` },
              { value: "f2", label: "5x2 · 2 folgas por semana" },
              { value: "f1", label: "6x1 · 1 folga por semana" },
              ...jornadas.map((j) => ({ value: `j:${j.id}`, label: `${j.nome} · ${j.diasSemana}d × ${fmtDur(j.horasDia)}` })),
              { value: "12x36", label: "12x36 · dia sim, dia não" },
            ]}
          />
        </label>
        {!compacto && (
          <p className="max-w-[560px] pb-1 text-[13px] text-muted">
            {jAtual
              ? `Todo o setor segue a jornada “${jAtual.nome}” (${jornadaResumo(jAtual)}). Quem entrar no setor recebe essa jornada; exceções se escolhem na coluna “Regime”.`
              : atual === "12x36"
              ? `Plantão A e Plantão B se revezam dia sim, dia não, inclusive domingos e feriados.${fora ? ` ${fora} ${fora === 1 ? "pessoa está" : "pessoas estão"} em ${loja} como exceção.` : ""} Os plantões ficam em Horários; a exceção se escolhe na coluna “Regime”.`
              : `${modeloAtualTxt ? `O setor está no ${modeloAtualTxt}, mesmo se a loja mudar.` : `O setor segue o modelo da loja (${loja}).`}${excecoes ? ` ${excecoes} ${excecoes === 1 ? "pessoa tem" : "pessoas têm"} regime próprio (escolhido na coluna “Regime”).` : ""} Cada pessoa pode ter outro regime (5x2, 6x1, jornada ou 12x36) na coluna “Regime”.`}
          </p>
        )}
      </div>
      {pend && (
        <div className="rounded-xl border border-navy-2 bg-surface-2 p-4 text-[13.5px]" role="region" aria-label={`Mudar modelo de ${sec.name}`}>
          {pend === "12x36" ? (
            <>
              <p className="font-bold">Passar {sec.name} para 12x36?</p>
              <p className="mt-1 text-muted">
                {emps.length ? `As ${emps.length} pessoas do setor passam` : "Quem entrar no setor passa"} a trabalhar dia sim, dia não (inclusive domingos e feriados), metade de cada turno no Plantão A e metade no Plantão B.
                {sec.shifts.some((s) => s.plantao) ? "" : " O setor ganha um plantão das 07h às 19h, que você ajusta em Horários (pode ser noturno)."} Os outros setores não mudam. O que você fixou à mão na escala é mantido.
              </p>
            </>
          ) : jPend ? (
            <>
              <p className="font-bold">Passar {sec.name} para a jornada “{jPend.nome}”?</p>
              <p className="mt-1 text-muted">
                {emps.length ? `As ${emps.length} pessoas do setor passam` : "Quem entrar no setor passa"} a trabalhar {jornadaResumo(jPend)}, entrando no horário do próprio turno. A escala do setor é refeita; os outros setores não mudam. O que você fixou à mão é mantido.
              </p>
            </>
          ) : (
            <>
              <p className="font-bold">
                Passar {sec.name} para {nomeF(fPend!)}
                {pend === "loja" ? " (igual à loja)" : ""}?
              </p>
              <p className="mt-1 text-muted">
                Todas as {emps.length} pessoas do setor passam a ter {7 - fPend!} dias de trabalho e {fPend} {fPend === 1 ? "folga" : "folgas"} por semana
                {excecoes ? `, inclusive as ${excecoes} que hoje têm regime próprio (12x36, jornada, 5x2 ou 6x1 escolhido por pessoa)` : ""}. A escala do setor é refeita; os outros setores não mudam.
                {pend === "loja" ? " Se o modelo da loja mudar, o setor muda junto." : " O setor fica nesse modelo mesmo se o da loja mudar."} Depois, você pode deixar exceções na coluna “Regime” (ex.: estagiários em 6x1 e CLT em 5x2).
              </p>
            </>
          )}
          <div className="mt-3 flex flex-wrap gap-2.5">
            <Btn kind="primary" id={`modelo-setor-aplicar-${sec.id}`} onClick={aplicar}>
              {pend === "12x36" ? `Aplicar 12x36 em ${sec.name}` : jPend ? `Aplicar “${jPend.nome}” em ${sec.name}` : `Aplicar ${nomeF(fPend!)} em ${sec.name}`}
            </Btn>
            <Btn onClick={() => setPend(null)}>Cancelar</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
