// Gera versões de arquivo único (sem servidor):
//   dist/simulador.html / simulador-local.html / desktop.html  → versão completa
//   dist/simples.html   / simples-local.html   / simples-desktop.html → versão simplificada
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync("dist", { recursive: true });
const apiUrl = process.env.ESCALA_API_URL || "";
execSync("npx @tailwindcss/cli -i src/app/globals.css -o dist/standalone.css --minify", { stdio: "inherit" });
// fontes embutidas (funcionam sem internet): latin, pesos 400/600/700. Licença OFL em fonts/LICENSE-*.
const FONT_FILES = [
  ["IBM Plex Sans", "ibm-plex-sans"],
  ["Barlow", "barlow"],
  ["Source Sans 3", "source-sans-3"],
  ["Nunito Sans", "nunito-sans"],
];
const fontCss = FONT_FILES.flatMap(([family, file]) =>
  [400, 600, 700].map(
    (w) => `@font-face{font-family:"${family}";font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${readFileSync(`fonts/${file}-latin-${w}-normal.woff2`).toString("base64")}) format("woff2")}`,
  ),
).join("");
const css = (fontCss + readFileSync("dist/standalone.css", "utf8")).replace(/<\/style/gi, "<\\/style");

async function bundle(entry) {
  const res = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    write: false,
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(apiUrl),
      "process.env.NEXT_PUBLIC_STANDALONE": '"1"',
    },
    external: ["canvg", "html2canvas", "dompurify"],
    logLevel: "warning",
  });
  return res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
}

async function emit(entry, base, title, description) {
  const js = await bundle(entry);
  const page = `<title>${title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="${description}">
<style>${css}</style>
<div id="root"></div>
<script>${js}</script>
`;
  writeFileSync(`dist/${base}.html`, page);
  const full = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${title}</title><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
  writeFileSync(`dist/${base}-local.html`, full);
  writeFileSync(`dist/${base === "simulador" ? "desktop" : base + "-desktop"}.html`, full);
  console.log(`dist/${base}.html ${(page.length / 1024).toFixed(0)} KB`);
}

await emit("src/standalone.tsx", "simulador", "Simulador de Escala 5x2", "Simulador inteligente de escala 5x2 para supermercados");
await emit("src/standalone-simple.tsx", "simples", "Simulador Escala 5x2", "Escala de trabalho simplificada para supermercados");
