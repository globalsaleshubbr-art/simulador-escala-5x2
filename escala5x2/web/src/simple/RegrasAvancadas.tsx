"use client";
// Regras avançadas extras: folgas (dias, limite por dia, rodízio, fim de semana, feriado),
// pessoas (duplas, pessoa-chave, domingos) e turnos/horas (quem fecha não abre, rodízio, extras).
import React, { useEffect, useRef, useState } from "react";
import { useSim } from "../components/state";
import { Btn, ConfirmBtn, DurInput, NumInput, Select } from "../components/ui";
import type { Forca, RefValores, RegraPorSetor, RegrasExtras, Sector, TurnoChave } from "../engine/types";
import { refDaLoja, regrasParaSetor } from "../engine/regrasSetor";
import { turnosDoSetor } from "../engine/solver";
import { WEEKDAY_SHORT, fmtDur, parseDur } from "../engine/time";
import { Card, PageHead, type PageId } from "./SimpleApp";

type ForcaOuNada = Forca | "off";
const OPCOES_FORCA: { value: ForcaOuNada; label: string }[] = [
  { value: "off", label: "Desligada" },
  { value: "evitar", label: "Evitar" },
  { value: "proibir", label: "Proibir" },
];
const OPCOES_SO_FORCA = OPCOES_FORCA.slice(1) as { value: Forca; label: string }[];
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

/** Preferência das folgas da semana (regra 1): uma escolha só no lugar de "separadas" e "juntas". */
type PrefFolgas = "separadas" | "separadasSempre" | "juntas" | "semPreferencia";
const OPCOES_PREF_FOLGAS: { value: PrefFolgas; label: string }[] = [
  { value: "separadas", label: "Separadas, quando der (padrão)" },
  { value: "separadasSempre", label: "Separadas, sempre" },
  { value: "juntas", label: "Juntas (folga dupla), quando der" },
  { value: "semPreferencia", label: "Sem preferência" },
];
const PREF_FOLGAS_VALOR: Record<PrefFolgas, Partial<RegrasExtras>> = {
  separadas: { folgasSeparadas: null, folgasJuntas: false, folgasSemPreferencia: false },
  separadasSempre: { folgasSeparadas: "proibir", folgasJuntas: false, folgasSemPreferencia: false },
  juntas: { folgasSeparadas: null, folgasJuntas: true, folgasSemPreferencia: false },
  semPreferencia: { folgasSeparadas: null, folgasJuntas: false, folgasSemPreferencia: true },
};
const PREF_FOLGAS_TXT: Record<PrefFolgas, string> = {
  separadas: "Evita folgas em dias seguidos, mas cola quando é o único jeito de cobrir o setor.",
  separadasSempre: "Nunca coloca folgas em dias seguidos; se for impossível, avisa ao gerar.",
  juntas: "Procura colar as duas folgas (ex.: domingo e segunda, ou quinta e sexta), sem usar os dias sem folga.",
  semPreferencia: "O sistema decide só pela cobertura, sem tentar separar nem juntar.",
};
function prefFolgasDe(r: RegrasExtras): PrefFolgas {
  if (r.folgasSeparadas === "proibir") return "separadasSempre";
  if (r.folgasSeparadas === "evitar") return "separadas";
  if (r.folgasJuntas) return "juntas";
  if (r.folgasSemPreferencia) return "semPreferencia";
  return "separadas";
}

/** Duração que pode ficar em branco (em branco = não usar). */
function DurOpcional({ id, value, onChange, ...rest }: { id: string; value: number | null; onChange: (v: number | null) => void; "aria-label"?: string }) {
  const [txt, setTxt] = useState(value ? fmtDur(value) : "");
  useEffect(() => setTxt(value ? fmtDur(value) : ""), [value]);
  const salvar = () => {
    if (!txt.trim()) return onChange(null);
    const v = parseDur(txt);
    if (v == null || v <= 0) setTxt(value ? fmtDur(value) : "");
    else onChange(v);
  };
  return (
    <span className="inline-flex items-center gap-2">
      <input id={id} className="field tnum w-[6.5rem]" placeholder="ex.: 11h" aria-label={rest["aria-label"]} value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={salvar} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
      <span className="text-[12.5px] text-muted" id={`${id}-estado`}>
        {value ? "Respeitado ao gerar" : "Não usado"}
      </span>
    </span>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12px] font-bold uppercase tracking-wide text-muted">{titulo}</div>
      {children}
    </div>
  );
}

function Linha({ n, titulo, ajuda, children, id, onde }: { n: string; titulo: string; ajuda: string; children: React.ReactNode; id?: string; onde?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3.5" id={id}>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-[62ch]">
          <div className="text-[14px] font-semibold">
            <span className="mr-1.5 text-muted">{n}.</span>
            {titulo}
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted">{ajuda}</div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {children}
          {onde}
        </div>
      </div>
    </div>
  );
}

/**
 * "Onde vale": botão compacto ao lado da regra ("Todos os setores ▾" ou os setores escolhidos)
 * que abre uma lista de setores com caixas de marcar. Lista vazia = todos os setores.
 */
function OndeVale({ id, sel, onChange }: { id: string; sel: string[] | null | undefined; onChange: (v: string[]) => void }) {
  const { store } = useSim();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const fora = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const visiveis = store.sectors.filter((s) => !s.hidden);
  const lista = (sel ?? []).filter((x) => visiveis.some((s) => s.id === x));
  const todos = !lista.length;
  const nomes = visiveis.filter((s) => lista.includes(s.id)).map((s) => s.name);
  const resumo = todos ? "Todos os setores" : nomes.length <= 2 ? nomes.join(" e ") : `${nomes.length} setores`;
  return (
    <div className="relative" ref={ref} id={id}>
      <button
        type="button"
        id={`${id}-btn`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title={todos ? "Vale em todos os setores" : `Vale só em: ${nomes.join(", ")}`}
        className={`inline-flex max-w-[260px] items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] ${todos ? "border-line bg-surface" : "border-navy bg-surface font-semibold"}`}
      >
        <span className="text-muted">Setores:</span>
        <span className="truncate">{resumo}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-[260px] max-w-[calc(100vw-40px)] rounded-xl border border-line bg-surface p-3 shadow-lg" role="dialog" aria-label="Onde vale">
          <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted">Onde vale</div>
          <label className="flex cursor-pointer items-center gap-2 border-b border-line pb-2 text-[13.5px] font-semibold">
            <input type="checkbox" id={`${id}-todos`} checked={todos} onChange={() => onChange([])} />
            Todos os setores
          </label>
          <div className="mt-2 flex max-h-[240px] flex-col gap-1.5 overflow-y-auto">
            {visiveis.map((s) => {
              const on = lista.includes(s.id);
              return (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 text-[13.5px]">
                  <input type="checkbox" id={`${id}-${s.id}`} checked={on} onChange={() => onChange(on ? lista.filter((x) => x !== s.id) : [...lista, s.id])} />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color ?? "var(--yellow)" }} aria-hidden />
                  {s.name}
                </label>
              );
            })}
          </div>
          <div className="mt-3 flex justify-end">
            <Btn id={`${id}-ok`} onClick={() => setOpen(false)}>
              Pronto
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function Chave({ id, on, onChange, label }: { id: string; on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-[13.5px]">
      <input type="checkbox" id={id} checked={on} onChange={(e) => onChange(e.target.checked)} />
      {label ?? (on ? "Ligada" : "Desligada")}
    </label>
  );
}

/** Escolha de duplas de pessoas (do mesmo setor ou de setores diferentes). */
function Duplas({ id, pares, onChange }: { id: string; pares: [string, string][]; onChange: (p: [string, string][]) => void }) {
  const { store } = useSim();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const nome = (pid: string) => {
    const e = store.employees.find((x) => x.id === pid);
    return e ? e.name || e.func : "?";
  };
  const setorDe = (pid: string) => store.employees.find((x) => x.id === pid)?.sectorId;
  const nomeSetor = (pid: string) => store.sectors.find((s) => s.id === setorDe(pid))?.name ?? "";
  const secA = setorDe(a);
  const visiveis = store.sectors.filter((s) => !s.hidden);
  // a segunda pessoa pode ser de qualquer setor; o setor da primeira aparece primeiro
  const opcoes = (primeiro?: string) => [
    { value: "", label: "— escolher —" },
    ...[...visiveis.filter((s) => s.id === primeiro), ...visiveis.filter((s) => s.id !== primeiro)].flatMap((s) => store.employees.filter((e) => e.sectorId === s.id).map((e) => ({ value: e.id, label: `${e.name || e.func} · ${s.name}` }))),
  ];
  const validos = pares.filter(([x, y]) => store.employees.some((e) => e.id === x) && store.employees.some((e) => e.id === y));
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[420px]">
      <div className="flex flex-wrap gap-1.5">
        {validos.map(([x, y]) => (
          <span key={`${x}-${y}`} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[12.5px]" data-par={`${x}|${y}`}>
            {setorDe(x) === setorDe(y) ? (
              <>
                {nome(x)} + {nome(y)}
              </>
            ) : (
              <>
                {nome(x)} <span className="text-muted">({nomeSetor(x)})</span> + {nome(y)} <span className="text-muted">({nomeSetor(y)})</span>
              </>
            )}
            <button type="button" aria-label={`Remover ${nome(x)} e ${nome(y)}`} className="text-muted hover:text-red" onClick={() => onChange(pares.filter(([p, q]) => !(p === x && q === y)))}>
              ×
            </button>
          </span>
        ))}
        {!validos.length && <span className="text-[12.5px] text-muted">Nenhuma dupla.</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select id={`${id}-a`} aria-label="Primeira pessoa" value={a} onChange={(v: string) => (setA(v), setB(""))} options={opcoes()} />
        <span className="text-muted">+</span>
        <Select id={`${id}-b`} aria-label="Segunda pessoa" value={b} onChange={setB} options={opcoes(secA).filter((o) => !o.value || o.value !== a)} />
        <Btn
          id={`${id}-add`}
          disabled={!a || !b}
          onClick={() => {
            if (!a || !b || pares.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return;
            onChange([...pares, [a, b]]);
            setA("");
            setB("");
          }}
        >
          Adicionar dupla
        </Btn>
      </div>
    </div>
  );
}

/** 8b: quem cobre a folga de quem — "quando A estiver de folga, B vai para o turno de A" (mesmo setor). */
function Coberturas({ id, pares, onChange, setorId }: { id: string; pares: [string, string][]; onChange: (p: [string, string][]) => void; setorId?: string }) {
  const { store } = useSim();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const pessoa = (pid: string) => store.employees.find((x) => x.id === pid);
  const nome = (pid: string) => {
    const e = pessoa(pid);
    return e ? e.name || e.func : "?";
  };
  const turno = (pid: string) => {
    const e = pessoa(pid);
    return store.sectors.find((s) => s.id === e?.sectorId)?.shifts.find((x) => x.id === e?.shiftId)?.name ?? "";
  };
  const setores = store.sectors.filter((s) => !s.hidden && (!setorId || s.id === setorId));
  const opcoes = (sec?: string, sem?: string) => [
    { value: "", label: "— escolher —" },
    ...setores
      .filter((s) => !sec || s.id === sec)
      .flatMap((s) => store.employees.filter((e) => e.sectorId === s.id && e.id !== sem && e.regime !== "12x36").map((e) => ({ value: e.id, label: `${e.name || e.func} · ${s.name}${turno(e.id) ? ` (${turno(e.id)})` : ""}` }))),
  ];
  const validos = pares.filter(([x, y]) => pessoa(x) && pessoa(y));
  return (
    <div className="flex w-full flex-col gap-2 sm:w-[23rem]" id={id}>
      <div className="flex flex-col gap-1.5">
        {validos.map(([x, y]) => (
          <span key={`${x}-${y}`} className="flex items-start justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-[12.5px]" data-cobre={`${x}|${y}`}>
            <span>
              Quando <b>{nome(x)}</b> folga, <b>{nome(y)}</b> vai para o turno dela{turno(x) ? <span className="text-muted"> ({turno(x)})</span> : null}
            </span>
            <button type="button" aria-label={`Remover: ${nome(y)} cobre ${nome(x)}`} className="text-muted hover:text-red" onClick={() => onChange(pares.filter(([p, q]) => !(p === x && q === y)))}>
              ×
            </button>
          </span>
        ))}
        {!validos.length && <span className="text-[12.5px] text-muted">Ninguém escolhido.</span>}
      </div>
      <div className="flex flex-col gap-1 text-[13px]">
        <span className="text-muted">Quando</span>
        <Select id={`${id}-a`} aria-label="Pessoa que folga" value={a} onChange={(v: string) => (setA(v), setB(""))} options={opcoes()} className="w-full" />
        <span className="text-muted">estiver de folga,</span>
        <Select id={`${id}-b`} aria-label="Pessoa que vai para o turno dela" value={b} onChange={setB} options={opcoes(pessoa(a)?.sectorId, a)} className="w-full" />
        <span className="text-muted">vai para o turno dela.</span>
      </div>
      <div>
        <Btn
          id={`${id}-add`}
          disabled={!a || !b}
          onClick={() => {
            if (!a || !b || pares.some(([x, y]) => x === a && y === b)) return;
            onChange([...pares, [a, b]]);
            setA("");
            setB("");
          }}
        >
          Adicionar
        </Btn>
      </div>
    </div>
  );
}

/** Máximo de pessoas de folga por dia, por setor (em pessoas ou % da equipe). */
function LimiteFolgaSetor({ fixo }: { fixo?: string }) {
  const sim = useSim();
  const { store } = sim;
  const visiveis = store.sectors.filter((s) => !s.hidden);
  const [sid0, setSid] = useState(sim.sector.id);
  const sid = fixo ?? sid0;
  const sec = visiveis.find((s) => s.id === sid) ?? visiveis[0];
  if (!sec) return null;
  const equipe = store.employees.filter((e) => e.sectorId === sec.id).length;
  const lf = sec.limiteFolga;
  const setSec = (patch: Partial<Sector>) => sim.updateStore((st) => ({ ...st, sectors: st.sectors.map((s) => (s.id === sec.id ? { ...s, ...patch } : s)) }));
  const valores = lf?.valores ?? [null, null, null, null, null, null, null];
  return (
    <div className="flex w-full flex-col gap-2.5" id="ra-limite">
      <div className="flex flex-wrap items-center gap-2">
        {!fixo && <Select id="ra-limite-setor" aria-label="Setor" value={sec.id} onChange={setSid} options={visiveis.map((s) => ({ value: s.id, label: `${s.name} (${store.employees.filter((e) => e.sectorId === s.id).length} pessoas)` }))} />}
        <Select
          id="ra-limite-modo"
          aria-label="Como contar"
          value={lf ? lf.modo : "auto"}
          onChange={(v: string) => setSec({ limiteFolga: v === "auto" ? null : { modo: v as "pessoas" | "pct", valores } })}
          options={[
            { value: "auto", label: "Automático (o sistema ajusta ao tamanho da equipe)" },
            { value: "pessoas", label: "Em número de pessoas" },
            { value: "pct", label: "Em % da equipe" },
          ]}
        />
      </div>
      {lf && (
        <div className="flex flex-wrap items-end gap-2">
          {ORDEM_SEMANA.map((wd) => (
            <label key={wd} className="flex flex-col items-center gap-1 text-[12px] font-semibold text-muted">
              {WEEKDAY_SHORT[wd]}
              <NumInput
                id={`ra-limite-${wd}`}
                aria-label={`Máximo de folga no(a) ${WEEKDAY_SHORT[wd]}`}
                value={valores[wd]}
                allowEmpty
                placeholder="—"
                min={0}
                max={lf.modo === "pct" ? 100 : 999}
                onChange={(v) => setSec({ limiteFolga: { ...lf, valores: valores.map((x, i) => (i === wd ? v : x)) } })}
              />
              <span className="font-normal">{lf.modo === "pct" && valores[wd] != null ? `${Math.floor((equipe * (valores[wd] as number)) / 100)} p.` : lf.modo === "pct" ? "%" : "pess."}</span>
            </label>
          ))}
        </div>
      )}
      <span className="text-[12px] text-muted">{lf ? "Em branco = sem limite naquele dia. O sistema respeita esses números e não muda sozinho." : "Hoje o sistema decide e aumenta o limite quando a equipe cresce."}</span>
      <LimiteFolgaTurno sec={sec} setSec={setSec} />
    </div>
  );
}

/** Máximo de pessoas de folga por dia em cada turno (quem abre, intermediário, quem fecha — pelo horário). */
function LimiteFolgaTurno({ sec, setSec }: { sec: Sector; setSec: (patch: Partial<Sector>) => void }) {
  const { store } = useSim();
  const t = turnosDoSetor(store, sec);
  if (t.chaves.length < 2) return null;
  const lt = sec.limiteFolgaTurno ?? {};
  const muda = (c: TurnoChave, wd: number, v: number | null) => {
    const vals = (lt[c] ?? [null, null, null, null, null, null, null]).map((x, i) => (i === wd ? v : x));
    const novo = { ...lt, [c]: vals };
    const vazio = Object.values(novo).every((a) => !a || a.every((x) => x == null));
    setSec({ limiteFolgaTurno: vazio ? null : novo });
  };
  return (
    <div className="mt-1 flex flex-col gap-2" id="ra-limite-turno">
      <span className="text-[12px] font-semibold">Máximo de folgas por turno</span>
      {t.chaves.map((c, g) => (
        <div key={c} className="flex flex-wrap items-end gap-2">
          <span className="w-48 pb-2 text-[12px] font-semibold">
            {t.nomes[g]}
            {t.horarios[g].length > 0 && t.horarios[g].join(", ") !== t.nomes[g] && <span className="font-normal"> ({t.horarios[g].join(", ")})</span>}
            <span className="font-normal text-muted"> · {t.tamanhos[g]} p.</span>
          </span>
          {ORDEM_SEMANA.map((wd) => (
            <label key={wd} className="flex flex-col items-center gap-1 text-[12px] font-semibold text-muted">
              {WEEKDAY_SHORT[wd]}
              <NumInput
                id={`ra-limite-turno-${c}-${wd}`}
                aria-label={`Máximo de folga de ${t.nomes[g]} no(a) ${WEEKDAY_SHORT[wd]}`}
                value={lt[c]?.[wd] ?? null}
                allowEmpty
                placeholder="—"
                min={0}
                max={t.tamanhos[g]}
                onChange={(v) => muda(c, wd, v)}
              />
            </label>
          ))}
        </div>
      ))}
      <span className="text-[12px] text-muted">Em pessoas. Os turnos saem do horário de entrada e saída de cada um. Em branco = sem limite para o turno naquele dia.</span>
    </div>
  );
}

/** Regras extras de um alvo: a loja (setores que seguem a loja) ou um setor com regras próprias. */
function RegrasExtrasEditor({ r, set, setor }: { r: RegrasExtras; set: (patch: Partial<RegrasExtras>) => void; setor: Sector | null }) {
  const sim = useSim();
  const { store } = sim;
  const forca = (v: ForcaOuNada): Forca | null => (v === "off" ? null : v);
  const sf = r.diasSemFolgaSemana;
  const visiveis = store.sectors.filter((s) => !s.hidden);
  const nChaves = store.employees.filter((e) => e.chave && (!setor || e.sectorId === setor.id)).length;
  const nRodizio = store.sectors.filter((s) => !setor || s.id === setor.id).reduce((n, s) => n + s.shifts.filter((x) => x.rodizio && !x.special && !x.plantao).length, 0);
  const alvoGerar = setor ?? sim.sector;
  const prefFolgas = prefFolgasDe(r);
  /** "30% de 17 pessoas em Frente de Caixa = até 5 pessoas" */
  /** a conta da regra, por extenso: "8 pessoas × 30% = 2,4 → até 2 por fim de semana; em 8 fins de semana, …" */
  const fdsTxt = (pct: number, por = "por fim de semana", nome = "fins de semana inteiros") => {
    const n = sim.store.employees.filter((e) => e.sectorId === alvoGerar.id && e.regime !== "12x36").length;
    const p = Math.max(0, Math.min(100, pct));
    const conta = (p / 100) * n;
    const max = Math.floor(conta);
    const semanas = sim.store.config.weeks || 0;
    const total = max * semanas;
    const cada = n ? total / n : 0;
    const cadaTxt = cada === 0 ? "ninguém ganha" : Number.isInteger(cada) ? `${cada} para cada pessoa` : `de ${Math.floor(cada)} a ${Math.ceil(cada)} para cada pessoa`;
    return `${alvoGerar.name}: ${n} pessoas × ${p}% = ${conta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} → até ${max} ${por} (arredonda para baixo). Em ${semanas} semanas, ${total} ${nome}: ${cadaTxt}, em rodízio.`;
  };
  // na loja, cada regra ligada escolhe onde vale; num setor com regras próprias, tudo vale só nele
  const onde = (k: RegraPorSetor, ligada: boolean) =>
    !setor && ligada ? <OndeVale id={`ra-onde-${k}`} sel={r.ondeVale?.[k]} onChange={(l) => set({ ondeVale: { ...(r.ondeVale ?? {}), [k]: l } })} /> : undefined;
  return (
    <div className="mt-6 flex flex-col gap-6 border-t border-line pt-5" id="regras-extras">
      <p className="text-[13px] text-muted max-w-[95ch]">
        <b>Evitar</b>: o sistema só faz se não tiver outro jeito de cobrir o setor. <b>Proibir</b>: nunca faz; se for impossível cumprir, ele avisa o que impede ao gerar. As regras valem a partir do próximo <b>Gerar escala</b>.{" "}
        <button type="button" className="underline" id="ra-gerar" onClick={() => void sim.redistribute(alvoGerar.id)}>
          Gerar a escala de {alvoGerar.name} agora
        </button>
      </p>

      <Bloco titulo="Folgas">
        <Linha
          n="1"
          titulo="Preferência das folgas da semana"
          ajuda="Como o sistema arruma as folgas da semana de cada pessoa. Os dias sem folga (regra 2), os limites por dia e as folgas fixas são sempre respeitados, em qualquer opção; o rodízio de domingo também não muda."
          id="ra-pref-folgas-linha"
          onde={prefFolgas !== "separadas" ? <OndeVale id="ra-onde-folgasSeparadas" sel={r.ondeVale?.folgasSeparadas ?? r.ondeVale?.folgasJuntas ?? r.ondeVale?.folgasSemPreferencia} onChange={(l) => set({ ondeVale: { ...(r.ondeVale ?? {}), folgasSeparadas: l, folgasJuntas: l, folgasSemPreferencia: l } })} /> : undefined}
        >
          <div className="flex flex-col gap-1.5 sm:items-end">
            <Select id="ra-pref-folgas" aria-label="Preferência das folgas da semana" value={prefFolgas} onChange={(v: PrefFolgas) => set(PREF_FOLGAS_VALOR[v])} options={OPCOES_PREF_FOLGAS} />
            <span className="max-w-[40ch] text-[12px] text-muted sm:text-right" id="ra-pref-folgas-txt">
              {PREF_FOLGAS_TXT[prefFolgas]}
            </span>
          </div>
        </Linha>
        <Linha n="2" titulo="Dias da semana sem folga" ajuda={setor ? `Ninguém de ${setor.name} folga nesses dias (ex.: sábado).` : "Ninguém folga nesses dias (ex.: sábado). Vale para a loja toda ou só para os setores escolhidos."} onde={!setor && sf ? <OndeVale id="ra-onde-diasSemFolga" sel={sf.setores} onChange={(l) => set({ diasSemFolgaSemana: { ...sf, setores: l.length ? l : null } })} /> : undefined}>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dias sem folga">
              {ORDEM_SEMANA.map((wd) => {
                const on = !!sf?.dias.includes(wd);
                return (
                  <button
                    key={wd}
                    type="button"
                    id={`ra-dia-${wd}`}
                    aria-pressed={on}
                    onClick={() => {
                      const dias = on ? (sf?.dias ?? []).filter((x) => x !== wd) : [...(sf?.dias ?? []), wd];
                      set({ diasSemFolgaSemana: dias.length ? { dias, forca: sf?.forca ?? "proibir", setores: setor ? null : sf?.setores ?? null } : null });
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-[12.5px] font-semibold ${on ? "border-navy bg-navy text-navy-ink" : "border-line bg-surface"}`}
                  >
                    {WEEKDAY_SHORT[wd]}
                  </button>
                );
              })}
            </div>
            {sf && (
              <div className="flex flex-wrap items-center gap-2">
                <Select id="ra-dias-forca" aria-label="Força" value={sf.forca} onChange={(v: Forca) => set({ diasSemFolgaSemana: { ...sf, forca: v } })} options={OPCOES_SO_FORCA} />

              </div>
            )}
          </div>
        </Linha>
        <Linha
          n="3"
          titulo="Distribuir as folgas por igual entre os dias da semana"
          ajuda="De segunda a sábado, cada dia fica com o mesmo número de folgas (no máximo 1 de diferença entre dois dias), e as folgas de cada dia são divididas entre quem abre e quem fecha. Um dia com máximo de folgas menor (regra 3b) fica com menos. O domingo segue o rodízio de domingos."
          onde={onde("folgasDiasIguais", r.folgasDiasIguais !== false)}
        >
          <Chave id="ra-dias-iguais" on={r.folgasDiasIguais !== false} onChange={(v) => set({ folgasDiasIguais: v })} />
        </Linha>
        <Linha n="3b" titulo="Máximo de folgas por dia e por turno" ajuda={`${setor ? `Quantas pessoas de ${setor.name}` : "Quantas pessoas de cada setor"} podem folgar em cada dia da semana, em número de pessoas ou em % da equipe (ex.: no sábado, no máximo 10%). Também dá para limitar cada turno (ex.: no sábado, no máximo 1 da Abertura e 1 do Fechamento).`}>
          <LimiteFolgaSetor fixo={setor?.id} />
        </Linha>
        <Linha n="4" titulo="Revezar o dia da folga" ajuda="Evita que a mesma pessoa folgue sempre no mesmo dia da semana e divide as folgas de cada dia da semana (de segunda a sábado) por igual entre a equipe. O domingo segue o rodízio de domingos." onde={onde("rodizioDiaFolga", !!r.rodizioDiaFolga)}>
          <Chave id="ra-rodizio-dia" on={!!r.rodizioDiaFolga} onChange={(v) => set({ rodizioDiaFolga: v })} />
        </Linha>
        <Linha n="5" titulo="Um fim de semana completo por mês" ajuda="Quando a pessoa folga no domingo, o sistema procura colar outra folga no sábado ou na segunda, pelo menos uma vez a cada 4 semanas." onde={onde("fimDeSemanaMes", !!r.fimDeSemanaMes)}>
          <Chave id="ra-fds" on={!!r.fimDeSemanaMes} onChange={(v) => set({ fimDeSemanaMes: v })} />
        </Linha>
        <Linha
          n="5b"
          id="ra-sabdom-linha"
          titulo="Quem folga no domingo também folga no sábado"
          ajuda="Quem folga no domingo ganha também o sábado (o fim de semana inteiro), até o máximo de folgas do sábado (regra 3b). Se nem todos cabem, o sistema reveza para todo mundo ganhar o mesmo número de fins de semana inteiros no período (quem tem menos chances vem primeiro). Quando a semana começa na segunda, para ninguém passar de 6 dias seguidos, quem ganha o fim de semana também folga no domingo anterior. Vale mesmo com o sábado marcado como dia sem folga (regra 2). Só fica de fora quem não pode: folga travada à mão naquela semana, folga fixa ou time fixo de domingo. Com ou sem esta regra, os sábados de folga sempre se revezam entre todos."
          onde={onde("sabadoComDomingo", !!r.sabadoComDomingo)}
        >
          <Chave id="ra-sabdom" on={!!r.sabadoComDomingo} onChange={(v) => set({ sabadoComDomingo: v || null })} />
        </Linha>
        <Linha
          n="5c"
          id="ra-domseg-linha"
          titulo="Quem folga no domingo também folga na segunda"
          ajuda="Quem folga no domingo ganha também a segunda seguinte (duas folgas coladas), até a % da equipe que você escolher em cada domingo; o sistema reveza quem ganha e, se a regra 5b também estiver ligada, dá preferência a quem não ganhou o sábado. A segunda conta como uma das folgas da semana dela, e ninguém passa de 6 dias seguidos. Vale mesmo com a segunda marcada como dia sem folga (regra 2): a segunda colada ao domingo é a exceção. Quem tem folga fixa na semana ou é de time fixo de domingo só entra quando sobra a folga."
          onde={onde("segundaComDomingo", !!r.segundaComDomingo)}
        >
          <div className="flex flex-col gap-1.5 sm:max-w-[20rem] sm:items-end">
            <Chave id="ra-domseg" on={!!r.segundaComDomingo} onChange={(v) => set({ segundaComDomingo: v ? { pct: r.segundaComDomingo?.pct ?? 30 } : null })} />
            {r.segundaComDomingo && (
              <>
                <span className="inline-flex items-center gap-2 text-[13px]">
                  Até
                  <NumInput id="ra-domseg-pct" aria-label="Porcentagem da equipe com domingo e segunda juntos" value={r.segundaComDomingo.pct} min={0} max={100} onChange={(v) => v != null && set({ segundaComDomingo: { pct: v } })} />
                  % por domingo
                </span>
                <span className="text-[12px] text-muted sm:text-right" id="ra-domseg-n">
                  {fdsTxt(r.segundaComDomingo.pct, "por domingo", "pares domingo + segunda")}
                </span>
              </>
            )}
          </div>
        </Linha>
        <Linha n="6" titulo="Não emendar feriado" ajuda="No dia antes e no dia depois de um feriado, no máximo esse número de pessoas de folga por setor." onde={onde("emendaFeriado", !!r.emendaFeriado)}>
          <Select id="ra-emenda" aria-label="Não emendar feriado" value={r.emendaFeriado?.forca ?? "off"} onChange={(v: ForcaOuNada) => set({ emendaFeriado: v === "off" ? null : { forca: v, max: r.emendaFeriado?.max ?? 1 } })} options={OPCOES_FORCA} />
          {r.emendaFeriado && (
            <span className="inline-flex items-center gap-1.5 text-[13px]">
              no máximo
              <NumInput id="ra-emenda-max" aria-label="Máximo de pessoas" value={r.emendaFeriado.max} min={0} max={99} onChange={(v) => v != null && set({ emendaFeriado: { ...r.emendaFeriado!, max: v } })} />
              de folga
            </span>
          )}
        </Linha>
      </Bloco>

      <Bloco titulo="Pessoas">
        <Linha n="7" titulo="Pessoas que não folgam no mesmo dia" ajuda="Ex.: os dois fiscais, ou o encarregado e o subencarregado. A dupla pode ser de setores diferentes (ex.: o encarregado do Açougue e o da Padaria): o setor gerado por último se ajusta à escala do outro.">
          <Select id="ra-nao-juntos" aria-label="Força" value={r.naoFolgarJuntos?.forca ?? "off"} onChange={(v: ForcaOuNada) => set({ naoFolgarJuntos: { forca: forca(v), pares: r.naoFolgarJuntos?.pares ?? [] } })} options={OPCOES_FORCA} />
          <Duplas id="ra-nao-juntos-par" pares={r.naoFolgarJuntos?.pares ?? []} onChange={(pares) => set({ naoFolgarJuntos: { forca: r.naoFolgarJuntos?.forca ?? "proibir", pares } })} />
        </Linha>
        <Linha n="8" titulo="Pessoas que preferem folgar juntas" ajuda="Casais, quem divide carona, mãe e filha: o sistema procura dar a folga no mesmo dia. Pode ser gente de setores diferentes.">
          <Duplas id="ra-juntos-par" pares={r.folgarJuntos ?? []} onChange={(pares) => set({ folgarJuntos: pares })} />
        </Linha>
        <Linha
          n="8b"
          id="ra-cobre-linha"
          titulo="Quem cobre a folga de quem"
          ajuda="Quando a pessoa escolhida estiver de folga, a outra pessoa (do mesmo setor) vai para o turno dela naquele dia — ex.: o subencarregado faz o turno do encarregado na folga dele. O sistema também evita dar folga aos dois no mesmo dia. Vale na hora, inclusive quando você muda uma folga à mão; dia com turno escolhido à mão não é mexido."
        >
          <div className="flex flex-col gap-2">
            <Coberturas id="ra-cobre" setorId={setor?.id} pares={r.cobrirFolga?.pares ?? []} onChange={(pares) => set({ cobrirFolga: pares.length ? { pares, ausencias: !!r.cobrirFolga?.ausencias } : null })} />
            {!!r.cobrirFolga?.pares?.length && (
              <label className="inline-flex items-center gap-2 text-[13px]">
                <input type="checkbox" id="ra-cobre-ausencias" checked={!!r.cobrirFolga?.ausencias} onChange={(ev) => set({ cobrirFolga: { pares: r.cobrirFolga!.pares, ausencias: ev.target.checked } })} />
                Também quando estiver de férias, com falta ou atestado
              </label>
            )}
          </div>
        </Linha>
        <Linha n="9" onde={onde("pessoaChave", !!r.pessoaChave)} titulo="Sempre uma pessoa-chave trabalhando" ajuda={`Fiscal, líder, quem abre o cofre: garante esse mínimo trabalhando em cada dia, por setor. Marque quem é pessoa-chave em Equipe → mais detalhes (${nChaves} ${nChaves === 1 ? "marcada" : "marcadas"} ${setor ? `em ${setor.name}` : "nesta loja"}).`}>
          <Select id="ra-chave" aria-label="Pessoa-chave" value={r.pessoaChave?.forca ?? "off"} onChange={(v: ForcaOuNada) => set({ pessoaChave: v === "off" ? null : { forca: v, min: r.pessoaChave?.min ?? 1 } })} options={OPCOES_FORCA.map((o) => (o.value === "proibir" ? { ...o, label: "Exigir" } : o))} />
          {r.pessoaChave && (
            <span className="inline-flex items-center gap-1.5 text-[13px]">
              pelo menos
              <NumInput id="ra-chave-min" aria-label="Mínimo de pessoas-chave" value={r.pessoaChave.min} min={1} max={9} onChange={(v) => v != null && set({ pessoaChave: { ...r.pessoaChave!, min: v } })} />
              por dia
            </span>
          )}
        </Linha>
        <Linha n="10" titulo="Dividir os domingos por igual" ajuda="Ninguém trabalha mais domingos no período do que os outros; avisa quando a diferença passar de 1." onde={onde("domingosIguais", !!r.domingosIguais)}>
          <Chave id="ra-domingos" on={!!r.domingosIguais} onChange={(v) => set({ domingosIguais: v })} />
        </Linha>
      </Bloco>

      <Bloco titulo="Turnos e horas">
        <Linha n="11" titulo="Quem fecha não abre no dia seguinte" ajuda="Se a pessoa fez o turno que fecha a loja, no dia seguinte o sistema troca a abertura por outro turno do dia (quando existe)." onde={onde("fecharAbrir", !!r.fecharAbrir)}>
          <Chave id="ra-fechar-abrir" on={!!r.fecharAbrir} onChange={(v) => set({ fecharAbrir: v })} />
        </Linha>
        <Linha n="12" onde={onde("rodizioTurnos", !!r.rodizioTurnos)} titulo="Rodízio semanal de turnos" ajuda={`Os turnos marcados em Horários (“Entra no rodízio semanal”) se revezam a cada semana, para ninguém ficar sempre com o fechamento. ${nRodizio ? `${nRodizio} turnos marcados ${setor ? `em ${setor.name}` : "nesta loja"}.` : "Nenhum turno marcado ainda."}`}>
          <Chave id="ra-rodizio-turnos" on={!!r.rodizioTurnos} onChange={(v) => set({ rodizioTurnos: v })} />
        </Linha>
        <Linha n="13" titulo="Limite de horas extras por semana" ajuda="Avisa quando alguém passar das horas do contrato além deste limite numa semana." onde={onde("maxExtrasSemanaMin", r.maxExtrasSemanaMin != null)}>
          <Chave id="ra-extras-on" on={r.maxExtrasSemanaMin != null} onChange={(v) => set({ maxExtrasSemanaMin: v ? 120 : null })} label={r.maxExtrasSemanaMin != null ? "Avisar acima de" : "Desligado"} />
          {r.maxExtrasSemanaMin != null && <DurInput id="ra-extras" aria-label="Limite de horas extras por semana" value={r.maxExtrasSemanaMin} onChange={(v) => set({ maxExtrasSemanaMin: v })} />}
        </Linha>
        <Linha
          n="14"
          id="ra-descanso-linha"
          titulo="Descanso mínimo entre jornadas ao gerar"
          ajuda="Opcional. Preencha (ex.: 11h) para o sistema não escalar ninguém em dois dias seguidos com menos descanso que isso — ex.: sair às 21:24 no sábado e entrar às 08:00 no domingo. Em branco, a escala não considera o descanso (só avisa, pelo valor de referência acima)."
          onde={onde("descansoObrigatorio", !!r.descansoObrigatorio)}
        >
          <DurOpcional id="ra-descanso" aria-label="Descanso mínimo entre jornadas ao gerar" value={r.descansoObrigatorio ?? null} onChange={(v) => set({ descansoObrigatorio: v })} />
        </Linha>
      </Bloco>
    </div>
  );
}

function Ref({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
      <span className="text-[13.5px]">{label}</span>
      {children}
    </label>
  );
}

/**
 * Regras avançadas com a escolha "Para qual setor": a loja (vale para os setores que seguem a loja)
 * ou um setor, que pode seguir a loja ou ter regras próprias (valores de referência e regras extras).
 */
export function RegrasAvancadasPainel() {
  const sim = useSim();
  const { store } = sim;
  const cfg = store.config;
  const visiveis = store.sectors.filter((s) => !s.hidden);
  const [alvo, setAlvo] = useState<string>("loja");
  const setor = alvo === "loja" ? null : visiveis.find((s) => s.id === alvo) ?? null;
  const proprio = setor?.regrasProprias ?? null;
  const ref: RefValores = proprio ? proprio.ref : refDaLoja(cfg);
  // setor que segue a loja: mostra as regras da loja como valem nele (as que não valem nele aparecem desligadas)
  const r: RegrasExtras = proprio ? proprio.regras : setor ? regrasParaSetor(cfg.regras ?? {}, setor.id) ?? {} : cfg.regras ?? {};
  const mudarSetor = (fn: (p: NonNullable<Sector["regrasProprias"]>) => Sector["regrasProprias"]) =>
    setor && sim.updateStore((st) => ({ ...st, sectors: st.sectors.map((s) => (s.id === setor.id && s.regrasProprias ? { ...s, regrasProprias: fn(s.regrasProprias) } : s)) }));
  const setRef = (patch: Partial<RefValores>) => (setor ? mudarSetor((p) => ({ ...p, ref: { ...p.ref, ...patch } })) : sim.updateStore((st) => ({ ...st, config: { ...st.config, ...patch } })));
  const setRegras = (patch: Partial<RegrasExtras>) => (setor ? mudarSetor((p) => ({ ...p, regras: { ...p.regras, ...patch } })) : sim.updateStore((st) => ({ ...st, config: { ...st.config, regras: { ...(st.config.regras ?? {}), ...patch } } })));
  const seguem = visiveis.filter((s) => !s.regrasProprias);
  const proprios = visiveis.filter((s) => s.regrasProprias);
  const usarProprias = () => {
    if (!setor) return;
    // começa igual às regras da loja; "dias sem folga" passa a valer para o setor
    // regras da loja como valem neste setor (as que não valem nele começam desligadas)
    const base: RegrasExtras = JSON.parse(JSON.stringify(regrasParaSetor(cfg.regras ?? {}, setor.id) ?? {}));
    sim.updateStore((st) => ({ ...st, sectors: st.sectors.map((s) => (s.id === setor.id ? { ...s, regrasProprias: { ref: refDaLoja(st.config), regras: base } } : s)) }));
    sim.setToast(`${setor.name} agora tem regras avançadas próprias, começando iguais às da loja. Mude o que precisar; os outros setores não mudam.`);
  };
  const voltarLoja = () => {
    if (!setor) return;
    sim.updateStore((st) => ({ ...st, sectors: st.sectors.map((s) => (s.id === setor.id ? { ...s, regrasProprias: null } : s)) }));
    sim.setToast(`${setor.name} voltou a seguir as regras avançadas da loja.`);
  };
  const editavel = !setor || !!proprio;
  return (
    <div className="flex flex-col gap-4" id="ra-painel">
      <div className="flex flex-col gap-3 rounded-xl border border-navy-2 px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-[14px] font-semibold" htmlFor="ra-alvo">
            Para qual setor
          </label>
          <Select
            id="ra-alvo"
            aria-label="Para qual setor"
            value={setor ? setor.id : "loja"}
            onChange={setAlvo}
            options={[{ value: "loja", label: "Toda a loja (setores que seguem a loja)" }, ...visiveis.map((s) => ({ value: s.id, label: `${s.name} · ${s.regrasProprias ? "regras próprias" : "segue a loja"}` }))]}
          />
          {setor && proprio && <ConfirmBtn label="Voltar a seguir a loja" confirmLabel={`Confirmar: ${setor.name} segue a loja`} kind="ghost" onConfirm={voltarLoja} />}
        </div>
        <p className="text-[13px] text-muted" id="ra-alvo-info">
          {!setor
            ? seguem.length
              ? `Estas regras valem para ${seguem.length === visiveis.length ? "todos os setores" : seguem.map((s) => s.name).join(", ")}. Em cada regra ligada, escolha em “Onde vale” os setores em que ela vale.${proprios.length ? ` Com regras próprias (valores diferentes): ${proprios.map((s) => s.name).join(", ")} (escolha o setor acima para ver).` : " Para um setor ter valores diferentes (ex.: outro máximo de dias seguidos), escolha o setor acima."}`
              : "Todos os setores têm regras próprias: estas regras da loja não estão valendo para nenhum setor."
            : proprio
              ? `Regras próprias de ${setor.name}: valem só para este setor. Os outros setores não mudam.`
              : `${setor.name} segue as regras da loja (mostradas abaixo). Para mudar só neste setor, use regras próprias.`}
        </p>
        {setor && !proprio && (
          <div>
            <Btn kind="primary" id="ra-usar-proprias" onClick={usarProprias}>
              Usar regras próprias em {setor.name}
            </Btn>
          </div>
        )}
      </div>
      <fieldset disabled={!editavel} className={`min-w-0 ${editavel ? "" : "opacity-60"}`} style={{ minInlineSize: 0 }} aria-label={setor ? `Regras avançadas de ${setor.name}` : "Regras avançadas da loja"}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Ref label="Máximo de dias seguidos de trabalho">
            <NumInput id="ra-consec" value={ref.maxConsecutive} min={1} max={13} onChange={(v) => v && setRef({ maxConsecutive: v })} />
          </Ref>
          <Ref label="Folga de domingo, regra geral: 1 a cada">
            <NumInput id="ra-sunm" value={ref.sundayMaxCycleM} min={1} max={8} onChange={(v) => v && setRef({ sundayMaxCycleM: v })} />
          </Ref>
          <Ref label="Folga de domingo, mulheres: 1 a cada">
            <NumInput id="ra-sunf" value={ref.sundayMaxCycleF} min={1} max={8} onChange={(v) => v && setRef({ sundayMaxCycleF: v })} />
          </Ref>
          <Ref label="Descanso mínimo entre jornadas">
            <DurInput id="ra-rest" value={ref.minRestMin} onChange={(v) => setRef({ minRestMin: v })} />
          </Ref>
          <Ref label="Intervalo mínimo (jornada acima de 6h)">
            <DurInput id="ra-brk" value={ref.breakMinOver6h} onChange={(v) => setRef({ breakMinOver6h: v })} />
          </Ref>
          <Ref label="Intervalo máximo">
            <DurInput id="ra-brkmax" value={ref.breakMax} onChange={(v) => setRef({ breakMax: v })} />
          </Ref>
          <Ref label="Jornada diária máxima (com extras)">
            <DurInput id="ra-maxday" value={ref.maxDailyMin} onChange={(v) => setRef({ maxDailyMin: v })} />
          </Ref>
        </div>
        <RegrasExtrasEditor key={setor?.id ?? "loja"} r={r} set={setRegras} setor={setor} />
      </fieldset>
    </div>
  );
}

/** Aba própria das Regras avançadas (antes ficava dentro de Personalizar). */
export function RegrasPage({ go }: { go: (p: PageId) => void }) {
  const { store } = useSim();
  return (
    <div className="flex flex-col gap-6">
      <PageHead
        title="Regras avançadas"
        sub={`Como o sistema monta a escala de ${store.name}: folgas, domingos, turnos, limites e descanso — para a loja toda ou só para um setor. Confirme na legislação e na convenção coletiva da sua categoria antes de mudar.`}
        go={go}
        showSectors={false}
        storePicker
      />
      <Card id="regras-pagina">
        <RegrasAvancadasPainel />
      </Card>
    </div>
  );
}
