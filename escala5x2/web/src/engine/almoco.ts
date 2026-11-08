// Escala de almoço (modelo 2): cada pessoa tem um horário de almoço FIXO (sugerido pelo sistema e ajustável),
// que se repete todo dia; rodízio só para quem for marcado. O sistema nunca passa por cima de um horário escolhido
// à mão (o da pessoa ou o de "só neste dia"). Domingo, feriado e dia com outro turno seguem o turno do dia.
import type { CalDay, Cell, Employee, Sector, Store } from "./types";
import { buildDays, cellCode, comAlmocoDomingo, dayShift, employeeShift, isPlantao, isWorking, noTurnoDeDomingo, requirementAt, type ResolvedShift } from "./model";
import { validWindow } from "./breaks";
import { fmtTime, toMin } from "./time";

export const VERSAO_ALMOCO = 2;
const MIN_ANTES = 120; // trabalho antes do almoço
const MIN_DEPOIS = 60; // trabalho depois do almoço
const MAX_SEGUIDO = 360; // horas seguidas sem intervalo
const PASSO = 15; // granularidade da conta de "quantos almoçam juntos"

/** Inícios de almoço possíveis para um turno do dia: dentro da janela do turno, cabendo no expediente. */
export function opcoesAlmoco(r: ResolvedShift, passo = 30): number[] {
  const dur = r.breakEnd - r.breakStart;
  if (!r.shift || dur <= 0) return [];
  // turno sem intervalo cadastrado (ex.: domingo com almoço próprio da pessoa): o expediente todo, respeitando as regras abaixo
  const semIntervalo = !r.shift.breakStart || !r.shift.breakMin;
  const win = validWindow(r.shift) ?? (semIntervalo && !r.shift.breakWindow ? { start: r.start + MIN_ANTES, end: r.end - MIN_DEPOIS, mode: "inteiro" as const } : { start: r.breakStart, end: r.breakEnd, mode: "inteiro" as const });
  const hi = win.mode === "inteiro" ? win.end - dur : win.end;
  const todas: number[] = [];
  for (let b = win.start; b <= hi; b += passo) if (b > r.start && b + dur < r.end) todas.push(b);
  const boas = todas.filter((b) => b - r.start >= MIN_ANTES && r.end - (b + dur) >= MIN_DEPOIS && b - r.start <= MAX_SEGUIDO && r.end - (b + dur) <= MAX_SEGUIDO);
  const l = boas.length ? boas : todas;
  return l.length ? l : [r.breakStart];
}

/** Carga de almoços por faixa de 15 min (quantos estão almoçando ao mesmo tempo). */
class Carga {
  private m = new Map<number, number>();
  add(ini: number, dur: number, n = 1) {
    for (let t = Math.floor(ini / PASSO) * PASSO; t < ini + dur; t += PASSO) this.m.set(t, (this.m.get(t) ?? 0) + n);
  }
  /** pior faixa e soma no intervalo [ini, ini+dur) */
  medir(ini: number, dur: number) {
    let max = 0;
    let soma = 0;
    for (let t = Math.floor(ini / PASSO) * PASSO; t < ini + dur; t += PASSO) {
      const v = this.m.get(t) ?? 0;
      max = Math.max(max, v);
      soma += v;
    }
    return { max, soma };
  }
}

/** Custo de deixar o posto com uma pessoa a menos na faixa: faltar gente custa muito; com sobra, quanto menor a sobra, mais caro. */
const FALTA = 10000;
const APERTO = 300;

/**
 * Pessoas no posto de um dia, por faixa de 15 min, e quantas a loja precisa (Fluxo alto).
 * Começa com todos os que trabalham no dia presentes no expediente inteiro; os almoços já decididos são tirados com `tirar`.
 */
class Posto {
  private no = new Map<number, number>();
  private req = new Map<number, number>();
  constructor(store: Store, sec: Sector, day: CalDay, emps: Employee[]) {
    for (const e of emps) {
      if (!isWorking(cellCode(sec, e.id, day))) continue;
      const r = dayShift(store, sec, e, day);
      if (!r.shift) continue;
      for (let t = Math.ceil(r.start / PASSO) * PASSO; t + PASSO <= r.end; t += PASSO) this.no.set(t, (this.no.get(t) ?? 0) + 1);
    }
    for (const t of this.no.keys()) this.req.set(t, requirementAt(sec, day, t % 1440).min);
  }
  tirar(ini: number, dur: number) {
    for (let t = Math.floor(ini / PASSO) * PASSO; t < ini + dur; t += PASSO) if (this.no.has(t)) this.no.set(t, this.no.get(t)! - 1);
  }
  /** custo de mais uma pessoa almoçando em [ini, ini+dur) */
  custo(ini: number, dur: number): number {
    let c = 0;
    for (let t = Math.floor(ini / PASSO) * PASSO; t < ini + dur; t += PASSO) {
      if (!this.no.has(t)) continue;
      const sobra = this.no.get(t)! - (this.req.get(t) ?? 0);
      c += sobra <= 0 ? FALTA : APERTO / sobra;
    }
    return c;
  }
}

interface Pessoa {
  id: string;
  ini: number; // entrada (desempate: quem entra antes almoça antes)
  dur: number;
  opts: number[];
}

/**
 * Espalha os almoços: cada pessoa fica com o horário em que a saída dela menos aperta o posto (nunca deixando faltar
 * gente quando há outra opção, conforme o Fluxo alto — `custo`), depois o que deixa menos gente almoçando junto
 * e, empatando, perto da sua posição na fila do grupo, para ficar espaçado por igual. `colocar` avisa cada escolha.
 */
function espalhar(pessoas: Pessoa[], carga: Carga, giro = 0, custo?: (id: string, ini: number, dur: number) => number, colocar?: (id: string, ini: number, dur: number) => void): Map<string, number> {
  const out = new Map<string, number>();
  // grupos com as mesmas opções (mesma janela e duração): alvo espaçado por igual dentro do grupo
  const grupos = new Map<string, Pessoa[]>();
  for (const p of pessoas) {
    const k = `${p.opts[0]}|${p.opts[p.opts.length - 1]}|${p.dur}`;
    grupos.set(k, [...(grupos.get(k) ?? []), p]);
  }
  for (const g of grupos.values()) {
    const base = [...g].sort((a, b) => a.ini - b.ini || a.id.localeCompare(b.id));
    const n = base.length;
    // rodízio: a fila gira a cada dia
    const fila = base.map((_, i) => base[(i + giro) % n]);
    const lo = fila[0].opts[0];
    const hi = fila[0].opts[fila[0].opts.length - 1];
    fila.forEach((p, i) => {
      const alvo = n === 1 ? (lo + hi) / 2 : lo + ((hi - lo) * i) / (n - 1);
      let best = p.opts[0];
      let bestC = Infinity;
      for (const o of p.opts) {
        const m = carga.medir(o, p.dur);
        const c = custo ? custo(p.id, o, p.dur) + m.max * 100 + m.soma * 2 + Math.abs(o - alvo) / 15 : m.max * 1000 + m.soma * 10 + Math.abs(o - alvo) / 15;
        if (c < bestC - 1e-9) {
          bestC = c;
          best = o;
        }
      }
      out.set(p.id, best);
      carga.add(best, p.dur);
      colocar?.(p.id, best, p.dur);
    });
  }
  return out;
}

const pessoasDoSetor = (store: Store, sectorId: string) => store.employees.filter((e) => e.sectorId === sectorId);

/**
 * Sugere o horário fixo de almoço de cada pessoa (no turno de sempre), onde a saída dela menos aperta o posto nos dias
 * em que trabalha (Fluxo alto). Por padrão só para quem ainda não tem; com `refazer`, também para quem tem um horário
 * sugerido pelo sistema (não o escolhido à mão); com `todos`, recalcula todo mundo que não está em rodízio.
 */
export function sugerirHorarios(store: Store, sectorId: string, opts: { todos?: boolean; refazer?: boolean } = {}): { store: Store; mudou: number } {
  const sec = store.sectors.find((s) => s.id === sectorId);
  if (!sec) return { store, mudou: 0 };
  const emps = pessoasDoSetor(store, sectorId);
  const refaz = (e: Employee) => !e.almocoRodizio && (!e.breakStart || !!opts.todos || (!!opts.refazer && !!e.almocoAuto));
  const carga = new Carga();
  const pedir: Pessoa[] = [];
  for (const e of emps) {
    if (e.almocoRodizio) continue;
    const r0 = employeeShift(store, sec, { ...e, breakStart: null }, false);
    if (r0.breakEnd <= r0.breakStart) continue;
    const dur = r0.breakEnd - r0.breakStart;
    if (!refaz(e)) {
      carga.add(toMin(e.breakStart!), dur);
      continue;
    }
    pedir.push({ id: e.id, ini: r0.start, dur, opts: opcoesAlmoco(r0) });
  }
  if (!pedir.length) return { store, mudou: 0 };
  // posto de cada dia normal: todos presentes, menos o almoço de quem não vai ser recalculado
  const novos = new Set(pedir.map((p) => p.id));
  const dias = buildDays(store.config).filter((d) => !d.closed && !d.special);
  const postos = dias.map((d) => new Posto(store, sec, d, emps));
  // dias em que o horário fixo de cada pessoa recalculada vale (trabalha, no turno de sempre, sem almoço escolhido à mão no dia)
  const diasDe = new Map<string, number[]>();
  dias.forEach((d, i) => {
    for (const e of emps) {
      if (!isWorking(cellCode(sec, e.id, d))) continue;
      const cell = sec.schedule[e.id]?.[d.date];
      if (novos.has(e.id) && !cell?.brkFix && (!cell?.shiftId || cell.shiftId === e.shiftId)) {
        diasDe.set(e.id, [...(diasDe.get(e.id) ?? []), i]);
        continue;
      }
      const r = dayShift(store, sec, e, d);
      if (r.breakEnd > r.breakStart) postos[i].tirar(r.breakStart, r.breakEnd - r.breakStart);
    }
  });
  const m = espalhar(
    pedir,
    carga,
    0,
    (id, ini, dur) => (diasDe.get(id) ?? []).reduce((c, i) => c + postos[i].custo(ini, dur), 0),
    (id, ini, dur) => (diasDe.get(id) ?? []).forEach((i) => postos[i].tirar(ini, dur)),
  );
  let mudou = 0;
  const employees = store.employees.map((e) => {
    if (!m.has(e.id)) return e;
    const h = fmtTime(m.get(e.id)!);
    if (h !== e.breakStart) mudou++;
    return { ...e, breakStart: h, almocoFixo: true, almocoAuto: true };
  });
  return { store: { ...store, employees }, mudou };
}

/** A pessoa almoça no horário fixo dela neste dia? (dia normal, no turno de sempre, sem rodízio; ou domingo com horário de domingo) */
export function almocoFixoNoDia(e: Employee, day: CalDay, cell: Cell | undefined, sec?: Sector): boolean {
  if (isPlantao(e)) return false;
  if (day.weekday === 0 && e.almocoDomingo && noTurnoDeDomingo(sec, cell)) return true;
  return !e.almocoRodizio && !!e.breakStart && !day.special && (!cell?.shiftId || cell.shiftId === e.shiftId);
}

/**
 * Aplica os almoços do período: quem é fixo fica no horário dele (sem nada gravado no dia);
 * quem está em rodízio — e todo mundo em domingo, feriado ou dia com outro turno — é distribuído dia a dia
 * em volta dos horários já ocupados. O que foi escolhido à mão em um dia (brkFix) nunca muda.
 */
export function aplicarAlmocos(store: Store, sectorId: string): { store: Store; mudancas: number } {
  const sec0 = store.sectors.find((s) => s.id === sectorId);
  if (!sec0) return { store, mudancas: 0 };
  const emps = pessoasDoSetor(store, sectorId);
  const schedule: Sector["schedule"] = { ...sec0.schedule };
  let mudancas = 0;
  const setBrk = (empId: string, date: string, brk: string | null, c: Cell["c"]) => {
    const row = (schedule[empId] = { ...(schedule[empId] ?? {}) });
    const cur = row[date] ?? { c };
    if ((cur.brk ?? null) === brk) return;
    const { brk: _x, ...rest } = cur;
    void _x;
    row[date] = brk ? { ...rest, brk } : rest;
    mudancas++;
  };
  const days = buildDays(store.config);
  days.forEach((day, di) => {
    if (day.closed) return;
    const sec = { ...sec0, schedule };
    const carga = new Carga();
    const posto = new Posto(store, sec, day, emps);
    const fila: Pessoa[] = [];
    const base = new Map<string, number>();
    for (const e of emps) {
      const cell = schedule[e.id]?.[day.date];
      const c = cellCode(sec, e.id, day);
      if (!isWorking(c)) {
        if (cell?.brk && !cell.brkFix) setBrk(e.id, day.date, null, c); // sobra antiga num dia sem trabalho
        continue;
      }
      if (cell?.brkFix) {
        const r = dayShift(store, sec, e, day);
        if (r.breakEnd > r.breakStart) (carga.add(r.breakStart, r.breakEnd - r.breakStart), posto.tirar(r.breakStart, r.breakEnd - r.breakStart));
        continue;
      }
      if (almocoFixoNoDia(e, day, cell, sec0)) {
        if (cell?.brk) setBrk(e.id, day.date, null, c); // horário fixo: nada gravado no dia
        const r = dayShift(store, { ...sec0, schedule }, e, day);
        if (r.breakEnd > r.breakStart) (carga.add(r.breakStart, r.breakEnd - r.breakStart), posto.tirar(r.breakStart, r.breakEnd - r.breakStart));
        continue;
      }
      // rodízio (ou domingo/feriado/outro turno): horário escolhido no dia
      const semDia = { ...(cell ?? { c }) };
      delete semDia.brk;
      const r = dayShift(store, { ...sec0, schedule: { ...schedule, [e.id]: { ...(schedule[e.id] ?? {}), [day.date]: semDia } } }, e, day);
      if (r.breakEnd <= r.breakStart) {
        if (cell?.brk) setBrk(e.id, day.date, null, c);
        continue;
      }
      base.set(e.id, r.breakStart);
      fila.push({ id: e.id, ini: r.start, dur: r.breakEnd - r.breakStart, opts: opcoesAlmoco(r) });
    }
    if (!fila.length) return;
    const m = espalhar(fila, carga, di, (_, ini, dur) => posto.custo(ini, dur), (_, ini, dur) => posto.tirar(ini, dur));
    for (const p of fila) {
      const b = m.get(p.id)!;
      setBrk(p.id, day.date, b === base.get(p.id) ? null : fmtTime(b), cellCode({ ...sec0, schedule }, p.id, day));
    }
  });
  if (!mudancas) return { store, mudancas: 0 };
  return { store: { ...store, sectors: store.sectors.map((s) => (s.id === sectorId ? { ...s, schedule } : s)) }, mudancas };
}

/**
 * Passa um setor para o modelo 2 (uma vez): horários gravados dia a dia pelo sistema antigo saem
 * (a duração mudada à mão num dia fica, marcada como escolha à mão); quem já tinha horário próprio fica com ele
 * como horário fixo; quem não tinha recebe a sugestão.
 */
export function migrarAlmoco(store: Store, sectorId: string): Store {
  const sec = store.sectors.find((s) => s.id === sectorId);
  if (!sec || (sec.almocoVersao ?? 1) >= VERSAO_ALMOCO) return store;
  const schedule: Sector["schedule"] = {};
  for (const [empId, row] of Object.entries(sec.schedule)) {
    const nova: Record<string, Cell> = {};
    for (const [date, cell] of Object.entries(row)) {
      if (cell.brkMin) nova[date] = { ...cell, brkFix: true };
      else if (cell.brk) {
        const { brk: _x, ...rest } = cell;
        void _x;
        nova[date] = rest;
      } else nova[date] = cell;
    }
    schedule[empId] = nova;
  }
  let st: Store = {
    ...store,
    employees: store.employees.map((e) => (e.sectorId === sectorId && e.breakStart ? { ...e, almocoFixo: true } : e)),
    sectors: store.sectors.map((s) => (s.id === sectorId ? { ...s, schedule, almocoVersao: VERSAO_ALMOCO, almocoModo: undefined } : s)),
  };
  st = sugerirHorarios(st, sectorId).store;
  return aplicarAlmocos(st, sectorId).store;
}

/** Deixa o almoço do setor em dia: migra (uma vez), sugere para quem ainda não tem horário (com `refazer`, também refaz
 *  os horários sugeridos pelo sistema — ao gerar a escala) e aplica no período. */
export function almocosEmDia(store: Store, sectorId: string, opts: { refazer?: boolean } = {}): { store: Store; mudancas: number; novos: number } {
  let st = migrarAlmoco(store, sectorId);
  const s = sugerirHorarios(st, sectorId, { refazer: opts.refazer });
  st = s.store;
  const a = aplicarAlmocos(st, sectorId);
  st = a.store;
  const ass = assinaturaAlmoco2(st, sectorId);
  st = { ...st, sectors: st.sectors.map((x) => (x.id === sectorId ? { ...x, almocoAssinatura: ass } : x)) };
  return { store: st, mudancas: a.mudancas, novos: s.mudou };
}

/**
 * Assinatura do que define os almoços do setor: período, turnos, pessoas (turno, horário fixo, rodízio, duração)
 * e os dias de cada um (trabalho/folga, turno do dia e o que foi escolhido à mão). Muda → almocosEmDia de novo.
 */
export function assinaturaAlmoco2(store: Store, sectorId: string): string {
  const sec = store.sectors.find((s) => s.id === sectorId);
  if (!sec) return "";
  const c = store.config;
  const emps = pessoasDoSetor(store, sectorId);
  const dias: string[] = [];
  for (const e of emps) {
    const row = sec.schedule[e.id] ?? {};
    dias.push(
      e.id +
        Object.keys(row)
          .sort()
          .map((d) => `${d}${row[d].c}${row[d].shiftId ?? ""}${row[d].brkFix ? `!${row[d].brk ?? ""}${row[d].brkMin ?? ""}` : ""}`)
          .join(""),
    );
  }
  const dados = {
    v: [VERSAO_ALMOCO, sec.almocoVersao ?? 1, c.startDate, c.weeks, c.weekStart ?? null, c.dailyMin, c.slot],
    t: sec.shifts.map((x) => [x.id, x.start, x.workMin, x.breakStart, x.breakMin, x.breakFlex ?? null, x.breakWindow ?? null, x.special ?? false]),
    e: emps.map((e) => [e.id, e.shiftId, e.sundayShiftId ?? null, e.almocoMin ?? null, e.horasDia ?? null, e.jornadaId ?? null, e.regime ?? null, e.breakStart ?? null, !!e.almocoRodizio, e.almocoDomingo ?? null, e.almocoDomingoMin ?? null]),
    d: dias,
  };
  const txt = JSON.stringify(dados);
  let h = 5381;
  for (let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) | 0;
  return `v2:${txt.length}:${(h >>> 0).toString(36)}`;
}

/** Quantas pessoas do setor estão almoçando em cada faixa de 15 min de um dia (para "almoçando juntos"). */
export function almocosJuntos(store: Store, sectorId: string, day: CalDay): { pico: number; quando: number | null } {
  const sec = store.sectors.find((s) => s.id === sectorId);
  if (!sec || day.closed) return { pico: 0, quando: null };
  const carga = new Map<number, number>();
  for (const e of pessoasDoSetor(store, sectorId)) {
    if (!isWorking(cellCode(sec, e.id, day))) continue;
    const r = dayShift(store, sec, e, day);
    for (let t = Math.floor(r.breakStart / PASSO) * PASSO; t < r.breakEnd; t += PASSO) carga.set(t, (carga.get(t) ?? 0) + 1);
  }
  let pico = 0;
  let quando: number | null = null;
  for (const [t, n] of [...carga.entries()].sort((a, b) => a[0] - b[0]))
    if (n > pico) {
      pico = n;
      quando = t;
    }
  return { pico, quando };
}

/** Aviso quando o almoço começando em `ini` não cabe no turno ou sai do horário do intervalo (null = ok). */
export function problemaAlmoco(r: ResolvedShift, ini: number): string | null {
  const dur = r.breakEnd - r.breakStart;
  if (dur <= 0) return null;
  if (ini - r.start < 60 || r.end - (ini + dur) < 60) return `Não cabe no turno (${fmtTime(r.start)}–${fmtTime(r.end)}): precisa de pelo menos 1h de trabalho antes e depois.`;
  const w = r.shift ? validWindow(r.shift) : null;
  if (w && (ini < w.start || (w.mode === "inteiro" ? ini + dur > w.end : ini > w.end))) return `Fora do horário do intervalo do turno (${fmtTime(w.start)}–${fmtTime(w.end)}).`;
  return null;
}

/** Tempo de almoço do turno da pessoa (sem o tempo próprio dela), em minutos. */
export function almocoDoTurno(store: Store, e: Employee): number {
  const sec = store.sectors.find((s) => s.id === e.sectorId);
  const r = employeeShift(store, sec, { ...e, almocoMin: null }, false);
  return r.breakEnd - r.breakStart;
}

/**
 * Muda o almoço de sempre de uma pessoa e põe os almoços do setor em dia:
 * `hora` = horário fixo ("HH:MM"; tira do rodízio), `min` = tempo de almoço (null = o do turno; a saída anda junto),
 * `rodizio` = liga/desliga o rodízio.
 */
export function definirAlmoco(store: Store, empId: string, mud: { hora?: string; min?: number | null; rodizio?: boolean }): Store {
  const e = store.employees.find((x) => x.id === empId);
  if (!e) return store;
  const patch: Partial<Employee> = {};
  if (mud.hora !== undefined) Object.assign(patch, { breakStart: mud.hora, almocoFixo: true, almocoAuto: false, almocoRodizio: false });
  if (mud.min !== undefined) patch.almocoMin = mud.min == null || mud.min === almocoDoTurno(store, e) ? null : mud.min;
  if (mud.rodizio !== undefined) Object.assign(patch, { almocoRodizio: mud.rodizio, almocoFixo: !mud.rodizio });
  const y = { ...store, employees: store.employees.map((p) => (p.id === empId ? { ...p, ...patch } : p)) };
  return aplicarAlmocos(mud.rodizio === false ? sugerirHorarios(y, e.sectorId).store : y, e.sectorId).store;
}

/** Turno de domingo da pessoa com o almoço próprio do domingo (null = não trabalha domingo ou turno sem intervalo). */
export function domingoDaPessoa(store: Store, e: Employee): ResolvedShift | null {
  if (isPlantao(e)) return null;
  const sec = store.sectors.find((s) => s.id === e.sectorId);
  const r = comAlmocoDomingo(employeeShift(store, sec, e, true), e);
  return r.shift ? r : null;
}
/** Tempo de almoço do turno de domingo da pessoa (sem o tempo próprio do domingo). */
export function almocoDoDomingo(store: Store, e: Employee): number {
  const sec = store.sectors.find((s) => s.id === e.sectorId);
  const r = employeeShift(store, sec, e, true);
  return r.breakEnd - r.breakStart;
}
/** Muda o almoço próprio do domingo (`hora` null = o sistema distribui; `min` null = o do turno de domingo). */
export function definirAlmocoDomingo(store: Store, empId: string, mud: { hora?: string | null; min?: number | null }): Store {
  const e = store.employees.find((x) => x.id === empId);
  if (!e) return store;
  const patch: Partial<Employee> = {};
  if (mud.hora !== undefined) patch.almocoDomingo = mud.hora;
  if (mud.min !== undefined) patch.almocoDomingoMin = mud.min == null || mud.min === almocoDoDomingo(store, e) ? null : mud.min;
  return aplicarAlmocos({ ...store, employees: store.employees.map((p) => (p.id === empId ? { ...p, ...patch } : p)) }, e.sectorId).store;
}

/**
 * Depois de mudar o turno, a jornada, a contratação ou as folgas de alguém: o horário de almoço escolhido continua
 * se ainda couber no novo expediente (e no horário de intervalo do turno); senão sai e o sistema sugere outro.
 */
export function manterAlmoco(store: Store, empId: string): Store {
  const e = store.employees.find((x) => x.id === empId);
  if (!e?.breakStart) return store;
  const sec = store.sectors.find((s) => s.id === e.sectorId);
  const r = employeeShift(store, sec, { ...e, breakStart: null }, false);
  const dur = r.breakEnd - r.breakStart;
  const ini = toMin(e.breakStart);
  const cabe = dur > 0 && !problemaAlmoco({ ...r, breakStart: ini, breakEnd: ini + dur }, ini);
  return cabe ? store : { ...store, employees: store.employees.map((p) => (p.id === empId ? { ...p, breakStart: null } : p)) };
}
