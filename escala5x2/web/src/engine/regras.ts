// Regras avançadas extras no gerador de folgas: o que é proibido (restrição) e o que é só preferência (custo).
// Tudo é calculado olhando os vizinhos da célula (nunca a própria célula), para servir tanto para
// "colocar a folga aqui" quanto para "tirar a folga daqui" na busca local.
import type { Code, Employee, Forca, Sector, StoreConfig } from "./types";
import { addDays, fmtDateBR } from "./time";

const nivel = (f: Forca | null | undefined) => (f === "proibir" ? 2 : f === "evitar" ? 1 : 0);

/** Regras já traduzidas para os índices do problema (pessoas e dias de um setor). */
export interface RegrasProblema {
  separadas: 0 | 1 | 2;
  juntas: boolean;
  /** "sem preferência": nem separa nem junta as folgas */
  semPref: boolean;
  /** por dia: 0 = pode folgar, 1 = evitar, 2 = proibido (dias da semana sem folga) */
  semFolgaDia: (0 | 1 | 2)[];
  /** por dia: limite de folgas por emenda de feriado (null = não se aplica) e força */
  emendaMax: (number | null)[];
  emendaForca: 0 | 1 | 2;
  naoJuntos: { forca: 0 | 1 | 2; pares: [number, number][] };
  juntos: [number, number][];
  chave: { forca: 0 | 1 | 2; min: number };
  chaves: boolean[];
  rodizioDia: boolean;
  fds: boolean;
  /** quem folga no domingo também folga no sábado: máximo de pessoas com sábado + domingo de folga por fim de semana (null = regra desligada) */
  sabDom: number | null;
  /** quem folga no domingo também folga na segunda: máximo de pessoas com domingo + segunda de folga (null = desligada) */
  domSeg: number | null;
  domingos: boolean;
  /** parceiros de cada pessoa (índices), para achar rápido */
  parNao: number[][];
  /** duplas titular/substituto da regra 8b (o substituto evita folgar no mesmo dia do titular) */
  parCobre: number[][];
  parSim: number[][];
  /** parceiros de outro setor (escala deles já pronta): por pessoa, o nome e os dias em que estão de folga */
  extNao: { nome: string; setor: string; off: boolean[] }[][];
  extSim: { off: boolean[] }[][];
}

/** Pessoas de outros setores e como saber se estão de folga num dia do problema (duplas entre setores). */
export interface RegrasExterno {
  employees: Employee[];
  setorNome: (sectorId: string) => string;
  folga: (empId: string, dayIdx: number) => boolean;
}

export function regrasDoProblema(cfg: StoreConfig, sector: Sector, emps: Employee[], days: { date: string; weekday: number; closed: boolean }[], ext?: RegrasExterno): RegrasProblema | undefined {
  const r = cfg.regras;
  if (!r) return undefined;
  const idx = new Map(emps.map((e, i) => [e.id, i]));
  const pares = (l: [string, string][] | undefined) => (l ?? []).map(([a, b]) => [idx.get(a), idx.get(b)] as [number | undefined, number | undefined]).filter((x): x is [number, number] => x[0] != null && x[1] != null && x[0] !== x[1]);
  const sf = r.diasSemFolgaSemana;
  const vale = !!sf && sf.dias.length > 0 && (!sf.setores || sf.setores.length === 0 || sf.setores.includes(sector.id));
  const feriados = new Set((cfg.holidays ?? []).map((h) => h.date));
  const emenda = r.emendaFeriado;
  const naoPares = pares(r.naoFolgarJuntos?.pares);
  const simPares = pares(r.folgarJuntos);
  const parNao = emps.map(() => [] as number[]);
  const parSim = emps.map(() => [] as number[]);
  naoPares.forEach(([a, b]) => (parNao[a].push(b), parNao[b].push(a)));
  simPares.forEach(([a, b]) => (parSim[a].push(b), parSim[b].push(a)));
  const parCobre = emps.map(() => [] as number[]);
  pares(r.cobrirFolga?.pares).forEach(([a, b]) => (parCobre[a].push(b), parCobre[b].push(a)));
  // duplas com uma pessoa de outro setor: a escala do outro setor é tomada como pronta
  const extNao = emps.map(() => [] as RegrasProblema["extNao"][number]);
  const extSim = emps.map(() => [] as RegrasProblema["extSim"][number]);
  if (ext) {
    const fora = (l: [string, string][] | undefined, cb: (i: number, outro: Employee) => void) => {
      for (const [a, b] of l ?? [])
        for (const [x, y] of [[a, b], [b, a]] as const) {
          const i = idx.get(x);
          if (i == null || idx.has(y)) continue;
          const o = ext.employees.find((e) => e.id === y);
          if (o) cb(i, o);
        }
    };
    const offDe = (id: string) => days.map((_, d) => ext.folga(id, d));
    fora(r.naoFolgarJuntos?.pares, (i, o) => extNao[i].push({ nome: o.name || o.func, setor: ext.setorNome(o.sectorId), off: offDe(o.id) }));
    fora(r.folgarJuntos, (i, o) => extSim[i].push({ off: offDe(o.id) }));
  }
  const out: RegrasProblema = {
    separadas: nivel(r.folgasSeparadas) as 0 | 1 | 2,
    juntas: !!r.folgasJuntas && !r.folgasSeparadas,
    semPref: !!r.folgasSemPreferencia && !r.folgasSeparadas && !r.folgasJuntas,
    semFolgaDia: days.map((d) => (vale && !d.closed && sf!.dias.includes(d.weekday) ? (nivel(sf!.forca) as 0 | 1 | 2) : 0)),
    emendaMax: days.map((d) => (emenda && !d.closed && !feriados.has(d.date) && (feriados.has(addDays(d.date, -1)) || feriados.has(addDays(d.date, 1))) ? Math.max(0, emenda.max) : null)),
    emendaForca: nivel(emenda?.forca) as 0 | 1 | 2,
    naoJuntos: { forca: nivel(r.naoFolgarJuntos?.forca) as 0 | 1 | 2, pares: naoPares },
    juntos: simPares,
    chave: { forca: nivel(r.pessoaChave?.forca) as 0 | 1 | 2, min: Math.max(1, r.pessoaChave?.min ?? 1) },
    chaves: emps.map((e) => !!e.chave),
    rodizioDia: !!r.rodizioDiaFolga,
    fds: !!r.fimDeSemanaMes,
    sabDom: r.sabadoComDomingo ? emps.filter((e) => e.regime !== "12x36").length : null,
    domSeg: r.segundaComDomingo ? Math.floor((Math.max(0, Math.min(100, r.segundaComDomingo.pct)) / 100) * emps.filter((e) => e.regime !== "12x36").length) : null,
    domingos: !!r.domingosIguais,
    parNao,
    parCobre,
    parSim,
    extNao,
    extSim,
  };
  // com só uma pessoa-chave (ou menos que o mínimo + 1) não dá para garantir: vira "evitar"
  const nChaves = out.chaves.filter(Boolean).length;
  if (out.chave.forca === 2 && nChaves <= out.chave.min) out.chave.forca = 1;
  return out;
}

const trab = (c: Code | null) => c === null || c === "T" || c === "D";

/** Dias a e b (seguidos) formam um par de folga das regras 5b (sábado + domingo) ou 5c (domingo + segunda) ligadas?
 *  Esse par não conta como folgas coladas. */
export function parFds(p: { regras?: RegrasProblema; days: { weekday: number }[] }, a: number, b: number): boolean {
  const wa = p.days[a]?.weekday;
  const wb = p.days[b]?.weekday;
  return (p.regras?.sabDom != null && wa === 6 && wb === 0) || (p.regras?.domSeg != null && wa === 0 && wb === 1);
}
/** Folgas vizinhas da pessoa no dia d, sem contar o par sábado + domingo quando a regra está ligada. */
export function vizinhasF(p: { regras?: RegrasProblema; days: { weekday: number }[] }, row: (Code | null)[], d: number): number {
  return (row[d - 1] === "F" && !parFds(p, d - 1, d) ? 1 : 0) + (row[d + 1] === "F" && !parFds(p, d, d + 1) ? 1 : 0);
}
/** Quantas pessoas (fora ei) têm sábado (sab) e domingo (sab+1) de folga. */
export function paresFds(rows: (Code | null)[][], sab: number, ei = -1): number {
  let n = 0;
  for (let j = 0; j < rows.length; j++) if (j !== ei && rows[j][sab] === "F" && rows[j][sab + 1] === "F") n++;
  return n;
}
/** Pares (sábado + domingo ou domingo + segunda) que a folga da pessoa no dia d formaria:
 *  `ini` = primeiro dia do par, `max` = máximo de pessoas com o par, `extra` = o dia colado ao domingo (sábado ou segunda). */
function paresDoDia(p: Ctx, rows: (Code | null)[][], ei: number, d: number): { ini: number; max: number; extra: number }[] {
  const R = p.regras;
  const out: { ini: number; max: number; extra: number }[] = [];
  if (!R || (R.sabDom == null && R.domSeg == null)) return out;
  const wd = p.days[d].weekday;
  const F = (i: number) => rows[ei][i] === "F";
  if (R.sabDom != null) {
    if (wd === 6 && p.days[d + 1]?.weekday === 0 && F(d + 1)) out.push({ ini: d, max: R.sabDom, extra: d });
    if (wd === 0 && p.days[d - 1]?.weekday === 6 && F(d - 1)) out.push({ ini: d - 1, max: R.sabDom, extra: d - 1 });
  }
  if (R.domSeg != null) {
    if (wd === 1 && p.days[d - 1]?.weekday === 0 && F(d - 1)) out.push({ ini: d - 1, max: R.domSeg, extra: d });
    if (wd === 0 && p.days[d + 1]?.weekday === 1 && F(d + 1)) out.push({ ini: d, max: R.domSeg, extra: d + 1 });
  }
  return out;
}

interface Ctx {
  regras?: RegrasProblema;
  days: { weekday: number; closed: boolean; date: string }[];
  employees: { fixed: (Code | null)[]; plantao?: boolean }[];
}

/** Pessoas-chave trabalhando no dia d, sem contar a pessoa ei. */
function chavesTrabalhando(p: Ctx, rows: (Code | null)[][], ei: number, d: number) {
  const R = p.regras!;
  let n = 0;
  for (let j = 0; j < rows.length; j++) if (j !== ei && R.chaves[j] && trab(rows[j][d])) n++;
  return n;
}

/** A pessoa pode ter folga (variável) no dia d pelas regras proibitivas? Olha só os vizinhos. */
export function podeFolgarRegras(p: Ctx, rows: (Code | null)[][], ei: number, d: number): boolean {
  const R = p.regras;
  if (!R || p.employees[ei].plantao) return true;
  // sábado + domingo / domingo + segunda: no máximo sabDom / domSeg pessoas com o par
  const pares = paresDoDia(p, rows, ei, d);
  if (pares.some((x) => paresFds(rows, x.ini, ei) >= x.max)) return false;
  // dia da semana sem folga: o sábado (ou a segunda) colado à folga de domingo é a exceção das regras 5b e 5c
  if (R.semFolgaDia[d] === 2 && !pares.some((x) => x.extra === d)) return false;
  if (R.separadas === 2 && vizinhasF(p, rows[ei], d) > 0) return false;
  if (R.naoJuntos.forca === 2 && (R.parNao[ei].some((j) => rows[j][d] === "F") || R.extNao[ei].some((x) => x.off[d]))) return false;
  if (R.chave.forca === 2 && R.chaves[ei] && chavesTrabalhando(p, rows, ei, d) < R.chave.min) return false;
  return true;
}

/** Custo (preferências e regras "evitar") de a pessoa folgar no dia d, dado o resto da escala. */
export function custoRegras(p: Ctx, rows: (Code | null)[][], ei: number, d: number, cnts?: { off: number[]; work: number[] }): number {
  const R = p.regras;
  if (!R || p.employees[ei].plantao) return 0;
  const row = rows[ei];
  let c = 0;
  const viz = vizinhasF(p, row, d);
  if (R.separadas === 1) c += 30 * viz;
  if (R.juntas) c -= 14 * Math.min(1, viz);
  if (R.semFolgaDia[d] === 1 && !paresDoDia(p, rows, ei, d).some((x) => x.extra === d)) c += 30;
  if (R.emendaForca === 1 && R.emendaMax[d] != null && cnts && cnts.off[d] >= (R.emendaMax[d] as number)) c += 25;
  if (R.naoJuntos.forca === 1) c += 30 * (R.parNao[ei].filter((j) => rows[j][d] === "F").length + R.extNao[ei].filter((x) => x.off[d]).length);
  c -= 12 * (R.parSim[ei].filter((j) => rows[j][d] === "F").length + R.extSim[ei].filter((x) => x.off[d]).length);
  // 8b: o substituto não deve folgar no mesmo dia de quem ele cobre
  c += 25 * (R.parCobre?.[ei]?.filter((j) => rows[j][d] === "F").length ?? 0);
  if (R.chave.forca === 1 && R.chaves[ei] && chavesTrabalhando(p, rows, ei, d) < R.chave.min) c += 40;
  const wd = p.days[d].weekday;
  if (R.rodizioDia) {
    // não repetir o mesmo dia da semana de folga da semana anterior/seguinte
    if (row[d - 7] === "F" && p.employees[ei].fixed[d - 7] === null) c += 7;
    if (row[d + 7] === "F" && p.employees[ei].fixed[d + 7] === null) c += 7;
    if (wd !== 0 && !p.days[d].closed) {
      // folgas de cada dia da semana (segunda a sábado) divididas por igual entre a equipe;
      // o domingo segue o rodízio de domingos
      let meus = 0;
      let todos = 0;
      for (let x = d % 7; x < row.length; x += 7) if (x !== d && p.days[x].weekday === wd && !p.days[x].closed) {
        if (row[x] === "F") meus++;
        if (cnts) todos += cnts.off[x];
        else for (const r of rows) if (r[x] === "F") todos++;
      }
      c += 12 * (meus - todos / Math.max(1, rows.length));
    }
  }
  if (R.fds && (wd === 6 || wd === 1)) {
    const dom = wd === 6 ? d + 1 : d - 1;
    if (row[dom] === "F") {
      // ainda não teve fim de semana completo neste bloco de 4 semanas?
      const ini = Math.floor(d / 28) * 28;
      let teve = false;
      for (let x = ini; x < Math.min(row.length, ini + 28) && !teve; x++) {
        if (p.days[x].weekday !== 0 || row[x] !== "F" || x === dom) continue;
        if (row[x - 1] === "F" || row[x + 1] === "F") teve = true;
      }
      if (!teve) c -= 16;
    }
  }
  if (R.domingos && wd === 0) {
    // folga de domingo de preferência para quem trabalhou mais domingos
    let trabMeus = 0;
    let trabTodos = 0;
    for (let x = 0; x < row.length; x++) if (p.days[x].weekday === 0 && !p.days[x].closed && x !== d) {
      if (trab(row[x])) trabMeus++;
      if (cnts) trabTodos += cnts.work[x];
      else for (const r of rows) if (trab(r[x])) trabTodos++;
    }
    c -= 4 * (trabMeus - trabTodos / Math.max(1, rows.length));
  }
  return c;
}

/** Soma das preferências da escala inteira (para comparar escalas). */
export function penalidadeRegras(p: Ctx, rows: Code[][]): number {
  if (!p.regras) return 0;
  const off = p.days.map((_, d) => rows.filter((r) => r[d] === "F").length);
  const work = p.days.map((_, d) => rows.filter((r) => trab(r[d])).length);
  let s = 0;
  rows.forEach((row, ei) => {
    for (let d = 0; d < row.length; d++)
      if (row[d] === "F" && p.employees[ei].fixed[d] === null) {
        off[d]--;
        s += custoRegras(p, rows, ei, d, { off, work });
        off[d]++;
      }
  });
  return s;
}

const NOMES_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Regras proibitivas descumpridas (só quando alguma folga envolvida é variável — as fixas foram decididas por você). */
export function violacoesRegras(p: Ctx & { employees: { fixed: (Code | null)[]; plantao?: boolean; id: string; name: string }[] }, rows: Code[][]) {
  const R = p.regras;
  const out: { empId?: string; dayIdx: number; message: string }[] = [];
  if (!R) return out;
  const variavel = (ei: number, d: number) => rows[ei][d] === "F" && p.employees[ei].fixed[d] === null;
  const dia = (d: number) => `${NOMES_DIA[p.days[d].weekday]} ${fmtDateBR(p.days[d].date, false)}`;
  rows.forEach((row, ei) => {
    const e = p.employees[ei];
    if (e.plantao) return;
    for (let d = 0; d < row.length; d++) {
      const parSabDom =
        (R.sabDom != null && p.days[d].weekday === 6 && row[d + 1] === "F" && p.days[d + 1]?.weekday === 0) ||
        (R.domSeg != null && p.days[d].weekday === 1 && row[d - 1] === "F" && p.days[d - 1]?.weekday === 0);
      if (R.semFolgaDia[d] === 2 && variavel(ei, d) && !parSabDom) out.push({ empId: e.id, dayIdx: d, message: `${e.name}: folga em ${dia(d)}, dia da semana sem folga (Regras avançadas).` });
      if (R.separadas === 2 && row[d] === "F" && row[d + 1] === "F" && !parFds(p, d, d + 1) && (variavel(ei, d) || variavel(ei, d + 1))) out.push({ empId: e.id, dayIdx: d, message: `${e.name}: folgas em dias seguidos (${dia(d)} e ${NOMES_DIA[p.days[d + 1].weekday]}); a regra pede folgas separadas.` });
    }
  });
  if (R.naoJuntos.forca === 2)
    for (const [a, b] of R.naoJuntos.pares)
      for (let d = 0; d < rows[a].length; d++)
        if (rows[a][d] === "F" && rows[b][d] === "F" && (variavel(a, d) || variavel(b, d))) out.push({ empId: p.employees[a].id, dayIdx: d, message: `${p.employees[a].name} e ${p.employees[b].name} de folga no mesmo dia (${dia(d)}); a regra não deixa.` });
  if (R.naoJuntos.forca === 2)
    R.extNao.forEach((lista, a) => {
      for (const x of lista)
        for (let d = 0; d < rows[a].length; d++)
          if (x.off[d] && variavel(a, d)) out.push({ empId: p.employees[a].id, dayIdx: d, message: `${p.employees[a].name} e ${x.nome} (${x.setor}) de folga no mesmo dia (${dia(d)}); a regra não deixa.` });
    });
  if (R.sabDom != null)
    for (let d = 0; d + 1 < p.days.length; d++) {
      if (p.days[d].weekday !== 6 || p.days[d + 1].weekday !== 0) continue;
      const n = paresFds(rows, d);
      if (n > R.sabDom && rows.some((r, j) => r[d] === "F" && r[d + 1] === "F" && (variavel(j, d) || variavel(j, d + 1))))
        out.push({ dayIdx: d, message: `Fim de semana ${fmtDateBR(p.days[d].date, false)}: ${n} pessoas de folga no sábado e no domingo (máximo ${R.sabDom} pela regra "sábado com domingo").` });
    }
  if (R.domSeg != null)
    for (let d = 0; d + 1 < p.days.length; d++) {
      if (p.days[d].weekday !== 0 || p.days[d + 1].weekday !== 1) continue;
      const n = paresFds(rows, d);
      if (n > R.domSeg && rows.some((r, j) => r[d] === "F" && r[d + 1] === "F" && (variavel(j, d) || variavel(j, d + 1))))
        out.push({ dayIdx: d, message: `Domingo ${fmtDateBR(p.days[d].date, false)} e segunda: ${n} pessoas de folga nos dois dias (máximo ${R.domSeg} pela regra "segunda com domingo").` });
    }
  if (R.chave.forca === 2)
    for (let d = 0; d < p.days.length; d++) {
      if (p.days[d].closed) continue;
      const nT = rows.filter((r, j) => R.chaves[j] && trab(r[d])).length;
      if (nT < R.chave.min && rows.some((r, j) => R.chaves[j] && variavel(j, d))) out.push({ dayIdx: d, message: `${dia(d)}: ${nT} ${nT === 1 ? "pessoa-chave trabalhando" : "pessoas-chave trabalhando"} (mínimo ${R.chave.min}).` });
    }
  return out;
}
