# Escala 5x2 — Simulador inteligente de supermercados

Aplicação web para montar, simular e otimizar escalas 5x2 (e comparar com 6x1) por loja e setor:
cadastro de pessoas e turnos, calendário de até 8 semanas, redistribuição automática de folgas,
mapa de cobertura de 15/30 minutos, alertas calculados, coringas, mapa de alocação por posto,
comparador de cenários, rede com várias lojas e exportação em Excel/PDF.

```
escala5x2/
├── web/      Next.js 15 + React 19 + TypeScript + Tailwind CSS 4 (interface e motor de cálculo)
│   ├── src/engine/      modelo, cobertura, alertas, motor de escala, cenários, alocação, dados demo
│   ├── src/components/  telas (uma página contínua com navegação por seções)
│   ├── src/storage/     persistência (servidor, página publicada ou navegador)
│   ├── tests/           testes do motor (Vitest)
│   └── scripts/build-standalone.mjs   gera a versão de arquivo único (dist/simulador-local.html)
├── desktop/  programa de computador (Electron) que empacota a interface com os dados em arquivo
├── solver/   FastAPI + Google OR-Tools CP-SAT + SQLite (otimização e persistência)
│   └── tests/           testes do serviço (pytest)
└── docker-compose.yml
```

## Duas versões

* **Completa** (`/` no Next.js, `dist/simulador-local.html`, `Escala 5x2.exe`): todas as ferramentas — mapa de 15 min,
  movimento e limite de folgas, coringas, alocação por posto, comparador 5x2 × 6x1 e rede de lojas.
* **Simples** (`/simples` no Next.js, `dist/simples-local.html`, `Escala 5x2 Simples.exe`): pensada para o gerente
  da loja. Menu lateral com Escala, Equipe, Horários, Necessidade e Personalizar; escala da semana com horários;
  três indicadores; os 3 horários mais críticos com sugestão do que fazer; mapa de 30 min; PDF da semana para o mural;
  setores próprios (criar, renomear, cor, ordem, ocultar, excluir), funcionamento, feriados, tema de cores,
  regras avançadas e cópia de segurança. O movimento de cada dia é deduzido da necessidade informada.

As duas usam o mesmo modelo de dados (e, no programa de computador, o mesmo arquivo `dados.json`).

## Como executar

### Opção 1 — Docker

```bash
docker compose up --build
# abra http://localhost:3000
```

### Opção 2 — local (desenvolvimento)

Requisitos: Node.js 20+ e Python 3.10+.

```bash
# terminal 1 — serviço de otimização e banco
cd solver
pip install -r requirements.txt
uvicorn app:app --port 8000          # banco em solver/escala.db (mude com ESCALA_DB=/caminho/escala.db)

# terminal 2 — interface
cd web
npm install
npm run dev                          # http://localhost:3000  (/api/* é encaminhado ao serviço na porta 8000)
```

Na primeira execução a loja de demonstração (60 colaboradores) é criada e gravada no banco.
Sem o serviço Python a interface continua funcionando: usa o motor local e grava no navegador
(o cabeçalho mostra onde os dados estão sendo salvos e qual motor está conectado).

### Programa de computador (Windows)

Baixe `Escala5x2-Windows.zip`, descompacte e dê dois cliques em `Escala 5x2.exe`. Funciona sem internet
e sem instalar nada; os dados ficam em `Documentos\Escala 5x2\dados.json` (com cópia de segurança).
Para gerar de novo: `cd desktop && ./build.sh` (Electron; usa o motor local).

### Versão de arquivo único

```bash
cd web && npm run build:standalone   # gera dist/simulador-local.html (abre direto no navegador)
```

## Testes

```bash
cd web && npm test                   # 19 testes do motor (inclui os testes obrigatórios da especificação)
cd solver && pip install -r requirements-dev.txt && pytest -q   # 6 testes do serviço
```

Cobertos: jornada → horários e totais; inclusão/exclusão de pessoa; folga manual → cobertura do dia;
intervalo → disponibilidade; mínimo maior → células verdes viram vermelhas; redistribuição respeita
restrições e bloqueios; domingos conforme parâmetros; ausência de dupla alocação; períodos e semanas
preservam dados; setores independentes; aviso explícito de inviabilidade; consistência de horas e
jornadas (8 pessoas × 5 dias = 40 jornadas; × 6 = 48); rede de 1.200 colaboradores consolidada em ~1 s.

## Como o motor funciona

O mesmo problema (`SolveProblem`, em `web/src/engine/solver.ts`) alimenta dois motores:

* **OR-Tools CP-SAT** (`solver/app.py`) — usado quando o serviço está conectado; busca a solução ótima
  em até 10 s, usando a solução local como ponto de partida.
* **Motor local** — gulosa ponderada pelo movimento + reparos + busca local; roda no navegador em ~100 ms.

Toda resposta passa pelo mesmo validador antes de ser aplicada. Se a escala nova não respeitar todas
as restrições obrigatórias, ela **não** é aplicada: a tela explica o que precisa mudar (e só aplica como
rascunho, com as violações destacadas, se o gestor pedir).

**Restrições obrigatórias**: número de folgas por semana (7 dias a partir da data inicial; férias,
ausências e feriado fechado reduzem a exigência); células bloqueadas; folga fixa; rodízio dominical
(ciclo fixo ou "ao menos 1 domingo a cada N" quando automático); máximo de dias seguidos;
limite semanal de horas; máximo de pessoas de folga e mínimo de pessoas por dia.

**Preferências (objetivo)**: déficit em relação ao mínimo de cada faixa de 15 min (peso 10) e ao ideal
(peso 1), multiplicados pelo movimento do dia (1, 2 ou 3,2); folgas em dias fracos; preferência de
folga variável de cada pessoa.

Alertas também verificam intervalo mínimo/máximo, jornada diária máxima, interjornada,
remanejamentos sobrepostos ou sem habilitação e o teto de cobertura dos turnos (faixas que nem com
todos trabalhando atingem o mínimo).

## Persistência

| Onde roda            | Onde os dados ficam                                      |
|----------------------|----------------------------------------------------------|
| Next.js + serviço    | SQLite do serviço (`PUT/GET/DELETE /api/stores/{id}`)     |
| Página publicada     | banco da própria página (compartilhado entre quem a usa) |
| Arquivo local        | armazenamento do navegador                               |

Gravação automática ~1 s após cada alteração; botões **Salvar** e **Recarregar** no cabeçalho.

## Situação das funcionalidades

Concluídas e integradas: todas as seções 1 a 14 da especificação, exportação Excel (escala colorida,
cobertura, pessoas, turnos, mínimos e alertas, por setor ou loja inteira) e PDF (escala de até 4 semanas,
mapa da 1ª semana e alertas), dados demonstrativos e testes.

Limitações conhecidas:

* Não há login nem perfis de acesso; gravações simultâneas na mesma loja seguem "a última vence".
* Os limites legais (rodízio dominical, interjornada, intervalos, dias seguidos) são **parâmetros
  editáveis de referência**. O sistema não presume que valem para todas as categorias: confirme na
  legislação e na convenção coletiva aplicável.
* A semana de folgas é contada em blocos de 7 dias a partir da data inicial (use um domingo para
  semanas domingo–sábado, como no vídeo). Histórico anterior ao período não entra na contagem de
  dias seguidos.
* O PDF resume as 4 primeiras semanas; o Excel traz o período completo.
* Atividades por horário são recorrentes por dia da semana; remanejamentos aceitam dia da semana ou
  data única.
* Na versão publicada como página (sem servidor Python) o CP-SAT não está disponível; o motor local
  é usado e informado na tela.
