// Importação de colaboradores por planilha (Excel ou CSV): leitura, conferência linha a linha e aplicação.
import type { Employee, Sector, Store } from "../engine/types";
import { newEmployee } from "../engine/seed";
import { regraDomingo, teamPatch, applyTeamsAll, limparPessoa, mudarRegime } from "./logic";
import { toMin } from "../engine/time";
import { CONTRATACAO_PADRAO } from "../engine/model";

export const COLUNAS = ["Nome", "Matrícula", "Função", "Setor", "Regime", "Turno", "Domingos", "Folga fixa", "Sexo", "Admissão", "Horas por semana", "Contratação", "Horas por dia"] as const;
type Col = (typeof COLUNAS)[number];

export const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const ALIAS: Record<string, Col> = {
  nome: "Nome",
  "nome completo": "Nome",
  colaborador: "Nome",
  matricula: "Matrícula",
  "matricula/id": "Matrícula",
  re: "Matrícula",
  funcao: "Função",
  cargo: "Função",
  setor: "Setor",
  departamento: "Setor",
  regime: "Regime",
  escala: "Regime",
  turno: "Turno",
  horario: "Turno",
  domingos: "Domingos",
  domingo: "Domingos",
  "folga fixa": "Folga fixa",
  folga: "Folga fixa",
  sexo: "Sexo",
  admissao: "Admissão",
  "data de admissao": "Admissão",
  "horas por semana": "Horas por semana",
  "jornada semanal": "Horas por semana",
  jornada: "Horas por semana",
  contratacao: "Contratação",
  "tipo de contratacao": "Contratação",
  "regime de contratacao": "Contratação",
  vinculo: "Contratação",
  "horas por dia": "Horas por dia",
  "jornada diaria": "Horas por dia",
};

export type Celula = string | number | Date | null | undefined;

/** Converte linhas cruas (primeira com cabeçalho reconhecível) em registros por coluna. */
export function linhasParaRegistros(rows: Celula[][]): { registros: { linha: number; v: Partial<Record<Col, Celula>> }[]; erro?: string } {
  const hi = rows.findIndex((r) => r.some((c) => ALIAS[norm(c)] === "Nome"));
  if (hi < 0) return { registros: [], erro: "Não encontrei a linha de cabeçalho com a coluna “Nome”. Use o modelo da planilha." };
  const map = rows[hi].map((c) => ALIAS[norm(c)] ?? null);
  const registros: { linha: number; v: Partial<Record<Col, Celula>> }[] = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => c == null || String(c).trim() === "")) continue;
    const v: Partial<Record<Col, Celula>> = {};
    map.forEach((k, j) => k && (v[k] = r[j]));
    registros.push({ linha: i + 1, v });
  }
  return { registros };
}

/** Lê CSV (separador ; , ou tabulação; aspas opcionais). */
export function lerCSV(txt: string): Celula[][] {
  const t = txt.replace(/^﻿/, "");
  const first = t.split(/\r?\n/)[0] ?? "";
  const sep = first.includes("\t") ? "\t" : (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) (row.push(cell), (cell = ""));
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) (row.push(cell), out.push(row));
  return out;
}

/** Lê a primeira planilha de um arquivo .xlsx. */
export async function lerXLSX(buf: ArrayBuffer): Promise<Celula[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets.find((w) => w.rowCount > 0 && /colab/i.test(w.name)) ?? wb.worksheets[0];
  if (!ws) return [];
  const out: Celula[][] = [];
  ws.eachRow({ includeEmpty: true }, (r, n) => {
    const vals: Celula[] = [];
    r.eachCell({ includeEmpty: true }, (c, col) => {
      const v = c.value as unknown;
      let x: Celula;
      if (v == null) x = null;
      else if (v instanceof Date || typeof v === "number" || typeof v === "string") x = v;
      else if (typeof v === "object" && v && "text" in v) x = String((v as { text: unknown }).text);
      else if (typeof v === "object" && v && "result" in v) x = (v as { result: Celula }).result;
      else if (typeof v === "object" && v && "richText" in v) x = (v as { richText: { text: string }[] }).richText.map((p) => p.text).join("");
      else x = String(v);
      vals[col - 1] = x;
    });
    out[n - 1] = vals;
  });
  return out.map((r) => r ?? []);
}

const DIAS: Record<string, number> = { dom: 0, domingo: 0, seg: 1, segunda: 1, "segunda-feira": 1, ter: 2, terca: 2, "terca-feira": 2, qua: 3, quarta: 3, "quarta-feira": 3, qui: 4, quinta: 4, "quinta-feira": 4, sex: 5, sexta: 5, "sexta-feira": 5, sab: 6, sabado: 6 };

function data(v: Celula): string | null | "erro" {
  if (v == null || String(v).trim() === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // número de série do Excel (dias desde 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const mm = Number(m[2]);
    const dd = Number(m[1]);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "erro";
    return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  return "erro";
}

function horasSemana(v: Celula): number | null | "erro" {
  if (v == null || String(v).trim() === "") return null;
  if (typeof v === "number") return Math.round(v * 60);
  const s = String(v).trim().toLowerCase().replace(",", ".");
  let m = s.match(/^(\d{1,2})[:h](\d{2})?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0);
  m = s.match(/^(\d{1,2}(?:\.\d+)?)\s*h?$/);
  if (m) return Math.round(Number(m[1]) * 60);
  return "erro";
}

export type Status = "novo" | "atualiza" | "erro" | "ignorado";
export interface LinhaPrevia {
  linha: number;
  nome: string;
  setor: string;
  status: Status;
  msgs: string[];
  /** pessoa existente a atualizar */
  empId?: string;
  sectorId?: string;
  patch?: Partial<Employee>;
}

/** Confere cada linha contra a loja: setor, turno, regras e duplicidades. Não muda nada. */
export function conferir(store: Store, registros: { linha: number; v: Partial<Record<Col, Celula>> }[], opts: { setorPadrao: Sector; atualizar: boolean }): LinhaPrevia[] {
  const setores = store.sectors.filter((s) => !s.hidden);
  const vistos = new Map<string, number>();
  const out: LinhaPrevia[] = [];
  for (const { linha, v } of registros) {
    const msgs: string[] = [];
    const nome = String(v["Nome"] ?? "").trim();
    const mat = String(v["Matrícula"] ?? "").trim();
    const setorTxt = String(v["Setor"] ?? "").trim();
    const sec = setorTxt ? setores.find((s) => norm(s.name) === norm(setorTxt)) ?? null : opts.setorPadrao;
    if (!nome) msgs.push("falta o nome");
    if (!sec) msgs.push(`setor “${setorTxt}” não existe na loja (setores: ${setores.map((s) => s.name).join(", ")})`);
    const patch: Partial<Employee> = {};
    if (nome) patch.name = nome;
    if (mat) patch.matricula = mat;
    const func = String(v["Função"] ?? "").trim();
    if (func) patch.func = func;
    // regime: em branco = o da loja; 12x36 (A/B ou sem letra = o sistema alterna)
    const regTxt = norm(v["Regime"]).replace(/\s+/g, "");
    let fase: 0 | 1 | null | undefined;
    const jornadaTxt = (store.config.jornadas ?? []).find((j) => norm(j.nome).replace(/\s+/g, "") === regTxt);
    if (regTxt) {
      if (jornadaTxt) Object.assign(patch, { regime: null, jornadaId: jornadaTxt.id, contractMin: jornadaTxt.diasSemana * jornadaTxt.horasDia });
      else if (/^12x36/.test(regTxt) || /^plantao/.test(regTxt)) fase = /b$/.test(regTxt) ? 1 : /a$/.test(regTxt) ? 0 : null;
      else if (!/^(5x2|6x1|loja|padrao|normal)$/.test(regTxt)) msgs.push(`regime “${v["Regime"]}” não reconhecido (use 5x2, 12x36 A, 12x36 B${store.config.jornadas?.length ? ` ou uma jornada: ${store.config.jornadas.map((j) => j.nome).join(", ")}` : ""})`);
      else {
        // 5x2 / 6x1 escolhido para a pessoa (independente do modelo da loja); "loja"/"padrão" = o do setor
        const n = regTxt === "5x2" ? 2 : regTxt === "6x1" ? 1 : null;
        const padrao = sec?.folgasSemana ?? store.config.folgasPorSemana;
        Object.assign(patch, { regime: null, jornadaId: null, folgasSemana: n == null || n === padrao ? null : n });
      }
    }
    // setor em 12x36: quem é novo e veio sem regime entra no plantão
    const jaExiste = mat ? store.employees.some((e) => norm(e.matricula) === norm(mat)) : store.employees.some((e) => norm(e.name) === norm(nome));
    if (!regTxt && sec?.modeloEscala === "12x36" && !jaExiste) fase = null;
    // setor com jornada cadastrada: quem é novo e veio sem regime segue a jornada do setor
    const jSec = sec?.jornadaId ? store.config.jornadas?.find((j) => j.id === sec.jornadaId) : undefined;
    if (!regTxt && jSec && !jaExiste) Object.assign(patch, { jornadaId: jSec.id, contractMin: jSec.diasSemana * jSec.horasDia });
    if (fase !== undefined) Object.assign(patch, { regime: "12x36", plantaoFase: fase ?? undefined });
    if (sec) {
      const turnoTxt = String(v["Turno"] ?? "").trim();
      if (turnoTxt) {
        const regular = sec.shifts.filter((s) => !s.special && (patch.regime === "12x36" ? s.plantao : !s.plantao || patch.regime === undefined));
        const hhmm = turnoTxt.match(/(\d{1,2})[:h](\d{2})/);
        const sh = regular.find((s) => norm(s.name) === norm(turnoTxt)) ?? (hhmm ? regular.find((s) => toMin(s.start) === Number(hhmm[1]) * 60 + Number(hhmm[2])) : undefined);
        if (sh) patch.shiftId = sh.id;
        else msgs.push(`turno “${turnoTxt}” não existe em ${sec.name} (turnos: ${regular.map((s) => `${s.name} ${s.start}`).join(", ")})`);
      }
      const domTxt = patch.regime === "12x36" ? "" : norm(v["Domingos"]);
      if (domTxt) {
        const { rule, ciclo } = regraDomingo(store, sec);
        const letra = domTxt.match(/^(?:time |grupo )?([a-h])$/);
        const cada = domTxt.match(/(\d+)/);
        if (/^(nao|não|nunca|nao trabalha|não trabalha|n)/.test(domTxt)) Object.assign(patch, { sundayCycle: 0, sundayOffset: 0 });
        else if (letra) {
          const l = letra[1].toUpperCase();
          const n = rule === "alternado" ? ciclo : 2;
          if ("ABCDEFGH".indexOf(l) >= n) msgs.push(`Time ${l} não existe no rodízio de ${sec.name} (times A a ${"ABCDEFGH"[n - 1]})`);
          else Object.assign(patch, teamPatch(l, n));
        } else if (/rodizio|sim|trabalha/.test(domTxt)) Object.assign(patch, { sundayCycle: rule === "alternado" ? ciclo : 2, sundayOffset: 0 });
        else if (cada) {
          const n = Number(cada[1]);
          if (n < 1 || n > 8) msgs.push(`domingos “${v["Domingos"]}”: use de 1 a 8`);
          else Object.assign(patch, { sundayCycle: domTxt.includes("x1") ? n + 1 : n, sundayOffset: 0 });
        } else msgs.push(`domingos “${v["Domingos"]}” não reconhecido (use: Time A, Time B, Rodízio, Não trabalha ou Folga a cada 3)`);
      }
    }
    const folgaTxt = norm(v["Folga fixa"]).replace(/\.$/, "");
    if (folgaTxt && !/^(sem|nao|não|-|nenhuma)/.test(folgaTxt)) {
      // uma ou duas folgas fixas: "Sáb", "Sáb e Dom", "sab/dom", "Sáb, Dom"
      const partes = folgaTxt.split(/\s*(?:\be\b|\/|,|;|\+)\s*/).filter(Boolean);
      const ds = partes.map((t) => DIAS[t] ?? DIAS[t.slice(0, 3)]);
      if (!partes.length || partes.length > 2 || ds.some((d) => d == null)) msgs.push(`folga fixa “${v["Folga fixa"]}” não reconhecida (use um ou dois dias: Dom, Seg, Ter, Qua, Qui, Sex ou Sáb — ex.: “Sáb e Dom”)`);
      else {
        patch.fixedOff = ds[0];
        patch.fixedOff2 = ds[1] != null && ds[1] !== ds[0] ? ds[1] : null;
        if (ds.includes(0)) Object.assign(patch, { sundayCycle: 0, sundayOffset: 0 });
      }
    } else if (folgaTxt) Object.assign(patch, { fixedOff: null, fixedOff2: null });
    const sexo = norm(v["Sexo"]);
    if (sexo) {
      if (sexo.startsWith("f")) patch.sex = "F";
      else if (sexo.startsWith("m")) patch.sex = "M";
      else msgs.push(`sexo “${v["Sexo"]}” não reconhecido (F ou M)`);
    }
    const adm = data(v["Admissão"]);
    if (adm === "erro") msgs.push(`admissão “${v["Admissão"]}” inválida (use dd/mm/aaaa)`);
    else if (adm) patch.admissao = adm;
    const hs = horasSemana(v["Horas por semana"]);
    if (hs === "erro" || (typeof hs === "number" && (hs < 60 || hs > 70 * 60))) msgs.push(`horas por semana “${v["Horas por semana"]}” inválidas (ex.: 44 ou 42:00)`);
    else if (typeof hs === "number") patch.contractMin = hs;
    // contratação: CLT (padrão), estagiário ou jovem aprendiz (com horas por dia)
    const ctrTxt = norm(v["Contratação"]);
    const hd = horasSemana(v["Horas por dia"]);
    if (ctrTxt) {
      const tipo = /^(clt|efetiv|normal|padrao)/.test(ctrTxt) ? "clt" : /^estag/.test(ctrTxt) ? "estagio" : /aprendiz/.test(ctrTxt) ? "aprendiz" : null;
      if (!tipo) msgs.push(`contratação “${v["Contratação"]}” não reconhecida (use CLT, Estagiário ou Jovem aprendiz)`);
      else if (tipo === "clt") Object.assign(patch, { contratacao: null, horasDia: null, intervaloMin: null });
      else {
        Object.assign(patch, { contratacao: tipo, horasDia: CONTRATACAO_PADRAO[tipo].dia });
        if (typeof hs !== "number") patch.contractMin = CONTRATACAO_PADRAO[tipo].semana;
      }
    }
    if (hd === "erro" || (typeof hd === "number" && (hd < 60 || hd > 12 * 60))) msgs.push(`horas por dia “${v["Horas por dia"]}” inválidas (ex.: 6 ou 4:30)`);
    else if (typeof hd === "number") {
      if (patch.contratacao === "estagio" || patch.contratacao === "aprendiz") patch.horasDia = hd;
      else if (!ctrTxt) {
        const ja = mat ? store.employees.find((e) => norm(e.matricula) === norm(mat)) : store.employees.find((e) => norm(e.name) === norm(nome));
        if (ja?.contratacao === "estagio" || ja?.contratacao === "aprendiz") patch.horasDia = hd;
        else msgs.push("horas por dia só valem para estagiário ou jovem aprendiz (preencha a coluna Contratação)");
      }
      else if (patch.contratacao == null) msgs.push("horas por dia só valem para estagiário ou jovem aprendiz; para CLT a jornada é a do turno");
    }

    // duplicidade: na planilha e na loja (mesma matrícula ou, sem matrícula, mesmo nome)
    const chave = mat ? `m:${norm(mat)}` : `n:${norm(nome)}`;
    if (nome && vistos.has(chave)) msgs.push(`repetida na planilha (igual à linha ${vistos.get(chave)})`);
    else if (nome) vistos.set(chave, linha);
    const existente = mat ? store.employees.find((e) => norm(e.matricula) === norm(mat)) : store.employees.find((e) => norm(e.name) === norm(nome));
    let status: Status = msgs.length ? "erro" : existente ? (opts.atualizar ? "atualiza" : "ignorado") : "novo";
    if (status === "ignorado") msgs.push(`já cadastrada${existente!.sectorId !== sec?.id ? ` (em ${store.sectors.find((s) => s.id === existente!.sectorId)?.name})` : ""} — marque “Atualizar quem já existe” para mudar os dados`);
    if (existente && sec && existente.sectorId !== sec.id && status === "atualiza") {
      msgs.push(`está em ${store.sectors.find((s) => s.id === existente.sectorId)?.name}; os dados são atualizados lá (mude de setor em Equipe se precisar)`);
      if (patch.shiftId) delete patch.shiftId;
    }
    if (status === "erro" && !nome && !mat) status = "erro";
    out.push({ linha, nome: nome || "(sem nome)", setor: (existente ? store.sectors.find((s) => s.id === existente.sectorId)?.name : sec?.name) ?? setorTxt, status, msgs, empId: existente?.id, sectorId: existente?.sectorId ?? sec?.id, patch });
  }
  return out;
}

/** Aplica as linhas válidas: cria quem é novo e atualiza quem já existe. */
export function importar(store: Store, linhas: LinhaPrevia[]): { store: Store; criados: number; atualizados: number } {
  let st = store;
  let criados = 0;
  let atualizados = 0;
  const tocados = new Set<string>();
  for (const l of linhas) {
    if (l.status === "atualiza" && l.empId) {
      const antes = st.employees.find((e) => e.id === l.empId);
      st = { ...st, employees: st.employees.map((e) => (e.id === l.empId ? { ...e, ...l.patch } : e)) };
      // mudou de jornada: a escala da pessoa é refeita (outros dias de folga por semana)
      if (antes && "jornadaId" in l.patch! && (antes.jornadaId ?? null) !== (l.patch!.jornadaId ?? null)) st = limparPessoa(st, antes.sectorId, antes.id);
      atualizados++;
      tocados.add(l.sectorId!);
    } else if (l.status === "novo" && l.sectorId) {
      const sec = st.sectors.find((s) => s.id === l.sectorId)!;
      const n = st.employees.filter((e) => e.sectorId === sec.id).length + 1;
      const base = newEmployee(sec, n);
      // sem regra de domingo na planilha: entra no rodízio do setor
      const { rule, ciclo } = regraDomingo(st, sec);
      const emp: Employee = { ...base, sundayCycle: rule === "alternado" ? ciclo : base.sundayCycle, sundayOffset: 0, ...l.patch };
      st = { ...st, employees: [...st.employees, emp] };
      criados++;
      tocados.add(sec.id);
    }
  }
  for (const id of tocados) st = applyTeamsAll(st, { sectorId: id });
  // 12x36: garante o turno de plantão e reparte quem veio sem letra entre Plantão A e B
  let alterna = 0;
  for (const l of linhas) {
    if ((l.status !== "novo" && l.status !== "atualiza") || l.patch?.regime !== "12x36") continue;
    const e = l.empId ? st.employees.find((x) => x.id === l.empId) : st.employees.filter((x) => x.name === l.patch!.name && x.sectorId === l.sectorId).pop();
    if (!e) continue;
    const letra = l.patch.plantaoFase === 1 ? "B" : l.patch.plantaoFase === 0 ? "A" : alterna++ % 2 === 0 ? "A" : "B";
    st = mudarRegime(st, e.id, letra);
  }
  return { store: st, criados, atualizados };
}

/** Modelo de planilha (.xlsx) com as colunas, exemplos, listas de escolha e instruções. */
export async function modeloXLSX(store: Store): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Colaboradores", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUNAS.map((h) => ({ header: h, key: h, width: h === "Nome" ? 34 : h === "Função" || h === "Turno" ? 22 : 16 }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3B2A6E" } };
  const sec = store.sectors.find((s) => !s.hidden) ?? store.sectors[0];
  const sh = sec?.shifts.filter((s) => !s.special) ?? [];
  ws.addRow(["Maria Souza (exemplo)", "1234", "Operador(a) de caixa", sec?.name ?? "", "5x2", sh[0]?.name ?? "", "Rodízio", "", "F", "15/03/2024", 44, "CLT", ""]);
  ws.addRow(["João Lima (exemplo)", "1235", "Estagiário", sec?.name ?? "", "5x2", sh[1]?.name ?? sh[0]?.name ?? "", "Não trabalha", "Dom", "M", "02/02/2025", 30, "Estagiário", 6]);
  const setores = store.sectors.filter((s) => !s.hidden).map((s) => s.name);
  const lista = (vals: string[]) => ({ type: "list" as const, allowBlank: true, formulae: [`"${vals.join(",").replace(/"/g, "")}"`] });
  for (let r = 2; r <= 1000; r++) {
    if (setores.join(",").length < 250) ws.getCell(`D${r}`).dataValidation = lista(setores);
    const regs = ["5x2", "6x1", "12x36", "12x36 A", "12x36 B", ...(store.config.jornadas ?? []).map((j) => j.nome.replace(/[",]/g, " "))];
    ws.getCell(`E${r}`).dataValidation = regs.join(",").length < 250 ? lista(regs) : lista(["5x2", "12x36", "12x36 A", "12x36 B"]);
    ws.getCell(`G${r}`).dataValidation = lista(["Rodízio", "Time A", "Time B", "Time C", "Não trabalha", "Folga a cada 3"]);
    // lista com sugestões; dá para digitar outra combinação de dois dias (ex.: "Seg e Qua")
    ws.getCell(`H${r}`).dataValidation = { ...lista(["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Sáb e Dom", "Sex e Sáb", "Seg e Ter"]), showErrorMessage: false };
    ws.getCell(`I${r}`).dataValidation = lista(["F", "M"]);
    ws.getCell(`L${r}`).dataValidation = lista(["CLT", "Estagiário", "Jovem aprendiz"]);
  }
  const inst = wb.addWorksheet("Instruções");
  inst.getColumn(1).width = 26;
  inst.getColumn(2).width = 100;
  const linhas: [string, string][] = [
    ["Como preencher", "Uma pessoa por linha na aba Colaboradores. Apague as duas linhas de exemplo. Só o Nome é obrigatório."],
    ["Nome", "Nome completo."],
    ["Matrícula", "Usada para achar quem já está cadastrado. Sem matrícula, a pessoa é procurada pelo nome."],
    ["Função", "Cargo (ex.: Operador(a) de caixa, Estagiário). Serve para filtrar na Equipe."],
    ["Setor", `Igual ao nome do setor na loja: ${setores.join(", ")}. Em branco = o setor aberto na tela.`],
    ["Regime", `${store.config.jornadas?.length ? `Nome de uma jornada cadastrada (${store.config.jornadas.map((j) => j.nome).join(", ")}), ou ` : ""}em branco = o do setor/loja. 5x2 ou 6x1 = esse modelo para a pessoa, mesmo que a loja seja outro (ex.: estagiário em 6x1 numa loja 5x2). 12x36 A ou 12x36 B = plantão dia sim, dia não (Plantão A e B trabalham em dias alternados). Só 12x36 = o sistema reparte entre A e B.`],
    ["Turno", "Nome do turno ou horário de entrada (ex.: 08:00). Para 12x36, o plantão (ex.: Plantão dia, 19:00). Em branco = o sistema escolhe."],
    ["Domingos", "Rodízio (entra no rodízio do setor), Time A / Time B..., Não trabalha, ou Folga a cada N (regra própria)."],
    ["Folga fixa", "Um ou dois dias: Dom, Seg, Ter, Qua, Qui, Sex ou Sáb (ex.: “Sáb e Dom”). Dois dias só para quem tem 2 folgas na semana (5x2). Dom = não trabalha aos domingos (ex.: estagiários)."],
    ["Sexo", "F ou M (só para a regra de domingos). Opcional."],
    ["Admissão", "dd/mm/aaaa (controle de férias). Opcional."],
    ["Horas por semana", "Jornada contratual (ex.: 44 ou 30). Opcional. Para estagiário e jovem aprendiz, em branco = 30h."],
    ["Contratação", "CLT (ou em branco), Estagiário ou Jovem aprendiz."],
    ["Horas por dia", "Só para estagiário e jovem aprendiz (ex.: 6 ou 4:30). Em branco = 6h. A pessoa entra no horário do turno e sai depois dessas horas (mais o intervalo)."],
    ["Turnos existentes", store.sectors.filter((s) => !s.hidden).map((s) => `${s.name}: ${s.shifts.filter((x) => !x.special).map((x) => `${x.name} (${x.start}${x.plantao ? ", 12x36" : ""})`).join(", ")}`).join(" | ")],
  ];
  linhas.forEach(([a, b]) => {
    const r = inst.addRow([a, b]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
