"use client";
import { MARCA_ALT, MARCA_PROP, MARCA_SRC } from "./marca";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAlmocosEmDia } from "./almocoAuto";
import { useCoberturaEmDia } from "./coberturaAuto";
import { demoStoreWithTeams } from "./logic";
import { SimProvider, useSim } from "../components/state";
import { usarAjusteAutomaticoDeFolgas } from "../engine/solver";

// versão simplificada: o limite de folgas por dia (escondido) acompanha o tamanho da equipe
usarAjusteAutomaticoDeFolgas(true);
import { weekdayOf } from "../engine/time";
import { EscalaPage } from "./EscalaPage";
import { EquipePage, HorariosPage, NecessidadePage } from "./TeamPages";
import { PersonalizarPage } from "./Personalizar";
import { RegrasPage } from "./RegrasAvancadas";
import { DomingosPage } from "./Domingos";
import { AlmocoPage } from "./Almoco";
import { DASH_TABS, DashboardsPage, type DashTab } from "./Dashboards";
import { FeriasPage } from "./Ferias";
import { LojasPage } from "./Lojas";
import { StoreFilter } from "./StoreFilter";
import { colorVars } from "./colors";
import { fontStack } from "./fonts";

export type PageId = "escala" | "equipe" | "domingos" | "almoco" | "dashboards" | "ferias" | "horarios" | "necessidade" | "regras" | "lojas" | "personalizar";

export const THEMES: Record<string, { label: string; vars: Record<string, string> }> = {
  roxo: { label: "Roxo e lilás", vars: { "--navy": "#3d1a6e", "--navy-2": "#5a2d96", "--yellow": "#9b6be0", "--orange": "#8b5cf6", "--focus": "#7c3aed" } },
  azul: { label: "Azul", vars: { "--navy": "#12306b", "--navy-2": "#1f4a9c", "--yellow": "#3f7be0", "--orange": "#2f6fed", "--focus": "#2f6fed" } },
  verde: { label: "Verde", vars: { "--navy": "#0f4d3a", "--navy-2": "#17694f", "--yellow": "#2f9e74", "--orange": "#1f8a5f", "--focus": "#1f8a5f" } },
  vinho: { label: "Vinho", vars: { "--navy": "#5a1430", "--navy-2": "#7d1f45", "--yellow": "#b0456f", "--orange": "#9d2b57", "--focus": "#9d2b57" } },
  grafite: { label: "Grafite", vars: { "--navy": "#222831", "--navy-2": "#39404c", "--yellow": "#5d6a7e", "--orange": "#4b5563", "--focus": "#4b5563" } },
};

const NAV: { id: PageId; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "escala", label: "Escala", hint: "Quem trabalha e onde falta gente", icon: <Icon d="M4 6h16M4 6v13h16V6M8 3v5m8-5v5M4 11h16" /> },
  { id: "equipe", label: "Equipe", hint: "Pessoas de cada setor", icon: <Icon d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-6 9c0-3.3 2.7-5 6-5s6 1.7 6 5m1-9a3 3 0 1 0 0-6m2 15c0-2.5-1-4-3-4.6" /> },
  { id: "domingos", label: "Domingos", hint: "Quem trabalha e em qual horário", icon: <Icon d="M4 6h16M4 6v13h16V6M8 3v5m8-5v5M9 15l2 2 4-4" /> },
  { id: "almoco", label: "Escala de Almoço", hint: "Intervalos e quem fica no posto", icon: <Icon d="M7 3v8m-3-8v5a3 3 0 0 0 6 0V3M7 11v10m10-18c-2 2-3 5-3 8h3v10" /> },
  { id: "dashboards", label: "Dashboards", hint: "Faltas, atestados, equipe e lojas", icon: <Icon d="M4 4h7v8H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 14h7v6H4z" /> },
  { id: "ferias", label: "Férias", hint: "Quem sai quando", icon: <Icon d="M3 21h18M12 4v12M12 4c-4 0-7 2.5-8 6h16c-1-3.5-4-6-8-6zm0 0c-1.5 1.5-2.5 3.5-2.5 6M12 4c1.5 1.5 2.5 3.5 2.5 6" /> },
  { id: "horarios", label: "Horários", hint: "Turnos e intervalos", icon: <Icon d="M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /> },
  { id: "necessidade", label: "Fluxo alto", hint: "Quantos você precisa", icon: <Icon d="M4 20V10m6 10V4m6 16v-7m4 7H2" /> },
  { id: "regras", label: "Regras avançadas", hint: "Folgas, domingos, turnos e limites", icon: <Icon d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" /> },
  { id: "lojas", label: "Lojas", hint: "Cadastrar e organizar lojas", icon: <Icon d="M3 10l1.5-5h15L21 10M3 10h18M3 10v10h18V10M9 20v-6h6v6M3 10c0 1.7 1.3 3 3 3s3-1.3 3-3m0 0c0 1.7 1.3 3 3 3s3-1.3 3-3m0 0c0 1.7 1.3 3 3 3s3-1.3 3-3" /> },
  { id: "personalizar", label: "Personalizar", hint: "Setores, loja e aparência", icon: <Icon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8-3 2-1-1-3-2 .2-1.5-1.5L17.7 4l-3-1-1 2h-3.4l-1-2-3 1 .2 2.2L5 7.7 3 7.5 2 10.5l2 1V13l-2 1 1 3 2-.2L6.5 18l-.2 2.2 3 1 1-2h3.4l1 2 3-1-.2-2.2L18 16.5l2 .2 1-3-2-1z" /> },
];

function Icon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** Página e aba (dashboards) a partir do endereço. Endereços antigos #faltas e #atestados abrem o dashboard. */
function readRoute(): { page: PageId; tab: DashTab } {
  if (typeof window === "undefined") return { page: "escala", tab: "faltas" };
  const [h, sub] = window.location.hash.replace("#", "").split(/[:/]/);
  if (h === "faltas" || h === "atestados") return { page: "dashboards", tab: h };
  const tab = (DASH_TABS.some((t) => t.id === sub) ? sub : "faltas") as DashTab;
  return { page: NAV.some((n) => n.id === h) ? (h as PageId) : "escala", tab };
}
function readHash(): PageId {
  return readRoute().page;
}

function Shell() {
  const sim = useSim();
  // regra: mudou o horário de alguém (turno, almoço, domingo, horários do turno, folgas…), os almoços de todas as
  // lojas e setores ficam em dia na hora, qualquer que seja a tela aberta
  const paresAlmoco = useMemo(() => sim.stores.flatMap((st) => st.sectors.map((sec) => ({ st, sec }))), [sim.stores]);
  useAlmocosEmDia(paresAlmoco);
  // regra 8b: o substituto vai para o turno de quem folga assim que a folga muda
  useCoberturaEmDia(sim.stores);
  const [page, setPage] = useState<PageId>(readHash());
  // Ctrl+Z (ou Cmd+Z no Mac) desfaz a última mudança, fora dos campos de texto
  const simAtalho = useSim();
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      simAtalho.setToast(simAtalho.desfazer() ? "Mudança desfeita: voltou a como estava antes." : "Não há nada para desfazer.");
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [simAtalho]);
  // no celular o menu rola para o lado: mostra uma sombra com seta enquanto houver itens escondidos à direita
  const navRef = useRef<HTMLElement>(null);
  const [maisMenu, setMaisMenu] = useState(false);
  const medirMenu = () => {
    const n = navRef.current;
    if (n) setMaisMenu(n.scrollWidth - n.clientWidth - n.scrollLeft > 8);
  };
  useEffect(() => {
    medirMenu();
    window.addEventListener("resize", medirMenu);
    return () => window.removeEventListener("resize", medirMenu);
  }, []);
  useEffect(() => {
    // a página aberta fica visível no menu do celular
    const n = navRef.current;
    const b = n?.querySelector<HTMLElement>("[aria-current='page']");
    if (n && b && n.scrollWidth > n.clientWidth) n.scrollTo({ left: Math.max(0, b.offsetLeft - 24), behavior: "smooth" });
    setTimeout(medirMenu, 350);
  }, [page]);
  const [dashTab, setDashTab] = useState<DashTab>(readRoute().tab);
  useEffect(() => {
    const on = () => {
      setPage(readHash());
      setDashTab(readRoute().tab);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = (p: PageId) => {
    try {
      window.location.hash = p;
    } catch {
      /* ok */
    }
    setPage(p);
    window.scrollTo({ top: 0 });
  };
  const theme = THEMES[sim.store.config.theme ?? "roxo"] ?? THEMES.roxo;
  const visible = sim.store.sectors.filter((s) => !s.hidden);
  // cores antigas dos setores → paleta validada (mesma ordem, sem repetir)
  useEffect(() => {
    const OLD = ["#7c3aed", "#db2777", "#0891b2", "#ea580c", "#16a34a", "#ca8a04", "#2563eb", "#9333ea", "#475569", "#dc2626"];
    const needs = (x: { color?: string; hidden?: boolean }) => !x.hidden && (!x.color || OLD.includes(x.color));
    if (!sim.store.sectors.some(needs)) return;
    const PAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
    // mantém as cores já válidas e dá as próximas da paleta para quem não tem
    sim.updateStore((st) => {
      const used = new Set(st.sectors.filter((x) => !needs(x) && x.color).map((x) => x.color));
      let i = 0;
      const next = () => {
        for (let k = 0; k < PAL.length; k++) {
          const c = PAL[(i + k) % PAL.length];
          if (!used.has(c)) {
            used.add(c);
            i = (i + k + 1) % PAL.length;
            return c;
          }
        }
        return PAL[i++ % PAL.length];
      };
      return { ...st, sectors: st.sectors.map((x) => (needs(x) ? { ...x, color: next() } : x)) };
    });
  }, [sim.store.sectors, sim]);
  // dados antigos sem preferência de início da semana: fica o dia em que o período já começa (nada é refeito)
  useEffect(() => {
    if (sim.store.config.weekStart != null) return;
    sim.updateStore((st) => ({ ...st, config: { ...st.config, weekStart: weekdayOf(st.config.startDate) === 0 ? 0 : 1 } }));
  }, [sim.store.config.weekStart, sim]);
  // lojas antigas sem regra de domingo: ficam com a regra individual (a que já valia), sem refazer nada.
  // Para passar para "domingo sim, domingo não", o usuário escolhe em Personalizar (com confirmação).
  useEffect(() => {
    if (sim.store.config.sundayRule != null) return;
    sim.updateStore((st) => ({ ...st, config: { ...st.config, sundayRule: "individual" } }));
  }, [sim.store.config, sim]);
  // setor atual oculto: vai para o primeiro visível
  useEffect(() => {
    if (sim.sector.hidden && visible[0]) sim.setSectorId(visible[0].id);
  }, [sim.sector, visible, sim]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]" style={{ ...(theme.vars as React.CSSProperties), "--yellow-ink": "#ffffff", "--orange-ink": "#ffffff", "--navy-ink": "#ffffff", "--navy-muted": "#ffffff", ...colorVars(sim.store.config), "--font-ui": fontStack(sim.store.config.font), fontFamily: "var(--font-ui)" } as React.CSSProperties}>
      <aside className="bg-navy text-navy-ink lg:sticky lg:top-0 lg:h-screen flex flex-col z-30" style={{ paddingLeft: "max(0px, env(safe-area-inset-left, 0px))" }}>
        <div className="marca-topo px-5 pt-5 pb-4 lg:pt-7">
          <div className="flex items-center gap-3 lg:flex-col lg:items-stretch lg:gap-2.5" id="marca">
            <img src={MARCA_SRC} alt={MARCA_ALT} width={480} height={250} className="marca-img h-12 w-auto shrink-0 rounded-lg lg:h-auto lg:w-full lg:rounded-xl" style={{ aspectRatio: `1 / ${MARCA_PROP}` }} />
            <div className="text-[13px] font-bold uppercase leading-tight tracking-[0.08em] opacity-90 lg:text-center">
              Simulador <br className="lg:hidden" />
              Escala 5x2
            </div>
          </div>
          <div className="mt-4">
            <StoreFilter />
          </div>
        </div>
        <div className="relative lg:contents">
        <nav ref={navRef} onScroll={medirMenu} aria-label="Menu" className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto lg:min-h-0 px-3 pb-3 lg:pb-0">
          {NAV.map((n) => {
            const on = n.id === page;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => go(n.id)}
                aria-current={on ? "page" : undefined}
                className={`nav-item flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left transition ${on ? "bg-yellow text-yellow-ink shadow-sm" : "hover:bg-navy-2"}`}
              >
                {n.icon}
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-bold">{n.label}</span>
                  <span className="nav-hint hidden lg:block text-[11.5px] opacity-90">{n.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>
        {maisMenu && (
          <button
            type="button"
            id="menu-mais"
            aria-label="Ver mais opções do menu"
            onClick={() => navRef.current?.scrollBy({ left: 240, behavior: "smooth" })}
            className="absolute right-0 top-0 bottom-3 flex w-14 items-center justify-end bg-gradient-to-l from-navy via-navy/90 to-transparent pr-2 text-[22px] font-bold text-navy-ink lg:hidden"
          >
            ›
          </button>
        )}
        </div>
        <div className="mt-auto hidden lg:block px-5 py-5 text-[12px] border-t border-white/15">
          <div className="flex items-center gap-2" role="status">
            <span className={`h-2 w-2 rounded-full ${sim.saveState === "error" ? "bg-red" : sim.saveState === "saving" ? "bg-amber" : "bg-green"}`} aria-hidden />
            {sim.saveState === "saving" ? "Salvando…" : sim.saveState === "error" ? "Erro ao salvar" : sim.savedAt ? `Salvo às ${sim.savedAt}` : "Tudo salvo"}
          </div>
          <div className="mt-1 opacity-90">{sim.adapter?.label}</div>
        </div>
      </aside>
      <div className="min-w-0">
        <main className="mx-auto max-w-[1280px] py-7 lg:py-9 flex flex-col gap-7" style={{ paddingLeft: "max(20px, env(safe-area-inset-left, 0px))", paddingRight: "max(20px, env(safe-area-inset-right, 0px))" }}>
          {page === "escala" && <EscalaPage go={go} />}
          {page === "equipe" && <EquipePage go={go} />}
          {page === "domingos" && <DomingosPage go={go} />}
          {page === "almoco" && <AlmocoPage go={go} />}
          {page === "dashboards" && <DashboardsPage go={go} tab={dashTab} />}
          {page === "ferias" && <FeriasPage go={go} />}
          {page === "horarios" && <HorariosPage go={go} />}
          {page === "necessidade" && <NecessidadePage go={go} />}
          {page === "lojas" && <LojasPage go={go} />}
          {page === "regras" && <RegrasPage go={go} />}
          {page === "personalizar" && <PersonalizarPage go={go} />}
        </main>
      </div>
      <Toast />
    </div>
  );
}

function Toast() {
  const sim = useSim();
  const { toast, setToast } = sim;
  // o aviso que vem logo depois de uma mudança oferece desfazer
  const [comDesfazer, setComDesfazer] = useState(false);
  useEffect(() => {
    setComDesfazer(!!toast && sim.podeDesfazer && Date.now() - sim.ultimaMudanca() < 2500 && !/desfeit/i.test(toast));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);
  if (!toast) return null;
  return (
    <div className="fixed z-50 max-w-[min(640px,calc(100vw-40px))] rounded-xl bg-navy text-navy-ink px-5 py-3 text-[13.5px] shadow-lg flex items-center gap-3" style={{ right: "max(20px, env(safe-area-inset-right, 0px))", bottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }} role="status">
      <span className="min-w-0">{toast}</span>
      {comDesfazer && (
        <button
          type="button"
          id="toast-desfazer"
          className="shrink-0 rounded-lg border border-white/40 px-3 py-1 font-bold hover:bg-white/10"
          onClick={() => {
            if (sim.desfazer()) setToast("Mudança desfeita: a escala voltou a como estava antes.");
          }}
        >
          Desfazer
        </button>
      )}
      <button type="button" onClick={() => setToast(null)} aria-label="Fechar">
        ×
      </button>
    </div>
  );
}

/** Cabeçalho de página com seletor de setor. */
export function PageHead({ title, sub, go, actions, showSectors = true, storePicker = false }: { title: string; sub?: React.ReactNode; go: (p: PageId) => void; actions?: React.ReactNode; showSectors?: boolean; /** escolher a loja que esta tela edita */ storePicker?: boolean }) {
  const sim = useSim();
  const visible = sim.store.sectors.filter((s) => !s.hidden);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold tracking-tight" style={{ textWrap: "balance" }}>
            {title}
          </h1>
          {sub && <p className="mt-1.5 text-[14px] text-muted max-w-[75ch] leading-relaxed">{sub}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {showSectors && (
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Setores">
          {storePicker && sim.stores.length > 1 && (
            <label className="mr-2 inline-flex items-center gap-2 text-[13px] font-semibold text-muted">
              Loja
              <select id="head-store" className="field !py-1.5" value={sim.store.id} onChange={(e) => {
                  sim.setStoreSel([e.target.value]);
                  sim.setStoreId(e.target.value);
                }}
                title="Loja que esta tela edita">
                {sim.stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {visible.map((s) => {
            const on = s.id === sim.sector.id;
            const n = sim.store.employees.filter((e) => e.sectorId === s.id).length;
            const prob = sim.sectorSummaries[s.id]?.problems ?? 0;
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={on}
                type="button"
                onClick={() => sim.setSectorId(s.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13.5px] font-semibold transition ${on ? "bg-navy text-navy-ink border-navy" : "bg-surface border-line hover:border-navy-2"}`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color ?? "var(--yellow)" }} aria-hidden />
                {s.name}
                <span className={`text-[12px] font-normal ${on ? "" : "text-muted"}`}>{n}</span>
                {prob > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red" aria-label={`${prob} problemas`} />}
              </button>
            );
          })}
          <button type="button" onClick={() => go("personalizar")} className="rounded-full border border-dashed border-line px-4 py-2 text-[13.5px] text-muted hover:text-ink hover:border-navy-2">
            + Setor
          </button>
        </div>
      )}
    </div>
  );
}

export function Card({ children, className = "", id, style }: { children: React.ReactNode; className?: string; id?: string; style?: React.CSSProperties }) {
  return (
    <section id={id} style={style} className={`rounded-2xl border border-line bg-surface p-6 sm:p-7 min-w-0 ${className}`}>
      {children}
    </section>
  );
}

export function CardTitle({ children, sub, actions }: { children: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[18px] font-bold">{children}</h2>
        {sub && <p className="mt-1 text-[13.5px] text-muted leading-relaxed max-w-[80ch]">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </div>
  );
}

export default function SimpleApp() {
  return (
    <SimProvider seed={() => demoStoreWithTeams()}>
      <Shell />
    </SimProvider>
  );
}
