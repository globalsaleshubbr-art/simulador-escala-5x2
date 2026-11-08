import type { DayMovement, Employee, MinRule, Sector, Shift, Store, StoreConfig } from "./types";
import { nextSunday, nextWeekStart, toISO, uid } from "./time";

export const SECTOR_CATALOG: { key: string; name: string; sing: string; plur: string; func: string; post: string }[] = [
  { key: "caixa", name: "Frente de Caixa", sing: "operador", plur: "operadores", func: "Operador(a) de caixa", post: "Caixa" },
  { key: "fiscal", name: "Fiscais de Caixa", sing: "fiscal", plur: "fiscais", func: "Fiscal de caixa", post: "Ilha de fiscalização" },
  { key: "empac", name: "Empacotadores", sing: "empacotador", plur: "empacotadores", func: "Empacotador(a)", post: "Empacotamento" },
  { key: "acougue", name: "Açougue", sing: "açougueiro", plur: "açougueiros", func: "Açougueiro(a)", post: "Balcão" },
  { key: "padaria", name: "Padaria", sing: "padeiro", plur: "padeiros", func: "Padeiro(a)", post: "Produção" },
  { key: "horti", name: "Hortifruti", sing: "repositor", plur: "repositores", func: "Repositor(a) de FLV", post: "Exposição" },
  { key: "repos", name: "Reposição", sing: "repositor", plur: "repositores", func: "Repositor(a)", post: "Corredores" },
  { key: "frios", name: "Frios", sing: "atendente", plur: "atendentes", func: "Atendente de frios", post: "Balcão de frios" },
  { key: "deposito", name: "Depósito", sing: "conferente", plur: "conferentes", func: "Conferente", post: "Recebimento" },
  { key: "limpeza", name: "Limpeza", sing: "auxiliar", plur: "auxiliares", func: "Auxiliar de limpeza", post: "Salão" },
  { key: "prevencao", name: "Prevenção de Perdas", sing: "fiscal", plur: "fiscais", func: "Fiscal de prevenção", post: "Entrada" },
  { key: "outros", name: "Outros", sing: "colaborador", plur: "colaboradores", func: "Colaborador(a)", post: "Geral" },
];

export function defaultConfig(start?: string): StoreConfig {
  const today = toISO(new Date());
  return {
    folgasPorSemana: 2,
    dailyMin: 504, // 8h24
    weeklyMaxMin: 2520, // 42h
    open: "08:30",
    close: "19:00",
    sundayOpen: true,
    sundayStart: "08:30",
    sundayEnd: "12:15",
    holidays: [],
    startDate: start ?? nextSunday(today),
    weeks: 4,
    slot: 15,
    maxConsecutive: 6,
    sundayMaxCycleF: 2,
    sundayMaxCycleM: 3,
    minRestMin: 660,
    maxDailyMin: 600,
    breakMinOver6h: 60,
    breakMax: 120,
    lockManual: true,
    monthlyCost: 2400,
    chargesPct: 68,
    legend: [
      { code: "T", label: "Trabalha" },
      { code: "F", label: "Folga" },
      { code: "D", label: "Trabalha domingo/feriado (jornada específica)" },
      { code: "A", label: "Ausente" },
      { code: "M", label: "Atestado" },
      { code: "V", label: "Férias" },
      { code: "H", label: "Feriado — loja fechada" },
    ],
  };
}

const mv = (a: [1 | 2 | 3, number | null, number | null][]): DayMovement[] => a.map(([intensity, maxOff, minStaff]) => ({ intensity, maxOff, minStaff }));

function shift(name: string, start: string, breakStart: string | null, breakMin: number, workMin: number | null = null, special = false): Shift {
  return { id: uid("sh_"), name, start, breakStart, breakMin, workMin, special };
}
function rule(days: number[], start: string, end: string, min: number, ideal: number | null = null, label = ""): MinRule {
  return { id: uid("mr_"), days, start, end, min, ideal, date: null, label };
}
const SEG_SEX = [1, 2, 3, 4, 5];
const SAB = [6];
const DOM = [0];

export function emptySector(cat: (typeof SECTOR_CATALOG)[number]): Sector {
  const shifts = [shift("Abertura", "08:15", "12:00", 60), shift("Tarde", "09:30", "13:30", 60), shift("Domingo", "08:15", null, 0, 240, true)];
  return {
    id: uid("sec_"),
    name: cat.name,
    roleSingular: cat.sing,
    rolePlural: cat.plur,
    shifts,
    defaultSundayShiftId: shifts[2].id,
    minRules: [],
    movement: mv([
      [1, null, null],
      [1, null, null],
      [1, null, null],
      [2, null, null],
      [2, null, null],
      [3, null, null],
      [3, null, null],
    ]),
    posts: [cat.post],
    schedule: {},
    lastRun: null,
  };
}

// ---------- Nomes fictícios ----------
const FN_F = ["Maria", "Ana", "Juliana", "Fernanda", "Camila", "Patrícia", "Aline", "Bruna", "Carla", "Daniela", "Eliane", "Gabriela", "Helena", "Isabela", "Jéssica", "Larissa", "Mariana", "Natália", "Priscila", "Renata", "Simone", "Tatiane", "Vanessa", "Luana", "Rosana", "Sueli", "Kátia", "Débora", "Michele", "Cristina"];
const FN_M = ["João", "Pedro", "Carlos", "Lucas", "Marcos", "Rafael", "Bruno", "Diego", "Eduardo", "Felipe", "Gustavo", "Henrique", "Igor", "José", "Leandro", "Mateus", "Paulo", "Rodrigo", "Thiago", "Vinícius", "André", "Fábio", "Márcio", "Sérgio", "Wagner", "Alex", "Caio", "Renan", "Davi", "Otávio"];
const LN = ["Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira", "Costa", "Ferreira", "Almeida", "Ribeiro", "Carvalho", "Gomes", "Martins", "Rocha", "Barbosa", "Mendes", "Araújo", "Cardoso", "Teixeira", "Moreira", "Nunes", "Freitas", "Dias", "Castro", "Campos"];

function namer(seed: number) {
  let s = seed;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  return (sex: "F" | "M") => {
    const fn = sex === "F" ? FN_F : FN_M;
    return `${fn[Math.floor(r() * fn.length)]} ${LN[Math.floor(r() * LN.length)]}`;
  };
}

interface SecPlan {
  key: string;
  count: number;
  femaleRatio: number;
  build: (sec: Sector) => void;
  shiftPattern: number[]; // índices dos turnos regulares em rodízio
}

/** Loja de demonstração com 60 colaboradores. */
export function demoStore(opts: { name?: string; network?: string; seed?: number; start?: string } = {}): Store {
  const seed = opts.seed ?? 7;
  const cfg = defaultConfig(opts.start);
  cfg.holidays = [];
  const name = namer(seed * 101 + 13);
  const sectors: Sector[] = SECTOR_CATALOG.map((c) => emptySector(c));
  const byKey = (k: string) => sectors[SECTOR_CATALOG.findIndex((c) => c.key === k)];

  // ---- Frente de Caixa (modelo do vídeo) ----
  const cx = byKey("caixa");
  cx.shifts = [
    shift("Abertura", "08:15", "10:30", 120),
    shift("Tarde A", "08:45", "13:00", 120),
    shift("Tarde B", "09:15", "12:30", 90),
    shift("Intermediário", "10:30", "14:30", 60),
    shift("Domingo", "08:15", null, 0, 240, true),
  ];
  cx.defaultSundayShiftId = cx.shifts[4].id;
  cx.posts = Array.from({ length: 20 }, (_, i) => `Caixa ${String(i + 1).padStart(2, "0")}`);
  cx.minRules = [
    rule(SEG_SEX, "08:30", "09:30", 3, 4, "Abertura"),
    rule(SEG_SEX, "09:30", "12:00", 6, 7),
    rule(SEG_SEX, "12:00", "14:00", 7, 8, "Almoço"),
    rule(SEG_SEX, "14:00", "17:00", 6, 7),
    rule(SEG_SEX, "17:00", "19:00", 8, 10, "Pico da tarde"),
    rule(SAB, "08:30", "09:00", 4, 5),
    rule(SAB, "09:00", "13:00", 9, 10, "Pico de sábado"),
    rule(SAB, "13:00", "19:00", 8, 9),
    rule(DOM, "08:30", "09:00", 3, null),
    rule(DOM, "09:00", "12:00", 6, 7),
  ];
  cx.movement = mv([
    [2, null, null],
    [2, 5, null],
    [1, 6, null],
    [1, 6, null],
    [2, 5, null],
    [3, 4, null],
    [3, 2, null],
  ]);

  // ---- Fiscais de Caixa (coringas) ----
  const fi = byKey("fiscal");
  fi.shifts = [shift("Abertura", "08:00", "12:00", 90), shift("Fechamento", "10:30", "14:30", 90), shift("Domingo", "08:15", null, 0, 240, true)];
  fi.defaultSundayShiftId = fi.shifts[2].id;
  fi.minRules = [rule([1, 2, 3, 4, 5, 6], "09:00", "18:00", 1, 2), rule(DOM, "09:00", "12:00", 1, null)];

  // ---- Açougue ----
  const ac = byKey("acougue");
  ac.shifts = [shift("Abertura", "07:30", "11:30", 90), shift("Tarde", "09:45", "13:30", 90), shift("Domingo", "08:00", null, 0, 240, true)];
  ac.defaultSundayShiftId = ac.shifts[2].id;
  ac.posts = ["Balcão", "Desossa", "Embalagem"];
  ac.minRules = [rule([1, 2, 3, 4, 5], "08:30", "19:00", 3, 4), rule(SAB, "08:30", "19:00", 4, 5), rule(DOM, "08:30", "12:00", 2, 3)];
  ac.movement = mv([
    [2, null, null],
    [1, 3, null],
    [1, 3, null],
    [1, 3, null],
    [2, 2, null],
    [3, 2, null],
    [3, null, null],
  ]);

  // ---- Padaria ----
  const pa = byKey("padaria");
  pa.shifts = [shift("Forno", "06:00", "10:00", 60), shift("Balcão", "10:00", "14:00", 90), shift("Domingo", "08:00", null, 0, 300, true)];
  pa.defaultSundayShiftId = pa.shifts[2].id;
  pa.posts = ["Forno", "Balcão", "Confeitaria"];
  pa.minRules = [rule([1, 2, 3, 4, 5, 6], "08:30", "14:00", 3, 4), rule([1, 2, 3, 4, 5, 6], "14:00", "19:00", 2, 3), rule(DOM, "08:30", "11:30", 2, null)];

  // ---- Hortifruti ----
  const ho = byKey("horti");
  ho.shifts = [shift("Abertura", "07:00", "11:00", 60), shift("Tarde", "10:00", "14:00", 90), shift("Domingo", "07:30", null, 0, 240, true)];
  ho.defaultSundayShiftId = ho.shifts[2].id;
  ho.posts = ["Exposição", "Câmara fria", "Seleção"];
  ho.minRules = [rule([1, 2, 3, 4, 5, 6], "08:30", "12:00", 3, 4), rule([1, 2, 3, 4, 5, 6], "12:00", "19:00", 2, 3), rule(DOM, "08:30", "11:30", 2, null)];

  // ---- Reposição ----
  const re = byKey("repos");
  re.shifts = [shift("Madrugada", "06:00", "10:30", 60), shift("Manhã", "07:30", "12:00", 90), shift("Tarde", "10:00", "14:00", 90), shift("Domingo", "07:00", null, 0, 240, true)];
  re.defaultSundayShiftId = re.shifts[3].id;
  re.posts = ["Corredor 1-4", "Corredor 5-8", "Corredor 9-12", "Bebidas", "Limpeza/Higiene"];
  re.minRules = [
    rule([1, 2, 3, 4, 5, 6], "08:30", "12:00", 6, 7),
    rule([1, 2, 3, 4, 5, 6], "12:00", "17:00", 4, 5),
    rule([1, 2, 3, 4, 5, 6], "17:00", "19:00", 3, 4),
    rule(DOM, "08:30", "11:00", 3, null),
  ];

  const plans: SecPlan[] = [
    { key: "caixa", count: 17, femaleRatio: 0.8, build: () => {}, shiftPattern: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 1] },
    { key: "fiscal", count: 3, femaleRatio: 0.5, build: () => {}, shiftPattern: [0, 1, 0] },
    { key: "acougue", count: 9, femaleRatio: 0.2, build: () => {}, shiftPattern: [0, 1, 0, 1, 0, 1, 0, 1, 1] },
    { key: "padaria", count: 9, femaleRatio: 0.5, build: () => {}, shiftPattern: [0, 1, 0, 1, 0, 1, 0, 1, 0] },
    { key: "horti", count: 8, femaleRatio: 0.4, build: () => {}, shiftPattern: [0, 1, 0, 1, 0, 1, 0, 1] },
    { key: "repos", count: 14, femaleRatio: 0.3, build: () => {}, shiftPattern: [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 1, 2] },
  ];

  const employees: Employee[] = [];
  let mat = 1000 + seed * 100;
  let rnd = seed * 7 + 3;
  const r = () => {
    rnd = (rnd * 9301 + 49297) % 233280;
    return rnd / 233280;
  };
  for (const plan of plans) {
    const sec = byKey(plan.key);
    const cat = SECTOR_CATALOG.find((c) => c.key === plan.key)!;
    const regular = sec.shifts.filter((s) => !s.special);
    for (let i = 0; i < plan.count; i++) {
      const sex: "F" | "M" = r() < plan.femaleRatio ? "F" : "M";
      const cycle = sex === "F" ? 2 : 3;
      employees.push({
        id: uid("emp_"),
        sectorId: sec.id,
        func: plan.key === "caixa" ? `Operador(a) ${i + 1}` : cat.func,
        name: name(sex),
        matricula: String(mat++),
        sex,
        shiftId: regular[plan.shiftPattern[i] % regular.length].id,
        sundayShiftId: null,
        sundayCycle: cycle,
        sundayOffset: (i % cycle) + 1,
        fixedOff: null,
        variableOff: null,
        contractMin: 2520,
        quals: plan.key === "fiscal" ? [byKey("caixa").id] : plan.key === "horti" ? [byKey("repos").id] : [],
        joker: plan.key === "fiscal",
        defaultPost: plan.key === "caixa" ? sec.posts[i % sec.posts.length] : sec.posts[i % sec.posts.length],
      });
    }
  }
  // algumas folgas fixas e uma pessoa que não trabalha aos domingos (exemplos editáveis)
  const cxEmps = employees.filter((e) => e.sectorId === cx.id);
  cxEmps[3].fixedOff = 2; // terça
  cxEmps[7].fixedOff = 3; // quarta
  cxEmps[11].sundayCycle = 0;

  const store: Store = {
    id: uid("loja_"),
    name: opts.name ?? "Loja 1 — Centro",
    network: opts.network ?? "Rede Bom Preço",
    config: cfg,
    sectors,
    employees,
    reassignments: [],
    assignments: [],
    updatedAt: new Date().toISOString(),
  };

  // remanejamento de exemplo: fiscal apoia o caixa no pico de sábado
  const fiscal = employees.find((e) => e.sectorId === fi.id)!;
  store.reassignments.push({
    id: uid("re_"),
    employeeId: fiscal.id,
    toSectorId: cx.id,
    date: null,
    weekdays: [6],
    start: "11:00",
    end: "13:00",
    post: "Caixa 20",
    note: "Apoio no pico de sábado",
  });
  // atividade não contabilizada: fechamento de caixa
  const op = cxEmps[0];
  store.assignments.push({ id: uid("as_"), employeeId: op.id, date: null, weekdays: [1, 2, 3, 4, 5], start: "18:15", end: "18:39", post: "Fechamento de caixa", counts: false });
  return store;
}

/** Exemplo do vídeo: 8 operadoras na frente de caixa. */
export function eightOperatorsExample(store: Store, sectorId: string): Store {
  const sec = store.sectors.find((s) => s.id === sectorId)!;
  const shifts = [
    shift("Abertura", "08:15", "10:30", 120),
    shift("Tarde A", "08:45", "13:00", 120),
    shift("Tarde B", "09:15", "12:30", 90),
    shift("Domingo", "08:15", null, 0, 240, true),
  ];
  const newSec: Sector = {
    ...sec,
    shifts,
    defaultSundayShiftId: shifts[3].id,
    posts: Array.from({ length: 10 }, (_, i) => `Caixa ${String(i + 1).padStart(2, "0")}`),
    minRules: [
      rule(SEG_SEX, "08:30", "09:30", 2, null, "Abre com 2"),
      rule(SEG_SEX, "09:30", "12:00", 4, null),
      rule(SEG_SEX, "12:00", "14:00", 4, null),
      rule(SEG_SEX, "14:00", "17:00", 4, null),
      rule(SEG_SEX, "17:00", "19:00", 5, null),
      rule(SAB, "08:30", "09:00", 3, null),
      rule(SAB, "09:00", "19:00", 5, null),
      rule(DOM, "08:30", "12:15", 3, null),
    ],
    movement: mv([
      [2, null, null],
      [2, null, null],
      [1, null, null],
      [1, null, null],
      [2, null, null],
      [3, null, null],
      [3, 1, null],
    ]),
    schedule: {},
  };
  const pattern = [0, 0, 0, 1, 1, 2, 2, 2];
  const emps: Employee[] = pattern.map((p, i) => ({
    id: uid("emp_"),
    sectorId,
    func: `Operadora ${i + 1}`,
    name: "",
    matricula: "",
    sex: "F",
    shiftId: shifts[p].id,
    sundayShiftId: null,
    sundayCycle: 2,
    sundayOffset: (i % 2) + 1,
    fixedOff: null,
    variableOff: null,
    contractMin: 2520,
    quals: [],
    joker: false,
    defaultPost: newSec.posts[i],
  }));
  return {
    ...store,
    sectors: store.sectors.map((s) => (s.id === sectorId ? newSec : s)),
    employees: [...store.employees.filter((e) => e.sectorId !== sectorId), ...emps],
    reassignments: store.reassignments.filter((r) => r.toSectorId !== sectorId && emps.every((e) => e.id !== r.employeeId)),
  };
}

export function emptyStore(name: string, network: string): Store {
  return {
    id: uid("loja_"),
    name,
    network,
    config: defaultConfig(),
    sectors: SECTOR_CATALOG.map((c) => emptySector(c)),
    employees: [],
    reassignments: [],
    assignments: [],
    updatedAt: new Date().toISOString(),
  };
}

export function newEmployee(sector: Sector, n: number): Employee {
  const regular = sector.shifts.filter((s) => !s.special);
  return {
    id: uid("emp_"),
    sectorId: sector.id,
    func: `${cap(sector.roleSingular)} ${n}`,
    name: "",
    matricula: "",
    sex: "",
    shiftId: regular[n % Math.max(1, regular.length)]?.id ?? sector.shifts[0]?.id ?? "",
    sundayShiftId: null,
    sundayCycle: 2,
    sundayOffset: 0,
    fixedOff: null,
    variableOff: null,
    contractMin: 2520,
    quals: [],
    joker: false,
    defaultPost: sector.posts[(n - 1) % Math.max(1, sector.posts.length)] ?? "",
  };
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Copia uma loja com novos identificadores e nomes (rede de teste com muitas lojas, sem recalcular escalas). */
export function cloneStore(src: Store, name: string, seed: number): Store {
  const nm = namer(seed * 977 + 5);
  const secMap = new Map(src.sectors.map((s) => [s.id, uid("sec_")]));
  const empMap = new Map(src.employees.map((e) => [e.id, uid("emp_")]));
  const shMap = new Map<string, string>();
  src.sectors.forEach((s) => s.shifts.forEach((x) => shMap.set(x.id, uid("sh_"))));
  let mat = 1000 + seed * 100;
  const sectors = src.sectors.map((s) => ({
    ...s,
    id: secMap.get(s.id)!,
    shifts: s.shifts.map((x) => ({ ...x, id: shMap.get(x.id)! })),
    defaultSundayShiftId: s.defaultSundayShiftId ? shMap.get(s.defaultSundayShiftId) ?? null : null,
    minRules: s.minRules.map((r) => ({ ...r, id: uid("mr_") })),
    schedule: Object.fromEntries(Object.entries(s.schedule).map(([k, row]) => [empMap.get(k) ?? k, { ...row }])),
  }));
  const employees = src.employees.map((e) => ({
    ...e,
    id: empMap.get(e.id)!,
    sectorId: secMap.get(e.sectorId)!,
    shiftId: shMap.get(e.shiftId) ?? e.shiftId,
    sundayShiftId: e.sundayShiftId ? shMap.get(e.sundayShiftId) ?? null : null,
    quals: e.quals.map((q) => secMap.get(q) ?? q),
    name: e.name ? nm(e.sex === "M" ? "M" : "F") : "",
    matricula: String(mat++),
  }));
  return {
    ...src,
    id: uid("loja_"),
    name,
    sectors,
    employees,
    reassignments: src.reassignments.map((r) => ({ ...r, id: uid("re_"), employeeId: empMap.get(r.employeeId)!, toSectorId: secMap.get(r.toSectorId)! })),
    assignments: src.assignments.map((a) => ({ ...a, id: uid("as_"), employeeId: empMap.get(a.employeeId)! })),
    config: JSON.parse(JSON.stringify(src.config)),
    updatedAt: new Date().toISOString(),
  };
}


/** Demonstração da versão simplificada: sem "ideal", setores vazios ocultos. */
export function simpleDemoStore(start?: string): Store {
  const st = demoStore({ start: start ?? nextWeekStart(toISO(new Date()), 1) });
  const colors = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
  let ci = 0;
  return {
    ...st,
    config: { ...st.config, slot: 30, theme: "roxo", weekStart: 1 },
    sectors: st.sectors.map((s) => {
      const has = st.employees.some((e) => e.sectorId === s.id);
      return { ...s, hidden: !has, color: has ? colors[ci++ % colors.length] : undefined, minRules: s.minRules.map((r) => ({ ...r, ideal: null })) };
    }),
  };
}

/** Loja nova com os setores escolhidos (demais ficam ocultos). */
export function simpleEmptyStore(name: string, network: string, sectorNames: string[], extra: { name: string; sing: string; plur: string }[] = []): Store {
  const st = emptyStore(name, network);
  st.config.startDate = nextWeekStart(toISO(new Date()), 1);
  st.config.weekStart = 1;
  const extraSecs = extra.map((x) => ({ ...emptySector({ key: "x", name: x.name, sing: x.sing, plur: x.plur, func: cap(x.sing), post: "Posto" }) }));
  return {
    ...st,
    config: { ...st.config, slot: 30, theme: "roxo", sundayRule: "alternado" },
    sectors: [...st.sectors.map((s) => ({ ...s, hidden: !sectorNames.includes(s.name) })), ...extraSecs],
  };
}
