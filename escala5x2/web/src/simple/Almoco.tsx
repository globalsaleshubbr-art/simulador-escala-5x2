"use client";
// Escala de Almoço (modelo 2). Cada pessoa tem um horário de almoço FIXO (o sistema sugere, você ajusta) ou está em
// RODÍZIO (o sistema escolhe a cada dia). Um horário pode ser mudado só num dia. O que você escolhe nunca é
// sobrescrito. As duas visões (Dia e Semana) têm os mesmos controles: a escolha de cada pessoa fica na linha dela.
import React, { useMemo, useState } from "react";
import { colorVars } from "./colors";
import { useStoreScope } from "./StoreScope";
import { useSim } from "../components/state";
import { Btn, ConfirmBtn, Select } from "../components/ui";
import { Card, CardTitle, PageHead, type PageId } from "./SimpleApp";
import {
  buildDays,
  cellCode,
  dayShift,
  employeeShift,
  folgaFixaDomingo,
  isWorking,
  slotAxis,
} from "../engine/model";
import { computeCoverage, daySlotStates } from "../engine/coverage";
import {
  aplicarAlmocos,
  almocoDoDomingo,
  almocoDoTurno,
  almocosJuntos,
  definirAlmoco,
  definirAlmocoDomingo,
  domingoDaPessoa,
  problemaAlmoco,
  sugerirHorarios,
} from "../engine/almoco";
import type { CalDay, Employee, Sector, Store } from "../engine/types";
import {
  addDays,
  fmtDateBR,
  fmtDur,
  fmtTime,
  toMin,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  weekStartOf,
} from "../engine/time";
import { PlantaoPill, TeamPill } from "./MonthView";
import { teamOf } from "./logic";
import { configDoSetor } from "../engine/regrasSetor";
import { GraficoAlmoco } from "./GraficoAlmoco";
import { matchSector } from "./Domingos";

const SLOT = 30;
type Ordem = "entrada" | "almoco" | "nome";
const ORDENS: { value: Ordem; label: string }[] = [
  { value: "entrada", label: "Horário de entrada" },
  { value: "almoco", label: "Horário do almoço" },
  { value: "nome", label: "Nome" },
];
const ROTULO: Record<string, string> = {
  F: "Folga",
  V: "Férias",
  A: "Falta",
  M: "Atestado",
  H: "Feriado",
};
const nomeDe = (e: Employee) => e.name || e.func;

/** Almoço próprio do domingo da pessoa: horário (vazio = automático) e tempo, sobre o turno de domingo. */
function DomingoAlmoco({
  e,
  st,
  upd,
}: {
  e: Employee;
  st: Store;
  upd: (fn: (s: Store) => Store, msg?: string) => void;
}) {
  const r = domingoDaPessoa(st, e);
  if (!r) return null;
  const doTurno = almocoDoDomingo(st, e);
  const nome = (e.name || e.func).trim();
  // horário escolhido que não cabe: o sistema usa o do turno e avisa
  const x = e.almocoDomingo ? toMin(e.almocoDomingo) : null;
  const len = r.breakEnd - r.breakStart;
  const prob =
    x != null
      ? problemaAlmoco({ ...r, breakStart: x, breakEnd: x + len }, x)
      : null;
  return (
    <span
      className="mt-0.5 flex flex-col gap-1 border-t border-dashed border-line pt-1.5"
      id={`alm-dom-${e.id}`}
    >
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span
          className="w-[52px] text-[11.5px] font-bold uppercase tracking-wide text-muted"
          title="Almoço próprio do domingo (turno de domingo)"
        >
          Domingo
        </span>
        <input
          type="time"
          step={60}
          id={`alm-dom-hora-${e.id}`}
          aria-label={`Horário de almoço de ${nome} no domingo`}
          title="Vazio: o sistema distribui no turno de domingo"
          className="field !py-1 tnum"
          value={e.almocoDomingo ?? ""}
          onChange={(ev) =>
            upd(
              (s) =>
                definirAlmocoDomingo(s, e.id, {
                  hora: ev.target.value || null,
                }),
              ev.target.value
                ? `${nome}: almoço de domingo às ${ev.target.value}.`
                : `${nome}: almoço de domingo automático.`,
            )
          }
        />
        <select
          id={`alm-dom-dur-${e.id}`}
          aria-label={`Tempo de almoço de ${nome} no domingo`}
          title="Tempo de almoço no domingo (a saída anda junto)"
          className="field !w-auto !py-1 tnum"
          value={
            e.almocoDomingoMin && e.almocoDomingoMin >= 15
              ? String(e.almocoDomingoMin)
              : ""
          }
          onChange={(ev) => {
            const min = ev.target.value ? Number(ev.target.value) : null;
            const r2 = domingoDaPessoa(
              {
                ...st,
                employees: st.employees.map((p) =>
                  p.id === e.id ? { ...p, almocoDomingoMin: min } : p,
                ),
              },
              { ...e, almocoDomingoMin: min },
            );
            const dur2 = r2 ? r2.breakEnd - r2.breakStart : doTurno;
            upd(
              (s) => definirAlmocoDomingo(s, e.id, { min }),
              dur2 > 0
                ? `${nome}: almoço de domingo de ${durTxt(dur2)}${min == null ? " (o do turno)" : ""}.${r2 ? ` No domingo a saída fica às ${fmtTime(r2.end)}, com as mesmas horas de trabalho.` : ""}`
                : `${nome}: sem almoço no domingo (como o turno de domingo).`,
            );
          }}
        >
          <option value="">
            {doTurno > 0
              ? `${durTxt(doTurno)} (turno dom.)`
              : "Sem almoço (turno dom.)"}
          </option>
          {Array.from({ length: 16 }, (_, i) => (i + 1) * 15)
            .filter((m) => m !== doTurno)
            .map((m) => (
              <option key={m} value={m}>
                {durTxt(m)}
              </option>
            ))}
        </select>
        {r.breakEnd <= r.breakStart ? (
          <span className="text-[11.5px] text-muted">sem almoço</span>
        ) : e.almocoDomingo ? (
          <button
            type="button"
            id={`alm-dom-auto-${e.id}`}
            className="rounded px-1 text-[12px] text-muted underline hover:text-ink"
            title="Volta ao automático: o sistema distribui no domingo"
            onClick={() =>
              upd(
                (s) => definirAlmocoDomingo(s, e.id, { hora: null }),
                `${nome}: almoço de domingo automático.`,
              )
            }
          >
            automático
          </button>
        ) : (
          <span className="text-[11.5px] text-muted">automático</span>
        )}
      </span>
      {prob && (
        <span
          className="max-w-[300px] text-[11.5px] font-semibold text-red"
          id={`alm-dom-aviso-${e.id}`}
        >
          Domingo: {prob}
          {r.breakStart !== x ? " O sistema usa o horário do turno." : ""}
        </span>
      )}
    </span>
  );
}

/** Dias mostrados: o dia escolhido ou a semana que o contém (pelo "Semana começa" da loja). */
function diasDaVista(st: Store, ver: "dia" | "semana", date: string): CalDay[] {
  const periodo = buildDays(st.config);
  const dia = (d: string): CalDay =>
    periodo.find((x) => x.date === d) ?? buildDays(st.config, d, 1)[0];
  if (ver === "dia") return [dia(date)];
  const ini = weekStartOf(date, st.config.weekStart ?? 1);
  return Array.from({ length: 7 }, (_, i) => dia(addDays(ini, i)));
}

/** 45 → "45 min"; 90 → "1h30" */
const durTxt = (m: number) => (m < 60 ? `${m} min` : fmtDur(m));

export function AlmocoPage({ go }: { go: (p: PageId) => void }) {
  const sim = useSim();
  const secName = sim.sector.name;
  const period = buildDays(sim.store.config);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const firstOpen = period.find((d) => !d.closed)?.date ?? period[0].date;
  const [date, setDate] = useState(
    period.some((d) => d.date === todayIso && !d.closed) ? todayIso : firstOpen,
  );
  const [ver, setVer] = useState<"dia" | "semana">("semana");
  const [func, setFunc] = useState("all");
  const [shiftName, setShiftName] = useState("all");
  const [q, setQ] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("entrada");
  const [desc, setDesc] = useState(false);
  const sc = useStoreScope("alm-store");
  const scoped = sc.stores
    .map((st) => ({ st, sec: matchSector(st, secName) }))
    .filter((x): x is { st: Store; sec: Sector } => !!x.sec);
  // horários sugeridos para quem não tem, rodízio e domingos aplicados — sozinho, sem passar por cima do que você escolheu
  const funcs = Array.from(
    new Set(
      scoped.flatMap(({ st, sec }) =>
        st.employees
          .filter((e) => e.sectorId === sec.id)
          .map((e) => e.func.trim())
          .filter(Boolean),
      ),
    ),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const shiftNames = Array.from(
    new Set(
      scoped.flatMap(({ sec }) =>
        sec.shifts.filter((s) => !s.special).map((s) => s.name),
      ),
    ),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const wd = new Date(`${date}T12:00:00`).getDay();
  const passo = ver === "dia" ? 1 : 7;
  return (
    <>
      <PageHead
        title={`Escala de Almoço · ${secName}`}
        sub="Cada pessoa almoça num horário fixo, que o sistema sugere onde sobra gente no posto (pelo Fluxo alto), dentro do horário de intervalo do turno, e refaz a cada Gerar escala. O que você escolher à mão o sistema não muda. Marque Rodízio para quem deve variar a cada dia."
        go={go}
      />
      <Card>
        <div
          className="flex flex-wrap items-end gap-4"
          role="group"
          aria-label="Filtros da escala de almoço"
        >
          {sc.select && (
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">
                Loja
              </span>
              {sc.select}
            </label>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">
              Ver
            </span>
            <div
              className="inline-flex overflow-hidden rounded-xl border border-line"
              role="radiogroup"
              aria-label="Ver um dia ou a semana"
              id="alm-ver"
            >
              {(
                [
                  ["semana", "Semana"],
                  ["dia", "Dia"],
                ] as ["dia" | "semana", string][]
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  id={`alm-ver-${k}`}
                  aria-checked={ver === k}
                  onClick={() => setVer(k)}
                  className={`border-r border-line px-4 py-2 text-[13px] font-semibold last:border-r-0 ${ver === k ? "bg-navy text-navy-ink" : "bg-surface hover:bg-surface-2"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">
              {ver === "dia" ? "Dia" : "Semana"}
            </span>
            <div className="inline-flex items-center gap-2">
              <Btn
                onClick={() => setDate(addDays(date, -passo))}
                aria-label={ver === "dia" ? "Dia anterior" : "Semana anterior"}
              >
                ‹
              </Btn>
              <input
                id="alm-date"
                type="date"
                className="field"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
              <Btn
                onClick={() => setDate(addDays(date, passo))}
                aria-label={ver === "dia" ? "Próximo dia" : "Próxima semana"}
              >
                ›
              </Btn>
              {ver === "dia" && (
                <span className="text-[13.5px] font-semibold">
                  {WEEKDAY_LONG[wd]}
                </span>
              )}
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">
              Ordenar por
            </span>
            <span className="inline-flex items-center gap-1">
              <Select
                id="alm-ordem"
                value={ordem}
                onChange={(v: Ordem) => setOrdem(v)}
                options={ORDENS}
              />
              <Btn
                id="alm-ordem-dir"
                aria-label={desc ? "Decrescente" : "Crescente"}
                title={desc ? "Decrescente" : "Crescente"}
                onClick={() => setDesc(!desc)}
              >
                {desc ? "▼" : "▲"}
              </Btn>
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">
              Função
            </span>
            <Select
              id="alm-func"
              value={funcs.includes(func) ? func : "all"}
              onChange={setFunc}
              options={[
                { value: "all", label: "Todas" },
                ...funcs.map((f) => ({ value: f, label: f })),
              ]}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">
              Turno
            </span>
            <Select
              id="alm-shift"
              value={shiftNames.includes(shiftName) ? shiftName : "all"}
              onChange={setShiftName}
              options={[
                { value: "all", label: "Todos" },
                ...shiftNames.map((f) => ({ value: f, label: f })),
              ]}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">
              Colaborador
            </span>
            <input
              id="alm-q"
              className="field w-44"
              placeholder="Nome"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
        </div>
      </Card>
      {sc.stores.map((st) => {
        const sec = matchSector(st, secName);
        if (!sec)
          return (
            <Card key={st.id}>
              <CardTitle>{st.name}</CardTitle>
              <p className="text-[14px] text-muted">
                Esta loja não tem o setor {secName}.
              </p>
            </Card>
          );
        return (
          <React.Fragment key={st.id}>
            <AlmocoSetor
              st={st}
              sec={sec}
              ver={ver}
              date={date}
              multi={sc.stores.length > 1 || st.id !== sim.store.id}
              filtro={{
                func: funcs.includes(func) ? func : "all",
                turno: shiftNames.includes(shiftName) ? shiftName : "all",
                q,
              }}
              ordem={ordem}
              desc={desc}
              abrirDia={(d) => {
                setDate(d);
                setVer("dia");
              }}
            />
            <GraficoAlmoco
              st={st}
              sec={sec}
              dias={diasDaVista(st, ver, date)}
              multi={sc.stores.length > 1 || st.id !== sim.store.id}
              irParaHoje={() => setDate(todayIso)}
            />
          </React.Fragment>
        );
      })}
    </>
  );
}

/** Problema de um horário de almoço no turno: não cabe ou fora do horário do intervalo do turno. */
function AlmocoSetor({
  st,
  sec,
  ver,
  date,
  multi,
  filtro,
  ordem,
  desc,
  abrirDia,
}: {
  st: Store;
  sec: Sector;
  ver: "dia" | "semana";
  date: string;
  multi: boolean;
  filtro: { func: string; turno: string; q: string };
  ordem: Ordem;
  desc: boolean;
  abrirDia: (d: string) => void;
}) {
  const sim = useSim();
  const upd = (fn: (s: Store) => Store, msg?: string) => {
    sim.updateStoreById(st.id, fn);
    if (msg) sim.setToast(msg);
  };
  const [editando, setEditando] = useState<{
    emp: string;
    date: string;
  } | null>(null);
  const periodo = buildDays(st.config);
  const dia = (d: string): CalDay =>
    periodo.find((x) => x.date === d) ?? buildDays(st.config, d, 1)[0];
  const ini = weekStartOf(date, st.config.weekStart ?? 1);
  const dias =
    ver === "dia"
      ? [dia(date)]
      : Array.from({ length: 7 }, (_, i) => dia(addDays(ini, i)));
  const todos = st.employees.filter((e) => e.sectorId === sec.id);
  const sempre = (e: Employee) => employeeShift(st, sec, e, false);
  const lista = todos
    .filter(
      (e) =>
        (filtro.func === "all" || e.func.trim() === filtro.func) &&
        (filtro.turno === "all" || sempre(e).shift?.name === filtro.turno) &&
        (!filtro.q || nomeDe(e).toLowerCase().includes(filtro.q.toLowerCase())),
    )
    .sort((a, b) => {
      const ra = sempre(a);
      const rb = sempre(b);
      const c =
        ordem === "nome"
          ? nomeDe(a).localeCompare(nomeDe(b), "pt-BR")
          : ordem === "almoco"
            ? (a.almocoRodizio ? 1e4 : ra.breakStart) -
                (b.almocoRodizio ? 1e4 : rb.breakStart) || ra.start - rb.start
            : ra.start - rb.start || ra.breakStart - rb.breakStart;
      const t = c || nomeDe(a).localeCompare(nomeDe(b), "pt-BR");
      return desc ? -t : t;
    });
  const nRod = todos.filter((e) => e.almocoRodizio).length;
  const nFixo = todos.filter(
    (e) => !e.almocoRodizio && sempre(e).breakEnd > sempre(e).breakStart,
  ).length;
  const juntos = dias
    .filter((d) => !d.closed)
    .map((d) => ({ d, ...almocosJuntos(st, sec.id, d) }));
  const pico = juntos.reduce((m, x) => (x.pico > m.pico ? x : m), {
    pico: 0,
    quando: null as number | null,
    d: dias[0],
  });

  // --- ações
  const setFixo = (e: Employee, hora: string) =>
    upd(
      (x) => definirAlmoco(x, e.id, { hora }),
      `${nomeDe(e)}: almoço fixo às ${hora}.`,
    );
  const setRodizio = (e: Employee, rod: boolean) =>
    upd(
      (x) => definirAlmoco(x, e.id, { rodizio: rod }),
      rod
        ? `${nomeDe(e)}: almoço em rodízio (muda a cada dia).`
        : `${nomeDe(e)}: almoço em horário fixo.`,
    );
  /** tempo de almoço do turno da pessoa (sem o tempo próprio dela) */
  const brkTurno = (e: Employee) => almocoDoTurno(st, e);
  /** tempo de almoço da pessoa (min); null = o do turno. A saída anda junto: as horas trabalhadas não mudam. */
  const setDur = (e: Employee, min: number | null) => {
    const v = min == null || min === brkTurno(e) ? null : min;
    upd((x) => definirAlmoco(x, e.id, { min: v }));
    const r = sempre({ ...e, almocoMin: v });
    sim.setToast(
      `${nomeDe(e)}: almoço de ${durTxt(r.breakEnd - r.breakStart)}${v == null ? " (o do turno)" : ""}. A saída fica às ${fmtTime(r.end)}, com as mesmas horas de trabalho.`,
    );
  };
  const cfgSetor = configDoSetor(st.config, sec);
  /** aviso da duração pelas regras da loja (grava mesmo assim) */
  const avisoDur = (r: {
    workMin: number;
    breakStart: number;
    breakEnd: number;
  }) => {
    const dur = r.breakEnd - r.breakStart;
    if (
      r.workMin > 360 &&
      cfgSetor.breakMinOver6h &&
      dur < cfgSetor.breakMinOver6h
    )
      return `Abaixo do mínimo de ${fmtDur(cfgSetor.breakMinOver6h)} para quem trabalha mais de 6h.`;
    if (cfgSetor.breakMax && dur > cfgSetor.breakMax)
      return `Acima do máximo de ${fmtDur(cfgSetor.breakMax)} da loja.`;
    return null;
  };
  /** só neste dia: grava à mão (o sistema não mexe mais); null volta ao horário de sempre */
  const setDia = (e: Employee, d: CalDay, hora: string | null) => {
    upd(
      (x) => {
        const s = x.sectors.find((y) => y.id === sec.id)!;
        const row = { ...(s.schedule[e.id] ?? {}) };
        const cur = row[d.date] ?? { c: cellCode(s, e.id, d) };
        const { brk: _b, brkFix: _f, ...rest } = cur;
        void _b;
        void _f;
        row[d.date] = hora ? { ...rest, brk: hora, brkFix: true } : rest;
        const y = {
          ...x,
          sectors: x.sectors.map((z) =>
            z.id === sec.id
              ? { ...z, schedule: { ...z.schedule, [e.id]: row } }
              : z,
          ),
        };
        return aplicarAlmocos(y, sec.id).store;
      },
      hora
        ? `${nomeDe(e)}: almoço às ${hora} só em ${fmtDateBR(d.date)}.`
        : `${nomeDe(e)}: ${fmtDateBR(d.date)} de volta ao horário de sempre.`,
    );
    setEditando(null);
  };
  const sugerirTodos = () =>
    upd(
      (x) =>
        aplicarAlmocos(
          sugerirHorarios(x, sec.id, { todos: true }).store,
          sec.id,
        ).store,
      `${sec.name}: horários de almoço sugeridos de novo (os mudados só num dia ficaram).`,
    );

  // --- dia: grade de meia em meia hora com o horário inteiro da loja
  const d0 = dias[0];
  const axis = useMemo(
    () => (ver === "dia" ? slotAxis(st.config, [d0], SLOT) : []),
    [ver, st.config, d0],
  );
  const cov = useMemo(
    () => (ver === "dia" ? computeCoverage(st, sec, [d0], axis)[0] : null),
    [ver, st, sec, d0, axis],
  );
  const naoTrabalham =
    ver === "dia"
      ? lista.filter((e) => !isWorking(cellCode(sec, e.id, d0)))
      : [];
  const linhas =
    ver === "dia"
      ? lista.filter((e) => isWorking(cellCode(sec, e.id, d0)))
      : lista;
  const almocando = axis.map(
    (_, i) =>
      todos.filter(
        (e) =>
          isWorking(cellCode(sec, e.id, d0)) &&
          daySlotStates(st, e, d0, axis)[i].state === "break",
      ).length,
  );
  // --- semana: pessoa-hora abaixo do mínimo em cada dia
  const covSem = useMemo(() => {
    if (ver !== "semana") return [];
    const ax = slotAxis(st.config, dias, SLOT);
    return computeCoverage(st, sec, dias, ax).map(
      (c) =>
        (c.req.reduce((a, r, i) => a + Math.max(0, r - c.counts[i]), 0) *
          SLOT) /
        60,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ver, st, sec, dias.map((d) => d.date).join()]);

  const corEstado = (s: string, cor?: string) =>
    s === "break"
      ? "var(--c-brk)"
      : s === "working"
        ? (cor ?? "var(--green-light)")
        : s === "out"
          ? "var(--c-V)"
          : s === "activity"
            ? "var(--c-H)"
            : "transparent";

  /** célula de um dia: o horário daquele dia, com edição "só neste dia" */
  const celulaDia = (e: Employee, d: CalDay) => {
    const c = cellCode(sec, e.id, d);
    if (d.closed) return <span className="text-muted">Fechada</span>;
    if (!isWorking(c))
      return <span className="text-muted">{ROTULO[c] ?? c}</span>;
    const r = dayShift(st, sec, e, d);
    if (r.breakEnd <= r.breakStart)
      return <span className="text-muted">Sem almoço</span>;
    const cel = sec.schedule[e.id]?.[d.date];
    const manual = !!cel?.brkFix;
    const prob = problemaAlmoco(r, r.breakStart);
    const ed = editando?.emp === e.id && editando.date === d.date;
    if (ed)
      return (
        <EditarDia
          key={`${e.id}-${d.date}`}
          inicial={fmtTime(r.breakStart)}
          manual={manual}
          onSalvar={(h) => setDia(e, d, h)}
          onVoltar={() => setDia(e, d, null)}
          onCancelar={() => setEditando(null)}
          id={`alm-ed-${e.id}-${d.date}`}
        />
      );
    return (
      <button
        type="button"
        data-alm={fmtTime(r.breakStart)}
        data-dia={d.date}
        data-manual={manual ? "1" : undefined}
        data-fora={prob ? "1" : undefined}
        id={`alm-dia-${e.id}-${d.date}`}
        title={`${fmtTime(r.breakStart)}–${fmtTime(r.breakEnd)}${manual ? " · mudado só neste dia" : d.special ? " · domingo/feriado: turno do dia" : e.almocoRodizio ? " · rodízio" : ""}${prob ? ` · ${prob}` : ""} — clique para mudar só neste dia`}
        onClick={() => setEditando({ emp: e.id, date: d.date })}
        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[13px] tnum hover:bg-surface-2 ${prob ? "border-red text-red font-semibold" : manual ? "border-navy font-semibold" : "border-line"}`}
      >
        {fmtTime(r.breakStart)}
        {manual && (
          <span className="rounded bg-navy px-1 text-[9.5px] font-bold uppercase text-navy-ink">
            só hoje
          </span>
        )}
        {!manual && e.almocoRodizio && !d.special && (
          <span aria-hidden className="text-[11px] text-muted">
            ↻
          </span>
        )}
      </button>
    );
  };

  return (
    <Card
      id={`alm-${st.id}`}
      style={colorVars(st.config) as React.CSSProperties}
    >
      <CardTitle
        sub={
          ver === "semana"
            ? `Semana de ${fmtDateBR(dias[0].date)} a ${fmtDateBR(dias[6].date)}. Na coluna “Almoço” fica o horário de cada pessoa (fixo ou rodízio); nos dias, clique num horário para mudar só aquele dia.`
            : `${WEEKDAY_LONG[d0.weekday]}, ${fmtDateBR(d0.date)}${d0.closed ? " — loja fechada" : ""}. Na coluna “Almoço” fica o horário de cada pessoa; em “Neste dia”, clique para mudar só hoje.`
        }
        actions={
          <ConfirmBtn
            kind="ghost"
            label="Sugerir horários de novo"
            confirmLabel="Recalcular todos"
            title="Recalcula o horário fixo de todo mundo que não está em rodízio. Os horários mudados só num dia ficam."
            onConfirm={sugerirTodos}
          />
        }
      >
        {multi ? `${st.name} · ` : ""}Almoço · {sec.name}
      </CardTitle>
      <p className="mb-3 text-[13.5px]" id={`alm-resumo-${st.id}`}>
        <b>{nFixo}</b> com horário fixo · <b>{nRod}</b> em rodízio
        {pico.pico > 0 && (
          <>
            {" "}
            · até <b>{pico.pico}</b> almoçando ao mesmo tempo
            {ver === "semana"
              ? ` (${WEEKDAY_SHORT[pico.d.weekday].toLowerCase()}`
              : " ("}
            {ver === "semana" ? " " : ""}às {fmtTime(pico.quando ?? 0)})
          </>
        )}
      </p>
      {!lista.length ? (
        <p className="text-[14px] text-muted">Ninguém com esses filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table
            className="w-full border-collapse text-[13px]"
            id={
              ver === "semana"
                ? `alm-semana-tab-${st.id}`
                : `alm-dia-tab-${st.id}`
            }
            style={{ minWidth: ver === "dia" ? 470 + axis.length * 19 : 900 }}
          >
            <thead>
              <tr className="bg-surface-2 text-left text-[11.5px] font-bold uppercase tracking-wide text-muted">
                <th className="sticky left-0 z-10 bg-surface-2 px-3 py-2">
                  Pessoa
                </th>
                <th className="px-3 py-2">Almoço</th>
                {ver === "semana"
                  ? dias.map((d) => (
                      <th key={d.date} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          className="hover:underline"
                          title="Ver a grade deste dia"
                          onClick={() => abrirDia(d.date)}
                        >
                          {WEEKDAY_SHORT[d.weekday]}
                          <span className="block text-[10.5px] font-normal">
                            {fmtDateBR(d.date, false)}
                          </span>
                        </button>
                      </th>
                    ))
                  : [
                      <th key="neste" className="px-2 py-2">
                        Neste dia
                      </th>,
                      ...axis.map((t) => (
                        <th
                          key={t}
                          className="px-0 py-2 text-center text-[10px] font-semibold"
                          style={{ width: 19 }}
                        >
                          {t % 60 === 0 ? `${t / 60}h` : ""}
                        </th>
                      )),
                    ]}
              </tr>
            </thead>
            <tbody>
              {linhas.map((e) => {
                const r = sempre(e);
                const temAlmoco = r.breakEnd > r.breakStart;
                const t = teamOf(e);
                const prob =
                  temAlmoco && !e.almocoRodizio
                    ? problemaAlmoco(r, r.breakStart)
                    : null;
                return (
                  <tr
                    key={e.id}
                    data-pessoa={e.id}
                    className="border-t border-line align-middle"
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-semibold"
                    >
                      {nomeDe(e)}
                      {t && <TeamPill t={t} />}
                      <PlantaoPill e={e} />
                      <span className="block text-[11px] font-normal text-muted">
                        {r.shift?.name} {fmtTime(r.start)}–{fmtTime(r.end)}
                        {temAlmoco
                          ? ` · ${durTxt(r.breakEnd - r.breakStart)}`
                          : ""}
                      </span>
                    </th>
                    <td className="px-3 py-2">
                      {temAlmoco ? (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <span
                              className="inline-flex overflow-hidden rounded-lg border border-line"
                              role="radiogroup"
                              aria-label={`Almoço de ${nomeDe(e)}`}
                              id={`alm-modo-${e.id}`}
                            >
                              {(
                                [
                                  [false, "Fixo"],
                                  [true, "Rodízio"],
                                ] as [boolean, string][]
                              ).map(([rod, l]) => (
                                <button
                                  key={l}
                                  type="button"
                                  role="radio"
                                  id={`alm-modo-${e.id}-${rod ? "rodizio" : "fixo"}`}
                                  aria-checked={!!e.almocoRodizio === rod}
                                  onClick={() =>
                                    !!e.almocoRodizio !== rod &&
                                    setRodizio(e, rod)
                                  }
                                  className={`px-2.5 py-1 text-[12px] font-semibold ${!!e.almocoRodizio === rod ? "bg-navy text-navy-ink" : "bg-surface hover:bg-surface-2"}`}
                                >
                                  {l}
                                </button>
                              ))}
                            </span>
                            <select
                              id={`alm-dur-${e.id}`}
                              aria-label={`Tempo de almoço de ${nomeDe(e)}`}
                              title="Tempo de almoço (a saída anda junto)"
                              className="field !w-auto !py-1 tnum"
                              value={
                                e.almocoMin && e.almocoMin >= 15
                                  ? String(e.almocoMin)
                                  : ""
                              }
                              onChange={(ev) =>
                                setDur(
                                  e,
                                  ev.target.value
                                    ? Number(ev.target.value)
                                    : null,
                                )
                              }
                            >
                              <option value="">{`${durTxt(brkTurno(e))} (turno)`}</option>
                              {Array.from(
                                { length: 16 },
                                (_, i) => (i + 1) * 15,
                              )
                                .filter((m) => m !== brkTurno(e))
                                .concat(
                                  e.almocoMin && e.almocoMin > 240
                                    ? [e.almocoMin]
                                    : [],
                                )
                                .map((m) => (
                                  <option key={m} value={m}>
                                    {durTxt(m)}
                                  </option>
                                ))}
                            </select>
                            {e.almocoRodizio ? (
                              <span className="text-[12px] text-muted">
                                muda a cada dia
                              </span>
                            ) : (
                              <>
                                <input
                                  type="time"
                                  step={60}
                                  id={`alm-hora-${e.id}`}
                                  aria-label={`Horário de almoço de ${nomeDe(e)}`}
                                  className="field !py-1 tnum"
                                  value={fmtTime(r.breakStart)}
                                  onChange={(ev) =>
                                    ev.target.value &&
                                    setFixo(e, ev.target.value)
                                  }
                                />
                                <span className="text-[12px] text-muted">
                                  até {fmtTime(r.breakEnd)}
                                </span>
                              </>
                            )}
                          </span>
                          {prob && (
                            <span
                              className="max-w-[300px] text-[11.5px] font-semibold text-red"
                              id={`alm-aviso-${e.id}`}
                            >
                              {prob}
                            </span>
                          )}
                          {avisoDur(r) && (
                            <span
                              className="max-w-[300px] text-[11.5px] font-semibold text-amber-ink"
                              id={`alm-dur-aviso-${e.id}`}
                            >
                              {avisoDur(r)}
                            </span>
                          )}
                          {st.config.sundayOpen !== false &&
                            !folgaFixaDomingo(e) && (
                              <DomingoAlmoco e={e} st={st} upd={upd} />
                            )}
                        </div>
                      ) : (
                        <span className="text-muted">Turno sem intervalo</span>
                      )}
                    </td>
                    {ver === "semana"
                      ? dias.map((d) => (
                          <td
                            key={d.date}
                            className="px-1.5 py-2 text-center whitespace-nowrap"
                          >
                            {celulaDia(e, d)}
                          </td>
                        ))
                      : [
                          <td
                            key="neste"
                            className="px-2 py-2 whitespace-nowrap"
                          >
                            {celulaDia(e, d0)}
                          </td>,
                          ...daySlotStates(st, e, d0, axis).map((s, i) => (
                            <td
                              key={i}
                              className="p-0"
                              title={`${fmtTime(axis[i])}: ${s.state === "break" ? "Almoço" : s.state === "working" ? "Trabalhando" : s.state === "out" ? "Em outro setor" : s.state === "activity" ? "Outra atividade" : "Fora do turno"}`}
                            >
                              <div
                                className="mx-[0.5px] h-[22px] rounded-[3px]"
                                style={{
                                  background: corEstado(
                                    s.state,
                                    dayShift(st, sec, e, d0).shift?.color,
                                  ),
                                }}
                              />
                            </td>
                          )),
                        ]}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="text-[12px]">
              {ver === "semana" ? (
                <>
                  <tr className="border-t-2 border-line bg-surface-2">
                    <th
                      className="sticky left-0 bg-surface-2 px-3 py-2 text-left"
                      colSpan={2}
                    >
                      Almoçando ao mesmo tempo (máximo)
                    </th>
                    {dias.map((d) => {
                      const j = juntos.find((x) => x.d.date === d.date);
                      return (
                        <td
                          key={d.date}
                          className="px-1.5 py-2 text-center tnum"
                          data-juntos={j?.pico ?? 0}
                        >
                          {j && j.pico
                            ? `${j.pico} às ${fmtTime(j.quando ?? 0)}`
                            : "—"}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="bg-surface-2">
                    <th
                      className="sticky left-0 bg-surface-2 px-3 py-2 text-left"
                      colSpan={2}
                    >
                      Abaixo do mínimo no posto
                    </th>
                    {dias.map((d, i) => (
                      <td
                        key={d.date}
                        className={`px-1.5 py-2 text-center tnum ${covSem[i] > 0 ? "font-semibold text-red" : "text-muted"}`}
                      >
                        {covSem[i] > 0
                          ? `${fmtDur(Math.round(covSem[i] * 60))} pessoa-hora`
                          : "ok"}
                      </td>
                    ))}
                  </tr>
                </>
              ) : (
                cov &&
                (
                  [
                    ["No posto", cov.counts, false],
                    ["Almoçando", almocando, false],
                    ["Mínimo", cov.req, false],
                    [
                      "Sobra / falta",
                      cov.counts.map((n, i) => n - cov.req[i]),
                      true,
                    ],
                  ] as [string, number[], boolean][]
                ).map(([k, v, saldo], ri) => (
                  <tr
                    key={k}
                    className={`bg-surface-2 ${ri === 0 ? "border-t-2 border-line" : ""}`}
                  >
                    <th
                      className="sticky left-0 bg-surface-2 px-3 py-1.5 text-left"
                      colSpan={3}
                    >
                      {k}
                    </th>
                    {v.map((n, i) => (
                      <td
                        key={i}
                        className={`p-0 text-center text-[11px] tnum ${saldo && n < 0 ? "font-bold text-red" : ""}`}
                      >
                        {saldo ? (n > 0 ? `+${n}` : n) : n}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tfoot>
          </table>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-muted">
        <span>
          <b className="rounded bg-navy px-1 text-[9.5px] uppercase text-navy-ink">
            só hoje
          </b>{" "}
          mudado só naquele dia (o sistema não mexe)
        </span>
        <span>↻ rodízio</span>
        <span className="font-semibold text-red">
          vermelho: fora do horário do intervalo do turno ou não cabe
        </span>
        <span>Domingo e feriado seguem o turno do dia.</span>
        {ver === "dia" && naoTrabalham.length > 0 && (
          <span>
            Não trabalham neste dia:{" "}
            {naoTrabalham
              .map(
                (e) =>
                  `${nomeDe(e)} (${(ROTULO[cellCode(sec, e.id, d0)] ?? "fora").toLowerCase()})`,
              )
              .join(", ")}
            .
          </span>
        )}
      </div>
    </Card>
  );
}

/** Editor de um dia: horário + "Salvar só neste dia" / "Voltar ao de sempre" / cancelar. */
function EditarDia({
  inicial,
  manual,
  onSalvar,
  onVoltar,
  onCancelar,
  id,
}: {
  inicial: string;
  manual: boolean;
  onSalvar: (h: string) => void;
  onVoltar: () => void;
  onCancelar: () => void;
  id: string;
}) {
  const [h, setH] = useState(inicial);
  return (
    <span
      className="inline-flex flex-col items-stretch gap-1 rounded-lg border border-navy bg-surface p-1.5 text-left"
      id={id}
    >
      <input
        type="time"
        step={60}
        className="field !py-0.5 tnum"
        aria-label="Horário só neste dia"
        value={h}
        onChange={(ev) => setH(ev.target.value)}
        autoFocus
        onKeyDown={(ev) => ev.key === "Escape" && onCancelar()}
      />
      <span className="inline-flex gap-1">
        <button
          type="button"
          id={`${id}-salvar`}
          className="rounded bg-navy px-2 py-0.5 text-[11.5px] font-semibold text-navy-ink"
          onClick={() => h && onSalvar(h)}
        >
          Só neste dia
        </button>
        {manual && (
          <button
            type="button"
            id={`${id}-voltar`}
            className="rounded border border-line px-2 py-0.5 text-[11.5px]"
            onClick={onVoltar}
            title="Volta ao horário de sempre (fixo ou rodízio)"
          >
            ↺
          </button>
        )}
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-[11.5px] text-muted"
          onClick={onCancelar}
          aria-label="Cancelar"
        >
          ✕
        </button>
      </span>
    </span>
  );
}
