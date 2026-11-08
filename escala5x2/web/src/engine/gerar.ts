// Geração da escala de um setor: folgas → turnos do dia (regras avançadas) → almoços, e uma segunda passada das folgas
// já com os almoços no lugar (a cobertura de cada pessoa depende do horário de almoço dela).
import type { CalDay, Code, Store } from "./types";
import { applyResult, buildProblem, evaluate, solveBest, type SolveProblem } from "./solver";
import { ajustarTurnos, type AjusteTurnos } from "./turnos";
import { almocosEmDia } from "./almoco";
import { analyzeSector } from "./analysis";
import { buildDays, cellCode } from "./model";

export interface Geracao {
  store: Store;
  /** problema e folgas que ficaram (para o relatório) */
  p: SolveProblem;
  rows: Code[][];
  tur: AjusteTurnos;
  almoco: { mudancas: number; novos: number };
  /** a segunda passada (com os almoços) trocou as folgas */
  refinou: boolean;
}

/** Aplica as folgas, ajusta os turnos do dia e refaz os almoços sugeridos pelo sistema. */
function montar(store: Store, sid: string, p: SolveProblem, rows: Code[][]) {
  const gerado: Store = { ...store, sectors: store.sectors.map((s) => (s.id === sid ? applyResult(s, p, rows) : s)) };
  const tur = ajustarTurnos(gerado, sid);
  const alm = almocosEmDia(tur.store, sid, { refazer: true });
  return { store: alm.store, tur, almoco: { mudancas: alm.mudancas, novos: alm.novos } };
}

const faltaPorSemana = (st: Store, sid: string) => analyzeSector(st, sid).totals.deficitHoursPerWeek;

/**
 * Aplica um resultado já calculado (`rows` de `p`) e, com `refinar` (padrão), calcula as folgas de novo com os almoços
 * distribuídos: fica a segunda versão só se ela deixar menos falta de gente no posto.
 */
export function aplicarGeracao(store: Store, sid: string, p: SolveProblem, rows: Code[][], opts: { refinar?: boolean; days?: CalDay[] } = {}): Geracao {
  const um = montar(store, sid, p, rows);
  const primeira: Geracao = { ...um, p, rows, refinou: false };
  if (opts.refinar === false) return primeira;
  const days = opts.days ?? buildDays(store.config);
  const p2 = buildProblem(um.store, sid, { keepLocks: true, days });
  const r2 = solveBest(p2, 4);
  if (!r2.ok) return primeira;
  const sec = um.store.sectors.find((s) => s.id === sid)!;
  const atuais = p2.employees.map((pe) => days.map((d) => cellCode(sec, pe.id, d)));
  if (evaluate(p2, r2.rows).obj >= evaluate(p2, atuais).obj - 1e-6) return primeira;
  const dois = montar(store, sid, p2, r2.rows);
  if (faltaPorSemana(dois.store, sid) > faltaPorSemana(um.store, sid) + 1e-9) return primeira;
  return { ...dois, p: p2, rows: r2.rows, refinou: true };
}

/** Gera o setor do zero com o motor local (usado nos testes e onde não há servidor). */
export function gerarSetor(store: Store, sid: string, opts: { refinar?: boolean } = {}): Geracao {
  const days = buildDays(store.config);
  const p = buildProblem(store, sid, { keepLocks: true, days });
  const r = solveBest(p, 4);
  return aplicarGeracao(store, sid, p, r.rows, { ...opts, days });
}
