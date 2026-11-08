"use client";
// Pessoas no setor ao longo do dia: quantas estão trabalhando (fora do almoço) em cada momento, no setor escolhido.
// No dia de hoje, marca "agora" e se atualiza sozinho. Fica embaixo da Escala de Almoço.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardTitle } from "./SimpleApp";
import { cellCode, dayShift, isWorking } from "../engine/model";
import type { CalDay, Sector, Store } from "../engine/types";
import { fmtDateBR, fmtTime, WEEKDAY_LONG, WEEKDAY_SHORT } from "../engine/time";

const PASSO = 5; // minutos entre os pontos
const H = 240;
const M = { l: 34, r: 14, t: 16, b: 28 };

const agoraMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface Ponto {
  t: number;
  trab: number;
  almoco: number;
  /** por turno (nome do turno do dia) */
  porSetor: { nome: string; trab: number; almoco: number }[];
}

/** Quantas pessoas do setor estão trabalhando e almoçando em cada momento do dia (de 5 em 5 min), por turno. */
export function pessoasNoSetor(st: Store, sec: Sector, dia: CalDay): Ponto[] {
  const turnos: { setor: string; ini: number; fim: number; bi: number; bf: number }[] = [];
  for (const e of st.employees) {
    if (e.sectorId !== sec.id || !isWorking(cellCode(sec, e.id, dia))) continue;
    const r = dayShift(st, sec, e, dia);
    if (r.end <= r.start) continue;
    turnos.push({ setor: r.shift?.name ?? "Turno", ini: r.start, fim: r.end, bi: r.breakStart, bf: r.breakEnd });
  }
  if (!turnos.length) return [];
  const lo = Math.floor(Math.min(...turnos.map((x) => x.ini)) / 30) * 30;
  const hi = Math.ceil(Math.max(...turnos.map((x) => x.fim)) / 30) * 30;
  const out: Ponto[] = [];
  for (let t = lo; t <= hi; t += PASSO) {
    const por = new Map<string, { trab: number; almoco: number }>();
    let trab = 0;
    let almoco = 0;
    for (const x of turnos) {
      if (t < x.ini || t >= x.fim) continue;
      const s = por.get(x.setor) ?? { trab: 0, almoco: 0 };
      if (x.bf > x.bi && t >= x.bi && t < x.bf) {
        almoco++;
        s.almoco++;
      } else {
        trab++;
        s.trab++;
      }
      por.set(x.setor, s);
    }
    out.push({ t, trab, almoco, porSetor: Array.from(por.entries()).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.trab - a.trab || a.nome.localeCompare(b.nome, "pt-BR")) });
  }
  return out;
}

export function GraficoAlmoco({ st, sec, dias, multi, irParaHoje }: { st: Store; sec: Sector; dias: CalDay[]; multi: boolean; irParaHoje?: () => void }) {
  const abertos = dias.filter((d) => !d.closed);
  const hoje = hojeIso();
  const [sel, setSel] = useState<string | null>(null);
  const dia = abertos.find((d) => d.date === sel) ?? abertos.find((d) => d.date === hoje) ?? abertos[0] ?? dias[0];
  const chave = dias.map((d) => d.date).join();
  useEffect(() => setSel(null), [chave]);
  // tempo real: o "agora" anda sozinho
  const [agora, setAgora] = useState(agoraMin());
  useEffect(() => {
    const t = setInterval(() => setAgora(agoraMin()), 30_000);
    return () => clearInterval(t);
  }, []);

  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(900);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setW(Math.max(300, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(300, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  const [hover, setHover] = useState<number | null>(null);

  const pts = useMemo(() => (dia && !dia.closed ? pessoasNoSetor(st, sec, dia) : []), [st, sec, dia]);
  if (!dia) return null;
  const ehHoje = dia.date === hoje;
  const n = pts.length;
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const t0 = pts[0]?.t ?? 0;
  const t1 = pts[n - 1]?.t ?? 1;
  const x = (t: number) => M.l + ((t - t0) / Math.max(1, t1 - t0)) * pw;
  const yMax = Math.max(1, ...pts.map((p) => p.trab));
  const passoY = [1, 2, 5, 10, 20, 25, 50, 100, 200].find((k) => k * 4 >= yMax) ?? 500;
  const topo = Math.ceil(yMax / passoY) * passoY;
  const y = (v: number) => M.t + ph - (v / topo) * ph;
  const linha = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.trab).toFixed(1)}`).join(" ");
  const area = n ? `${linha} L${x(t1).toFixed(1)},${y(0)} L${x(t0).toFixed(1)},${y(0)} Z` : "";
  const idx = (t: number) => Math.max(0, Math.min(n - 1, Math.round((t - t0) / PASSO)));
  const agoraDentro = ehHoje && n > 0 && agora >= t0 && agora <= t1;
  const pAgora = agoraDentro ? pts[idx(agora)] : null;
  const pico = pts.reduce<Ponto | null>((a, p) => (!a || p.trab > a.trab ? p : a), null);
  const foco = hover != null ? pts[hover] : null;

  const resumo = !n
    ? "Ninguém trabalha neste dia."
    : pAgora
      ? `Agora (${fmtTime(agora)}): ${pAgora.trab} ${pAgora.trab === 1 ? "pessoa trabalhando" : "pessoas trabalhando"} em ${sec.name}${pAgora.almoco ? ` e ${pAgora.almoco} almoçando` : ""}.`
      : `Pico: ${pico!.trab} ${pico!.trab === 1 ? "pessoa" : "pessoas"} às ${fmtTime(pico!.t)}.`;

  return (
    <Card id={`alm-graf-${st.id}`}>
      <CardTitle sub={`${WEEKDAY_LONG[dia.weekday]}, ${fmtDateBR(dia.date)}${dia.closed ? " — loja fechada" : ""}. Quem está trabalhando em ${sec.name} a cada momento (quem está almoçando não conta). Passe o mouse para ver cada horário.`}>
        {multi ? `${st.name} · ` : ""}Pessoas trabalhando · {sec.name}
      </CardTitle>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <p className="text-[15px]" id={`alm-graf-resumo-${st.id}`} aria-live="polite">
          {pAgora ? (
            <>
              <span className="mr-2 inline-flex items-center gap-1.5 rounded-full bg-red px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden /> ao vivo
              </span>
              Agora ({fmtTime(agora)}): <b className="text-[22px] tnum">{pAgora.trab}</b> {pAgora.trab === 1 ? "pessoa trabalhando" : "pessoas trabalhando"}
              {pAgora.almoco ? <span className="text-muted"> · {pAgora.almoco} almoçando</span> : null}
            </>
          ) : (
            resumo
          )}
        </p>
        {irParaHoje && !dias.some((d) => d.date === hoje) && (
          <button type="button" id={`alm-graf-hoje-${st.id}`} className="rounded-lg border border-red px-2.5 py-1 text-[12.5px] font-semibold text-red hover:bg-surface-2" onClick={irParaHoje}>
            ● Ver agora (hoje)
          </button>
        )}
        {dias.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Dia do gráfico">
            {dias.map((d) => (
              <button
                key={d.date}
                type="button"
                role="radio"
                id={`alm-graf-dia-${st.id}-${d.date}`}
                aria-checked={d.date === dia.date}
                disabled={d.closed}
                onClick={() => setSel(d.date)}
                className={`rounded-lg border px-2.5 py-1 text-[12.5px] font-semibold disabled:opacity-40 ${d.date === dia.date ? "border-navy bg-navy text-navy-ink" : "border-line bg-surface hover:bg-surface-2"}`}
              >
                {WEEKDAY_SHORT[d.weekday]} {fmtDateBR(d.date, false)}
                {d.date === hoje ? " · hoje" : ""}
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        ref={ref}
        className="relative w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(ev) => {
          if (!n) return;
          const bx = ev.currentTarget.getBoundingClientRect();
          const px = ev.clientX - bx.left;
          if (px < M.l - 4 || px > W - M.r + 4) return setHover(null);
          setHover(idx(t0 + ((px - M.l) / pw) * (t1 - t0)));
        }}
      >
        {!n ? (
          <p className="py-10 text-center text-[13.5px] text-muted">{dia.closed ? "A loja está fechada neste dia." : "Ninguém trabalha neste dia."}</p>
        ) : (
          <>
            <svg width={W} height={H} role="img" aria-label={`Pessoas trabalhando em ${sec.name} ao longo de ${fmtDateBR(dia.date)}: ${resumo}`} className="block">
              {Array.from({ length: topo / passoY + 1 }, (_, k) => k * passoY).map((v) => (
                <g key={v}>
                  <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
                  <text x={M.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="tnum">
                    {v}
                  </text>
                </g>
              ))}
              {pts
                .filter((p) => p.t % 60 === 0 && (pw / ((t1 - t0) / 60) >= 34 || (p.t / 60) % 2 === 0))
                .map((p) => (
                  <text key={p.t} x={x(p.t)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
                    {Math.floor(p.t / 60) % 24}h
                  </text>
                ))}
              <path d={area} fill="var(--navy)" fillOpacity={0.12} />
              <path d={linha} fill="none" stroke="var(--navy)" strokeWidth={2} strokeLinejoin="round" />
              {agoraDentro && (
                <g>
                  <line x1={x(agora)} x2={x(agora)} y1={M.t} y2={y(0)} stroke="var(--red)" strokeWidth={1.5} strokeDasharray="3 3" />
                  <circle cx={x(agora)} cy={y(pAgora!.trab)} r={5} fill="var(--red)" stroke="var(--surface)" strokeWidth={2} />
                  <text x={x(agora)} y={M.t - 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--red)">
                    agora
                  </text>
                </g>
              )}
              {foco && (
                <g>
                  <line x1={x(foco.t)} x2={x(foco.t)} y1={M.t} y2={y(0)} stroke="var(--ink)" strokeOpacity={0.35} strokeWidth={1} />
                  <circle cx={x(foco.t)} cy={y(foco.trab)} r={4.5} fill="var(--navy)" stroke="var(--surface)" strokeWidth={2} />
                </g>
              )}
            </svg>
            {foco && (
              <div
                className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg"
                style={{ left: Math.min(Math.max(0, x(foco.t) + 14), W - 230), top: 0, width: 220 }}
                id={`alm-graf-dica-${st.id}`}
              >
                <span className="flex items-baseline justify-between">
                  <b className="tnum">{fmtTime(foco.t)}</b>
                  <span>
                    <b className="text-[15px] tnum">{foco.trab}</b> trabalhando
                  </span>
                </span>
                {foco.almoco > 0 && <span className="block text-right text-muted">{foco.almoco} almoçando</span>}
                {foco.porSetor.length > 0 && (
                  <span className="mt-1.5 block border-t border-line pt-1.5">
                    {foco.porSetor.slice(0, 12).map((s) => (
                      <span key={s.nome} className="flex justify-between gap-2">
                        <span className="truncate text-muted">{s.nome}</span>
                        <span className="tnum whitespace-nowrap">
                          {s.trab}
                          {s.almoco ? <span className="text-muted"> +{s.almoco} alm.</span> : null}
                        </span>
                      </span>
                    ))}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
