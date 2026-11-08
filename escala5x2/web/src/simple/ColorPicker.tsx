"use client";
import React, { useEffect, useRef } from "react";
import { SWATCHES, codeStyle, isHex } from "./colors";

/** Escolha de cor: paleta + cor personalizada (+ opção "sem cor" quando permitido). */
export function ColorPicker({ value, onChange, allowNone, label, id, align = "left", compact }: { value?: string; onChange: (c: string | undefined) => void; allowNone?: boolean; label: string; id?: string; align?: "left" | "right"; /** só a amostra, sem o código da cor */ compact?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  // fecha ao clicar fora ou ao apertar Esc
  useEffect(() => {
    const out = (e: MouseEvent) => ref.current?.open && !ref.current.contains(e.target as Node) && (ref.current.open = false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && ref.current?.open && (ref.current.open = false);
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", out);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  const pick = (c: string | undefined) => {
    onChange(c);
    if (ref.current) ref.current.open = false;
  };
  return (
    <details className="relative" ref={ref}>
      <summary
        className="list-none cursor-pointer inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px]"
        aria-label={label}
        id={id}
      >
        <span className="h-5 w-5 rounded-md border border-line" style={{ background: isHex(value) ? value : "repeating-linear-gradient(45deg,var(--surface) 0 3px,var(--line) 3px 5px)" }} aria-hidden />
        {compact ? null : isHex(value) ? value.toUpperCase() : "Padrão"}
      </summary>
      <div className={`absolute z-30 mt-2 w-[236px] ${align === "right" ? "right-0" : "left-0"} rounded-xl border border-line bg-surface p-3 shadow-lg`}>
        <div className="grid grid-cols-6 gap-2">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              onClick={() => pick(c)}
              className="h-7 w-7 rounded-md border border-line"
              style={{ background: c, outline: value?.toLowerCase() === c ? "2px solid var(--ink)" : undefined, outlineOffset: 2 }}
            />
          ))}
        </div>
        <label className="mt-3 flex items-center justify-between gap-2 text-[12.5px] text-muted">
          Cor personalizada
          <input type="color" value={isHex(value) ? value : "#9b6be0"} onChange={(e) => onChange(e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-line bg-surface" />
        </label>
        {allowNone && (
          <button type="button" className="mt-2 text-[12.5px] underline text-muted hover:text-ink" onClick={() => pick(undefined)}>
            Usar a cor padrão
          </button>
        )}
      </div>
    </details>
  );
}

const LEGEND: Record<string, string> = { T: "Trabalho", D: "Domingo/feriado trabalhado", F: "Folga", V: "Férias", A: "Falta", M: "Atestado", H: "Feriado" };
/** Legenda das cores da escala (usa as cores escolhidas em Personalizar). */
export function ColorLegend({ codes = ["T", "D", "F", "V", "A", "M"], children }: { codes?: string[]; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-muted" aria-label="Legenda das cores">
      {codes.map((c) => (
        <span key={c} className="inline-flex items-center gap-2">
          <i className={`inline-flex h-5 w-6 items-center justify-center rounded text-[11px] font-bold not-italic ${c === "T" ? "border border-line" : ""}`} style={codeStyle(c)}>
            {c}
          </i>
          {LEGEND[c]}
        </span>
      ))}
      {children}
    </div>
  );
}
