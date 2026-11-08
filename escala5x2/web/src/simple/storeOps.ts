// Cadastro de lojas: nova loja a partir de outra (só a estrutura ou com equipe e escala), sempre com identificadores novos.
import type { Cell, RegrasExtras, Store } from "../engine/types";
import { uid } from "../engine/time";

const deep = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * Regras avançadas da cópia: os setores das regras ("onde vale", dias sem folga) passam para os setores novos;
 * duplas de pessoas só ficam se as pessoas também foram copiadas.
 */
function copiarRegras(r: RegrasExtras | undefined, secMap: Map<string, string>, empMap: Map<string, string>): RegrasExtras | undefined {
  if (!r) return r;
  const out = deep(r);
  const sec = (l: string[] | null | undefined) => (l ? l.map((x) => secMap.get(x)).filter((x): x is string => !!x) : l);
  const pares = (l: [string, string][] | undefined) => (l ?? []).filter(([a, b]) => empMap.has(a) && empMap.has(b)).map(([a, b]) => [empMap.get(a)!, empMap.get(b)!] as [string, string]);
  if (out.ondeVale) out.ondeVale = Object.fromEntries(Object.entries(out.ondeVale).map(([k, l]) => [k, sec(l) ?? []]));
  if (out.diasSemFolgaSemana) out.diasSemFolgaSemana = { ...out.diasSemFolgaSemana, setores: out.diasSemFolgaSemana.setores ? sec(out.diasSemFolgaSemana.setores) ?? null : null };
  if (out.naoFolgarJuntos) out.naoFolgarJuntos = { ...out.naoFolgarJuntos, pares: pares(out.naoFolgarJuntos.pares) };
  if (out.folgarJuntos) out.folgarJuntos = pares(out.folgarJuntos);
  return out;
}

/**
 * Copia uma loja.
 * - withTeam = false: setores, turnos e intervalos, necessidade, regras, horário de funcionamento, feriados e cores (sem pessoas e sem escala).
 * - withTeam = true: também as pessoas (mesmos nomes) e a escala, com os dias fixados, férias, faltas e atestados.
 */
export function duplicateStore(src: Store, name: string, network: string, withTeam: boolean): Store {
  const secMap = new Map(src.sectors.map((s) => [s.id, uid("sec_")]));
  const shMap = new Map<string, string>();
  src.sectors.forEach((s) => s.shifts.forEach((x) => shMap.set(x.id, uid("sh_"))));
  const empMap = new Map(withTeam ? src.employees.map((e) => [e.id, uid("emp_")]) : []);
  const cell = (c: Cell): Cell => (c.shiftId ? { ...c, shiftId: shMap.get(c.shiftId) ?? undefined } : { ...c });

  const sectors = src.sectors.map((s0) => {
    const s = deep(s0);
    return {
      ...s,
      id: secMap.get(s0.id)!,
      shifts: s.shifts.map((x) => ({ ...x, id: shMap.get(x.id)! })),
      defaultSundayShiftId: s.defaultSundayShiftId ? shMap.get(s.defaultSundayShiftId) ?? null : null,
      minRules: s.minRules.map((r) => ({ ...r, id: uid("mr_") })),
      schedule: withTeam
        ? Object.fromEntries(
            Object.entries(s0.schedule)
              .filter(([k]) => empMap.has(k))
              .map(([k, row]) => [empMap.get(k)!, Object.fromEntries(Object.entries(row).map(([d, c]) => [d, cell(c)]))]),
          )
        : {},
      sundayTemplates: withTeam
        ? (s.sundayTemplates ?? []).map((t) => ({
            ...t,
            id: uid("tpl_"),
            entries: Object.fromEntries(
              Object.entries(t.entries)
                .filter(([k]) => empMap.has(k))
                .map(([k, v]) => [empMap.get(k)!, v.shiftId ? { c: v.c, ...(shMap.get(v.shiftId) ? { shiftId: shMap.get(v.shiftId)! } : {}) } : { c: v.c }]),
            ),
          }))
        : [],
      lastRun: withTeam ? s.lastRun ?? null : null,
      regrasProprias: s.regrasProprias ? { ref: s.regrasProprias.ref, regras: copiarRegras(s.regrasProprias.regras, secMap, empMap) ?? {} } : s.regrasProprias,
    };
  });
  const employees = withTeam
    ? src.employees.map((e) => ({
        ...deep(e),
        id: empMap.get(e.id)!,
        sectorId: secMap.get(e.sectorId) ?? e.sectorId,
        shiftId: shMap.get(e.shiftId) ?? e.shiftId,
        sundayShiftId: e.sundayShiftId ? shMap.get(e.sundayShiftId) ?? null : null,
        quals: e.quals.map((q) => secMap.get(q) ?? q),
      }))
    : [];
  return {
    id: uid("loja_"),
    name: name.trim() || `${src.name} (cópia)`,
    network: network.trim() || src.network,
    config: { ...deep(src.config), regras: copiarRegras(src.config.regras, secMap, empMap) },
    sectors,
    employees,
    reassignments: withTeam
      ? src.reassignments.filter((r) => empMap.has(r.employeeId)).map((r) => ({ ...r, weekdays: [...r.weekdays], id: uid("re_"), employeeId: empMap.get(r.employeeId)!, toSectorId: secMap.get(r.toSectorId) ?? r.toSectorId }))
      : [],
    assignments: withTeam ? src.assignments.filter((a) => empMap.has(a.employeeId)).map((a) => ({ ...a, weekdays: [...a.weekdays], id: uid("as_"), employeeId: empMap.get(a.employeeId)! })) : [],
    updatedAt: new Date().toISOString(),
  };
}

/** Nomes para várias lojas: um por linha, sem linhas vazias nem repetidos. */
export function parseStoreNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\n+/)) {
    const n = raw.trim();
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    out.push(n);
  }
  return out;
}
