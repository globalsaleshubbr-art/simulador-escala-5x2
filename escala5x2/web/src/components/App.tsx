"use client";
import React from "react";
import { SimProvider, useSim } from "./state";
import { Header, StickyNav } from "./Header";
import { Alerts, Indicators, RunBanner } from "./Overview";
import { CalendarSection } from "./Calendar";
import { CoverageMap, MovementTable } from "./Coverage";
import { MinRulesTable, ShiftsTable } from "./Config";
import { PeopleTable } from "./People";
import { AllocationSection, JokersSection } from "./Operations";
import { NetworkSection, ScenarioSection } from "./Strategy";

function Toast() {
  const { toast, setToast } = useSim();
  if (!toast) return null;
  return (
    <div className="fixed z-50 rounded-lg bg-navy text-navy-ink px-4 py-2.5 text-[13px] shadow-lg flex items-center gap-3" style={{ right: "max(16px, env(safe-area-inset-right, 0px))", bottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }} role="status">
      {toast}
      <button type="button" className="text-navy-muted hover:text-navy-ink" onClick={() => setToast(null)} aria-label="Fechar">
        ×
      </button>
    </div>
  );
}

class Boundary extends React.Component<{ name: string; children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="rounded-xl border border-red bg-pink p-4 text-[13px]" role="alert">
        <strong>{this.props.name}:</strong> esta seção encontrou um erro ({this.state.err.message}). Os dados continuam salvos.{" "}
        <button type="button" className="underline" onClick={() => this.setState({ err: null })}>
          Tentar de novo
        </button>
      </div>
    );
  }
}
const B = ({ name, children }: { name: string; children: React.ReactNode }) => <Boundary name={name}>{children}</Boundary>;

function Page() {
  return (
    <>
      <Header />
      <StickyNav />
      <main className="mx-auto max-w-[1500px] py-7 flex flex-col gap-7" style={{ paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}>
        <B name="Indicadores"><Indicators /></B>
        <B name="Aviso"><RunBanner /></B>
        <B name="Alertas"><Alerts /></B>
        <B name="Calendário"><CalendarSection /></B>
        <B name="Movimento"><MovementTable /></B>
        <B name="Mapa de cobertura"><CoverageMap /></B>
        <div className="grid gap-7 min-[1700px]:grid-cols-2 items-start">
          <B name="Turnos"><ShiftsTable /></B>
          <B name="Mínimos"><MinRulesTable /></B>
        </div>
        <B name="Pessoas"><PeopleTable /></B>
        <B name="Coringas"><JokersSection /></B>
        <B name="Alocação"><AllocationSection /></B>
        <B name="Cenários"><ScenarioSection /></B>
        <B name="Rede"><NetworkSection /></B>
        <footer className="py-6 text-center text-[11.5px] text-muted">
          Escala 5x2 · Simulador inteligente de supermercados. Os parâmetros legais são referências editáveis; confirme sempre a legislação e a convenção coletiva aplicáveis.
        </footer>
      </main>
      <Toast />
    </>
  );
}

export default function App() {
  return (
    <SimProvider>
      <Page />
    </SimProvider>
  );
}
