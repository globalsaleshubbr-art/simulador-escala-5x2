"use client";
// Regra de domingo (1x1, 2x1, 3x1 ou por pessoa) da loja ou de um setor, com prévia dos próximos domingos
// antes de aplicar: o RH confere quem trabalha e quem folga em cada domingo e só então confirma.
import React, { useMemo, useState } from "react";
import { useSim } from "../components/state";
import { Btn, Select } from "../components/ui";
import type { Employee, Sector, Store } from "../engine/types";
import { addDays, nextSunday, sundayIndex } from "../engine/time";
import { clearUnlocked } from "../engine/solver";
import { aplicarRegraDomingo, nomeRegra, regraDomingo, teamOf, teamOffOnSunday, type RegraDom } from "./logic";
import { PlantaoPill, TeamPill } from "./MonthView";
import { folgaFixaDomingo, isPlantao, plantaoTrabalha } from "../engine/model";

type Escolha = "loja" | "ind" | "1" | "2" | "3" | "4";
const escolhaDe = (rule: RegraDom, work: number): Escolha => (rule === "individual" ? "ind" : (String(Math.min(4, work)) as Escolha));
const regraDe = (e: Escolha): { rule: RegraDom | "loja"; work: number } => (e === "loja" ? { rule: "loja", work: 1 } : e === "ind" ? { rule: "individual", work: 1 } : { rule: "alternado", work: Number(e) });

export const OPCOES_REGRA: { value: Escolha; label: string }[] = [
  { value: "1", label: "1x1 · domingo sim, domingo não" },
  { value: "2", label: "2x1 · trabalha 2 domingos, folga 1" },
  { value: "3", label: "3x1 · trabalha 3 domingos, folga 1" },
  { value: "4", label: "4x1 · trabalha 4 domingos, folga 1" },
  { value: "ind", label: "Cada pessoa com sua regra" },
];

/** Situação da pessoa num domingo pela regra (sem olhar a escala gerada). */
export function domingoPrevisto(e: Employee, iso: string): "T" | "F" | "?" {
  if (isPlantao(e)) return plantaoTrabalha(e, iso) ? "T" : "F";
  if (folgaFixaDomingo(e) || e.sundayCycle === 0) return "F";
  const t = teamOf(e);
  if (t) return teamOffOnSunday(iso, e.sundayCycle) === t ? "F" : "T";
  if (e.sundayOffset > 0) {
    const N = Math.max(1, e.sundayCycle);
    return (((sundayIndex(iso) - (e.sundayOffset - 1)) % N) + N) % N === 0 ? "F" : "T";
  }
  return e.sundayCycle === 1 ? "F" : "?";
}

/** Próximos domingos a partir do início do planejamento. */
function proximosDomingos(store: Store, n = 8): string[] {
  const first = nextSunday(store.config.startDate);
  return Array.from({ length: n }, (_, i) => addDays(first, i * 7));
}

function Previa({ store, sectors }: { store: Store; sectors: Sector[] }) {
  const sundays = proximosDomingos(store);
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return (
    <div className="flex flex-col gap-3">
      {sectors.map((sec) => {
        const emps = store.employees.filter((e) => e.sectorId === sec.id);
        const { rule, work, ciclo } = regraDomingo(store, sec);
        const counts = sundays.map((d) => emps.filter((e) => domingoPrevisto(e, d) === "T").length);
        const auto = emps.filter((e) => sundays.some((d) => domingoPrevisto(e, d) === "?")).length;
        return (
          <details key={sec.id} className="rounded-xl border border-line bg-surface" open={sectors.length === 1}>
            <summary className="cursor-pointer px-4 py-3 text-[13.5px]">
              <b>{sec.name}</b> <span className="text-muted">· {nomeRegra(rule, work)} · {emps.length} pessoas</span>
              <span className="mt-1 block text-[12.5px] text-muted tnum">Trabalham por domingo: {counts.map((n, i) => `${dm(sundays[i])}: ${n}`).join(" · ")}</span>
            </summary>
            <div className="scroll-x border-t border-line px-2 pb-3">
              <table className="text-[12.5px] tnum">
                <thead>
                  <tr>
                    <th className="th text-left">Pessoa</th>
                    {sundays.map((d) => (
                      <th key={d} className="th text-center">
                        {dm(d)}
                        {rule === "alternado" && <span className="block text-[10.5px] font-normal normal-case">folga {teamOffOnSunday(d, ciclo)}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {emps.map((e) => (
                    <tr key={e.id}>
                      <td className="td whitespace-nowrap">
                        {e.name || e.func}
                        {teamOf(e) && <TeamPill t={teamOf(e)!} />}
                        <PlantaoPill e={e} />
                        {folgaFixaDomingo(e) && <span className="ml-1.5 text-[11px] text-muted">(folga fixa no domingo)</span>}
                      </td>
                      {sundays.map((d) => {
                        const s = domingoPrevisto(e, d);
                        return (
                          <td key={d} className="px-1 py-1 text-center">
                            <span className={`inline-block w-9 rounded py-0.5 text-[11px] font-bold ${s === "T" ? "bg-green-light text-green-light-ink" : s === "F" ? "bg-surface-2 text-muted" : "bg-yellow text-yellow-ink"}`} title={s === "T" ? "Trabalha" : s === "F" ? "Folga" : "O sistema escolhe ao gerar"}>
                              {s === "T" ? "Trab" : s === "F" ? "Folga" : "Auto"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th className="th text-left">Trabalham</th>
                    {counts.map((n, i) => (
                      <td key={i} className="px-1 py-1 text-center font-bold">
                        {n}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
              {auto > 0 && <p className="mt-2 px-2 text-[12.5px] text-muted">“Auto”: pessoa com regra própria sem domingo de folga definido; o sistema escolhe ao gerar a escala.</p>}
            </div>
          </details>
        );
      })}
    </div>
  );
}

/**
 * Escolha da regra de domingo com prévia. `sectorId` null = regra da loja (vale para os setores sem regra própria).
 */
export function RegraDomingoEditor({ st, sectorId }: { st: Store; sectorId: string | null }) {
  const sim = useSim();
  const sec = sectorId ? st.sectors.find((s) => s.id === sectorId) ?? null : null;
  const atual: Escolha = sec ? (sec.sundayRule != null ? escolhaDe(sec.sundayRule, sec.sundayWork ?? 1) : "loja") : escolhaDe(st.config.sundayRule ?? "alternado", st.config.sundayWork ?? 1);
  const [draft, setDraft] = useState<Escolha | null>(null);
  const lojaTxt = nomeRegra(st.config.sundayRule ?? "alternado", st.config.sundayWork ?? 1);
  const opcoes = sec ? [{ value: "loja" as Escolha, label: `Igual à loja (${lojaTxt})` }, ...OPCOES_REGRA] : OPCOES_REGRA;
  const proposta = useMemo(() => (draft && draft !== atual ? aplicarRegraDomingo(st, { sectorId }, regraDe(draft)) : null), [draft, atual, st, sectorId]);
  const afetados = proposta ? proposta.sectors.filter((s) => !s.hidden && (sectorId ? s.id === sectorId : s.sundayRule == null)) : [];
  const aplicar = () => {
    if (!draft) return;
    sim.updateStoreById(st.id, (x) => clearUnlocked(aplicarRegraDomingo(x, { sectorId }, regraDe(draft)), sectorId ?? undefined));
    const r = regraDe(draft);
    sim.setToast(`Regra de domingo ${sec ? `de ${sec.name}` : "da loja"}: ${r.rule === "loja" ? `igual à loja (${lojaTxt})` : nomeRegra(r.rule, r.work)}. A escala ${sec ? "do setor" : "dos setores"} foi refeita; o que você fixou à mão foi mantido.`);
    setDraft(null);
  };
  return (
    <div className="flex flex-col gap-3" data-regra-domingo={sectorId ?? "loja"}>
      <label className="flex max-w-[480px] flex-col gap-1.5">
        <span className="text-[12px] font-bold uppercase tracking-wide text-muted">{sec ? `Regra de domingo de ${sec.name}` : "Regra de domingo da loja"}</span>
        <Select id={sec ? `regra-dom-${sec.id}` : "regra-dom-loja"} value={draft ?? atual} onChange={(v) => setDraft(v === atual ? null : v)} options={opcoes} />
      </label>
      {proposta && (
        <div className="rounded-xl border border-navy-2 bg-surface-2 p-4" role="region" aria-label="Prévia da regra de domingo">
          <div className="text-[14.5px] font-bold">Prévia: como ficam os próximos domingos</div>
          <p className="mb-3 mt-1 text-[13px] text-muted">
            Nada muda até você aplicar. {sec ? "" : "Vale para os setores que seguem a regra da loja; setores com regra própria não mudam. "}Quem tem folga fixa no domingo ou não trabalha aos domingos continua de folga.
          </p>
          {afetados.length ? <Previa store={proposta} sectors={afetados} /> : <p className="text-[13px]">Nenhum setor segue a regra da loja (todos têm regra própria).</p>}
          <div className="mt-3 flex flex-wrap gap-2.5">
            <Btn kind="primary" id={sec ? `regra-dom-aplicar-${sec.id}` : "regra-dom-aplicar"} onClick={aplicar}>
              Aplicar regra e refazer a escala
            </Btn>
            <Btn onClick={() => setDraft(null)}>Cancelar</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
