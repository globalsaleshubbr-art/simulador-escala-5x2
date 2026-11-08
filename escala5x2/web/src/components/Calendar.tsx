"use client";
import React, { useMemo, useState } from "react";
import { useSim } from "./state";
import { Btn, Section, Select, TextInput, ConfirmBtn } from "./ui";
import type { Code, Sector } from "../engine/types";
import { cellCode, isWorking } from "../engine/model";
import { addDays, dayNum, fmtDateBR, fmtDur, WEEKDAY_SHORT } from "../engine/time";

export const CODE_STYLE: Record<Code, string> = {
  T: "bg-surface text-ink",
  D: "bg-cell-sun text-ink font-bold",
  F: "bg-cell-off text-cell-off-ink",
  A: "bg-cell-abs text-red font-bold",
  M: "bg-cell-sick font-bold",
  V: "bg-cell-vac text-ink font-bold",
  H: "bg-cell-off text-cell-off-ink italic",
};

type Tool = "toggle" | "T" | "F" | "A" | "V" | "lock";

export function CalendarSection() {
  const sim = useSim();
  const { store, sector, analysis } = sim;
  const cfg = store.config;
  const days = analysis.days;
  const emps = analysis.employees;
  const [tool, setTool] = useState<Tool>("toggle");
  const [showHol, setShowHol] = useState(false);
  const setCfg = (patch: Partial<typeof cfg>) => sim.updateStore((s) => ({ ...s, config: { ...s.config, ...patch } }));

  const incoming = useMemo(() => {
    const ids = Array.from(new Set(store.reassignments.filter((r) => r.toSectorId === sector.id).map((r) => r.employeeId)));
    return ids.map((id) => store.employees.find((e) => e.id === id)).filter((e): e is NonNullable<typeof e> => !!e && e.sectorId !== sector.id);
  }, [store, sector.id]);

  const setCell = (empId: string, date: string, special: boolean, closed: boolean) => {
    sim.updateSector((sec: Sector) => {
      const row = { ...(sec.schedule[empId] ?? {}) };
      const day = days.find((d) => d.date === date)!;
      const cur = row[date] ?? { c: cellCode(sec, empId, day) };
      let next = { ...cur };
      if (tool === "lock") next = { ...cur, lock: !cur.lock };
      else {
        let c: Code;
        if (tool === "toggle") c = cur.c === "F" || cur.c === "A" || cur.c === "M" || cur.c === "V" ? (special ? "D" : "T") : cur.c === "H" ? "H" : "F";
        else if (tool === "T") c = special ? "D" : "T";
        else c = tool;
        if (closed && (c === "T" || c === "D")) return sec; // loja fechada
        next = { c, ...(cfg.lockManual || cur.lock ? { lock: true } : {}) };
      }
      row[date] = next;
      return { ...sec, schedule: { ...sec.schedule, [empId]: row } };
    });
    if (tool !== "lock") sim.noteManualEdit();
  };

  const unlockAll = () =>
    sim.updateSector((sec) => ({
      ...sec,
      schedule: Object.fromEntries(Object.entries(sec.schedule).map(([k, row]) => [k, Object.fromEntries(Object.entries(row).map(([d, c]) => [d, { c: c.c }]))])),
    }));

  const lockedCount = useMemo(() => {
    let n = 0;
    for (const e of emps) for (const d of days) if (sector.schedule[e.id]?.[d.date]?.lock) n++;
    return n;
  }, [emps, days, sector]);

  const hl = sim.highlight?.kind === "cell" ? sim.highlight : null;
  const weeks = cfg.weeks;
  const workingPerDay = days.map((d) => emps.filter((e) => isWorking(cellCode(sector, e.id, d))).length);
  const offPerDay = days.map((d) => emps.filter((e) => cellCode(sector, e.id, d) === "F").length);
  const lastDate = days[days.length - 1]?.date ?? cfg.startDate;

  return (
    <Section
      id="calendario"
      title={`Escala de ${fmtDateBR(cfg.startDate)} a ${fmtDateBR(lastDate)}`}
      subtitle={
        <>
          As folgas vão para os dias de menor movimento (ajuste na tabela de movimento). Quem trabalha no domingo usa a folga variável naquela semana. A última linha mostra quantas pessoas trabalham em cada dia; as
          colunas “Sem” mostram as horas de cada pessoa por semana.
        </>
      }
      actions={
        <>
          <label className="text-[12px] text-muted flex items-center gap-1">
            Início
            <input id="cal-start" type="date" className="field" value={cfg.startDate} onChange={(e) => e.target.value && setCfg({ startDate: e.target.value })} />
          </label>
          <label className="text-[12px] text-muted flex items-center gap-1">
            Semanas
            <Select id="cal-weeks" aria-label="Número de semanas" value={cfg.weeks} onChange={(v) => setCfg({ weeks: v })} options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: String(n) }))} />
          </label>
          <Btn kind="orange" onClick={() => sim.redistribute()} disabled={sim.running || !emps.length}>
            {sim.running ? "Calculando…" : "Redistribuir folgas automaticamente"}
          </Btn>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-4 text-[13px]">
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input id="cal-lock" type="checkbox" checked={cfg.lockManual} onChange={(e) => setCfg({ lockManual: e.target.checked })} />
          Bloquear folgas definidas manualmente
        </label>
        <span className="text-muted">
          {lockedCount} célula(s) bloqueada(s){" "}
          {lockedCount > 0 && (
            <button type="button" className="underline hover:text-ink" onClick={unlockAll}>
              desbloquear todas
            </button>
          )}
        </span>
        <label className="inline-flex items-center gap-1.5">
          Motor
          <Select
            id="cal-engine"
            aria-label="Motor de otimização"
            value={sim.engineChoice}
            onChange={sim.setEngineChoice}
            options={[
              { value: "auto", label: sim.solverOnline ? "CP-SAT (servidor) + local" : "Automático" },
              { value: "local", label: "Somente motor local" },
            ]}
          />
          <span className={`text-[11.5px] ${sim.solverOnline ? "text-green" : "text-muted"}`}>{sim.solverOnline ? `● ${sim.solverName ?? "OR-Tools"} conectado` : "● motor local (servidor CP-SAT não conectado)"}</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">Ao clicar na célula:</span>
        <div className="inline-flex rounded-md border border-line overflow-hidden" role="radiogroup" aria-label="Ferramenta de edição">
          {(
            [
              ["toggle", "Alternar T/F"],
              ["T", "T trabalha"],
              ["F", "F folga"],
              ["A", "A ausente"],
              ["V", "V férias"],
              ["lock", "Bloquear/desbloquear"],
            ] as [Tool, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              role="radio"
              aria-checked={tool === k}
              type="button"
              onClick={() => setTool(k)}
              className={`px-3 py-1.5 text-[12.5px] font-semibold border-r border-line last:border-r-0 ${tool === k ? "bg-navy text-navy-ink" : "bg-surface hover:bg-surface-2"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <AbsenceForm />
        <Btn onClick={() => setShowHol(!showHol)} aria-expanded={showHol}>
          Feriados ({cfg.holidays.length})
        </Btn>
      </div>
      {showHol && <Holidays />}
      <Legend />

      {!emps.length ? (
        <div className="rounded-md border border-dashed border-line p-6 text-center text-muted text-[13px]">
          Nenhuma pessoa cadastrada em {sector.name}. Cadastre a equipe em <a className="underline" href="#pessoas">Pessoas do setor</a> e clique em Redistribuir.
        </div>
      ) : (
        <div className="scroll-x rounded-md border border-line" id="cal-scroll">
          <table className="border-collapse text-[12px] tnum">
            <thead>
              <tr>
                <th className="th sticky left-0 z-10 bg-surface min-w-[150px]">Nome</th>
                {days.map((d) => (
                  <th
                    key={d.date}
                    className={`px-0 py-1 text-center font-semibold ${d.weekday === 0 ? "bg-cell-sun" : ""} ${d.idx % 7 === 0 ? "border-l-2 border-ink/40" : ""}`}
                    title={d.holiday ? `Feriado: ${d.holiday.name}${d.holiday.open ? " (loja aberta)" : " (loja fechada)"}` : undefined}
                  >
                    <div className="w-[30px] mx-auto leading-tight py-1">
                      <div className={`text-[12px] ${d.holiday ? "text-red underline" : ""}`}>{dayNum(d.date)}</div>
                      <div className="text-[9.5px] text-muted font-normal">{WEEKDAY_SHORT[d.weekday]}</div>
                    </div>
                  </th>
                ))}
                {Array.from({ length: weeks }, (_, w) => (
                  <th key={w} className={`th text-right ${w === 0 ? "border-l-2 border-ink/40" : ""}`}>
                    Sem {w + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {emps.map((e) => (
                <tr key={e.id}>
                  <th scope="row" className="sticky left-0 z-10 bg-surface border-t border-line px-3 py-1 text-left font-medium whitespace-nowrap max-w-[220px] overflow-hidden text-ellipsis">
                    <span className="text-ink">{e.name || e.func}</span>
                    {e.name && <span className="ml-1 text-[10.5px] text-muted font-normal">{e.func}</span>}
                  </th>
                  {days.map((d) => {
                    const cell = sector.schedule[e.id]?.[d.date];
                    const c = cellCode(sector, e.id, d);
                    const isHl = hl && hl.date === d.date && (!hl.empId || hl.empId === e.id);
                    return (
                      <td key={d.date} className={`p-0 border-t border-line ${d.idx % 7 === 0 ? "border-l-2 border-l-ink/40" : "border-l border-l-line"}`}>
                        <button
                          id={`cell-${e.id}-${d.date}`}
                          key={isHl ? `hl-${sim.highlight?.nonce}` : "n"}
                          type="button"
                          onClick={() => setCell(e.id, d.date, d.special, d.closed)}
                          aria-label={`${e.name || e.func}, ${fmtDateBR(d.date)}: ${c}${cell?.lock ? " (bloqueada)" : ""}`}
                          className={`relative block w-[30px] h-[28px] text-center leading-[28px] ${CODE_STYLE[c]} hover:outline hover:outline-2 hover:outline-focus ${isHl ? "outline outline-2 outline-red hl-pulse z-[1]" : ""}`}
                        >
                          {c}
                          {cell?.lock && <span className="absolute right-[1px] top-[1px] h-[5px] w-[5px] rounded-full bg-orange" aria-hidden />}
                        </button>
                      </td>
                    );
                  })}
                  {(analysis.weekly[e.id] ?? []).map((m, w) => (
                    <td key={w} className={`td text-right whitespace-nowrap ${w === 0 ? "border-l-2 border-l-ink/40" : ""} ${m > cfg.weeklyMaxMin ? "text-red font-bold" : m < e.contractMin ? "text-muted" : ""}`}>
                      {fmtDur(m)}
                    </td>
                  ))}
                </tr>
              ))}
              {incoming.map((e) => {
                const home = store.sectors.find((s) => s.id === e.sectorId)!;
                return (
                  <tr key={`in-${e.id}`} className="italic">
                    <th scope="row" className="sticky left-0 z-10 bg-surface-2 border-t border-line px-2 py-0.5 text-left font-medium whitespace-nowrap text-muted">
                      Coringa (apoio): {e.name || e.func}
                    </th>
                    {days.map((d) => {
                      const applies = store.reassignments.some((r) => r.employeeId === e.id && r.toSectorId === sector.id && (r.date ? r.date === d.date : r.weekdays.includes(d.weekday)));
                      const c = cellCode(home, e.id, d);
                      const show = applies && isWorking(c);
                      return (
                        <td key={d.date} className={`p-0 border-t border-line text-center ${d.idx % 7 === 0 ? "border-l-2 border-l-ink/40" : "border-l border-l-line"} ${show ? "bg-green-light text-green-light-ink" : "bg-surface-2 text-muted"}`}>
                          <div className="w-[30px] h-[28px] leading-[28px] text-[11px]" title={show ? `Apoio de ${home.name}` : undefined}>
                            {show ? "↗" : ""}
                          </div>
                        </td>
                      );
                    })}
                    <td colSpan={weeks} className="td text-[11px] text-muted border-l-2 border-l-ink/40">
                      de {home.name}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <th scope="row" className="sticky left-0 z-10 bg-surface-2 border-t-2 border-line px-2 py-1 text-left">
                  Trabalhando
                </th>
                {days.map((d, i) => {
                  const mv = sector.movement[d.special ? 0 : d.weekday];
                  const low = mv?.minStaff != null && workingPerDay[i] < mv.minStaff;
                  return (
                    <td key={d.date} className={`border-t-2 border-line text-center bg-surface-2 ${d.idx % 7 === 0 ? "border-l-2 border-l-ink/40" : ""} ${low ? "text-red" : ""}`}>
                      {d.closed ? "–" : workingPerDay[i]}
                    </td>
                  );
                })}
                <td colSpan={weeks} className="border-t-2 border-line bg-surface-2 border-l-2 border-l-ink/40" />
              </tr>
              <tr className="text-muted">
                <th scope="row" className="sticky left-0 z-10 bg-surface-2 border-t border-line px-2 py-0.5 text-left font-medium">
                  De folga
                </th>
                {days.map((d, i) => {
                  const mv = sector.movement[d.special ? 0 : d.weekday];
                  const over = mv?.maxOff != null && offPerDay[i] > mv.maxOff;
                  return (
                    <td key={d.date} className={`border-t border-line text-center bg-surface-2 ${d.idx % 7 === 0 ? "border-l-2 border-l-ink/40" : ""} ${over ? "text-red font-bold" : ""}`}>
                      {offPerDay[i]}
                    </td>
                  );
                })}
                <td colSpan={weeks} className="border-t border-line bg-surface-2 border-l-2 border-l-ink/40" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-muted">
        Ponto laranja = célula bloqueada (a redistribuição não altera). Horas em cinza ficam abaixo da jornada contratual (ex.: semana com domingo de jornada reduzida); em vermelho, acima do limite semanal de {fmtDur(cfg.weeklyMaxMin)}.
      </p>
    </Section>
  );
}

function Legend() {
  const sim = useSim();
  const legend = sim.store.config.legend;
  const [edit, setEdit] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 text-[12.5px]">
      {legend.map((l, i) => (
        <span key={l.code} className="inline-flex items-center gap-1.5">
          <span className={`inline-grid h-[18px] w-[20px] place-items-center rounded-sm border border-line text-[11px] ${CODE_STYLE[l.code]}`}>{l.code}</span>
          {edit ? (
            <TextInput
              id={`legend-${l.code}`}
              aria-label={`Descrição de ${l.code}`}
              className="w-44"
              value={l.label}
              onChange={(v) => sim.updateStore((s) => ({ ...s, config: { ...s.config, legend: s.config.legend.map((x, j) => (j === i ? { ...x, label: v } : x)) } }))}
            />
          ) : (
            <span className="text-muted">{l.label}</span>
          )}
        </span>
      ))}
      <button type="button" className="text-[11.5px] underline text-muted hover:text-ink" onClick={() => setEdit(!edit)}>
        {edit ? "concluir legenda" : "editar legenda"}
      </button>
    </div>
  );
}

function AbsenceForm() {
  const sim = useSim();
  const emps = sim.analysis.employees;
  const cfg = sim.store.config;
  const [open, setOpen] = useState(false);
  const [empRaw, setEmp] = useState(emps[0]?.id ?? "");
  const emp = emps.some((e) => e.id === empRaw) ? empRaw : emps[0]?.id ?? "";
  const [code, setCode] = useState<"A" | "V" | "F">("V");
  const [from, setFrom] = useState(cfg.startDate);
  const [to, setTo] = useState(addDays(cfg.startDate, 6));
  if (!open) return <Btn onClick={() => setOpen(true)}>Lançar férias / ausência</Btn>;
  const apply = () => {
    if (!emp || from > to) return;
    sim.updateSector((sec) => {
      const row = { ...(sec.schedule[emp] ?? {}) };
      for (let d = from; d <= to; d = addDays(d, 1)) row[d] = { c: code, lock: true };
      return { ...sec, schedule: { ...sec.schedule, [emp]: row } };
    });
    sim.noteManualEdit();
    setOpen(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1">
      <Select id="abs-emp" aria-label="Pessoa" value={emp} onChange={setEmp} options={emps.map((e) => ({ value: e.id, label: e.name || e.func }))} />
      <Select id="abs-code" aria-label="Tipo" value={code} onChange={setCode} options={[{ value: "V", label: "Férias (V)" }, { value: "A", label: "Ausência (A)" }, { value: "F", label: "Folga (F)" }]} />
      <input id="abs-from" type="date" aria-label="De" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
      <span className="text-muted">a</span>
      <input id="abs-to" type="date" aria-label="Até" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
      <Btn kind="primary" onClick={apply}>
        Lançar
      </Btn>
      <Btn onClick={() => setOpen(false)}>Cancelar</Btn>
    </div>
  );
}

function Holidays() {
  const sim = useSim();
  const hol = sim.store.config.holidays;
  const [date, setDate] = useState(sim.store.config.startDate);
  const [name, setName] = useState("");
  const set = (h: typeof hol) => sim.updateStore((s) => ({ ...s, config: { ...s.config, holidays: h } }));
  return (
    <div className="mb-3 rounded-md border border-line bg-surface-2 p-3 text-[12.5px]">
      <p className="text-muted mb-2">Feriado com loja aberta usa o horário e o turno de domingo; com loja fechada vira “H” para todos e não conta como folga semanal.</p>
      <ul className="flex flex-col gap-1 mb-2">
        {hol.map((h, i) => (
          <li key={h.date + i} className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{fmtDateBR(h.date)}</span>
            <span>{h.name}</span>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={h.open} onChange={(e) => set(hol.map((x, j) => (j === i ? { ...x, open: e.target.checked } : x)))} /> loja aberta
            </label>
            <ConfirmBtn label="Remover" confirmLabel="Remover feriado" onConfirm={() => set(hol.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-1.5">
        <input id="hol-date" type="date" aria-label="Data do feriado" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        <input id="hol-name" className="field" placeholder="Nome do feriado" value={name} onChange={(e) => setName(e.target.value)} />
        <Btn
          kind="primary"
          onClick={() => {
            if (!date || hol.some((h) => h.date === date)) return;
            set([...hol, { date, name: name || "Feriado", open: false }].sort((a, b) => a.date.localeCompare(b.date)));
            setName("");
          }}
        >
          Adicionar feriado
        </Btn>
      </div>
    </div>
  );
}
