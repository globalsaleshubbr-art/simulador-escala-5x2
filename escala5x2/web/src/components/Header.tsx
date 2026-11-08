"use client";
import React, { useState } from "react";
import { useSim } from "./state";
import { Btn, DurInput, NumInput, TimeInput, TextInput } from "./ui";
import { fmtDateBR, fmtDur, nextSunday } from "../engine/time";
import { exportExcel, exportPDF } from "./exporters";
import { saveFile } from "../storage/storage";

function Chip({ label, children, hint }: { label?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-navy-muted/30 bg-navy-2 px-3.5 py-1.5 font-mono text-[12.5px] text-navy-ink" title={hint}>
      {label && <span className="text-navy-muted">{label}</span>}
      {children}
    </div>
  );
}

const navyField = "!bg-transparent !border-0 !text-navy-ink !p-0 font-mono text-[12px] focus:!outline-yellow";

export function Header() {
  const sim = useSim();
  const { store, sector, stores, updateStore } = sim;
  const cfg = store.config;
  const setCfg = (patch: Partial<typeof cfg>) => updateStore((s) => ({ ...s, config: { ...s.config, ...patch } }));
  const [exporting, setExporting] = useState<string | null>(null);

  const doExport = async (kind: "xlsx" | "pdf", scope: "sector" | "store") => {
    setExporting(kind);
    try {
      const blob = kind === "xlsx" ? await exportExcel(store, scope === "sector" ? sector.id : null) : await exportPDF(store, scope === "sector" ? sector.id : null);
      const base = `escala-${store.name}-${scope === "sector" ? sector.name : "loja"}-${cfg.startDate}`.toLowerCase().replace(/[^a-z0-9à-ú-]+/gi, "-");
      const r = await saveFile(`${base}.${kind}`, blob);
      sim.setToast(r === "saved" ? `Arquivo ${kind.toUpperCase()} gerado.` : r === "declined" ? "Download cancelado." : "Não foi possível baixar o arquivo nesta visualização.");
    } catch (e) {
      sim.setToast(`Falha ao exportar: ${(e as Error).message}`);
    } finally {
      setExporting(null);
    }
  };

  const presets = [
    { label: "42h · 8h24/dia", f: 2, d: 504, w: 2520 },
    { label: "40h · 8h00/dia", f: 2, d: 480, w: 2400 },
    { label: "6x1 · 44h · 7h20/dia", f: 1, d: 440, w: 2640 },
  ];

  return (
    <header className="bg-navy text-navy-ink" style={{ paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}>
      <div className="mx-auto max-w-[1500px] py-7 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <nav aria-label="Rede, loja, setor e período" className="flex flex-wrap items-center gap-1.5 text-navy-muted">
            <span className="uppercase tracking-wider text-[10.5px]">Rede</span>
            <TextInput id="hdr-network" aria-label="Nome da rede" className="field-navy w-40" value={store.network} onChange={(v) => updateStore((s) => ({ ...s, network: v }))} />
            <span aria-hidden>→</span>
            <span className="uppercase tracking-wider text-[10.5px]">Loja</span>
            <select id="hdr-store" aria-label="Loja" className="field-navy" value={store.id} onChange={(e) => sim.setStoreId(e.target.value)}>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span aria-hidden>→</span>
            <span className="uppercase tracking-wider text-[10.5px]">Setor</span>
            <select id="hdr-sector" aria-label="Setor" className="field-navy" value={sector.id} onChange={(e) => sim.setSectorId(e.target.value)}>
              {store.sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span aria-hidden>→</span>
            <span className="uppercase tracking-wider text-[10.5px]">Período</span>
            <span className="font-mono text-navy-ink">
              {fmtDateBR(cfg.startDate)} · {cfg.weeks} sem.
            </span>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-navy-muted" role="status">
              <span className={`inline-block h-2 w-2 rounded-full ${sim.saveState === "error" ? "bg-red" : sim.saveState === "saving" ? "bg-yellow" : "bg-green"}`} aria-hidden />
              {sim.saveState === "saving" ? "Salvando…" : sim.saveState === "error" ? "Erro ao salvar" : sim.savedAt ? `Salvo às ${sim.savedAt}` : "Pronto"}
              <span className="hidden sm:inline">· {sim.adapter?.label}</span>
            </span>
            <Btn kind="navy" onClick={sim.saveNow}>
              Salvar
            </Btn>
            <Btn kind="navy" onClick={sim.reload} title="Recarrega os dados salvos">
              Recarregar
            </Btn>
            <div className="inline-flex rounded-md overflow-hidden border border-navy-muted/30">
              <Btn kind="navy" className="!rounded-none !border-0" disabled={!!exporting} onClick={() => doExport("xlsx", "sector")} title="Exporta escala, cobertura, pessoas e turnos do setor">
                {exporting === "xlsx" ? "Gerando…" : "Excel do setor"}
              </Btn>
              <Btn kind="navy" className="!rounded-none !border-0 !border-l !border-navy-muted/30" disabled={!!exporting} onClick={() => doExport("xlsx", "store")}>
                Excel da loja
              </Btn>
              <Btn kind="navy" className="!rounded-none !border-0 !border-l !border-navy-muted/30" disabled={!!exporting} onClick={() => doExport("pdf", "sector")}>
                {exporting === "pdf" ? "Gerando…" : "PDF"}
              </Btn>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-muted">Escala 5x2 — Simulador inteligente de supermercados</p>
            <h1 className="mt-0.5 text-[28px] sm:text-[34px] font-bold leading-tight tracking-tight" style={{ textWrap: "balance" }}>
              Escala {cfg.folgasPorSemana === 2 ? "5x2" : `${7 - cfg.folgasPorSemana}x${cfg.folgasPorSemana}`} · <span className="text-navy-ink">{store.name}</span>
            </h1>
            <p className="mt-1 max-w-[78ch] text-[13.5px] text-navy-muted leading-snug">
              Simulador de <strong className="text-navy-ink">{sector.name}</strong> a partir de {fmtDateBR(cfg.startDate)}. Mude turnos, pessoas e folgas e veja na hora quem trabalha, quantas horas faz e onde falta gente.
            </p>
          </div>
          <Btn kind="yellow" className="!px-5 !py-2.5 !text-[14px]" onClick={() => sim.redistribute()} disabled={sim.running}>
            {sim.running ? "Gerando…" : `Gerar escala ${cfg.folgasPorSemana === 2 ? "5x2" : ""}`}
          </Btn>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Chip label="Folgas" hint="Folgas semanais por pessoa">
            <NumInput id="cfg-folgas" aria-label="Folgas por semana" className={`${navyField} w-6`} value={cfg.folgasPorSemana} min={1} max={3} onChange={(v) => v != null && setCfg({ folgasPorSemana: v })} />
            <span className="text-navy-muted">por semana</span>
          </Chip>
          <Chip label="Jornada" hint="Jornada diária padrão dos turnos (turnos com jornada própria não mudam)">
            <DurInput id="cfg-daily" aria-label="Jornada diária" className={`${navyField} w-12`} value={cfg.dailyMin} onChange={(v) => setCfg({ dailyMin: v })} />
            <span className="text-navy-muted">/dia</span>
          </Chip>
          <Chip label="Semana" hint="Limite semanal de horas">
            <DurInput id="cfg-weekly" aria-label="Limite semanal" className={`${navyField} w-12`} value={cfg.weeklyMaxMin} onChange={(v) => setCfg({ weeklyMaxMin: v })} />
            <span className="text-navy-muted">máx.</span>
          </Chip>
          <Chip label="Seg a sáb">
            <TimeInput id="cfg-open" aria-label="Abertura" className={navyField} value={cfg.open} onChange={(v) => setCfg({ open: v })} />
            <span className="text-navy-muted">–</span>
            <TimeInput id="cfg-close" aria-label="Fechamento" className={navyField} value={cfg.close} onChange={(v) => setCfg({ close: v })} />
          </Chip>
          <Chip label="Domingo">
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input id="cfg-sunday" type="checkbox" checked={cfg.sundayOpen} onChange={(e) => setCfg({ sundayOpen: e.target.checked })} className="accent-[var(--yellow)]" />
              <span className="text-navy-muted">{cfg.sundayOpen ? "abre" : "fechado"}</span>
            </label>
            {cfg.sundayOpen && (
              <>
                <TimeInput id="cfg-sun-open" aria-label="Abertura domingo" className={navyField} value={cfg.sundayStart} onChange={(v) => setCfg({ sundayStart: v })} />
                <span className="text-navy-muted">–</span>
                <TimeInput id="cfg-sun-close" aria-label="Fechamento domingo" className={navyField} value={cfg.sundayEnd} onChange={(v) => setCfg({ sundayEnd: v })} />
              </>
            )}
          </Chip>
          <Chip label="Início">
            <input id="cfg-start" type="date" aria-label="Data inicial" className={navyField} value={cfg.startDate} onChange={(e) => e.target.value && setCfg({ startDate: e.target.value })} />
          </Chip>
          <Chip label="Setor">
            <span className="text-navy-ink">{sector.name}</span>
          </Chip>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-navy-muted">Cenário:</span>
          {presets.map((p) => {
            const on = cfg.folgasPorSemana === p.f && cfg.dailyMin === p.d && cfg.weeklyMaxMin === p.w;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setCfg({ folgasPorSemana: p.f, dailyMin: p.d, weeklyMaxMin: p.w })}
                className={`rounded-full px-4 py-1.5 font-mono text-[12.5px] border ${on ? "bg-yellow text-yellow-ink border-yellow font-bold" : "border-navy-muted/40 text-navy-ink hover:bg-navy-2"}`}
              >
                {p.label}
              </button>
            );
          })}
          <span className="text-navy-muted">Domingo trabalhado usa o turno de domingo do setor; {fmtDur(cfg.dailyMin)} × {7 - cfg.folgasPorSemana} dias = {fmtDur(cfg.dailyMin * (7 - cfg.folgasPorSemana))}.</span>
        </div>
      </div>
    </header>
  );
}

export function StickyNav() {
  const sim = useSim();
  const { store, sector, sectorSummaries } = sim;
  const links = [
    ["indicadores", "Indicadores"],
    ["alertas", "Alertas"],
    ["calendario", "Calendário"],
    ["movimento", "Movimento"],
    ["cobertura", "Cobertura"],
    ["turnos", "Turnos"],
    ["minimos", "Mínimos"],
    ["pessoas", "Pessoas"],
    ["coringas", "Coringas"],
    ["alocacao", "Alocação"],
    ["cenarios", "5x2 × 6x1"],
    ["rede", "Rede"],
  ];
  return (
    <div className="sticky z-30 border-b border-line bg-surface/95 backdrop-blur no-print" style={{ top: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto max-w-[1500px]" style={{ paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}>
        <div className="scroll-x">
          <div role="tablist" aria-label="Setores" className="flex gap-1.5 pt-2 min-w-max">
            {store.sectors.map((s) => {
              const sm = sectorSummaries[s.id];
              const on = s.id === sector.id;
              return (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => sim.setSectorId(s.id)}
                  className={`relative whitespace-nowrap px-4 pb-3 pt-2.5 text-[13.5px] font-semibold border-b-2 ${on ? "border-navy text-ink" : "border-transparent text-muted hover:text-ink"}`}
                >
                  {s.name}
                  {sm && sm.people > 0 && <span className="ml-1 text-[11px] font-normal text-muted tnum">{sm.people}</span>}
                  {sm && sm.people > 0 && (
                    <span
                      className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${sm.problems ? "bg-red" : "bg-green"}`}
                      title={sm.problems ? `${sm.problems} problema(s)` : "Sem problemas"}
                      aria-label={sm.problems ? `${sm.problems} problemas` : "sem problemas"}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="scroll-x border-t border-line">
          <nav aria-label="Seções" className="flex gap-5 py-2.5 text-[12.5px] min-w-max">
            {links.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="text-muted hover:text-ink font-medium">
                {label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

export { nextSunday };
