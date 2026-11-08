"use client";
import React, { useMemo, useState } from "react";
import { useSim } from "./state";
import { Btn, ConfirmBtn, NumInput, Section, Select, TextInput, TimeInput, WeekdayPicker, Pill } from "./ui";
import type { PostAssignment, Reassignment } from "../engine/types";
import { allocationAt, postBoard, sectorCountAt, simulateAbsence, STATE_LABEL } from "../engine/allocation";
import { employeeShift } from "../engine/model";
import { dayFor } from "../engine/allocation";
import { fmtDateBR, fmtTime, toISO, toMin, uid } from "../engine/time";
import type { PresenceState } from "../engine/model";

function overlaps(a: { date: string | null; weekdays: number[]; start: string; end: string }, b: typeof a) {
  const same = a.date && b.date ? a.date === b.date : a.date ? true : b.date ? true : a.weekdays.some((w) => b.weekdays.includes(w));
  return !!same && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);
}

export function JokersSection() {
  const sim = useSim();
  const { store, sector } = sim;
  const jokers = store.employees.filter((e) => e.joker || e.quals.length > 0);
  const relevant = store.reassignments.filter((r) => r.toSectorId === sector.id || store.employees.find((e) => e.id === r.employeeId)?.sectorId === sector.id);
  const setRe = (id: string, patch: Partial<Reassignment>) => sim.updateStore((st) => ({ ...st, reassignments: st.reassignments.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const candidates = store.employees.filter((e) => e.sectorId !== sector.id && (e.quals.includes(sector.id) || e.joker));
  const [pickRaw, setPick] = useState(candidates[0]?.id ?? "");
  const pick = candidates.some((c) => c.id === pickRaw) ? pickRaw : candidates[0]?.id ?? "";
  const [err, setErr] = useState<string | null>(null);

  const add = () => {
    const emp = store.employees.find((e) => e.id === pick);
    if (!emp) return;
    const r: Reassignment = { id: uid("re_"), employeeId: emp.id, toSectorId: sector.id, date: null, weekdays: [6], start: "11:00", end: "13:00", post: sector.posts[sector.posts.length - 1] ?? "", note: "" };
    const clash = store.reassignments.find((x) => x.employeeId === emp.id && overlaps(x, r));
    if (clash) {
      setErr(`${emp.name || emp.func} já está remanejado(a) nesse horário. Ajuste o horário do remanejamento existente.`);
      return;
    }
    setErr(null);
    sim.updateStore((st) => ({ ...st, reassignments: [...st.reassignments, r] }));
  };

  return (
    <Section
      id="coringas"
      title="Coringas e remanejamentos"
      subtitle="Pessoas habilitadas em outros setores podem reforçar um posto em horário exato. Durante o remanejamento a pessoa conta só no destino e sai da cobertura do setor de origem — nunca nos dois ao mesmo tempo."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold mb-1">Coringas e habilitações da loja ({jokers.length})</h3>
          <ul className="text-[12.5px] divide-y divide-line rounded-md border border-line">
            {jokers.map((e) => (
              <li key={e.id} className="px-2 py-1.5 flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">{e.name || e.func}</span>
                <span className="text-muted">{store.sectors.find((s) => s.id === e.sectorId)?.name}</span>
                {e.joker && <Pill tone="yellow">coringa</Pill>}
                {e.quals.length > 0 && <span className="text-muted">→ {e.quals.map((q) => store.sectors.find((s) => s.id === q)?.name).join(", ")}</span>}
              </li>
            ))}
            {!jokers.length && <li className="px-2 py-2 text-muted">Marque “Coringa” ou habilitações em Pessoas do setor.</li>}
          </ul>
        </div>
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold mb-1">Remanejamentos envolvendo {sector.name}</h3>
          <div className="scroll-x rounded-md border border-line">
            <table className="text-[12.5px] w-full">
              <thead className="bg-surface-2">
                <tr>
                  <th className="th">Pessoa</th>
                  <th className="th">De → Para</th>
                  <th className="th">Quando</th>
                  <th className="th">Início</th>
                  <th className="th">Fim</th>
                  <th className="th">Posto</th>
                  <th className="th">Situação</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {relevant.map((r) => {
                  const e = store.employees.find((x) => x.id === r.employeeId);
                  if (!e) return null;
                  const from = store.sectors.find((s) => s.id === e.sectorId)!;
                  const to = store.sectors.find((s) => s.id === r.toSectorId)!;
                  const dup = store.reassignments.some((x) => x.id !== r.id && x.employeeId === r.employeeId && overlaps(x, r));
                  const qual = e.quals.includes(r.toSectorId) || e.joker;
                  const sampleDay = dayFor(store, r.date ?? sim.analysis.days.find((d) => r.weekdays.includes(d.weekday))?.date ?? store.config.startDate);
                  const sh = employeeShift(store, undefined, e, sampleDay.special);
                  const inShift = toMin(r.start) >= sh.start && toMin(r.end) <= sh.end;
                  return (
                    <tr key={r.id}>
                      <td className="td whitespace-nowrap font-semibold">{e.name || e.func}</td>
                      <td className="td whitespace-nowrap">
                        {from.name} →{" "}
                        <Select id={`re-to-${r.id}`} aria-label="Setor de destino" value={r.toSectorId} onChange={(v) => setRe(r.id, { toSectorId: v })} options={store.sectors.filter((s) => s.id !== e.sectorId).map((s) => ({ value: s.id, label: s.name }))} />
                      </td>
                      <td className="td">
                        <div className="flex flex-wrap items-center gap-1">
                          {r.date ? (
                            <input id={`re-date-${r.id}`} type="date" aria-label="Data" className="field" value={r.date} onChange={(ev) => setRe(r.id, { date: ev.target.value || null })} />
                          ) : (
                            <WeekdayPicker idPrefix={`re-${r.id}`} value={r.weekdays} onChange={(v) => setRe(r.id, { weekdays: v })} />
                          )}
                          <button type="button" className="text-[11px] underline text-muted" onClick={() => setRe(r.id, r.date ? { date: null } : { date: store.config.startDate })}>
                            {r.date ? "recorrente" : "data única"}
                          </button>
                        </div>
                      </td>
                      <td className="td">
                        <TimeInput id={`re-start-${r.id}`} aria-label="Início" value={r.start} onChange={(v) => setRe(r.id, { start: v })} />
                      </td>
                      <td className="td">
                        <TimeInput id={`re-end-${r.id}`} aria-label="Fim" value={r.end} onChange={(v) => setRe(r.id, { end: v })} />
                      </td>
                      <td className="td">
                        <TextInput id={`re-post-${r.id}`} aria-label="Posto" className="w-24" value={r.post} onChange={(v) => setRe(r.id, { post: v })} />
                      </td>
                      <td className="td text-[11.5px]">
                        {dup ? <span className="text-red font-semibold">Sobreposição: conta só no primeiro</span> : !qual ? <span className="text-amber-ink">Sem habilitação</span> : !inShift ? <span className="text-amber-ink">Fora do turno ({fmtTime(sh.start)}–{fmtTime(sh.end)})</span> : <span className="text-green">OK</span>}
                      </td>
                      <td className="td">
                        <ConfirmBtn label="Excluir" confirmLabel="Excluir" onConfirm={() => sim.updateStore((st) => ({ ...st, reassignments: st.reassignments.filter((x) => x.id !== r.id) }))} />
                      </td>
                    </tr>
                  );
                })}
                {!relevant.length && (
                  <tr>
                    <td className="td text-muted" colSpan={8}>
                      Nenhum remanejamento para ou a partir deste setor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {candidates.length ? (
              <>
                <Select id="re-pick" aria-label="Pessoa habilitada" value={pick} onChange={setPick} options={candidates.map((e) => ({ value: e.id, label: `${e.name || e.func} (${store.sectors.find((s) => s.id === e.sectorId)?.name})` }))} />
                <Btn kind="primary" onClick={add}>
                  + Remanejar para {sector.name}
                </Btn>
              </>
            ) : (
              <span className="text-[12.5px] text-muted">Ninguém de outro setor está habilitado em {sector.name}. Marque a habilitação em Pessoas do setor.</span>
            )}
          </div>
          {err && <p className="mt-1 text-[12.5px] text-red">{err}</p>}
        </div>
      </div>
    </Section>
  );
}

const STATE_TONE: Record<PresenceState, string> = {
  working: "text-green font-semibold",
  break: "text-amber-ink",
  out: "text-focus",
  activity: "text-focus",
  before: "text-muted",
  after: "text-muted",
  off: "text-muted",
  absent: "text-red",
  vacation: "text-muted",
  holiday: "text-muted",
};

export function AllocationSection() {
  const sim = useSim();
  const { store, sector, stores } = sim;
  const [date, setDate] = useState(() => {
    const today = toISO(new Date());
    const days = sim.analysis.days;
    const t = days.find((d) => d.date === today && !d.closed && d.weekday !== 0);
    // sem "hoje" no período: primeira terça-feira simulada
    return t ? t.date : days.find((d) => d.weekday === 2)?.date ?? store.config.startDate;
  });
  const [time, setTime] = useState("14:00");
  const [secFilterRaw, setSecFilter] = useState<string>(sector.id);
  // ao trocar de loja, um setor de outra loja deixa de valer
  const secFilter = secFilterRaw === "all" || store.sectors.some((s) => s.id === secFilterRaw) ? secFilterRaw : sector.id;
  const [stateFilter, setStateFilter] = useState<"all" | "working" | "notworking">("all");
  const [absent, setAbsent] = useState<string | null>(null);
  const day = dayFor(store, date);
  const rows = useMemo(() => allocationAt(store, date, time, secFilter), [store, date, time, secFilter]);
  const filtered = rows.filter((r) => (stateFilter === "all" ? true : stateFilter === "working" ? r.state === "working" || r.state === "out" : r.state !== "working" && r.state !== "out"));
  const counts = rows.reduce<Record<string, number>>((a, r) => ((a[r.state] = (a[r.state] ?? 0) + 1), a), {});
  const board = secFilter !== "all" ? postBoard(store, secFilter, date, time) : null;
  const cnt = secFilter !== "all" ? sectorCountAt(store, secFilter, date, time) : null;
  const impact = absent ? simulateAbsence(store, absent, date, time) : null;
  const noSchedule = rows.length > 0 && rows.every((r) => !r.hasSchedule);

  return (
    <Section
      id="alocacao"
      title="Mapa de alocação de funcionários"
      subtitle="Escolha data e horário para ver quem está trabalhando, onde está e qual posto fica descoberto se alguém faltar."
    >
      <div className="flex flex-wrap items-center gap-3 mb-5 text-[13px]">
        <label className="inline-flex items-center gap-1">
          Loja
          <Select id="al-store" aria-label="Loja" value={store.id} onChange={sim.setStoreId} options={stores.map((s) => ({ value: s.id, label: s.name }))} />
        </label>
        <label className="inline-flex items-center gap-1">
          Setor
          <Select id="al-sector" aria-label="Setor" value={secFilter} onChange={setSecFilter} options={[{ value: "all", label: "Todos os setores" }, ...store.sectors.map((s) => ({ value: s.id, label: s.name }))]} />
        </label>
        <label className="inline-flex items-center gap-1">
          Data
          <input id="al-date" type="date" className="field" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <label className="inline-flex items-center gap-1">
          Horário
          <TimeInput id="al-time" aria-label="Horário" value={time} onChange={setTime} />
        </label>
        <Btn
          onClick={() => {
            const n = new Date();
            setDate(toISO(new Date(n.getTime() - n.getTimezoneOffset() * 60000)));
            setTime(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`);
          }}
        >
          Agora
        </Btn>
        <Select
          id="al-state"
          aria-label="Situação"
          value={stateFilter}
          onChange={setStateFilter}
          options={[
            { value: "all", label: "Todas as situações" },
            { value: "working", label: "Só quem está no posto" },
            { value: "notworking", label: "Só quem não está no posto" },
          ]}
        />
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-[12px]">
        <span className="font-semibold">
          {fmtDateBR(date)} às {time}
          {day.closed ? " · loja fechada" : ""}:
        </span>
        {Object.entries(counts).map(([k, v]) => (
          <span key={k} className={STATE_TONE[k as PresenceState]}>
            {STATE_LABEL[k as PresenceState]} {v}
          </span>
        ))}
        {cnt && (
          <span className={cnt.count < cnt.min ? "text-red font-bold" : "text-green font-semibold"}>
            · {store.sectors.find((s) => s.id === secFilter)?.name}: {cnt.count} no posto / mínimo {cnt.min}
          </span>
        )}
      </div>
      {noSchedule && <p className="mb-2 text-[12.5px] text-amber-ink">A data está fora do período simulado; as situações assumem trabalho normal. Ajuste a data inicial ou as semanas do calendário.</p>}
      {impact && (
        <div className={`mb-3 rounded-md border px-3 py-2 text-[12.5px] ${impact.uncovered ? "border-red bg-pink" : "border-line bg-surface-2"}`} role="status">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Se <strong>{store.employees.find((e) => e.id === absent)?.name || store.employees.find((e) => e.id === absent)?.func}</strong> faltar: posto <strong>{impact.post || "—"}</strong> fica descoberto; o setor vai de{" "}
              <strong className="tnum">{impact.before}</strong> para <strong className="tnum">{impact.after}</strong> (mínimo {impact.min}).{" "}
              {impact.uncovered ? <strong className="text-red">Fica abaixo do mínimo.</strong> : <span className="text-green">Continua no mínimo.</span>}
            </span>
            <Btn onClick={() => setAbsent(null)}>Fechar</Btn>
          </div>
          {impact.candidates.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {impact.candidates.slice(0, 6).map((c) => (
                <li key={c.emp.id}>
                  {c.emp.name || c.emp.func} <span className="text-muted">({c.from})</span> — <span className={c.safe ? "text-green" : "text-red"}>{c.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted">Ninguém habilitado de outro setor está trabalhando neste horário.</p>
          )}
        </div>
      )}
      <div className="scroll-x rounded-md border border-line">
        <table className="text-[12.5px] w-full">
          <thead className="bg-surface-2">
            <tr>
              <th className="th">Nome</th>
              <th className="th">Setor</th>
              <th className="th">Função</th>
              <th className="th">Posto</th>
              <th className="th">Entrada</th>
              <th className="th">Intervalo</th>
              <th className="th">Saída</th>
              <th className="th">Situação</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="tnum">
            {filtered.slice(0, 400).map((r) => (
              <tr key={r.emp.id} className={absent === r.emp.id ? "bg-pink" : ""}>
                <td className="td font-semibold whitespace-nowrap">{r.emp.name || r.emp.func}</td>
                <td className="td whitespace-nowrap">{r.sectorName}</td>
                <td className="td whitespace-nowrap text-muted">{r.emp.func}</td>
                <td className="td whitespace-nowrap">{r.post}</td>
                <td className="td">{r.entrada}</td>
                <td className="td whitespace-nowrap">{r.intervalo}</td>
                <td className="td">{r.saida}</td>
                <td className={`td whitespace-nowrap ${STATE_TONE[r.state]}`}>{r.situacao}</td>
                <td className="td">
                  {(r.state === "working" || r.state === "out") && (
                    <button type="button" className="text-[11.5px] underline text-muted hover:text-red" onClick={() => setAbsent(r.emp.id)}>
                      simular falta
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {board && (
        <div className="mt-4">
          <h3 className="text-[13px] font-bold mb-1">Postos de {store.sectors.find((s) => s.id === secFilter)?.name} às {time}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-1.5">
            {board.map((b) => (
              <div key={b.post} className={`rounded-md border px-2 py-1.5 text-[12px] ${b.people.length ? "border-green bg-surface" : "border-line bg-surface-2 text-muted"}`}>
                <div className="font-semibold">{b.post}</div>
                <div className="truncate">{b.people.length ? b.people.map((p) => (p.emp.name || p.emp.func).split(" ")[0]).join(", ") : "fechado / sem pessoa"}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <PostsAndActivities />
    </Section>
  );
}

function PostsAndActivities() {
  const sim = useSim();
  const { store, sector } = sim;
  const [prefix, setPrefix] = useState(sector.posts[0]?.replace(/\s*\d+$/, "") || "Posto");
  const [n, setN] = useState<number>(sector.posts.length || 5);
  const acts = store.assignments.filter((a) => store.employees.find((e) => e.id === a.employeeId)?.sectorId === sector.id);
  const emps = sim.analysis.employees;
  const setA = (id: string, patch: Partial<PostAssignment>) => sim.updateStore((st) => ({ ...st, assignments: st.assignments.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  return (
    <div className="mt-7 grid gap-6 lg:grid-cols-2">
      <div className="min-w-0">
        <h3 className="text-[13px] font-bold mb-1">Postos de {sector.name}</h3>
        <div className="flex flex-wrap gap-1 mb-2">
          {sector.posts.map((p, i) => (
            <span key={p + i} className="inline-flex items-center gap-1 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[12px]">
              {p}
              <button type="button" aria-label={`Remover ${p}`} className="text-muted hover:text-red" onClick={() => sim.updateSector((s) => ({ ...s, posts: s.posts.filter((_, j) => j !== i) }))}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
          <TextInput id="posts-prefix" aria-label="Prefixo" className="w-28" value={prefix} onChange={setPrefix} />
          <span>01 até</span>
          <NumInput id="posts-n" aria-label="Quantidade" value={n} min={1} max={60} onChange={(v) => v && setN(v)} />
          <Btn onClick={() => sim.updateSector((s) => ({ ...s, posts: Array.from({ length: n }, (_, i) => `${prefix} ${String(i + 1).padStart(2, "0")}`) }))}>Gerar postos numerados</Btn>
          <Btn onClick={() => sim.updateSector((s) => ({ ...s, posts: [...s.posts, `Posto ${s.posts.length + 1}`] }))}>+ Posto</Btn>
        </div>
      </div>
      <div className="min-w-0">
        <h3 className="text-[13px] font-bold mb-1">Atividades por horário</h3>
        <p className="text-[12px] text-muted mb-1">Troca de posto ao longo do turno. Desmarque “conta” para atividades fora do posto (ex.: fechamento de caixa, treinamento): a pessoa sai da cobertura nesse intervalo.</p>
        <div className="scroll-x rounded-md border border-line">
          <table className="text-[12.5px] w-full">
            <thead className="bg-surface-2">
              <tr>
                <th className="th">Pessoa</th>
                <th className="th">Dias</th>
                <th className="th">Início</th>
                <th className="th">Fim</th>
                <th className="th">Posto/atividade</th>
                <th className="th">Conta</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {acts.map((a) => (
                <tr key={a.id}>
                  <td className="td">
                    <Select id={`ac-emp-${a.id}`} aria-label="Pessoa" value={a.employeeId} onChange={(v) => setA(a.id, { employeeId: v })} options={emps.map((e) => ({ value: e.id, label: e.name || e.func }))} />
                  </td>
                  <td className="td">
                    <WeekdayPicker idPrefix={`ac-${a.id}`} value={a.weekdays} onChange={(v) => setA(a.id, { weekdays: v })} />
                  </td>
                  <td className="td">
                    <TimeInput id={`ac-s-${a.id}`} aria-label="Início" value={a.start} onChange={(v) => setA(a.id, { start: v })} />
                  </td>
                  <td className="td">
                    <TimeInput id={`ac-e-${a.id}`} aria-label="Fim" value={a.end} onChange={(v) => setA(a.id, { end: v })} />
                  </td>
                  <td className="td">
                    <TextInput id={`ac-p-${a.id}`} aria-label="Posto ou atividade" className="w-36" value={a.post} onChange={(v) => setA(a.id, { post: v })} />
                  </td>
                  <td className="td text-center">
                    <input id={`ac-c-${a.id}`} type="checkbox" aria-label="Conta para cobertura" checked={a.counts} onChange={(e) => setA(a.id, { counts: e.target.checked })} />
                  </td>
                  <td className="td">
                    <ConfirmBtn label="Excluir" confirmLabel="Excluir" onConfirm={() => sim.updateStore((st) => ({ ...st, assignments: st.assignments.filter((x) => x.id !== a.id) }))} />
                  </td>
                </tr>
              ))}
              {!acts.length && (
                <tr>
                  <td colSpan={7} className="td text-muted">
                    Nenhuma atividade cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {emps.length > 0 && (
          <Btn
            className="mt-2"
            onClick={() =>
              sim.updateStore((st) => ({ ...st, assignments: [...st.assignments, { id: uid("as_"), employeeId: emps[0].id, date: null, weekdays: [1, 2, 3, 4, 5], start: "14:00", end: "15:00", post: sector.posts[0] ?? "Atividade", counts: true }] }))
            }
          >
            + Atividade
          </Btn>
        )}
      </div>
    </div>
  );
}
