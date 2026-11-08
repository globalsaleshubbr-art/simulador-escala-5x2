"use client";
// Aplica o horário de funcionamento da loja às faixas de necessidade dos setores, de uma vez,
// com escolha de quais setores recebem e opção de manter setores com horário próprio (exceções).
import React, { useState } from "react";
import { useSim } from "../components/state";
import { Btn } from "../components/ui";
import { fmtTime } from "../engine/time";
import { aplicarHorarioLoja, diferencas } from "./storeHours";
import { deriveMovement } from "./logic";

export function AplicarHorarioSetores() {
  const sim = useSim();
  const st = sim.store;
  const cfg = st.config;
  const setores = st.sectors.filter((s) => !s.hidden);
  const comDif = setores.map((s) => ({ s, dif: diferencas(s, cfg) })).filter((x) => x.dif.length);
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [aberto, setAberto] = useState(false);
  if (!comDif.length) return null;
  const marcado = (id: string, proprio?: boolean) => marcados[id] ?? !proprio;
  const escolhidos = comDif.filter((x) => marcado(x.s.id, x.s.horarioProprio));
  const aplicar = () => {
    const ids = new Set(escolhidos.map((x) => x.s.id));
    sim.updateStore((x) => ({
      ...x,
      sectors: x.sectors.map((s) => {
        if (!ids.has(s.id)) return s;
        const n = aplicarHorarioLoja(s, x.config);
        return { ...n, movement: deriveMovement(n) };
      }),
    }));
    sim.setToast(`Horário da loja aplicado a ${ids.size} ${ids.size === 1 ? "setor" : "setores"}: ${escolhidos.map((x) => x.s.name).join(", ")}. Gere a escala de novo para usar as novas faixas.`);
    setMarcados({});
    setAberto(false);
  };
  const faixa = (a: number | null, b: number | null) => (a == null || b == null ? "—" : `${fmtTime(a)}–${fmtTime(b)}`);
  return (
    <div className="mt-5 rounded-xl border border-amber bg-amber/10 p-4" role="region" aria-label="Horário dos setores">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-[260px] flex-1 text-[13.5px]">
          <b>{comDif.length === 1 ? "1 setor está" : `${comDif.length} setores estão`} com horário diferente do da loja</b> nas faixas de necessidade: {comDif.map((x) => x.s.name).join(", ")}.
        </p>
        <Btn kind="primary" id="horario-setores-revisar" onClick={() => setAberto(!aberto)}>
          {aberto ? "Fechar" : "Aplicar o horário da loja aos setores"}
        </Btn>
      </div>
      {aberto && (
        <div className="mt-4">
          <p className="mb-3 text-[13px] text-muted">
            Marque os setores que devem receber o horário da loja (seg–sáb {cfg.open}–{cfg.close}
            {cfg.sundayOpen ? `, domingo ${cfg.sundayStart}–${cfg.sundayEnd}` : ""}). A primeira faixa passa a começar na abertura e a última termina no fechamento; faixas fora do horário são cortadas. Dias específicos e datas especiais não mudam.
          </p>
          <div className="scroll-x">
            <table className="text-[13px] tnum">
              <thead>
                <tr>
                  <th className="th text-left">Atualizar</th>
                  <th className="th text-left">Setor</th>
                  <th className="th text-left">Hoje</th>
                  <th className="th text-left">Fica</th>
                  <th className="th text-left">Horário próprio</th>
                </tr>
              </thead>
              <tbody>
                {comDif.map(({ s, dif }) => (
                  <tr key={s.id}>
                    <td className="td">
                      <input type="checkbox" id={`hs-${s.id}`} aria-label={`Atualizar ${s.name}`} checked={marcado(s.id, s.horarioProprio)} onChange={(e) => setMarcados({ ...marcados, [s.id]: e.target.checked })} />
                    </td>
                    <td className="td font-semibold">{s.name}</td>
                    <td className="td">{dif.map((g) => `${g.label} ${faixa(g.open, g.close)}`).join(" · ")}</td>
                    <td className="td">{dif.map((g) => `${g.label} ${faixa(g.loja!.open, g.loja!.close)}`).join(" · ")}</td>
                    <td className="td">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!s.horarioProprio}
                          onChange={(e) => {
                            const v = e.target.checked;
                            sim.updateStore((x) => ({ ...x, sectors: x.sectors.map((y) => (y.id === s.id ? { ...y, horarioProprio: v } : y)) }));
                            setMarcados({ ...marcados, [s.id]: !v });
                          }}
                        />
                        <span className="text-muted">exceção (manter)</span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <Btn kind="primary" id="horario-setores-aplicar" disabled={!escolhidos.length} onClick={aplicar}>
              Aplicar a {escolhidos.length} {escolhidos.length === 1 ? "setor" : "setores"}
            </Btn>
            <Btn onClick={() => setAberto(false)}>Cancelar</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
