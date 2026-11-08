// Cores da escala escolhidas pelo usuário (só aparência). Contraste do texto calculado automaticamente.
import type React from "react";
import type { ColorKey, StoreConfig } from "../engine/types";

/** Rótulos e cores originais (iguais às do tema roxo e lilás) — usadas também em PDF e Excel. */
export const COLOR_KEYS: { key: ColorKey; label: string; sample: string; def: string; cssDefault: string }[] = [
  { key: "T", label: "Trabalho", sample: "08:15–18:39", def: "#ffffff", cssDefault: "var(--surface)" },
  { key: "D", label: "Domingo/feriado trabalhado", sample: "08:15–12:15", def: "#fff1cc", cssDefault: "var(--cell-sun)" },
  { key: "F", label: "Folga", sample: "Folga", def: "#9b6be0", cssDefault: "var(--yellow)" },
  { key: "V", label: "Férias", sample: "Férias", def: "#d9e6ff", cssDefault: "var(--cell-vac)" },
  { key: "A", label: "Falta", sample: "Falta", def: "#f9d3d9", cssDefault: "var(--cell-abs)" },
  { key: "M", label: "Atestado", sample: "Atestado", def: "#ffe2c6", cssDefault: "var(--cell-sick)" },
  { key: "H", label: "Feriado (loja fechada)", sample: "Feriado", def: "#e3e8f0", cssDefault: "var(--cell-off)" },
  { key: "brk", label: "Intervalo", sample: "Intervalo", def: "#f3d36b", cssDefault: "var(--amber)" },
];
const DEF_INK: Record<ColorKey, string> = { T: "var(--ink)", D: "var(--ink)", F: "#ffffff", V: "var(--ink)", A: "var(--red)", M: "var(--cell-sick-ink)", H: "var(--muted)", brk: "var(--amber-ink)" };

/** Paleta sugerida: as cores validadas dos setores + tons claros para fundos. */
export const SWATCHES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948", "#9b6be0", "#3d1a6e", "#ffffff", "#fff1cc", "#d9e6ff", "#f9d3d9", "#e3e8f0", "#c4ead3", "#f3d36b", "#222831"];

export function isHex(c: string | undefined | null): c is string {
  return !!c && /^#[0-9a-fA-F]{6}$/.test(c);
}
function lum(hex: string) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
/** Razão de contraste WCAG entre duas cores (1 a 21). */
export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** Texto mais legível (quase preto ou branco) sobre o fundo. */
export function inkFor(bg: string) {
  return contrast(bg, "#ffffff") >= contrast(bg, "#000000") ? "#ffffff" : "#000000";
}

/** Variáveis CSS das cores da escala (personalizadas ou originais). */
export function colorVars(cfg: StoreConfig): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of COLOR_KEYS) {
    const c = cfg.colors?.[k.key];
    out[`--c-${k.key}`] = isHex(c) ? c : k.cssDefault;
    out[`--c-${k.key}-ink`] = isHex(c) ? inkFor(c) : DEF_INK[k.key];
  }
  return out;
}

/** Estilo de uma célula pelo código do dia. */
export function codeStyle(code: string): React.CSSProperties {
  const k = code === "T" || code === "D" || code === "F" || code === "V" || code === "A" || code === "M" || code === "H" ? code : "T";
  return { background: `var(--c-${k})`, color: `var(--c-${k}-ink)` };
}

/** Cor concreta (hex) para PDF/Excel. */
export function hexOf(cfg: StoreConfig, key: ColorKey): string {
  const c = cfg.colors?.[key];
  return isHex(c) ? c : COLOR_KEYS.find((k) => k.key === key)!.def;
}
export function rgbOf(cfg: StoreConfig, key: ColorKey): [number, number, number] {
  const h = hexOf(cfg, key);
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
export function inkRgb(cfg: StoreConfig, key: ColorKey): [number, number, number] {
  return inkFor(hexOf(cfg, key)) === "#ffffff" ? [255, 255, 255] : [0, 0, 0];
}

/** Mistura duas cores hex: t = 1 → a; t = 0 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((x, i) => Math.round(x * t + pb[i] * (1 - t)).toString(16).padStart(2, "0")).join("");
}
