// Copiar a escala de um setor (função) para outros: turnos e intervalos, necessidade,
// regras de folga das pessoas e folgas do período (pela posição na lista). Gera prévia antes de aplicar.
import type { Code, Employee, Sector, Shift, Store } from "../engine/types";
import { buildDays, cellCode } from "../engine/model";
import { fmtDateBR, uid, WEEKDAY_SHORT } from "../engine/time";
import { deriveMovement, teamOf } from "./logic";
import { newEmployee } from "../engine/seed";

export interface CopyParts {
  turnos: boolean;
  necessidade: boolean;
  regras: boolean;
  folgas: boolean;
  /** cria no destino as vagas (pessoas sem nome) que faltam para ter o mesmo número de pessoas da origem */
  vagas?: boolean;
}
export interface CopyTarget {
  storeId: string;
  sectorId: string;
}
export interface CopyPreview {
  target: CopyTarget;
  label: string;
  lines: string[];
  warnings: string[];
  /** algo que já existe no destino será substituído */
  replaces: boolean;
  pairs: { dest: string; src: string; detail: string }[];
}

const nm = (e: Employee) => e.name || e.func;
const sunLabel = (e: Employee) => {
  if (e.regime === "12x36") return `12x36 Plantão ${e.plantaoFase === 1 ? "B" : "A"}`;
  const t = teamOf(e);
  return t ? `Time ${t}` : e.sundayCycle === 0 ? "não trabalha domingo" : `folga a cada ${e.sundayCycle} domingos`;
};

/** Novo turno do destino equivalente a um turno antigo: mesmo nome e tipo; senão mesma posição; senão o primeiro. */
function remapShift(oldShifts: Shift[], newShifts: Shift[], oldId: string | null | undefined, special: boolean): string | null {
  const pool = newShifts.filter((s) => s.special === special);
  if (!pool.length) return null;
  const old = oldShifts.find((s) => s.id === oldId);
  if (!old) return special ? null : pool[0].id;
  const byName = pool.find((s) => s.name.trim().toLowerCase() === old.name.trim().toLowerCase());
  if (byName) return byName.id;
  const idx = oldShifts.filter((s) => s.special === special).findIndex((s) => s.id === old.id);
  return pool[Math.max(0, idx) % pool.length].id;
}

/** Aplica a cópia em uma loja de destino (pura). `src` é a loja de origem como estava antes de qualquer cópia. */
export function copyInto(src: Store, srcSectorId: string, dstIn: Store, dstSectorId: string, parts: CopyParts): { store: Store; preview: CopyPreview } {
  const sSec = src.sectors.find((s) => s.id === srcSectorId)!;
  const dSec = dstIn.sectors.find((s) => s.id === dstSectorId)!;
  const sEmps = src.employees.filter((e) => e.sectorId === sSec.id);
  const label = `${dstIn.id !== src.id ? `${dstIn.name} · ` : ""}${dSec.name}`;
  const lines: string[] = [];
  const warnings: string[] = [];
  const pairs: CopyPreview["pairs"] = [];
  let replaces = false;
  // vagas que faltam no destino: pessoas sem nome, uma para cada pessoa a mais na origem
  let dst = dstIn;
  const had = dstIn.employees.filter((e) => e.sectorId === dSec.id).length;
  if (parts.vagas && sEmps.length > had) {
    const extra = sEmps.slice(had).map((_, i) => newEmployee(dSec, had + i + 1));
    dst = { ...dst, employees: [...dst.employees, ...extra] };
    lines.push(`Vagas: ${extra.length} ${extra.length === 1 ? "vaga nova será criada" : "vagas novas serão criadas"} em ${dSec.name} (sem nome; preencha em Equipe), para o destino ter as mesmas ${sEmps.length} pessoas da origem.`);
  }
  const dEmps = dst.employees.filter((e) => e.sectorId === dSec.id);
  if ((parts.regras || parts.folgas) && dEmps.length && sEmps.length > dEmps.length)
    warnings.push(`A origem tem ${sEmps.length} pessoas e o destino ${dEmps.length}: só os padrões das ${dEmps.length} primeiras pessoas da origem são copiados. Marque "Criar as vagas que faltam" para copiar a escala inteira.`);

  let shifts = dSec.shifts;
  let defaultSun = dSec.defaultSundayShiftId;
  const idMap = new Map<string, string>();
  if (parts.turnos) {
    shifts = sSec.shifts.map((sh) => {
      const id = uid("sh_");
      idMap.set(sh.id, id);
      return { ...sh, id, breakWindow: sh.breakWindow ? { ...sh.breakWindow } : sh.breakWindow };
    });
    defaultSun = (sSec.defaultSundayShiftId && idMap.get(sSec.defaultSundayShiftId)) || shifts.find((s) => s.special)?.id || null;
    const had = dSec.shifts.map((s) => s.name);
    if (had.length) replaces = true;
    lines.push(
      had.length
        ? `Turnos e intervalos: ${had.length} ${had.length === 1 ? "turno atual" : "turnos atuais"} (${had.join(", ")}) ${had.length === 1 ? "será substituído" : "serão substituídos"} por ${shifts.length} (${shifts.map((s) => s.name).join(", ")}).`
        : `Turnos e intervalos: ${shifts.length} turnos serão criados (${shifts.map((s) => s.name).join(", ")}).`,
    );
  }
  /** turno do destino que corresponde a um turno da origem (por id copiado, senão pelo nome) */
  const fromSrcShift = (srcShiftId: string | null | undefined, special: boolean): string | null => {
    if (!srcShiftId) return null;
    if (idMap.has(srcShiftId)) return idMap.get(srcShiftId)!;
    return remapShift(sSec.shifts, shifts, srcShiftId, special);
  };

  let minRules = dSec.minRules;
  if (parts.necessidade) {
    if (dSec.minRules.length) replaces = true;
    minRules = sSec.minRules.map((r) => ({ ...r, id: uid("mr_"), days: [...r.days] }));
    lines.push(
      dSec.minRules.length
        ? `Fluxo alto: ${dSec.minRules.length} ${dSec.minRules.length === 1 ? "faixa atual será substituída" : "faixas atuais serão substituídas"} por ${minRules.length}.`
        : `Fluxo alto: ${minRules.length} faixas serão criadas.`,
    );
  }

  // pessoas do destino: turnos remapeados e regras de folga pela posição
  const days = buildDays(dst.config);
  const srcDays = new Map(buildDays(src.config, days[0].date, dst.config.weeks).map((d) => [d.date, d]));
  const patchEmp = new Map<string, Partial<Employee>>();
  dEmps.forEach((e, k) => {
    const p: Partial<Employee> = {};
    if (parts.turnos) {
      p.shiftId = remapShift(dSec.shifts, shifts, e.shiftId, false) ?? "";
      p.sundayShiftId = e.sundayShiftId ? remapShift(dSec.shifts, shifts, e.sundayShiftId, true) : null;
      p.breakStart = null;
    }
    if (parts.regras && sEmps.length) {
      const o = sEmps[k % sEmps.length];
      p.fixedOff = o.fixedOff;
      p.fixedOff2 = o.fixedOff2 ?? null;
      p.variableOff = o.variableOff;
      p.sundayCycle = o.sundayCycle;
      p.sundayOffset = o.sundayOffset;
      const sh = fromSrcShift(o.shiftId, false);
      if (sh) p.shiftId = sh;
      p.breakStart = null;
      const shName = shifts.find((s) => s.id === (p.shiftId ?? e.shiftId))?.name ?? "—";
      pairs.push({ dest: nm(e), src: nm(o), detail: `${shName} · ${sunLabel(o)} · folga fixa ${o.fixedOff != null ? [o.fixedOff, o.fixedOff2].filter((x): x is number => x != null).map((x) => WEEKDAY_SHORT[x]).join(" e ") : "não"}` });
    }
    if (Object.keys(p).length) patchEmp.set(e.id, p);
  });
  if (parts.regras) {
    if (!dEmps.length) warnings.push("O setor de destino não tem pessoas: as regras de folga não serão copiadas.");
    else if (!sEmps.length) warnings.push("O setor de origem não tem pessoas: não há regras de folga para copiar.");
    else {
      replaces = true;
      lines.push(`Regras de folga (turno, folga fixa, preferência e domingos) de ${dEmps.length} ${dEmps.length === 1 ? "pessoa" : "pessoas"}, pela posição na lista.`);
      if (dEmps.length > sEmps.length) warnings.push(`O destino tem mais pessoas (${dEmps.length}) que a origem (${sEmps.length}): o padrão da origem se repete a partir do começo da lista.`);
    }
  }

  // escala do destino: turnos do dia remapeados e, se pedido, folgas do período copiadas
  let changedDays = 0;
  const schedule: Sector["schedule"] = {};
  for (const e of dEmps) {
    const row = { ...(dSec.schedule[e.id] ?? {}) };
    if (parts.turnos)
      for (const [d, c] of Object.entries(row))
        if (c.shiftId) {
          const old = dSec.shifts.find((s) => s.id === c.shiftId);
          const nid = old ? remapShift(dSec.shifts, shifts, old.id, old.special) : null;
          row[d] = nid ? { ...c, shiftId: nid } : { c: c.c, ...(c.lock ? { lock: true } : {}) };
        }
    schedule[e.id] = row;
  }
  if (parts.folgas && dEmps.length && sEmps.length) {
    dEmps.forEach((e, k) => {
      const o = sEmps[k % sEmps.length];
      const row = schedule[e.id];
      for (const d of days) {
        if (d.closed) continue;
        const cur = row[d.date];
        if (cur && (cur.lock || cur.c === "A" || cur.c === "M" || cur.c === "V")) continue;
        const sd = srcDays.get(d.date);
        if (!sd || sd.closed) continue;
        const code = cellCode(sSec, o.id, sd);
        if (code !== "T" && code !== "D" && code !== "F") continue;
        const c: Code = code === "F" ? "F" : d.special ? "D" : "T";
        const srcShift = sSec.schedule[o.id]?.[d.date]?.shiftId;
        const sid = srcShift ? fromSrcShift(srcShift, sSec.shifts.find((s) => s.id === srcShift)?.special ?? false) : null;
        row[d.date] = { c, ...(sid ? { shiftId: sid } : {}) };
        changedDays++;
      }
    });
    replaces = true;
    lines.push(`Folgas do período ${fmtDateBR(days[0].date, false)} a ${fmtDateBR(days[days.length - 1].date, false)}: ${changedDays} dias de ${dEmps.length} ${dEmps.length === 1 ? "pessoa" : "pessoas"} copiados pela posição na lista. Dias fixados à mão, férias e faltas não mudam.`);
  } else if (parts.folgas) warnings.push("As folgas do período só podem ser copiadas quando origem e destino têm pessoas.");

  const nextSec: Sector = {
    ...dSec,
    shifts,
    defaultSundayShiftId: defaultSun,
    minRules,
    movement: parts.necessidade ? deriveMovement({ ...dSec, minRules }) : dSec.movement,
    schedule: { ...dSec.schedule, ...schedule },
    sundayTemplates: parts.turnos
      ? (dSec.sundayTemplates ?? []).map((t) => ({
          ...t,
          entries: Object.fromEntries(Object.entries(t.entries).map(([k, v]) => [k, v.shiftId ? { c: v.c, ...(remapShift(dSec.shifts, shifts, v.shiftId, true) ? { shiftId: remapShift(dSec.shifts, shifts, v.shiftId, true)! } : {}) } : v])),
        }))
      : dSec.sundayTemplates,
  };
  const store: Store = {
    ...dst,
    sectors: dst.sectors.map((s) => (s.id === dSec.id ? nextSec : s)),
    employees: dst.employees.map((e) => (patchEmp.has(e.id) ? { ...e, ...patchEmp.get(e.id)! } : e)),
  };
  if (!lines.length) warnings.push("Nada a copiar com as opções escolhidas.");
  return { store, preview: { target: { storeId: dst.id, sectorId: dstSectorId }, label, lines, warnings, replaces, pairs } };
}

/** Copia para vários destinos (inclusive em outras lojas). Devolve as lojas alteradas e a prévia de cada destino. */
export function copyToTargets(stores: Store[], srcStoreId: string, srcSectorId: string, targets: CopyTarget[], parts: CopyParts) {
  const src = stores.find((s) => s.id === srcStoreId)!;
  const out = new Map<string, Store>();
  const previews: CopyPreview[] = [];
  for (const t of targets) {
    if (t.storeId === srcStoreId && t.sectorId === srcSectorId) continue;
    const base = out.get(t.storeId) ?? stores.find((s) => s.id === t.storeId)!;
    const r = copyInto(src, srcSectorId, base, t.sectorId, parts);
    out.set(t.storeId, r.store);
    previews.push(r.preview);
  }
  return { stores: out, previews };
}
