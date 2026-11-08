// Horário da loja → setores: as faixas de necessidade de cada setor acompanham a abertura e o fechamento da loja.
// Só mexe nas faixas gerais (seg–sex, sábado, domingo); dias específicos e datas especiais (exceções) ficam como estão.
import type { MinRule, Sector, StoreConfig } from "../engine/types";
import { fmtTime, toMin, uid } from "../engine/time";

export const GRUPOS_HORARIO: { key: string; label: string; days: number[]; domingo: boolean }[] = [
  { key: "semana", label: "Seg–sex", days: [1, 2, 3, 4, 5], domingo: false },
  { key: "sabado", label: "Sáb", days: [6], domingo: false },
  { key: "domingo", label: "Dom", days: [0], domingo: true },
];
const sameDays = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const regrasDoGrupo = (sec: Sector, days: number[]) => sec.minRules.filter((r) => !r.date && sameDays(r.days, days)).sort((a, b) => toMin(a.start) - toMin(b.start));

/** Horário da loja para o grupo de dias (minutos). */
export function horarioLoja(cfg: StoreConfig, domingo: boolean): { open: number; close: number } | null {
  if (domingo) return cfg.sundayOpen ? { open: toMin(cfg.sundayStart), close: toMin(cfg.sundayEnd) } : null;
  return { open: toMin(cfg.open), close: toMin(cfg.close) };
}

/** Período coberto pelas faixas gerais do setor em cada grupo de dias. */
export function horarioSetor(sec: Sector) {
  return GRUPOS_HORARIO.map((g) => {
    const rs = regrasDoGrupo(sec, g.days);
    return { ...g, open: rs.length ? Math.min(...rs.map((r) => toMin(r.start))) : null, close: rs.length ? Math.max(...rs.map((r) => toMin(r.end))) : null };
  });
}

/** Grupos em que o setor está com horário diferente do da loja. */
export function diferencas(sec: Sector, cfg: StoreConfig) {
  return horarioSetor(sec)
    .map((g) => ({ ...g, loja: horarioLoja(cfg, g.domingo) }))
    .filter((g) => g.loja && g.open != null && (g.open !== g.loja.open || g.close !== g.loja.close));
}

/** Ajusta as faixas gerais do setor ao horário da loja: corta o que ficou fora e estica a primeira e a última faixa. */
export function aplicarHorarioLoja(sec: Sector, cfg: StoreConfig): Sector {
  let rules: MinRule[] = sec.minRules;
  for (const g of GRUPOS_HORARIO) {
    const loja = horarioLoja(cfg, g.domingo);
    if (!loja) continue;
    const doGrupo = regrasDoGrupo(sec, g.days);
    if (!doGrupo.length) continue;
    const ids = new Set(doGrupo.map((r) => r.id));
    let novas = doGrupo
      .filter((r) => toMin(r.end) > loja.open && toMin(r.start) < loja.close)
      .map((r) => ({ ...r, start: fmtTime(Math.max(loja.open, toMin(r.start))), end: fmtTime(Math.min(loja.close, toMin(r.end))) }));
    if (!novas.length) novas = [{ ...doGrupo[0], id: uid("mr_"), start: fmtTime(loja.open), end: fmtTime(loja.close) }];
    novas[0] = { ...novas[0], start: fmtTime(loja.open) };
    novas[novas.length - 1] = { ...novas[novas.length - 1], end: fmtTime(loja.close) };
    rules = [...rules.filter((r) => !ids.has(r.id)), ...novas];
  }
  return { ...sec, minRules: rules };
}
