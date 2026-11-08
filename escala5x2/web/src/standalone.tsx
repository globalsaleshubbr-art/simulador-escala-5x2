// Ponto de entrada da versão de arquivo único (sem Next.js), usada para publicar o simulador como página.
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./components/App";

const el = document.getElementById("root");
if (el) createRoot(el).render(<App />);
