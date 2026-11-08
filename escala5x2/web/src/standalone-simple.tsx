// Ponto de entrada da versão simplificada em arquivo único.
import React from "react";
import { createRoot } from "react-dom/client";
import SimpleApp from "./simple/SimpleApp";

const el = document.getElementById("root");
if (el) createRoot(el).render(<SimpleApp />);
