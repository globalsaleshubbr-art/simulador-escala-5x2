"use client";
// Jornadas cadastradas pelo usuário: nome, dias de trabalho por semana, horas por dia e intervalo.
// Cada pessoa (Equipe → Regime) ou setor inteiro pode seguir uma delas.
import React from "react";
import { useSim } from "../components/state";
import { Btn, ConfirmBtn, DurInput, Select, TextInput } from "../components/ui";
import type { Jornada } from "../engine/types";
import { intervaloPessoal } from "../engine/model";
import { fmtDur } from "../engine/time";
import { excluirJornada, jornadaResumo, novaJornada, salvarJornada } from "./logic";

const SUGESTOES: { nome: string; diasSemana: number; horasDia: number }[] = [
  { nome: "Meio período", diasSemana: 5, horasDia: 240 },
  { nome: "30 horas", diasSemana: 5, horasDia: 360 },
  { nome: "4 dias de 8h", diasSemana: 4, horasDia: 480 },
  { nome: "6x1 de 7h20", diasSemana: 6, horasDia: 440 },
  { nome: "2 dias de 8h", diasSemana: 2, horasDia: 480 },
];

export function JornadasEditor() {
  const sim = useSim();
  const { store } = sim;
  const cfg = store.config;
  const lista = cfg.jornadas ?? [];
  const salvar = (j: Jornada) => sim.updateStore((st) => salvarJornada(st, j));
  const usando = (id: string) => store.employees.filter((e) => e.jornadaId === id && e.regime !== "12x36").length;
  const setoresUsando = (id: string) => store.sectors.filter((s) => s.jornadaId === id).map((s) => s.name);
  const criar = (base?: Partial<Jornada>) => {
    const nomes = new Set(lista.map((x) => x.nome.trim().toLowerCase()));
    let nome = base?.nome ?? "Nova jornada";
    for (let i = 2; nomes.has(nome.toLowerCase()); i++) nome = `${base?.nome ?? "Nova jornada"} ${i}`;
    const j = novaJornada({ ...base, nome });
    salvar(j);
    sim.setToast(`Jornada “${j.nome}” criada: ${jornadaResumo(j)}. Escolha quem segue essa jornada em Equipe, na coluna “Regime”.`);
    // foco no nome da jornada nova
    setTimeout(() => (document.getElementById(`jr-nome-${j.id}`) as HTMLInputElement | null)?.select(), 50);
  };
  return (
    <div className="flex flex-col gap-4" id="jornadas-editor">
      {lista.length === 0 && <p className="text-[13.5px] text-muted">Nenhuma jornada cadastrada. Todos seguem o modelo da loja ({cfg.folgasPorSemana === 2 ? "5x2" : "6x1"}, {fmtDur(cfg.dailyMin)} por dia) ou o 12x36.</p>}
      {lista.length > 0 && (
        <div className="scroll-x rounded-xl border border-line">
          <table className="w-full text-[13.5px]">
            <thead className="bg-surface-2">
              <tr>
                <th className="th text-left">Nome da jornada</th>
                <th className="th text-left">Dias de trabalho por semana</th>
                <th className="th text-left">Horas por dia</th>
                <th className="th text-left">Intervalo</th>
                <th className="th text-left">Total</th>
                <th className="th text-left">Quem segue</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {lista.map((j) => {
                const semana = j.diasSemana * j.horasDia;
                const auto = intervaloPessoal({}, j.horasDia, 60);
                const n = usando(j.id);
                const secs = setoresUsando(j.id);
                const avisos: string[] = [];
                if (j.horasDia > cfg.maxDailyMin) avisos.push(`acima do limite diário da loja (${fmtDur(cfg.maxDailyMin)})`);
                if (semana > cfg.weeklyMaxMin) avisos.push(`acima do limite semanal da loja (${fmtDur(cfg.weeklyMaxMin)})`);
                return (
                  <tr key={j.id} className="border-t border-line align-top" data-jornada={j.id}>
                    <td className="td" style={{ minWidth: 200 }}>
                      <TextInput id={`jr-nome-${j.id}`} aria-label="Nome da jornada" className="w-full" value={j.nome} onChange={(v) => v.trim() && salvar({ ...j, nome: v.trim() })} />
                    </td>
                    <td className="td">
                      <Select
                        id={`jr-dias-${j.id}`}
                        aria-label="Dias de trabalho por semana"
                        value={j.diasSemana}
                        onChange={(v: number) => {
                          salvar({ ...j, diasSemana: v });
                          if (n) sim.setToast(`“${j.nome}” agora tem ${v} ${v === 1 ? "dia" : "dias"} por semana: a escala de ${n} ${n === 1 ? "pessoa foi refeita" : "pessoas foi refeita"}.`);
                        }}
                        options={[1, 2, 3, 4, 5, 6].map((d) => ({ value: d, label: `${d} ${d === 1 ? "dia" : "dias"} (${7 - d} ${7 - d === 1 ? "folga" : "folgas"})` }))}
                      />
                    </td>
                    <td className="td">
                      <DurInput id={`jr-horas-${j.id}`} aria-label="Horas por dia" value={j.horasDia} onChange={(v) => (v > 0 && v <= 16 * 60 ? salvar({ ...j, horasDia: v }) : sim.setToast("Informe as horas por dia entre 0h01 e 16h."))} />
                    </td>
                    <td className="td">
                      <Select
                        id={`jr-int-${j.id}`}
                        aria-label="Intervalo"
                        value={j.intervaloMin ?? -1}
                        onChange={(v: number) => salvar({ ...j, intervaloMin: v < 0 ? null : v })}
                        options={[{ value: -1, label: `Automático (${auto ? fmtDur(auto) : "sem intervalo"})` }, { value: 0, label: "Sem intervalo" }, ...[15, 30, 60, 90, 120].map((m) => ({ value: m, label: fmtDur(m) }))]}
                      />
                    </td>
                    <td className="td whitespace-nowrap">
                      <b className={avisos.length ? "text-red" : ""} id={`jr-total-${j.id}`}>
                        {fmtDur(semana)} por semana
                      </b>
                      {avisos.length > 0 && <span className="mt-1 block max-w-[220px] whitespace-normal text-[12px] text-red">{avisos.join("; ")}.</span>}
                    </td>
                    <td className="td text-[13px]">
                      {n} {n === 1 ? "pessoa" : "pessoas"}
                      {secs.length > 0 && <span className="block text-[12px] text-muted">Setor: {secs.join(", ")}</span>}
                    </td>
                    <td className="td text-right">
                      <ConfirmBtn
                        label="Excluir"
                        confirmLabel={n ? `Excluir (${n} ${n === 1 ? "volta" : "voltam"} para a jornada da loja)` : "Excluir jornada"}
                        onConfirm={() => {
                          sim.updateStore((st) => excluirJornada(st, j.id));
                          sim.setToast(`Jornada “${j.nome}” excluída.${n ? ` ${n} ${n === 1 ? "pessoa voltou" : "pessoas voltaram"} para a jornada da loja.` : ""}`);
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <Btn kind="primary" id="jr-nova" onClick={() => criar()}>
          + Nova jornada
        </Btn>
        <span className="text-[13px] text-muted">ou comece de um exemplo:</span>
        {SUGESTOES.map((s) => (
          <button key={s.nome} type="button" className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] hover:bg-surface-2" onClick={() => criar(s)}>
            {s.nome} <span className="text-muted">· {jornadaResumo(s).replace(" por semana", "")}</span>
          </button>
        ))}
      </div>
      <p className="text-[12.5px] text-muted">
        A pessoa entra no horário do turno dela e sai depois das horas da jornada (mais o intervalo). As folgas da semana são os dias que sobram (ex.: 4 dias de trabalho = 3 folgas). Domingos e feriados seguem a regra de domingo do setor; no domingo, se o turno for mais curto, vale o turno de domingo. Escolha a jornada de cada pessoa em Equipe (coluna “Regime”) ou de um setor inteiro em “Modelo por setor”. Confira os limites na convenção coletiva.
      </p>
    </div>
  );
}
