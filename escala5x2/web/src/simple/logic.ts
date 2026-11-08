// Regras da versão simplificada: movimento deduzido da necessidade e sugestões de ação para os alertas.
import type { DayMovement, Jornada, Sector, Store } from "../engine/types";
import { datasCurtas, type Alert, type AlertRange, type SectorAnalysis } from "../engine/analysis";
import { daySlotStates } from "../engine/coverage";
import { buildDays, CONTRATACAO_PADRAO, employeeShift, folgaFixaDomingo, folgasDe, nomeFolgas, type Contratacao } from "../engine/model";
import { fmtTime, sundayIndex, toMin, uid, WEEKDAY_LONG } from "../engine/time";
import { simpleDemoStore } from "../engine/seed";
import { clearUnlocked } from "../engine/solver";
import { manterAlmoco } from "../engine/almoco";

/** Deduz o movimento (1 fraco, 2 médio, 3 forte) de cada dia a partir de quantas pessoas-hora são necessárias. */
export function deriveMovement(sector: Sector): DayMovement[] {
  const load = [0, 0, 0, 0, 0, 0, 0];
  for (const r of sector.minRules) {
    if (r.date) continue;
    const h = Math.max(0, toMin(r.end) - toMin(r.start)) / 60;
    for (const d of r.days) load[d] += r.min * h;
  }
  const max = Math.max(...load);
  return load.map((l, i) => {
    const old = sector.movement[i] ?? { intensity: 2 as const, maxOff: null, minStaff: null };
    const intensity: 1 | 2 | 3 = !max ? 2 : l >= 0.85 * max ? 3 : l >= 0.6 * max ? 2 : 1;
    return { ...old, intensity };
  });
}

export interface Suggestion {
  alert: Alert;
  range: AlertRange;
  weekday: number;
  title: string;
  action: string;
  score: number;
}

/** Os problemas de cobertura mais graves, cada um com uma sugestão do que fazer. */
export function topSuggestions(store: Store, a: SectorAnalysis, limit = 3): Suggestion[] {
  const weeks = Math.max(1, Math.ceil(a.days.length / 7));
  const out: Suggestion[] = [];
  for (const al of a.alerts) {
    if (!al.ranges || !al.id.startsWith("cov-")) continue;
    const wd = Number(al.id.split("-")[1]);
    for (const r of al.ranges) {
      const minutes = (r.to - r.from) * (a.axis[1] - a.axis[0] || 30);
      out.push({ alert: al, range: r, weekday: wd, title: "", action: "", score: r.missing * minutes * (r.weeks / weeks) });
    }
  }
  out.sort((x, y) => y.score - x.score);
  const top = out.slice(0, limit);
  for (const s of top) {
    const r = s.range;
    const from = fmtTime(a.axis[r.from]);
    const to = fmtTime(a.axis[r.to - 1] + (a.axis[1] - a.axis[0] || 30));
    const role = r.missing === 1 ? a.sector.roleSingular : a.sector.rolePlural;
    s.title = `${WEEKDAY_LONG[s.weekday]}, ${from}–${to}: ${r.missing === 1 ? "falta" : "faltam"} ${r.missing} ${role}${r.weeks < weeks ? ` (${r.dates?.length ? `${r.dates.length === 1 ? "só em" : "em"} ${datasCurtas(r.dates)}` : `em ${r.weeks} de ${weeks} semanas`})` : ""}`;
    s.action = why(store, a, s.weekday, r);
  }
  return top;
}

function why(store: Store, a: SectorAnalysis, wd: number, r: AlertRange): string {
  const day = a.days.find((d) => d.weekday === wd && d.week === Math.max(0, r.firstWeek)) ?? a.days.find((d) => d.weekday === wd)!;
  const slice = a.axis.slice(r.from, r.to);
  let brk = 0;
  let before = 0;
  let after = 0;
  let off = 0;
  const brkShifts = new Map<string, number>();
  for (const e of a.employees) {
    const st = daySlotStates(store, e, day, slice);
    const mid = st[Math.floor(st.length / 2)];
    if (!mid) continue;
    if (mid.state === "break") {
      brk++;
      const name = a.sector.shifts.find((s) => s.id === e.shiftId)?.name ?? "";
      brkShifts.set(name, (brkShifts.get(name) ?? 0) + 1);
    } else if (mid.state === "before") before++;
    else if (mid.state === "after") after++;
    else if (mid.state === "off") off++;
  }
  const n = r.missing;
  const end = fmtTime(a.axis[r.to - 1] + (a.axis[1] - a.axis[0] || 30));
  if (brk >= n) {
    const [shift, cnt] = Array.from(brkShifts.entries()).sort((x, y) => y[1] - x[1])[0] ?? ["", 0];
    return `${brk} pessoa(s) estão em intervalo nesse horário${shift ? ` (${cnt} do turno ${shift})` : ""}. Na Escala de Almoço, mude o horário de alguém desse turno para outro horário (ou use “Sugerir horários de novo”).`;
  }
  if (before >= n) return `Ainda não chegou gente suficiente. Antecipe a entrada de ${n} pessoa(s) ou crie em Horários um turno que comece antes das ${fmtTime(a.axis[r.from])}.`;
  if (after >= n) return `A equipe já saiu nesse horário. Crie em Horários um turno que vá até depois das ${end} e passe ${n} pessoa(s) para ele.`;
  if (off > 0) return `${off} pessoa(s) estão de folga nesse dia. Clique em Gerar escala para reorganizar as folgas; se continuar faltando, a equipe é pequena para essa necessidade.`;
  void employeeShift;
  return `A equipe não é suficiente para essa faixa. Reduza a necessidade em Fluxo alto ou cadastre mais pessoas.`;
}

// ------------------------------------------------------------------ Rodízio de domingos (Time A, B, C...)
// Regra "NxM": a pessoa trabalha N domingos seguidos e folga 1 (1x1 = domingo sim, domingo não; 2x1 = dois sim, um não).
// Cada time folga num domingo do ciclo; o ciclo é ancorado no calendário (não muda quando o período de planejamento muda).
// Internamente: sundayCycle = N+1 (tamanho do ciclo) e sundayOffset = qual domingo do ciclo é a folga (1..N+1).
export type SundayTeam = string;
type SunEmp = { sundayCycle: number; sundayOffset: number; regime?: string | null };
const LETRAS = "ABCDEFGH";
/** Letra do time a partir do domingo de folga no ciclo (para ciclo 2: folga 2 = Time A, folga 1 = Time B). */
export const letraTime = (offset: number, ciclo: number) => LETRAS[offset % ciclo] ?? "?";
/** Time de domingo da pessoa (quem está num rodízio com domingo de folga definido). */
export const teamOf = (e: SunEmp): SundayTeam | null => (e.regime !== "12x36" && e.sundayCycle >= 2 && e.sundayCycle <= LETRAS.length && e.sundayOffset >= 1 && e.sundayOffset <= e.sundayCycle ? letraTime(e.sundayOffset, e.sundayCycle) : null);
/** Coloca a pessoa num time do rodízio (ciclo 2 = domingo sim, domingo não). */
export const teamPatch = (t: SundayTeam, ciclo = 2) => {
  const i = Math.max(0, LETRAS.indexOf(t));
  return { sundayCycle: ciclo, sundayOffset: i === 0 ? ciclo : i };
};
/** Time que folga neste domingo. */
export const teamOffOnSunday = (iso: string, ciclo = 2): SundayTeam => letraTime((((sundayIndex(iso) % ciclo) + ciclo) % ciclo) + 1, ciclo);
/** Times que trabalham neste domingo (texto: "A" ou "A e B"). */
export const teamOnSunday = (iso: string, ciclo = 2): string => {
  const off = teamOffOnSunday(iso, ciclo);
  const on = LETRAS.slice(0, ciclo).split("").filter((l) => l !== off);
  return on.length > 1 ? `${on.slice(0, -1).join(", ")} e ${on[on.length - 1]}` : on[0];
};
/** Tamanho do ciclo usado pelos times de uma lista de pessoas (o mais comum). */
export function cicloDosTimes(emps: SunEmp[]): number {
  const n = new Map<number, number>();
  for (const e of emps) if (teamOf(e)) n.set(e.sundayCycle, (n.get(e.sundayCycle) ?? 0) + 1);
  let best = 2;
  let max = 0;
  n.forEach((v, k) => v > max && ((max = v), (best = k)));
  return best;
}

export type RegraDom = "alternado" | "individual";
/** Regra de domingo valendo para o setor: a do próprio setor, se tiver, ou a da loja. */
export function regraDomingo(store: Store, sec: Pick<Sector, "sundayRule" | "sundayWork">) {
  const propria = sec.sundayRule != null;
  const rule: RegraDom = (sec.sundayRule ?? store.config.sundayRule ?? "alternado") as RegraDom;
  const work = Math.max(1, Math.min(6, Math.round((propria ? sec.sundayWork : store.config.sundayWork) ?? 1)));
  return { rule, work, ciclo: work + 1, propria };
}
export const nomeRegra = (rule: RegraDom, work: number) => (rule === "individual" ? "cada pessoa com sua regra" : work === 1 ? "1x1 (domingo sim, domingo não)" : `${work}x1 (${work} domingos trabalhados, 1 de folga)`);

/** Quem entra no rodízio: trabalha aos domingos e não tem folga fixa no domingo. */
const entraNoRodizio = (e: Store["employees"][number]) => e.sundayCycle !== 0 && !folgaFixaDomingo(e) && e.regime !== "12x36";

/** Divide quem trabalha aos domingos em times equilibrados, alternando dentro de cada turno. */
export function splitTeams(store: Store, sectorId: string): Record<string, SundayTeam> {
  const st = applyTeamsAll(store, { fresh: true, sectorId });
  const out: Record<string, SundayTeam> = {};
  for (const e of st.employees) if (e.sectorId === sectorId && teamOf(e)) out[e.id] = teamOf(e)!;
  return out;
}

/**
 * Coloca num time quem trabalha aos domingos e ainda não tem time válido para a regra do setor
 * (todos os setores com rodízio, ou só `sectorId`), equilibrando o tamanho dos times dentro de cada turno.
 * Quem já tem time válido continua no mesmo (a menos que `fresh`).
 */
export function applyTeamsAll(store: Store, opts: { fresh?: boolean; sectorId?: string } = {}): Store {
  const patch = new Map<string, { sundayCycle: number; sundayOffset: number }>();
  for (const sec of store.sectors) {
    if (opts.sectorId && sec.id !== opts.sectorId) continue;
    const { rule, ciclo } = regraDomingo(store, sec);
    if (rule !== "alternado") continue;
    const people = store.employees.filter((e) => e.sectorId === sec.id && entraNoRodizio(e));
    const valido = (e: SunEmp) => !opts.fresh && e.sundayCycle === ciclo && teamOf(e) != null;
    const start = (shiftId: string) => toMin(sec.shifts.find((x) => x.id === shiftId)?.start ?? "99:00");
    const letras = LETRAS.slice(0, ciclo).split("");
    const cnt = new Map(letras.map((l) => [l, 0]));
    const byShift = new Map<string, Map<string, number>>();
    const bump = (shiftId: string, t: string) => {
      cnt.set(t, (cnt.get(t) ?? 0) + 1);
      const m = byShift.get(shiftId) ?? new Map(letras.map((l) => [l, 0]));
      m.set(t, (m.get(t) ?? 0) + 1);
      byShift.set(shiftId, m);
    };
    for (const e of people) if (valido(e)) bump(e.shiftId, teamOf(e)!);
    const rest = people.filter((e) => !valido(e)).sort((a, b) => start(a.shiftId) - start(b.shiftId) || (a.name || a.func).localeCompare(b.name || b.func, "pt-BR"));
    for (const e of rest) {
      const m = byShift.get(e.shiftId) ?? new Map(letras.map((l) => [l, 0]));
      // time com menos gente no turno; empate: menos gente no setor; empate: ordem A, B, C
      const t = [...letras].sort((x, y) => (m.get(x) ?? 0) - (m.get(y) ?? 0) || (cnt.get(x) ?? 0) - (cnt.get(y) ?? 0) || x.localeCompare(y))[0];
      patch.set(e.id, teamPatch(t, ciclo));
      bump(e.shiftId, t);
    }
  }
  if (!patch.size) return store;
  return { ...store, employees: store.employees.map((e) => (patch.has(e.id) ? { ...e, ...patch.get(e.id)! } : e)) };
}

/**
 * Aplica uma regra de domingo (na loja inteira ou num setor) e refaz os times de quem precisa.
 * Não refaz a escala: quem chama decide (normalmente limpando o que não foi fixado à mão).
 */
export function aplicarRegraDomingo(store: Store, alvo: { sectorId: string | null }, regra: { rule: RegraDom | "loja"; work: number }): Store {
  let st: Store;
  if (alvo.sectorId == null) {
    st = { ...store, config: { ...store.config, sundayRule: regra.rule === "loja" ? store.config.sundayRule : regra.rule, sundayWork: regra.work } };
  } else {
    st = {
      ...store,
      sectors: store.sectors.map((s) => (s.id !== alvo.sectorId ? s : regra.rule === "loja" ? { ...s, sundayRule: null, sundayWork: null } : { ...s, sundayRule: regra.rule, sundayWork: regra.work })),
    };
  }
  return applyTeamsAll(st, alvo.sectorId ? { sectorId: alvo.sectorId } : {});
}

/** Loja de demonstração já com a regra de domingo (Time A e Time B) aplicada desde o início. */
export function demoStoreWithTeams(start?: string): Store {
  const st = simpleDemoStore(start);
  return clearUnlocked(applyTeamsAll({ ...st, config: { ...st.config, sundayRule: "alternado" } }, { fresh: true }));
}

// ------------------------------------------------------------------ 12x36
/** Apaga os dias não fixados de uma pessoa no período (a escala dela é refeita sem mexer nos outros). */
export function limparPessoa(store: Store, sectorId: string, empId: string): Store {
  const dates = new Set(buildDays(store.config).map((d) => d.date));
  return {
    ...store,
    sectors: store.sectors.map((s) => {
      if (s.id !== sectorId || !s.schedule[empId]) return s;
      const row = Object.fromEntries(Object.entries(s.schedule[empId]).filter(([d, c]) => !dates.has(d) || c.lock || c.c === "A" || c.c === "M" || c.c === "V"));
      return { ...s, schedule: { ...s.schedule, [empId]: row } };
    }),
  };
}

/** Turno de plantão padrão (07h às 19h: 11h de trabalho + 1h de intervalo). */
export function novoPlantao(noturno = false): Sector["shifts"][number] {
  return noturno
    ? { id: uid("sh_"), name: "Plantão noite", start: "19:00", breakStart: "01:00", breakMin: 60, workMin: 660, special: false, plantao: true }
    : { id: uid("sh_"), name: "Plantão dia", start: "07:00", breakStart: "12:00", breakMin: 60, workMin: 660, special: false, plantao: true };
}

/**
 * Coloca a pessoa no 12x36 (Plantão A ou B) ou de volta no regime da loja.
 * Cria um turno de plantão no setor se ainda não houver; refaz só a escala dessa pessoa.
 */
export function mudarRegime(store: Store, empId: string, regime: "loja" | "A" | "B"): Store {
  const e = store.employees.find((x) => x.id === empId);
  if (!e) return store;
  const sec = store.sectors.find((s) => s.id === e.sectorId)!;
  let shifts = sec.shifts;
  let st = store;
  if (regime === "loja") {
    const normal = shifts.find((s) => s.id === e.shiftId && !s.plantao && !s.special) ?? shifts.find((s) => !s.special && !s.plantao);
    const { rule, ciclo } = regraDomingo(store, sec);
    st = { ...st, employees: st.employees.map((x) => (x.id === empId ? { ...x, regime: null, jornadaId: null, folgasSemana: null, plantaoFase: undefined, shiftId: normal?.id ?? x.shiftId, breakStart: null, sundayCycle: rule === "alternado" ? ciclo : 2, sundayOffset: 0 } : x)) };
    st = applyTeamsAll(st, { sectorId: sec.id });
  } else {
    let pl = shifts.find((s) => s.id === e.shiftId && s.plantao) ?? shifts.find((s) => s.plantao);
    if (!pl) {
      pl = novoPlantao();
      shifts = [...shifts, pl];
      st = { ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? { ...s, shifts } : s)) };
    }
    st = { ...st, employees: st.employees.map((x) => (x.id === empId ? { ...x, regime: "12x36" as const, jornadaId: null, folgasSemana: null, plantaoFase: (regime === "B" ? 1 : 0) as 0 | 1, shiftId: pl!.id, breakStart: null, fixedOff: null, fixedOff2: null } : x)) };
  }
  return limparPessoa(st, sec.id, empId);
}

/** Texto curto do regime da pessoa. */
export function regimeTexto(e: { regime?: string | null; plantaoFase?: 0 | 1; jornadaId?: string | null; folgasSemana?: number | null }, cfg: { folgasPorSemana: number; jornadas?: Jornada[] }): string {
  if (e.regime === "12x36") return `12x36 · Plantão ${e.plantaoFase === 1 ? "B" : "A"}`;
  const j = e.jornadaId ? cfg.jornadas?.find((x) => x.id === e.jornadaId) : null;
  if (j) return j.nome;
  if (e.folgasSemana != null) return nomeFolgas(e.folgasSemana);
  return cfg.folgasPorSemana === 2 ? "5x2" : cfg.folgasPorSemana === 1 ? "6x1" : `${7 - cfg.folgasPorSemana}x${cfg.folgasPorSemana}`;
}

/** Plantão com menos gente no setor (para quem entra no 12x36 sem plantão definido). */
export function plantaoMenor(store: Store, sectorId: string): "A" | "B" {
  const p = store.employees.filter((e) => e.sectorId === sectorId && e.regime === "12x36");
  const a = p.filter((e) => e.plantaoFase !== 1).length;
  return a <= p.length - a ? "A" : "B";
}

/** Loja marcada como 12x36 só quando todos os setores em uso estão em 12x36. */
function sincModeloLoja(st: Store): Store {
  const usados = st.sectors.filter((s) => !s.hidden);
  const todos = usados.length > 0 && usados.every((s) => s.modeloEscala === "12x36");
  return { ...st, config: { ...st.config, modeloEscala: todos ? "12x36" : null } };
}

/** Modelo 12x36 num setor: todos do setor passam para plantão, metade de cada turno no A e metade no B. */
export function aplicarModelo12x36Setor(store: Store, sectorId: string): Store {
  const sec = store.sectors.find((s) => s.id === sectorId);
  if (!sec) return store;
  let st: Store = { ...store, sectors: store.sectors.map((s) => (s.id === sectorId ? { ...s, modeloEscala: "12x36" as const, jornadaId: null } : s)) };
  const start = (id: string) => toMin(sec.shifts.find((s) => s.id === id)?.start ?? "99:00");
  const emps = store.employees.filter((e) => e.sectorId === sectorId).sort((a, b) => start(a.shiftId) - start(b.shiftId) || (a.name || a.func).localeCompare(b.name || b.func, "pt-BR"));
  emps.forEach((e, i) => {
    st = mudarRegime(st, e.id, e.regime === "12x36" ? (e.plantaoFase === 1 ? "B" : "A") : i % 2 === 0 ? "A" : "B");
  });
  return sincModeloLoja(st);
}

/** Tira o setor do 12x36: quem estava em plantão volta ao regime da loja (5x2/6x1). */
export function sairModelo12x36Setor(store: Store, sectorId: string): Store {
  let st: Store = { ...store, sectors: store.sectors.map((s) => (s.id === sectorId ? { ...s, modeloEscala: null } : s)) };
  for (const e of store.employees) if (e.sectorId === sectorId && e.regime === "12x36") st = mudarRegime(st, e.id, "loja");
  return sincModeloLoja(st);
}

/** Modelo 12x36 na loja inteira: aplica em todos os setores em uso. */
export function aplicarModelo12x36(store: Store): Store {
  let st = store;
  for (const sec of store.sectors) if (!sec.hidden) st = aplicarModelo12x36Setor(st, sec.id);
  return { ...st, config: { ...st.config, modeloEscala: "12x36" } };
}

/** Volta a loja inteira para 5x2/6x1: todos os setores saem do 12x36. */
export function sairModelo12x36(store: Store, folgasPorSemana: number): Store {
  let st: Store = { ...store, config: { ...store.config, folgasPorSemana } };
  for (const sec of store.sectors) st = sairModelo12x36Setor(st, sec.id);
  for (const e of st.employees) if (e.regime === "12x36") st = mudarRegime(st, e.id, "loja");
  return { ...st, config: { ...st.config, modeloEscala: null } };
}

/**
 * Muda a contratação da pessoa. Estagiário e jovem aprendiz recebem jornada própria
 * (padrão 6h por dia e 30h por semana, editáveis); quem volta para CLT retoma a jornada da loja.
 */
export function mudarContratacao(store: Store, empId: string, tipo: Contratacao): Store {
  const cfg = store.config;
  // turno com horas próprias (ex.: "Estágio 5h"): a pessoa segue as horas do turno
  const turnoComHoras = (e: Store["employees"][number]) => store.sectors.find((s) => s.id === e.sectorId)?.shifts.find((x) => x.id === e.shiftId)?.workMin != null;
  const st: Store = {
    ...store,
    employees: store.employees.map((e) => {
      if (e.id !== empId) return e;
      if (tipo === "clt") return { ...e, contratacao: null, horasDia: null, intervaloMin: null, contractMin: cfg.weeklyMaxMin };
      const p = CONTRATACAO_PADRAO[tipo];
      const jaTinha = e.contratacao === "estagio" || e.contratacao === "aprendiz";
      return { ...e, contratacao: tipo, horasDia: jaTinha ? e.horasDia ?? null : turnoComHoras(e) ? null : p.dia, contractMin: jaTinha ? e.contractMin : p.semana, intervaloMin: jaTinha ? e.intervaloMin ?? null : null };
    }),
  };
  return manterAlmoco(st, empId);
}

// ---------------------------------------------------------------- jornadas cadastradas (nome, dias, horas)
/** Texto curto da jornada: "5 dias × 6h = 30h por semana". */
export function jornadaResumo(j: Pick<Jornada, "diasSemana" | "horasDia">): string {
  const h = (m: number) => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;
  return `${j.diasSemana} ${j.diasSemana === 1 ? "dia" : "dias"} × ${h(j.horasDia)} = ${h(j.diasSemana * j.horasDia)} por semana`;
}

export function novaJornada(base?: Partial<Jornada>): Jornada {
  return { id: uid("jr_"), nome: "Nova jornada", diasSemana: 5, horasDia: 360, intervaloMin: null, ...base };
}

/** Coloca a pessoa numa jornada cadastrada (sai do 12x36, se estava). A escala dela é refeita. */
export function aplicarJornada(store: Store, empId: string, jornadaId: string): Store {
  const j = store.config.jornadas?.find((x) => x.id === jornadaId);
  let st = store;
  const e0 = st.employees.find((x) => x.id === empId);
  if (!j || !e0) return store;
  if (e0.regime === "12x36") st = mudarRegime(st, empId, "loja");
  st = { ...st, employees: st.employees.map((x) => (x.id === empId ? { ...x, jornadaId: j.id, contractMin: j.diasSemana * j.horasDia } : x)) };
  return limparPessoa(manterAlmoco(st, empId), e0.sectorId, empId);
}

/** Cria ou altera uma jornada; quem está nela tem as horas da semana atualizadas e, se mudaram os dias, a escala refeita. */
export function salvarJornada(store: Store, j: Jornada): Store {
  const lista = store.config.jornadas ?? [];
  const antes = lista.find((x) => x.id === j.id);
  const jornadas = antes ? lista.map((x) => (x.id === j.id ? j : x)) : [...lista, j];
  let st: Store = { ...store, config: { ...store.config, jornadas } };
  const quem = st.employees.filter((e) => e.jornadaId === j.id);
  st = { ...st, employees: st.employees.map((e) => (e.jornadaId === j.id ? { ...e, contractMin: j.diasSemana * j.horasDia } : e)) };
  if (antes && antes.diasSemana !== j.diasSemana) for (const e of quem) st = limparPessoa(st, e.sectorId, e.id);
  return st;
}

/** Exclui a jornada: quem estava nela e os setores que a seguiam voltam ao regime da loja. */
export function excluirJornada(store: Store, id: string): Store {
  let st: Store = { ...store, config: { ...store.config, jornadas: (store.config.jornadas ?? []).filter((x) => x.id !== id) }, sectors: store.sectors.map((s) => (s.jornadaId === id ? { ...s, jornadaId: null } : s)) };
  for (const e of store.employees) if (e.jornadaId === id) st = mudarRegime(st, e.id, "loja");
  return st;
}

/** Setor inteiro numa jornada cadastrada (ou de volta ao regime da loja com null). */
export function aplicarJornadaSetor(store: Store, sectorId: string, jornadaId: string | null): Store {
  let st = store;
  const sec = st.sectors.find((s) => s.id === sectorId);
  if (!sec) return store;
  if (sec.modeloEscala === "12x36") st = sairModelo12x36Setor(st, sectorId);
  st = { ...st, sectors: st.sectors.map((s) => (s.id === sectorId ? { ...s, jornadaId } : s)) };
  for (const e of store.employees) {
    if (e.sectorId !== sectorId) continue;
    if (jornadaId) st = aplicarJornada(st, e.id, jornadaId);
    else if (e.jornadaId || e.regime === "12x36") st = mudarRegime(st, e.id, "loja");
  }
  return st;
}

// ---------------------------------------------------------------- 5x2 / 6x1 por pessoa e por setor
/** Folgas padrão de quem está no setor: as do setor ou as da loja. */
export function folgasPadraoSetor(store: Store, sectorId: string): number {
  return store.sectors.find((s) => s.id === sectorId)?.folgasSemana ?? store.config.folgasPorSemana;
}

/** Põe a pessoa em 5x2 (2 folgas) ou 6x1 (1 folga), saindo do 12x36 ou de jornada cadastrada. A escala dela é refeita. */
export function mudarFolgas(store: Store, empId: string, folgas: number): Store {
  const e0 = store.employees.find((x) => x.id === empId);
  if (!e0) return store;
  let st = e0.regime === "12x36" || e0.jornadaId ? mudarRegime(store, empId, "loja") : store;
  const padrao = folgasPadraoSetor(st, e0.sectorId);
  st = { ...st, employees: st.employees.map((x) => (x.id === empId ? { ...x, folgasSemana: folgas === padrao ? null : folgas, ...(folgas < 2 ? { fixedOff2: null } : {}) } : x)) };
  return limparPessoa(manterAlmoco(st, empId), e0.sectorId, empId);
}

/**
 * Setor em 5x2 ou 6x1, independente da loja (null = igual à loja). Todos do setor passam para esse modelo
 * (quem estava em 12x36, jornada cadastrada ou com modelo próprio também) e a escala do setor é refeita.
 */
export function aplicarFolgasSetor(store: Store, sectorId: string, folgas: number | null): Store {
  let st = store;
  const sec = st.sectors.find((s) => s.id === sectorId);
  if (!sec) return store;
  if (sec.modeloEscala === "12x36") st = sairModelo12x36Setor(st, sectorId);
  st = { ...st, sectors: st.sectors.map((s) => (s.id === sectorId ? { ...s, jornadaId: null, folgasSemana: folgas } : s)) };
  for (const e of store.employees) if (e.sectorId === sectorId && (e.jornadaId || e.regime === "12x36")) st = mudarRegime(st, e.id, "loja");
  st = { ...st, employees: st.employees.map((e) => (e.sectorId === sectorId ? { ...e, folgasSemana: null } : e)) };
  return clearUnlocked(st, sectorId);
}

/** Texto do modelo da pessoa (12x36, jornada, 5x2/6x1 próprio ou do setor/loja). */
export function modeloDaPessoa(store: Store, e: Store["employees"][number]): string {
  if (e.regime === "12x36") return `12x36 · Plantão ${e.plantaoFase === 1 ? "B" : "A"}`;
  const j = e.jornadaId ? store.config.jornadas?.find((x) => x.id === e.jornadaId) : null;
  return j ? j.nome : nomeFolgas(folgasDe(store, e));
}

// ---------------------------------------------------------------- turno de domingo habitual
/** Domingos/feriados do período em que a pessoa está com um turno escolhido à mão diferente do habitual. */
export function domingosForaDoHabitual(store: Store, empId: string): string[] {
  const e = store.employees.find((x) => x.id === empId);
  const sec = e && store.sectors.find((s) => s.id === e.sectorId);
  if (!e || !sec) return [];
  const hab = e.sundayShiftId ?? sec.defaultSundayShiftId;
  const row = sec.schedule[empId] ?? {};
  return buildDays(store.config)
    .filter((d) => d.special && !d.closed)
    .filter((d) => {
      const c = row[d.date];
      return !!c?.shiftId && c.shiftId !== hab && !!sec.shifts.find((x) => x.id === c.shiftId)?.special;
    })
    .map((d) => d.date);
}

/** Tira o turno escolhido à mão nos domingos/feriados do período: volta o habitual (trabalho/folga e bloqueio mantidos). */
export function domingosNoHabitual(store: Store, empId: string): Store {
  const e = store.employees.find((x) => x.id === empId);
  if (!e) return store;
  const datas = new Set(buildDays(store.config).filter((d) => d.special).map((d) => d.date));
  return {
    ...store,
    sectors: store.sectors.map((s) => {
      if (s.id !== e.sectorId || !s.schedule[empId]) return s;
      const row = Object.fromEntries(
        Object.entries(s.schedule[empId]).map(([d, c]) => {
          if (!datas.has(d) || !c.shiftId || !s.shifts.find((x) => x.id === c.shiftId)?.special) return [d, c];
          const { shiftId: _x, ...resto } = c;
          return [d, resto];
        }),
      );
      return { ...s, schedule: { ...s.schedule, [empId]: row } };
    }),
  };
}

/** Muda o turno de domingo habitual e aplica nos domingos já escalados (inclusive os escolhidos à mão). */
export function mudarTurnoDomingo(store: Store, empId: string, shiftId: string | null): Store {
  const st: Store = { ...store, employees: store.employees.map((p) => (p.id === empId ? { ...p, sundayShiftId: shiftId } : p)) };
  return domingosNoHabitual(st, empId);
}

// ---------------------------------------------------------------- feriados e dias sem folga
/**
 * Refaz as semanas que contêm estas datas, em todos os setores: apaga o que não foi fixado à mão
 * (férias, faltas e atestados ficam) para a escala ser completada de novo com a regra nova.
 */
export function refazerSemanasDe(store: Store, datas: string[]): Store {
  const days = buildDays(store.config);
  const semanas = new Set(days.filter((d) => datas.includes(d.date) || datas.includes(d.date.slice(5))).map((d) => d.week));
  if (!semanas.size) return store;
  const alvo = new Set(days.filter((d) => semanas.has(d.week)).map((d) => d.date));
  return {
    ...store,
    sectors: store.sectors.map((s) => ({
      ...s,
      schedule: Object.fromEntries(Object.entries(s.schedule).map(([emp, row]) => [emp, Object.fromEntries(Object.entries(row).filter(([d, c]) => !alvo.has(d) || c.lock || c.c === "A" || c.c === "M" || c.c === "V"))])),
    })),
  };
}

/** "24/12 (todo ano)" ou "24/12/2026". */
export function nomeDiaSemFolga(v: string): string {
  return v.length === 5 ? `${v.slice(3, 5)}/${v.slice(0, 2)} (todo ano)` : `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
}

// ---------------------------------------------------------------- limpar escala
/**
 * Limpa a escala do período nos setores escolhidos: o sistema monta tudo de novo do zero.
 * Férias, faltas e atestados nunca são apagados. `fixos`: apaga também os dias fixados à mão.
 * `almocos`: volta os almoços (do dia e o de sempre de cada pessoa) para o horário do turno.
 */
export function limparEscala(store: Store, sectorIds: string[], opts: { fixos: boolean; almocos: boolean; meses?: string[] }): Store {
  const alvo = new Set(sectorIds);
  const periodo = buildDays(store.config).map((d) => d.date);
  const meses = new Set(opts.meses?.length ? opts.meses : periodo.map((d) => d.slice(0, 7)));
  const noAlvo = (d: string) => meses.has(d.slice(0, 7));
  return {
    ...store,
    sectors: store.sectors.map((s) => {
      if (!alvo.has(s.id)) return s;
      const schedule = Object.fromEntries(
        Object.entries(s.schedule).map(([emp, row]) => [
          emp,
          Object.fromEntries(
            Object.entries(row)
              .filter(([d, c]) => !noAlvo(d) || c.c === "A" || c.c === "M" || c.c === "V" || (!opts.fixos && c.lock))
              .map(([d, c]) => {
                if (!noAlvo(d) || !opts.almocos || !c.brk) return [d, c];
                const { brk: _b, brkFix: _f, ...resto } = c;
                return [d, resto];
              }),
          ),
        ]),
      );
      // os dias limpos ficam em branco até "Gerar escala"
      return { ...s, schedule, lastRun: null, limpo: Array.from(new Set([...(s.limpo ?? []), ...meses])).sort() };
    }),
    employees: opts.almocos ? store.employees.map((e) => (alvo.has(e.sectorId) && e.breakStart ? { ...e, breakStart: null } : e)) : store.employees,
  };
}
