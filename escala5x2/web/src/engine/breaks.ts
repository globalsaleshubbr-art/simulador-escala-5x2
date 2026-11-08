// Escalonamento de intervalos: distribui o início do intervalo de cada pessoa (dentro de uma janela
// em torno do horário do turno) para que o posto não esvazie quando todos saem juntos.
// Não mexe em folgas nem na jornada: entrada, saída e duração do intervalo continuam iguais.
import type { CalDay, Employee, Store } from "./types";
import { configDoSetor } from "./regrasSetor";
import { buildDays, cellCode, dayShift, employeeShift, isWorking, jornadaPessoal, presenceAt, requirementAt, slotAxis } from "./model";
import { fmtDur, fmtTime, toMin } from "./time";

export interface BreakChange {
  empId: string;
  name: string;
  from: string; // início anterior
  to: string; // novo início
  min: number; // duração do intervalo (a do turno, nunca muda)
}

export const DEFAULT_BREAK_FLEX = 60;

export interface StaggerResult {
  store: Store;
  changes: BreakChange[];
  /** horas-pessoa abaixo do mínimo no período, antes e depois */
  missBefore: number;
  missAfter: number;
  /** horas-pessoa abaixo do ideal, antes e depois */
  idealBefore: number;
  idealAfter: number;
  /** turnos que não puderam ser escalonados e por quê */
  skipped: string[];
  /** horários (faixas abertas) com poucas pessoas no posto — abaixo de lowPct% do quadro */
  lowBefore: number;
  lowAfter: number;
  /** menor número de pessoas no posto (média dos dias abertos) */
  valleyBefore: number;
  valleyAfter: number;
}

export interface StaggerOptions {
  /** limite extra (min) para o quanto o intervalo pode andar; o limite de cada turno sempre vale */
  window?: number;
  /** trabalho mínimo antes do intervalo e depois dele (min) */
  minBefore?: number;
  minAfter?: number;
  /** trabalho contínuo máximo antes ou depois do intervalo (min) */
  maxContinuous?: number;
  /** % do quadro abaixo do qual o horário conta como "poucas pessoas" (padrão 50) */
  lowPct?: number;
  /** horário do almoço: "rodizio" (varia a cada dia) ou "fixo" (sempre o mesmo); ausente = o do setor */
  modo?: "rodizio" | "fixo";
}

const INT_W = [0, 1, 2, 3.2];

/** Mede o quanto falta (em horas-pessoa) no setor ao longo do período. */
export function coverageGap(store: Store, sectorId: string): { miss: number; ideal: number } {
  const ctx = buildCtx(store, sectorId);
  let miss = 0;
  let ideal = 0;
  ctx.days.forEach((_, d) =>
    ctx.axis.forEach((_, s) => {
      miss += Math.max(0, ctx.req[d][s] - ctx.cnt[d][s]);
      ideal += Math.max(0, ctx.ideal[d][s] - ctx.cnt[d][s]);
    }),
  );
  return { miss: (miss * ctx.slot) / 60, ideal: (ideal * ctx.slot) / 60 };
}

function buildCtx(store: Store, sectorId: string) {
  const cfg = store.config;
  const sector = store.sectors.find((s) => s.id === sectorId)!;
  const days = buildDays(cfg);
  const slot = cfg.slot;
  const axis = slotAxis(cfg, days, slot);
  const req: number[][] = [];
  const ideal: number[][] = [];
  const open: boolean[][] = [];
  const cnt: number[][] = [];
  for (const day of days) {
    const r: number[] = [];
    const id: number[] = [];
    const op: boolean[] = [];
    for (const t of axis) {
      const q = day.closed ? { min: 0, ideal: 0 } : requirementAt(sector, day, t);
      r.push(q.min);
      id.push(Math.max(q.min, q.ideal));
      op.push(!day.closed && t >= day.openMin && t < day.closeMin);
    }
    req.push(r);
    ideal.push(id);
    open.push(op);
    cnt.push(
      axis.map((t) => {
        let n = 0;
        for (const e of store.employees) {
          const p = presenceAt(store, e, day, t, undefined, slot);
          if ((p.state === "working" || p.state === "out") && p.sectorId === sectorId) n++;
        }
        return n;
      }),
    );
  }
  return { cfg, sector, days, slot, axis, req, ideal, open, cnt };
}

export function staggerBreaks(store: Store, sectorId: string, opts: StaggerOptions = {}): StaggerResult {
  const cfg = configDoSetor(store.config, store.sectors.find((s) => s.id === sectorId));
  const minBefore = opts.minBefore ?? 120;
  const minAfter = opts.minAfter ?? 60;
  const maxCont = opts.maxContinuous ?? 360;
  const ctx = buildCtx(store, sectorId);
  const { days, axis, slot, sector } = ctx;
  const quadro = store.employees.filter((e) => e.sectorId === sectorId).length;
  const lowN = Math.ceil((quadro * (opts.lowPct ?? 50)) / 100);
  const before = { ...coverageGapFrom(ctx), ...valleys(ctx, lowN) };

  // quem pode ter o intervalo movido: pessoas do setor com turno normal que tem intervalo
  type Cand = { emp: Employee; base: number; cur: number; options: number[]; workDays: number[]; lin?: { win: ReturnType<typeof validWindow>; linear: boolean; entry: number; dur: number; opts: number[] } };
  const cands: Cand[] = [];
  const skipped = new Set<string>();
  for (const emp of store.employees) {
    if (emp.sectorId !== sectorId) continue;
    const sh = sector.shifts.find((s) => s.id === emp.shiftId) ?? sector.shifts.find((s) => !s.special);
    if (!sh || !sh.breakStart || sh.breakMin <= 0) continue;
    // jornada própria (estagiário, aprendiz, jornada cadastrada) com intervalo de outra duração: fica fora do escalonamento da semana
    if (jornadaPessoal(emp, store.config) != null && ((r0) => r0.breakEnd - r0.breakStart !== sh.breakMin)(employeeShift(store, sector, emp, false))) continue;
    // o cadastro do turno manda: duração sempre a cadastrada; horário dentro da janela do turno ou até o limite do turno
    const flex = Math.min(sh.breakFlex ?? DEFAULT_BREAK_FLEX, opts.window ?? Infinity);
    if (flex <= 0 && !validWindow(sh)) {
      skipped.add(`${sh.name}: intervalo fixo no cadastro do turno.`);
      continue;
    }
    const work = sh.workMin ?? cfg.dailyMin;
    if ((work > 360 && sh.breakMin < cfg.breakMinOver6h) || sh.breakMin > cfg.breakMax) {
      skipped.add(`${sh.name}: intervalo de ${sh.breakMin} min fora da regra da loja (mínimo ${cfg.breakMinOver6h}, máximo ${cfg.breakMax} min) — corrija o turno em Horários.`);
      continue;
    }
    const r = employeeShift(store, sector, emp, false);
    const bm = r.breakEnd - r.breakStart; // duração do intervalo da pessoa (a do turno ou a própria)
    const base = toMin(sh.breakStart);
    const ok = (b: number) => b - r.start >= minBefore && r.end - (b + bm) >= minAfter && b - r.start <= maxCont && r.end - (b + bm) <= maxCont;
    const options: number[] = [];
    const win = validWindow(sh);
    if (win) {
      // janela do turno: o início (ou o intervalo inteiro) precisa ficar dentro dela
      options.push(...opcoesNaJanela(win, bm, r.start, r.end, ok, slot));
      if (!options.length) {
        skipped.add(`${sh.name}: o intervalo não cabe na janela ${fmtTime(win.start)}–${fmtTime(win.end)} dentro do horário do turno.`);
        continue;
      }
    } else {
      for (let b = base - flex; b <= base + flex; b += slot) if (ok(b)) options.push(b);
      if (!options.includes(base)) options.push(base);
    }
    // só dias normais em que a pessoa usa o turno habitual (um turno escolhido para o dia ignora o intervalo próprio)
    const workDays = days
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => !d.closed && !d.special && cellCode(sector, emp.id, d) === "T" && !sector.schedule[emp.id]?.[d.date]?.shiftId && !sector.schedule[emp.id]?.[d.date]?.brk)
      .map((x) => x.i);
    if (workDays.length && (options.length > 1 || options[0] !== r.breakStart)) cands.push({ emp, base, cur: r.breakStart, options: options.sort((a, b) => a - b), workDays, lin: { win, linear: janelaLinear(sh), entry: r.start, dur: bm, opts: win ? options.slice() : [] } });
  }
  // contribuição da pessoa em cada slot, dado o início do intervalo
  const contrib = (c: Cand, b: number) => {
    const e = { ...c.emp, breakStart: fmtTime(b) };
    return c.workDays.map((d) => axis.map((t) => {
      const p = presenceAt(store, e, days[d], t, "T", slot);
      return (p.state === "working" || p.state === "out") && p.sectorId === sectorId ? 1 : 0;
    }));
  };
  const W = days.map((d) => INT_W[sector.movement[d.weekday]?.intensity ?? 2] ?? 2);
  const slotCost = (d: number, s: number, n: number) => {
    if (!ctx.open[d][s] && ctx.req[d][s] === 0) return 0;
    const m = Math.max(0, ctx.req[d][s] - n);
    const i = Math.max(0, ctx.ideal[d][s] - n);
    // quadrado pequeno da folga sobre a necessidade: espalha as saídas e as leva para as horas de menor movimento
    const slack = n - ctx.req[d][s];
    return W[d] * (10 * m + i) + 0.05 * slack * slack;
  };

  const cache = new Map<string, number[][]>();
  const get = (c: Cand, b: number) => {
    const k = `${c.emp.id}|${b}`;
    let v = cache.get(k);
    if (!v) cache.set(k, (v = contrib(c, b)));
    return v;
  };

  // janela linear: os intervalos ficam espaçados por igual (não seguem o movimento)
  const linFixos = new Set<string>();
  {
    const antes = new Map(cands.map((c) => [c.emp.id, c.cur]));
    const fixos = linearPorJanela(cands, (c) => c.lin!, 0);
    for (const c of cands)
      if (fixos.has(c.emp.id) && c.cur !== antes.get(c.emp.id)) {
        const de = get(c, antes.get(c.emp.id)!);
        const para = get(c, c.cur);
        c.workDays.forEach((d, k) => axis.forEach((_, s) => (ctx.cnt[d][s] += para[k][s] - de[k][s])));
      }
    fixos.forEach((id) => linFixos.add(id));
  }

  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    for (const c of cands) {
      if (linFixos.has(c.emp.id)) continue;
      const curC = get(c, c.cur);
      // tira a pessoa da contagem
      c.workDays.forEach((d, k) => axis.forEach((_, s) => (ctx.cnt[d][s] -= curC[k][s])));
      let best = c.cur;
      let bestCost = Infinity;
      for (const b of c.options) {
        const bc = get(c, b);
        let cost = 0;
        c.workDays.forEach((d, k) => axis.forEach((_, s) => (cost += slotCost(d, s, ctx.cnt[d][s] + bc[k][s]) - slotCost(d, s, ctx.cnt[d][s]))));
        cost += Math.abs(b - c.base) * 0.0005; // empate: fica perto do horário do turno
        if (cost < bestCost - 1e-9) {
          bestCost = cost;
          best = b;
        }
      }
      if (best !== c.cur) improved = true;
      c.cur = best;
      const nb = get(c, best);
      c.workDays.forEach((d, k) => axis.forEach((_, s) => (ctx.cnt[d][s] += nb[k][s])));
    }
    if (!improved) break;
  }

  const changes: BreakChange[] = [];
  const newBreak = new Map<string, string | null>();
  for (const c of cands) {
    const prev = employeeShift(store, sector, c.emp, false).breakStart;
    newBreak.set(c.emp.id, c.cur === c.base ? null : fmtTime(c.cur));
    const min = employeeShift(store, sector, c.emp, false).breakEnd - prev;
    if (prev !== c.cur) changes.push({ empId: c.emp.id, name: c.emp.name || c.emp.func, from: fmtTime(prev), to: fmtTime(c.cur), min });
  }
  const next: Store = {
    ...store,
    employees: store.employees.map((e) => (newBreak.has(e.id) ? { ...e, breakStart: newBreak.get(e.id) } : e)),
  };
  const after = { ...coverageGapFrom(ctx), ...valleys(ctx, lowN) };
  return {
    store: next,
    changes,
    skipped: [...skipped],
    missBefore: before.miss,
    missAfter: after.miss,
    idealBefore: before.ideal,
    idealAfter: after.ideal,
    lowBefore: before.low,
    lowAfter: after.low,
    valleyBefore: before.valley,
    valleyAfter: after.valley,
  };
}

function coverageGapFrom(ctx: ReturnType<typeof buildCtx>) {
  let miss = 0;
  let ideal = 0;
  ctx.days.forEach((_, d) =>
    ctx.axis.forEach((_, s) => {
      miss += Math.max(0, ctx.req[d][s] - ctx.cnt[d][s]);
      ideal += Math.max(0, ctx.ideal[d][s] - ctx.cnt[d][s]);
    }),
  );
  return { miss: (miss * ctx.slot) / 60, ideal: (ideal * ctx.slot) / 60 };
}

type TurnoJanela = { start?: string; breakWindow?: { start: string; end: string; mode: "inicio" | "inteiro"; dist?: "linear" | "movimento" } | null; breakStart?: string | null; breakMin?: number; breakFlex?: number };

/**
 * Horário do intervalo do turno ("entre A e B", em minutos), ou null.
 * É a janela cadastrada; sem ela, o horário do intervalo do turno ± o limite de mudança (o intervalo inteiro dentro),
 * que é o que a tela Horários mostra. Turno cujo intervalo passa da meia-noite só usa a janela cadastrada.
 */
export function validWindow(sh: TurnoJanela) {
  const w = sh.breakWindow;
  if (w) {
    const start = toMin(w.start);
    const end = toMin(w.end);
    return end > start ? { start, end, mode: w.mode } : null;
  }
  if (!sh.breakStart || !sh.breakMin || sh.breakMin <= 0) return null;
  const b = toMin(sh.breakStart);
  if (sh.start != null && b <= toMin(sh.start)) return null;
  const flex = sh.breakFlex ?? DEFAULT_BREAK_FLEX;
  return { start: b - flex, end: b + sh.breakMin + flex, mode: "inteiro" as const };
}

/**
 * Inícios de intervalo dentro da janela do turno. Primeiro os que também cumprem as regras de posição
 * (trabalho antes e depois, horas seguidas); se nenhum cumpre, a janela manda: valem os horários da janela
 * em que o intervalo cabe dentro do expediente da pessoa (a observação da regra aparece na Escala de Almoço).
 */
export function opcoesNaJanela(win: NonNullable<ReturnType<typeof validWindow>>, dur: number, ini: number, fim: number, ok: (b: number) => boolean, slot: number): number[] {
  const hi = win.mode === "inteiro" ? win.end - dur : win.end;
  const todas: number[] = [];
  for (let b = win.start; b <= hi; b += slot) if (b > ini && b + dur < fim) todas.push(b);
  const boas = todas.filter(ok);
  return boas.length ? boas : todas;
}

/** A janela do turno espalha os intervalos por igual (linear)? É o padrão quando há janela. */
/** O horário do intervalo espalha os almoços por igual (linear)? É o padrão; só "conforme o movimento" (janela antiga) não. */
export const janelaLinear = (sh: TurnoJanela) => (sh.breakWindow ? (sh.breakWindow.dist ?? "linear") === "linear" : !!validWindow(sh));

/**
 * Distribuição linear dentro da janela: o primeiro sai no começo da janela, o último volta no fim
 * (ou começa no fim, se a janela vale só para o início) e os outros ficam espaçados por igual.
 * Quem entra mais cedo almoça mais cedo; entre quem entra no mesmo horário, a ordem roda a cada dia.
 */
export function distribuirLinear(cs: { id: string; entry: number; dur: number; opts: number[] }[], win: { start: number; end: number; mode: "inicio" | "inteiro" }, rot = 0, usados = new Map<number, number>()): Map<string, number> {
  const out = new Map<string, number>();
  const n = cs.length;
  if (!n) return out;
  // último início possível de cada um (intervalos mais longos precisam começar antes para caber na janela)
  const hiDe = (c: (typeof cs)[number]) => Math.min(c.opts[c.opts.length - 1], win.mode === "inteiro" ? win.end - c.dur : win.end);
  const ord = cs
    .map((c, i) => ({ c, i }))
    .sort((a, b) => hiDe(a.c) - hiDe(b.c) || a.c.entry - b.c.entry || a.c.opts[0] - b.c.opts[0] || ((((a.i + rot) % n) + n) % n) - ((((b.i + rot) % n) + n) % n))
    .map((x) => x.c);
  const lo = Math.max(win.start, Math.min(...cs.map((c) => c.opts[0])));
  const hi = Math.max(lo, Math.max(...cs.map(hiDe)));
  ord.forEach((c, k) => {
    const alvo = n === 1 ? (lo + hi) / 2 : lo + (k * (hi - lo)) / (n - 1);
    // o horário mais perto do alvo, evitando repetir um horário já usado
    let best = c.opts[0];
    let bc = Infinity;
    for (const o of c.opts) {
      const custo = Math.abs(o - alvo) + 12 * (usados.get(o) ?? 0);
      if (custo < bc - 1e-9) {
        bc = custo;
        best = o;
      }
    }
    usados.set(best, (usados.get(best) ?? 0) + 1);
    out.set(c.id, best);
  });
  return out;
}

/** Aplica a distribuição linear aos candidatos cujo turno tem janela linear; devolve os ids resolvidos. */
function linearPorJanela<C extends { emp: Employee; cur: number; options: number[] }>(cands: C[], info: (c: C) => { win: ReturnType<typeof validWindow>; linear: boolean; entry: number; dur: number; opts: number[] }, rot: number, ocupados?: Map<number, number>): Set<string> {
  const grupos = new Map<string, { win: NonNullable<ReturnType<typeof validWindow>>; cs: { c: C; entry: number; dur: number; opts: number[] }[] }>();
  for (const c of cands) {
    const x = info(c);
    if (!x.linear || !x.win || !x.opts.length) continue;
    const k = `${x.win.start}|${x.win.end}|${x.win.mode}`;
    if (!grupos.has(k)) grupos.set(k, { win: x.win, cs: [] });
    grupos.get(k)!.cs.push({ c, entry: x.entry, dur: x.dur, opts: x.opts });
  }
  const feitos = new Set<string>();
  // horários já usados valem para todas as janelas: turnos com janelas diferentes não saem todos juntos
  // e os horários de quem tem almoço fixo já contam como ocupados
  const usados = new Map<number, number>(ocupados ?? []);
  for (const g of [...grupos.values()].sort((a, b) => a.win.start - b.win.start || a.win.end - b.win.end)) {
    const m = distribuirLinear(g.cs.map((x) => ({ id: x.c.emp.id, entry: x.entry, dur: x.dur, opts: x.opts })), g.win, rot, usados);
    for (const x of g.cs) {
      x.c.cur = m.get(x.c.emp.id)!;
      feitos.add(x.c.emp.id);
    }
  }
  return feitos;
}

export interface BreakIssue {
  empId: string;
  name: string;
  text: string;
}
/** Intervalos (do turno ou próprios) que não cumprem a janela ou as regras de posição. */
export function breakIssues(store: Store, sectorId: string, opts: StaggerOptions = {}, day?: CalDay): BreakIssue[] {
  const minBefore = opts.minBefore ?? 120;
  const minAfter = opts.minAfter ?? 60;
  const maxCont = opts.maxContinuous ?? 360;
  const sector = store.sectors.find((s) => s.id === sectorId)!;
  const out: BreakIssue[] = [];
  for (const e of store.employees) {
    if (e.sectorId !== sectorId) continue;
    // com um dia: confere o intervalo daquele dia (o que a pessoa faz de fato), não o de sempre
    if (day && !(cellCode(sector, e.id, day) === "T" || cellCode(sector, e.id, day) === "D")) continue;
    const r = day ? dayShift(store, sector, e, day) : employeeShift(store, sector, e, false);
    const sh = day ? r.shift : sector.shifts.find((s) => s.id === e.shiftId);
    if (!sh || !sh.breakStart || sh.breakMin <= 0 || r.breakEnd <= r.breakStart) continue;
    if (jornadaPessoal(e, store.config) != null && r.breakEnd - r.breakStart !== sh.breakMin) continue;
    const name = e.name || e.func;
    const b = r.breakStart;
    const win = validWindow(sh);
    if (win) {
      const inside = win.mode === "inteiro" ? b >= win.start && b + (r.breakEnd - r.breakStart) <= win.end : b >= win.start && b <= win.end;
      if (!inside)
        out.push({ empId: e.id, name, text: `${name}: intervalo ${fmtTime(b)}–${fmtTime(b + (r.breakEnd - r.breakStart))} fora da janela do turno ${sh.name} (${fmtTime(win.start)}–${fmtTime(win.end)}${win.mode === "inteiro" ? ", intervalo inteiro" : ", início"}).` });
    }
    // duração escolhida à mão (só neste dia ou a de sempre da pessoa): confere a regra da loja
    const durPropria = day ? sector.schedule[e.id]?.[day.date]?.brkMin ?? (sector.schedule[e.id]?.[day.date]?.shiftId ? null : e.almocoMin) : e.almocoMin;
    if (durPropria) {
      const dur = r.breakEnd - r.breakStart;
      const cfg = configDoSetor(store.config, sector);
      if (r.workMin > 360 && dur < cfg.breakMinOver6h) out.push({ empId: e.id, name, text: `${name}: intervalo de ${fmtDur(dur)}, abaixo do mínimo de ${fmtDur(cfg.breakMinOver6h)} para quem trabalha mais de 6h.` });
      else if (dur > cfg.breakMax) out.push({ empId: e.id, name, text: `${name}: intervalo de ${fmtDur(dur)}, acima do máximo de ${fmtDur(cfg.breakMax)}.` });
    }
    // regras de posição: só para intervalos escolhidos por pessoa (o horário do próprio turno é cadastro do usuário)
    if (!(day ? e.breakStart || sector.schedule[e.id]?.[day.date]?.brk : e.breakStart)) continue;
    if (b - r.start < minBefore) out.push({ empId: e.id, name, text: `${name}: intervalo às ${fmtTime(b)} com menos de ${fmtDur(minBefore)} de trabalho antes.` });
    else if (r.end - (b + (r.breakEnd - r.breakStart)) < minAfter) out.push({ empId: e.id, name, text: `${name}: intervalo termina com menos de ${fmtDur(minAfter)} de trabalho até a saída (${fmtTime(r.end)}).` });
    else if (b - r.start > maxCont || r.end - (b + (r.breakEnd - r.breakStart)) > maxCont) out.push({ empId: e.id, name, text: `${name}: com o intervalo às ${fmtTime(b)}, fica mais de ${fmtDur(maxCont)} seguidas trabalhando.` });
  }
  return out;
}

function valleys(ctx: ReturnType<typeof buildCtx>, lowN: number) {
  let low = 0;
  let sum = 0;
  let n = 0;
  ctx.days.forEach((day, d) => {
    if (day.closed) return;
    let m = Infinity;
    ctx.axis.forEach((_, s) => {
      if (!ctx.open[d][s]) return;
      if (ctx.cnt[d][s] < lowN) low++;
      m = Math.min(m, ctx.cnt[d][s]);
    });
    if (m < Infinity) {
      sum += m;
      n++;
    }
  });
  return { low, valley: n ? sum / n : 0 };
}

/** Volta todos do setor para o intervalo padrão do turno. */
export function resetBreaks(store: Store, sectorId: string): Store {
  return { ...store, employees: store.employees.map((e) => (e.sectorId === sectorId && e.breakStart && !e.almocoFixo ? { ...e, breakStart: null } : e)) };
}

// ---------------------------------------------------------------- redistribuição de um dia só
export interface DayStaggerResult {
  date: string;
  /** setor com os intervalos do dia já aplicados (intervalo próprio do dia em cada célula) */
  store: Store;
  changes: BreakChange[];
  /** valor gravado no dia para cada pessoa que mudou (null = volta ao intervalo de sempre) */
  sets: { empId: string; brk: string | null }[];
  skipped: string[];
  /** horas-pessoa abaixo do mínimo no dia, antes e depois */
  missBefore: number;
  missAfter: number;
  lowBefore: number;
  lowAfter: number;
}

/** Copia a loja com o intervalo do dia de uma pessoa trocado (null = volta ao de sempre naquele dia). */
export function withDayBreak(store: Store, sectorId: string, empId: string, date: string, brk: string | null): Store {
  return {
    ...store,
    sectors: store.sectors.map((s) => {
      if (s.id !== sectorId) return s;
      const row = { ...(s.schedule[empId] ?? {}) };
      const day = buildDays(store.config).find((d) => d.date === date) ?? buildDays(store.config, date, 1)[0];
      const cur = row[date] ?? { c: cellCode(s, empId, day) };
      const { brk: _old, ...rest } = cur;
      void _old;
      row[date] = brk ? { ...rest, brk } : rest;
      return { ...s, schedule: { ...s.schedule, [empId]: row } };
    }),
  };
}

/**
 * Redistribui os intervalos de um dia (vale também para domingos e feriados, que usam turno próprio).
 * A mudança fica só naquele dia: o intervalo de sempre das pessoas não muda.
 */
export function staggerBreaksDay(store0: Store, sectorId: string, date: string, opts: StaggerOptions = {}): DayStaggerResult {
  let store = store0;
  const cfg = store.config;
  const minBefore = opts.minBefore ?? 120;
  const minAfter = opts.minAfter ?? 60;
  const maxCont = opts.maxContinuous ?? 360;
  let sector = store.sectors.find((s) => s.id === sectorId)!;
  const day = buildDays(cfg).find((d) => d.date === date) ?? buildDays(cfg, date, 1)[0];
  if (day.closed) return { date, store, changes: [], sets: [], skipped: ["A loja está fechada neste dia."], missBefore: 0, missAfter: 0, lowBefore: 0, lowAfter: 0 };
  // horário fixo: a pessoa almoça sempre no horário dela; um almoço mudado só neste dia (rodízio de antes) sai
  const fixosLimpos: { empId: string; brk: string | null }[] = [];
  for (const e of store.employees)
    if (e.sectorId === sectorId && e.almocoFixo && e.breakStart && sector.schedule[e.id]?.[date]?.brk && !day.special) {
      store = withDayBreak(store, sectorId, e.id, date, null);
      fixosLimpos.push({ empId: e.id, brk: null });
    }
  sector = store.sectors.find((s) => s.id === sectorId)!;
  const slot = cfg.slot;
  const axis = slotAxis(cfg, [day], slot);
  const req = axis.map((t) => requirementAt(sector, day, t).min);
  const ideal = axis.map((t, i) => Math.max(req[i], requirementAt(sector, day, t).ideal ?? 0));
  const open = axis.map((t) => t >= day.openMin && t < day.closeMin);
  const quadro = store.employees.filter((e) => e.sectorId === sectorId).length;
  const lowN = Math.ceil((quadro * (opts.lowPct ?? 50)) / 100);
  const conta = (st: Store, e: Employee, t: number) => {
    const p = presenceAt(st, e, day, t, undefined, slot);
    return (p.state === "working" || p.state === "out") && p.sectorId === sectorId ? 1 : 0;
  };
  const cnt = axis.map((t) => store.employees.reduce((n, e) => n + conta(store, e, t), 0));
  const medir = () => {
    let miss = 0;
    let low = 0;
    axis.forEach((_, s) => {
      miss += Math.max(0, req[s] - cnt[s]);
      if (open[s] && cnt[s] < lowN) low++;
    });
    return { miss: (miss * slot) / 60, low };
  };
  const before = medir();

  type Cand = { emp: Employee; base: number; cur: number; now: number; options: number[]; lin: { win: ReturnType<typeof validWindow>; linear: boolean; entry: number; dur: number; opts: number[] } };
  const cands: Cand[] = [];
  const skipped = new Set<string>();
  /** candidato a mover o intervalo no dia (ignora se a pessoa trabalha: serve também para a equipe inteira no horário fixo) */
  const ehFixo = (emp: Employee, r: ReturnType<typeof dayShift>) => !!emp.almocoFixo && !!emp.breakStart && !day.special && r.shift?.id === emp.shiftId;
  const candDe = (emp: Employee, avisar: boolean): Cand | null => {
    const r = dayShift(store, sector, emp, day);
    const sh = r.shift;
    if (!sh || r.breakEnd <= r.breakStart) return null;
    if (ehFixo(emp, r)) return null;
    const dur = r.breakEnd - r.breakStart;
    const semDia = withDayBreak(store, sectorId, emp.id, date, null);
    const base = dayShift(semDia, semDia.sectors.find((s) => s.id === sectorId)!, emp, day).breakStart;
    const flex = Math.min(sh.breakFlex ?? DEFAULT_BREAK_FLEX, opts.window ?? Infinity);
    const win = validWindow(sh);
    if (flex <= 0 && !win) {
      if (avisar) skipped.add(`${sh.name}: intervalo fixo no cadastro do turno (mude em Horários para permitir mover).`);
      return null;
    }
    const ok = (b: number) => b - r.start >= minBefore && r.end - (b + dur) >= minAfter && b - r.start <= maxCont && r.end - (b + dur) <= maxCont;
    const options: number[] = [];
    if (win) options.push(...opcoesNaJanela(win, dur, r.start, r.end, ok, slot));
    else for (let b = base - flex; b <= base + flex; b += slot) if (ok(b)) options.push(b);
    const winOpts = win ? options.slice() : [];
    if (!options.includes(r.breakStart)) options.push(r.breakStart);
    return { emp, base, cur: r.breakStart, now: r.breakStart, options: options.sort((a, b) => a - b), lin: { win, linear: janelaLinear(sh), entry: r.start, dur, opts: winOpts } };
  };
  for (const emp of store.employees) {
    if (emp.sectorId !== sectorId) continue;
    const code = cellCode(sector, emp.id, day);
    if (code !== "T" && code !== "D") continue;
    const c = candDe(emp, true);
    if (c) cands.push(c);
  }
  const W = INT_W[sector.movement[day.weekday]?.intensity ?? 2] ?? 2;
  const slotCost = (s: number, n: number) => {
    if (!open[s] && req[s] === 0) return 0;
    const slack = n - req[s];
    return W * (10 * Math.max(0, req[s] - n) + Math.max(0, ideal[s] - n)) + 0.05 * slack * slack;
  };
  const cache = new Map<string, number[]>();
  const contrib = (c: Cand, b: number) => {
    const k = `${c.emp.id}|${b}`;
    let v = cache.get(k);
    if (!v) {
      const st2 = withDayBreak(store, sectorId, c.emp.id, date, fmtTime(b));
      v = axis.map((t) => conta(st2, c.emp, t));
      cache.set(k, v);
    }
    return v;
  };
  // janela linear: espaçados por igual; entre quem entra no mesmo horário, a ordem roda a cada dia
  const antesLin = new Map(cands.map((c) => [c.emp.id, c.cur]));
  const ocupados = new Map<number, number>();
  for (const emp of store.employees) {
    if (emp.sectorId !== sectorId || !isWorking(cellCode(sector, emp.id, day))) continue;
    const r = dayShift(store, sector, emp, day);
    if (r.breakEnd > r.breakStart && ehFixo(emp, r)) ocupados.set(r.breakStart, (ocupados.get(r.breakStart) ?? 0) + 1);
  }
  let linFixos: Set<string>;
  if ((opts.modo ?? sector.almocoModo) === "fixo") {
    // horário fixo: os horários saem da equipe inteira do setor (como se todos trabalhassem), sempre na mesma ordem,
    // e cada pessoa fica com o seu em todos os dias — folga de alguém não empurra o almoço dos outros
    const equipe = store.employees.filter((e) => e.sectorId === sectorId).map((e) => cands.find((c) => c.emp.id === e.id) ?? candDe(e, false)).filter((c): c is Cand => !!c);
    const copia = equipe.map((c) => ({ ...c }));
    linearPorJanela(copia, (c) => c.lin, 0, ocupados);
    const fixo = new Map(copia.map((c) => [c.emp.id, c.cur]));
    linFixos = new Set<string>();
    for (const c of cands)
      if (c.lin.linear && c.lin.win && c.lin.opts.length && fixo.has(c.emp.id)) {
        c.cur = fixo.get(c.emp.id)!;
        linFixos.add(c.emp.id);
      }
  } else linFixos = linearPorJanela(cands, (c) => c.lin, Math.round(Date.parse(`${date}T12:00:00Z`) / 864e5), ocupados);
  for (const c of cands)
    if (linFixos.has(c.emp.id) && c.cur !== antesLin.get(c.emp.id)) {
      const de = contrib(c, antesLin.get(c.emp.id)!);
      const para = contrib(c, c.cur);
      axis.forEach((_, s) => (cnt[s] += para[s] - de[s]));
    }
  for (let pass = 0; pass < 5; pass++) {
    let improved = false;
    for (const c of cands) {
      if (linFixos.has(c.emp.id)) continue;
      const curC = contrib(c, c.cur);
      axis.forEach((_, s) => (cnt[s] -= curC[s]));
      let best = c.cur;
      let bestCost = Infinity;
      for (const b of c.options) {
        const bc = contrib(c, b);
        let cost = 0;
        axis.forEach((_, s) => (cost += slotCost(s, cnt[s] + bc[s]) - slotCost(s, cnt[s])));
        cost += Math.abs(b - c.base) * 0.0005;
        if (cost < bestCost - 1e-9) {
          bestCost = cost;
          best = b;
        }
      }
      if (best !== c.cur) improved = true;
      c.cur = best;
      const nb = contrib(c, best);
      axis.forEach((_, s) => (cnt[s] += nb[s]));
    }
    if (!improved) break;
  }
  let next = store;
  const changes: BreakChange[] = [];
  const sets: { empId: string; brk: string | null }[] = [];
  for (const c of cands) {
    if (c.cur === c.now) continue;
    const brk = c.cur === c.base ? null : fmtTime(c.cur);
    sets.push({ empId: c.emp.id, brk });
    next = withDayBreak(next, sectorId, c.emp.id, date, brk);
    const r = dayShift(store, sector, c.emp, day);
    changes.push({ empId: c.emp.id, name: c.emp.name || c.emp.func, from: fmtTime(c.now), to: fmtTime(c.cur), min: r.breakEnd - r.breakStart });
  }
  const after = medir();
  return { date, store: next, changes, sets: [...fixosLimpos, ...sets], skipped: [...skipped], missBefore: before.miss, missAfter: after.miss, lowBefore: before.low, lowAfter: after.low };
}

// ---------------------------------------------------------------- todos os dias do período de uma vez
export interface PeriodStaggerResult {
  store: Store;
  /** dias em que algum intervalo mudou */
  dias: number;
  /** total de intervalos mudados */
  mudancas: number;
  /** horas-pessoa abaixo do mínimo no período, antes e depois */
  missBefore: number;
  missAfter: number;
}

/**
 * Distribui os intervalos de cada dia do período (dias normais, domingos e feriados), um dia de cada vez,
 * para manter o mínimo no posto. A mudança fica gravada em cada dia; o intervalo de sempre não muda.
 */
export function staggerBreaksPeriod(store: Store, sectorId: string, opts: StaggerOptions = {}): PeriodStaggerResult {
  let st = store;
  let dias = 0;
  let mudancas = 0;
  let missBefore = 0;
  let missAfter = 0;
  for (const d of buildDays(store.config)) {
    if (d.closed) continue;
    const r = staggerBreaksDay(st, sectorId, d.date, opts);
    missBefore += r.missBefore;
    missAfter += r.missAfter;
    if (r.store !== st && !r.changes.length) st = r.store; // só limpou o almoço do dia de quem é fixo
    if (r.changes.length) {
      dias++;
      mudancas += r.changes.length;
      st = r.store;
    }
  }
  // guarda o que estava valendo: se turnos, pessoas ou período mudarem, os almoços são distribuídos de novo
  const ass = assinaturaAlmoco(st, sectorId);
  st = { ...st, sectors: st.sectors.map((s) => (s.id === sectorId ? { ...s, almocoAssinatura: ass } : s)) };
  return { store: st, dias, mudancas, missBefore, missAfter };
}

/**
 * Assinatura do que define a distribuição dos almoços de um setor: turnos (entrada, horas, intervalo e horário do intervalo),
 * pessoas (turno, duração própria, jornada) e o período. Quando muda, os almoços precisam ser distribuídos de novo.
 */
export function assinaturaAlmoco(store: Store, sectorId: string): string {
  const sec = store.sectors.find((s) => s.id === sectorId);
  if (!sec) return "";
  const c = store.config;
  const dados = {
    p: [c.startDate, c.weeks, c.weekStart ?? null, c.dailyMin, sec.almocoModo ?? "rodizio"],
    t: sec.shifts.map((x) => [x.id, x.start, x.workMin, x.breakStart, x.breakMin, x.breakFlex ?? null, x.breakWindow ?? null]),
    e: store.employees.filter((e) => e.sectorId === sectorId).map((e) => [e.id, e.shiftId, e.sundayShiftId ?? null, e.almocoMin ?? null, e.horasDia ?? null, e.jornadaId ?? null, e.regime ?? null, e.almocoFixo ? e.breakStart ?? null : null]),
  };
  const txt = JSON.stringify(dados);
  let h = 5381;
  for (let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) | 0;
  return `${txt.length}:${(h >>> 0).toString(36)}`;
}
