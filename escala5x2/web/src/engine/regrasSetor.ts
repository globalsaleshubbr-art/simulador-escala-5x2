// Regras avançadas por setor: cada regra da loja pode valer em todos os setores ou só em alguns,
// e um setor pode ainda ter regras próprias (valores e regras só dele).
import type { RefValores, RegraPorSetor, RegrasExtras, Sector, StoreConfig } from "./types";

export const REF_KEYS = ["maxConsecutive", "sundayMaxCycleM", "sundayMaxCycleF", "minRestMin", "breakMinOver6h", "breakMax", "maxDailyMin"] as const;

/** Valor "desligado" de cada regra que pode valer só em alguns setores. */
const DESLIGADA: Record<RegraPorSetor, null | false> = {
  folgasDiasIguais: false,
  folgasSeparadas: null,
  folgasJuntas: false,
  folgasSemPreferencia: false,
  rodizioDiaFolga: false,
  fimDeSemanaMes: false,
  emendaFeriado: null,
  pessoaChave: null,
  domingosIguais: false,
  fecharAbrir: false,
  rodizioTurnos: false,
  maxExtrasSemanaMin: null,
  descansoObrigatorio: null,
  sabadoComDomingo: null,
  segundaComDomingo: null,
};
export const REGRAS_POR_SETOR = Object.keys(DESLIGADA) as RegraPorSetor[];

/** A regra vale neste setor? (lista vazia ou ausente = todos os setores) */
export function regraValeNoSetor(r: RegrasExtras | undefined, k: RegraPorSetor, sectorId: string): boolean {
  const l = r?.ondeVale?.[k];
  return !l || !l.length || l.includes(sectorId);
}

/** Regras da loja como valem num setor: as que não valem nele ficam desligadas; "dias sem folga" fica só se vale nele. */
export function regrasParaSetor(r: RegrasExtras | undefined, sectorId: string): RegrasExtras | undefined {
  if (!r) return r;
  const out: RegrasExtras = { ...r };
  let mudou = false;
  for (const k of REGRAS_POR_SETOR)
    if (!regraValeNoSetor(r, k, sectorId)) {
      (out as Record<string, unknown>)[k] = DESLIGADA[k];
      mudou = true;
    }
  const sf = r.diasSemFolgaSemana;
  if (sf?.setores?.length && !sf.setores.includes(sectorId)) {
    out.diasSemFolgaSemana = null;
    mudou = true;
  } else if (sf?.setores?.length) out.diasSemFolgaSemana = { ...sf, setores: null };
  delete out.ondeVale;
  return mudou || r.ondeVale || sf?.setores ? out : r;
}

/** Valores de referência atuais da configuração da loja. */
export function refDaLoja(cfg: StoreConfig): RefValores {
  return Object.fromEntries(REF_KEYS.map((k) => [k, cfg[k]])) as unknown as RefValores;
}

/** Configuração que vale para o setor: as regras próprias do setor (se houver) ou as da loja que valem nele. */
export function configDoSetor(cfg: StoreConfig, sector?: Pick<Sector, "regrasProprias" | "id"> | null): StoreConfig {
  const p = sector?.regrasProprias;
  if (p) return { ...cfg, ...p.ref, regras: p.regras };
  if (!sector || !cfg.regras) return cfg;
  const r = regrasParaSetor(cfg.regras, sector.id);
  return r === cfg.regras ? cfg : { ...cfg, regras: r };
}
