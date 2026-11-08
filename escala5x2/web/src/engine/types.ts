// Modelo de dados do simulador de escala 5x2.
// Dias da semana: 0 = Domingo ... 6 = Sábado (padrão JS).

/** Situação do colaborador em um dia.
 *  T = trabalha (dia normal) · D = trabalha domingo/feriado em jornada específica
 *  F = folga · A = ausente · V = férias · H = feriado com loja fechada */
/** T trabalho · D domingo/feriado trabalhado · F folga · A falta · M atestado · V férias · H feriado */
export type Code = "T" | "D" | "F" | "A" | "M" | "V" | "H";

/** Turnos pelo horário: quem abre a loja, o intermediário e quem fecha. */
export type TurnoChave = "abertura" | "intermediario" | "fechamento";

export interface Cell {
  c: Code;
  /** Bloqueada: a redistribuição automática não altera esta célula. */
  lock?: boolean;
  /** Turno usado neste dia, no lugar do turno habitual (ex.: domingo em horário diferente). */
  shiftId?: string;
  /** Início do intervalo só neste dia (HH:MM), no lugar do intervalo de sempre. */
  brk?: string;
  /** Duração do intervalo só neste dia (min), no lugar da de sempre; a saída anda junto (as horas trabalhadas não mudam). */
  brkMin?: number;
  /** o almoço deste dia foi escolhido à mão ("só neste dia"): a distribuição automática nunca mexe */
  brkFix?: boolean;
  /** turno do dia trocado automaticamente (rodízio de turnos / quem fecha não abre); refeito a cada geração */
  auto?: boolean;
}

/** Força de uma regra: "evitar" (só se não houver outro jeito) ou "proibir" (nunca). */
export type Forca = "evitar" | "proibir";

/** Regras avançadas extras (aba Regras avançadas). Ausente/null = desligada. */
export interface RegrasExtras {
  /** 1. as folgas da semana não caem em dias seguidos */
  folgasSeparadas?: Forca | null;
  /** 1b. preferir as folgas da semana juntas (folga dupla) */
  folgasJuntas?: boolean;
  /** 1c. sem preferência: o sistema não tenta nem separar nem juntar as folgas (sem nada marcado, ele prefere separadas) */
  folgasSemPreferencia?: boolean;
  /** 2. dias da semana sem folga (0 = domingo .. 6 = sábado), na loja toda ou só em alguns setores */
  diasSemFolgaSemana?: { dias: number[]; forca: Forca; setores: string[] | null } | null;
  /** 4. revezar o dia da folga e dividir as folgas de cada dia da semana (segunda a sábado) por igual */
  rodizioDiaFolga?: boolean;
  /** 5. um fim de semana completo por mês (folga de domingo colada no sábado ou na segunda) */
  fimDeSemanaMes?: boolean;
  /** 15. quem folga no domingo também folga no sábado anterior (fim de semana inteiro), até o limite de folgas do sábado.
   *  Vale mesmo com o sábado marcado como dia sem folga (regra 2): o sábado colado ao domingo é a exceção.
   *  O formato antigo `{ pct }` conta como ligada (a % não é mais usada). */
  sabadoComDomingo?: boolean | { pct?: number } | null;
  /** 5c. quem folga no domingo também folga na segunda seguinte, até pct% da equipe por domingo.
   *  Vale mesmo com a segunda marcada como dia sem folga (regra 2): a segunda colada ao domingo é a exceção. */
  segundaComDomingo?: { pct: number } | null;
  /** 8b. quem cobre a folga de quem: [titular, substituto] — quando o titular está de folga (e, com `ausencias`,
   *  de férias, falta ou atestado), o substituto vai para o turno do titular naquele dia (mesmo setor) */
  cobrirFolga?: { pares: [string, string][]; ausencias?: boolean } | null;
  /** 6. no máximo `max` pessoas de folga no dia antes e no dia depois de um feriado */
  emendaFeriado?: { forca: Forca; max: number } | null;
  /** 7. duplas que não folgam no mesmo dia (ids das pessoas) */
  naoFolgarJuntos?: { forca: Forca | null; pares: [string, string][] } | null;
  /** 8. duplas que preferem folgar no mesmo dia */
  folgarJuntos?: [string, string][];
  /** 9. pelo menos `min` pessoas-chave trabalhando em cada dia, por setor */
  pessoaChave?: { forca: Forca; min: number } | null;
  /** 3. distribuir as folgas por igual entre os dias da semana (segunda a sábado); ausente = ligada, false = desligada */
  folgasDiasIguais?: boolean | null;
  /** 10. equilibrar os domingos trabalhados entre a equipe */
  domingosIguais?: boolean;
  /** 11. quem fecha não abre no dia seguinte (troca o turno do dia seguinte quando houver outro) */
  fecharAbrir?: boolean;
  /** 12. rodízio semanal entre os turnos marcados em Horários */
  rodizioTurnos?: boolean;
  /** 13. limite de horas extras por semana (aviso); null = sem aviso */
  maxExtrasSemanaMin?: number | null;
  /** 14. descanso mínimo entre jornadas respeitado ao gerar (min); ausente/null = não usar (o cliente preenche se quiser) */
  descansoObrigatorio?: number | null;
  /** onde cada regra vale: lista de setores (ids); ausente ou vazia = todos os setores. A regra 2 usa `diasSemFolgaSemana.setores`. */
  ondeVale?: Partial<Record<RegraPorSetor, string[]>>;
}

/** Regras extras que podem valer só em alguns setores. */
export type RegraPorSetor = "folgasDiasIguais" | "folgasSeparadas" | "folgasJuntas" | "folgasSemPreferencia" | "rodizioDiaFolga" | "fimDeSemanaMes" | "sabadoComDomingo" | "segundaComDomingo" | "emendaFeriado" | "pessoaChave" | "domingosIguais" | "fecharAbrir" | "rodizioTurnos" | "maxExtrasSemanaMin" | "descansoObrigatorio";

/** Valores de referência das Regras avançadas (podem ser da loja ou próprios de um setor). */
export interface RefValores {
  maxConsecutive: number;
  sundayMaxCycleM: number;
  sundayMaxCycleF: number;
  minRestMin: number;
  breakMinOver6h: number;
  breakMax: number;
  maxDailyMin: number;
}

/** Jornada cadastrada pelo usuário: nome, dias de trabalho por semana e horas por dia. */
export interface Jornada {
  id: string;
  nome: string;
  /** dias de trabalho por semana (1 a 7); as folgas da semana são 7 − dias */
  diasSemana: number;
  /** horas de trabalho por dia (min), sem contar o intervalo */
  horasDia: number;
  /** intervalo (min); ausente/null = automático pela jornada */
  intervaloMin?: number | null;
}

export interface Shift {
  id: string;
  name: string;
  start: string; // "08:15"
  breakStart: string | null; // "10:30" ou null (sem intervalo)
  breakMin: number; // duração do intervalo não computado na jornada
  /** Jornada efetiva em minutos. null = segue a jornada diária da loja. */
  workMin: number | null;
  /** true = turno de domingo/feriado (jornada específica). */
  special: boolean;
  /** quanto o início do intervalo pode andar (min) ao escalonar; 0 = fixo. Ausente = 60. */
  breakFlex?: number;
  /** janela permitida para o intervalo ao distribuir: "inicio" = o início fica na janela; "inteiro" = o intervalo todo cabe nela */
  /** janela do intervalo; dist: "linear" (padrão) espalha as pessoas por igual na janela, "movimento" segue a necessidade de cada horário */
  breakWindow?: { start: string; end: string; mode: "inicio" | "inteiro"; dist?: "linear" | "movimento" } | null;
  /** cor do turno nas telas (opcional) */
  color?: string;
  /** entra no rodízio semanal de turnos (Regras avançadas) */
  rodizio?: boolean;
  /** turno de plantão 12x36 (12h de trabalho por 36h de descanso); pode passar da meia-noite */
  plantao?: boolean;
}

/** Modelo reutilizável de domingo: quem trabalha, em qual turno, e quem folga. */
export interface SundayTemplate {
  id: string;
  name: string;
  /** empId -> situação no domingo */
  entries: Record<string, { c: "D" | "F"; shiftId?: string }>;
}

/** Chaves das cores personalizáveis da escala. */
export type ColorKey = "T" | "D" | "F" | "V" | "A" | "M" | "H" | "brk";

export interface MinRule {
  id: string;
  days: number[]; // dias da semana em que vale (0..6)
  date?: string | null; // data específica (YYYY-MM-DD) — tem prioridade sobre os dias
  start: string;
  end: string;
  min: number;
  ideal?: number | null;
  label?: string;
}

export interface DayMovement {
  intensity: 1 | 2 | 3; // 1 fraco, 2 médio, 3 forte
  maxOff: number | null; // máximo de pessoas de folga no dia
  minStaff: number | null; // mínimo de pessoas trabalhando no dia
}

export interface Sector {
  id: string;
  name: string;
  roleSingular: string; // "operador"
  rolePlural: string; // "operadores"
  shifts: Shift[];
  defaultSundayShiftId: string | null;
  minRules: MinRule[];
  movement: DayMovement[]; // índice 0..6 (Dom..Sáb)
  posts: string[];
  /** empId -> data ISO -> célula */
  schedule: Record<string, Record<string, Cell>>;
  lastRun?: { at: string; engine: string; ok: boolean; summary: string } | null;
  /** oculto na versão simplificada (setor que a loja não usa) */
  hidden?: boolean;
  /** cor de identificação do setor */
  color?: string;
  /** modelos de escala de domingo */
  sundayTemplates?: SundayTemplate[];
  /** regra de domingo própria do setor (ausente/null = segue a da loja) */
  sundayRule?: "alternado" | "individual" | null;
  /** no rodízio: quantos domingos seguidos trabalha antes de 1 de folga (1 = 1x1, 2 = 2x1) */
  sundayWork?: number | null;
  /** o setor tem horário próprio (exceção): não recebe o horário da loja ao aplicar para todos */
  horarioProprio?: boolean;
  /** modelo de escala do setor: "12x36" = todos em plantão dia sim, dia não; ausente/null = o da loja (5x2/6x1) */
  modeloEscala?: "12x36" | null;
  /** meses ("AAAA-MM") com a escala limpa: os dias ficam em branco até "Gerar escala" */
  limpo?: string[];
  /** máximo de pessoas de folga por dia (0 = domingo .. 6 = sábado), escolhido pelo usuário; ausente = automático */
  limiteFolga?: { modo: "pessoas" | "pct"; valores: (number | null)[] } | null;
  /** máximo de pessoas de folga por dia (0 = domingo .. 6 = sábado) em cada turno (pelo horário: quem abre, intermediário,
   *  quem fecha); null/ausente no dia = sem limite. Regras avançadas, regra 3b. */
  limiteFolgaTurno?: Partial<Record<TurnoChave, (number | null)[]>> | null;
  /** Regras avançadas próprias do setor (valores de referência e regras extras); ausente/null = segue as da loja */
  regrasProprias?: { ref: RefValores; regras: RegrasExtras } | null;
  /** assinatura do que define os almoços (turnos, pessoas, período) na última distribuição automática; diferente = redistribuir */
  almocoAssinatura?: string;
  /** assinatura da cobertura de folga (regra 8b) já aplicada; muda → os turnos do dia são refeitos */
  coberturaAssinatura?: string;
  /** versão do modelo de almoço já aplicada ao setor (2 = horário fixo por pessoa) */
  almocoVersao?: number;
  /** horário do almoço de cada pessoa: "rodizio" = a ordem varia a cada dia (padrão); "fixo" = a pessoa almoça sempre no mesmo horário */
  almocoModo?: "rodizio" | "fixo";
  /** folgas por semana do setor (2 = 5x2, 1 = 6x1); ausente = as da loja */
  folgasSemana?: number | null;
  /** jornada cadastrada que o setor inteiro segue (quem entra no setor recebe essa jornada) */
  jornadaId?: string | null;
}

export type Sex = "F" | "M" | "";

export interface Employee {
  id: string;
  sectorId: string;
  func: string;
  name: string;
  matricula: string;
  sex: Sex;
  shiftId: string;
  sundayShiftId: string | null; // null = padrão do setor
  /** 0 = não trabalha aos domingos; N>=1 = folga 1 domingo a cada N (1 = folga todos). */
  sundayCycle: number;
  /** Qual domingo do ciclo é folga (1..N). 0 = o sistema escolhe para equilibrar. */
  sundayOffset: number;
  fixedOff: number | null; // dia da semana da folga fixa (0 = domingo .. 6 = sábado) ou null
  /** segunda folga fixa (ex.: sábado e domingo); só quem tem 2 ou mais folgas por semana */
  fixedOff2?: number | null;
  variableOff: number | null; // preferência para a folga variável (1..6) ou null = automático
  contractMin: number; // jornada contratual semanal (min)
  quals: string[]; // setores em que é habilitado a atuar
  joker: boolean; // coringa
  defaultPost: string;
  /** início do intervalo próprio da pessoa (escalonamento); null/ausente = o do turno */
  breakStart?: string | null;
  /** horário de almoço fixo: a pessoa almoça sempre em breakStart nos dias normais e fica fora da distribuição automática (rodízio) */
  almocoFixo?: boolean;
  /** o horário fixo foi sugerido pelo sistema (refeito a cada "Gerar escala"); ausente/false = escolhido à mão */
  almocoAuto?: boolean;
  /** almoço em rodízio: o sistema escolhe o horário a cada dia dentro da janela do turno (o padrão é horário fixo) */
  almocoRodizio?: boolean;
  /** duração do intervalo própria da pessoa (min) nos dias normais; null/ausente = a do turno. A saída anda junto. */
  almocoMin?: number | null;
  /** regime da pessoa: ausente = o da loja (5x2/6x1); "12x36" = plantão dia sim, dia não */
  regime?: "12x36" | null;
  /** no 12x36: qual dos dois plantões (0 = Plantão A, 1 = Plantão B), ancorado no calendário */
  plantaoFase?: 0 | 1;
  /** pessoa-chave (fiscal, líder, quem abre o cofre): a regra garante um mínimo delas trabalhando por dia */
  chave?: boolean;
  /** folgas por semana da pessoa (2 = 5x2, 1 = 6x1); ausente = as do setor ou da loja */
  folgasSemana?: number | null;
  /** jornada cadastrada (Personalizar → Jornadas); ausente = a da loja. Não vale no 12x36. */
  jornadaId?: string | null;
  /** contratação: ausente/"clt" = CLT; "estagio" e "aprendiz" têm jornada própria (horasDia) */
  contratacao?: "clt" | "estagio" | "aprendiz" | null;
  /** horas de trabalho por dia de quem é estagiário/aprendiz (min); vale em qualquer turno */
  horasDia?: number | null;
  /** intervalo de quem tem jornada própria (min); ausente/null = automático pela jornada */
  intervaloMin?: number | null;
  /** data de admissão (controle de férias) */
  admissao?: string | null;
  /** férias quitadas até o fim deste período aquisitivo (períodos anteriores ao controle) */
  vacPaidUntil?: string | null;
  /** o usuário confirmou até onde as férias antigas foram tiradas */
  vacPaidConfirmed?: boolean;
  /** férias programadas (planejamento, não muda a escala): de feriasDe até feriasAte ("AAAA-MM-DD") */
  feriasDe?: string | null;
  feriasAte?: string | null;
  /** formato antigo (só o mês, "AAAA-MM"): lido como do dia 1 até os dias de férias da loja */
  feriasMes?: string | null;
  /** almoço próprio do domingo: horário ("HH:MM"; null = o sistema distribui) e tempo (min; null = o do turno de domingo) */
  almocoDomingo?: string | null;
  almocoDomingoMin?: number | null;
}

export interface Reassignment {
  id: string;
  employeeId: string;
  toSectorId: string;
  date: string | null; // data específica ou null = recorrente nos dias da semana
  weekdays: number[];
  start: string;
  end: string;
  post: string;
  note: string;
}

export interface PostAssignment {
  id: string;
  employeeId: string;
  date: string | null;
  weekdays: number[];
  start: string;
  end: string;
  post: string;
  /** false = outra atividade (não conta para a cobertura do posto). */
  counts: boolean;
}

export interface Holiday {
  date: string;
  name: string;
  open: boolean;
}

export interface LegendItem {
  code: Code;
  label: string;
}

export interface StoreConfig {
  folgasPorSemana: number;
  dailyMin: number; // jornada diária padrão (min)
  weeklyMaxMin: number; // limite semanal (min)
  open: string; // seg a sáb
  close: string;
  sundayOpen: boolean;
  sundayStart: string;
  sundayEnd: string;
  holidays: Holiday[];
  startDate: string;
  weeks: number; // 1..8
  slot: 15 | 30;
  maxConsecutive: number; // máximo de dias seguidos de trabalho
  sundayMaxCycleF: number; // parâmetro de referência (convenção/legislação aplicável)
  sundayMaxCycleM: number;
  minRestMin: number; // interjornada mínima
  maxDailyMin: number; // jornada diária máxima (incl. extras)
  breakMinOver6h: number; // intervalo mínimo para jornadas > 6h
  breakMax: number; // intervalo máximo
  lockManual: boolean; // bloquear edições manuais
  monthlyCost: number; // custo mensal médio por colaborador (salário)
  chargesPct: number; // encargos (%)
  legend: LegendItem[];
  /** tema de cores da versão simplificada */
  theme?: string;
  /** dia em que a semana começa: 1 = segunda (padrão da versão simples), 0 = domingo */
  weekStart?: number;
  /** cores do mapa da versão simples: % do quadro do setor ou necessidade informada */
  coverageColor?: {
    mode: "quadro" | "necessidade";
    low: number;
    high: number;
    /** com 4 cores: a partir deste % do quadro começa o "número médio" (entre low e high); ausente = no meio */
    mid?: number;
    /** cores escolhidas (hex) para pouca gente, abaixo do médio (só com 4 cores), número médio e muita gente; ausente = padrão */
    colors?: { low?: string; midLow?: string; mid?: string; high?: string };
    /** "faixas" = faixas de cor (quantas em `bands`); "degrade" = uma cor, mais forte quanto mais gente */
    style?: "faixas" | "degrade";
    /** quantas cores no estilo "faixas": 2, 3 (padrão) ou 4 */
    bands?: 2 | 3 | 4;
  };
  /** Semana: linha grossa entre pessoas de turnos diferentes (ausente = sim) */
  linhaTurno?: boolean;
  /** regra de domingo da loja: "alternado" = domingo sim, domingo não (Time A e Time B); "individual" = ciclo por pessoa */
  sundayRule?: "alternado" | "individual";
  /** modelo de escala da loja: ausente = 5x2/6x1 (folgasPorSemana); "12x36" = todos em plantão dia sim, dia não */
  /** regras avançadas extras */
  regras?: RegrasExtras;
  /** distribuir os almoços de todos os dias automaticamente ao gerar a escala (ausente = sim) */
  almocoAutomatico?: boolean;
  /** feriado com a loja fechada conta como uma das folgas da semana (ausente = sim) */
  feriadoContaFolga?: boolean;
  /** dias em que ninguém folga: "AAAA-MM-DD" (só aquele dia) ou "MM-DD" (todo ano) */
  diasSemFolga?: string[];
  /** jornadas cadastradas pelo usuário (nome, dias por semana, horas por dia) */
  jornadas?: Jornada[];
  modeloEscala?: "12x36" | null;
  /** no rodízio da loja: quantos domingos seguidos cada pessoa trabalha antes de 1 de folga (1 = 1x1, 2 = 2x1); ausente = 1 */
  sundayWork?: number;
  /** cores escolhidas pelo usuário (só aparência; não mudam cálculos) */
  colors?: Partial<Record<ColorKey, string>>;
  /** fonte da interface (ver simple/fonts.ts); ausente = padrão */
  font?: string;
  /** regras de férias da loja (só geram alertas) */
  vacation?: Partial<VacRules>;
}

/** Regras de férias configuráveis (padrão da CLT; confira com o RH). */
export interface VacRules {
  /** dias de férias por período aquisitivo */
  dias: number;
  /** menor período permitido */
  minPeriodo: number;
  /** ao menos um período com esse tamanho */
  periodoLongo: number;
  /** quantos períodos no máximo */
  maxPeriodos: number;
  /** avisar quando faltar até N dias para vencer */
  avisoDias: number;
  /** pessoas do mesmo setor de férias ao mesmo tempo (null = sem limite) */
  maxSimultaneo: number | null;
  /** faltas sem atestado no período aquisitivo reduzem os dias de férias (tabela da CLT, art. 130) */
  descontoFaltas: boolean;
}

export interface Store {
  id: string;
  name: string;
  network: string;
  config: StoreConfig;
  sectors: Sector[];
  employees: Employee[];
  reassignments: Reassignment[];
  assignments: PostAssignment[];
  updatedAt: string;
}

export interface Network {
  name: string;
  stores: Store[];
}

/** Dia do calendário da simulação. */
export interface CalDay {
  idx: number;
  date: string;
  week: number; // 0..weeks-1
  weekday: number;
  holiday: Holiday | null;
  /** loja fechada neste dia */
  closed: boolean;
  /** domingo ou feriado aberto: usa turno de jornada específica */
  special: boolean;
  /** abertura/fechamento do dia (min) */
  openMin: number;
  closeMin: number;
}
