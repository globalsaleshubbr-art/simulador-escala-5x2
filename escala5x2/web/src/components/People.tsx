"use client";
import React from "react";
import { useSim } from "./state";
import { Btn, ConfirmBtn, DurInput, NumInput, Section, Select, TextInput } from "./ui";
import type { Employee } from "../engine/types";
import { eightOperatorsExample, newEmployee } from "../engine/seed";
import { fmtDur, WEEKDAY_SHORT } from "../engine/time";

export function PeopleTable() {
  const sim = useSim();
  const { store, sector, analysis } = sim;
  const cfg = store.config;
  const emps = analysis.employees;
  const regular = sector.shifts.filter((s) => !s.special);
  const special = sector.shifts.filter((s) => s.special);
  const setEmp = (id: string, patch: Partial<Employee>) => sim.updateStore((st) => ({ ...st, employees: st.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const weeks = cfg.weeks;

  const moveSector = (e: Employee, toId: string) =>
    sim.updateStore((st) => {
      const from = st.sectors.find((s) => s.id === e.sectorId)!;
      const to = st.sectors.find((s) => s.id === toId)!;
      const row = from.schedule[e.id] ?? {};
      const toRegular = to.shifts.filter((s) => !s.special);
      return {
        ...st,
        sectors: st.sectors.map((s) => {
          if (s.id === from.id) {
            const { [e.id]: _drop, ...rest } = s.schedule;
            void _drop;
            return { ...s, schedule: rest };
          }
          if (s.id === to.id) return { ...s, schedule: { ...s.schedule, [e.id]: row } };
          return s;
        }),
        employees: st.employees.map((x) =>
          x.id === e.id ? { ...x, sectorId: toId, shiftId: toRegular[0]?.id ?? "", sundayShiftId: null, defaultPost: to.posts[0] ?? "", quals: x.quals.filter((q) => q !== toId) } : x,
        ),
      };
    });

  const remove = (id: string) =>
    sim.updateStore((st) => ({
      ...st,
      employees: st.employees.filter((e) => e.id !== id),
      reassignments: st.reassignments.filter((r) => r.employeeId !== id),
      assignments: st.assignments.filter((a) => a.employeeId !== id),
      sectors: st.sectors.map((s) => {
        if (!s.schedule[id]) return s;
        const { [id]: _d, ...rest } = s.schedule;
        void _d;
        return { ...s, schedule: rest };
      }),
    }));

  return (
    <Section
      id="pessoas"
      title="Pessoas do setor"
      subtitle={
        <>
          Rodízio de domingo: cada pessoa folga 1 domingo a cada N; “Folga no” diz qual domingo do ciclo (ou deixe automático para o sistema equilibrar a equipe). Quem nunca trabalha domingo usa só a folga fixa. As horas de cada
          semana já consideram domingos de jornada reduzida.
        </>
      }
      actions={
        <>
          <Btn kind="primary" onClick={() => sim.updateStore((st) => ({ ...st, employees: [...st.employees, newEmployee(sector, emps.length + 1)] }))}>
            + Pessoa
          </Btn>
          <ConfirmBtn kind="ghost" label="Carregar exemplo (8 pessoas)" confirmLabel="Substituir equipe do setor" title="Substitui pessoas, turnos e mínimos deste setor pelo exemplo do vídeo" onConfirm={() => sim.updateStore((st) => eightOperatorsExample(st, sector.id))} />
        </>
      }
    >
      {!emps.length && <p className="mb-2 text-[13px] text-muted">Ninguém cadastrado ainda. Use “+ Pessoa” para cadastrar a equipe (ex.: oito operadores) e depois clique em Gerar escala.</p>}
      <div className="scroll-x rounded-md border border-line">
        <table className="text-[12.5px] tnum">
          <thead className="bg-surface-2">
            <tr>
              <th className="th">Função</th>
              <th className="th">Nome</th>
              <th className="th">Matrícula</th>
              <th className="th" title="Usado só para aplicar regras específicas (ex.: rodízio dominical)">
                Sexo
              </th>
              <th className="th">Turno</th>
              <th className="th">Turno dom./fer.</th>
              <th className="th">Domingo</th>
              <th className="th">Folga no</th>
              <th className="th">Folga fixa</th>
              <th className="th">Folga variável</th>
              <th className="th">Jornada contrat.</th>
              {Array.from({ length: weeks }, (_, w) => (
                <th key={w} className="th text-right">
                  Sem {w + 1}
                </th>
              ))}
              <th className="th">Setor principal</th>
              <th className="th">Habilitado em</th>
              <th className="th">Coringa</th>
              <th className="th">Posto padrão</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {emps.map((e) => {
              const N = e.sundayCycle;
              return (
                <tr key={e.id}>
                  <td className="td">
                    <TextInput id={`p-func-${e.id}`} aria-label="Função" className="w-32" value={e.func} onChange={(v) => setEmp(e.id, { func: v })} />
                  </td>
                  <td className="td">
                    <TextInput id={`p-name-${e.id}`} aria-label="Nome" className="w-36" placeholder="nome" value={e.name} onChange={(v) => setEmp(e.id, { name: v })} />
                  </td>
                  <td className="td">
                    <TextInput id={`p-mat-${e.id}`} aria-label="Matrícula" className="w-20" value={e.matricula} onChange={(v) => setEmp(e.id, { matricula: v })} />
                  </td>
                  <td className="td">
                    <Select id={`p-sex-${e.id}`} aria-label="Sexo" value={e.sex} onChange={(v) => setEmp(e.id, { sex: v })} options={[{ value: "", label: "—" }, { value: "F", label: "F" }, { value: "M", label: "M" }]} />
                  </td>
                  <td className="td">
                    <Select id={`p-shift-${e.id}`} aria-label="Turno" value={e.shiftId} onChange={(v) => setEmp(e.id, { shiftId: v })} options={[...(regular.some((s) => s.id === e.shiftId) ? [] : [{ value: e.shiftId, label: "— escolher —" }]), ...regular.map((s) => ({ value: s.id, label: s.name }))]} />
                  </td>
                  <td className="td">
                    <Select id={`p-sshift-${e.id}`} aria-label="Turno de domingo" value={e.sundayShiftId ?? ""} onChange={(v) => setEmp(e.id, { sundayShiftId: v || null })} options={[{ value: "", label: "padrão" }, ...special.map((s) => ({ value: s.id, label: s.name }))]} />
                  </td>
                  <td className="td">
                    <Select
                      id={`p-sun-${e.id}`}
                      aria-label="Regime de domingo"
                      value={N}
                      onChange={(v) => setEmp(e.id, { sundayCycle: v, sundayOffset: v === 0 ? 0 : Math.min(e.sundayOffset, v) })}
                      options={[
                        { value: 0, label: "Não trabalha domingo" },
                        { value: 2, label: "Folga 1 a cada 2" },
                        { value: 3, label: "Folga 1 a cada 3" },
                        { value: 4, label: "Folga 1 a cada 4" },
                        ...(N > 4 ? [{ value: N, label: `Folga 1 a cada ${N}` }] : []),
                        { value: 1, label: "Folga todo domingo" },
                      ]}
                    />
                  </td>
                  <td className="td">
                    {N >= 2 ? (
                      <Select
                        id={`p-sunoff-${e.id}`}
                        aria-label="Domingo de folga no ciclo"
                        value={e.sundayOffset}
                        onChange={(v) => setEmp(e.id, { sundayOffset: v })}
                        options={[{ value: 0, label: "Automático" }, ...Array.from({ length: N }, (_, k) => ({ value: k + 1, label: `${k + 1}º domingo` }))]}
                      />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="td">
                    <Select id={`p-fix-${e.id}`} aria-label="Folga fixa" value={e.fixedOff ?? -1} onChange={(v) => setEmp(e.id, { fixedOff: v < 0 ? null : v })} options={[{ value: -1, label: "—" }, ...[1, 2, 3, 4, 5, 6].map((d) => ({ value: d, label: WEEKDAY_SHORT[d] }))]} />
                  </td>
                  <td className="td">
                    <Select id={`p-var-${e.id}`} aria-label="Folga variável" value={e.variableOff ?? -1} onChange={(v) => setEmp(e.id, { variableOff: v < 0 ? null : v })} options={[{ value: -1, label: "Automática" }, ...[1, 2, 3, 4, 5, 6].map((d) => ({ value: d, label: `Prefere ${WEEKDAY_SHORT[d]}` }))]} />
                  </td>
                  <td className="td">
                    <DurInput id={`p-contract-${e.id}`} aria-label="Jornada contratual semanal" value={e.contractMin} onChange={(v) => setEmp(e.id, { contractMin: v })} />
                  </td>
                  {(analysis.weekly[e.id] ?? []).map((m, w) => (
                    <td key={w} className={`td text-right whitespace-nowrap ${m > cfg.weeklyMaxMin ? "text-red font-bold" : m < e.contractMin ? "text-muted" : "font-semibold"}`}>
                      {fmtDur(m)}
                    </td>
                  ))}
                  <td className="td">
                    <Select id={`p-sector-${e.id}`} aria-label="Setor principal" value={e.sectorId} onChange={(v) => v !== e.sectorId && moveSector(e, v)} options={store.sectors.map((s) => ({ value: s.id, label: s.name }))} />
                  </td>
                  <td className="td">
                    <details className="relative">
                      <summary className="cursor-pointer text-[12px] whitespace-nowrap">{e.quals.length ? e.quals.map((q) => store.sectors.find((s) => s.id === q)?.name).filter(Boolean).join(", ") : "—"}</summary>
                      <div className="absolute z-20 mt-1 w-56 rounded-md border border-line bg-surface p-2 shadow-lg">
                        {store.sectors
                          .filter((s) => s.id !== e.sectorId)
                          .map((s) => (
                            <label key={s.id} className="flex items-center gap-1.5 py-0.5">
                              <input type="checkbox" checked={e.quals.includes(s.id)} onChange={(ev) => setEmp(e.id, { quals: ev.target.checked ? [...e.quals, s.id] : e.quals.filter((q) => q !== s.id) })} />
                              {s.name}
                            </label>
                          ))}
                      </div>
                    </details>
                  </td>
                  <td className="td text-center">
                    <input id={`p-joker-${e.id}`} type="checkbox" aria-label="Coringa" checked={e.joker} onChange={(ev) => setEmp(e.id, { joker: ev.target.checked })} />
                  </td>
                  <td className="td">
                    <Select id={`p-post-${e.id}`} aria-label="Posto padrão" value={e.defaultPost} onChange={(v) => setEmp(e.id, { defaultPost: v })} options={Array.from(new Set([e.defaultPost, ...sector.posts])).filter((x) => x !== undefined).map((p) => ({ value: p, label: p || "—" }))} />
                  </td>
                  <td className="td">
                    <ConfirmBtn label="Excluir" confirmLabel="Excluir pessoa" onConfirm={() => remove(e.id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <RulesPanel />
    </Section>
  );
}

function RulesPanel() {
  const sim = useSim();
  const cfg = sim.store.config;
  const set = (patch: Partial<typeof cfg>) => sim.updateStore((s) => ({ ...s, config: { ...s.config, ...patch } }));
  const item = (label: string, el: React.ReactNode) => (
    <label className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2.5">
      <span className="text-[12.5px]">{label}</span>
      {el}
    </label>
  );
  return (
    <div className="mt-6 rounded-xl border border-line bg-surface-2 p-5">
      <h3 className="text-[13.5px] font-bold">Regras e limites usados nos cálculos</h3>
      <p className="mt-0.5 mb-2 text-[12px] text-muted max-w-[95ch]">
        Valores de referência editáveis. O sistema não presume que uma frequência de folga dominical ou um limite seja legalmente suficiente para todas as categorias: confirme na legislação e na convenção coletiva aplicável à
        loja.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {item("Folga dominical — referência geral: 1 a cada", <NumInput id="r-sun-m" aria-label="Ciclo dominical geral" value={cfg.sundayMaxCycleM} min={1} max={8} onChange={(v) => v && set({ sundayMaxCycleM: v })} />)}
        {item("Folga dominical — mulheres: 1 a cada", <NumInput id="r-sun-f" aria-label="Ciclo dominical mulheres" value={cfg.sundayMaxCycleF} min={1} max={8} onChange={(v) => v && set({ sundayMaxCycleF: v })} />)}
        {item("Máximo de dias seguidos de trabalho", <NumInput id="r-consec" aria-label="Dias seguidos" value={cfg.maxConsecutive} min={1} max={13} onChange={(v) => v && set({ maxConsecutive: v })} />)}
        {item("Descanso mínimo entre jornadas", <DurInput id="r-rest" aria-label="Interjornada" value={cfg.minRestMin} onChange={(v) => set({ minRestMin: v })} />)}
        {item("Jornada diária máxima", <DurInput id="r-maxday" aria-label="Jornada máxima" value={cfg.maxDailyMin} onChange={(v) => set({ maxDailyMin: v })} />)}
        {item("Intervalo mínimo (jornada > 6h)", <DurInput id="r-brkmin" aria-label="Intervalo mínimo" value={cfg.breakMinOver6h} onChange={(v) => set({ breakMinOver6h: v })} />)}
        {item("Intervalo máximo", <DurInput id="r-brkmax" aria-label="Intervalo máximo" value={cfg.breakMax} onChange={(v) => set({ breakMax: v })} />)}
        {item("Limite semanal de horas", <DurInput id="r-week" aria-label="Limite semanal" value={cfg.weeklyMaxMin} onChange={(v) => set({ weeklyMaxMin: v })} />)}
      </div>
    </div>
  );
}
