import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Escala 5x2 — Simulador",
  description: "Simulador inteligente de escala 5x2 para supermercados",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
