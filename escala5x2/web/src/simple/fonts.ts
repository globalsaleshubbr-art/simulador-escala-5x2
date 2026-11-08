// Fontes da interface (embutidas no programa; funcionam sem internet). Só mudam a aparência.
export const FONTS: { id: string; label: string; note: string; stack: string }[] = [
  { id: "plex", label: "IBM Plex Sans", note: "sóbria e profissional", stack: '"IBM Plex Sans", "Segoe UI", Arial, sans-serif' },
  { id: "barlow", label: "Barlow", note: "de varejo, como placa de loja", stack: 'Barlow, "Segoe UI", Arial, sans-serif' },
  { id: "source", label: "Source Sans 3", note: "clássica e muito legível", stack: '"Source Sans 3", "Segoe UI", Arial, sans-serif' },
  { id: "nunito", label: "Nunito Sans", note: "arredondada e leve", stack: '"Nunito Sans", "Segoe UI", Arial, sans-serif' },
  { id: "tahoma", label: "Tahoma", note: "a fonte anterior", stack: 'Tahoma, Verdana, "Segoe UI", Geneva, sans-serif' },
];
export const DEFAULT_FONT = "plex";
export function fontStack(id: string | undefined): string {
  return (FONTS.find((f) => f.id === (id ?? DEFAULT_FONT)) ?? FONTS[0]).stack;
}
