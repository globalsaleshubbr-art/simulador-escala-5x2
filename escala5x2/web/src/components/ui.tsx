"use client";
import React, { useEffect, useRef, useState } from "react";
import { fmtDur, parseDur, WEEKDAY_SHORT } from "../engine/time";

export function Section({ id, title, subtitle, actions, children, className = "" }: { id: string; title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`bg-surface border border-line rounded-2xl p-5 sm:p-7 min-w-0 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h2 className="text-[19px] font-bold tracking-tight text-ink" style={{ textWrap: "balance" }}>
            {title}
          </h2>
          {subtitle && <div className="text-[13.5px] text-muted mt-1.5 max-w-[85ch] leading-relaxed">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

type BtnKind = "primary" | "orange" | "ghost" | "danger" | "navy" | "yellow" | "green";
export function Btn({ kind = "ghost", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind }) {
  const k: Record<BtnKind, string> = {
    primary: "bg-navy text-navy-ink hover:bg-navy-2 border border-navy",
    orange: "bg-orange text-orange-ink hover:brightness-105 border border-orange font-bold uppercase tracking-wide shadow-sm",
    ghost: "bg-surface text-ink border border-line hover:bg-surface-2",
    danger: "bg-surface text-red border border-line hover:bg-pink",
    navy: "bg-navy-2 text-navy-ink border border-navy-muted/30 hover:bg-navy",
    yellow: "bg-yellow text-yellow-ink border border-yellow font-bold uppercase tracking-wide hover:brightness-105",
    green: "bg-green text-green-ink border border-green font-bold uppercase tracking-wide hover:brightness-110",
  };
  return (
    <button
      type="button"
      {...p}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-[13.5px] font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${k[kind]} ${className}`}
    />
  );
}

export function NumInput({ value, onChange, min, max, step = 1, className = "", id, allowEmpty, placeholder, ...rest }: { value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; className?: string; id?: string; allowEmpty?: boolean; placeholder?: string; "aria-label"?: string }) {
  const [txt, setTxt] = useState(value == null ? "" : String(value));
  useEffect(() => setTxt(value == null ? "" : String(value)), [value]);
  return (
    <input
      id={id}
      className={`field tnum w-14 text-right ${className}`}
      inputMode="numeric"
      value={txt}
      placeholder={placeholder}
      aria-label={rest["aria-label"]}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        if (txt.trim() === "" && allowEmpty) return onChange(null);
        let n = Number(txt.replace(",", "."));
        if (!isFinite(n)) return setTxt(value == null ? "" : String(value));
        if (min != null) n = Math.max(min, n);
        if (max != null) n = Math.min(max, n);
        n = Math.round(n / step) * step;
        onChange(n);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function TimeInput({ value, onChange, className = "", id, ...rest }: { value: string; onChange: (v: string) => void; className?: string; id?: string; "aria-label"?: string }) {
  return <input id={id} type="time" step={60} className={`field tnum ${className}`} value={value} aria-label={rest["aria-label"]} onChange={(e) => e.target.value && onChange(e.target.value)} />;
}

export function DurInput({ value, onChange, className = "", id, ...rest }: { value: number; onChange: (v: number) => void; className?: string; id?: string; "aria-label"?: string }) {
  const [txt, setTxt] = useState(fmtDur(value));
  useEffect(() => setTxt(fmtDur(value)), [value]);
  return (
    <input
      id={id}
      className={`field tnum w-[4.5rem] ${className}`}
      value={txt}
      aria-label={rest["aria-label"]}
      title="Ex.: 8h24, 8:24 ou 8.4"
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        const v = parseDur(txt);
        if (v == null || v < 0) setTxt(fmtDur(value));
        else onChange(v);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function TextInput({ value, onChange, className = "", placeholder, id, ...rest }: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string; id?: string; "aria-label"?: string }) {
  const [txt, setTxt] = useState(value);
  useEffect(() => setTxt(value), [value]);
  return (
    <input
      id={id}
      className={`field ${className}`}
      value={txt}
      placeholder={placeholder}
      aria-label={rest["aria-label"]}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => txt !== value && onChange(txt)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function WeekdayPicker({ value, onChange, idPrefix }: { value: number[]; onChange: (v: number[]) => void; idPrefix: string }) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="inline-flex rounded-md border border-line overflow-hidden" role="group">
      {order.map((d) => {
        const on = value.includes(d);
        return (
          <button
            id={`${idPrefix}-${d}`}
            key={d}
            type="button"
            aria-pressed={on}
            title={WEEKDAY_SHORT[d]}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
            className={`w-8 py-1.5 text-[11.5px] font-semibold border-r border-line last:border-r-0 ${on ? "bg-navy text-navy-ink" : "bg-surface text-muted hover:bg-surface-2"}`}
          >
            {WEEKDAY_SHORT[d].slice(0, 1)}
            <span className="sr-only">{WEEKDAY_SHORT[d]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function daysLabel(days: number[]): string {
  const s = [...days].sort().join(",");
  if (s === "1,2,3,4,5") return "Seg a sex";
  if (s === "1,2,3,4,5,6") return "Seg a sáb";
  if (s === "0,1,2,3,4,5,6") return "Todos os dias";
  if (s === "0,6") return "Fim de semana";
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d)).map((d) => WEEKDAY_SHORT[d]).join(", ") || "—";
}

/** Botão que pede confirmação na própria página (sem confirm()). */
export function ConfirmBtn({ label, confirmLabel = "Confirmar", onConfirm, kind = "danger", className = "", title }: { label: React.ReactNode; confirmLabel?: string; onConfirm: () => void; kind?: BtnKind; className?: string; title?: string }) {
  const [ask, setAsk] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (t.current) clearTimeout(t.current);
  }, []);
  if (!ask)
    return (
      <Btn
        kind={kind}
        className={className}
        title={title}
        onClick={() => {
          setAsk(true);
          t.current = setTimeout(() => setAsk(false), 4000);
        }}
      >
        {label}
      </Btn>
    );
  return (
    <Btn
      kind="danger"
      className={`!bg-red !text-red-ink ${className}`}
      onClick={() => {
        setAsk(false);
        onConfirm();
      }}
    >
      {confirmLabel}
    </Btn>
  );
}

export function Pill({ children, tone = "neutral", className = "" }: { children: React.ReactNode; tone?: "neutral" | "red" | "green" | "amber" | "navy" | "yellow"; className?: string }) {
  const t = {
    neutral: "bg-surface-2 text-muted border-line",
    red: "bg-red text-red-ink border-red",
    green: "bg-green text-green-ink border-green",
    amber: "bg-amber text-amber-ink border-amber",
    navy: "bg-navy text-navy-ink border-navy",
    yellow: "bg-yellow text-yellow-ink border-yellow",
  }[tone];
  return <span className={`inline-flex items-center rounded px-1.5 py-[1px] text-[10.5px] font-bold uppercase tracking-wide border ${t} ${className}`}>{children}</span>;
}

export function Select<T extends string | number>({ value, onChange, options, className = "", id, ...rest }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string; id?: string; "aria-label"?: string }) {
  return (
    <select
      id={id}
      aria-label={rest["aria-label"]}
      className={`field ${className}`}
      value={String(value)}
      onChange={(e) => {
        const opt = options.find((o) => String(o.value) === e.target.value);
        if (opt) onChange(opt.value);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
