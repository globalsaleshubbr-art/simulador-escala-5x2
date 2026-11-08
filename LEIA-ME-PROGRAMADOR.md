# Simulador Escala 5x2 — código-fonte

Guia rápido para quem vai dar manutenção. O comportamento esperado de cada tela e regra está em
`docs/Especificacao-Funcional-Escala-5x2.md` (especificação funcional completa, com histórico de pedidos no capítulo 11).

## O que está aqui

```
Escala5x2-Codigo-Fonte/
├── escala5x2/
│   ├── web/                 ← o sistema (React 19 + TypeScript + Tailwind 4; Next.js só para o modo servidor)
│   │   ├── src/engine/      motor: modelo de dados (types.ts), escala/folgas (solver.ts), regras avançadas (regras.ts),
│   │   │                    turnos (turnos.ts), almoço (almoco.ts), cobertura e alertas (coverage.ts, analysis.ts), demo (seed.ts)
│   │   ├── src/simple/      telas da versão "Simples" (a que está em uso): SimpleApp.tsx (menu e rotas),
│   │   │                    EscalaPage, TeamPages (Equipe, Horários, Fluxo alto), Domingos, Almoco, Dashboards,
│   │   │                    Ferias, RegrasAvancadas, Lojas, Personalizar…
│   │   ├── src/components/  estado global (state.tsx: carregar, salvar, gerar escala), exportações PDF/Excel, UI
│   │   ├── src/storage/     onde os dados ficam (ver "Dados" abaixo)
│   │   ├── scripts/build-standalone.mjs   gera o sistema como arquivo HTML único (dist/)
│   │   ├── tests/           testes do motor (Vitest)
│   │   └── e2e/             testes de navegador (Playwright/Python) que simulam o usuário
│   ├── solver/              serviço opcional em Python (FastAPI + OR-Tools) — não é usado pela versão publicada
│   └── desktop/             programa de computador da versão "completa" antiga (não é a usada hoje)
├── desktop-simples/         programa de computador (Electron) da versão Simples — Windows e Mac
└── docs/                    especificação funcional
```

A pasta `src/components/App.tsx` e afins são da primeira versão ("simulador completo"); a versão em uso é a **Simples**
(`src/simple/`, entrada em `src/standalone-simple.tsx`). As duas usam o mesmo motor (`src/engine/`).

## Como rodar

Requisitos: Node.js 20+ (testado com 22). Python 3.10+ só para os testes de navegador.

```bash
cd escala5x2/web
npm install
npm run build:standalone      # gera dist/simples.html, dist/simples-local.html e dist/simples-desktop.html
```

Abra `dist/simples-local.html` direto no navegador: o sistema funciona sem servidor e grava no próprio navegador
(localStorage, chave `escala5x2:v1:stores`). Para desenvolver com recarga automática: `npm run dev` e abra
`http://localhost:3000/simples`.

## Testes

```bash
cd escala5x2/web
npx vitest run                 # 191 testes do motor (≈1 min)
npx tsc --noEmit               # checagem de tipos
pip install playwright && python3 -m playwright install chromium
npm run build:standalone && python3 e2e/run_all.py    # 39 roteiros de navegador (≈40 min); detalhes em e2e/README.md
```

## Dados

`src/storage/storage.ts` escolhe onde gravar, nesta ordem:

1. **Programa de computador** (Electron): `Documentos/Escala 5x2/dados.json`, com cópia de segurança.
2. **Servidor Python** (`solver/`), se estiver rodando.
3. **Página publicada no Claude** (`ArtifactDbAdapter`): banco compartilhado da página, coleções `stores/{loja}` e
   `sectordata/{loja}__{setor}`. É onde estão os dados reais de hoje.
4. **Navegador** (localStorage), nos demais casos.

Os dados reais **não** vão neste pacote. Para levar os dados para outro lugar: no sistema, Personalizar → Dados →
baixar a cópia de segurança (JSON com todas as lojas) e restaurar lá.

## Gerar os programas de Windows e Mac

```bash
cd desktop-simples
npm install
./empacotar.sh                 # gera Escala5x2-Simples-Windows.zip, -Mac-AppleSilicon.zip e -Mac-Intel.zip
```

O script compila o `web`, copia `dist/simples-desktop.html` para `app/index.html` e empacota com o Electron.
Os apps de Mac são assinados só de forma "ad-hoc" (no Mac, o usuário abre com botão direito → Abrir; ver LEIA-ME-Mac.txt).

## Situação do código neste pacote

- Versão publicada mais recente: **94** (Regras avançadas em aba própria no menu).
- **Pronto no código, ainda não publicado:** tela "Necessidade" renomeada para "Fluxo alto" e aviso das Regras avançadas
  retirado de Personalizar (a especificação já descreve isso como versão 95).
- **Em andamento, ainda não publicado:** divisão proporcional das folgas entre os turnos (abertura, intermediário,
  fechamento…) — `excessoTurnos`, `PROP_TURNO` e o passo "divisão proporcional" em `src/engine/solver.ts`, mais a linha
  "Folgas divididas entre os turnos" no relatório da geração (`EscalaPage.tsx`). Os testes do motor passam; faltam um
  teste próprio em `tests/` e rodar os testes de navegador.
- Pendências e pontos a decidir estão no capítulo 11 da especificação (tabelas PD-xx e OB-xx).
