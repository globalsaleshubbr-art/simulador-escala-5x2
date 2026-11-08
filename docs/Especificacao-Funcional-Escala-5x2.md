# Simulador Escala 5x2 — Documentação Funcional

| Item | Conteúdo |
|---|---|
| Produto | **Simulador Escala 5x2** — marca Fábrica de Líderes (@rafaelhaddad1) (menu: logo e "SIMULADOR ESCALA 5X2"; programa de computador: "Escala 5x2 Simples") |
| Tipo de documento | Documentação funcional de referência para desenvolvimento, testes e homologação |
| Base | Leitura completa do protótipo (telas, componentes, motor de cálculo, armazenamento e programa de computador) e histórico de pedidos e decisões da construção, incluindo os relatórios de ajustes enviados pelo usuário (outubro de 2026, "Atualização 2.0" e "28/10/2026 – Atualizações") |
| Versão documentada | Página publicada "Simulador Escala 5x2" (versão 95) e os programas "Escala 5x2 Simples" para Windows e Mac (Apple Silicon e Intel) gerados do mesmo código |
| Data | 07/11/2026 |
| Substitui | Especificação funcional de 21/10/2026 (versão 23 do protótipo) |

---

## 0. Como ler este documento

### 0.1 Escopo

Este documento descreve a **versão simplificada** do simulador, que é a publicada e a que recebeu todos os refinamentos. A primeira versão construída (o "simulador completo") ainda existe no código e usa o mesmo motor de cálculo; ela é citada no Apêndice B e **não** é especificada aqui.

O documento descreve o que o protótipo faz **hoje**. Ele não propõe melhorias. Quando o comportamento atual parece não corresponder ao que foi pedido, isso é registrado como ponto pendente (seção 11), sem sugerir solução.

### 0.2 Marcadores de situação

| Marcador | Significado |
|---|---|
| **[SIMULADO]** | Implementado e funcionando no protótipo. O texto descreve o que o código faz hoje. |
| **[MOTOR-SEM-TELA]** | Existe no modelo de dados e é aplicado pelo motor, mas a versão simplificada não tem tela para criar ou editar o dado. Só aparece por dados de demonstração, cópias ou importação. |
| **[DEFINIDO-NÃO-IMPLEMENTADO]** | Comportamento combinado ou previsto, mas não simulado. |
| **[FICTÍCIO]** | Dado inventado só para demonstração. Não é regra de negócio. |
| **[INFERIDO]** | Regra que o protótipo aplica, mas que veio de uma interpretação feita durante a construção e precisa de confirmação do negócio. |
| **[PENDENTE]** | Ponto em aberto: decisão a tomar ou comportamento observado que precisa ser confirmado. |

**Sem marcador, vale [SIMULADO].** Um marcador no título de uma seção vale para toda a seção.

### 0.3 Convenções

- **Horários** em 24h (`HH:MM`). O código guarda horários em minutos desde 00:00.
- **Durações** como `8h24`, `42h`, `1h30`. Os campos de duração aceitam `8h24`, `8:24` ou número de horas com decimal (`8.4` ou `8,4`).
- **Datas** como `dd/mm/aaaa` ou `dd/mm`. Internamente `AAAA-MM-DD`, tratadas sem fuso horário.
- **Dias da semana** de 0 a 6: 0 = domingo, 1 = segunda … 6 = sábado. A exibição vai de segunda a domingo.
- **Textos entre aspas** ("Gerar escala") são os textos exatos da interface. `{chaves}` marcam partes variáveis (`{setor}`, `{pessoa}`, `N`).
- **Identificadores** de regra: RN-XXX-nn (regra de negócio), FL-nn (fluxo), EX-nn (exemplo de cálculo), CT-nn (caso de teste), IN-nn (regra inferida), PD-nn (ponto pendente), OB-nn (comportamento observado a confirmar).
- **"Refazer a escala"** significa apagar as células não fixadas (férias, faltas, atestados e dias fixados à mão ficam) e deixar o preenchimento automático montar de novo (RN-GER-16). É diferente de "Gerar escala" (RN-GER-02).

### 0.4 Sumário

1. Visão geral do produto
2. Modelo de dados
3. Regras de negócio
4. Telas (4.1 estrutura comum; 4.2 Escala; 4.3 Equipe; 4.4 Domingos; 4.5 Escala de Almoço; 4.6 Dashboards; 4.7 Férias; 4.8 Horários; 4.9 Fluxo alto; 4.10 Lojas; 4.11 Filtro de lojas; 4.12 Personalizar)
5. Fluxos de navegação e uso
6. Validações, estados, transições e permissões
7. Relações e dependências
8. Mensagens, erros e exceções
9. Entradas e saídas por operação
10. Cenários de homologação
11. Situação das funcionalidades, histórico e pendências
- Apêndice A — Loja de demonstração
- Apêndice B — Outras versões e artefatos

---

## 1. Visão geral do produto

### 1.1 Propósito

O simulador monta e mantém a **escala de trabalho** dos colaboradores de um supermercado, setor por setor (Frente de Caixa, Açougue, Padaria etc.) e loja por loja. O modelo principal é o **5x2** (cinco dias de trabalho e duas folgas por semana). No mesmo setor também convivem pessoas em **6x1**, em **12x36** (plantão dia sim, dia não) e em **jornadas cadastradas** (ex.: meio período). O sistema:

- distribui as folgas automaticamente, cumprindo as regras obrigatórias (folgas por semana, limite semanal de horas, dias seguidos, regra de domingo, folgas fixas, dias fixados à mão, dias sem folga);
- busca cobrir a **necessidade de pessoas por horário** informada pelo usuário, em faixas de 30 minutos;
- distribui os **almoços** (intervalos) para não esvaziar o posto;
- mostra onde falta gente, em que datas e por quê, com sugestões do que fazer;
- controla domingos (rodízio 1x1, 2x1, 3x1, 4x1 ou regra por pessoa), feriados, férias, faltas e atestados;
- gera PDFs e planilhas para uso na loja.

### 1.2 Objetivos

1. Reduzir o trabalho manual de montar a escala: um clique em "Gerar escala" produz uma escala válida, já com os almoços distribuídos.
2. Mostrar a cobertura real de pessoas no posto a cada 30 minutos, descontando intervalos, entradas e saídas no meio da faixa, folgas, férias, faltas e atestados.
3. Permitir ajustes manuais (trocar folga, lançar férias, falta ou atestado, escolher o turno de um domingo, mudar um almoço) que o sistema respeita quando gera de novo.
4. Distribuir domingos e folgas de forma equilibrada, inclusive entre os turnos de cada setor.
5. Dar ao RH controle de faltas, atestados e férias (rankings, saldo, vencimento).
6. Atender uma ou várias lojas, com cópia de estrutura e de escala entre lojas e setores.
7. Produzir saídas para a loja: PDF da semana, PDF do mês, escala individual por colaborador, planilhas Excel e cópia de segurança.

### 1.3 Público

Quem monta a escala da loja ou do setor: o histórico cita o "dono de supermercado ou quem trabalha em um", o gerente ou encarregado responsável pela escala e o RH (os relatórios de ajustes falam em "conferência do RH" e em o "RH conseguir incluir ou atualizar colaboradores em lote"). **O protótipo não tem login, perfis nem permissões** (6.6; PD-01).

### 1.4 Escopo funcional

| Módulo (menu) | Dica no menu | O que cobre | Seção |
|---|---|---|---|
| Escala | "Quem trabalha e onde falta gente" | Gerar escala, avisos, indicadores, onde falta gente, Semana, Cobertura da semana, Escalonar intervalos, Mês, Limpar escala, Copiar escala, Desfazer | 4.2 |
| Equipe | "Pessoas de cada setor" | Cadastro e edição das pessoas, modelo do setor, rodízio de domingos, alteração em massa, adicionar várias, importação por planilha | 4.3 |
| Domingos | "Quem trabalha e em qual horário" | Escala de cada domingo (quem trabalha, em qual turno, quem folga), turno de domingo habitual, copiar domingo, modelos de domingo | 4.4 |
| Escala de Almoço | "Intervalos e quem fica no posto" | Grade do dia por meia hora, edição de início e fim do intervalo, sugestões, distribuição automática | 4.5 |
| Dashboards | "Faltas, atestados, equipe e lojas" | Rankings de faltas e de atestados, colaboradores por setor/função, resumo das lojas | 4.6 |
| Férias | "Programação, saldo e vencimento" | Programar férias, mapa anual, saldo e vencimentos, regras de férias da loja | 4.7 |
| Horários | "Turnos e intervalos" | Turnos normais, plantões 12x36, turnos de domingo e feriado, janelas de intervalo | 4.8 |
| Fluxo alto (antes "Necessidade") | "Quantos você precisa" | Faixas de necessidade por grupo de dias, dias específicos e datas especiais | 4.9 |
| Lojas | "Cadastrar e organizar lojas" | Criar (uma ou várias), duplicar, renomear, excluir lojas; quais aparecem nas telas | 4.10 |
| Personalizar | "Setores, loja e aparência" | Empresa e loja, setores, funcionamento e jornada, modelo por setor, regra de domingo, jornadas, feriados e dias sem folga, aparência, cores da escala, regras avançadas, dados | 4.12 |
| (transversal) | — | Motor de geração e validação, cobertura, alertas, armazenamento, exportações | 3 |

### 1.5 Fora do escopo do protótipo

- **Login, perfis e permissões:** não existem.
- **Integração com ponto eletrônico, folha de pagamento ou sistemas de RH:** não existe. A importação de colaboradores é por planilha (4.3.6).
- **Remanejamentos (uma pessoa contando em outro setor por um horário), atividades que não contam no posto, coringas e postos:** existem no modelo e no motor, sem tela na versão simplificada [MOTOR-SEM-TELA]. "Pode ajudar em" (habilitações) é gravado, sem efeito na escala.
- **"Ideal" de pessoas por faixa e "mínimo de pessoas trabalhando no dia":** existem no motor, sem tela [MOTOR-SEM-TELA]. (O máximo de pessoas de folga por dia tem tela em Regras avançadas, regra 3.)
- **Envio da escala aos colaboradores:** o PDF individual é gerado, mas não é enviado. A dica do botão cita "imprimir ou mandar no WhatsApp" apenas como uso pretendido.
- **Banco de horas, pedidos e trocas de folga entre colaboradores, custo da folha:** não existem.

### 1.6 Formas de uso e distribuição

O mesmo código gera as variantes abaixo. Todas têm as mesmas telas; muda onde os dados ficam (RN-DAD-01).

| Variante | Como se usa | Onde os dados ficam | Rodapé do menu |
|---|---|---|---|
| Página publicada | Link da página; dados compartilhados entre quem tem acesso | Banco da página publicada | "Salvo nesta página (compartilhado)" |
| Página local | Arquivo `.html` aberto no navegador | Armazenamento daquele navegador | "Salvo neste navegador" |
| Programa para Windows | "Escala 5x2 Simples.exe" (pasta compactada; não precisa instalar nem de internet) | `Documentos\Escala 5x2\dados.json` + `dados.backup.json` | "Salvo no computador" |
| Programa para Mac | "Escala 5x2 Simples" (Apple Silicon ou Intel; macOS 11 ou mais novo) | `Documentos/Escala 5x2/dados.json` (ou a pasta do programa, se o acesso a Documentos for negado) | "Salvo no computador" |

Observações:
- O programa não tem assinatura digital paga: na primeira abertura o Windows ("O Windows protegeu o computador") e o Mac pedem confirmação. O pacote traz um arquivo "LEIA-ME" com o passo a passo.
- As versões "Simples" e "Completa" do programa para Windows usam o mesmo arquivo de dados e não devem ficar abertas ao mesmo tempo.
- Existe ainda um servidor (FastAPI, SQLite e otimizador OR-Tools CP-SAT) da versão completa. A versão simplificada só o usa se um endereço for configurado na geração do arquivo, o que não acontece nas variantes entregues (RN-GER-14). [MOTOR-SEM-TELA]
- Dados podem ser levados de uma variante para outra pela cópia de segurança (Personalizar → Dados) ou, no programa, pelo menu Arquivo.

### 1.7 Estrutura funcional (mapa)

```
Simulador Escala 5x2
├── Menu lateral: marca, filtro de lojas, 10 itens, situação do salvamento
├── Escala
│   ├── Cabeçalho: título, período, modelo; ↶ Desfazer, LIMPAR ESCALA, Copiar escala…, Gerar escala; abas de setor
│   ├── Primeiros passos (condicional)
│   ├── Avisos: edição manual / relatório da geração / setor vazio / escala em branco
│   ├── Painéis Limpar escala e Copiar escala (quando abertos)
│   ├── Indicadores (3)
│   ├── Onde vai faltar gente
│   ├── Semana (filtros, ferramenta "Ao clicar num dia", tabela, PDFs, Excel)
│   ├── Cobertura da semana (mapa, cores, detalhe da faixa, Escalonar intervalos)
│   └── Mês (filtros, grade por loja, linhas por turno, PDF, Gerar escala inteligente, Limpar, Desfazer)
├── Equipe
│   ├── Filtros e ordenação; Alterar as pessoas mostradas
│   ├── Modelo de escala do setor
│   ├── Domingos do setor (rodízio e regra com prévia)
│   ├── Tabela da equipe (com "mais detalhes")
│   └── Adicionar várias; Importar planilha; Escala por pessoa (PDF)
├── Domingos: escala de cada domingo; copiar um domingo; modelos de domingo
├── Escala de Almoço: grade do dia; sugestões; distribuir almoços
├── Dashboards: Faltas | Atestados | Colaboradores | Lojas
├── Férias: indicadores; programar; atenção; mapa; saldo e vencimentos; regras
├── Horários: turnos normais; plantões 12x36; domingos e feriados
├── Fluxo alto: seg–sex; sábado; domingo e feriados; exceções
├── Lojas: nova loja; suas lojas
└── Personalizar
    ├── Empresa e loja · Setores
    ├── Funcionamento e jornada (modelo por setor, regra de domingo, aplicar horário aos setores)
    ├── Jornadas · Feriados e dias sem folga
    ├── Aparência · Cores da escala
    ├── Regras avançadas
    └── Dados
```

### 1.8 Glossário

| Termo | Definição |
|---|---|
| Loja | Unidade com configuração própria (horários, período, regras), setores e colaboradores. O sistema guarda várias lojas. |
| Loja em uso ("em edição") | A loja que Horários, Fluxo alto e Personalizar editam (RN-FIL-01). |
| Rede / empresa | Texto exibido junto ao nome da loja e nos arquivos. Os painéis somam lojas, mas não há cadastro de rede. |
| Setor | Área da loja com equipe, turnos e necessidade próprios. Tem nome, cor, ordem e pode estar escondido. |
| Quadro do setor | Número de pessoas cadastradas no setor. |
| Modelo / regime | Forma de trabalho: 5x2, 6x1, 12x36 ou uma jornada cadastrada. Pode ser da loja, do setor ou da pessoa (RN-REG). |
| Jornada cadastrada | Modelo com nome livre, dias de trabalho por semana e horas por dia (ex.: "Meio período", 5 dias × 6h). |
| 12x36 / Plantão A e B | Plantão dia sim, dia não, inclusive domingos e feriados. Plantão A e Plantão B se revezam. |
| Contratação | CLT, Estagiário ou Jovem aprendiz. Estagiário e aprendiz podem ter horas por dia próprias. |
| Turno | Horário de trabalho: entrada, horas trabalhadas e intervalo; a saída é calculada. Pode ser normal, plantão ou de domingo/feriado. |
| Jornada efetiva | Tempo trabalhado no dia, sem o intervalo. Por padrão, a "Jornada por dia" da loja (8h24). |
| Intervalo / almoço | Pausa não computada na jornada. |
| Intervalo de sempre | Início (e, opcionalmente, duração) de intervalo próprio da pessoa, valendo nos dias normais. |
| Intervalo "só hoje" | Início e/ou duração de intervalo de um único dia. |
| Janela do intervalo | Horário em que o intervalo de um turno pode acontecer (ex.: entre 12h e 15h), usado na distribuição. |
| Fluxo alto / necessidade (mínimo) | Quantas pessoas do setor precisam estar no posto numa faixa de horário. |
| Faixa | Intervalo de 30 minutos usado na cobertura. |
| Cobertura | Pessoas no posto em cada faixa, comparadas com a necessidade. Só conta quem está presente na faixa inteira. |
| Período de planejamento | De 1 a 8 semanas seguidas a partir de "Planejar a partir de". |
| Semana de planejamento | Bloco de 7 dias a partir do início do período (por padrão de segunda a domingo). |
| Folga (F) | Dia sem trabalho que conta como folga da semana. |
| Folga fixa | Dia da semana em que a pessoa sempre folga (até duas por pessoa). |
| Dia fixado | Dia alterado à mão (ponto no canto). O motor não muda esse dia. |
| Dia sem folga | Data em que ninguém folga (ex.: 24/12 e 31/12). |
| Rodízio de domingos / Times | Divisão da equipe em times (A, B, C…) que se revezam aos domingos: no 1x1, domingo sim, domingo não. |
| Gerar escala | Rodar o motor para redistribuir as folgas de um setor no período, ajustar turnos e distribuir almoços. "Gerar escala inteligente" é o mesmo, a partir do Mês. |
| Preenchimento automático | Completa sozinho os dias sem escala (pessoas novas, dias novos, dias apagados). |
| Mês em branco ("limpo") | Mês apagado por "Limpar escala": os dias ficam vazios até "Gerar escala". |
| Movimento do dia | Intensidade do dia (fraco, médio, forte), deduzida da necessidade. Pesa na distribuição das folgas e dos almoços. |
| Pessoa-chave | Pessoa marcada como chave (fiscal, líder, quem abre o cofre), usada na regra avançada 9. |
| Falta (A) / Atestado (M) / Férias (V) | Dias de ausência lançados à mão (ou, nas férias, pela tela Férias). Não são folga nem trabalho. |
| Remanejamento / atividade | Pessoa contando em outro setor, ou em atividade que não conta no posto, num horário [MOTOR-SEM-TELA]. |

---

## 2. Modelo de dados

O protótipo guarda tudo em objetos JSON. Esta seção descreve cada estrutura, o significado de cada campo, os valores aceitos e o padrão adotado quando o campo não existe. Os nomes técnicos (entre crases) são os do código-fonte (`web/src/engine/types.ts`) e servem só de referência: a implementação pode usar outros nomes, desde que preserve o comportamento.

Convenção da coluna "Ausente": o que o sistema assume quando o campo não está no dado (dados antigos ou campo opcional).

### 2.1 Loja (`Store`)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | texto | Identificador único da loja. |
| `name` | texto | Nome da loja (ex.: "Loja 1 — Centro"). |
| `network` | texto | Nome da empresa ou rede (ex.: "Rede Bom Preço"). |
| `config` | Configuração | Ver 2.2. |
| `sectors` | lista de Setor | Ver 2.3. A ordem da lista é a ordem de exibição. |
| `employees` | lista de Colaborador | Ver 2.9. Todas as pessoas da loja, de todos os setores. |
| `reassignments` | lista de Remanejamento | Ver 2.11. [MOTOR-SEM-TELA] |
| `assignments` | lista de Atividade | Ver 2.12. [MOTOR-SEM-TELA] |
| `updatedAt` | data e hora ISO | Atualizado a cada alteração. |

Uma instalação pode ter **várias lojas**. Todas as telas trabalham sobre a "loja em uso"; algumas telas também mostram outras lojas pelo filtro de lojas (ver 3.21).

### 2.2 Configuração da loja (`StoreConfig`)

| Campo | Tipo | Descrição | Padrão da demonstração / Ausente |
|---|---|---|---|
| `folgasPorSemana` | inteiro | Folgas por semana do modelo da loja: 2 = 5x2, 1 = 6x1. | 2 |
| `modeloEscala` | "12x36" ou nulo | Marca a loja como 12x36. Fica "12x36" só quando todos os setores visíveis estão em 12x36 (RN-REG-08). | nulo |
| `dailyMin` | minutos | Jornada por dia padrão (turnos sem jornada própria). | 504 (8h24) |
| `weeklyMaxMin` | minutos | Limite de horas por semana. | 2520 (42h) |
| `open` / `close` | HH:MM | Horário de funcionamento de segunda a sábado. | 08:30 / 19:00 |
| `sundayOpen` | sim/não | A loja abre aos domingos. | sim |
| `sundayStart` / `sundayEnd` | HH:MM | Horário de domingo e de feriado aberto. | 08:30 / 12:15 |
| `holidays` | lista de Feriado | Ver 2.13. | lista vazia |
| `diasSemFolga` | lista de texto | Dias em que ninguém folga: "AAAA-MM-DD" (só aquele dia) ou "MM-DD" (todo ano). | vazio |
| `feriadoContaFolga` | sim/não | Feriado com a loja fechada conta como uma das folgas da semana. | Ausente = **sim** |
| `startDate` | data | Início do período de planejamento ("Planejar a partir de"). | demonstração e loja nova: a próxima segunda-feira (ou hoje, se for segunda) |
| `weeks` | 1 a 8 | Quantidade de semanas do período. | 4 |
| `weekStart` | 0 ou 1 | Dia em que a semana começa: 1 = segunda, 0 = domingo. | Ausente = dia da semana da data de início (0 se for domingo, senão 1) — RN-DAD-07 |
| `slot` | 15 ou 30 | Tamanho da faixa de cobertura (min). A versão simplificada usa 30. | 30 |
| `maxConsecutive` | inteiro | Máximo de dias seguidos de trabalho. | 6 |
| `sundayMaxCycleF` / `sundayMaxCycleM` | inteiro | Referência de folga dominical: mulheres 1 a cada N; demais 1 a cada N. Só gera alerta. | 2 / 3 |
| `minRestMin` | minutos | Descanso mínimo entre jornadas. Só gera alerta. | 660 (11h) |
| `maxDailyMin` | minutos | Jornada diária máxima (incluindo extras). Só gera alerta. | 600 (10h) |
| `breakMinOver6h` | minutos | Intervalo mínimo para jornada acima de 6h. | 60 |
| `breakMax` | minutos | Intervalo máximo. | 120 |
| `sundayRule` | "alternado" ou "individual" | Regra de domingo da loja (RN-DOM). | Ausente = "individual" (migração; RN-DAD-07). A demonstração nasce "alternado" |
| `sundayWork` | 1 a 6 | Na regra "alternado": domingos trabalhados seguidos antes de 1 de folga (1 = 1x1, 2 = 2x1…). | Ausente = 1 |
| `almocoAutomatico` | sim/não | Sem uso desde 06/11/2026: os almoços ficam sempre em dia (RN-ALM-11). | — |
| `coverageColor` | objeto | Critério e cores do mapa de cobertura: `mode` ("quadro" ou "necessidade"), `low` (%), `high` (%), `colors` ({low, mid, high} em hex), `style` ("faixas" ou "degrade"). | quadro, 50, 80, cores padrão, faixas |
| `regras` | Regras extras | Ver 2.14. | desligadas |
| `jornadas` | lista de Jornada | Ver 2.8. | vazio |
| `vacation` | Regras de férias | Ver 2.15. | padrões da CLT (2.15) |
| `theme` | texto | Tema de cores: roxo, azul, verde, vinho, grafite. | roxo |
| `colors` | mapa código → cor | Cores escolhidas para T, D, F, V, A, M, H e intervalo ("brk"). Só aparência. | padrão |
| `font` | texto | Fonte da interface: IBM Plex Sans, Barlow, Source Sans 3, Nunito Sans ou Tahoma. | IBM Plex Sans |
| `lockManual`, `monthlyCost`, `chargesPct`, `legend` | — | Herdados da versão completa. A versão simplificada não os usa nem exibe. | — |

### 2.3 Setor (`Sector`)

| Campo | Tipo | Descrição | Ausente |
|---|---|---|---|
| `id` | texto | Identificador. | — |
| `name` | texto | Nome exibido. | — |
| `roleSingular` / `rolePlural` | texto | Como se chama uma pessoa e várias pessoas do setor (ex.: "operador"/"operadores"). Usado nos textos de alertas, sugestões e Fluxo alto. **Desde a última revisão não é mais editável na tela** (ver RN-SET-02). | "colaborador"/"colaboradores" para setores novos |
| `color` | hex | Cor de identificação. | recebe a próxima cor livre da paleta (RN-SET-05) |
| `hidden` | sim/não | Setor escondido (a loja não usa). | não |
| `shifts` | lista de Turno | Ver 2.4. A ordem da lista é a ordem de exibição. | — |
| `defaultSundayShiftId` | id ou nulo | Turno de domingo padrão do setor. | o primeiro turno de domingo |
| `minRules` | lista de Faixa de necessidade | Ver 2.5. | vazio |
| `movement` | 7 itens (domingo a sábado) | Movimento do dia: intensidade 1/2/3, máximo de folgas e mínimo de pessoas por dia. Ver 2.6. | intensidade média |
| `posts` | lista de texto | Postos do setor. [MOTOR-SEM-TELA] | — |
| `schedule` | mapa pessoa → data → Célula | A escala gravada. Ver 2.10. | vazio |
| `lastRun` | objeto ou nulo | Data e hora da última geração aplicada e motor usado. | nulo |
| `sundayRule` | "alternado", "individual" ou nulo | Regra de domingo própria do setor; nulo = segue a da loja. | nulo |
| `sundayWork` | 1 a 6 ou nulo | Domingos trabalhados seguidos no rodízio próprio do setor. | nulo |
| `horarioProprio` | sim/não | Setor com horário próprio: não recebe o horário da loja quando ele é aplicado a todos (RN-HOR-09). | não |
| `modeloEscala` | "12x36" ou nulo | Setor inteiro em 12x36. | nulo |
| `folgasSemana` | 1, 2 ou nulo | Modelo próprio do setor: 2 = 5x2, 1 = 6x1; nulo = o da loja. | nulo |
| `jornadaId` | id ou nulo | Jornada cadastrada que o setor inteiro segue. | nulo |
| `limiteFolga` | objeto ou nulo | Máximo de pessoas de folga por dia escolhido pelo usuário (Regras avançadas, item 3): `modo` ("pessoas" ou "pct") e 7 valores (domingo a sábado; nulo = sem limite). | nulo = automático |
| `almocoFixo` (pessoa) | sim/não | Almoço com horário fixo (em `breakStart`), repetido em todos os dias normais (RN-ALM-02, RN-ALM-04). | sim após a sugestão |
| `almocoRodizio` (pessoa) | sim/não | Almoço em rodízio: escolhido a cada dia, sem horário fixo (RN-ALM-05). | não |
| `almocoVersao` (setor) | número | 2 = setor já passou para o modelo de horário fixo (RN-ALM-12). | ausente = modelo antigo, migrado ao abrir |
| `almocoModo` (setor) | "rodizio" ou "fixo" | Sem uso desde 06/11/2026 (apagado na passagem, RN-ALM-12). | — |
| `regrasProprias` | objeto ou nulo | Regras avançadas próprias do setor: `ref` (os sete valores de referência) e `regras` (regras extras). | nulo = segue as regras da loja (RN-RAV-03) |
| `limpo` | lista "AAAA-MM" | Meses com a escala limpa: ficam em branco até "Gerar escala" (RN-LIM). | vazio |
| `sundayTemplates` | lista | Modelos de domingo do setor: nome, data de origem e, por pessoa, trabalho (com turno) ou folga (tela Domingos, 4.4.3). | Ausente = nenhum modelo |

### 2.4 Turno (`Shift`)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | texto | Identificador. |
| `name` | texto | Nome (ex.: "Abertura", "Tarde A", "Estágio 5h"). |
| `start` | HH:MM | Entrada. |
| `breakStart` | HH:MM ou nulo | Início do intervalo; nulo = turno sem intervalo. |
| `breakMin` | minutos | Duração do intervalo (não conta como trabalho). |
| `workMin` | minutos ou nulo | Horas de trabalho por dia do turno; nulo = a "Jornada por dia" da loja. |
| `special` | sim/não | Turno de domingo e feriado. |
| `plantao` | sim/não | Turno de plantão 12x36 (pode passar da meia-noite). |
| `breakFlex` | minutos | Quanto o início do intervalo pode andar ao distribuir os almoços sem janela; 0 = fixo. Ausente = 60. |
| `breakWindow` | objeto ou nulo | Janela permitida para o intervalo: `start`, `end`, `mode` ("inicio": o início precisa cair na janela; "inteiro": o intervalo todo cabe nela) e `dist` ("linear", o padrão, ou "movimento"). |
| `color` | hex | Cor do turno nas telas (opcional). |
| `rodizio` | sim/não | Entra no rodízio semanal de turnos (Regras avançadas, item 12). |

**Saída calculada:** `Saída = Entrada + horas de trabalho + duração do intervalo` (o intervalo só entra quando tem início). Um turno pode terminar depois da meia-noite (plantão noturno); nesse caso a parte da madrugada conta no dia seguinte (RN-COB-02).

### 2.5 Faixa de necessidade (`MinRule`)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | texto | Identificador. |
| `days` | lista 0–6 | Dias da semana em que vale. |
| `date` | data ou nulo | Data especial: quando existe, a faixa vale só nessa data e tem prioridade. |
| `start` / `end` | HH:MM | Das … às … (início incluído, fim não). |
| `min` | inteiro 0–500 | Mínimo de pessoas no posto. |
| `ideal` | inteiro ou nulo | Ideal. [MOTOR-SEM-TELA] Sem campo na versão simplificada; a demonstração simplificada não usa. |
| `label` | texto | Observação (opcional). |

### 2.6 Movimento do dia (`DayMovement`)

Um item por dia da semana (0 = domingo … 6 = sábado).

| Campo | Descrição | Situação |
|---|---|---|
| `intensity` | 1 fraco, 2 médio, 3 forte. Recalculado automaticamente a partir da necessidade (RN-NEC-05). | [SIMULADO], sem campo próprio |
| `maxOff` | Máximo de pessoas de folga no dia. | Sem campo direto. Vem da demonstração e é ajustado automaticamente (RN-GER-03); o usuário pode substituí-lo pelo "Máximo de folgas por dia" das Regras avançadas (`limiteFolga`). |
| `minStaff` | Mínimo de pessoas trabalhando no dia. | [MOTOR-SEM-TELA] |

### 2.7 Contratação e horas próprias da pessoa

A contratação é um campo da pessoa (2.9), com três valores:

| Valor | Nome na tela | Padrão ao escolher |
|---|---|---|
| ausente ou "clt" | CLT | jornada da loja; horas por semana = limite semanal da loja |
| "estagio" | Estagiário | 6h por dia e 30h por semana (editáveis), intervalo automático |
| "aprendiz" | Jovem aprendiz | 6h por dia e 30h por semana (editáveis), intervalo automático |

### 2.8 Jornada cadastrada (`Jornada`)

Criada em Personalizar → Jornadas. Vale para pessoas e para setores inteiros.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | texto | Identificador. |
| `nome` | texto | Nome livre (ex.: "Estágio 30h", "Meio período"). |
| `diasSemana` | 1 a 7 | Dias de trabalho por semana. As folgas da semana são `7 − dias`. |
| `horasDia` | minutos | Horas de trabalho por dia, sem o intervalo. |
| `intervaloMin` | minutos ou nulo | Intervalo; nulo = automático pela jornada (RN-TUR-05). |

### 2.9 Colaborador (`Employee`)

| Campo | Tipo | Descrição | Ausente |
|---|---|---|---|
| `id` | texto | Identificador. | — |
| `sectorId` | id | Setor da pessoa. | — |
| `name` | texto | Nome. Se vazio, as telas mostram a função. | — |
| `func` | texto | Função (ex.: "Operador(a) 4"). | — |
| `matricula` | texto | Matrícula. Usada na importação para achar a pessoa. | vazio |
| `sex` | "F", "M" ou vazio | Sexo. Define a referência de domingos no alerta (RN-DOM-11). | vazio |
| `shiftId` | id | Turno habitual (dias normais). | — |
| `sundayShiftId` | id ou nulo | Turno habitual de domingo e feriado; nulo = o padrão do setor. | nulo |
| `sundayCycle` | inteiro | 0 = não trabalha domingo; N ≥ 1 = folga 1 domingo a cada N. No rodízio "alternado", N = domingos trabalhados + 1. | — |
| `sundayOffset` | inteiro | Qual domingo do ciclo é folga (1…N); 0 = o sistema escolhe. Junto com `sundayCycle` define o time (A, B, C…). | — |
| `fixedOff` | 0–6 ou nulo | Primeira folga fixa (0 = domingo … 6 = sábado). | nulo |
| `fixedOff2` | 0–6 ou nulo | Segunda folga fixa (só para quem tem 2 ou mais folgas na semana). | nulo |
| `variableOff` | 1–6 ou nulo | "Prefere folgar" (preferência, não obrigação). | nulo |
| `contractMin` | minutos | Horas por semana do contrato. | — |
| `contratacao` | ver 2.7 | Tipo de contratação. | CLT |
| `horasDia` | minutos ou nulo | Horas por dia de estagiário ou aprendiz. Vale em qualquer turno. | nulo |
| `intervaloMin` | minutos ou nulo | Intervalo de quem tem horas próprias; nulo = automático. | nulo |
| `jornadaId` | id ou nulo | Jornada cadastrada da pessoa. Não vale no 12x36. | nulo |
| `folgasSemana` | 1, 2 ou nulo | Modelo próprio da pessoa (5x2 ou 6x1); nulo = o do setor ou da loja. | nulo |
| `regime` | "12x36" ou nulo | Pessoa em plantão 12x36. | nulo |
| `plantaoFase` | 0 ou 1 | No 12x36: 0 = Plantão A, 1 = Plantão B. | 0 |
| `breakStart` | HH:MM ou nulo | Início do intervalo "de sempre" próprio da pessoa (nos dias normais). | nulo = o do turno |
| `almocoMin` | minutos ou nulo | Duração do intervalo "de sempre" própria da pessoa. A saída anda junto. | nulo = a do turno |
| `chave` | sim/não | Pessoa-chave (Regras avançadas, item 9). | não |
| `admissao` | data ou nulo | Data de admissão. Desde 06/11/2026 não aparece nem é usada nas férias; só evita sugerir faltas antes dela. | nulo |
| `almocoDomingo` / `almocoDomingoMin` | "HH:MM" ou nulo / minutos ou nulo | Almoço próprio do domingo: horário (nulo = automático) e tempo (nulo = o do turno de domingo). Turno de domingo sem intervalo + tempo ou horário = a pessoa ganha almoço no domingo (RN-ALM-06). | nulo |
| `feriasDe` / `feriasAte` | data ou nulo | Férias programadas de/até (planejamento; não muda a escala) (4.7.5, RN-FEV-11). | nulo |
| `feriasMes` | "AAAA-MM" ou nulo | Formato antigo (só o mês): lido como do dia 1 pelos dias de férias da loja. | nulo |
| `vacPaidUntil` | data ou nulo | Sem uso desde 06/11/2026 (quitação por período aquisitivo). | nulo |
| `vacPaidConfirmed` | sim/não | Sem uso desde 06/11/2026. | não |
| `quals` | lista de setores | "Pode ajudar em" (habilitações). [MOTOR-SEM-TELA] na versão simplificada. | vazio |
| `joker` | sim/não | Coringa. [MOTOR-SEM-TELA] | não |
| `defaultPost` | texto | Posto padrão. [MOTOR-SEM-TELA] | nome do setor |

### 2.10 Célula da escala (`Cell`) e códigos de dia

A escala de cada setor é um mapa `pessoa → data → célula`. Um dia **sem célula** dentro do período vale como trabalho (T ou D), a não ser que o mês esteja "limpo" (2.3, `limpo`), quando fica **em branco**.

| Campo | Descrição |
|---|---|
| `c` | Código do dia (tabela abaixo). |
| `lock` | Dia **fixado à mão**: o motor não muda. |
| `shiftId` | Turno usado só neste dia, no lugar do habitual. |
| `brk` | Início do intervalo só neste dia (HH:MM). |
| `brkMin` | Duração do intervalo só neste dia (min). A saída anda junto. |
| `brkFix` | O almoço deste dia foi escolhido à mão ("Só neste dia"): o sistema não muda (RN-ALM-03). |
| `auto` | O turno do dia foi trocado automaticamente (rodízio de turnos ou "quem fecha não abre"); é refeito a cada geração. |

| Código | Nome | Conta como | Cor padrão |
|---|---|---|---|
| T | Trabalho (dia normal) | dia de trabalho | branco ou cor do turno |
| D | Trabalho em domingo ou feriado aberto | dia de trabalho | — |
| F | Folga | folga da semana | lilás |
| A | Falta | indisponível (não é folga nem trabalho) | — |
| M | Atestado médico | indisponível | — |
| V | Férias | indisponível | — |
| H | Feriado com a loja fechada | indisponível; pode valer como folga da semana (RN-FER-02) | — |

As cores podem ser trocadas em Personalizar → Aparência (só aparência; não mudam cálculos).

### 2.11 Remanejamento (`Reassignment`) [MOTOR-SEM-TELA]

Pessoa que, num horário, trabalha em outro setor: `employeeId`, `toSectorId`, `date` (ou `weekdays` recorrentes), `start`, `end`, `post`, `note`. Conta no setor de destino nesse horário (RN-COB-01). A versão simplificada não tem tela para criar remanejamentos; eles só existem em dados importados da versão completa ou da demonstração.

### 2.12 Atividade (`PostAssignment`) [MOTOR-SEM-TELA]

Atividade da pessoa num horário: `employeeId`, `date` ou `weekdays`, `start`, `end`, `post`, `counts` (falso = outra atividade, que não conta na cobertura). Sem tela na versão simplificada.

### 2.13 Feriado (`Holiday`)

`date` (data, única), `name` (texto; vazio vira "Feriado"), `open` (a loja abre). Todo feriado novo começa com a loja **fechada**.

### 2.14 Regras avançadas extras (`RegrasExtras`)

Todas opcionais; ausente ou nulo = regra desligada. A "força" (`Forca`) vale "evitar" (preferência forte; só acontece se não houver outro jeito) ou "proibir" (restrição obrigatória).

| Nº na tela | Campo | Conteúdo |
|---|---|---|
| 1 | `folgasSeparadas` | força: as folgas da semana não caem em dias seguidos |
| 1b | `folgasJuntas` | sim/não: preferir as folgas da semana juntas (folga dupla). Na tela, faz parte da escolha única da regra 1 ("Juntas (folga dupla), quando der") |
| 2 | `diasSemFolgaSemana` | `dias` (0–6), `forca`, `setores` (nulo = loja toda) |
| 3 | (no setor) `limiteFolga` | ver 2.3 |
| 1c | `folgasSemPreferencia` | sim/não: nem separar nem juntar as folgas (sem nada marcado, o sistema prefere separadas) |
| 14 | `descansoObrigatorio` | minutos ou nulo: descanso mínimo entre jornadas respeitado ao gerar; nulo = não usar (o cliente preenche se quiser) |
| 4 | `rodizioDiaFolga` | sim/não: revezar o dia da folga e dividir as folgas de cada dia da semana (segunda a sábado) por igual |
| 5 | `fimDeSemanaMes` | sim/não: um fim de semana completo por mês |
| 5b | `sabadoComDomingo` | `{ pct }` ou nulo: quem folga no domingo também folga no sábado, até pct% da equipe por fim de semana |
| 8b | `cobrirFolga` | `{ pares: [titular, substituto][], ausencias? }` ou nulo: na folga do titular, o substituto vai para o turno dele |
| 5c | `segundaComDomingo` | `{ pct }` ou nulo: quem folga no domingo também folga na segunda seguinte, até pct% da equipe por domingo |
| 6 | `emendaFeriado` | `forca` e `max` (pessoas de folga no dia antes e no dia depois de feriado) |
| 7 | `naoFolgarJuntos` | `forca` e `pares` (duplas de ids; podem ser de setores diferentes) |
| 8 | `folgarJuntos` | `pares` (duplas que preferem folgar juntas; podem ser de setores diferentes) |
| 9 | `pessoaChave` | `forca` e `min` (pessoas-chave trabalhando por dia, por setor) |
| 10 | `domingosIguais` | sim/não: equilibrar os domingos trabalhados |
| 11 | `fecharAbrir` | sim/não: quem fecha não abre no dia seguinte |
| 12 | `rodizioTurnos` | sim/não: rodízio semanal entre os turnos marcados |
| 13 | `maxExtrasSemanaMin` | minutos ou nulo: limite de horas extras por semana (só aviso) |
| — | `ondeVale` | por regra (chave → lista de setores): setores em que a regra vale; ausente ou vazia = todos (RN-RAV-04) |

### 2.15 Regras de férias (`VacRules`)

| Campo | Descrição | Padrão |
|---|---|---|
| `dias` | Dias de férias por período aquisitivo | 30 |
| `minPeriodo` | Menor período permitido (dias) | 5 |
| `periodoLongo` | Pelo menos um período com esse tamanho | 14 |
| `maxPeriodos` | Quantos períodos no máximo | 3 |
| `avisoDias` | Sem uso desde 06/11/2026 (vencimento) | 60 |
| `maxSimultaneo` | Pessoas do mesmo setor de férias ao mesmo tempo (nulo = sem limite) | nulo |
| `descontoFaltas` | Sem uso desde 06/11/2026 | sim |

As regras de férias só geram alertas e saldos; não bloqueiam lançamentos (RN-FEV).

### 2.16 Dia do calendário (calculado, não gravado)

Para cada dia do período o sistema calcula: índice, data, semana de planejamento (0…semanas−1), dia da semana, feriado (se houver), **fechado** (loja não abre), **especial** (domingo ou feriado aberto, que usa horário e turno de domingo) e horário de abertura e fechamento do dia. Ver RN-CAL-05.

### 2.17 Preferências guardadas só no navegador

Não fazem parte dos dados da loja e não são compartilhadas:

| Chave | Conteúdo |
|---|---|
| `escala5x2:store` | Última loja aberta |
| `escala5x2:sector` | Último setor aberto |
| `escala5x2:stores-sel` | Lojas marcadas no filtro de lojas |
| `escala-almoco-ordem` | Ordem escolhida na Escala de Almoço |
| `cov-zoom` | Tamanho do mapa de cobertura |
| outras chaves de tela | Escolhas de exibição (ver cada tela) |

---

## 3. Regras de negócio

As regras são identificadas por grupo (RN-XXX-nn). Sem marcador, a regra é **[SIMULADO]**: é o que o protótipo faz hoje.

### 3.1 Calendário e período de planejamento (RN-CAL)

- **RN-CAL-01 — Período.** O período tem `semanas × 7` dias seguidos a partir de "Planejar a partir de" (`startDate`). A semana de planejamento *n* vai do dia `7n` ao dia `7n+6`. As regras "folgas por semana" e "limite de horas por semana" são contadas **por semana de planejamento**, não por semana do calendário.
- **RN-CAL-02 — Quantidade de semanas.** De 1 a 8. Os dias que saem do período continuam guardados, mas deixam de aparecer e de contar.
- **RN-CAL-03 — Tipo de dia.** Para cada dia do período:

| Situação | Loja | Tipo | Horário do dia |
|---|---|---|---|
| Feriado com "loja abre" desmarcado | fechada | — | — |
| Feriado com "loja abre" marcado | aberta | especial (domingo/feriado) | horário de domingo |
| Domingo com a loja fechada aos domingos | fechada | — | — |
| Domingo com a loja aberta aos domingos | aberta | especial | horário de domingo |
| Demais dias | aberta | normal | horário de segunda a sábado |

- **RN-CAL-04 — Eixo de horários.** As telas de cobertura usam faixas de 30 minutos, do **menor horário de abertura** dos dias abertos do período (arredondado para baixo em múltiplo de 30 min) até o **maior fechamento**, sem incluir esse último instante. Uma faixa é "aberta" quando fica entre a abertura e o fechamento daquele dia.
- **RN-CAL-05 — Horário da loja não move turnos.** Mudar abertura e fechamento muda só o eixo e quais faixas estão abertas. Turnos e necessidades continuam iguais, a não ser que o usuário aplique o horário aos setores (RN-HOR-09).
- **RN-CAL-06 — Datas e horas.** Datas são tratadas no calendário, sem fuso horário. Horários em minutos desde 00:00; um turno que passa da meia-noite continua contando no dia seguinte (RN-COB-02).

- **RN-CAL-07 — Navegar para fora do período.** Na Semana, "‹" antes da primeira semana, "›" depois da última ou "Ir para" com uma data fora do período fazem o período **passar a começar** no início da semana pedida, com a mesma quantidade de semanas. Os dias que entram no período ganham escala pelo preenchimento automático (RN-GER-11); os que saem continuam guardados. No Mês, a navegação é livre e não muda o período (a ampliação é feita pelos botões de 4.2.8). Na tela Domingos, "‹" e "›" movem o período inteiro (semanas × 7 dias) e "Ir para" move o período quando o domingo da data não aparece (4.4.1). [INFERIDO] (ver 11.5)
- **RN-CAL-08 — Semana começa.** "Na segunda" (padrão) ou "No domingo", na Semana e em Personalizar. Ao trocar: o início do período passa para a próxima ocorrência do novo dia (a partir do início atual, inclusive); **as células não fixadas de todos os setores da loja são apagadas e refeitas** (férias, faltas, atestados e dias fixados ficam). As regras semanais (folgas, limite de horas) passam a ser contadas nas novas semanas.
- **RN-CAL-09 — Planejar a partir de / Quantas semanas.** Em Personalizar: a data escolhida é ajustada para o início da semana que a contém; a quantidade vai de 1 a 8. Os dias novos ganham escala pelo preenchimento automático; nada do que já existe é refeito.

### 3.2 Código efetivo de cada dia (RN-DIA)

- **RN-DIA-01 — Dia fechado.** Se a célula guardada é Férias (V), Falta (A) ou Atestado (M), esse código fica. Nos demais casos o dia vale **H** (feriado fechado) ou **F** (domingo fechado).
- **RN-DIA-02 — Dia aberto com célula guardada.** O código se ajusta ao tipo do dia: T em dia especial vira D; D em dia normal vira T; H em dia aberto vira F.
- **RN-DIA-03 — Dia aberto sem célula.** Vale como trabalho: T em dia normal, D em dia especial. **Exceção:** em mês "limpo" o dia sem célula fica **em branco** (RN-LIM-03).
- **RN-DIA-04 — O que é trabalho e o que é folga.** Só T e D são dias de trabalho. Só F conta como folga da semana. A, M e V não são folga nem trabalho. H depende da opção "feriado fechado conta como folga" (RN-FER-02).

### 3.3 Turnos e horário de cada dia (RN-TUR)

- **RN-TUR-01 — Saída calculada.** `Saída = Entrada + horas de trabalho + duração do intervalo` (o intervalo só entra quando tem início). Exemplo: entrada 08:15, jornada 8h24 e intervalo de 2h → saída 18:39.
- **RN-TUR-02 — Horas de trabalho do turno.** As do próprio turno, quando preenchidas; senão a "Jornada por dia" da loja.
- **RN-TUR-03 — Turno de cada dia** (vale o primeiro caso que se aplica):
  1. **turno escolhido para o dia** (célula com turno próprio, escolhido à mão ou pelas regras de turno);
  2. **pessoa em 12x36:** o turno de plantão, inclusive em domingo e feriado;
  3. **dia especial** (domingo ou feriado aberto): o turno de domingo da pessoa; se não houver, o turno de domingo padrão do setor; se não houver, o primeiro turno de domingo; se o setor não tiver turno de domingo, o turno normal;
  4. **dia normal:** o turno da pessoa; se ele não existir mais, o primeiro turno normal do setor.
- **RN-TUR-04 — Horas próprias da pessoa.** Depois de escolhido o turno, o horário é ajustado às horas próprias da pessoa, nesta ordem de prioridade:
  1. jornada cadastrada da pessoa (horas por dia da jornada);
  2. estagiário ou jovem aprendiz com horas por dia;
  3. pessoa num modelo diferente do da loja (ex.: 6x1 numa loja 5x2) usando um turno **sem** horas próprias: `limite semanal ÷ dias de trabalho` (42h ÷ 6 = 7h) — RN-REG-04.

  A **entrada é a do turno**; a saída é recalculada. Em domingo e feriado as horas próprias **nunca passam** das horas do turno de domingo.
- **RN-TUR-05 — Intervalo de quem tem horas próprias.** O escolhido para a pessoa (ou para a jornada). Se não houver escolha, é automático: até 4h de trabalho, sem intervalo; até 6h, 15 min; acima de 6h, o do turno, com mínimo de 1h. O intervalo fica no horário do turno, se couber; senão, no meio da jornada (arredondado a 15 min).
- **RN-TUR-06 — Intervalo "de sempre" próprio da pessoa.** Nos dias normais, se a pessoa tem início ou duração de intervalo próprios (definidos na Escala de Almoço, "Todos os dias"), eles substituem os do turno — **só no turno normal e só se o turno tiver intervalo**. Com duração própria, a **saída anda junto** (as horas trabalhadas não mudam).
- **RN-TUR-07 — Intervalo só de um dia.** Uma célula pode ter início e/ou duração de intervalo só daquele dia. Valem se o intervalo novo couber depois da entrada e antes da (nova) saída; se o horário novo não couber, fica só a duração. A saída anda junto com a duração.
- **RN-TUR-08 — Turno novo e turno de domingo novo.** Ver tela Horários (4.8).
- **RN-TUR-09 — Exclusão de turno.** Exige confirmação. Quem estava no turno passa para o primeiro turno normal que sobrar. Se era o turno de domingo padrão, o próximo turno de domingo vira o padrão.

### 3.4 Regimes, modelos e jornadas (RN-REG)

- **RN-REG-01 — Folgas por semana de cada pessoa** (vale o primeiro que existir):
  1. jornada cadastrada da pessoa → `7 − dias de trabalho da jornada`;
  2. modelo próprio da pessoa (5x2 ou 6x1);
  3. modelo do setor (5x2 ou 6x1);
  4. modelo da loja.

  Assim, no mesmo setor podem conviver pessoas em 5x2, 6x1, 12x36 e jornadas cadastradas (decisão confirmada com o usuário: "colaboradores do mesmo setor com regimes diferentes").
- **RN-REG-02 — Modelo da loja.** "Modelo de escala" em Personalizar: 5x2, 6x1 ou 12x36. Mudar entre 5x2 e 6x1 **não muda os setores que têm modelo próprio** (pedido "Atualização 2.0", item 2). 12x36 na loja inteira coloca todos os setores visíveis em 12x36 (RN-REG-07).
- **RN-REG-03 — Modelo do setor.** "Modelo por setor" em Personalizar: "igual à loja", 5x2, 6x1, uma jornada cadastrada ou 12x36. Ao aplicar 5x2 ou 6x1 num setor: o setor sai do 12x36 (se estava), deixa de seguir jornada, todos que estavam em 12x36 ou em jornada voltam ao regime da loja, os modelos próprios das pessoas do setor são apagados e a escala do setor é refeita (os dias fixados à mão ficam).
- **RN-REG-04 — Horas por dia de quem está num modelo diferente.** Pessoa em 6x1 numa loja 5x2 (ou o contrário), num turno **sem horas próprias**, trabalha `limite semanal ÷ dias de trabalho` por dia (ex.: 42h ÷ 6 = 7h). Se o turno tem horas próprias, valem as do turno. Não se aplica a turno de domingo, plantão, 12x36 nem jornada cadastrada.
- **RN-REG-05 — Mudar o modelo de uma pessoa** (Equipe, coluna "Regime"): 5x2, 6x1, uma jornada cadastrada, 12x36 Plantão A ou Plantão B.
  - **5x2 / 6x1:** sai do 12x36 e da jornada, se estava; se o modelo escolhido for igual ao do setor, o modelo próprio é apagado; o intervalo próprio é apagado; em 6x1 a 2ª folga fixa é apagada; a escala dela é refeita.
  - **Jornada:** sai do 12x36; recebe a jornada; horas por semana do contrato = `dias × horas por dia`; intervalo próprio apagado; escala refeita.
  - **12x36:** ver RN-REG-06.
- **RN-REG-06 — 12x36 (plantão dia sim, dia não).**
  - A pessoa trabalha **dia sim, dia não**, ancorado no calendário: Plantão A trabalha nos dias pares contados desde 01/01/1970; Plantão B nos ímpares. Vale em qualquer dia da semana, inclusive domingo e feriado aberto. Dia fechado é folga.
  - Ao entrar no 12x36 a pessoa passa para o turno de plantão do setor. Se o setor não tem nenhum, é criado "Plantão dia" (07:00, intervalo 12:00 de 1h, 11h de trabalho → saída 19:00). Também existe "Plantão noite" (19:00, intervalo 01:00 de 1h, 11h), criado pela tela Horários.
  - Apaga jornada, modelo próprio, intervalo próprio e as duas folgas fixas.
  - A pessoa em 12x36 **não segue** as regras de folgas por semana, limite semanal, dias seguidos e domingos do 5x2; o motor não mexe nos dias dela. Não entra nos times de domingo.
  - Turno de plantão pode passar da meia-noite: a madrugada conta no dia seguinte (RN-COB-02).
  - Ao sair do 12x36 ("regime da loja"): volta ao turno normal (o atual, se for normal, ou o primeiro normal do setor), ao rodízio de domingos do setor (entra no time com menos gente) e tem a escala refeita.
- **RN-REG-07 — 12x36 no setor e na loja.**
  - **Setor em 12x36:** todos do setor vão para plantão. Quem já estava em 12x36 mantém o plantão; os outros, ordenados por horário de entrada e nome, alternam A, B, A, B…
  - **Loja em 12x36:** aplica em todos os setores visíveis.
  - **Sair do 12x36 (setor):** quem estava em plantão volta ao regime da loja.
  - **Sair do 12x36 (loja):** escolhe 5x2 ou 6x1; todos os setores e pessoas saem do 12x36.
  - Exige confirmação na tela, com texto que explica o efeito (seção 4.12).
- **RN-REG-08 — Marca da loja.** A loja fica marcada como 12x36 só quando **todos** os setores visíveis estão em 12x36.
- **RN-REG-09 — Contratação** (Equipe, coluna "Contratação"):
  - **CLT:** apaga horas por dia e intervalo próprios; horas por semana do contrato = limite semanal da loja; intervalo de sempre apagado.
  - **Estagiário / Jovem aprendiz:** se a pessoa já era estagiária ou aprendiz, mantém horas e intervalo. Se não era: horas por dia = 6h (ou nenhuma, se o turno dela tem horas próprias, como "Estágio 5h"), horas por semana = 30h, intervalo automático.
  - As horas por dia do estagiário valem **em qualquer turno** (a entrada é a do turno; a saída é recalculada).
- **RN-REG-10 — Jornadas cadastradas** (Personalizar → Jornadas):
  - Nome livre, dias de trabalho por semana (1 a 6 na tela), horas por dia (0h01 a 16h) e intervalo (automático ou escolhido).
  - Resumo exibido: "{dias} dias × {horas} = {total} por semana".
  - **Salvar uma jornada existente:** quem está nela tem as horas por semana do contrato atualizadas para `dias × horas`; se mudaram os dias, a escala dessas pessoas é refeita.
  - **Excluir:** quem estava nela e os setores que a seguiam voltam ao regime da loja.
  - **Setor numa jornada:** o setor sai do 12x36 (se estava) e todos do setor entram na jornada. Voltar para "igual à loja" tira a jornada de todos.
  - A jornada não vale para quem está em 12x36.

### 3.5 Necessidade de pessoas (RN-NEC)

- **RN-NEC-01 — Faixas.** Cada faixa diz que, "das HH:MM às HH:MM", o setor precisa de N pessoas. O início está incluído e o fim não.
- **RN-NEC-02 — Qual faixa vale num horário.** Entre as faixas que se aplicam ao dia, vence a de maior prioridade `(data especial ? 1000 : 0) + (7 − nº de dias) × 10 + mínimo × 0,01`. Na prática: 1) data especial; 2) conjunto de dias menor ("só quarta" ganha de "segunda a sexta"); 3) maior mínimo. **Feriado aberto usa as faixas de domingo.** Sem faixa, a necessidade é 0.
- **RN-NEC-03 — Ideal.** Se a faixa tem ideal maior que o mínimo, ele vale como ideal; senão ideal = mínimo. Não há campo de ideal na versão simplificada. [MOTOR-SEM-TELA]
- **RN-NEC-04 — Movimento do dia (automático).** A cada mudança na necessidade, a intensidade de cada dia da semana é recalculada:
  1. carga do dia = soma de `mínimo × horas` das faixas **sem data** que valem nele;
  2. com M = maior carga: ≥ 85% de M → **forte (3)**; ≥ 60% → **médio (2)**; abaixo → **fraco (1)**; sem faixas, todos médios.

  Os limites diários existentes são mantidos. A intensidade pesa na geração (RN-GER-06).
- **RN-NEC-05 — Limites do campo.** Mínimo de 0 a 500.

### 3.6 Presença e cobertura (RN-COB)

- **RN-COB-01 — Onde a pessoa está.** Para cada pessoa, dia e horário, vale o primeiro caso que se aplica:
  1. madrugada de um plantão noturno que começou no dia anterior → trabalhando (ou em intervalo, se for o horário do intervalo);
  2. dia sem trabalho → folga, férias, falta/atestado ou feriado (não conta);
  3. sem turno → não conta;
  4. antes da entrada ou depois da saída → não conta;
  5. dentro do intervalo → "em intervalo" (não conta);
  6. remanejada para outro setor nesse horário → conta no setor de destino ([MOTOR-SEM-TELA]);
  7. em atividade que não conta → não conta ([MOTOR-SEM-TELA]);
  8. demais casos → conta no próprio setor.

  Uma pessoa ocupa um só lugar por horário e nunca é contada duas vezes.
- **RN-COB-02 — Faixa inteira.** Numa faixa de 30 min, a pessoa **só conta se estiver presente na faixa inteira**. Quem chega ou sai no meio da faixa, ou tem qualquer parte do intervalo dentro dela, não conta naquela faixa. (Decisão do relatório de ajustes, item 06 — "conferir a cobertura de pessoal": a contagem passou a considerar entradas, saídas e intervalos dentro da faixa.)
- **RN-COB-03 — Contagem.** "No posto" numa faixa = pessoas do setor que contam + pessoas de outros setores remanejadas para ele.
- **RN-COB-04 — Situação da faixa** (critério "necessidade"):
  - **fechada:** dia/faixa fechada e necessidade 0;
  - **sem necessidade:** necessidade 0;
  - **vermelha:** no posto < mínimo;
  - **amarela:** ideal > mínimo e no posto < ideal;
  - **verde clara:** no posto = mínimo;
  - **verde escura:** no posto > mínimo.
- **RN-COB-05 — Totais do setor no período.**
  - `exigido = Σ mínimos` (pessoa-faixa); `atendido = Σ mínimo(mínimo, no posto)`;
  - `% coberto = atendido ÷ exigido` (100% sem necessidade);
  - `horas faltando por semana = (exigido − atendido) × 30 ÷ 60 ÷ semanas`;
  - também: faixas vermelhas e o maior número de pessoas faltando numa faixa.

### 3.7 Folgas e restrições obrigatórias (RN-FOL)

A escala gerada **sempre** cumpre estas regras; se não for possível, ela não é aplicada (RN-GER-09). Uma escala com ajustes manuais pode descumpri-las; nesse caso aparecem alertas (RN-ALE-02). Nada disto vale para pessoas em 12x36.

- **RN-FOL-01 — Folgas por semana.** Em cada semana de planejamento a pessoa precisa de exatamente `N` folgas F:
  - se **todos os 7 dias** da semana já estão definidos (fixados, férias, 12x36…), N = as folgas que já estão lá;
  - senão, `N = mínimo(folgas da pessoa − feriados fechados na semana*, 7 − dias de A, M, V ou H na semana)`, nunca menos que 0.

  \* Os feriados fechados só são descontados quando "feriado fechado conta como folga" está ligado (padrão). **Mais folgas do que N** só são aceitas até o número de folgas **já fixadas** na semana (marcadas à mão, domingos fechados, folga fixa, domingos do time…): `folgas ≤ máximo(N, F fixadas)`.
  - Consequência: férias, faltas e atestados **não substituem** folgas; a pessoa continua com suas folgas na semana, a não ser que sobrem menos dias disponíveis.
- **RN-FOL-02 — Limite semanal de horas.** A soma das horas dos dias trabalhados em cada semana não pode passar do limite semanal (padrão 42h).
- **RN-FOL-03 — Dias seguidos.** Ninguém trabalha mais que o máximo de dias seguidos (padrão 6). A contagem atravessa as semanas, só dentro do período.
- **RN-FOL-04 — Domingo com escolha automática.** Para quem tem "folga a cada N domingos" sem domingo definido (regra individual), qualquer sequência de N domingos abertos seguidos precisa ter ao menos um sem trabalho.
- **RN-FOL-05 — Limites diários.** Se definidos, valem o máximo de pessoas de folga no dia e o mínimo de pessoas trabalhando no dia (RN-GER-04).
- **RN-FOL-06 — Folga fixa (até duas por pessoa).**
  - A pessoa pode ter **uma ou duas folgas fixas** (ex.: sábado e domingo). A segunda só existe para quem tem 2 ou mais folgas na semana; para quem tem 1 (6x1), só a primeira vale, mesmo que haja uma segunda gravada.
  - A folga fixa é **travada**: o dia vale F em todas as semanas e o motor não pode movê-la (é validada como dia fixo). Conta como uma das folgas da semana.
  - Prioridade: férias/falta/atestado, dias fixados à mão e loja fechada vêm antes; a folga fixa vem antes do rodízio de domingos; num **dia sem folga** (24/12, 31/12) a pessoa trabalha, exceto quando o dia é domingo e ela não trabalha aos domingos.
  - Folga fixa no **domingo** = a pessoa não trabalha aos domingos: sai do rodízio de domingos (RN-DOM-05).
  - Pessoas em 12x36 não têm folga fixa.
  - Histórico: na versão de 21/10 a folga fixa podia ser movida pelo motor; isso foi corrigido. O domingo como folga fixa veio do relatório de ajustes (item 01, estagiários). A segunda folga fixa veio do pedido "cada colaborador pode até duas folgas".
- **RN-FOL-07 — Preferência de folga.** "Prefere folgar" é só preferência: quando possível o motor põe a folga variável nesse dia (bônus de −1,5 no custo).
- **RN-FOL-08 — O que o motor nunca muda:** células fixadas à mão; férias, faltas e atestados; dias com a loja fechada; folgas fixas; dias de 12x36; domingos de quem não trabalha domingo; domingos definidos pelo time; domingos escolhidos no ciclo automático (enquanto a geração roda); dias sem folga.

### 3.8 Domingos (RN-DOM)

- **RN-DOM-01 — Regra de domingo.** Existe na loja e, opcionalmente, em cada setor ("regra própria"; senão o setor segue a da loja). Valores:
  - **Rodízio "N×1"** (`alternado`): cada pessoa trabalha N domingos seguidos e folga 1. N de 1 a 6 no motor; a tela oferece de 1x1 a 4x1. **1x1 = "domingo sim, domingo não"** (Time A e Time B); **2x1 = dois domingos trabalhados e um de folga** (Times A, B e C), e assim por diante (pedido do relatório de ajustes, item 02).
  - **"Cada pessoa com sua regra"** (`individual`): cada pessoa tem o seu ciclo ("folga a cada N domingos"), com o domingo definido ou escolhido pelo sistema.
  - A regra só aparece quando a loja abre aos domingos.
- **RN-DOM-02 — Times.** No rodízio N×1 o ciclo tem `N+1` domingos e a equipe é dividida em `N+1` times (letras A até H). A cada domingo **um time folga** e os outros trabalham.
  - Qual time folga num domingo: `índice do domingo = ⌊(dias desde 01/01/1970 − 3) ÷ 7⌋`; o time que folga é a letra da posição `(índice mod ciclo) + 1` do ciclo, convertida em letra (no ciclo 2: índice par → Time B folga e Time A trabalha; índice ímpar → o contrário).
  - O revezamento segue o calendário e **não muda** quando o período de planejamento muda.
  - Exemplo (1x1): 25/10/2026 trabalha o Time A; 01/11 o Time B; 08/11 o A; 15/11 o B.
  - Internamente, o time é guardado como `ciclo` e `domingo de folga do ciclo`.
- **RN-DOM-03 — Domingo da pessoa em time.** No domingo de folga do seu time a pessoa fica F (conta como folga da semana); nos outros trabalha (D, turno de domingo). Os dois são fixos para o motor. Um dia fixado à mão tem prioridade.
- **RN-DOM-04 — Feriado aberto não segue os times.** O motor decide quem trabalha.
- **RN-DOM-05 — Não trabalha domingo.** Todos os domingos abertos ficam F. Acontece quando a pessoa está como "Não trabalha domingo" ou tem folga fixa no domingo. Não entra nos times.
- **RN-DOM-06 — Entrar num time automaticamente.** Ao adotar uma regra N×1 (loja ou setor), ao incluir pessoas e ao voltar do 12x36, quem trabalha aos domingos e ainda não tem time válido para a regra do setor vai para o time **com menos gente do mesmo turno**; empate: o time com menos gente no setor; novo empate: a ordem A, B, C. As pessoas são tratadas em ordem de horário de entrada e nome. Quem já tem time válido continua nele.
- **RN-DOM-07 — Dividir de novo** ("Dividir em times" / reequilibrar, Equipe; exige confirmação): refaz os times de todos do setor que entram no rodízio com o critério de RN-DOM-06 (ignorando os times atuais) e refaz a escala do setor (dias fixados à mão ficam).
- **RN-DOM-08 — Aplicar uma regra de domingo** (Personalizar ou tela Domingos): grava a regra na loja ou no setor, coloca nos times quem precisa e **refaz a escala** dos setores afetados (dias fixados à mão ficam). Antes de aplicar, a tela mostra a prévia dos domingos de trabalho e de folga (RN-DOM-12). Lojas antigas sem regra ficam em "cada pessoa com sua regra" sem refazer nada; para passar ao rodízio o usuário escolhe em Personalizar, com confirmação.
- **RN-DOM-09 — Ciclo com escolha automática** (regra individual, sem domingo definido): o motor testa cada domingo possível do ciclo e fica com o que deixa as folgas de domingo mais equilibradas, penalizando passar do limite diário. Os domingos escolhidos ficam presos durante a otimização.
- **RN-DOM-10 — Turno de domingo habitual da pessoa.** Escolhido em Equipe ("Turno de domingo") ou na tela Domingos. Ao mudar, os domingos e feriados já escalados que tinham outro turno de domingo escolhido à mão **voltam ao habitual** (trabalho/folga e fixação ficam). (Correção do pedido "Atualização 2.0", item 4: a pessoa continuava no turno de abertura depois de mudar para fechamento.)
- **RN-DOM-11 — Referência legal de domingos (alertas).** Se o ciclo da pessoa for maior que a referência (mulheres 1 a cada 2; demais 1 a cada 3) → aviso de atenção. Se a escala tiver a pessoa trabalhando, em seguida, o número de domingos da referência → problema. Os valores são parâmetros editáveis e não se aplicam ao 12x36. [INFERIDO] (ver 11.5)
- **RN-DOM-12 — Prévia dos domingos.** Para cada pessoa e domingo a tela calcula o previsto: F se não trabalha domingo ou tem folga fixa no domingo; F/T pelo time; "?" quando o sistema escolhe. Ver tela Domingos e Personalizar → Regra de domingo.
- **RN-DOM-13 — Domingo fechado.** Com a loja fechada aos domingos não aparecem os quadros de times e de regra de domingo, o grupo "Domingo e feriados" em Fluxo alto nem os turnos de domingo em Horários. Todos os domingos valem F.

### 3.9 Feriados e dias sem folga (RN-FER)

- **RN-FER-01 — Cadastro.** Data obrigatória, sem repetir datas. Nome vazio vira "Feriado". Todo feriado novo começa com a loja **fechada**. Lista ordenada por data.
- **RN-FER-02 — Feriado fechado.** Ninguém trabalha; o dia vale H. Com "feriado com a loja fechada conta como folga" **ligado (padrão)**, cada feriado fechado na semana reduz em 1 as folgas exigidas na semana (ex.: 25/12 fechado numa semana 5x2 → a pessoa recebe só mais 1 folga). Desligado, o feriado é só um dia indisponível e a pessoa continua com todas as folgas. (Pedido do relatório de 28/10.)
- **RN-FER-03 — Feriado aberto.** Vale como dia especial: horário de domingo, turno de domingo (D), faixas de necessidade de domingo, movimento de domingo. Não segue os times.
- **RN-FER-04 — Dias sem folga.** Lista de datas em que ninguém folga: "só neste ano" (AAAA-MM-DD) ou "todo ano" (MM-DD). Nesses dias **todos trabalham** (o motor não põe folga), exceto: dias já fixados à mão, férias/faltas/atestados, loja fechada, 12x36 e, quando o dia cai num domingo, quem não trabalha aos domingos. Pedido do relatório de 28/10 ("ninguém folgue dia 24 e nem dia 31/12").
- **RN-FER-05 — Limite de folgas nas semanas com dia sem folga.** Se a semana tem dias sem folga, o máximo de folgas por dia dos outros dias sobe na proporção `⌈máximo × dias abertos ÷ (dias abertos − dias sem folga)⌉`, para as folgas caberem.
- **RN-FER-06 — Refazer as semanas afetadas.** Incluir ou excluir feriado, mudar "loja abre" ou mexer nos dias sem folga apaga, **em todos os setores**, as células não fixadas das semanas que contêm as datas, e a escala é completada de novo (férias, faltas, atestados e dias fixados ficam).
- **RN-FER-07 — Exibição.** Ver telas Escala (semana e mês) e PDFs.

### 3.10 Geração da escala (RN-GER)

- **RN-GER-01 — Abrangência.** Cada geração vale para **um setor** e **todo o período**. Os outros setores não mudam.
- **RN-GER-02 — Sequência completa de "Gerar escala".**
  1. Meses "limpos" do período deixam de ser limpos.
  2. O motor calcula as folgas (RN-GER-05).
  3. Se a escala atual já é válida e tão boa quanto a nova, ela é mantida (RN-GER-08).
  4. A escala nova é aplicada (ou mantida).
  5. Ajustes de turno das Regras avançadas (rodízio de turnos e "quem fecha não abre"; regras 11 e 12 de RN-RAV).
  6. Almoços postos em dia: horário sugerido para quem não tem, rodízio, domingos e feriados (RN-ALM-02 a 07, 11).
  7. O relatório da geração aparece no topo da tela (4.2).
- **RN-GER-03 — Entradas.** Por dia: necessidade mínima e ideal por faixa, intensidade, limites diários, se é especial ou fechado. Por pessoa: códigos fixos (RN-FOL-08), faixas em que conta se trabalhar, horas de cada dia, folgas fixas, preferência, regra de domingo automática, folgas por semana e turno habitual. Também a cobertura vinda de pessoas remanejadas de outros setores (fixa) e as regras avançadas.
- **RN-GER-04 — Limite de folgas por dia.**
  - Se o usuário escolheu um limite em Regras avançadas (item 3), ele vale exatamente: em pessoas, ou em % da equipe do setor (`⌊pessoas × % ÷ 100⌋`). Feriado aberto usa o valor de domingo.
  - Sem limite escolhido, vale o limite oculto vindo dos dados (demonstração). **Na versão simplificada esse limite oculto sobe sozinho** quando as folgas da semana não cabem nele: se o que precisa cair nos dias limitados passa da soma dos limites, cada limite vira `⌈limite × fator⌉ + 1` (fator = necessário ÷ capacidade). Dias em que a folga é proibida pelas Regras avançadas ficam fora da conta. Domingo e feriado não contam como dia livre para essas folgas, porque a folga de domingo segue o rodízio de domingos (correção de 04/11/2026: antes, com sábado sem folga e domingo escolhido pelo sistema, equipes de 20 pessoas ou mais não conseguiam gerar). O relatório avisa: "Com N pessoas[ e dia da semana sem folga], o limite automático de pessoas de folga por dia não cabia todas as folgas da semana (a folga de domingo segue o rodízio): o sistema aumentou o limite na mesma proporção (segunda 5 → 12, …)."
  - Emenda de feriado com força "proibir" vira limite de folgas no dia antes e no dia depois do feriado (regra 6 de RN-RAV).
- **RN-GER-05 — Etapas do motor local** (heurística com busca local):
  1. domingos de ciclo automático (RN-DOM-09), presos;
  2. folgas fixas;
  3. folgas variáveis: uma pessoa-semana por vez, as mais restritas primeiro, escolhendo o dia de menor custo (RN-GER-07). Dias que estouram o limite diário custam +1.000.000; dias proibidos pelas Regras avançadas +500.000; dia que cria sequência acima do máximo +5.000;
  4. reparo de limites diários: move folgas de dias acima do limite para outro dia da mesma semana;
  5. busca local: troca o dia de uma folga variável dentro da semana sempre que isso reduz o custo sem quebrar regras (até 40 passadas);
  6. troca entre pessoas de **turnos diferentes** (mesmo dia, mesma semana; o total de folgas do dia não muda) para espalhar as folgas de cada turno pela semana, sem piorar a cobertura (até 6 passadas);
  7. reparo de dias seguidos: move uma folga para dentro da sequência longa; se não der, troca a folga com outra pessoa sem piorar a outra;
  8. reparo das regras proibitivas das Regras avançadas: muda a folga de dia na semana ou troca com outra pessoa;
  9. validação e avaliação.

  O motor roda **4 vezes** com sementes diferentes e fica com a melhor escala válida (o preenchimento automático usa 2).
- **RN-GER-06 — Função objetivo** (quanto menor, melhor). W = 1 (fraco), 2 (médio) ou 3,2 (forte).

  | Componente | Custo |
  |---|---|
  | Cada pessoa faltando abaixo do **mínimo** numa faixa | 10 × W |
  | Cada pessoa faltando abaixo do **ideal** numa faixa | 1 × W |
  | Equilíbrio de folgas entre os dias: f pessoas de folga num dia aberto | f × (f − 1) ÷ 2 |
  | Equilíbrio **por turno**: k pessoas do mesmo turno (de tamanho t) de folga no dia | 12 × k × (k − 1) ÷ 2 ÷ t, mais 60 × (k − teto) quando k passa do teto `máx(1, ⌈2t/6 + 0,5⌉)` |
  | Cada folga não fixada | 0,6 × intensidade do dia |
  | Folga no dia preferido | −1,5 |
  | Regras avançadas do tipo "evitar" e preferências | ver RN-RAV |

  O equilíbrio por turno veio do pedido "distribui as folgas por dia mas não leva em consideração o turno das pessoas": cada turno deve ter as folgas espalhadas pela semana, sem que um turno inteiro folgue no mesmo dia. Exemplo do teto: turno de 4 pessoas → teto 2; de 6 → 3; de 9 → 4.
- **RN-GER-07 — Custo de pôr a folga num dia.** Para cada faixa em que a pessoa estaria no posto: +10 × W se a contagem já está no mínimo ou abaixo; +W se está no ideal ou abaixo. Mais 0,6 × intensidade, + folgas já marcadas no dia, + o equilíbrio por turno, + o custo das Regras avançadas; −1,5 se for o dia preferido.
- **RN-GER-08 — Manter a escala atual.** Se a escala atual é válida e o custo dela é **menor ou igual** ao da nova, ela é mantida (as etapas 5 e 6 de RN-GER-02 ainda rodam). O relatório diz que a escala atual já é a melhor encontrada.
- **RN-GER-09 — Sem solução válida.** Se nenhuma tentativa cumpre todas as regras obrigatórias, **a escala atual não é alterada** e o relatório lista as causas (explicações de inviabilidade ou, na falta delas, as violações).
- **RN-GER-10 — Explicações de inviabilidade.** O motor verifica e explica:
  - folgas exigidas na semana maiores que a soma dos máximos diários;
  - mínimos diários maiores que as jornadas disponíveis;
  - mínimo diário maior que as pessoas disponíveis num dia;
  - folgas obrigatórias num dia maiores que o máximo de folgas;
  - dias de trabalho que, mesmo com as menores jornadas, passariam do limite semanal.
  - pessoa em 6x1 com folga só em alguns domingos (ciclo maior que 1), com máximo de 6 dias seguidos: na semana da folga de domingo a única folga é o domingo, então não cabe. Texto: "{pessoa}: em 6x1 com folga em 1 de cada N domingos não dá para cumprir o máximo de 6 dias seguidos — … Para 6x1, marque \"Folga todo domingo\" para essa pessoa em Equipe ou passe para 5x2."

  Textos na seção 8.
- **RN-GER-11 — Preenchimento automático.** Sempre que algum dado da loja muda (e ao abrir), cada setor com pessoas tem os **dias sem escala** do período preenchidos pelo motor, tratando o que já existe como fixo. É assim que ganham escala as pessoas novas, os dias que entram no período e os dias apagados por outras ações ("refazer"). **Meses limpos não são preenchidos** (ficam em branco até "Gerar escala").
- **RN-GER-12 — O que a geração guarda em cada dia.** Para cada dia do período grava o código e mantém a marca de fixado, o turno escolhido para o dia e o início de intervalo do dia. **Comportamento observado:** a duração de intervalo "só neste dia" e a marca de turno automático **não são mantidas** pela gravação da geração [PENDENTE] (ver 11.7).
- **RN-GER-13 — Registro.** A geração aplicada grava no setor a data e hora e o motor usado.
- **RN-GER-14 — Otimizador externo (CP-SAT).** Se houver um servidor de otimização, o resultado dele passa pela mesma validação e só é usado quando não é pior que o do motor local. As versões entregues (página publicada e programa de computador) não têm esse servidor. [MOTOR-SEM-TELA]
- **RN-GER-15 — Teto de cobertura.** O motor calcula as faixas em que, mesmo sem nenhuma folga, os turnos e intervalos não chegariam ao mínimo. O resultado não é exibido na versão simplificada. [MOTOR-SEM-TELA]
- **RN-GER-16 — Refazer.** Várias ações "refazem a escala" de um setor, de uma pessoa ou de semanas: elas apagam as células **não fixadas** (mantendo férias, faltas e atestados) e o preenchimento automático (RN-GER-11) monta de novo. Esse refazer usa só o preenchimento (sem a distribuição de almoços e sem os ajustes de turno das Regras avançadas, que só rodam em "Gerar escala").

### 3.11 Regras avançadas (RN-RAV)

Ficam na tela Regras avançadas (item próprio do menu; 4.12.9) e valem para a loja inteira (exceto onde indicado). "Evitar" entra como custo alto; "proibir" é restrição obrigatória validada (o motor tenta consertar na etapa 8 de RN-GER-05 e, se não conseguir, a geração falha e a escala atual fica).

| Nº | Regra | Como funciona |
|---|---|---|
| 1 | **Preferência das folgas da semana** (uma escolha) | "Separadas, quando der (padrão)": +12 por folga variável colada em outra folga da mesma pessoa; é desempate e cede quando faltaria gente no mínimo, quando outra regra pede (ex.: fim de semana completo, −16) e não vale para quem tem parceiro de folga (regra 8) nem para plantonistas. "Separadas, sempre": proibido colar folga variável em outra folga da mesma pessoa (se for impossível, vira aviso ao gerar). "Juntas (folga dupla), quando der": −14 quando a folga fica colada em outra; também cede para a cobertura mínima. "Sem preferência": nenhum custo, decide só pela cobertura. Em todas as opções os dias sem folga (regra 2), os limites por dia e as folgas fixas continuam valendo. Dados: `folgasSeparadas` ("proibir"; o valor antigo "evitar", +30, continua funcionando e aparece como "Separadas, quando der"), `folgasJuntas`, `folgasSemPreferencia`. "Onde vale" grava a mesma lista nas três. |
| 2 | **Dias da semana sem folga** (evitar/proibir), na loja toda ou só em setores escolhidos | Proibir: o dia não recebe folga variável. Evitar: +30. Ex.: "proibir folgas de sábado". |
| 3 | **Máximo de folgas por dia**, por setor, em pessoas ou % | Limite exato por dia da semana (RN-GER-04). |
| 4 | **Revezar o dia da folga** | +7 quando a folga repete o mesmo dia da semana anterior ou da seguinte; em cada dia da semana de segunda a sábado (dias abertos), custo de 12 por folga que a pessoa já tem naquele dia da semana a mais que a média da equipe, para dividir as folgas de cada dia por igual. O domingo fica de fora: segue o rodízio de domingos. Esse peso fica abaixo do custo de faltar gente no mínimo num dia normal, então a divisão cede quando atrapalharia a cobertura mínima. |
| 5 | **Um fim de semana completo por mês** | −16 para a folga de sábado ou segunda colada na folga de domingo, se a pessoa ainda não teve fim de semana completo no bloco de 4 semanas. |
| 5b | **Quem folga no domingo também folga no sábado** (até X% da equipe por fim de semana; ao ligar, 30%) | O gerador escolhe, em cada fim de semana, até ⌊X% × pessoas do setor (sem 12x36)⌋ pessoas com folga no domingo para folgar também no sábado anterior (as duas folgas da semana). Revezamento: primeiro quem teve menos fins de semana inteiros. Para não passar de 6 dias seguidos (sábado e domingo anteriores + segunda a sexta), a pessoa também folga no domingo anterior quando ele foi escolhido pelo rodízio do sistema (conta como folga daquela semana); domingo de time fixo não é mexido, então quem é de time só ganha o par quando já folgou no domingo anterior. Quem tem folga fixa num dia da semana só entra se sobrar folga na semana. Exceções: o sábado colado ao domingo vale mesmo com o sábado como dia sem folga (regra 2) e não conta como "folgas coladas" (regra 1). O limite de folgas do sábado sobe até o máximo da regra. Validação: mais pares que o máximo num fim de semana (com folga escolhida pelo sistema) é violação: "Fim de semana dd/mm: N pessoas de folga no sábado e no domingo (máximo M pela regra \"sábado com domingo\")." Na Loja 1 simulada (100 pessoas, sábado sem folga, 30%): todos os setores geram, com exatamente o máximo de pares em cada fim de semana e cobertura praticamente igual. |
| 5b′ | **Rodízio dos sábados de folga** (sempre ligado, desde 07/11/2026) | O sábado de folga é dos mais disputados. Depois da busca, a geração troca, na mesma semana, o sábado de folga de quem tem mais sábados pela folga de um dia de semana de quem tem menos (as contagens de cada dia não mudam), até a diferença entre as pessoas ser de no máximo 1, respeitando as outras regras, os dias seguidos, folgas fixas, dias travados à mão e os fins de semana da 5b. Quem tem folga fixa num dia da semana fica fora da comparação. O "domingo anterior" da 5b só é usado quando a semana começa na segunda (sábado e domingo na mesma semana); com a semana começando no domingo não é preciso, e antes isso deixava quase todos sem fim de semana (só quem folgava domingos seguidos ganhava). A regra 5b passou a distribuir os fins de semana inteiros **em rodadas**: todo mundo que pode ganha 1 antes de alguém ganhar o 2º; dentro da rodada, primeiro quem tem menos fins de semana possíveis (recalculado a cada escolha); o fim de semana escolhido é o que não pede folga extra na semana anterior, nunca colado a outro da mesma pessoa (quando há alternativa) e com mais vaga. Quando o domingo anterior é de time fixo, a folga extra da semana anterior vai para o sábado anterior (em vez do domingo). A conta da 5b aparece por extenso na tela: "Fiscais de Caixa: 8 pessoas × 30% = 2,4 → até 2 por fim de semana (arredonda para baixo). Em 8 semanas, 16 fins de semana inteiros: 2 para cada pessoa, em rodízio." Ao gerar, a escala atual só é mantida se também cumprir os sábados e os fins de semana tão bem quanto a nova (antes, com a regra recém-ligada, a escala antiga podia ficar sem nenhum fim de semana inteiro). Relatório: "Sábados de folga em rodízio: de 2 a 3 por pessoa no período (sem contar quem tem folga fixa na semana). Fins de semana inteiros (regra 5b): 16 no total — 2 por pessoa." Nos dados da Loja 1 (30%): todos os setores com diferença de no máximo 1 em sábados e em fins de semana inteiros. Pedido: "as folgas no sábado são sempre as melhores, então naturalmente as folgas do sábado devem haver um rodízio entre todos os colaboradores". |
| 5c | **Quem folga no domingo também folga na segunda** (até X% da equipe por domingo; ao ligar, 30%) | O gerador escolhe, em cada domingo, até ⌊X% × pessoas do setor (sem 12x36)⌋ pessoas com folga no domingo para folgar também na segunda seguinte. A segunda conta como uma das folgas da semana em que cai (com a semana começando na segunda, é a primeira folga da semana seguinte), e só entra quem ainda tem folga a tirar nessa semana e pode folgar na segunda pelas outras regras proibitivas. Revezamento: primeiro quem não ganhou o sábado (regra 5b), depois quem teve menos pares. Os dias seguidos continuam no máximo (6) pelo reparo da geração; não é preciso folgar em outro domingo. Quem tem folga fixa num dia da semana só entra se sobrar folga na semana. Exceções: a segunda colada ao domingo vale mesmo com a segunda como dia sem folga (regra 2) e não conta como "folgas coladas" (regra 1). O limite de folgas da segunda sobe até o máximo da regra. Validação: "Domingo dd/mm e segunda: N pessoas de folga nos dois dias (máximo M pela regra \"segunda com domingo\")." Nos dados da Loja 1 (30%): todos os setores geram sem violações, com exatamente o máximo de pares em cada domingo. |
| 6 | **Emenda de feriado** (evitar/proibir; máximo N pessoas) | No dia antes e no dia depois de um feriado (que não sejam feriado): no máximo N pessoas de folga. Proibir vira limite diário; evitar: +25 quando passa de N. |
| 7 | **Pessoas que não folgam no mesmo dia** (duplas; evitar/proibir) | Proibir: a dupla nunca folga no mesmo dia (folga variável). Evitar: +30 por coincidência. A dupla pode ser de **setores diferentes**: o setor gerado por último se ajusta à escala já existente do outro. |
| 8 | **Pessoas que preferem folgar juntas** (duplas) | −12 por coincidência. Também entre setores diferentes, com a mesma lógica da regra 7. |
| 8b | **Quem cobre a folga de quem** (duplas titular → substituto, do mesmo setor; opção "Também quando estiver de férias, com falta ou atestado") | Nos dias em que o titular está de folga (F; com a opção, também V, A ou M) e o substituto trabalha, o substituto vai para o **turno do titular** naquele dia: o turno escolhido para o titular no dia, se houver, senão o habitual (o de domingo/feriado nesses dias). A troca fica marcada como automática (como as regras 11 e 12) e é refeita **na hora** quando a folga de um dos dois muda, inclusive à mão (conferência em todas as lojas e setores, como RN-HOR-02), e ao gerar a escala. Dia com turno escolhido à mão para o substituto não é mexido. Na geração, o substituto evita folgar no mesmo dia do titular (custo +25 por coincidência). Relatório da geração: "Cobertura de folga: N dias com o substituto no turno de quem folgou." e "K folgas ficaram sem cobertura (o substituto também não trabalhava no dia)." Pedido de 07/11/2026: "Quando determinada pessoa estiver de folga, a pessoa que eu escolher irá para o turno dela, naquele dia de folga." |
| 9 | **Pessoa-chave** (evitar/proibir; mínimo por dia) | Pelo menos N pessoas-chave trabalhando por dia, em cada setor. Se o setor tem N pessoas-chave ou menos, "proibir" vira "evitar" (não daria para cumprir). Evitar: +40. Pessoas-chave são marcadas em Equipe → mais detalhes. |
| 10 | **Equilibrar os domingos trabalhados** | −4 × (domingos que a pessoa trabalhou − média) para a folga de domingo. Gera aviso quando a diferença entre quem mais e quem menos trabalhou domingos passa de 1. |
| 11 | **Quem fecha não abre no dia seguinte** | Depois da geração: se a pessoa fecha num dia (sai até 30 min antes do turno que sai mais tarde) e abre no seguinte (entra até 30 min depois do turno que entra mais cedo), o turno do dia seguinte troca para o próximo turno do mesmo tipo que não é de abertura. Turno escolhido à mão não muda. Sem alternativa, conta como "sem alternativa". |
| 12 | **Rodízio semanal de turnos** | Depois da geração: quem está num turno marcado "Entra no rodízio" (Horários) muda de turno a cada semana, em sequência pela hora de entrada, entre os turnos marcados (precisa de pelo menos 2). Só dias normais trabalhados; turno escolhido à mão não muda. |
| 13 | **Limite de horas extras por semana** | Só aviso: quando as horas da semana passam das horas do contrato mais o limite. |
| 14 | **Descanso mínimo entre jornadas ao gerar** (opcional; em branco = não usar) | Quando preenchido (ex.: 11h), a geração não escala ninguém em dois dias seguidos com menos descanso que isso, usando o turno de cada dia (semana, domingo/feriado ou o escolhido no dia). O gerador põe uma folga num dos dois dias (move uma folga da mesma semana ou troca com outra pessoa), sem passar dos dias seguidos, dos limites e das outras regras. Quem fecha no sábado que não pode ter folga e seguiria o time no domingo folga nesse domingo, com aviso: "Descanso mínimo de 11h entre jornadas: {pessoas} fecham no sábado (que não pode ter folga) e o turno de domingo abre cedo, então folgam nesses domingos em vez de seguir o time. Para manter o time, crie em Horários um turno de domingo que comece mais tarde." O que não tem como evitar (conflito real, ex.: mais gente precisando folgar no sábado do que o limite do dia) não impede a escala: aparece no relatório da geração como "{pessoa}: descanso de 10h36 entre sáb 07/11 e dom 08/11 (mínimo 11h entre jornadas)." Vale nos setores escolhidos em "Onde vale". Em branco, a geração ignora o descanso e só vale o aviso do valor de referência "Descanso mínimo entre jornadas". |

- **RN-RAV-01 — Ordem.** As regras 11 e 12 rodam depois das folgas e antes dos almoços. As trocas que elas fazem ficam marcadas como automáticas e são desfeitas e refeitas a cada geração (ver ressalva em RN-GER-12).
- **RN-RAV-02 — Regras proibitivas e validação.** As regras 1, 2, 7 e 9 com "proibir" geram violações quando uma folga **variável** as descumpre; folgas fixas, fixadas à mão e de domingo do time não contam como violação (foram decididas pelo usuário).
- **RN-RAV-03 — Regras por setor.** Cada setor segue as Regras avançadas da loja (padrão) ou tem **regras próprias**: os sete valores de referência (dias seguidos, folga de domingo geral e mulheres, descanso entre jornadas, intervalo mínimo e máximo, jornada diária máxima) e as regras extras 1 a 13 (exceto a 3, que já é por setor). Com regras próprias, o setor usa os seus valores na geração, nos alertas, na distribuição de almoços e nos ajustes de turno; os outros setores continuam com os da loja. Ao ligar, as regras próprias começam iguais às da loja ("dias sem folga" passa a valer para o setor; se na loja valia só para outros setores, começa desligada). Duplas (regras 7 e 8) gravadas nas regras do setor valem quando esse setor é gerado.
- **RN-RAV-04 — Onde vale cada regra.** Cada regra extra da loja (1, 1b, 2, 4, 5, 6, 9, 10, 11, 12, 13) pode valer em todos os setores (padrão) ou só nos setores escolhidos. Num setor fora da lista, a regra fica desligada na geração, nos alertas e nos ajustes de turno. Ao passar um setor para regras próprias, ele começa com as regras da loja como valem nele.

### 3.12 Edição manual e dias fixados (RN-MAN)

- **RN-MAN-01 — Ferramentas "Ao clicar num dia"** (Semana e Mês):

  | Ferramenta | Situação atual do dia | Resultado |
  |---|---|---|
  | Trabalho ↔ folga | F, A, M ou V | T (D em dia especial) |
  | Trabalho ↔ folga | T ou D | F |
  | Férias | V | T ou D |
  | Férias | outro | V |
  | Falta | A | T ou D |
  | Falta | outro | A |
  | Atestado | M | T ou D |
  | Atestado | outro | M |

- **RN-MAN-02 — Dia fechado.** Na Semana, uma troca que resultaria em trabalho num dia fechado é ignorada (as outras são gravadas). No Mês, dias fechados não são clicáveis.
- **RN-MAN-03 — Toda edição manual fixa o dia** (ponto no canto da célula). O motor mantém o dia nas gerações seguintes. O turno e o intervalo escolhidos para o dia continuam na célula.
- **RN-MAN-04 — Dia em branco.** Clicar num dia em branco (mês limpo) aplica a ferramenta sobre o código que o dia teria (trabalho) e grava o dia fixado.
- **RN-MAN-05 — Aviso de edição.** Depois de uma edição manual na loja em uso: o relatório da última geração é fechado; aparece o aviso "Você mudou N dia(s) à mão…" (4.2.2); se a pessoa editada é de outro setor, o setor da página muda para o dela.
- **RN-MAN-06 — Não há "desfixar".** Clicar de novo troca o valor, mas o dia continua fixado. Um dia só deixa de ser fixado se for apagado por "Limpar escala" com "Apagar também os dias que eu fixei à mão", por "Começar do zero", por restauração de dados ou por "Desfazer". [PENDENTE]
- **RN-MAN-07 — Trocar folga não muda o cadastro.** Trocas na Semana, no Mês ou em Domingos alteram só aquele dia. Mudanças permanentes (folga fixa, regra de domingo, turno) são feitas na Equipe ou em Domingos, seguidas de "Gerar escala".

### 3.13 Desfazer (RN-DES)

Pedido: "Precisava de um botão 'limpar escala', pois não é possível reverter."
- **RN-DES-01 — Histórico.** Antes de cada mudança nos dados, o sistema guarda como estavam **todas as lojas** e a loja em uso. Mudanças seguidas em menos de 1 segundo (como digitar um nome) contam como uma só. Guarda até **30** passos. O histórico fica só na memória da sessão (some ao recarregar a página).
- **RN-DES-02 — Desfazer** volta ao último estado guardado: lojas criadas depois desse ponto são apagadas do armazenamento; o relatório de geração e o aviso de edição manual são fechados; a loja em uso continua a mesma (se ainda existir). Não existe "Refazer". [PENDENTE]
- **RN-DES-03 — Onde fica.** Botão "↶ Desfazer" no cabeçalho da Escala e no Mês, link no aviso de escala em branco, botão "Desfazer" na mensagem flutuante que aparece logo depois de uma mudança (até 2,5 s depois dela) e o atalho **Ctrl+Z / Cmd+Z** (fora de campos de texto). Mensagens: "Mudança desfeita: voltou a como estava antes." / "Mudança desfeita: a escala voltou a como estava antes." / "Não há nada para desfazer."

### 3.14 Limpar escala e meses em branco (RN-LIM)

- **RN-LIM-01 — O que é apagado.** Nos setores escolhidos (o da tela ou todos os da loja), em todas as pessoas, as células dos meses escolhidos — **exceto** férias, faltas e atestados (nunca apagados) e, sem a opção "Apagar também os dias que eu fixei à mão", os dias fixados.
- **RN-LIM-02 — Almoços.** Por padrão, limpar a escala **não mexe nos almoços**. Com "Apagar também os horários de almoço" marcado, também são apagados os almoços do dia nos meses escolhidos (inclusive os "só neste dia") e o horário fixo das pessoas dos setores escolhidos; o sistema sugere horários novos na hora (RN-ALM-02).
- **RN-LIM-03 — Meses em branco.** Os meses limpos ficam marcados no setor. Neles, dias sem célula **não** valem como trabalho: aparecem como quadradinhos vazios (pedido: "é importante que limpe o campo com os quadradinhos na hora que eu clicar no botão"). O preenchimento automático não preenche esses meses. O registro de geração do setor é apagado.
- **RN-LIM-04 — Saída do branco.** "Gerar escala" remove a marca dos meses limpos que estão dentro do período e gera normalmente. Meses limpos fora do período continuam marcados.
- **RN-LIM-05 — Efeitos na tela.** Com mês em branco no período: aviso "Escala em branco"; indicadores, sugestões e cobertura escondidos; contagens e horas da Semana e do Mês ignoram os dias em branco.
- **RN-LIM-06 — Reversão.** Pode ser desfeito (RN-DES). O botão fica desabilitado durante a geração.

### 3.15 Cores do mapa de cobertura (RN-COR)

- **RN-COR-01 — Critério "% do quadro do setor"** (padrão): base = pessoas cadastradas no setor (sem ninguém, o maior número de pessoas no posto na semana). `limite pouca gente = ⌈base × "pouca gente abaixo de" ÷ 100⌉`; `limite muita gente = ⌈base × "muita gente a partir de" ÷ 100⌉`.
  - **Quantas cores** ("Estilo"): "2 cores", "3 cores" (padrão), "4 cores" ou "Degradê de uma cor".
  - **Faixa de cada cor:** nas opções de 2, 3 e 4 cores, a legenda mostra uma linha por cor com "de X% a Y%" e a quantidade de pessoas correspondente. A primeira faixa começa em 0% e a última vai até 100%; o fim de uma faixa é o começo da seguinte (mudar um muda o outro), sem passar dos limites vizinhos.
  - **2 cores:** "Menos funcionários" (vermelho) quando no posto < limite pouca gente ou = 0; "Gente suficiente" (verde escuro) nos demais. Só o campo "Pouca gente abaixo de" aparece.
  - **4 cores:** acrescenta o limite "Número médio a partir de" (entre "pouca" e "muita"; padrão: o meio, arredondado de 5 em 5). Faixas: "Menos funcionários" (vermelho) abaixo de pouca gente; "Abaixo do médio" (âmbar) de pouca gente até antes do médio; "Número médio" (verde claro) do médio até antes de muita gente; "Mais funcionários" (verde escuro) a partir de muita gente. A cor de "Abaixo do médio" também pode ser trocada.
  - **3 cores:** "Mais funcionários" (verde escuro) quando no posto ≥ limite muita gente e > 0; "Menos funcionários" (vermelho) quando < limite pouca gente ou = 0; "Número médio" (verde claro) nos demais.
  - **Degradê:** uma cor, mais forte quanto mais gente (de 12% a 100% da cor, em relação ao maior entre base e pico); contorno na cor de "pouca gente" quando abaixo do limite.
- **RN-COR-02 — Limites padrão:** pouca gente abaixo de **50%**, muita gente a partir de **80%** (pedido original: "vermelho para o horário com menos funcionários, verde claro número médio, verde escuro com mais de 80% do quadro"). Os 50% foram definidos pelo protótipo [INFERIDO]. Os campos andam de 5 em 5, "pouca" vai de 0 até "muita", "muita" vai de "pouca" até 100.
- **RN-COR-03 — Critério "Fluxo alto (mínimo)":** vermelho = falta gente; verde claro = no limite; verde escuro = folga de gente; cinza = sem necessidade; amarelo = abaixo do ideal (RN-COB-04).
- **RN-COR-04 — Cores escolhidas.** As três cores podem ser trocadas (clicando na legenda) e voltam ao padrão com "Voltar às cores originais". A cor do texto é escolhida pelo contraste. (Correção pedida: "a edição de cor com menos funcionários está bugada".)
- **RN-COR-05 — Persistência.** Critério, estilo, limites e cores ficam na configuração da loja (compartilhados). O tamanho das células fica no navegador.
- **RN-COR-06 — Faixas exibidas.** Só faixas de dias abertos que estão abertas, têm necessidade ou têm gente.

### 3.16 Alertas e sugestões (RN-ALE)

- **RN-ALE-01 — Alertas de cobertura** ("problema"), um por dia da semana (segunda a domingo):
  1. para cada faixa, em todas as semanas, a maior falta abaixo do mínimo, em quantas semanas e **em quais datas** ela ocorre;
  2. faixas seguidas com a mesma falta e as mesmas datas viram um intervalo: "falta(m) K {papel} entre HH:MM e HH:MM[ em dd/mm, dd/mm e dd/mm]" (as datas só aparecem quando a falta não ocorre em todos os dias daquele dia da semana; até 5 datas e "e mais N");
  3. título: o dia da semana por extenso; texto "cobertura insuficiente em X de Y semanas[ (dd/mm, …)]". (Pedido do relatório de 28/10: "ele fala que está faltando gente em um domingo, mas não especifica qual é".)
- **RN-ALE-02 — Alertas das regras obrigatórias** ("problema"), vindos das violações da escala atual (RN-FOL, RN-RAV), com os títulos "Folgas", "Jornada semanal", "Dias seguidos", "Domingos" e "Limite diário". **Comportamento observado:** violações de dia fixo e de regras avançadas também recebem o título "Limite diário". [PENDENTE]
- **RN-ALE-03 — Alertas de cadastro e de referência:**

  | Situação | Gravidade | Título |
  |---|---|---|
  | Jornada > 6h com intervalo menor que o mínimo | problema | Turno {nome} |
  | Intervalo maior que o máximo | atenção | Turno {nome} |
  | Jornada maior que a diária máxima (não vale para plantão) | problema | Turno {nome} |
  | Intervalo fora do horário do turno | problema | Turno {nome} |
  | Janela do intervalo que termina antes de começar | problema | Turno {nome} |
  | Observações de intervalo (RN-ALM-09) | atenção | Intervalo |
  | Pessoa sem turno válido | problema | {pessoa} |
  | Jornada contratual acima do limite semanal | atenção | {pessoa} |
  | Estagiário com mais de 6h por dia | problema | {pessoa} |
  | Jovem aprendiz com mais de 6h por dia | atenção | {pessoa} |
  | Horas próprias (jornada, estágio, aprendiz ou modelo diferente) acima do contrato numa semana | problema | {pessoa} |
  | Ciclo de domingo acima da referência pelo sexo (não 12x36) | atenção | {pessoa} |
  | Domingos trabalhados seguidos atingindo a referência | problema | {pessoa} |
  | Descanso entre jornadas abaixo do mínimo (só a 1ª ocorrência por pessoa) | problema | {pessoa} |
  | Remanejamentos sobrepostos / sem habilitação / fora do turno [MOTOR-SEM-TELA] | problema / atenção | {pessoa} |
  | Horas extras acima do limite da regra 13 | atenção | {pessoa} |
  | Domingos trabalhados desiguais (regra 10; diferença > 1) | atenção | Domingos |
  | Pessoas-chave insuficientes no setor (regra 9) | atenção | Pessoas-chave |

- **RN-ALE-04 — Sugestões ("Onde vai faltar gente").** Os **3** intervalos de falta mais graves: `pessoas faltando × minutos × (semanas com falta ÷ semanas)`. A ação vem do que acontece com a equipe no meio do intervalo, na primeira semana com falta (vale o primeiro caso):
  1. pessoas em intervalo ≥ falta → "N pessoa(s) estão em intervalo nesse horário (M do turno X). Abra a Escala de Almoço e clique em “Distribuir os almoços de todos os dias” (ou gere a escala de novo: os almoços são distribuídos automaticamente).";
  2. quem ainda não chegou ≥ falta → "Ainda não chegou gente suficiente. Antecipe a entrada de N pessoa(s) ou crie em Horários um turno que comece antes das HH:MM.";
  3. quem já saiu ≥ falta → "A equipe já saiu nesse horário. Crie em Horários um turno que vá até depois das HH:MM e passe N pessoa(s) para ele.";
  4. alguém de folga → "N pessoa(s) estão de folga nesse dia. Clique em Gerar escala para reorganizar as folgas; se continuar faltando, a equipe é pequena para essa necessidade.";
  5. nenhum → "A equipe não é suficiente para essa faixa. Reduza a necessidade em Fluxo alto ou cadastre mais pessoas."
- **RN-ALE-05 — Marca nas abas.** A aba de um setor ganha um ponto vermelho quando o setor tem algum alerta "problema".

### 3.17 Indicadores (RN-IND)

| Indicador | Cálculo | Cor |
|---|---|---|
| Horários cobertos | % coberto (RN-COB-05), 1 casa | verde ≥ 99,5%; âmbar ≥ 95%; vermelho abaixo |
| Horas faltando | horas faltando por semana, `XhYY` | vermelho > 0; verde = 0 |
| Horas por pessoa | média de horas trabalhadas por pessoa por semana (dias do período) | neutro; subtítulo com o limite semanal |

### 3.18 Setores (RN-SET)

- **RN-SET-01 — Criação.** Nome obrigatório. Singular "colaborador", plural "colaboradores", função "Colaborador". Cor: a primeira da paleta não usada por setor visível. Turnos "Abertura" (08:15, intervalo 12:00 de 1h), "Tarde" (09:30, intervalo 13:30 de 1h) e "Domingo" (08:15, 4h, padrão de domingo). Sem necessidade. Movimento padrão: dom/seg/ter fraco, qua/qui médio, sex/sáb forte. Posto com o nome do setor. O setor novo vira o setor da página. Nome igual ao de um setor escondido mostra o escondido em vez de criar outro.
- **RN-SET-02 — Edição.** Nome, cor e ordem (arrastando ou com as setas do teclado). Os termos singular/plural não são mais editáveis na tela (continuam sendo usados nos textos).
- **RN-SET-03 — Esconder e mostrar.** Escondidos não aparecem nas abas, filtros, Mês, gráficos e cópias. Não é possível esconder o último visível. Se o setor da página for escondido, a página vai para o primeiro visível. As pessoas do setor escondido continuam cadastradas.
- **RN-SET-04 — Exclusão** (com confirmação): apaga o setor e as pessoas dele; tira o setor das habilitações; apaga remanejamentos para o setor e de pessoas apagadas e as atividades delas.
- **RN-SET-05 — Paleta:** `#2a78d6`, `#eb6834`, `#1baf7a`, `#eda100`, `#e87ba4`, `#008300`, `#6250d6`, `#e34948` (validada para daltonismo). Setores visíveis sem cor ou com cor antiga recebem a próxima livre ao abrir.
- **RN-SET-06 — Catálogo** (usado em "Começar do zero" e em lojas em branco): Frente de Caixa (operador), Fiscais de Caixa (fiscal), Empacotadores (empacotador), Açougue (açougueiro), Padaria (padeiro), Hortifruti (repositor), Reposição (repositor), Frios (atendente), Depósito (conferente), Limpeza (auxiliar), Prevenção de Perdas (fiscal), Outros (colaborador).

### 3.19 Copiar escala (RN-COP)

- **RN-COP-01 — Pareamento por posição.** "Regras de folga" e "Folgas do período" usam a ordem de cadastro: a 1ª pessoa do destino recebe o padrão da 1ª da origem, e assim por diante; se o destino tem mais pessoas, o padrão recomeça do início. Se a origem tem mais pessoas, só as primeiras são usadas (aviso), a não ser que "Criar as vagas que faltam" esteja marcada.
- **RN-COP-02 — Turnos.** Os turnos do destino são substituídos por cópias dos da origem; as pessoas do destino vão para o turno de mesmo nome (senão, o de mesma posição; senão, o primeiro); intervalos próprios são apagados; dias com turno escolhido são remapeados.
- **RN-COP-03 — Fluxo alto (necessidade).** As faixas do destino são substituídas pelas da origem e o movimento é recalculado.
- **RN-COP-04 — Regras de folga.** Copia folgas fixas (as duas), preferência, ciclo e domingo de folga (time) e o turno.
- **RN-COP-05 — Folgas do período.** Copia T/D/F dia a dia (não fixados) nas datas do período do destino; dias fixados, férias, faltas e atestados do destino não mudam; dias fechados são pulados.
- **RN-COP-06 — Vagas.** Cria pessoas sem nome no destino até igualar o número da origem.
- **RN-COP-07 — Confirmação.** Se algo existente no destino será substituído, o aceite é obrigatório. A cópia não refaz a escala: a mensagem orienta a gerar cada setor.

### 3.19b Um horário só (RN-HOR)

- **RN-HOR-01 — Mudou, vale em tudo.** O horário de uma pessoa é calculado num lugar só (turno do dia + jornada própria + almoço) e todas as telas usam esse cálculo: Escala (semana, mês e relatório), Cobertura, Escala de Almoço e seu gráfico, Equipe, Domingos, alertas, geração da escala, PDFs e Excel. Mudar o horário em qualquer lugar muda em todos: o turno ou as folgas (Equipe), o horário do turno (Horários), o turno de um domingo (Domingos), o almoço e o tempo de almoço (Equipe ou Escala de Almoço), o almoço do domingo e o almoço só de um dia. Pedido de 07/11/2026: "se eu mudar o horário de alguém, ele deve responder em todos os demais comandos".
- **RN-HOR-02 — Almoços sempre em dia.** Desde 07/11/2026, a conferência dos almoços (RN-ALM-11) roda para **todas as lojas e setores** a cada mudança, qualquer que seja a tela aberta (antes, só na Escala, em Horários e na Escala de Almoço, e só no setor aberto).
- **RN-HOR-03 — O almoço escolhido fica.** Mudar o turno, a jornada, a contratação ou as folgas (5x2 ↔ 6x1) de alguém mantém o horário de almoço escolhido se ele ainda couber no novo expediente e no horário de intervalo do turno; senão, ele sai e o sistema sugere outro. Antes, essas mudanças sempre apagavam o horário escolhido.
- Conferido pelo teste de navegador `test_horario_em_todos.py` (almoço, turno, horário do turno e folgas → Escala, Equipe, Escala de Almoço, gráfico e depois de recarregar).

### 3.20 Persistência e dados (RN-DAD)

- **RN-DAD-01 — Onde os dados ficam** (nesta ordem): programa de computador → arquivo local; servidor configurado (não usado nas versões entregues); banco da página publicada (compartilhado por quem tem acesso); armazenamento do navegador. O rodapé do menu mostra "Salvo no computador", "Servidor (SQLite)", "Salvo nesta página (compartilhado)" ou "Salvo neste navegador".
- **RN-DAD-02 — Salvamento automático.** Cada mudança marca a loja como alterada e grava 0,9 s depois da última mudança (0,05 s depois de criar a demonstração; 0,2 s depois de restaurar, criar loja ou desfazer). Estados no rodapé do menu: "Salvando…" (ponto âmbar), "Salvo às HH:MM" (verde), "Tudo salvo" (antes da primeira gravação), "Erro ao salvar" (vermelho; as lojas voltam a ficar pendentes). Desde 06/11/2026, ao fechar, recarregar ou trocar de aba com mudanças ainda esperando, o sistema grava na hora (antes, uma mudança feita menos de 1–2 s antes de recarregar podia se perder).
- **RN-DAD-03 — Formato compacto da escala.** A escala é gravada como uma letra por dia em sequências de datas seguidas (letra minúscula = dia fixado), mais um mapa à parte com o turno de cada dia e o almoço do dia ("turno|HH:MM|duração!", em que "!" marca o almoço escolhido "só neste dia"). Desde 07/11/2026 o mapa também guarda a marca de turno automático ("~"), usada pelas regras 8b, 11 e 12.
- **RN-DAD-04 — Banco da página publicada.** Um documento por loja (configuração e setores sem escala e sem pessoas) e um por loja e setor (pessoas do setor e escala compacta). Só os documentos alterados são gravados. Sem controle de conflito: vale a última gravação. [PENDENTE]
- **RN-DAD-05 — Programa de computador** (Windows e Mac):
  - dados em `Documentos/Escala 5x2/dados.json`; no Mac, se a pasta Documentos não puder ser usada, na pasta do programa (`…/Application Support/Escala 5x2 Simples/dados`);
  - a cada gravação, a versão anterior vai para `dados.backup.json`; gravação atômica; se o arquivo principal não puder ser lido, usa a cópia;
  - menu **Arquivo**: "Abrir pasta dos dados", "Salvar cópia dos dados…", "Restaurar dados de uma cópia…" (arquivo inválido: "Arquivo inválido — O arquivo escolhido não é uma cópia de dados do Escala 5x2."; depois de restaurar, a janela recarrega);
  - menu **Exibir**: Recarregar, Aumentar, Diminuir, Tamanho normal, Tela cheia; no Mac também **Editar** (Desfazer, Refazer, Recortar, Copiar, Colar, Selecionar tudo) e **Janela**;
  - menu **Ajuda**: "Sobre o Escala 5x2" (versão e onde ficam os dados);
  - uma janela por vez; idioma pt-BR (horários em 24h); exportações abrem "Salvar como".
- **RN-DAD-06 — Primeira abertura.** Sem dados, o sistema cria a loja de demonstração (Apêndice A) já com a regra de domingo 1x1 e os times, gera a escala e grava.
- **RN-DAD-07 — Ajustes automáticos ao abrir** (dados antigos):
  - setores visíveis sem cor ou com cor antiga recebem cores da paleta;
  - sem "semana começa": fica o dia em que o período já começa (domingo se começa num domingo; senão segunda), **sem refazer nada**;
  - sem regra de domingo: fica "Cada pessoa com sua regra", **sem refazer nada** (para passar ao rodízio, o usuário escolhe em Personalizar com confirmação);
  - setor da página escondido → primeiro visível.
  - Ao abrir, **nada é refeito sozinho** além de completar dias sem escala (decisão "nada é refeito sozinho ao abrir").
- **RN-DAD-08 — Preferências do navegador:** loja e setor abertos, lojas do filtro, tamanho do mapa, ordem da Escala de Almoço. Filtros das telas não são guardados.

### 3.21 Exportações (RN-EXP)

Nomes de arquivo em minúsculas; sequências que não são letra ou número viram "-".

| Saída | Onde | Conteúdo | Filtros |
|---|---|---|---|
| PDF da semana (`escala-[N-lojas-]{setor ou N-setores}-AAAA-MM-DD.pdf`) | Semana → "Baixar semana (PDF)" | A4 deitado, uma página por loja e setor mostrados. "Simulador Escala 5x2 · {loja} · {setor}" e "Escala da semana dd/mm/aaaa a dd/mm/aaaa". Por dia: "HH:MM–HH:MM" e "int. HH:MM", ou FOLGA, FÉRIAS, FALTA, ATESTADO, FERIADO (nas cores da loja) | Respeita setores e lojas mostrados; **não** respeita turno, função, busca e ordenação (todas as pessoas do setor, em ordem de cadastro) |
| PDF individual (`escala-individual-{nome ou N-pessoas}-AAAA-MM-DD.pdf`; na Equipe `escala-individual-{setor}-N-pessoas.pdf`) | Semana e Equipe → "Escala por pessoa (PDF)" | A4 em pé, uma ou mais páginas por pessoa: faixa "SIMULADOR ESCALA 5X2 · {loja}", nome, "{setor} · {turno} · HH:MM–HH:MM · intervalo HH:MM–HH:MM", "Sua escala de dd/mm/aaaa a dd/mm/aaaa", tabela Data, Dia, Situação, Entrada, Intervalo, Saída (folgas em destaque; nome do feriado), "Semana N: Xh de trabalho" ao fim de cada semana, "N folgas no período · M domingos de folga" e linha "Assinatura do colaborador" | As pessoas listadas (com filtros), na ordem da tela, no período todo |
| PDF do mês (`escala-{setor}-AAAA-MM[-N-lojas].pdf`) | Mês → "Baixar mês (PDF)" | A4 deitado, uma página por loja. "Simulador Escala 5x2 · {loja} · {setor}" e "Escala de {mês de ano} · T trabalho · D domingo/feriado · F folga · V férias · A falta". Colunas Pessoa, dias, Folgas, Horas. Dias fora do período em branco | Setor, turno, função, busca e ordenação do Mês |
| Excel (`escala-…-AAAA-MM-DD.xlsx`) | Semana → "Excel" | Abas "Resumo" e, por setor, "Escala {setor}", "Cobertura {setor}", "Pessoas {setor}" (prefixo "L1 ", "L2 "… com várias lojas) | Setores e lojas mostrados |
| Excel da loja (`escala-{loja}.xlsx`) | Personalizar → Dados | O mesmo, para todos os setores com pessoas | — |
| Rankings e férias | Dashboards e Férias | 4.6 e 4.7 | Filtros da tela |
| Modelo de importação | Equipe → Importar | 4.3.6 | — |
| Cópia de segurança (JSON) | Personalizar → Dados | todas as lojas | — |

**Conteúdo do Excel:** "Resumo" ("{rede} — {loja}", período, semanas, folgas/semana, jornada, limite; por setor: Setor, Pessoas, Cobertura dos mínimos, Déficit (h/semana), Problemas, Horas médias/pessoa). "Escala": Nome, Função, um código por dia ("Seg 26/10"), horas de cada semana ("Sem 1"…), cores por código (as da loja), nota "Bloqueada" nos dias fixados, linha "Trabalhando". "Cobertura": pessoas no posto por faixa e dia, coloridas pela situação da necessidade, nota "Mínimo N[ · ideal M]". "Pessoas": Função, Nome, Matrícula, Sexo, Regime, Turno, Domingo ("Dia sim, dia não", "Não trabalha", "Time A/B (domingo sim, domingo não)" só no 1x1, ou "Folga 1 a cada N"), Folga fixa ("Sáb e Dom"), Jornada contratual, Contratação, Horas por dia, Coringa; depois turnos (Entrada, Intervalo, Duração, Jornada efetiva, Saída, Domingo/feriado, 12x36), faixas (Dias, De, Até, Mínimo, Ideal, Observação) e alertas.

**Mensagens dos downloads:** sucesso "Arquivo gerado." (Semana), "PDF do mês gerado.", "PDF com N escalas individuais gerado.", "Cópia de segurança gerada.", "Planilha gerada."; cancelamento "Download cancelado."; indisponível "Não foi possível baixar o arquivo aqui."; falha "Falha ao gerar o arquivo: {detalhe}". Na página publicada o download usa o recurso de downloads da página; no programa, a janela "Salvar como".

---

## 4. Telas

Cada tela é descrita com objetivo, cabeçalho, campos, botões, filtros, tabelas, quadros e as regras próprias. As regras gerais estão na seção 3 e são citadas pelo identificador.

### 4.1 Estrutura comum

#### 4.1.1 Abertura

1. Enquanto os dados carregam aparece "Carregando escalas…".
2. O sistema escolhe onde os dados ficam (RN-DAD-01) e lê todas as lojas. Sem dados (ou se a leitura falhar), cria a loja de demonstração (RN-DAD-06).
3. Todas as lojas passam pelo preenchimento automático (RN-GER-11) e pelos ajustes de dados antigos (RN-DAD-07).
4. Abre a loja e o setor usados por último neste navegador; senão, a primeira loja e o primeiro setor visível que tem pessoas.
5. A tela aberta é a do endereço (4.1.6); sem endereço, **Escala**.

#### 4.1.2 Menu lateral

- **Marca:** logo "Fábrica de Líderes — @rafaelhaddad1" no topo do menu (no computador, na largura do menu; no celular, pequeno, ao lado do texto) e, abaixo, "SIMULADOR ESCALA 5X2". A imagem vai embutida na página e nos programas (funciona sem internet).
- **Filtro de lojas:** botão com a loja (e a rede) ou "N lojas selecionadas · em edição: {loja} ▾" (4.11).
- **Itens** (nesta ordem), cada um com ícone, nome e dica (a dica só aparece em telas largas):

| Item | Dica |
|---|---|
| Escala | Quem trabalha e onde falta gente |
| Equipe | Pessoas de cada setor |
| Domingos | Quem trabalha e em qual horário |
| Escala de Almoço | Intervalos e quem fica no posto |
| Dashboards | Faltas, atestados, equipe e lojas |
| Férias | Quem sai quando |
| Horários | Turnos e intervalos |
| Fluxo alto | Quantos você precisa |
| Regras avançadas | Folgas, domingos, turnos e limites |
| Lojas | Cadastrar e organizar lojas |
| Personalizar | Setores, loja e aparência |

- **Telas baixas** (notebooks de 768 px ou 720 px de altura): as dicas somem e o menu fica mais compacto, para que os 11 itens caibam sem rolar.
- O item da tela aberta fica destacado. Ao trocar de tela, a página volta ao topo.
- **Rodapé** (telas largas): situação do salvamento ("Salvando…", "Salvo às HH:MM", "Tudo salvo", "Erro ao salvar", com ponto âmbar, verde ou vermelho; RN-DAD-02) e onde os dados ficam ("Salvo nesta página (compartilhado)", "Salvo neste navegador", "Salvo no computador").
- **Cores:** o menu e os botões seguem o tema da loja em uso (Personalizar → Aparência); a fonte segue a escolha de fonte.

#### 4.1.3 Filtro de lojas

O mesmo filtro aparece no menu e, com mais de uma loja, como seletor "Loja" nas telas. Mudar em um lugar muda em todos. Regras em 4.11.

#### 4.1.4 Cabeçalho das telas e abas de setor

- Título (ex.: "Escala · {setor}"), subtítulo e botões de ação à direita.
- **Abas de setor** (Escala, Equipe, Domingos, Escala de Almoço, Horários, Fluxo alto): uma por setor visível da loja em uso, na ordem de Personalizar, com a bolinha da cor do setor, o nome, o número de pessoas e um **ponto vermelho** quando o setor tem algum alerta de gravidade "problema" (RN-ALE-05). A aba do setor aberto fica destacada. "+ Setor" leva a Personalizar.
- O **setor aberto** é o mesmo em todas as telas e fica guardado no navegador. Trocar de setor fecha o relatório de geração de outro setor e volta a Cobertura para a primeira semana.
- Horários e Fluxo alto têm, com mais de uma loja, o seletor "Loja" antes das abas (escolher a loja a torna a loja em uso; dica "Loja que esta tela edita").
- Dashboards, Férias, Regras avançadas, Lojas e Personalizar não têm abas de setor (Regras avançadas tem o próprio campo "Para qual setor").

#### 4.1.5 Mensagens flutuantes

- Aparecem no canto inferior direito, uma por vez, e somem depois de **4,5 s** (ou no "×").
- Quando a mensagem aparece logo depois de uma mudança (até 2,5 s) e há o que desfazer, ela traz o botão **"Desfazer"** (RN-DES-03), exceto quando a própria mensagem é de algo desfeito.

#### 4.1.6 Endereços

Cada tela tem um endereço próprio, que permite voltar com o botão do navegador e abrir a tela por link: `#escala`, `#equipe`, `#domingos`, `#almoco`, `#dashboards`, `#ferias`, `#horarios`, `#necessidade`, `#lojas`, `#personalizar`. Nos Dashboards a aba vem depois de "/" (`#dashboards/faltas`, `/atestados`, `/colaboradores`, `/lojas`). Os endereços antigos `#faltas` e `#atestados` abrem a aba correspondente. Endereço desconhecido abre a Escala.

#### 4.1.7 Uso no celular e em telas estreitas

- O menu fica no topo, em uma linha que rola para o lado; enquanto houver itens escondidos à direita aparece uma sombra com "›" ("Ver mais opções do menu"), que rola o menu. A tela aberta é trazida para a área visível.
- A situação do salvamento não aparece no celular.
- Tabelas largas (Semana, Mês, cobertura, almoço, equipe) rolam dentro do próprio quadro; a página não rola para o lado.
- As margens respeitam as áreas seguras de aparelhos com recorte na tela.

#### 4.1.8 Padrões de interação

| Padrão | Comportamento |
|---|---|
| Gravação | Não existe botão "Salvar": toda mudança vale na hora e é gravada automaticamente (RN-DAD-02). |
| Campos de texto e número | O valor vale ao sair do campo ou ao apertar Enter. |
| Campos de número | Valor fora dos limites é ajustado ao limite; texto que não é número volta ao valor anterior. |
| Campos de duração | Aceitam `8h24`, `8:24` ou `8.4`/`8,4` (horas). Valor inválido ou negativo volta ao anterior. |
| Campos de hora | Seletor de hora (HH:MM, 24h). Apagar o campo não muda o valor. |
| Confirmação em dois passos | Ações destrutivas (excluir, remover, substituir, aplicar em massa) trocam o botão por um botão vermelho de confirmação (ex.: "Excluir pessoa", "Confirmar exclusão"). Se não for clicado em **4 s**, o botão volta ao normal sem fazer nada. |
| Prévia antes de aplicar | Regra de domingo, copiar escala, aplicar horário da loja, importar planilha, programar férias e as sugestões de almoço mostram o efeito antes; "nada muda até você aplicar". |
| Desfazer | Ctrl+Z / Cmd+Z fora de campos de texto, botões "↶ Desfazer" e o "Desfazer" da mensagem flutuante (RN-DES). |
| Dicas | Muitos elementos mostram uma dica ao parar o mouse (horários do dia, motivo de um aviso, critério de uma cor). |

### 4.2 Tela Escala

**Objetivo:** gerar e revisar a escala do setor, ver onde falta gente, ajustar dias à mão e imprimir. É a tela inicial.

**Cabeçalho da página** (comum a várias telas; ver 4.1.4):
- Título "Escala · {setor}".
- Subtítulo: "{N} pessoas · planejamento de dd/mm/aaaa a dd/mm/aaaa · {modelo}". O modelo mostra "5x2, 8h24 por dia" (ou "6x1", "AxB"), mais "· N em 12x36" se houver pessoas em plantão; num setor em 12x36 mostra "12x36 (dia sim, dia não)" e "· N em 5x2/6x1" se houver exceções.
- Abas de setor (setores visíveis da loja em uso), com cor, número de pessoas e ponto vermelho se o setor tem algum alerta de gravidade "problema". "+ Setor" leva a Personalizar.

**Botões de ação do cabeçalho:**

| Botão | Comportamento |
|---|---|
| "↶ Desfazer" | Volta a última mudança (RN-DES). Desabilitado sem histórico. Mensagem: "Mudança desfeita: voltou a como estava antes." ou "Não há nada para desfazer." |
| "LIMPAR ESCALA" (caixa verde, texto em maiúsculas) | Abre e fecha o painel Limpar escala (4.2.9). Desabilitado durante a geração. |
| "Copiar escala…" | Abre e fecha o painel Copiar escala (4.2.10), já com "Toda a escala" marcada. |
| "Gerar escala" (caixa roxa, destacada) | Gera a escala do setor (RN-GER-02). Mostra "Gerando…" e fica desabilitado durante a geração e quando o setor não tem pessoas. |

#### 4.2.1 Primeiros passos

Aparece enquanto algum passo estiver pendente. Quatro passos, com número (pendente) ou ✓ (concluído, texto riscado):

| Passo | Concluído quando | Ação |
|---|---|---|
| "Cadastre a equipe do setor" | o setor tem pessoas | "Abrir" → Equipe |
| "Confira os horários (turnos e intervalos)" | o setor tem turno normal | "Abrir" → Horários |
| "Diga quantas pessoas você precisa em cada horário" | o setor tem faixa de necessidade | "Abrir" → Fluxo alto |
| "Clique em Gerar escala" | o setor tem registro de geração | "Gerar" (desabilitado sem pessoas) |

#### 4.2.2 Avisos no topo

Aparecem nesta ordem, só para o setor da página:

1. **Edição manual pendente** (sem relatório aberto): "Você mudou N dia(s) à mão. Essas mudanças ficam fixas; o sistema pode reorganizar o resto da escala." Botões "Reorganizar o resto" (gera o setor) e "Agora não" (fecha).
2. **Relatório da geração** (fecha com "Fechar"):
   - **Sucesso, escala aplicada:** selo "Escala gerada" + "Cobertura foi de X% para Y%. Folgas, domingos e dias fixados foram respeitados."
   - **Sucesso, escala mantida:** selo "Escala mantida" + "Nenhuma troca de folgas melhora a escala atual."
   - Em ambos: "Almoços: cada pessoa no horário fixo dela (ou rodízio) — veja e mude na Escala de Almoço." (RN-ALM-11).
   - Se ainda há faixas abaixo do mínimo: "Ainda falta gente em alguns horários: veja as sugestões abaixo."
   - Se as Regras avançadas de turno mexeram: "Rodízio de turnos: N dias com o turno da semana." / "Quem fechou não abre no dia seguinte: N turnos trocados." / "N casos continuam fechando e abrindo em seguida (não há outro turno no dia)."
   - Avisos de ajuste automático (ex.: limite de folgas por dia aumentado; RN-GER-04).
   - **Falha:** selo "Não foi possível gerar" + "A escala atual não foi alterada. O que impede:" e até 6 causas (RN-GER-09).
3. **Setor sem pessoas:** "Ainda não há ninguém em {setor}. Cadastre a equipe em Equipe (uma a uma, várias de uma vez ou por planilha). A cobertura e os avisos aparecem aqui depois disso."
4. **Escala em branco** (meses limpos do período com dias em branco): "Escala em branco em {setor}: {meses}. Os quadradinhos ficam vazios até você clicar em Gerar escala (ou Desfazer)." "Gerar escala" e "Desfazer" são links. Enquanto houver mês em branco, os indicadores, "Onde vai faltar gente" e o mapa de cobertura ficam escondidos; a Semana e o Mês continuam visíveis.

#### 4.2.3 Indicadores

Três cartões (RN-IND), visíveis quando o setor tem pessoas e não há mês em branco:

| Cartão | Valor | Cor | Subtítulo |
|---|---|---|---|
| "Horários cobertos" | % coberto, 1 casa | verde ≥ 99,5%; âmbar ≥ 95%; vermelho abaixo | "Da necessidade que você informou" |
| "Horas faltando" | horas faltando por semana (`XhYY`) | vermelho se > 0; verde se 0 | "Por semana, somando todos os buracos" |
| "Horas por pessoa" | média semanal de horas trabalhadas por pessoa | neutro | "Média semanal (limite 42h)" |

#### 4.2.4 Onde vai faltar gente

- Até **3 sugestões** em cartões rosa: título "{Dia}, HH:MM–HH:MM: falta(m) K {papel}" e, quando a falta não ocorre em todas as semanas, "(em dd/mm, dd/mm e dd/mm)" ou "(só em dd/mm)". Abaixo, a ação sugerida (RN-ALE-04).
- Até 2 alertas que não são de cobertura (títulos e textos de RN-ALE) em cartões cinza.
- "Ver todos os avisos (N)" / "Esconder lista completa": mostra todos os alertas que não são de cobertura e, para cada dia com falta, as faixas "{rótulo} (X/Y sem.)".
- Sem sugestões nem alertas: "Nenhum horário abaixo da necessidade. A escala está completa."

#### 4.2.5 Semana

**Subtítulo:** "Clique num dia para trocar trabalho por folga, ou lançar férias, falta ou atestado (escolha em “Ao clicar num dia”). O que você muda à mão fica fixo quando o sistema gerar de novo." Com várias lojas: "Mostrando N lojas nas mesmas datas."

**Botões:** "Baixar semana (PDF)", "Escala por pessoa (PDF)" e "Excel" (RN-EXP).

**Filtros (quadro "Filtros da semana"):**

| Filtro | Comportamento |
|---|---|
| "Ver colaboradores dos setores" | Botões de setor (nomes dos setores visíveis das lojas mostradas), com cor e número de pessoas. Seleção múltipla; pelo menos um sempre marcado. Atalhos "Todos" e "Só {setor da página}". Padrão: acompanha o setor da página. |
| "Loja" | Aparece com mais de uma loja (filtro de lojas; 4.1.3). |
| "Turno" | Turnos normais do setor; com mais de um setor marcado o filtro fica em "Todos (escolha 1 setor para filtrar)". |
| "Função" | Funções existentes, em ordem alfabética. |
| "Buscar pessoa" | Parte do nome (sem diferenciar maiúsculas). |
| "Ordenar por" | Padrão ao abrir: **"Horário de entrada"** (crescente). Opções: "Ordem de cadastro", "Nome (A–Z)", "Horário de entrada", "Horário de saída", "Horas na semana" e "Entrada na {dia}" para cada dia mostrado. |
| "Ordem" | "▲ Crescente" / "▼ Decrescente". O desempate pelo nome segue o mesmo sentido: decrescente inverte a lista inteira. Vale também no Mês. |
| Contador | "N pessoas [em X setores] [de Y lojas]". |

Regras de ordenação: na ordenação por entrada num dia, quem não trabalha nesse dia (folga, férias, falta) vai **sempre para o fim**, como no Excel; empates por nome. Cabeçalhos "Pessoa", cada dia e "Horas" também ordenam (clicar de novo inverte).

**Navegação:**
- "‹" e "›": semana anterior e seguinte. Antes da primeira ou depois da última semana do período, o período **passa a começar** na semana pedida (RN-CAL-07).
- "Ir para" (data): mostra a semana que contém a data. Fora do período, o período passa a começar no início da semana da data, com a mesma quantidade de semanas, e a tela mostra a semana 1. Os dias novos ganham escala pelo preenchimento automático.
- "Semana começa": "Na segunda" ou "No domingo" (RN-CAL-08). Ao trocar aparece "A semana agora começa na segunda / no domingo. As folgas foram reorganizadas; dias fixados à mão foram mantidos."

**"Ao clicar num dia"** (ferramenta): "Trabalho ↔ folga", "Férias", "Falta", "Atestado" (RN-MAN-01).

**Legenda de cores:** T, D, F, V, A, M, H e "faixa lateral = cor do turno (Horários)".

**Tabela:**
- Colunas: "Pessoa", um dia por coluna (dia da semana e número; "· feriado"; nos domingos abertos com times, "· Time A" ou "· Times A e B"), "Horas".
- Linha da pessoa: nome, selo do time de domingo (A, B…), selo "12x36 A/B", selo "Chave", selo "Estágio 6h" / "Aprendiz 6h"; abaixo, o turno e, se for o caso, a jornada cadastrada ou o modelo próprio ("· 6x1").
- Com vários setores ou lojas, as pessoas ficam agrupadas por "{loja ·} {setor} · N".
- **Divisão por turno:** quando uma pessoa é de turno diferente da pessoa da linha de cima (no mesmo grupo), a linha entre as duas é **grossa e preta** (clara no tema escuro), para separar quem é de cada período. Com a ordem "Horário de entrada", cada turno fica num bloco. Na legenda, a caixa **"Linha grossa entre turnos"** (marcada por padrão) liga e desliga essa divisão; a escolha vale para a loja e fica gravada.
- Cada dia mostra:
  - trabalho: "HH:MM–HH:MM" (com " +1" se passa da meia-noite), com a cor do turno numa faixa lateral; a dica mostra o nome do turno e "intervalo HH:MM–HH:MM";
  - "Folga", "Férias", "Falta", "Atestado" ou "Feriado";
  - um ponto no canto quando o dia foi **fixado à mão**;
  - "—" quando o dia está fora do período da loja (várias lojas);
  - quadradinho **tracejado vazio** quando o dia está em branco (mês limpo); clicar nele lança o dia à mão.
- "Horas": soma das horas da semana. Fica **vermelha** quando passa do limite (para quem tem horas próprias, do menor entre o contrato e o limite semanal). Pessoas em 12x36 nunca ficam vermelhas (dica: "12x36: alterna semanas de 3 e 4 plantões (média de 42h por semana)").
- Rodapé "Trabalhando": pessoas trabalhando no dia ("–" em dia fechado). Com um só setor, sem filtros de turno, função e busca, mostra também "Falta N" (vermelho, a maior falta do dia) ou "Completo" (verde).
- Sem pessoas nos filtros: "Ninguém encontrado com esses filtros."

#### 4.2.6 Cobertura da semana

Escondida quando há mês em branco (4.2.2).

- **Título:** "Cobertura da semana · {setor}". Subtítulo: "Quantas pessoas estão no posto a cada 30 minutos nesta semana, já descontando intervalos e folgas. Clique num horário para ver quem está lá."
- **"Setor":** escolhe o setor do mapa (independente das abas).
- **"Cores por":** "% do quadro do setor" (padrão) ou "Fluxo alto (mínimo)" (RN-COR).
- **No critério do quadro:** "Estilo" ("2 cores", "3 cores", "4 cores" ou "Degradê de uma cor"), "Quadro do setor: N pessoas" e, no degradê, "Pouca gente abaixo de N%" e "Muita gente a partir de N%". Com 2, 3 ou 4 cores os percentuais ficam na legenda: uma linha por cor, "de X% a Y%" e "(A a B pessoas)" (RN-COR-01).
- **Legenda** (clicar na cor abre o seletor de cor):
  - 3 faixas: "Menos funcionários (até X)", "Número médio (X–Y)", "Mais funcionários (Z ou mais · N% do quadro)";
  - degradê: "De pouca a muita gente (mais forte = mais funcionários)" e "Contorno quando há menos de X (N% do quadro)";
  - necessidade: "Falta gente", "No limite", "Folga de gente" e, quando há, "Sem necessidade definida (ajuste em Fluxo alto)" e "Abaixo do ideal";
  - "Voltar às cores originais" (só quando alguma cor foi trocada); "Clique na cor para trocar."
- **"Tamanho":** "Pequeno", "Médio" (padrão), "Grande" (guardado no navegador).
- **Grade:** linhas = dias da semana (segunda a domingo); colunas = faixas de 30 min agrupadas por hora ("8h", ":00", ":30"). Cabeçalhos e primeira coluna fixos. A área rola nos dois sentidos com as barras ou **arrastando com o mouse** (um arrasto não conta como clique). Cada célula mostra quantas pessoas estão no posto; a dica mostra "HH:MM–HH:MM · N no posto (X% do quadro) · precisa de M" ou "· sem necessidade definida". Só aparecem faixas de dias abertos que estão abertas, têm necessidade ou têm gente (RN-COR-06).
- **Detalhe da faixa** (ao clicar): "{Dia}, HH:MM–HH:MM: N no posto, precisa de M · faltam K", "No posto: {nomes}" e "Em intervalo: {nomes}". "Fechar".

**Almoços** (dentro da Cobertura, `#brk-tool`): desde 06/11/2026 o quadro "Escalonar intervalos" saiu. No lugar há o texto "Cada pessoa almoça no horário fixo dela (sugerido pelo sistema) ou em rodízio. Veja e mude na Escala de Almoço." e o botão **"Abrir Escala de Almoço"** (4.5).

#### 4.2.7 Mês

Card "Mês" logo abaixo da Cobertura (sempre visível, inclusive com mês em branco).

**Subtítulo:** "Todos os dias do mês lado a lado[, uma grade por loja selecionada]. Clique num dia para trocar trabalho por folga, ou lançar férias, falta ou atestado (escolha em “Ao clicar num dia”). O que você muda fica fixo, como na Semana."

**Botões:**
- "Baixar mês (PDF)".
- "Gerar escala inteligente" (roxo; com várias lojas, "Gerar escala inteligente (N lojas)"): para cada loja mostrada com o setor escolhido, amplia o período se o mês não estiver todo dentro dele (4.2.8) e gera o setor, uma loja por vez. Ao terminar cada uma: "Escala de {loja ·} {setor} gerada. Os dias que você fixou à mão foram mantidos." O setor da página passa a ser o setor escolhido no Mês.
- Logo abaixo, lado a lado: "LIMPAR ESCALA" (caixa verde; abre o painel 4.2.9 já com o mês aberto marcado e o setor do Mês) e "↶ Desfazer". Todos ficam desabilitados durante a geração.

**Filtros:** "Mês" (‹ mês de ano ›, livre, pode sair do período), "Loja" (com mais de uma), "Setor" (nomes dos setores visíveis), "Turno", "Função", "Buscar pessoa", "Ordenar por" (padrão ao abrir: "Turno (horário de entrada)"; opções: "Ordem de cadastro", "Nome (A–Z)", "Turno (horário de entrada)", "Horário de saída", "Folgas no mês", "Domingos trabalhados", "Horas no mês"), "Ordem" e "Ao clicar num dia" (as mesmas 4 ferramentas da Semana). Contador "N pessoas [em X lojas]".

**Aviso de período:** se parte do mês está fora do período: "Parte deste mês está fora do período planejado (dd/mm a dd/mm). Esses dias aparecem em branco." + botão "Gerar escala do mês inteiro" (amplia o período e completa a escala; mensagem "Planejamento de {loja} ampliado para cobrir {mês}. A escala dos dias novos foi gerada; o que já existia foi mantido.").

**Grade (por loja):**
- Cabeçalho: "Pessoa | Turno" (os dois ordenam), um dia por coluna (letra do dia e número; número vermelho em feriado; dica com dia por extenso, data, nome do feriado e "· loja fechada"; domingos com fundo próprio; nos domingos com times, a letra do time que trabalha, ou "−X" com o time que folga quando há mais de 2 times), "Folgas", "Dom. trab.", "Horas".
- Linha: nome com selos (time, 12x36, Chave, Estágio/Aprendiz) e "{turno} · HH:MM–HH:MM".
- Célula: a letra do código (T, D, F, V, A, M, H) na cor do código, com a cor do turno numa faixa inferior; ponto no canto se fixado; dica "{pessoa} · {dia} dd/mm/aaaa: {situação} {turno} HH:MM–HH:MM (intervalo HH:MM–HH:MM) · fixado à mão". Dias fechados não são clicáveis. Dias fora do período: hachurados. Dias em branco: quadradinho tracejado, clicável.
- Uma linha vertical separa as semanas (no dia de início da semana).
- Colunas finais: folgas no mês (só F), domingos trabalhados (só domingos, sem feriados) e horas no mês — contando só dias do período e que não estão em branco.
- Rodapé "Trabalhando": pessoas trabalhando por dia ("–" fora do período ou fechado; vazio quando todos estão em branco).
- **Linhas por turno** (quando o setor tem mais de um turno normal com pessoas; pessoas em 12x36 ficam de fora): "{turno} (N)" e, por dia, quantas pessoas do turno trabalham. Fica **em vermelho e negrito** quando, num dia de segunda a sábado, as folgas do turno passam do teto `máx(1, ⌈2t/6 + 0,5⌉)` (dica "… (mais que o normal para um turno de N)"). Domingos e feriados mostram "·" (dica: "Domingo/feriado: todos usam o turno de domingo (veja em Domingos)").
- Legenda: cores dos códigos e "Passe o mouse num dia para ver o horário."
- Loja sem o setor: "Esta loja não tem o setor {setor}."

#### 4.2.8 Ampliar o período pelo Mês

Para cobrir um mês: o novo início é o início da semana que contém o dia 1 do mês, se for antes do início atual; senão fica o início atual. Se isso passar de 8 semanas até o fim do mês, o início passa a ser o da semana do dia 1. A quantidade de semanas vai até o fim do mês (máximo 8), sem encurtar o período atual quando ele já começa antes.

#### 4.2.9 Painel "Limpar escala"

Abre pelo botão "LIMPAR ESCALA" do cabeçalho (setor da página) ou do Mês (setor e mês do Mês).

- Título "Limpar escala". Texto: "Apaga a escala dos meses escolhidos: os dias ficam em branco até você clicar em Gerar escala. Férias, faltas e atestados nunca são apagados. Se mudar de ideia, use Desfazer logo depois."
- **"Meses":** um botão por mês (os meses do período, os que já têm escala gravada e o mês aberto). Seleção múltipla; os marcados mostram "✓". Padrão: o mês aberto (pelo Mês) ou todos os meses do período (pelo cabeçalho).
- **Onde:** "Só {setor}" (padrão) ou "Todos os setores desta loja".
- **"Apagar também os dias que eu fixei à mão"** (desmarcado): informa "N dias fixados nos meses escolhidos (trocas de folga, domingos escolhidos). Sem marcar, eles ficam." ou "Não há dias fixados à mão nos meses escolhidos."
- **"Apagar também os horários de almoço"** (desmarcado desde 06/11/2026): "O horário fixo de cada pessoa e os mudados só num dia. O sistema sugere horários novos na hora. Sem marcar, os almoços ficam como estão."
- Botões: "Limpar {lista de meses}" (ou "Escolha pelo menos um mês", desabilitado) e "Cancelar".
- Efeito: RN-LIM. Mensagem: "Escala de {meses} limpa em {setor} / em todos os setores: os dias ficaram em branco.[ Os N dias fixados à mão foram mantidos.] Clique em Gerar escala para montar de novo." O relatório da geração e o aviso de edição manual são fechados.

#### 4.2.10 Painel "Copiar escala"

- Título "Copiar escala". Texto: "Use a estrutura de um setor em outros setores (da mesma loja ou de outras) sem configurar tudo de novo. Nada é substituído sem a sua confirmação." Botão "Fechar".
- **"Copiar de":** um setor visível de qualquer loja ("{loja} · {setor}" com várias lojas). Padrão: o setor da página.
- **"Para (escolha um ou mais)":** botões com os outros setores visíveis de todas as lojas.
- **"O que copiar":** "Toda a escala" marca ou desmarca tudo, e as partes:
  - "Turnos e intervalos" — "Inclui turnos de domingo, janelas de intervalo e cores; as pessoas do destino vão para o turno de mesmo nome";
  - "Fluxo alto (pessoas por horário)" — "Faixas por horário e exceções";
  - "Regras de folga das pessoas" — "Turno, folga fixa, preferência e domingos (Time A/B), pela posição na lista";
  - "Folgas já geradas no período" — "Dia a dia, pela posição na lista; dias fixados à mão, férias e faltas não mudam";
  - "Criar as vagas que faltam no destino" — "Se o destino tiver menos pessoas que a origem, cria pessoas sem nome para a escala ficar inteira (os nomes você preenche em Equipe)".
- "Ver prévia" (desabilitado sem destino ou sem parte; "Escolha pelo menos um setor de destino."). A prévia lista, por destino, o que acontece, os avisos e "Ver quem recebe o padrão de quem (N)".
- Se algo do destino será substituído, é obrigatório marcar "Entendo que o que já existe nos setores de destino, como listado acima, será substituído."
- "Copiar para N setores" aplica (RN-COP); "Cancelar" volta. Mensagem: "Escala copiada para N setores. Cada um pode ser editado separadamente; gere a escala de cada setor para reorganizar as folgas."

### 4.3 Tela Equipe

**Objetivo:** cadastrar e manter as pessoas do setor: nome, regime, contratação, turno, domingos e folgas fixas.

**Cabeçalho:** título "Equipe · {setor}" e abas de setor. Subtítulo:
- uma loja: "Nome, turno, como a pessoa folga aos domingos e se tem folga fixa. O resto fica em “mais detalhes”.";
- outra loja escolhida no filtro: "Mostrando {loja}. “+ Pessoa” cadastra nesta loja.";
- várias lojas: "Mostrando N de M lojas. “+ Pessoa” cadastra em {loja em uso} (a loja em edição)."

**Botões:**

| Botão | Comportamento |
|---|---|
| "Escala por pessoa (PDF)" | PDF individual das pessoas que aparecem na lista (com os filtros), do período todo. "Ninguém na lista com esses filtros." se vazio. |
| "Importar planilha" | Abre e fecha o painel de importação (4.3.6). |
| "Adicionar várias" | Abre o quadro "Adicionar várias pessoas" (4.3.5). |
| "+ Pessoa" | Cria uma pessoa sem nome no setor (RN-EQP-01). |

#### 4.3.1 Filtros e ordenação

Quadro visível quando o setor tem pessoas (ou há várias lojas). Só muda a visualização, nunca o cadastro.

| Campo | Opções |
|---|---|
| "Loja" | Com mais de uma loja (filtro de lojas). |
| "Buscar" | Parte do nome ou da matrícula. |
| "Turno" | "Todos" + nomes dos turnos normais. |
| "Função" | "Todas" + funções existentes. |
| "Domingos" | "Todos", "Time A", "Time B"…, "Folga todo domingo", "Folga a cada N domingos", "Não trabalha domingo" (só as que existem). |
| "Folga fixa" | "Todas", "Sem folga fixa", Dom…Sáb. Uma pessoa aparece ao filtrar por qualquer uma das suas duas folgas fixas. |
| "Regime" | "Todos", "5x2", "6x1", cada jornada cadastrada, "12x36". |
| "Contratação" | "Todas", "CLT", "Estagiários", "Jovens aprendizes". |
| "Ordenar por" | "Ordem de cadastro", "Nome (A–Z)", "Turno (horário de entrada)", "Domingos" (times primeiro, depois ciclos), "Folga fixa" (pela 1ª e depois pela 2ª) + botão ▲/▼. |
| Contador | "N de M pessoas [em X lojas] · Limpar filtros" (o link aparece com algum filtro ativo). |

Os cabeçalhos "Nome", "Turno", "Domingos" e "Folga fixa" da tabela também ordenam (↕ / ▲ / ▼).

**"Alterar as pessoas mostradas"** (aparece com algum filtro ativo e alguém na lista): muda de uma vez todas as pessoas filtradas.

| Campo | Opções |
|---|---|
| "Regime" | "— não mudar —", "5x2", "6x1", "Jornada: {nome}", "12x36 (divide em Plantão A e B)", "12x36 · Plantão A", "12x36 · Plantão B" |
| "Folga fixa" | "— não mudar —", "Sem folga fixa", "Domingo (não trabalha domingo)", Seg…Sáb |
| "2ª folga fixa" (só com uma folga fixa escolhida) | "Só uma folga fixa" ou outro dia |
| "Domingos" | "— não mudar —", "Entra no rodízio do setor", "Não trabalha domingo" |

"Aplicar" → confirmação "Confirmar (N pessoas)". Regras:
- O regime é aplicado primeiro. "12x36 (divide em Plantão A e B)" alterna A, B, A… pela ordem da lista.
- A 2ª folga fixa só é gravada para quem tem 2 ou mais folgas por semana e quando é diferente da 1ª.
- Folga fixa no domingo (1ª ou 2ª) ou "Não trabalha domingo" → a pessoa sai do rodízio de domingos.
- "Entra no rodízio do setor" → ciclo do rodízio do setor (ou "folga a cada 2" na regra individual); quem tinha folga fixa no domingo perde essa folga fixa (se a folga mexida não foi alterada no mesmo passo).
- Depois, as pessoas sem time válido entram nos times (RN-DOM-06) e **a escala do setor é refeita** (dias fixados ficam).
- Mensagem: "N pessoas alteradas. A escala do setor foi refeita (o que você fixou à mão foi mantido)."

#### 4.3.2 Modelo de escala do setor

Primeiro cartão de cada loja mostrada. Campo "Modelo de escala de {setor}":
- "Igual à loja (5x2)", "5x2 · 2 folgas por semana", "6x1 · 1 folga por semana", cada jornada ("{nome} · Nd × Xh") e "12x36 · dia sim, dia não".
- Texto ao lado explica a situação atual: "O setor segue o modelo da loja (5x2)." / "O setor está no 6x1, mesmo se a loja mudar." / "Todo o setor segue a jornada “X” (…). Quem entrar no setor recebe essa jornada; exceções se escolhem na coluna “Regime”." / "Plantão A e Plantão B se revezam dia sim, dia não, inclusive domingos e feriados. N pessoas estão em 5x2 como exceção. …" e "N pessoas têm regime próprio".
- Escolher outro valor abre a confirmação com o efeito (RN-REG-03, RN-REG-07, RN-REG-10), por exemplo: "Passar {setor} para 12x36? As N pessoas do setor passam a trabalhar dia sim, dia não (inclusive domingos e feriados), metade de cada turno no Plantão A e metade no Plantão B. O setor ganha um plantão das 07h às 19h, que você ajusta em Horários (pode ser noturno). Os outros setores não mudam. O que você fixou à mão na escala é mantido."
- Botões "Aplicar {modelo} em {setor}" e "Cancelar". Mensagens: "{setor} agora é 12x36: a equipe foi dividida em Plantão A e Plantão B, dia sim, dia não." / "{setor} agora segue a jornada “X”: …" / "{setor} agora está no 5x2 (igual à loja). A escala do setor foi refeita."

#### 4.3.3 Domingos do setor (rodízio)

Cartão visível quando o setor tem pessoas, a loja abre aos domingos e o setor não está em 12x36.
- Título "Domingos: rodízio NxM" ou "Domingos: cada pessoa com sua regra".
- Texto explicativo da regra (1x1: "Domingo sim, domingo não: metade da equipe trabalha num domingo e a outra metade no seguinte; as outras folgas vão para os dias de semana."; NxM: "Cada pessoa trabalha N domingos seguidos e folga 1. A equipe é dividida em N+1 times; a cada domingo um time folga."), "Regra própria deste setor." ou "Segue a regra da loja." e "Quem tem folga fixa no domingo não entra no rodízio."
- No rodízio: "Time A: N pessoas · Time B: M pessoas · no domingo dd/mm trabalha o Time X" (no 1x1) ou "folga o Time X" (NxM), ou "Ninguém está em time ainda. Escolha o time de cada pessoa na coluna “Domingos” ou divida automaticamente."
- "Reequilibrar os times" → confirmação "Confirmar divisão (muda o time de todos)" (RN-DOM-07). Mensagem: "Times de domingo: Time A com X, Time B com Y. A escala de {setor} foi refeita (o que você fixou à mão foi mantido)." ou "Ninguém deste setor trabalha aos domingos."
- Editor "Regra de domingo de {setor}" com prévia (4.12.4).

#### 4.3.4 Tabela da equipe

Colunas: "Nome", "Regime", "Contratação", "Turno", "Almoço", "Domingos", "Folga fixa" e ações. Toda mudança é gravada na hora.

| Coluna | Campo e regras |
|---|---|
| Nome | Texto livre; vazio mostra a função como texto de apoio. |
| Regime | "5x2" e "6x1" (com "(2 folgas)" / "(1 folga)" quando diferente do padrão do setor), as jornadas ("{nome} (Nd × Xh)"), "12x36 · Plantão A", "12x36 · Plantão B" (RN-REG-05). Mensagens: "{pessoa} agora está no 6x1: 6 dias de trabalho e 1 folga por semana. A escala dessa pessoa foi refeita." / "{pessoa} agora segue a jornada “X”: …" / "{pessoa} agora é 12x36 (Plantão A): trabalha dia sim, dia não, inclusive domingos e feriados." |
| Contratação | "CLT", "Estagiário", "Jovem aprendiz" (RN-REG-09). Para estagiário e aprendiz aparece abaixo: com jornada cadastrada, "horas da jornada “X”"; seguindo o turno, "horas do turno (5h) mudar"; com horas próprias, o campo de horas por dia e "por dia · sai HH:MM" (no 12x36: "(não vale no 12x36)"). Mensagens: "{pessoa} voltou para CLT, com a jornada da loja." / "Contratação de {pessoa}: Estagiário, 6h por dia e 30h por semana. Ajuste as horas se precisar." (ou "com as horas do turno (5h)"). |
| Turno | Pessoas em 12x36 escolhem entre os plantões; as demais, entre os turnos normais. Rótulo "{nome} (HH:MM–HH:MM)" ("do dia seguinte" se passa da meia-noite). Mudar o turno apaga o intervalo de sempre próprio. Estagiário/aprendiz com horas próprias que escolhe um turno com horas próprias passa a seguir as horas do turno ("{pessoa} agora segue as horas do turno X (5h por dia)."). |
| Almoço | Desde 07/11/2026 (o mesmo da Escala de Almoço, 4.5.2). **Horário** (`#s-alm-hora-{pessoa}`): o horário fixo de sempre; escolher um horário tira a pessoa do rodízio. **Tempo** (`#s-alm-dur-{pessoa}`): "{tempo} (turno)" ou de 15 min a 4h; a saída anda junto, com as mesmas horas de trabalho. Abaixo: "até HH:MM", ou "↻ rodízio (muda a cada dia)", e o aviso em vermelho quando não cabe ("Não cabe no turno (…): precisa de pelo menos 1h de trabalho antes e depois." / "Fora do horário do intervalo do turno (…)."). Turno sem intervalo: "Turno sem intervalo". Mensagens: "{pessoa}: almoço fixo às HH:MM." / "{pessoa}: almoço de 1h30. A saída fica às HH:MM, com as mesmas horas de trabalho." Quem é novo recebe o horário sugerido (RN-ALM-02). |
| Domingos | 12x36: texto "Dia sim, dia não (12x36)". Rodízio: "Time A (domingo sim, domingo não)", "Time B …" (ou "Time X (2x1: folga 1 a cada 3)"), "Não trabalha domingo". Regra individual: "Time A/B (domingo sim, domingo não)", "Folga a cada 2 domingos", "Folga a cada 3 domingos (2x1)", "Folga a cada 4 domingos (3x1)", "Não trabalha domingo". Com folga fixa no domingo mostra "Folga fixa no domingo" (não pode ser escolhido ali). Escolher trabalhar aos domingos tira a folga fixa de domingo. **Só muda o cadastro**: a escala muda na próxima geração. |
| Folga fixa | Campo 1: "Sem folga fixa", "Dom (não trabalha domingo)", Seg…Sáb. Campo 2 (só com o 1º preenchido e 2+ folgas na semana): "+ 2ª folga fixa: não" ou "e {dia}" (sem o dia do campo 1). 12x36: "—". Ver RN-EQP-03. |
| Ações | "mais detalhes" / "menos" e "Excluir" (confirmação "Excluir pessoa"). |

**"mais detalhes"** (linha expandida):

| Campo | Regras |
|---|---|
| "Função (cargo da pessoa)" | Texto livre. |
| "Matrícula" | Texto livre (sem validação de duplicidade na tela). |
| "Sexo (só para a regra de domingos)" | "Não informar", "Feminino", "Masculino". |
| "Jornada contratual por semana" / "Horas por semana (contrato)" | Duração (aceita "42h", "8:24", "44"). |
| Resumo da jornada | Para jornada cadastrada, modelo próprio ou estagiário/aprendiz: "No turno X: entra às HH:MM, intervalo das HH:MM às HH:MM e sai às HH:MM (6h de trabalho). Com N dias por semana dá Xh por semana, dentro das Yh do contrato." (vermelho e "acima das Yh do contrato: diminua as horas por dia ou dê mais folgas." quando passa). Estagiário: referência à Lei do Estágio (11.788/2008). Aprendiz: referência ao art. 432 da CLT. |
| "Horas por dia" e "Intervalo" | Só estagiário/aprendiz sem jornada cadastrada. Intervalo: "Automático (15 min / sem intervalo / 1h)", "Sem intervalo", 15 min, 30 min, 1h, 1h30, 2h. |
| "Pessoa-chave" | Caixa de marcar: "(fiscal, líder, quem abre o cofre)". Usada na regra avançada 9. |
| "Prefere folgar" | "Tanto faz" ou Seg…Sáb (RN-FOL-07). |
| "Mudar de setor" | Setores visíveis (e o atual). Ver RN-EQP-05. |
| "Pode ajudar em" | Botões com os outros setores visíveis (habilitações). Guardado; sem efeito na escala da versão simplificada. [MOTOR-SEM-TELA] |

Estados vazios: "Ninguém cadastrado em {setor} ainda." / "Ninguém com esses filtros." Com várias lojas, cada loja aparece em bloco próprio ("{loja} · N de M pessoas · em edição"); lojas sem o setor são listadas em "Sem o setor “X”: …".

#### 4.3.5 Adicionar várias pessoas

Quadro com área de texto ("Cole ou digite um nome por linha. Os turnos são distribuídos em rodízio e você ajusta depois."). Botões "Adicionar N pessoa(s)" e "Cancelar". Linhas vazias são ignoradas. Cada nome vira uma pessoa (RN-EQP-01).

#### 4.3.6 Importar colaboradores por planilha

Painel "Importar colaboradores por planilha" (pedido do relatório de ajustes, item 05). Subtítulo: "As pessoas entram em {loja}. Linha sem setor vai para {setor aberto}. Nada muda até você confirmar."

- **"Baixar modelo (Excel)"**: gera `modelo-importacao-colaboradores.xlsx` com a aba "Colaboradores" (cabeçalho, 2 linhas de exemplo, listas de escolha para Setor, Regime, Domingos, Folga fixa, Sexo e Contratação) e a aba "Instruções" (explicação de cada coluna e lista dos turnos existentes). Mensagem: "Modelo baixado. Preencha a aba Colaboradores e importe aqui."
- **"Escolher planilha (.xlsx ou .csv)"** (depois, "Escolher outra planilha"; durante a leitura, "Lendo…"). Aceita .xlsx, .csv e .txt.
- **"Atualizar quem já existe (mesma matrícula ou, sem matrícula, mesmo nome)"** (marcado).
- **Prévia:** "N linhas · X novas · Y para atualizar · Z já existentes · W com erro" e tabela "Linha", "Situação" (NOVA, ATUALIZA, JÁ EXISTE, ERRO), "Nome", "Setor", "Observação".
- **"Importar N pessoas"** (desabilitado sem linhas válidas) e "Cancelar". Com erros: "Linhas com erro não entram. Corrija na planilha e escolha o arquivo de novo."
- Mensagem final: "Importação concluída: X pessoas cadastradas e Y atualizadas.[ N linhas com erro ficaram de fora.] A escala de quem entrou foi completada automaticamente."
- Sem prévia: lista das colunas aceitas.

**Regras da importação (RN-IMP):**
- **RN-IMP-01 — Leitura.** A primeira linha que tiver a coluna "Nome" é o cabeçalho; linhas totalmente vazias são ignoradas. No .xlsx usa a aba cujo nome contém "colab" ou a primeira. No CSV o separador é detectado (tabulação, ";" ou ","), com aspas opcionais. Arquivos .xls antigos não são aceitos ("Use um arquivo .xlsx (Excel) ou .csv. Arquivos .xls antigos: abra no Excel e salve como .xlsx.").
- **RN-IMP-02 — Colunas reconhecidas** (sem diferenciar maiúsculas e acentos), com sinônimos: Nome ("nome completo", "colaborador"), Matrícula ("matricula/id", "re"), Função ("cargo"), Setor ("departamento"), Regime ("escala"), Turno ("horario"), Domingos ("domingo"), Folga fixa ("folga"), Sexo, Admissão ("data de admissao"), Horas por semana ("jornada semanal", "jornada"), Contratação ("tipo de contratacao", "regime de contratacao", "vinculo"), Horas por dia ("jornada diaria").
- **RN-IMP-03 — Validação por linha** (cada problema vira uma observação; qualquer problema = ERRO):

| Coluna | Aceita | Erro |
|---|---|---|
| Nome | obrigatório | "falta o nome" |
| Setor | nome de setor visível; vazio = setor aberto | "setor “X” não existe na loja (setores: …)" |
| Regime | vazio (o do setor/loja), 5x2, 6x1, "loja/padrão/normal", 12x36, 12x36 A, 12x36 B, "plantão…", ou o nome de uma jornada | "regime “X” não reconhecido (use 5x2, 12x36 A, 12x36 B ou uma jornada: …)" |
| Turno | nome do turno ou horário de entrada (ex.: 08:00); no 12x36, os plantões | "turno “X” não existe em {setor} (turnos: …)" |
| Domingos | "Não trabalha" (e variações), "Time A"…"Time H" (ou só a letra), "Rodízio/sim/trabalha", "Folga a cada N" (1 a 8; "2x1" = ciclo 3). Ignorado no 12x36 | "Time X não existe no rodízio de {setor} (times A a B)" / "domingos “X”: use de 1 a 8" / "domingos “X” não reconhecido (use: Time A, Time B, Rodízio, Não trabalha ou Folga a cada 3)" |
| Folga fixa | um ou dois dias ("Sáb", "Sáb e Dom", "sab/dom", "Sáb, Dom"); "sem/não/-/nenhuma" limpa; domingo tira do rodízio | "folga fixa “X” não reconhecida (use um ou dois dias: … — ex.: “Sáb e Dom”)" |
| Sexo | começa com F ou M | "sexo “X” não reconhecido (F ou M)" |
| Admissão | dd/mm/aaaa, dd/mm/aa, AAAA-MM-DD ou data do Excel | "admissão “X” inválida (use dd/mm/aaaa)" |
| Horas por semana | número de horas, "42:00", "42h", "42h30"; entre 1h e 70h | "horas por semana “X” inválidas (ex.: 44 ou 42:00)" |
| Contratação | CLT/efetivo/normal/padrão, Estagiário, Jovem aprendiz | "contratação “X” não reconhecida (use CLT, Estagiário ou Jovem aprendiz)" |
| Horas por dia | entre 1h e 12h; só para estagiário ou aprendiz (ou quem já é) | "horas por dia “X” inválidas (ex.: 6 ou 4:30)" / "horas por dia só valem para estagiário ou jovem aprendiz (preencha a coluna Contratação)" / "… para CLT a jornada é a do turno" |

- **RN-IMP-04 — Duplicidade.** A chave é a matrícula; sem matrícula, o nome. Repetida na planilha → ERRO "repetida na planilha (igual à linha N)". Já existente na loja → ATUALIZA (com a opção marcada) ou JÁ EXISTE ("já cadastrada (em {setor}) — marque “Atualizar quem já existe” para mudar os dados"). Se a pessoa existente está em outro setor, os dados são atualizados lá e o turno não muda ("está em {setor}; os dados são atualizados lá (mude de setor em Equipe se precisar)").
- **RN-IMP-05 — Padrões.** Estagiário/aprendiz sem horas: 6h por dia e (sem "Horas por semana") 30h. Pessoa nova sem domingos entra no rodízio do setor. Pessoa nova sem regime num setor 12x36 vai para plantão; num setor com jornada, recebe a jornada. Regime 5x2/6x1 igual ao padrão do setor não grava modelo próprio.
- **RN-IMP-06 — Aplicação.** Cria os novos e atualiza os existentes. Quem mudou de jornada tem a escala refeita. Depois, os setores tocados distribuem times (RN-DOM-06) e as pessoas de 12x36 vão para o plantão indicado (sem letra, alternando A, B…). A escala dos novos é completada pelo preenchimento automático.

#### 4.3.7 Regras da Equipe (RN-EQP)

- **RN-EQP-01 — Pessoa nova** (+ Pessoa, Adicionar várias): função "{Singular do setor} N" (N = número de pessoas do setor + 1), sem nome (ou o nome digitado), turno normal em rodízio pela posição, "folga a cada 2 domingos" com o domingo escolhido pelo sistema, sem folga fixa, contrato de 42h. Depois: entra no time com menos gente do turno (RN-DOM-06); num setor 12x36 vai para o plantão com menos gente; num setor com jornada recebe a jornada. Os filtros de nome, turno, função, domingos e folga são limpos. Com uma só loja escolhida no filtro, a pessoa entra nela; senão, na loja em uso ("{loja} não tem o setor {setor}." se a loja não tem o setor).
- **RN-EQP-02 — Exclusão.** Apaga a pessoa, a escala dela em todos os setores, remanejamentos e atividades.
- **RN-EQP-03 — Folgas fixas na Equipe.**
  - Tirar a 1ª folga fixa tira também a 2ª. A 2ª não pode repetir a 1ª.
  - Se alguma das duas for domingo: a pessoa passa a "não trabalha domingo" (sai do rodízio).
  - Se tinha folga fixa no domingo e deixou de ter: volta ao rodízio do setor e entra no time com menos gente.
  - Em todos os casos **a escala da pessoa é refeita** na hora (dias fixados ficam).
- **RN-EQP-04 — Domingos na Equipe.** Mudar a regra de domingo de uma pessoa só altera o cadastro. A escala muda na próxima geração. [PENDENTE] (ver 11.7)
- **RN-EQP-05 — Mudar de setor.** A pessoa leva a sua escala para o novo setor; passa para o primeiro turno normal do novo setor, perde o intervalo próprio e o turno de domingo próprio, e recebe o primeiro posto do setor.
- **RN-EQP-06 — Turno de domingo da pessoa.** É escolhido na tela Domingos (4.4).

### 4.4 Tela Domingos

**Objetivo:** montar a escala própria de cada domingo — quem trabalha, em qual turno e quem folga — sem mexer nos horários da semana.

**Cabeçalho:** "Domingos · {setor}" e abas de setor. Subtítulo: "Escala própria de domingo: quem trabalha, em qual horário e quem folga em cada domingo, sem mexer nos horários da semana. Toda mudança aqui fica fixa quando o sistema gerar de novo."

**Filtros:** "Loja" (com mais de uma), "Função", "Rodízio" ("Todos", "Time A", "Time B"…, "Sem time"), "Colaborador" (nome) e **"Ordenar por"**: "Ordem de cadastro" (padrão), "Pessoa (A–Z)", "Turno de domingo (entrada)" (pelo horário de entrada do turno de domingo habitual; empate pelo turno da semana e pelo nome) e "Turno da semana (entrada)" (pelo turno da semana; empate pelo turno de domingo e pelo nome), com o botão "▲ Crescente" / "▼ Decrescente" (o desempate pelo nome segue o mesmo sentido: decrescente inverte a lista inteira). Os cabeçalhos "Pessoa" e "Turno de domingo habitual" também ordenam (↕ / ▲ / ▼; clicar de novo inverte). A ordem vale para todas as lojas mostradas e não é guardada. Texto de apoio com links: "Horários de domingo ficam em Horários (você pode criar vários turnos de domingo). O rodízio Time A / Time B fica em Equipe."

**Estados da loja:** "Esta loja não tem o setor {setor}." / "A loja fica fechada aos domingos (mude em Personalizar → Funcionamento e jornada)." / "Nenhum domingo aberto no período planejado." / "Ninguém encontrado com esses filtros."

#### 4.4.1 Escala de domingo (uma por loja mostrada)

- Título "{loja ·} Escala de domingo · {setor}". Subtítulo: "N domingos no planejamento (dd/mm a dd/mm). Escolha em cada célula: folga ou o turno do dia."
- Botões "Copiar um domingo…" e "Modelos de domingo…" (abrem 4.4.2 e 4.4.3).
- **Datas dos domingos:** "‹" e "›" mostram o bloco anterior ou seguinte de domingos (o período planejado anda a quantidade de semanas do período); no meio, "Dom dd/mm a Dom dd/mm"; "Ir para" (data; mostra o primeiro domingo) traz os domingos da semana dessa data — se o domingo dessa semana já aparece, nada muda; senão, o período passa a começar na semana da data. Texto: "Muda as datas do planejamento da loja (as mesmas da Escala). O que já foi feito em outras datas continua guardado." Os dias que entram no período ganham escala pelo preenchimento automático (RN-CAL-07). Com várias lojas, cada loja tem a sua barra.
- **Tabela:**
  - "Pessoa" (nome, selos de time e 12x36; abaixo, o turno da semana e a entrada, ex.: "Abertura 08:15").
  - **"Turno de domingo habitual"**: "Padrão do setor ({turno} HH:MM–HH:MM)" ou um turno de domingo do setor. Ao mudar: grava o turno habitual de domingo da pessoa e faz os domingos e feriados já escalados que estavam com outro turno de domingo escolhido à mão voltarem ao habitual (RN-DOM-10). Mensagem: "Turno de domingo de {pessoa}: {turno}. Os domingos já escalados (inclusive os escolhidos à mão) passaram para esse turno." ou "… Vale para todos os domingos do planejamento." Se ainda houver domingos com outro horário escolhido à mão: "N domingos estão com outro horário escolhido à mão · usar o habitual em todos" (o link faz todos voltarem; mensagem "{pessoa}: N domingos voltaram para o turno habitual.").
  - Um domingo por coluna: "Dom dd/mm" e "Trabalha o Time X" (ou "Trabalham os times X e Y" com 3+ times). Cada célula é uma lista: "Folga", "Habitual: {turno}", grupo "Turnos de domingo" e grupo "Horários da semana" (é possível escalar alguém num turno da semana num domingo). Abaixo, o horário "HH:MM–HH:MM". Ponto de "fixado à mão". Férias, falta e atestado aparecem como texto ("Férias", "Falta", "Atestado") e não são editáveis.
  - "Trabalha": domingos trabalhados / domingos do período.
  - Rodapé "Trabalhando": quantos trabalham em cada domingo e, se o domingo tem necessidade, "Falta N (pico P)" (vermelho) ou "Completo (pico P)" (verde).
- **Toda escolha numa célula grava o domingo como fixado à mão** (com o turno escolhido, se não for o habitual).
- Depois de mudar domingos: aviso "Você mudou N domingo(s) à mão. Se alguém ficou com folga a mais ou a menos na semana, reorganize as outras folgas (os domingos que você escolheu ficam como estão)." + "Reorganizar as folgas da semana" (gera o setor; mensagem "Folgas de {setor} reorganizadas mantendo os domingos escolhidos.").
- **"Atenção às regras (N)"**: até 8 alertas de gravidade "problema" ligados a domingos (títulos "Domingos", "Folgas", "Jornada semanal", "Dias seguidos" ou que apontam para um domingo). Mais que 8: "E mais N. Veja todos na tela Escala."

#### 4.4.2 Copiar um domingo

Quadro "Copiar a configuração de um domingo para outros":
- "Copiar o domingo" (lista de domingos do período) e o resumo "(N trabalham, M folgam)".
- "Para": botões com os outros domingos e o atalho "Todos".
- Prévia: "dd/mm: N mudanças · …. Quem está de férias ou com falta não muda. Os domingos copiados ficam fixos."
- "Copiar para N domingos" → confirmação "Confirmar cópia (substitui esses domingos)". Mensagem: "Domingo dd/mm copiado para N domingos. Reorganize as folgas da semana se alguém ficou com folga a mais ou a menos."
- Regras: para cada domingo de destino aberto e cada pessoa que tinha situação no domingo de origem, grava trabalho (com o turno) ou folga como **fixado**; quem tem férias, falta ou atestado no destino não muda.

#### 4.4.3 Modelos de domingo

Quadro "Modelos de domingo": "Guarde a configuração de um domingo (quem trabalha, em qual turno, quem folga) e aplique em outros domingos quando quiser."
- "A partir do domingo", "Nome do modelo" (ex.: "Domingo de movimento forte"; vazio = "Domingo dd/mm") e "Salvar como modelo". Mensagem: "Modelo "{nome}" salvo."
- Lista de modelos do setor: "{nome} · N trabalham · M folgam", "Excluir" (confirmação "Excluir modelo"), "Aplicar em" (domingos) com a contagem de mudanças por domingo e "Aplicar em N domingos" → confirmação "Confirmar (substitui esses domingos)". Mensagem: "Modelo "{nome}" aplicado em N domingos."
- Os modelos ficam gravados no setor e valem só para as pessoas que existiam quando o modelo foi salvo e ainda estão no setor.

### 4.5 Tela Escala de Almoço

**Objetivo:** cada pessoa tem **um horário de almoço**, que se repete todos os dias de trabalho. O sistema sugere esse horário espalhando as pessoas para que pouca gente almoce junto. O usuário muda quando quiser, e o sistema nunca passa por cima do que ele escolheu.

Esta tela foi refeita em 06/11/2026 ("refaça o sistema de escala de almoço. está muito ruim, bugado"). O usuário apontou quatro problemas:
- o ajuste não ficava;
- a tela era confusa;
- os horários mudavam demais;
- havia gente demais almoçando junto.

Decisões do usuário: o padrão é o **horário fixo sugerido**, e as **duas visões** (Dia e Semana) são mais simples e têm os mesmos controles. O modelo anterior (distribuição dia a dia, rodízio por setor, sugestões com prévia) está descrito nas versões até a 86 deste documento.

**Filtros:**
- "Loja", quando houver mais de uma.
- **"Ver"**: "Semana" (padrão) ou "Dia".
- Data, com ‹ e ›. Na Semana as setas andam 7 dias ("Semana anterior" / "Próxima semana"); no Dia, 1 dia ("Dia anterior" / "Próximo dia").
- "Ordem": "Entrada", "Horário do almoço" ou "Nome", com ▲/▼.
- "Função", "Turno" e "Colaborador" (nome).

Para cada loja mostrada há um quadro "{loja ·} Almoço · {setor}".

#### 4.5.1 Barra do quadro

- **Subtítulo:**
  - Semana: "Semana de dd/mm/aaaa a dd/mm/aaaa. Na coluna “Almoço” fica o horário de cada pessoa (fixo ou rodízio); nos dias, clique num horário para mudar só aquele dia."
  - Dia: "{Dia}, dd/mm/aaaa[ — loja fechada]. Na coluna “Almoço” fica o horário de cada pessoa; em “Neste dia”, clique para mudar só hoje."
- **"Sugerir horários de novo"**: pede confirmação com "Recalcular todos". Recalcula o horário fixo de **todo mundo que não está em rodízio** (RN-ALM-02). Os horários mudados só num dia continuam como estão.
- **Resumo** (`#alm-resumo-{loja}`): "N com horário fixo · M em rodízio · até P almoçando ao mesmo tempo (dia às HH:MM)".

#### 4.5.2 Tabela (as duas visões)

Há uma linha por pessoa do setor, na ordem escolhida. As colunas comuns são:

- **Pessoa:** nome, função e "{turno} HH:MM–HH:MM".
- **Almoço:** é aqui que se define o horário de cada pessoa.
  - Escolha **"Fixo"** ou **"↻ Rodízio"** (`#alm-modo-{pessoa}`).
  - **Tempo de almoço** (`#alm-dur-{pessoa}`, desde 07/11/2026): "{tempo} (turno)" (padrão) ou de 15 min a 4h, de 15 em 15 min (dado `almocoMin`). **A saída anda junto**, e as horas trabalhadas continuam as mesmas: por exemplo, turno 08:15–18:39 com 2h de almoço → com 1h30, a saída passa para 18:09. Mensagem: "{pessoa}: almoço de 1h30. A saída fica às HH:MM, com as mesmas horas de trabalho." Aviso em âmbar (grava mesmo assim; `#alm-dur-aviso-{pessoa}`): "Abaixo do mínimo de 1h para quem trabalha mais de 6h." ou "Acima do máximo de 2h da loja." (valores das regras da loja ou do setor). Vale nos dias normais no turno de sempre; domingo, feriado e dia com outro turno seguem o turno do dia.
  - No fixo: campo de hora (`#alm-hora-{pessoa}`) e "até HH:MM" (fim, pela duração do intervalo).
  - No rodízio: "muda a cada dia".
  - Avisos em vermelho (`#alm-aviso-{pessoa}`): "Não cabe no turno (…): precisa de pelo menos 1h de trabalho antes e depois." ou "Fora do horário do intervalo do turno (HH:MM–HH:MM)." O horário é gravado mesmo com aviso.
  - Para turno sem intervalo, mostra "Turno sem intervalo".
  - **Domingo** (`#alm-dom-{pessoa}`, desde 07/11/2026; quem trabalha domingo, com a loja aberta no domingo): almoço próprio do domingo, separado do da semana.
    - Horário (`#alm-dom-hora-{pessoa}`): vazio = **automático** (o sistema distribui no turno de domingo); preenchido = sempre nesse horário no domingo. "automático" volta ao automático.
    - Tempo (`#alm-dom-dur-{pessoa}`): "{tempo} (turno dom.)" ou, quando o turno de domingo não tem intervalo, "Sem almoço (turno dom.)"; ou de 15 min a 4h. A saída do domingo anda junto (mesmas horas de trabalho).
    - **Turno de domingo sem intervalo:** escolher um tempo (ou um horário, que usa 1h) cria o almoço do domingo para a pessoa. No automático, ele é espalhado entre quem tem almoço no domingo, com pelo menos 2h de trabalho antes e 1h depois.
    - Aviso em vermelho quando o horário não cabe ("Domingo: Não cabe no turno (…)…[ O sistema usa o horário do turno.]").
    - Mensagens: "{pessoa}: almoço de domingo às HH:MM." / "{pessoa}: almoço de domingo automático." / "{pessoa}: almoço de domingo de 1h. No domingo a saída fica às HH:MM, com as mesmas horas de trabalho." / "{pessoa}: sem almoço no domingo (como o turno de domingo)."

**Visão Semana:** uma coluna para cada um dos 7 dias.
- Cada célula é um botão com o almoço do dia ("HH:MM–HH:MM").
  - Leva o selo **"SÓ HOJE"** quando foi mudado só naquele dia, e ↻ quando a pessoa está em rodízio.
  - Fica em vermelho quando está fora do horário do intervalo do turno ou não cabe.
- Sem almoço no dia, a célula mostra "Folga", "Férias", "Falta", "Atestado", "Feriado", "Fechada" ou "Sem almoço".
- Rodapé por dia: "Almoçando ao mesmo tempo (máximo)" e "Abaixo do mínimo no posto" ("Xh pessoa-hora" ou "ok").

**Visão Dia:** a coluna **"Neste dia"** (o mesmo botão da semana) e a **grade do dia inteiro**.
- A grade tem faixas de 30 min, da primeira entrada à última saída. Cada faixa é colorida: trabalhando (cor do turno), almoço, em outro setor, outra atividade ou fora do turno.
- A tabela rola para o lado dentro do quadro; a página não rola para o lado.
- Rodapé por faixa: "No posto", "Almoçando", "Mínimo" e "Sobra / falta" (negativo em vermelho).
- Abaixo da grade: "Não trabalham neste dia: {nome} (folga/férias/…)".

**Mudar só um dia:** clicar num almoço do dia abre um campo de hora com:
- **"Só neste dia"**: grava o horário daquele dia e marca "SÓ HOJE";
- **↺**: só aparece quando o dia foi mudado e volta ao horário de sempre (fixo ou rodízio);
- **Cancelar**, ou a tecla Esc.

Legenda: "SÓ HOJE — mudado só naquele dia (o sistema não mexe)", "↻ rodízio", "vermelho: fora do horário do intervalo do turno ou não cabe", "Domingo e feriado seguem o turno do dia."

#### 4.5.3b Gráfico "Pessoas trabalhando · {setor}"

Fica **embaixo da Escala de Almoço** de cada loja mostrada (`#alm-graf-{loja}`), sempre do **setor escolhido** nas abas. Histórico de 07/11/2026: um primeiro gráfico por setor, abaixo dos filtros, foi trocado por um da loja inteira "em tempo real"; depois o usuário pediu que ele respeitasse o setor escolhido e ficasse embaixo da escala de almoço.

- **O que mostra:** quantas pessoas do setor estão **trabalhando** em cada momento do dia, de 5 em 5 minutos (quem está almoçando não conta). É uma linha com área, da primeira entrada à última saída.
- **Ao vivo:** quando o dia é hoje, aparece o selo "AO VIVO" e "Agora (HH:MM): N pessoas trabalhando · M almoçando", com a linha vermelha "agora". Atualiza sozinho a cada 30 segundos.
- **Outros dias:** "Pico: N pessoas às HH:MM."
- **"● Ver agora (hoje)":** aparece quando hoje não está na tela e leva a tela para hoje. Fora do período planejado vale a escala padrão.
- **Dia do gráfico:** na visão Semana, um botão por dia ("· hoje" no dia de hoje; dia fechado desabilitado).
- **Passar o mouse:** o horário, "N trabalhando", "M almoçando" e a lista por turno ("Abertura 3", "Tarde 2 1 +1 alm.").
- Os filtros de função, turno e colaborador só valem na tabela.

#### 4.5.3 Regras do almoço (RN-ALM)

- **RN-ALM-01 — Princípio.** Distribuir os almoços nunca muda a entrada, a saída, as horas trabalhadas, a duração do intervalo nem as folgas. Só muda o **início** do intervalo. A duração só muda quando o usuário escolhe o tempo de almoço da pessoa (4.5.2); aí a saída anda junto.
- **RN-ALM-02 — Horário fixo sugerido (padrão).**
  - Toda pessoa sem horário recebe uma sugestão para o turno de sempre. Isso vale para quem é novo, para quem mudou de turno e para o primeiro uso (dado `breakStart`, com `almocoFixo` = sim).
  - **Quando:** ao abrir as telas, ao gerar a escala, ou quando a pessoa entra no setor ou muda de turno. Aparece a mensagem "Horário de almoço sugerido para N pessoa(s) (dá para mudar na Escala de Almoço)."
  - **Opções de início:** de 30 em 30 min, dentro do horário do intervalo do turno (Horários). Cada opção precisa de pelo menos 2h de trabalho antes, pelo menos 1h depois e no máximo 6h seguidas antes e depois. Turno sem horário de intervalo gravado usa o intervalo do próprio turno.
  - **Critério de escolha:** quem tem as mesmas opções forma um grupo. Os alvos do grupo ficam espaçados por igual entre o primeiro e o último início possível, e quem entra antes almoça antes. Cada pessoa fica com a opção que deixa **menos gente almoçando junto** (por faixas de 15 min). As faixas contam todo o setor, inclusive outros turnos. No empate, fica a opção mais perto do seu alvo.
  - "Sugerir horários de novo" refaz a sugestão de todos os fixos.
- **RN-ALM-03 — O que o usuário escolhe nunca é desfeito.** O sistema não muda:
  - o horário fixo digitado na coluna "Almoço";
  - o horário gravado com "Só neste dia" (dado `brk` com `brkFix` = sim na célula).
  
  Isso vale ao gerar a escala, ao mudar outras pessoas, ao recarregar a página e na distribuição automática. "Sugerir horários de novo" recalcula os fixos, mas mantém os "Só neste dia".
- **RN-ALM-04 — Onde o fixo vale.** A pessoa almoça no horário fixo em todo dia normal em que trabalha no turno de sempre. Nada é gravado nesses dias: o horário vem do cadastro da pessoa, e mudar o fixo muda todos esses dias de uma vez.
- **RN-ALM-05 — Rodízio (opcional, por pessoa).** "↻ Rodízio" tira o horário fixo da pessoa (dado `almocoRodizio`). O horário passa a ser escolhido **a cada dia**, com o critério de RN-ALM-02 em volta dos horários já ocupados pelos fixos, e a fila do grupo gira a cada dia. Voltar a "Fixo" sugere um horário novo.
- **RN-ALM-06 — Domingos, feriados e dias com outro turno.** Nesses dias o almoço segue o turno do dia, e todos os que trabalham são distribuídos no dia, com o mesmo critério.
  - **Domingo com definição própria da pessoa** (dados `almocoDomingo` e `almocoDomingoMin`; só no domingo, no turno de domingo, sem turno escolhido para o dia): o tempo próprio muda a duração e a saída; o horário próprio fica fixo (como o horário fixo da semana) e os outros se distribuem em volta. O "só neste dia" continua mandando. Feriados não usam a definição de domingo.
- **RN-ALM-07 — Dias sem trabalho.** Folga, férias, falta, atestado, feriado e loja fechada não têm almoço. Um horário que sobrou de um dia que deixou de ser de trabalho é apagado, a não ser que tenha sido escolhido à mão.
- **RN-ALM-08 — Quando o turno muda.** Em Horários, se a pessoa muda de turno ou o turno é editado:
  - o horário fixo continua se ainda cabe (1h de trabalho antes e depois, dentro do horário do intervalo);
  - senão é apagado e o sistema sugere outro (RN-ALM-02).
- **RN-ALM-09 — Avisos.** Um almoço fora do horário do intervalo do turno, ou que não cabe no expediente, aparece em vermelho na tabela e com o aviso da coluna "Almoço". Os alertas de intervalo da escala (aba Alertas) continuam como antes.
- **RN-ALM-10 — Ordem.**
  - "Entrada": pela entrada; no empate, pelo almoço e depois pelo nome.
  - "Horário do almoço": pelo horário fixo, ou pelo do dia no rodízio; quem não tem almoço vai para o fim.
  - "Nome": ordem alfabética.
  - ▼ inverte a lista inteira.
- **RN-ALM-11 — Quando o sistema confere.** Uma assinatura do setor junta o período, os turnos, as pessoas (turno, fixo, rodízio, duração) e os dias de cada pessoa (código, turno do dia e o que foi escolhido à mão). Quando ela muda, os almoços são postos em dia sozinhos (RN-ALM-02 a 07), 0,5 s depois da última mudança. Isso também acontece ao fim de "Gerar escala", e o relatório da geração diz: "Almoços: cada pessoa no horário fixo dela (ou rodízio) — veja e mude na Escala de Almoço."
- **RN-ALM-12 — Passagem do modelo antigo** (uma vez por setor; dado `almocoVersao` = 2):
  - os horários gravados dia a dia pelo sistema antigo saem;
  - o dia que tinha duração própria fica marcado como escolhido à mão;
  - quem já tinha horário próprio fica com ele como horário fixo;
  - quem não tinha recebe a sugestão;
  - a escolha de rodízio ou fixo por setor (`almocoModo`) deixa de ser usada.
- **RN-ALM-13 — Gravação.** O horário e a duração do dia e a marca "só neste dia" são gravados junto com a escala e não se perdem ao recarregar. Antes de 06/11/2026, a duração do dia e a marca não eram gravadas (OB-02, corrigido).

### 4.6 Tela Dashboards

**Objetivo:** reunir os painéis de leitura (só consulta; nada é alterado).

Abas no topo ("DASHBOARDS"): **"Faltas"** (ranking de faltas), **"Atestados"** (ranking de dias de atestado), **"Colaboradores"** (por setor e por função) e **"Lojas"** (resumo de cada loja e setor). O endereço guarda a aba (`#dashboards/faltas` etc.); os endereços antigos `#faltas` e `#atestados` abrem a aba correspondente.

#### 4.6.1 Faltas e Atestados

As duas abas funcionam igual; mudam os textos e o código contado (A = falta, M = atestado). Os registros vêm da escala (lançados pela ferramenta "Falta" ou "Atestado" da Semana ou do Mês). Pedido do usuário (rankings) e decisão de separar faltas de atestados.

- **Cabeçalho:** "Ranking de faltas" / "Ranking de atestados". Subtítulo: "Faltas lançadas na escala de {loja | N lojas} · {período}. Para lançar: Escala → Semana (ou Mês) → “Falta” e clique no dia." Botões "Baixar ranking (Excel)" e "Lançar falta na escala" / "Lançar atestado na escala" (vai para a Escala).
- **Filtros:** "Período" ("Todas as datas", "Período planejado", "Este mês", "Mês passado", "Últimos 30 dias", "Últimos 90 dias", "Este ano", "Escolher datas…" com "De" e "Até"), "Loja", "Setor", "Turno", "Função", "Dia da semana", "Colaborador" (nome ou matrícula) e "Limpar filtros".
- **Sem nenhum registro na loja:** "Nenhuma falta registrada" — "O ranking aparece assim que houver faltas lançadas." com os passos: 1) "Abra a Escala e vá até a Semana (ou o Mês)."; 2) "No seletor “Ao clicar num dia”, escolha “Falta”."; 3) "Clique no dia em que a pessoa faltou. A falta fica fixada e entra neste ranking." (atestado: "Clique em cada dia coberto pelo atestado…") + "Ir para a Escala".
- **Indicadores:**
  - "Faltas" / "Dias de atestado": total de dias; subtítulo "N ocorrências (faltas seguidas contam uma vez / dias seguidos contam como um atestado)" ou "Nenhum registro com esses filtros";
  - "Pessoas com falta/atestado": quantas tiveram, "De N pessoas (X%)";
  - "Taxa de faltas/atestados": total ÷ dias escalados, "N de M dias escalados (K estimados: datas sem escala gravada)";
  - "Emendadas à folga": registros no dia antes ou depois de folga ou feriado, "X% das faltas, no dia antes ou depois de folga/feriado".
- Linha de destaque: "Quem mais faltou: {nome} (N faltas[, loja]). Dia com mais faltas: {dia} (N)."
- **Gráficos:** "Faltas por dia da semana" (colunas, segunda a domingo); "Faltas por setor/turno/loja/função" ("Agrupar por"; barras com "X% · N pessoas"; até 10 grupos, com aviso "Mostrando os 10 grupos com mais faltas de N."); "Faltas por semana" (uma coluna por semana a partir da segunda-feira; só com mais de uma semana).
- **Ranking:** "Clique numa pessoa para ver as datas. Empates dividem a mesma posição." Caixa "Mostrar quem não faltou / não teve atestado". Colunas "#", "Colaborador" (com loja, setor, turno e função), "Faltas"/"Dias" (barra), "Ocorrências", "Emendadas à folga", "Dias escalados" ("≈" quando há estimativa), "Taxa", "Última falta/atestado". Ordenável por colaborador, quantidade, ocorrências, emendadas e taxa. Abre as datas (com "· emendada"). Mostra 25 e "Ver mais (N)" de 50 em 50. Sem resultado: "Ninguém faltou com esses filtros."
- **Excel** (`ranking-de-faltas-AAAA-MM-DD.xlsx` / `ranking-de-atestados-…`): título e período, linha de filtros, colunas "Posição", "Colaborador", "Matrícula", "Loja", "Setor", "Turno", "Função", "Faltas (dias)" / "Dias de atestado", "Ocorrências", "Emendadas à folga", "Dias escalados", "Taxa", "Última…", "Datas". Sem linhas: "Nada para exportar com esses filtros." Sucesso: "Planilha do ranking de faltas gerada."

**Regras de contagem (RN-ABS):**
- **RN-ABS-01 — Datas consideradas.** O período planejado e todas as datas que já têm escala gravada para a pessoa, dentro do filtro de período e de dia da semana.
- **RN-ABS-02 — Dias escalados.** Dias com T, D, A ou M nas datas conhecidas. Fora do período e sem escala gravada (entre a primeira e a última data conhecida, ou dentro do filtro), o sistema **estima** os dias de trabalho: `(7 − folgas por semana da loja) ÷ 7` de cada dia aberto (meio dia para 12x36), a partir da admissão. As estimativas aparecem com "≈".
- **RN-ABS-03 — Ocorrências.** Registros seguidos contam como uma ocorrência; folgas e feriados no meio não separam. Uma nova ocorrência começa quando há dia trabalhado ou férias entre dois registros, ou mais de 14 dias.
- **RN-ABS-04 — Emendada à folga.** Registro no dia antes ou depois de uma folga (F), feriado (H) ou dia com a loja fechada.
- **RN-ABS-05 — Ranking.** Padrão: mais dias primeiro; empates por mais dias, maior taxa e nome. Empates dividem a mesma posição.

#### 4.6.2 Colaboradores

- Cabeçalho "Colaboradores": "Quantas pessoas há em cada setor ou função, somando as lojas ou uma por loja."
- Gráfico de pizza "Colaboradores por setor" / "… por função": "Agrupar por" (Setor ou Função), "Loja" e, com várias lojas, "Somadas" ou "Separadas" (uma pizza por loja). No máximo 8 fatias; as demais viram "Outros (N)". Dica com número e %. Setores usam a cor do setor. Loja sem pessoas: "Nenhum colaborador cadastrado nesta loja."

#### 4.6.3 Lojas

- Cabeçalho "Resumo das lojas": "Equipe e cobertura de cada loja, setor a setor."
- Tabela (uma linha por loja e setor visível que tenha pessoas ou necessidade): "Loja", "Setor", "Pessoas", "Horários cobertos" (verde ≥ 99,5%, âmbar ≥ 95%, vermelho abaixo; "sem necessidade" quando não há faixas), "Horas faltando/sem.", "Problemas" (vermelho se > 0) e "Atenção".
- Clicar no nome de outra loja a torna a loja em uso. Clicar no setor abre a Escala daquele setor (trocando a loja, se for o caso). A linha da loja e setor em uso fica destacada.

### 4.7 Tela Férias

**Objetivo:** programar **de quando até quando** vão as férias de cada pessoa (no calendário ou pela escolha automática), lançar na escala e ver quem sai quando. As férias lançadas entram na escala como dias **V** fixados.

Desde 06/11/2026 a tela não tem mais admissão ("A Escala de férias eu não quero que tenha um campo de admissão... apenas o mês programado de férias (pode ter sistema de escolha automática)"). Saíram o saldo, o vencimento, a situação por período aquisitivo e as "quitadas até", que dependiam da admissão. Decisão do usuário: o período programado **só anota o planejamento** e não lança dias na escala. Na mesma data, o mês deu lugar ao período: "ao invés de selecionar o mês... me permita abrir um calendário e escolher a data... de tal data até tal data".

**Cabeçalho:** "Controle de férias".
- Subtítulo: "Programe de quando até quando vão as férias de cada pessoa (ou deixe o sistema escolher), lance na escala e veja quem sai quando[ em N lojas]. As férias lançadas entram na escala como dias de férias (V)."
- Botões: "Baixar (Excel)" e "Programar férias".

**Filtros:**
- "Loja", "Setor", "Turno", "Função" e "Colaborador".
- "Situação": "Todas", "De férias hoje", "Com férias lançadas", "Com período programado" ou "Sem período programado".

#### 4.7.1 Indicadores (clicáveis: filtram a Situação)

| Cartão | Conteúdo |
|---|---|
| "De férias hoje" | pessoas com férias que incluem hoje |
| "Saem nos próximos 90 dias" | "Com férias lançadas" |
| "Com férias programadas" | "Período de … até escolhido" |
| "Sem férias programadas" | "Escolha as datas ou use a escolha automática" (âmbar se > 0) |

#### 4.7.2 Programar férias (lançar as datas)

Quadro "Programar férias" (ou "Alterar férias de {pessoa}").
- **Campos:** "Loja", "Setor", "Colaborador", "Início", "Dias corridos" e "Volta ao trabalho".
- **"Início":**
  - Quando o quadro é aberto pela linha da pessoa ou pela barra tracejada no mapa e o período programado ainda não começou, vêm o **início e os dias do período programado**.
  - Nos outros casos, o início é hoje + 30 dias.
- **Prévia:**
  - "dd/mm/aaaa a dd/mm/aaaa · N dias[ · programadas: dd/mm/aaaa a dd/mm/aaaa]";
  - sobreposição com férias já lançadas;
  - faltas, atestados e dias fixados que serão trocados (com o aceite obrigatório);
  - limite simultâneo do setor;
  - parte menor que o mínimo;
  - efeito na cobertura do período planejado.
- **Botões e mensagens:** iguais aos anteriores. Lançar, salvar, remover e limpar continuam do mesmo jeito.

#### 4.7.3 Atenção

"Avisos pelas regras de férias da loja. Nada é mudado sozinho." O quadro lista:
- os dias em que um setor passa do limite simultâneo (férias lançadas);
- os dias em que um setor passa do limite **contando também as férias programadas** ainda não lançadas: "{setor}: contando as férias programadas, N pessoas de férias ao mesmo tempo de dd/mm/aaaa a dd/mm/aaaa (limite da loja: M).";
- os avisos por pessoa (parte menor que o mínimo).

#### 4.7.4 Mapa de férias

"Cada barra cheia é um período de férias lançado na escala; tracejado é o período programado, ainda não lançado. Clique numa barra para alterar, remover ou lançar."
- O período programado aparece como uma **barra tracejada** ("Nd") de/até, quando a pessoa ainda não tem férias lançadas encostando nele.
- Clicar na barra tracejada abre o quadro 4.7.2 com o período programado.
- A linha de resumo acrescenta "N pessoas com férias programadas, ainda não lançadas (tracejado)."
- As linhas são ordenadas pela primeira férias (lançada ou programada) do ano.

#### 4.7.5 Férias programadas

"Escolha no calendário de quando até quando vão as férias de cada pessoa. É só planejamento: as férias entram na escala quando você lança em “Programar”."

**Filtros e ordem:** filtros "Loja" e "Setor", e o total de pessoas. A ordem é: quem não tem período primeiro, depois pelo início e pelo nome.

**"Escolher automaticamente":**
- Pede confirmação com "Escolher para N pessoas".
- Vale para quem está na tabela sem período programado e sem férias lançadas nos próximos 12 meses (RN-FEV-11).
- Mensagem: "Férias programadas para N pessoas, espalhando cada setor pelos próximos 12 meses.[ Em K casos não coube no limite de pessoas do setor ao mesmo tempo.]" ou "Todo mundo já tem férias programadas ou lançadas."

| Coluna | Conteúdo |
|---|---|
| "Colaborador" | nome, loja, setor, turno, função |
| "Férias programadas (de … até)" | dois calendários: **de** (`#vac-de-{pessoa}`) e **até** (`#vac-ate-{pessoa}`, desabilitado sem o "de"), "N dias" e "×" (tira o período). Regras: escolher só o "de" completa o "até" com os dias de férias da loja (30); mudar o "de" mantém a duração; "até" antes do "de" é recusado ("A data final precisa ser igual ou depois da inicial."). Abaixo: "Lançadas na escala" (verde) quando há férias lançadas encostando no período, ou "Já passou sem férias lançadas" (âmbar). Mensagem: "{pessoa}: férias programadas de dd/mm/aaaa a dd/mm/aaaa (N dias)." / "{pessoa}: sem férias programadas." |
| "Férias lançadas" | "De férias até dd/mm", "Próximas: dd/mm/aaaa a dd/mm/aaaa" ou "Nada lançado" |
| ação | "Programar" (abre o quadro 4.7.2 com o período programado) |

#### 4.7.6 Regras de férias da loja

Campos:
- "Dias por período" (30);
- "Menor parte (dias)" (5);
- "Uma parte com ao menos" (14);
- "Máximo de partes" (3);
- "Máx. no mesmo setor ao mesmo tempo" (sem limite; também usado na escolha automática e no aviso das programadas).

Botão "Voltar aos valores iniciais". Saíram os campos "Avisar antes de vencer (dias)" e "Faltas sem atestado reduzem os dias de férias", que dependiam da admissão.

#### 4.7.7 Regras de férias (RN-FEV)

- **RN-FEV-01 — Lançar.** O lançamento grava V **fixado** em cada dia corrido do período, inclusive folgas e domingos. Ele substitui faltas, atestados e dias fixados (com o aceite).
  - Alterar = remover o período antigo e lançar o novo.
  - Remover apaga os V.
  - Dias V seguidos formam um período de férias.
- **RN-FEV-02 a 06** (períodos aquisitivos, quitação, abatimento, desconto por faltas e situação) **foram retiradas** com a admissão, em 06/11/2026.
  - Uma data de admissão já gravada (ou vinda da importação de pessoas) fica guardada, mas não é mostrada nem usada nas férias.
  - Ela continua servindo só para não sugerir faltas antes da admissão.
- **RN-FEV-07 — Avisos por pessoa:** parte menor que o mínimo ("Férias de … com N dias (mínimo da loja: M).").
- **RN-FEV-08 — Limite simultâneo.** Avisa os dias em que o setor teria mais pessoas de férias que o máximo da loja: só com as lançadas, e também contando as programadas ainda não lançadas.
- **RN-FEV-09 — Efeito na escala.** V conta como indisponível (não é folga). As folgas dos colegas só se reorganizam com "Gerar escala". As férias programadas **não** mudam a escala.
- **RN-FEV-10 — Excel** ("Baixar (Excel)"):
  - aba "Férias por pessoa": Colaborador, Matrícula, Loja, Setor, Turno, Função, Férias programadas, De férias agora, Próximas férias;
  - aba "Períodos de férias": Colaborador, Loja, Setor, Início, Fim, Dias.
- **RN-FEV-11 — Escolha automática.**
  - **Quem entra:** em cada setor, as pessoas sem período programado e sem férias lançadas entre hoje e o fim do 12º mês seguinte.
  - **Inícios possíveis:** o dia 1 e o dia 16 de cada um dos 12 meses a partir do mês que vem; a duração é a dos dias de férias da loja (30).
  - **Ocupação de um dia:** quem tem férias lançadas mais quem tem férias programadas ainda não lançadas.
  - **Ordem de cadastro:** cada pessoa fica, nesta ordem de preferência, com o início:
    1. em que ainda cabe no limite "Máx. no mesmo setor ao mesmo tempo";
    2. com o menor pico de gente de férias no período;
    3. com menos gente de férias somando os dias;
    4. com menos gente da **mesma função**;
    5. o mais cedo (o dia 16 só quando ajuda).
  - **O que não muda:** quem já tem período. Nada é lançado na escala.
  - **Formato antigo:** um mês já escolhido na versão anterior (`feriasMes`) vale como do dia 1 pelos dias de férias da loja, e é trocado pelo período ao ser mudado.
  - **Exemplo:** 9 pessoas da Padaria → uma por mês, de 01/12 a 01/08, alternando Forno e Balcão.

### 4.8 Tela Horários

**Objetivo:** cadastrar os turnos do setor (normais, plantões 12x36 e de domingo/feriado) e as regras de intervalo de cada turno.

**Cabeçalho:** "Horários · {setor}", seletor **"Loja"** (com mais de uma loja: escolhe a loja que a tela edita) e abas de setor. Subtítulo: "Loja aberta de segunda a sábado das HH:MM às HH:MM, domingo das HH:MM às HH:MM (ou ", fechada aos domingos"). Cada turno usa a jornada da loja, de 8h24 por dia (mude em Personalizar), ou as horas que você puser no turno (ex.: um turno de estágio de 5h)."

**Botões:** "Copiar escala…" (painel 4.2.10) e "+ Turno".

**Organização:** três grupos de cartões — turnos normais, "Plantões 12x36" e "Domingos e feriados" (este só com a loja aberta aos domingos). Com mais de um turno normal: "Arraste um turno pela alça ⠿ (ou use ‹ ›) para mudar a ordem. A mesma ordem aparece na escolha de turno em Equipe."

#### 4.8.1 Cartão do turno

| Campo | Regras |
|---|---|
| Alça ⠿ e ‹ › | Mudam a ordem **dentro do mesmo grupo** (normal, plantão, domingo). Só aparecem com 2+ turnos no grupo. Arrastar sobre outro cartão do mesmo grupo coloca o turno no lugar dele. (Pedido: "arrastar e mudar as ordens".) |
| Nome | Texto livre. |
| Pessoas | "N pessoas" que usam o turno (no turno de domingo: quem tem esse turno de domingo, ou o padrão do setor). |
| "Entrada" | Hora. |
| "Saída (calculada)" | Somente leitura (RN-TUR-01). |
| "Horas trabalhadas" | Duração. Nos turnos normais mostra "jornada da loja" ou "próprio do turno · usar a da loja (8h24)". Digitar o mesmo valor da jornada da loja volta a "jornada da loja". Valor 0 é ignorado. (Pedido "Atualização 2.0", item 3: turno de estágio com 5h.) |
| "Duração do intervalo" | "sem intervalo", 15 min, 30 min, 1h, 1h30, 2h (e a atual, se for outra). Escolher uma duração num turno sem intervalo cria o intervalo 4h depois da entrada. |
| "Entra no rodízio semanal de turnos" | Só turnos normais, quando a regra avançada 12 está ligada (ou o turno já está marcado: "(regra desligada em Personalizar)"). |
| "Horário do intervalo" | Turnos com intervalo: **"entre [HH:MM] e [HH:MM]"** — o único campo de horário do intervalo. O intervalo inteiro fica dentro desse horário, e os horários fixos sugeridos se espalham nele (RN-ALM-02). Texto abaixo: "Os almoços são distribuídos por igual entre A e B: o intervalo inteiro fica dentro desse horário. Cada pessoa recebe um horário fixo espalhado nesse horário (dá para mudar na Escala de Almoço)."; quando o horário tem o tamanho do intervalo: "Intervalo fixo: sempre das A às B."; quando não cabe: "Esse horário não cabe o intervalo de Xh: aumente o horário ou diminua a duração." (vermelho). Sem horário gravado, o campo mostra o horário do intervalo do turno ± o limite antigo (padrão 1h). Ao gravar, o horário-base do intervalo fica dentro dele. (Pedido do usuário: "deixe apenas o campo de tal hora a tal hora para referenciar o horário do intervalo"; saíram os campos "Intervalo começa", "Usar janela permitida", "O início / o intervalo inteiro", "Espaçados por igual / conforme o movimento" e "Ao distribuir, o intervalo pode mudar".) |
| "Cor do turno" | Seletor de cor (com "sem cor"). Aparece como faixa nas telas. |
| "Padrão do setor" | Só turnos de domingo: "Turno de domingo padrão" ou botão "Usar como padrão". |
| Resumo | "HH:MM + Xh de trabalho + Yh de intervalo = saída às HH:MM[ do dia seguinte][ · 12x36: trabalha dia sim, dia não]". |
| "Excluir turno" | Confirmação "Excluir (N pessoa(s) mudam de turno)" ou "Confirmar exclusão". |

**Regras do cartão (RN-HOR):**
- **RN-HOR-01 — Intervalo acompanha o turno.** Mudar entrada ou horas: se o intervalo ficar fora do turno, ele vai para o meio da jornada (arredondado a 15 min); se o horário do intervalo gravado ficar fora do turno, ele é apagado (volta ao horário do intervalo ± 1h). Não vale para plantões.
- **RN-HOR-02 — Intervalo de sempre das pessoas.** Mudar entrada, início ou duração do intervalo, horas, limite ou janela de um turno apaga o início de intervalo de sempre próprio das pessoas daquele turno.
- **RN-HOR-03 — Excluir turno.** Quem estava no turno vai para outro turno do mesmo tipo (plantão para plantão, normal para normal) ou para o primeiro normal; quem tinha o turno como domingo habitual volta ao padrão; os dias que usavam o turno voltam ao turno habitual (fixação mantida); os modelos de domingo perdem a referência ao turno; se era o domingo padrão, o próximo turno de domingo vira padrão.
- **RN-HOR-04 — "+ Turno".** Cria "Turno N" (N = turnos normais + 1), entrada 09:00, intervalo 13:00 de 1h, jornada da loja.
- **RN-HOR-05 — Plantões.** "+ Plantão dia (07h–19h)" e "+ Plantão noite (19h–07h)" criam os plantões de RN-REG-06. Texto do grupo: "12 horas de trabalho por 36 de descanso: a pessoa trabalha dia sim, dia não, inclusive domingos e feriados. Pode passar da meia-noite (ex.: 19h às 7h). Quem é 12x36 você escolhe na coluna “Regime” em Equipe." Sem plantões: "Nenhum plantão neste setor."
- **RN-HOR-06 — Turnos de domingo.** "+ Turno de domingo" cria "Domingo" (ou "Domingo N"), entrada no horário de abertura do domingo, sem intervalo, 4h de trabalho; vira padrão se o setor não tiver padrão. Texto: "Horários usados quando a pessoa trabalha no domingo ou em feriado aberto. Crie quantos turnos precisar; quem trabalha em cada domingo e em qual turno você escolhe em Domingos."
- **RN-HOR-07 — Validações exibidas como alertas** (não bloqueiam): intervalo menor que o mínimo para jornada acima de 6h; intervalo acima do máximo; jornada acima da diária máxima (exceto plantão); intervalo fora do horário do turno; janela que termina antes de começar (RN-ALE-03).
- **RN-HOR-08 — Plantão noturno.** O intervalo depois da meia-noite pertence ao turno do dia anterior (não é considerado fora do turno).
- **RN-HOR-09 — Aplicar o horário da loja aos setores.** Ver Personalizar (4.12.3).

### 4.9 Tela Fluxo alto (antes "Necessidade")

**Objetivo:** dizer quantas pessoas o setor precisa no posto em cada horário. É a base da geração e da cobertura.

**Cabeçalho:** "Fluxo alto · {setor}", seletor "Loja" (com mais de uma) e abas de setor. Subtítulo: "Quantos {plural} precisam estar trabalhando em cada horário. O sistema usa isso para decidir onde cabem as folgas e para mostrar onde falta gente."

**Grupos** (um cartão cada): "Segunda a sexta" (dias 1–5), "Sábado" (6) e "Domingo e feriados" (0; só com a loja aberta aos domingos). Subtítulo do cartão: "Pico: N {plural}." ou "Nenhuma faixa ainda." Botão "+ Faixa".

**Linha de faixa:** "das [HH:MM] às [HH:MM] precisa de [N] {plural}" e "Remover" (confirmação "Remover faixa"). As faixas aparecem em ordem de início.

**"Exceções":** "Para dias específicos (ex.: só quarta-feira) ou uma data especial (véspera de feriado). Valem no lugar das faixas gerais no mesmo horário." Botões "+ Dias específicos" e "+ Data especial". Cada exceção mostra "Data especial" ou os dias, um seletor de dias da semana (ou de data) e a mesma linha de faixa. Sem exceções: "Nenhuma exceção." Uma faixa com conjunto de dias diferente dos grupos também aparece aqui.

Rodapé: "Dica: depois de mudar a necessidade, volte em Escala e clique em Gerar escala."

**Regras (RN-NEC, complemento):**
- **"+ Faixa":** início = fim da última faixa do grupo (ou a abertura do dia do grupo); fim = início + 3h, limitado ao fechamento e com pelo menos início + 30 min; mínimo = o da última faixa (ou 2).
- **"+ Dias específicos":** quarta, da abertura às 12:00, 2 pessoas. **"+ Data especial":** a data de início do período, da abertura ao fechamento, 2 pessoas.
- Mudar o mínimo apaga o ideal da faixa. Mínimo de 0 a 500.
- Toda mudança recalcula o movimento de cada dia (RN-NEC-04).
- Não há validação de faixas invertidas ou sobrepostas. [PENDENTE]

### 4.10 Tela Lojas

**Objetivo:** cadastrar uma ou várias lojas, copiar a estrutura de uma loja pronta, renomear, duplicar, excluir, escolher qual editar e quais aparecem nas telas.

**Cabeçalho:** "Lojas" — "Cadastre uma ou várias lojas de uma vez, copie a estrutura de uma loja pronta, renomeie, escolha qual editar e quais aparecem nas telas." Sem abas de setor.

#### 4.10.1 Nova loja

- **"Nome da loja"**: área de texto; "Para cadastrar várias, digite um nome por linha." Linhas vazias e nomes repetidos na lista são ignorados.
- **"Rede / empresa"**: padrão = a rede da loja em uso.
- **"Começar a partir de"** (uma opção):
  - **"Copiar de outra loja"** (padrão) — "Copia as regras avançadas e a montagem da escala: setores, turnos e intervalos, necessidade de pessoas, regra de domingo, jornadas, horário de funcionamento, feriados, dias sem folga e cores. Não copia os funcionários: cada loja cadastra a sua equipe." + "Copiar de" (lista "{loja} (N pessoas)"). (A opção "Copiar tudo de outra loja", com pessoas e escala, foi retirada a pedido do usuário: "as outras serão diferentes".)
  - **"Em branco"** — "Só os setores que você escolher, com turnos e necessidade iniciais para ajustar." + botões com os nomes de setores (os visíveis das lojas existentes + o catálogo). Padrão: os setores visíveis da loja em uso.
- **"Criar loja"** / **"Criar N lojas"** (desabilitado sem nome). Nome igual a uma loja existente: aviso "Já existe loja com o nome “X”. Ela será criada mesmo assim; você pode renomear depois." (não bloqueia).
- Validações: sem nome → "Digite o nome da loja (uma por linha para cadastrar várias)."; "Em branco" sem setor → "Escolha ao menos um setor."
- Resultado: as lojas novas entram no filtro de lojas; com uma só, ela passa a ser a loja em edição. Mensagens: "Loja “X” criada e aberta para edição. Regras e montagem da escala copiadas; cadastre a equipe em Equipe." / "… Confira Horários e Fluxo alto e cadastre a equipe." ou "N lojas criadas. Use “Editar” na lista para configurar cada uma."

#### 4.10.2 Suas lojas (N)

"“Nas telas” = aparece nas telas de escala e nos filtros por padrão. “Editar” abre a loja em Horários, Fluxo alto e Personalizar." Com mais de 5 lojas aparece "Buscar loja" (nome ou rede).

| Coluna | Conteúdo |
|---|---|
| "Nome da loja" | campo editável; "EM EDIÇÃO" na loja em uso |
| "Rede" | campo editável |
| "Pessoas" | total de pessoas |
| "Setores" | setores visíveis |
| "Período planejado" | "dd/mm a dd/mm/aaaa" |
| "Nas telas" | caixa: a loja faz parte do filtro de lojas (a última marcada não pode ser desmarcada) |
| ações | "Editar" (torna a loja a loja em uso; "Editando X."), "Duplicar" (cria "{nome} (cópia)" com as regras e a montagem da escala, sem funcionários: "“X (cópia)” criada com as regras e a montagem da escala (sem funcionários). Renomeie na lista.") e "Excluir" (só com mais de uma loja; confirmação "Excluir {loja} e todos os dados") |

#### 4.10.3 Regras de lojas (RN-LOJ)

- **RN-LOJ-01 — Cópia de loja** (Nova loja → "Copiar de outra loja" e "Duplicar"). Gera identificadores novos para loja, setores, turnos e faixas. Copia: setores (turnos, janelas de intervalo, necessidade, movimento, limite de folgas por dia, regra de domingo do setor, modelo do setor, regras próprias do setor, cores) e a configuração completa da loja (funcionamento, feriados, dias sem folga, regras avançadas, jornadas, tema, cores, férias). Nas regras avançadas, os setores de "Onde vale" e de "dias sem folga" passam para os setores da cópia; duplas de pessoas (regras 7 e 8) ficam vazias. **Não copia** funcionários, escala, modelos de domingo nem registro de geração.
- **RN-LOJ-02 — Loja em branco.** Configuração padrão (8h24, 42h, 08:30–19:00, domingo 08:30–12:15), início na próxima segunda, semana começando na segunda, faixas de 30 min, tema da loja em uso, regra de domingo "1x1". Os setores escolhidos do catálogo ficam visíveis; os não escolhidos ficam escondidos; nomes fora do catálogo viram setores novos (singular "colaborador"). Os setores nascem com os turnos "Abertura" (08:15, intervalo 12:00 de 1h), "Tarde" (09:30, intervalo 13:30 de 1h) e "Domingo" (08:15, 4h) e sem necessidade.
- **RN-LOJ-03 — Exclusão.** Apaga a loja e todos os seus dados do armazenamento. Se era a loja em uso, a primeira loja restante passa a ser a loja em uso.
- **RN-LOJ-04 — Nome repetido.** Permitido (só avisa).

### 4.11 Filtro de lojas e loja em uso (RN-FIL)

- **RN-FIL-01 — Loja em uso ("em edição").** É a loja que Horários, Fluxo alto e Personalizar editam, e onde "+ Pessoa" cadastra quando há várias lojas mostradas. Fica guardada no navegador.
- **RN-FIL-02 — Filtro de lojas.** No topo do menu: um botão com o nome da loja (e a rede) ou "N lojas selecionadas · em edição: {loja} ▾". Abre um quadro com "Buscar loja pelo nome", "Selecionar todas", "Limpar seleção" (fica só a loja em edição), a lista com caixas de marcar ("EM EDIÇÃO" ou "Editar esta") e "+ Cadastrar lojas" (vai para Lojas). Texto: "Este é o mesmo filtro “Loja” de todas as telas: mudar aqui ou numa tela muda em todas. Com uma loja só, ela é a que Horários, Fluxo alto e Personalizar editam." Fecha com clique fora ou Esc.
- **RN-FIL-03 — Regras da seleção.** A loja em uso sempre faz parte da seleção; pelo menos uma loja fica marcada; lojas que não existem mais são ignoradas. Se a loja em uso sai da seleção, a primeira selecionada passa a ser a loja em uso. A seleção fica guardada no navegador.
- **RN-FIL-04 — Seletor "Loja" das telas.** Com mais de uma loja, as telas Escala (Semana e Mês), Equipe, Domingos, Escala de Almoço, Dashboards e Férias mostram o seletor: "Todas as lojas (N)", "N lojas escolhidas no menu" (quando a seleção é parcial) ou uma loja. Escolher uma loja seleciona só ela e a torna a loja em uso. É o mesmo filtro do menu.
- **RN-FIL-05 — Várias lojas lado a lado.** Com várias lojas mostradas:
  - **Semana:** pessoas de todas as lojas nas mesmas datas, agrupadas por loja e setor (setores casados pelo nome). Dias fora do período de uma loja aparecem como "—".
  - **Mês:** uma grade por loja; "Gerar escala inteligente (N lojas)" gera cada uma.
  - **Equipe, Domingos, Escala de Almoço:** um bloco por loja, com o setor de mesmo nome; lojas sem o setor são avisadas.
  - **Dashboards e Férias:** somam as lojas (com filtros por loja).
- **RN-FIL-06 — Horários, Fluxo alto e Personalizar** editam só a loja em uso. Com mais de uma loja, Horários e Fluxo alto têm o seletor "Loja" no cabeçalho (escolher outra loja a torna a loja em uso).
- **RN-FIL-07 — Trocar de loja.** O setor aberto passa para o setor de mesmo nome na outra loja (ou o primeiro). O relatório de geração é fechado.

### 4.12 Tela Personalizar

**Objetivo:** configurar a loja em uso: identidade, setores, funcionamento, modelos, jornadas, feriados, aparência, regras e dados. Cabeçalho: "Personalizar" — "Deixe o sistema com a cara da sua loja: setores, horários de funcionamento, regras, cores e cópias de segurança." Sem abas de setor. Tudo é gravado na hora.

#### 4.12.1 Empresa e loja

"Aparecem no menu, nos arquivos exportados e na escala impressa." Campos "Nome da empresa ou rede", "Nome desta loja", "Loja em uso" (troca a loja em uso). Botão "Cadastrar e organizar lojas" (vai para Lojas) e "N lojas cadastradas · nova loja, várias de uma vez, duplicar e excluir ficam em Lojas."

#### 4.12.2 Setores

"Arraste para mudar a ordem, clique na bolinha para a cor e no nome para renomear. Setores que a loja não usa ficam escondidos, no fim." (Versão compacta, pedida pelo usuário: "ocupando um espaço muito grande com uma função que não faz sentido".)

- **Lista dos setores visíveis** (duas colunas em telas largas; uma no celular). Cada linha:
  - alça ⠿ (arrastar sobre outro setor coloca o setor no lugar dele; com foco, as setas ↑/← e ↓/→ movem);
  - número da posição (oculto no celular);
  - bolinha da cor (abre a paleta de 8 cores; fecha ao escolher);
  - nome (editável; nome vazio é ignorado);
  - "N pessoas" (no celular só o número);
  - "Esconder" (no celular, ícone de olho; desabilitado se for o último visível; dica "Esconder (as N pessoas continuam cadastradas)" ou "Esconder: a loja não usa este setor");
  - "×" excluir (confirmação "Excluir com N pessoas" ou "Excluir").
- **Novo setor:** campo "Novo setor (ex.: Peixaria)" + "+ Criar setor" (ou Enter). Se o nome for de um setor escondido, ele volta a aparecer em vez de criar outro ("O setor X já existia e voltou a aparecer."). Senão cria o setor (RN-SET-01): "Setor X criado, com dois turnos e um turno de domingo (ajuste em Horários). Cadastre a equipe em Equipe."
- **"Escondidos (N) · clique para mostrar:"** uma linha com os setores escondidos ("+ Nome" mostra; "×" exclui com confirmação).
- Os campos "Uma pessoa é / Várias são" deixaram de existir na tela; setores novos usam "colaborador/colaboradores".

#### 4.12.3 Funcionamento e jornada

"Vale para todos os setores desta loja."

| Campo | Regras |
|---|---|
| "Segunda a sábado abre" / "fecha" | Horas. Só mudam o eixo e as faixas abertas (RN-CAL-05). |
| "Domingo" | "Abre" / "Fechado". Com "Abre": "Domingo: das / até". |
| "Modelo de escala" | "5x2 (2 folgas por semana)", "6x1 (1 folga por semana)", "12x36 (12h trabalho, 36h descanso)". Entre 5x2 e 6x1 muda na hora (não refaz a escala). Entrar ou sair do 12x36 pede confirmação: "Passar todos os setores para 12x36? Todas as N pessoas passam a trabalhar dia sim, dia não (inclusive domingos e feriados), divididas em Plantão A e Plantão B em cada setor (metade de cada turno em cada plantão). Setores sem plantão ganham um plantão das 07h às 19h, que você ajusta em Horários (pode ser noturno). Para só alguns setores, use “Modelo por setor” logo abaixo. Quem tiver uma exceção pode voltar ao 5x2 na coluna “Regime” em Equipe. O que você fixou à mão na escala é mantido." / "Sair do 12x36 e voltar para 5x2? Todos os setores e todas as pessoas em 12x36 voltam ao 5x2, com o turno normal do setor e o rodízio de domingos. A escala dessas pessoas é refeita. Para voltar só um setor, use “Modelo por setor” logo abaixo." Botões "Aplicar 12x36 em todos os setores" / "Voltar para 5x2" e "Cancelar". |
| "Jornada por dia" | Duração (padrão 8h24). Vale para turnos sem horas próprias. |
| "Limite de horas por semana" | Duração (padrão 42h). |
| Resumo | "8h24 × 5 dias = 42h por semana.[ Em 12x36: setores.] O 12x36 também pode ser escolhido por setor (abaixo) ou por pessoa (Equipe → Regime); os plantões ficam em Horários." |
| "Semana começa" | "Na segunda-feira" / "No domingo". Mesmo efeito de RN-CAL-08 (sem mensagem nesta tela). |
| "Planejar a partir de" | Data; ajustada para o início da semana que a contém (RN-CAL-09). |
| "Quantas semanas" | 1 a 8. |

- **"Modelo por setor"**: "Cada setor pode seguir o modelo da loja (5x2) ou ter o seu: 5x2, 6x1, uma jornada cadastrada (logo abaixo, em Jornadas) ou 12x36. Mudar o modelo da loja não muda os setores que têm modelo próprio. Dentro do setor, cada pessoa ainda pode ter outro regime em Equipe, coluna “Regime” (ex.: estagiários em 6x1 e CLT em 5x2)." Um seletor por setor visível, com a mesma confirmação de 4.3.2.
- **"Regra de domingo da loja"** (só com o domingo aberto): seletor e prévia (4.12.4). "Cada setor pode ter uma regra própria (em Equipe). Confira a regra na convenção coletiva e na legislação aplicável à categoria."
- **Aplicar o horário da loja aos setores** (aparece quando algum setor tem faixas gerais de necessidade fora do horário da loja; pedido do relatório de ajustes, item 04): "N setores estão com horário diferente do da loja nas faixas de necessidade: …" + "Aplicar o horário da loja aos setores". Abre a tabela "Atualizar" (marcado, exceto setores com horário próprio), "Setor", "Hoje" ("Seg–sex 08:30–19:00 · Sáb …"), "Fica", "Horário próprio" ("exceção (manter)"). Texto: "Marque os setores que devem receber o horário da loja (seg–sáb HH:MM–HH:MM, domingo HH:MM–HH:MM). A primeira faixa passa a começar na abertura e a última termina no fechamento; faixas fora do horário são cortadas. Dias específicos e datas especiais não mudam." Botões "Aplicar a N setores" e "Cancelar". Mensagem: "Horário da loja aplicado a N setores: …. Gere a escala de novo para usar as novas faixas." (RN-HOR-09)

**RN-HOR-09 — Aplicar o horário da loja.** Para cada grupo geral (seg–sex, sábado, domingo) de cada setor marcado: as faixas totalmente fora do horário são removidas; as que passam do horário são cortadas; a primeira passa a começar na abertura e a última a terminar no fechamento; se nenhuma sobrar, cria uma faixa do horário inteiro com o mínimo da primeira. Exceções (dias específicos e datas) não mudam. O movimento é recalculado. Marcar "exceção (manter)" grava o setor como de horário próprio (fica desmarcado por padrão nas próximas vezes).

#### 4.12.4 Regra de domingo (editor com prévia)

Usado em Personalizar (loja) e em Equipe (setor). Pedido do relatório de ajustes, item 02 ("mostrar previamente os domingos de trabalho e de descanso… permitir conferência do RH antes da aplicação").

- Seletor "Regra de domingo da loja" / "Regra de domingo de {setor}": "1x1 · domingo sim, domingo não", "2x1 · trabalha 2 domingos, folga 1", "3x1 · trabalha 3 domingos, folga 1", "4x1 · trabalha 4 domingos, folga 1", "Cada pessoa com sua regra" e, no setor, "Igual à loja ({regra})".
- Escolher outro valor abre **"Prévia: como ficam os próximos domingos"**: "Nada muda até você aplicar. [Vale para os setores que seguem a regra da loja; setores com regra própria não mudam. ]Quem tem folga fixa no domingo ou não trabalha aos domingos continua de folga."
- Para cada setor afetado (expansível): "{setor} · {regra} · N pessoas" e "Trabalham por domingo: dd/mm: N · …"; tabela pessoa × 8 próximos domingos (a partir do início do período) com "Trab", "Folga" ou "Auto" (o sistema escolhe ao gerar) e "folga X" no cabeçalho (time que folga); rodapé "Trabalham". "“Auto”: pessoa com regra própria sem domingo de folga definido; o sistema escolhe ao gerar a escala."
- Sem setores afetados: "Nenhum setor segue a regra da loja (todos têm regra própria)."
- **"Aplicar regra e refazer a escala"** e "Cancelar". Efeito: RN-DOM-08. Mensagem: "Regra de domingo da loja / de {setor}: {regra}. A escala dos setores / do setor foi refeita; o que você fixou à mão foi mantido." **Comportamento observado:** aplicar a regra da loja refaz a escala de **todos** os setores, inclusive os que têm regra própria [PENDENTE] (ver 11.7).

#### 4.12.5 Jornadas

"Crie jornadas com o nome que quiser, os dias de trabalho por semana e as horas por dia (ex.: Meio período, 30 horas, 4 dias de 8h). Depois escolha quem segue cada uma em Equipe (coluna “Regime”) ou um setor inteiro em “Modelo por setor”." (Pedido: "criar uma jornada, totalmente editável… nome… quantidade de dias e horas".)

- Sem jornadas: "Nenhuma jornada cadastrada. Todos seguem o modelo da loja (5x2, 8h24 por dia) ou o 12x36."
- Tabela: "Nome da jornada", "Dias de trabalho por semana" (1 a 6, com "(N folgas)"), "Horas por dia" (de 0h01 a 16h; fora disso: "Informe as horas por dia entre 0h01 e 16h."), "Intervalo" ("Automático (…)", "Sem intervalo", 15 min…2h), "Total" (dias × horas), "Quem segue" (quantas pessoas) e "Excluir" (confirmação "Excluir jornada" ou "Excluir (N voltam para a jornada da loja)").
- "+ Nova jornada": cria "Nova jornada" (ou "Nova jornada 2"…), 5 dias, 6h. Ao lado, "ou comece de um exemplo:" com botões que criam a jornada já preenchida: "Meio período" (5 × 4h), "30 horas" (5 × 6h), "4 dias de 8h", "6x1 de 7h20" e "2 dias de 8h" [FICTÍCIO: exemplos]. Texto de apoio: "A pessoa entra no horário do turno dela e sai depois das horas da jornada (mais o intervalo). As folgas da semana são os dias que sobram (ex.: 4 dias de trabalho = 3 folgas). Domingos e feriados seguem a regra de domingo do setor; no domingo, se o turno for mais curto, vale o turno de domingo. …" Mensagem: "Jornada “X” criada: 5 dias × 6h = 30h por semana. Escolha quem segue essa jornada em Equipe, na coluna “Regime”."
- Mudar os dias: "“X” agora tem N dias por semana: a escala de M pessoas foi refeita." Excluir: "Jornada “X” excluída.[ N pessoas voltaram para a jornada da loja.]" (RN-REG-10)

#### 4.12.6 Feriados e dias sem folga

"Com a loja fechada, ninguém trabalha. Com a loja aberta, vale o horário e o turno de domingo. Mudar um feriado refaz a escala daquela semana (o que você fixou à mão fica)."

- Caixa **"Feriado com a loja fechada conta como uma das folgas da semana"** (marcada): "Ex.: na semana do Natal (25/12 com a loja fechada), quem é 5x2 ganha só mais 1 folga, não 2. Confira na convenção coletiva." Mudar refaz as semanas com feriado fechado. Mensagens: "Feriado com a loja fechada agora conta como uma das folgas da semana. As semanas com feriado foram refeitas." / "… não conta mais como folga. …"
- Lista: "dd/mm/aaaa · nome · [ ] Loja abre · Remover" (confirmação "Remover feriado"). Sem feriados: "Nenhum feriado no período."
- "Data", "Nome" ("Ex.: Finados") e "Adicionar feriado" (ignora data vazia ou repetida). Mensagem: "Feriado dd/mm/aaaa adicionado com a loja fechada. A escala daquela semana foi refeita (o feriado conta como uma das folgas)."
- **"Dias sem folga"**: "Nesses dias ninguém folga: todos trabalham (ex.: 24/12 e 31/12). Quem está de férias, falta ou atestado continua fora; quem não trabalha aos domingos continua de folga se o dia cair num domingo; o 12x36 segue o dia sim, dia não. As folgas da semana vão para os outros dias (nessa semana, o limite de pessoas de folga por dia sobe na mesma proporção para caber todo mundo)." Lista de chips ("24/12 (todo ano)" ou "24/12/2026", com ×) ou "Nenhum dia sem folga."; "Data", "Todo ano" (marcado) e "Adicionar dia sem folga" ("{dia}: ninguém folga. A escala da semana foi refeita."); atalho "+ 24/12 e 31/12 (todo ano)" (some quando os dois já existem; "24/12 e 31/12 (todo ano): ninguém folga. As semanas foram refeitas."). RN-FER-04/05/06.

#### 4.12.7 Aparência

- "Muda as cores do menu e dos botões e a fonte das letras." Temas: "Roxo e lilás" (padrão), "Azul", "Verde", "Vinho", "Grafite" (vale para a loja).
- "Fonte das letras": IBM Plex Sans ("sóbria e profissional", padrão), Barlow ("de varejo, como placa de loja"), Source Sans 3 ("clássica e muito legível"), Nunito Sans ("arredondada e leve"), Tahoma ("a fonte anterior"), cada uma com amostra. "A fonte vale para todas as lojas e não muda os PDFs."

#### 4.12.8 Cores da escala

"Só muda a aparência: nenhuma escala, folga ou regra é alterada. Vale para a Semana, o Mês, Domingos, Almoço, o PDF e o Excel desta loja. A cor de cada turno fica em Horários." Versão compacta (pedido "deixe isso menor"): uma linha por código, em até 4 colunas, com a amostra da cor atual (clicar abre a paleta; "Usar a cor padrão" volta ao original) e o nome curto (Trabalho, Domingo/feriado, Folga, Férias, Falta, Atestado, Feriado fechado, Intervalo; o nome completo na dica). Avisos em vermelho só quando há problema: "Texto difícil de ler (N:1)" (contraste abaixo de 4,5:1) ou "Igual a {outro código}". "Restaurar cores originais" (confirmação "Confirmar: voltar às cores originais") só aparece quando alguma cor foi trocada. A cor do texto é escolhida automaticamente pelo contraste.

#### 4.12.9 Regras avançadas (aba própria no menu)

Desde a versão 94 (pedido "tire as regras avançadas da pasta personalizar, e crie uma aba somente pra ela no canto esquerdo") as regras ficam na tela **Regras avançadas**, item do menu lateral entre Fluxo alto e Lojas. Com mais de uma loja, a tela tem o seletor "Loja". Personalizar não mostra mais nada sobre as regras (o aviso de mudança foi removido a pedido na versão 95). O conteúdo da tela é o descrito abaixo.

Texto de abertura: "Valores de referência usados para avisar e para montar a escala, para a loja toda ou só para um setor. Confirme na legislação e na convenção coletiva da sua categoria antes de mudar."

**"Para qual setor"** (primeiro campo da seção; RN-RAV-03):
- "Toda a loja (setores que seguem a loja)" (padrão) e um item por setor visível: "{setor} · segue a loja" ou "{setor} · regras próprias".
- **Loja:** os campos editam as regras da loja. Texto: "Estas regras valem para {setores que seguem a loja | todos os setores}. Em cada regra ligada, escolha em “Onde vale” os setores em que ela vale." e, se houver, "Com regras próprias (valores diferentes): {setores} (escolha o setor acima para ver)."
- **"Onde vale" em cada regra** (só na loja e só com a regra ligada; regras 1, 1b, 2, 4, 5, 6, 9, 10, 11, 12 e 13): botão ao lado da regra "Setores: Todos os setores ▾" (ou os setores escolhidos: "A e B" ou "N setores"; dica com a lista). Ele abre a lista "Onde vale" com caixas de marcar: "Todos os setores" (padrão) e um por setor visível (com a cor). Marcar um setor desmarca "Todos os setores"; desmarcar todos volta a "Todos os setores"; marcar "Todos os setores" limpa a escolha. Fecha com "Pronto", clique fora ou Esc. A regra só vale nos setores escolhidos; nos outros fica desligada. A regra 2 usa o mesmo controle no lugar do antigo "Onde vale" de lista. As regras 3 (já é por setor), 7 e 8 (valem para as pessoas da dupla) não têm esse controle. Se todos os setores têm regras próprias: "Todos os setores têm regras próprias: estas regras da loja não estão valendo para nenhum setor."
- **Setor que segue a loja:** "{setor} segue as regras da loja (mostradas abaixo). Para mudar só neste setor, use regras próprias." Os campos aparecem bloqueados, com as regras da loja como valem nesse setor (as que não valem nele aparecem desligadas). Botão **"Usar regras próprias em {setor}"**: o setor passa a ter as suas regras, começando iguais às da loja. Mensagem: "{setor} agora tem regras avançadas próprias, começando iguais às da loja. Mude o que precisar; os outros setores não mudam."
- **Setor com regras próprias:** "Regras próprias de {setor}: valem só para este setor. Os outros setores não mudam." Os campos editam só o setor. Na regra 2 não aparece "Onde vale" e na regra 3 não aparece a escolha de setor (valem para o setor escolhido); os textos das regras 9 e 12 contam só o setor; o link vira "Gerar a escala de {setor} agora". Botão **"Voltar a seguir a loja"** (confirmação "Confirmar: {setor} segue a loja"): apaga as regras próprias. Mensagem: "{setor} voltou a seguir as regras avançadas da loja."

| Campo | Padrão | Uso |
|---|---|---|
| "Máximo de dias seguidos de trabalho" (1–13) | 6 | restrição da geração (RN-FOL-03) |
| "Folga de domingo, regra geral: 1 a cada" (1–8) | 3 | alerta (RN-DOM-11) |
| "Folga de domingo, mulheres: 1 a cada" (1–8) | 2 | alerta |
| "Descanso mínimo entre jornadas" | 11h | alerta |
| "Intervalo mínimo (jornada acima de 6h)" | 1h | alertas e almoço |
| "Intervalo máximo" | 2h | alertas e almoço |
| "Jornada diária máxima (com extras)" | 10h | alerta |

Abaixo, as **regras extras** (RN-RAV), com o texto: "Evitar: o sistema só faz se não tiver outro jeito de cobrir o setor. Proibir: nunca faz; se for impossível cumprir, ele avisa o que impede ao gerar. As regras valem a partir do próximo Gerar escala." e o link "Gerar a escala de {setor} agora". Blocos:
- **Folgas:** 1 "Preferência das folgas da semana" (lista `#ra-pref-folgas`: "Separadas, quando der (padrão)", "Separadas, sempre", "Juntas (folga dupla), quando der", "Sem preferência", com uma frase abaixo explicando a escolha; "Onde vale" aparece quando a escolha não é a padrão); 2 "Dias da semana sem folga" (dias, "Força", "Onde vale": "Todos os setores" ou "Só {setor}"); 3 "Máximo de pessoas de folga no mesmo dia" ("Setor"; "Automático (o sistema ajusta ao tamanho da equipe)", "Em número de pessoas" ou "Em % da equipe"; um valor por dia; "Em branco = sem limite naquele dia. O sistema respeita esses números e não muda sozinho." / "Hoje o sistema decide e aumenta o limite quando a equipe cresce."); 4 "Revezar o dia da folga"; 5 "Um fim de semana completo por mês"; 5b "Quem folga no domingo também folga no sábado" (chave `#ra-sabdom`; ligada mostra "Até [30] % por fim de semana" `#ra-sabdom-pct` e, abaixo, "{setor}: N pessoas × X% = N,n → até M por fim de semana (arredonda para baixo). Em S semanas, T fins de semana inteiros: K para cada pessoa, em rodízio."; "Onde vale" quando ligada); 5c "Quem folga no domingo também folga na segunda" (chave `#ra-domseg`; ligada mostra "Até [30] % por domingo" `#ra-domseg-pct` e "{setor}: N pessoas × X% = N,n → até M por domingo (arredonda para baixo). Em S semanas, T pares domingo + segunda: K para cada pessoa, em rodízio." `#ra-domseg-n`; "Onde vale" quando ligada); 6 "Não emendar feriado" ("Máximo de pessoas", "Força").
- **Pessoas:** 7 "Pessoas que não folgam no mesmo dia" (força + duplas); 8 "Pessoas que preferem folgar juntas" (duplas); 8b "Quem cobre a folga de quem" (`#ra-cobre`: lista "Quando {A} folga, {B} vai para o turno dela ({turno})" com ×; "Quando [pessoa] estiver de folga, [pessoa do mesmo setor] vai para o turno dela." + "Adicionar"; caixa `#ra-cobre-ausencias` "Também quando estiver de férias, com falta ou atestado"); 9 "Sempre uma pessoa-chave trabalhando" ("Mínimo de pessoas-chave", força; mostra quantas estão marcadas); 10 "Dividir os domingos por igual".
- **Turnos e horas:** 11 "Quem fecha não abre no dia seguinte"; 12 "Rodízio semanal de turnos" (mostra quantos turnos estão marcados); 13 "Limite de horas extras por semana" ("Avisar acima de" + duração; ao ligar, 2h); 14 "Descanso mínimo entre jornadas ao gerar" (campo `#ra-descanso`, em branco por padrão, com exemplo "ex.: 11h"; ao lado, "Não usado" ou "Respeitado ao gerar"; "Onde vale" aparece quando preenchido; apagar o campo desliga).
- **Duplas** (regras 7 e 8): chips "Nome + Nome" (com o setor de cada um entre parênteses quando são de setores diferentes) com ×; "— escolher —" + "— escolher —" + "Adicionar dupla". A segunda lista traz todos os setores, começando pelo setor da primeira pessoa. Duplas repetidas (em qualquer ordem) são ignoradas.

#### 4.12.10 Dados

"Guarde uma cópia de tudo (todas as lojas) e restaure quando precisar, inclusive em outro computador."

| Botão | Comportamento |
|---|---|
| "Baixar cópia de segurança" | `escala5x2-backup-AAAA-MM-DD.json` com todas as lojas (`{app: "escala5x2", version: 1, stores: [...]}`). "Cópia de segurança gerada." |
| "Restaurar uma cópia…" | Aceita um pacote completo, uma lista de lojas ou uma loja isolada. Cada loja precisa ter identificador, setores e colaboradores; senão "Não foi possível restaurar: formato não reconhecido.". **Substitui todas as lojas** (as que não estão no arquivo são apagadas). "Dados restaurados: N loja(s)." Pode ser desfeito (RN-DES). |
| "Excel da loja inteira" | `escala-{loja}.xlsx` com todos os setores com pessoas. "Planilha gerada." (qualquer outro resultado mostra "Download cancelado."). |
| "Começar do zero…" | "Quais setores sua loja tem?" (catálogo; vem marcado só "Frente de Caixa"); "Os outros ficam escondidos e podem ser mostrados depois. Setores próprios você cria em Setores." Botão "Criar loja vazia com N setor(es)" → confirmação "Apagar os dados desta loja e começar". A loja em uso vira uma loja vazia (mesmo identificador, nome e rede; RN-LOJ-02) e o sistema abre a Equipe. |
| "Restaurar exemplo de demonstração" | Confirmação "Substituir esta loja pelo exemplo". A loja em uso vira a demonstração (Apêndice A), mantendo o identificador e a data de início. |

---

## 5. Fluxos de navegação e uso

O protótipo **não tem perfis de usuário** (6.6): qualquer pessoa com acesso vê e altera tudo. Os fluxos estão organizados por cenário. A tabela abaixo associa os papéis citados no histórico aos fluxos que eles costumam usar; é só uma orientação de uso, não uma regra do sistema.

| Papel (uso pretendido) | Fluxos mais comuns |
|---|---|
| Quem monta a escala (gerente, encarregado do setor) | FL-03 a FL-08, FL-13 a FL-17, FL-24 |
| RH | FL-09 a FL-12, FL-14, FL-18, FL-21, FL-22, FL-24, FL-25 |
| Dono / responsável por várias lojas | FL-02, FL-08, FL-19, FL-23, FL-25 |

### FL-01 — Primeiro acesso

1. Abre a página ou o programa: "Carregando escalas…".
2. Sem dados, o sistema cria a **loja de demonstração** (Apêndice A) com a regra de domingo 1x1 e os times, gera a escala de todos os setores e grava (RN-DAD-06).
3. Abre a **Escala** no primeiro setor visível com pessoas.

### FL-02 — Montar uma loja do zero

**Caminho A — substituir a loja em uso:** Personalizar → Dados → "Começar do zero…" → marcar os setores ("Frente de Caixa" vem marcado) → "Criar loja vazia com N setor(es)" → confirmar "Apagar os dados desta loja e começar". A loja vira uma loja vazia (RN-LOJ-02) e abre a Equipe.

**Caminho B — loja nova, mantendo as atuais:** Lojas → "Nova loja" → nome (um por linha para várias) → "Começar a partir de": "Em branco" (escolher setores), "Copiar a estrutura de outra loja" ou "Copiar tudo de outra loja" → "Criar loja". Com uma loja criada, ela passa a ser a loja em uso.

**Depois, para cada setor (abas):**
1. **Personalizar → Funcionamento e jornada:** horários da loja, domingo, modelo, jornada por dia, limite semanal, semana começa, início e semanas; regra de domingo.
2. **Horários:** ajustar os turnos padrão (Abertura 08:15, Tarde 09:30, Domingo 08:15 de 4h), criar outros, definir janela ou limite do intervalo.
3. **Fluxo alto:** faixas por grupo e exceções.
4. **Equipe:** "+ Pessoa", "Adicionar várias" ou "Importar planilha"; turno, domingos, folga fixa, regime, contratação.
5. **Escala → "Gerar escala".** "Primeiros passos" mostra o que falta.

**Alternativas:** criar setor próprio (Personalizar → Setores → "Novo setor"); esconder setores não usados; copiar a estrutura de um setor pronto (FL-08).

### FL-03 — Gerar e revisar a escala de um setor

1. Escala → aba do setor → **"Gerar escala"**. O botão mostra "Gerando…" e os botões de escala ficam desabilitados.
2. O sistema executa a sequência de RN-GER-02 (folgas, ajustes de turno, almoços).
3. Resultado no topo (4.2.2):
   - **"Escala gerada"** — cobertura antes e depois;
   - **"Escala mantida"** — nenhuma troca melhora a atual (os almoços ainda são distribuídos);
   - **"Não foi possível gerar"** — a escala atual fica e são listadas até 6 causas.
4. Revisão: indicadores → "Onde vai faltar gente" (com dias e datas) → Semana → Cobertura (clicar numa faixa mostra quem está no posto e quem está em intervalo) → Mês (linhas por turno em vermelho quando um turno tem folgas demais no dia).
5. Se faltar gente, seguir a sugestão (Escala de Almoço, Horários, Fluxo alto ou Equipe) e gerar de novo.

**Exceções:** setor sem pessoas (botão desabilitado; aviso "Ainda não há ninguém em {setor}…"); regras "proibir" impossíveis de cumprir → falha com o motivo (8.3).

### FL-04 — Ajuste manual de dias

1. Escala → Semana (ou Mês) → **"Ao clicar num dia"**: "Trabalho ↔ folga", "Férias", "Falta" ou "Atestado".
2. Clicar no dia. O dia muda e fica **fixado** (ponto no canto) (RN-MAN-01/03).
3. Aparece "Você mudou N dia(s) à mão…".
4. **"Reorganizar o resto"** gera o setor mantendo os dias fixados (ex.: devolve uma folga em outro dia); **"Agora não"** mantém. Se a semana ficar com folgas a mais ou a menos, ou dias seguidos demais, aparecem alertas.

**Variações:** dia fechado → na Semana só folga, férias, falta ou atestado (trabalho é ignorado); no Mês o dia fechado não é clicável. Pessoa de outro setor (vários setores na Semana) → a página passa para o setor dela. Dia em branco (mês limpo) → o clique lança o dia (RN-MAN-04). Engano → "↶ Desfazer" ou Ctrl+Z.

### FL-05 — Navegar entre semanas e mudar o início da semana

1. Semana → "‹" / "›" troca de semana. Antes da primeira ou depois da última, o período passa a começar na semana pedida (RN-CAL-07).
2. "Ir para" (data) mostra a semana da data; fora do período, o período é deslocado.
3. "Semana começa" (Semana ou Personalizar): segunda ↔ domingo. As folgas não fixadas de todos os setores são refeitas (RN-CAL-08).

### FL-06 — Ver e gerar o mês

1. Escala → Mês: mês inicial = o da semana mostrada; "‹ ›" troca de mês livremente.
2. Mês parcialmente fora do período → aviso e **"Gerar escala do mês inteiro"** (amplia o período e completa os dias) ou **"Gerar escala inteligente"** (amplia e gera o setor, em cada loja mostrada).
3. Filtrar (setor, turno, função, busca), ordenar ("Turno (horário de entrada)", "Folgas no mês", "Domingos trabalhados"…), clicar num dia com a ferramenta escolhida.
4. Conferir as linhas por turno (vermelho = turno com folgas demais no dia).
5. "Baixar mês (PDF)" usa os filtros e a ordem da tela.

### FL-07 — Limpar a escala e montar de novo

1. Escala → **"LIMPAR ESCALA"** (cabeçalho: setor da página, todos os meses do período) ou no Mês (mês aberto, setor do Mês).
2. Escolher meses, "Só {setor}" ou "Todos os setores desta loja", "Apagar também os dias que eu fixei à mão" e, se quiser, "Apagar também os horários de almoço".
3. "Limpar {meses}": os dias ficam **em branco** (quadradinhos vazios); indicadores e cobertura somem; aviso "Escala em branco…" (RN-LIM).
4. **"Gerar escala"** monta de novo (os meses deixam de estar em branco), ou **"Desfazer"** volta ao que era.

### FL-08 — Copiar a escala de um setor para outros

1. Escala ou Horários → **"Copiar escala…"**.
2. "Copiar de" (setor de qualquer loja) → "Para" (um ou mais setores) → partes (turnos, necessidade, regras de folga, folgas do período, criar vagas).
3. "Ver prévia": por destino, o que muda, avisos e "quem recebe o padrão de quem".
4. Marcar o aceite quando algo será substituído → "Copiar para N setores".
5. Gerar a escala de cada destino (RN-COP-07).

### FL-09 — Cadastrar a equipe

- **Uma pessoa:** Equipe → "+ Pessoa" → preencher nome, regime, contratação, turno, domingos, folga fixa; "mais detalhes" para função, matrícula, sexo, contrato, pessoa-chave, preferência, setor.
- **Várias:** "Adicionar várias" → um nome por linha → "Adicionar N pessoa(s)" (turnos em rodízio).
- **Por planilha:** "Importar planilha" → "Baixar modelo (Excel)" → preencher → "Escolher planilha" → conferir a prévia (NOVA, ATUALIZA, JÁ EXISTE, ERRO) → "Importar N pessoas". Linhas com erro ficam de fora (RN-IMP).
- Em todos os casos a escala das pessoas novas é completada sozinha; quem trabalha aos domingos entra num time (RN-DOM-06).

### FL-10 — Alterar várias pessoas de uma vez

1. Equipe → filtrar (ex.: "Contratação: Estagiários").
2. "Alterar as pessoas mostradas": regime, folga fixa (e 2ª), domingos.
3. "Aplicar" → "Confirmar (N pessoas)". A escala do setor é refeita (dias fixados ficam).

### FL-11 — Regimes diferentes no mesmo setor

- **Estagiários em 6x1 e CLT em 5x2** (pedido "Atualização 2.0", itens 1 e 2): Equipe → coluna "Regime" = "6x1" para cada estagiário (ou FL-10). A escala da pessoa é refeita.
- **Setor inteiro em outro modelo:** Equipe → "Modelo de escala de {setor}" ou Personalizar → "Modelo por setor" → confirmar. Mudar o modelo da loja (5x2 ↔ 6x1) não altera setores com modelo próprio.
- **12x36:** por pessoa (coluna "Regime": Plantão A/B), por setor ou na loja inteira (confirmação). Ajustar os plantões em Horários.
- **Jornada cadastrada:** Personalizar → Jornadas → "+ Nova jornada" (nome, dias, horas, intervalo) → escolher na coluna "Regime" ou no modelo do setor.

### FL-12 — Estagiário com jornada reduzida

- **Opção 1 (contratação):** Equipe → "Contratação" = "Estagiário": 6h por dia e 30h por semana; ajustar "Horas por dia" (ex.: 5h). A entrada é a do turno e a saída é recalculada (RN-REG-09).
- **Opção 2 (turno próprio):** Horários → "+ Turno" → "Horas trabalhadas" = 5h (ex.: "Estágio 5h"); na Equipe, escolher esse turno (pedido "Atualização 2.0", item 3).
- Conferir o resumo da jornada em "mais detalhes" (fica vermelho acima do contrato).

### FL-13 — Folgas fixas

1. Equipe → "Folga fixa": um dia (ex.: "Qua") ou "Dom (não trabalha domingo)".
2. Para duas folgas fixas (ex.: sábado e domingo): escolher o 2º dia em "+ 2ª folga fixa" (só para quem tem 2+ folgas na semana).
3. A escala da pessoa é refeita na hora; a folga fixa fica travada em todas as semanas (RN-FOL-06).
4. Trocar uma folga só numa semana não muda o cadastro (RN-MAN-07).

### FL-14 — Regra de domingo e times

1. Personalizar → "Regra de domingo da loja" (ou Equipe → "Regra de domingo de {setor}"): 1x1, 2x1, 3x1, 4x1 ou "Cada pessoa com sua regra".
2. A **prévia** mostra, por setor, quem trabalha e quem folga nos próximos 8 domingos ("Nada muda até você aplicar").
3. "Aplicar regra e refazer a escala": grava, põe nos times quem precisa e refaz a escala dos setores afetados (RN-DOM-08).
4. Equipe → cartão "Domingos": ver o tamanho dos times e quem trabalha no próximo domingo; "Reequilibrar os times" redivide o setor (confirmação).
5. Mudar o time de uma pessoa na coluna "Domingos" só muda o cadastro; vale na próxima geração (RN-EQP-04).

### FL-15 — Escala de cada domingo

1. Domingos → setor → para cada pessoa e domingo: "Folga", "Habitual" ou um turno (de domingo ou da semana).
2. Cada escolha fica fixada. Aparece "Você mudou N domingo(s) à mão…" → "Reorganizar as folgas da semana" (gera o setor mantendo os domingos).
3. "Turno de domingo habitual" muda o turno padrão de domingo da pessoa e traz os domingos já escalados para ele (RN-DOM-10).
4. "Copiar um domingo…" replica um domingo em outros; "Modelos de domingo…" guarda e aplica configurações.
5. Conferir "Atenção às regras (N)".

### FL-16 — Almoços

1. **Automático:** cada pessoa recebe um horário fixo sugerido, espalhado para que pouca gente almoce junto (RN-ALM-02). Não há nada a ligar.
2. **Conferir a semana:** abra a Escala de Almoço em "Semana". A coluna "Almoço" mostra o horário de cada pessoa, e os dias mostram o almoço de cada dia. O rodapé traz "Almoçando ao mesmo tempo (máximo)" e "Abaixo do mínimo no posto".
3. **Mudar o horário de uma pessoa:** na coluna "Almoço", digite o novo horário. Ele vale em todos os dias normais e o sistema não muda mais.
4. **Mudar só um dia:** clique no almoço do dia, digite o horário e use "Só neste dia". O dia fica com o selo "SÓ HOJE". Para voltar ao horário de sempre, use ↺.
5. **Rodízio:** escolha "↻ Rodízio" na pessoa. O horário dela passa a variar a cada dia.
6. **Conferir um dia:** em "Dia", a grade do dia inteiro mostra "No posto", "Almoçando", "Mínimo" e "Sobra / falta".
7. **Recomeçar:** "Sugerir horários de novo" → "Recalcular todos" refaz os horários fixos e mantém os "só neste dia".

### FL-17 — Horário do intervalo do turno

1. Horários → turno → "Usar janela permitida para o intervalo" → "entre 12:00 e 15:00".
2. Os horários sugeridos ficam dentro desse horário, espaçados (RN-ALM-02). Para refazer os de quem já tinha horário, use Escala de Almoço → "Sugerir horários de novo".

### FL-18 — Feriados e dias sem folga

1. Personalizar → Feriados → data, nome → "Adicionar feriado" (entra com a loja fechada; a semana é refeita).
2. Se a loja abre: marcar "Loja abre" (vale o horário, o turno e a necessidade de domingo).
3. "Feriado com a loja fechada conta como uma das folgas da semana" (padrão ligado).
4. "Dias sem folga": "+ 24/12 e 31/12 (todo ano)" ou uma data. Nesses dias todos trabalham; as semanas são refeitas.

### FL-19 — Mudar o horário da loja

1. Personalizar → "Segunda a sábado abre/fecha" e domingo. O mapa de cobertura acompanha; turnos e faixas não mudam (RN-CAL-05).
2. Se algum setor tem faixas fora do horário: "Aplicar o horário da loja aos setores" → marcar os setores (ou "exceção (manter)") → "Aplicar a N setores" (RN-HOR-09).
3. Horários: ajustar os turnos que precisam cobrir o novo horário.
4. Escala → "Gerar escala" em cada setor.

### FL-20 — Regras avançadas

1. Personalizar → "Regras avançadas" → ajustar os valores de referência e as regras extras (evitar/proibir, duplas, pessoas-chave, rodízio de turnos…).
2. Para duplas de setores diferentes: escolher a 1ª pessoa e, na 2ª lista, uma pessoa de qualquer setor.
3. "Gerar a escala de {setor} agora" ou gerar cada setor. Regras "proibir" impossíveis aparecem como causa de falha.

### FL-21 — Faltas e atestados

1. Escala → Semana ou Mês → "Ao clicar num dia" = "Falta" (ou "Atestado") → clicar nos dias.
2. Dashboards → "Faltas" (ou "Atestados"): período, filtros, indicadores, gráficos e ranking; clicar numa pessoa mostra as datas.
3. "Baixar ranking (Excel)".

### FL-22 — Férias

1. Férias → "Férias programadas": escolher no calendário de quando até quando (só o "de" já completa 30 dias), ou "Escolher automaticamente" → confirmar (RN-FEV-11). O período aparece tracejado no mapa.
2. Para lançar na escala: "Programar" na linha da pessoa (ou clicar no tracejado) → início e dias já vêm do período programado → ajustar → conferir a prévia (sobreposição, faltas/atestados trocados, limite simultâneo, efeito na cobertura) → aceite quando houver troca → "Lançar férias".
3. Os dias viram V fixados. Gerar a escala de novo para reorganizar as folgas dos colegas.
4. Alterar ou remover: clicar na barra do mapa ou "Programar" na tabela.
5. Acompanhar "Atenção" (dias acima do limite, com e sem as programadas) e os indicadores (sem férias programadas).

### FL-23 — Várias lojas

1. Lojas → criar (FL-02, caminho B), duplicar ("Só a estrutura" ou "Com equipe e escala"), renomear, excluir.
2. Filtro de lojas (menu): marcar as lojas que aparecem nas telas; "Editar esta" escolhe a loja em uso.
3. Escala/Equipe/Domingos/Almoço: as lojas aparecem lado a lado (RN-FIL-05). Horários, Fluxo alto e Personalizar editam só a loja em uso.
4. Dashboards → "Lojas": cobertura de cada loja e setor; clicar no setor abre a Escala dele.

### FL-24 — Exportar e imprimir

| Objetivo | Caminho |
|---|---|
| Mural da semana | Escala → Semana → "Baixar semana (PDF)" |
| Escala de cada pessoa | Semana ou Equipe → "Escala por pessoa (PDF)" |
| Mês do setor | Escala → Mês → "Baixar mês (PDF)" |
| Planilha da escala | Semana → "Excel"; Personalizar → Dados → "Excel da loja inteira" |
| Rankings e férias | Dashboards → "Baixar ranking (Excel)"; Férias → "Baixar (Excel)" |

Página publicada: download pela permissão de downloads da página. Programa: janela "Salvar como". Navegador comum: pasta de downloads.

### FL-25 — Cópia de segurança e troca de computador

1. Personalizar → Dados → "Baixar cópia de segurança" (todas as lojas).
2. No destino: "Restaurar uma cópia…" → **substitui todas as lojas** (RN-DAD; pode ser desfeito na mesma sessão).
3. No programa: menu Arquivo → "Salvar cópia dos dados…" / "Restaurar dados de uma cópia…" / "Abrir pasta dos dados".

### FL-26 — Restaurar a demonstração

Personalizar → Dados → "Restaurar exemplo de demonstração" → "Substituir esta loja pelo exemplo". Só a loja em uso é substituída.

### FL-27 — Aparência e cores

Personalizar → Aparência (tema e fonte) e Cores da escala (cor de cada código; contraste mínimo avisado). Cobertura → legenda → clicar na cor para trocar as cores do mapa. Horários → "Cor do turno".

---

## 6. Validações, estados, transições e permissões

### 6.1 Validações de entrada

| Campo / ação | Validação | Quando o valor é inválido |
|---|---|---|
| Campos de hora (todas as telas) | HH:MM de 00:00 a 23:59 | Campo vazio é ignorado (fica o valor anterior) |
| Campos de duração (jornada, limite, horas do turno, horas extras) | `XhYY`, `H:MM` ou horas decimais, ≥ 0 | Volta ao valor anterior |
| "Horas trabalhadas" do turno | > 0 | 0 é ignorado; igual à jornada da loja volta a "jornada da loja" |
| Mínimo de pessoas (Fluxo alto) | inteiro de 0 a 500 | Ajustado ao limite; texto inválido volta ao anterior |
| "Máximo de dias seguidos de trabalho" | 1 a 13 | Ajustado ao limite; vazio ou 0 não muda |
| Folga de domingo (regra geral e mulheres) | 1 a 8 | Idem |
| "Quantas semanas" | 1 a 8 | Ajustado ao limite |
| "Planejar a partir de" | data | Ajustada ao início da semana que a contém |
| Limites de cor do mapa | "pouca" de 0 até "muita"; "muita" de "pouca" até 100; passo 5 | Ajustado a cada digitação |
| Jornada: dias por semana | 1 a 6 (lista) | — |
| Jornada: horas por dia | de 0h01 a 16h | "Informe as horas por dia entre 0h01 e 16h." (não grava) |
| Máximo de folgas por dia (regra 3) | 0 a 999 pessoas ou 0 a 100% | Ajustado; em branco = sem limite |
| Emenda de feriado: máximo de pessoas | 0 a 99 | Ajustado |
| Mínimo de pessoas-chave | 1 a 9 | Ajustado |
| Regras de férias | dias por período, menor parte e "uma parte com ao menos" 1–60; máximo de partes 1–12; aviso 0–365; máximo simultâneo 0–99 (vazio/0 = sem limite) | Ajustado ao limite |
| Programar férias | dias corridos 1–365 (vazio = "Dias por período" da loja); aceite obrigatório quando há faltas, atestados ou dias fixados no período; sem pessoas cadastradas, "Programar férias" fica desabilitado | Dias ajustados ao limite; "Lançar férias" desabilitado sem o aceite |
| Férias programadas (de … até) | "até" igual ou depois do "de" | "A data final precisa ser igual ou depois da inicial." |
| Intervalo: fim ("até") na Escala de Almoço | fim depois do início, duração ≥ 15 min | Recusa: "O fim do intervalo precisa ser depois do início (HH:MM), com pelo menos 15 min." |
| Intervalo: duração fora de 1h–2h (jornada > 6h) | regra da loja | Grava e avisa ("Atenção: …") |
| Nome do setor | não vazio | Ignorado |
| Novo setor | nome obrigatório | "+ Criar setor" desabilitado |
| Esconder setor | pelo menos um visível | Botão do último visível desabilitado |
| Feriado | data obrigatória e não repetida | Ignorado sem mensagem |
| Dia sem folga | data obrigatória; não repetir | Ignorado |
| Nova loja | ao menos um nome; "Em branco" exige ao menos um setor | "Digite o nome da loja (uma por linha para cadastrar várias)." / "Escolha ao menos um setor." |
| Nome de loja repetido | permitido | Aviso, sem bloqueio |
| Excluir loja | só com mais de uma loja | Botão não aparece |
| Filtro de lojas | ao menos uma loja; a loja em uso sempre incluída | A última não pode ser desmarcada |
| Seleção de setores na Semana | ao menos um | Desmarcar o último não tem efeito |
| "Gerar escala" | setor com pessoas e nenhuma geração em andamento | Botão desabilitado |
| Limpar escala | ao menos um mês | "Escolha pelo menos um mês" (desabilitado) |
| Copiar escala | ao menos um destino e uma parte; aceite quando substitui | "Escolha pelo menos um setor de destino." / botão desabilitado |
| Restaurar cópia | arquivo JSON; lojas com identificador, setores e colaboradores | "Não foi possível restaurar: {motivo}." |
| Importação por planilha | ver RN-IMP-03 (por linha) | Linha marcada ERRO; não entra |
| Cor de código (Cores da escala) | contraste ≥ 4,5:1 recomendado; cores diferentes entre códigos | Só aviso ("difícil de ler", "Mesma cor de …") |

**Validações que não existem no protótipo** [PENDENTE] (PD-08):
- faixas de necessidade com fim antes do início ou sobrepostas;
- turnos sobrepostos ou com horário incoerente (o intervalo fora do turno e a janela invertida geram só alerta);
- matrícula duplicada na Equipe (só a importação confere);
- quantidade de pessoas versus necessidade (só aparece como falta na cobertura).

### 6.2 Estados de um dia da pessoa

| Estado | Como se chega | Como sai |
|---|---|---|
| T / D (trabalho) | Padrão de dia aberto; o motor; ferramenta sobre F, A, M ou V | "Trabalho ↔ folga" → F; "Férias" → V; "Falta" → A; "Atestado" → M; o motor (se não fixado) |
| F (folga) | O motor; folga fixa; time de domingo; domingo fechado; ferramenta | "Trabalho ↔ folga" → T/D (não em dia fechado); outras ferramentas → V, A, M |
| V (férias) | Ferramenta "Férias"; tela Férias | Mesma ferramenta ou "Trabalho ↔ folga" → T/D; remover as férias (tela Férias) apaga o V |
| A (falta) | Ferramenta "Falta" | Mesma ferramenta ou "Trabalho ↔ folga" → T/D; outras ferramentas |
| M (atestado) | Ferramenta "Atestado" | Idem |
| H (feriado fechado) | Calendário | Só sai quando o feriado é aberto ou removido; à mão só F, V, A ou M |
| Em branco | "Limpar escala" (mês limpo, dia sem célula) | "Gerar escala" (ou clique com a ferramenta, que fixa o dia) ou "Desfazer" |
| Fora do período | Dia fora de "Planejar a partir de" + semanas | Ampliar ou mover o período |

Toda transição manual grava o dia como **fixado**. O motor só muda dias não fixados e nunca muda V, A ou M (RN-FOL-08). "Limpar escala" nunca apaga V, A e M.

### 6.3 Estados da presença numa faixa

`antes da entrada` → `no posto` → `em intervalo` → `no posto` → `depois da saída`. Uma faixa só conta "no posto" se a pessoa estiver nesse estado na faixa inteira (RN-COB-02). Com dados de remanejamento ou atividade [MOTOR-SEM-TELA]: `remanejada (conta em outro setor)` e `em atividade (não conta)`.

### 6.4 Estados da geração

| Estado | Como aparece | Próximo |
|---|---|---|
| Ocioso | Botões habilitados | "Gerar escala", "Gerar", "Reorganizar o resto", "Reorganizar as folgas da semana", "Gerar escala inteligente", "Gerar a escala de {setor} agora" |
| Gerando | "Gerando…"; Gerar, Limpar e Desfazer desabilitados | Ao terminar |
| Aplicada | Relatório "Escala gerada" | Fechar, trocar de setor ou de loja, editar à mão, desfazer |
| Mantida | Relatório "Escala mantida" | Idem |
| Falha | Relatório "Não foi possível gerar" com causas; escala inalterada | Idem |

Pelo Mês, a geração de cada loja só começa depois de o período cobrir o mês; com várias lojas, elas são geradas uma de cada vez.

### 6.5 Estados de salvamento

`Tudo salvo` → (mudança) → espera de 0,9 s → `Salvando…` → `Salvo às HH:MM`; em falha, `Erro ao salvar` (as lojas continuam pendentes e são gravadas na próxima tentativa, disparada por uma nova mudança).

### 6.6 Permissões e perfis

- **Não há** autenticação, perfis nem permissões. Quem abre a página ou o programa vê e altera tudo, inclusive excluir lojas e restaurar cópias.
- Na página publicada os dados são **compartilhados** por quem tem acesso a ela, sem controle de edição simultânea (RN-DAD-04).
- Na página local e no programa, os dados ficam só naquele navegador ou computador.
- [PENDENTE] PD-01: definir perfis e permissões.

### 6.7 Outros estados

| Objeto | Estados |
|---|---|
| Mês do setor | normal · em branco (limpo) |
| Setor | visível · escondido |
| Loja | em uso (em edição) · selecionada no filtro · não selecionada |
| Pessoa | por regime: 5x2/6x1 (da loja, do setor ou próprio) · jornada · 12x36 Plantão A/B; por domingos: em time · ciclo próprio · não trabalha domingo |
| Linha da importação | NOVA · ATUALIZA · JÁ EXISTE · ERRO |
| Férias da pessoa | Sem período programado · Com período programado (lançadas na escala / já passou sem férias lançadas) · Com férias lançadas · De férias hoje |
| Intervalo da pessoa num dia | do turno · de sempre próprio · "Só hoje" · turno escolhido no dia (não editável) · sem intervalo |
| Sugestão de almoço | fechada · calculada (com ou sem mudanças) · aplicada / descartada |
| Botão de confirmação | normal · pedindo confirmação (volta sozinho em 4 s) |
| Regra avançada "evitar/proibir" | Desligada · Evitar · Proibir |

### 6.8 Transições automáticas (o que dispara o quê)

| Ação | Efeito automático |
|---|---|
| Qualquer mudança nos dados de uma loja | Preenchimento dos dias sem escala de todos os setores (exceto meses em branco); recálculo de cobertura, alertas, indicadores; gravação em 0,9 s; ponto no histórico de desfazer |
| Mudar a necessidade | Recalcula o movimento de cada dia (RN-NEC-04) |
| Mudar "Semana começa" | Move o início do período; refaz as células não fixadas de todos os setores |
| Mudar "Planejar a partir de" / "Quantas semanas" / navegar para fora do período | Dias novos preenchidos; nada é refeito |
| Aplicar regra de domingo (loja ou setor) | Times; refaz a escala dos setores (na loja: todos os setores — 11.7) |
| "Reequilibrar os times" | Redivide os times do setor; refaz a escala do setor |
| Mudar folga fixa (Equipe) | Ajusta domingos/times; refaz a escala da pessoa |
| Mudar regime, modelo do setor, jornada (dias), 12x36 | Refaz a escala das pessoas afetadas; apaga intervalos próprios |
| Mudar o turno da pessoa / mudar de setor | Apaga o intervalo de sempre próprio |
| Mudar entrada, horas, intervalo, limite ou janela de um turno | Apaga o início de intervalo de sempre das pessoas do turno; intervalo fora do turno vai para o meio |
| Excluir turno | Pessoas e dias vão para outro turno; padrão de domingo passa ao próximo |
| Incluir/excluir feriado, mudar "Loja abre", mudar dias sem folga, mudar "feriado conta como folga" | Refaz as semanas afetadas em todos os setores |
| Edição manual de um dia | Fixa o dia; fecha o relatório; aviso de edição; pode trocar o setor da página |
| Lançar ou remover férias | Grava/apaga V fixados; aviso de edição se tocar o período |
| "Gerar escala" | Tira a marca de branco dos meses do período; folgas; turnos (regras 11 e 12); almoços (se automático) |
| "Limpar escala" | Meses em branco; fecha relatório e aviso; apaga registro de geração |
| Esconder o setor aberto | A página vai para o primeiro setor visível |
| Trocar de loja em uso | Setor de mesmo nome; fecha o relatório |
| Abrir dados antigos | Cores da paleta; semana começa; regra de domingo individual (RN-DAD-07) |

---

## 7. Relações e dependências

### 7.1 Relações entre os dados

```
Loja 1──N Setor 1──N Turno (normal | plantão | domingo/feriado)
  │         │──N Faixa de necessidade (dias ou data)
  │         │──7 Movimento do dia
  │         │──N Modelo de domingo
  │         └──  Escala: Pessoa × Data → Célula (código, fixado, turno do dia, intervalo do dia)
  │──N Pessoa ──1 Setor (atual) ──1 Turno ──0..1 Turno de domingo ──0..1 Jornada
  │──N Jornada cadastrada
  │──N Feriado · N Dia sem folga · Regras avançadas · Regras de férias · Cores e tema
  └──N Remanejamento / Atividade [MOTOR-SEM-TELA]
```

- A escala fica **no setor**, por pessoa. Ao mudar de setor, a pessoa leva a sua escala (RN-EQP-05).
- A pessoa referencia turnos do **próprio setor**; o turno de um dia (célula) também.
- Regras avançadas de duplas (7 e 8) ligam pessoas de setores diferentes da mesma loja.
- As lojas não compartilham dados: cópias e duplicações criam identificadores novos (RN-LOJ-01).

### 7.2 Dependências de cálculo

| Resultado | Depende de |
|---|---|
| Dias do período (tipo, aberto/fechado) | Início, semanas, semana começa, horário da loja, domingo aberto, feriados |
| Código efetivo de cada dia | Célula gravada, tipo do dia, mês em branco |
| Horário de cada pessoa no dia | Turno do dia → regime 12x36 → turno de domingo (pessoa, padrão, primeiro) → turno da pessoa; horas próprias (jornada, estágio/aprendiz, modelo diferente); intervalo de sempre e "só hoje" |
| Folgas exigidas na semana | Regime/jornada/modelo da pessoa, setor e loja; feriados fechados (opção); férias, faltas, atestados |
| Necessidade por faixa | Faixas do setor (prioridade data > menos dias > maior mínimo); feriado aberto usa domingo |
| Movimento do dia | Faixas gerais da necessidade |
| Cobertura | Horário de cada pessoa, códigos dos dias, remanejamentos/atividades, regra da faixa inteira |
| Geração | Tudo acima + folgas fixas, preferências, regra de domingo e times, limites diários, dias sem folga, regras avançadas, dias fixados |
| Distribuição de almoços | Horário das pessoas, janela/limite do turno, duração, mínimo e ideal, movimento do dia, regras de intervalo da loja |
| Alertas | Escala, turnos, contratos, referências legais, regras avançadas, cobertura |
| Situação de férias | Férias programadas (de … até), dias V da escala (inclusive fora do período), regras de férias (limite simultâneo, menor parte) |
| Rankings de faltas/atestados | Dias A/M gravados, período planejado, datas com escala gravada, folgas e feriados vizinhos |

### 7.3 Dependências entre telas

| Tela | Usa dados de | Altera dados usados por |
|---|---|---|
| Personalizar | — | Todas (horário, período, modelos, regras, feriados, cores, setores) |
| Lojas / filtro de lojas | — | Todas (quais lojas aparecem; loja em uso) |
| Horários | Personalizar (jornada, horário) | Equipe (turnos), Escala, Domingos, Almoço, cobertura |
| Fluxo alto | Horário da loja | Geração, cobertura, almoço, alertas, movimento |
| Equipe | Horários, Personalizar (jornadas, regra de domingo) | Escala, Domingos, Almoço, Férias, Dashboards |
| Escala | Todas acima | Domingos, Almoço, Dashboards (faltas/atestados), Férias (V) |
| Domingos | Horários (turnos de domingo), Equipe (times) | Escala (dias de domingo fixados) |
| Escala de Almoço | Escala, Horários, Fluxo alto | Escala (intervalos), cobertura, PDFs |
| Férias | Equipe (admissão), Escala | Escala (V fixados), Dashboards |
| Dashboards | Escala, Equipe | — (só leitura; "Lojas" troca a loja em uso) |

### 7.4 Pré-requisitos

| Para… | É preciso… |
|---|---|
| Gerar escala | Pessoas no setor; turno normal; necessidade (sem ela a escala é válida, mas a cobertura não guia as folgas) |
| Ver cobertura e sugestões | Pessoas e necessidade; nenhum mês em branco no período |
| Rodízio de domingos | Loja aberta aos domingos; regra N×1; pessoas que trabalham aos domingos |
| Escala de domingo (tela Domingos) | Loja aberta aos domingos; domingos no período; turnos de domingo (senão vale o turno normal) |
| Distribuir almoços | Turnos com intervalo; limite diferente de "nunca" ou janela; mínimo no dia (para avisar e equilibrar) |
| Rodízio semanal de turnos (regra 12) | Regra ligada e pelo menos 2 turnos marcados |
| Pessoa-chave (regra 9) | Pessoas marcadas em "mais detalhes" |
| Saldo de férias | Data de admissão |
| Linhas por turno no Mês | Mais de um turno normal com pessoas |
| Seletor "Loja" nas telas | Mais de uma loja |

### 7.5 Regras que se combinam ou se excluem

- Regra 1 (preferência das folgas da semana): uma escolha só entre separadas quando der, separadas sempre, juntas quando der e sem preferência; os dias sem folga (regra 2), os limites por dia e as folgas fixas valem em qualquer escolha.
- Folga fixa no domingo ⇒ "não trabalha domingo" ⇒ fora do rodízio de times.
- 12x36 ⇒ sem folgas fixas, sem times, sem regras semanais, sem jornada.
- 6x1 ⇒ só a 1ª folga fixa vale.
- Dia sem folga × folga fixa: no dia sem folga a pessoa trabalha (exceto domingo para quem não trabalha domingo).
- Feriado fechado conta como folga (opção) × folgas da semana: reduz as folgas exigidas.
- Regra de domingo do setor × da loja: o setor com regra própria ignora a da loja (exceto o refazer da 11.7).
- Modelo da pessoa × setor × loja: vale o mais específico (RN-REG-01).
- Janela do intervalo × limite do turno: com janela, o limite não é usado.
- Distribuição "linear" × "conforme o movimento": uma por turno.

---

## 8. Mensagens, erros e exceções

As mensagens das telas estão citadas, com o texto exato, na descrição de cada tela (seção 4). Esta seção reúne as mensagens de erro e de exceção, as causas de falha da geração e as alternativas que o próprio sistema oferece.

### 8.1 Tipos de mensagem

| Tipo | Onde aparece | Duração |
|---|---|---|
| Mensagem flutuante | Canto inferior direito; confirma ações e explica efeitos (ex.: "Escala de {setor} gerada…"); às vezes com "Desfazer" | 4,5 s ou até fechar |
| Relatório da geração | Topo da Escala (4.2.2) | Até "Fechar", trocar de setor/loja, editar ou desfazer |
| Aviso de edição manual | Topo da Escala e da tela Domingos | Até gerar ou "Agora não" |
| Alertas | "Onde vai faltar gente", "Ver todos os avisos", "Atenção às regras" (Domingos), ponto vermelho nas abas | Enquanto a situação existir |
| Avisos em quadros | Prévias (regra de domingo, copiar escala, férias, importação), sugestões de almoço | Enquanto o quadro estiver aberto |
| Diálogos do programa | Janelas do sistema operacional ("Salvar como", "Arquivo inválido", "Sobre") | Até fechar |

### 8.2 Falha da geração (relatório "Não foi possível gerar")

Texto: "A escala atual não foi alterada. O que impede:" seguido de até 6 causas. As causas vêm das verificações de inviabilidade (RN-GER-10) ou, na falta delas, das violações que nenhuma tentativa conseguiu eliminar.

**Verificações de inviabilidade:**

| Situação | Texto | Alternativa indicada |
|---|---|---|
| Folgas da semana não cabem nos limites diários | "Semana N: a equipe precisa de X folgas, mas os limites diários de folga somam Y. Aumente o "máximo de folgas" em algum dia ou reduza a equipe/folgas." | Regras avançadas → regra 3 |
| Mínimos diários acima das jornadas disponíveis [MOTOR-SEM-TELA] | "Semana N: os mínimos diários somam X jornadas, mas a equipe oferece Y no 5x2. Reduza os mínimos diários ou aumente a equipe." | — |
| Mínimo diário acima das pessoas disponíveis [MOTOR-SEM-TELA] | "{Dia} dd/mm: mínimo diário de N, mas só M pessoas podem trabalhar (folgas fixas, férias, ausências ou bloqueios)." | — |
| Folgas obrigatórias acima do limite do dia | "{Dia} dd/mm: N folgas já são obrigatórias (fixas/domingo/bloqueadas), acima do limite de M." | Rever folgas fixas, times ou o limite |
| Dias de trabalho acima do limite semanal | "{pessoa}: N dias de trabalho somam ao menos Xh na semana K, acima do limite de 42h. Reduza a jornada diária do turno ou ajuste o limite semanal." | Horários / Personalizar |

**Violações** (também usadas nos alertas "problema" da escala atual, RN-ALE-02):

| Tipo | Texto | Título do alerta |
|---|---|---|
| Folgas a menos | "{pessoa}: semana N com X folga(s); o mínimo é Y." | Folgas |
| Folgas a mais | "{pessoa}: semana N com X folgas (esperado Y)." | Folgas |
| Limite semanal | "{pessoa}: semana N soma Xh, acima do limite semanal de 42h." | Jornada semanal |
| Dia fixo descumprido | "{pessoa}: dd/mm deveria ser {folga/código} e ficou {código}." | "Limite diário" (observado; 11.7) |
| Dias seguidos | "{pessoa}: N dias seguidos de trabalho até dd/mm (máximo 6)." | Dias seguidos |
| Domingos (ciclo automático) | "{pessoa}: sem folga em N domingos seguidos (até dd/mm)." | Domingos |
| Máximo de folgas no dia | "{Dia} dd/mm: N pessoas de folga (limite M)." | Limite diário |
| Mínimo no dia [MOTOR-SEM-TELA] | "{Dia} dd/mm: N trabalhando (mínimo diário M)." | Limite diário |
| Regra 2 (proibir) | "{pessoa}: folga em {dia}, dia da semana sem folga (Regras avançadas)." | "Limite diário" (observado) |
| Regra 1 (proibir) | "{pessoa}: folgas em dias seguidos ({dia} e {dia})…" | "Limite diário" (observado) |
| Regra 7 (proibir) | "{pessoa} e {pessoa} de folga no mesmo dia ({dia}); a regra não deixa." (de outro setor: "{pessoa} e {pessoa} ({setor}) …") | "Limite diário" (observado) |
| Regra 9 (proibir) | "{dia}: N pessoa(s)-chave trabalhando (mínimo M)." | "Limite diário" (observado) |

**Avisos no relatório de sucesso:** ajuste automático do limite de folgas por dia (RN-GER-04); ajustes de turno das regras 11 e 12; almoços distribuídos; "Ainda falta gente em alguns horários…".

### 8.3 Alertas de cadastro e referência (textos)

Títulos e gravidades em RN-ALE-03. Textos:

| Situação | Texto |
|---|---|
| Intervalo curto | "jornada de Xh com intervalo de Yh; o parâmetro configurado exige ao menos 1h para jornadas acima de 6h." |
| Intervalo longo | "intervalo de Xh acima do máximo configurado (2h). Verifique acordo/convenção." |
| Jornada diária longa | "jornada de Xh acima do limite diário configurado (10h)." |
| Intervalo fora do turno | "o intervalo (HH:MM) está fora do horário do turno." |
| Janela invertida | "a janela do intervalo (HH:MM–HH:MM) termina antes de começar." |
| Sem turno | "sem turno definido." |
| Contrato acima do limite | "jornada contratual de Xh acima do limite semanal configurado (42h)." |
| Estagiário | "estagiário com Xh por dia; a Lei do Estágio (11.788/2008) permite até 6h por dia (8h só em períodos sem aula, se previsto no curso e no termo de compromisso)." |
| Aprendiz | "jovem aprendiz com Xh por dia; o limite é 6h, ou até 8h para quem já concluiu o ensino fundamental, contando as horas de aprendizagem teórica." |
| Horas acima do contrato | "{tipo} com Xh na semana N, …, acima das Yh por semana do contrato. Dê mais folgas na semana ou diminua as horas por dia." |
| Ciclo de domingo | "regime de folga 1 domingo a cada N excede o parâmetro de referência configurado (1 a cada M). Confirme na legislação e na convenção coletiva aplicável." |
| Domingos seguidos | "trabalha N domingos seguidos até dd/mm (referência: folga ao menos 1 a cada M)." |
| Descanso entre jornadas | "descanso de Xh entre dd/mm e dd/mm, abaixo do mínimo de 11h." |
| Remanejamentos [MOTOR-SEM-TELA] | "dois remanejamentos no mesmo horário (…). A pessoa só é contada no primeiro." / "remanejado(a) para {setor} sem habilitação cadastrada para este setor." / "remanejamento HH:MM–HH:MM fora do turno da pessoa (…); só conta enquanto ela está trabalhando." |
| Horas extras (regra 13) | "horas extras acima do limite (Xh por semana): Yh na semana N, …." |
| Domingos desiguais (regra 10) | "domingos trabalhados desiguais no período: {nomes} com N; {nomes} com M. Ajuste os times em Equipe ou …" |
| Pessoas-chave (regra 9) | "nenhuma pessoa-chave marcada em {setor} (marque em Equipe → mais detalhes)." / "só N pessoa(s)-chave em {setor}: nos dias de folga dela(s) fica abaixo do mínimo de M. …" |
| Cobertura | "{Dia da semana}: cobertura insuficiente em X de Y semanas (dd/mm, …)" com as faixas "falta(m) K {papel} entre HH:MM e HH:MM[ em dd/mm…]" (RN-ALE-01) |
| Intervalo (observações) | RN-ALM-09 |

### 8.4 Erros de sistema e de arquivos

| Situação | Mensagem | O que acontece / alternativa |
|---|---|---|
| Falha ao gravar | Rodapé "Erro ao salvar" (ponto vermelho) | As lojas ficam pendentes; nova tentativa na próxima mudança |
| Falha ao carregar os dados | — | O sistema cria a demonstração, que é gravada [PENDENTE] (PD-17) |
| Restaurar arquivo inválido (tela) | "Não foi possível restaurar: formato não reconhecido." ou "Não foi possível restaurar: {erro de leitura}." | Nada muda |
| Restaurar arquivo inválido (programa) | Janela "Arquivo inválido — O arquivo escolhido não é uma cópia de dados do Escala 5x2." | Nada muda |
| Download cancelado | "Download cancelado." | — |
| Download indisponível | "Não foi possível baixar o arquivo aqui." | Usar outra variante ou permitir downloads |
| Falha ao montar o arquivo | "Falha ao gerar o arquivo: {detalhe}" | — |
| Planilha .xls antiga | "Use um arquivo .xlsx (Excel) ou .csv. Arquivos .xls antigos: abra no Excel e salve como .xlsx." | Salvar como .xlsx |
| Planilha sem a coluna "Nome" | "Não encontrei a linha de cabeçalho com a coluna “Nome”. Use o modelo da planilha." (no painel de importação) | Usar o modelo |
| Falha ao gerar o modelo de importação | "Falha ao gerar o modelo: {detalhe}" | — |
| Exportação sem linhas | "Ninguém na lista com esses filtros." / "Nada para exportar com esses filtros." | Mudar os filtros |
| Nada para desfazer | "Não há nada para desfazer." | — |
| Programa aberto duas vezes | A janela já aberta é trazida para frente | — |
| Acesso a Documentos negado (Mac) | — | Dados na pasta do programa (caminho em Ajuda → Sobre) |

### 8.5 Situações vazias (estados sem dados)

| Tela | Situação | Mensagem |
|---|---|---|
| Escala | Setor sem pessoas | "Ainda não há ninguém em {setor}. Cadastre a equipe em Equipe…" |
| Escala | Sem faltas | "Nenhum horário abaixo da necessidade. A escala está completa." |
| Escala (Semana/Mês) | Filtros sem resultado | "Ninguém encontrado com esses filtros." |
| Mês / Domingos / Almoço | Loja sem o setor | "Esta loja não tem o setor {setor}." |
| Domingos | Loja fechada aos domingos | "A loja fica fechada aos domingos (mude em Personalizar → Funcionamento e jornada)." |
| Domingos | Sem domingo aberto no período | "Nenhum domingo aberto no período planejado." |
| Escala de Almoço | Dia fechado | "A loja está fechada neste dia." |
| Escala de Almoço | Sem mínimo no dia | "Este setor não tem mínimo definido para o dia. …" |
| Equipe | Setor vazio / filtros | "Ninguém cadastrado em {setor} ainda." / "Ninguém com esses filtros." |
| Horários | Sem plantões | "Nenhum plantão neste setor." |
| Fluxo alto | Grupo sem faixas / sem exceções | "Nenhuma faixa ainda." / "Nenhuma exceção." |
| Dashboards | Sem registros | "Nenhuma falta registrada" (com passo a passo) / "Ninguém faltou com esses filtros." |
| Dashboards (Colaboradores) | Loja sem pessoas | "Nenhum colaborador cadastrado nesta loja." |
| Férias (mapa) | Ano sem férias | "Ninguém de férias em AAAA." |
| Personalizar | Sem jornadas / feriados / dias sem folga | "Nenhuma jornada cadastrada. …" / "Nenhum feriado no período." / "Nenhum dia sem folga." |
| Regra de domingo (prévia) | Todos os setores com regra própria | "Nenhum setor segue a regra da loja (todos têm regra própria)." |

### 8.6 Exceções de comportamento (o que o sistema faz em casos-limite)

| Caso | Comportamento |
|---|---|
| Clique de trabalho num dia fechado (Semana) | Ignorado; as outras mudanças da mesma ação são gravadas |
| Dia fechado no Mês | Não clicável |
| Mudança de almoço que piora a cobertura | Grava e avisa ("Atenção: com esse intervalo, das HH:MM às HH:MM o setor fica com N no posto (mínimo M)…") |
| Sugestão de almoço sem melhora | "Nenhuma mudança de intervalo melhora a cobertura deste dia…" — nada é gravado |
| Almoços não resolvem a falta | "Falta gente neste dia, mas não é o almoço" + alternativas (Escala, Horários, Fluxo alto) |
| Turno de intervalo fixo ("nunca") | Fica de fora da distribuição: "Não mexido — intervalo fixo no cadastro do turno (mude em Horários para permitir mover)" |
| Turno com intervalo fora da regra | Fica de fora: "{turno}: intervalo de X min fora da regra da loja (…) — corrija o turno em Horários." |
| Limite oculto de folgas pequeno para a equipe | Aumentado na proporção, com aviso no relatório (RN-GER-04) |
| Regra 9 "proibir" com poucas pessoas-chave | Vira "evitar" automaticamente |
| Dupla repetida (regras 7 e 8) | Ignorada |
| Feriado ou dia sem folga repetido | Ignorado |
| Nome de setor escondido em "Novo setor" | O setor escondido volta a aparecer |
| Origem com mais pessoas que o destino (Copiar escala) | Só as primeiras são usadas (aviso), a não ser que "Criar as vagas que faltam" esteja marcada |
| Pessoa da importação já existe em outro setor | Atualizada lá; o turno não muda |
| Estagiário com horas que não valem no 12x36 | "(não vale no 12x36)" |
| Férias sobre faltas, atestados ou dias fixados | Exige o aceite; os dias viram férias |

---

## 9. Entradas e saídas por operação

| Operação | Entradas | Regras | Saída / resultado | O que é gravado |
|---|---|---|---|---|
| Gerar escala (setor) | Setor; período; pessoas e cadastros; turnos; necessidade; células atuais (fixadas, V/A/M); feriados, dias sem folga; regras avançadas; regra de domingo | RN-GER-02 a 13; RN-RAV; RN-ALM-02 | Relatório (cobertura antes → depois, almoços, turnos, avisos ou causas da falha); escala, cobertura e alertas atualizados | Células do período (código, fixado, turno do dia, início de intervalo do dia); registro da geração; meses deixam de estar em branco |
| Almoços em dia (automático) | Setor; período; turnos; pessoas; dias de cada um | RN-ALM-02 a 07, 11 | Mensagem "Horário de almoço sugerido para N pessoas" | Horário fixo das pessoas; almoço do dia (rodízio, domingo, feriado) |
| Mudar o horário fixo / rodízio | Pessoa; hora ou rodízio | RN-ALM-04, 05 | Aviso se não cabe | `breakStart`, `almocoFixo`, `almocoRodizio` |
| Mudar só neste dia | Pessoa; dia; hora | RN-ALM-03 | Selo "SÓ HOJE" | Célula: `brk` + `brkFix` |
| Sugerir horários de novo | Setor | RN-ALM-02 | — | Horário fixo de todos os que não estão em rodízio |
| Preenchimento automático | Qualquer mudança de dados; dias sem célula | RN-GER-11 | Dias sem escala preenchidos | Células novas |
| Editar dia (Semana/Mês) | Ferramenta; pessoa; data | RN-MAN | Dia alterado e fixado; aviso de edição | Célula (código + fixado) |
| Limpar escala | Meses; setor(es); apagar fixados (sim/não); voltar almoços (sim/não) | RN-LIM | Dias em branco; mensagem | Células apagadas; meses marcados em branco; intervalos apagados (opção); registro de geração apagado |
| Desfazer | Histórico da sessão | RN-DES | Estado anterior de todas as lojas | Lojas regravadas; lojas criadas depois apagadas |
| Copiar escala | Origem; destinos; partes; vagas; aceite | RN-COP | Prévia; mensagem | Turnos, faixas, movimento, regras de folga, células e pessoas novas no destino |
| Ampliar período pelo Mês | Mês exibido | 4.2.8 | Período ajustado; dias novos preenchidos | Início e semanas da loja; células novas |
| Cadastrar pessoa | Setor; nome (opcional) | RN-EQP-01, RN-DOM-06 | Pessoa na lista; escala completada | Pessoa; time; células |
| Alterar pessoa (campo) | Campo e valor | RN-EQP, RN-REG, RN-FOL-06 | Mensagem quando há efeito; escala refeita quando aplicável | Pessoa; células refeitas |
| Alterar as pessoas mostradas | Filtros; regime, folgas fixas, domingos | 4.3.1 | "N pessoas alteradas…" | Pessoas; times; células do setor refeitas |
| Importar planilha | Arquivo .xlsx/.csv; atualizar existentes | RN-IMP | Prévia por linha; resumo | Pessoas novas/atualizadas; times; plantões; células |
| Excluir pessoa | Pessoa | RN-EQP-02 | — | Pessoa, escala, remanejamentos e atividades apagados |
| Modelo do setor / da loja | Modelo; confirmação | RN-REG-02/03/07 | Mensagem | Setores e pessoas; plantões criados; células refeitas |
| Regra de domingo | Regra; confirmação após prévia | RN-DOM-08 | Prévia; mensagem | Regra (loja/setor); times; células refeitas |
| Reequilibrar times | Setor; confirmação | RN-DOM-07 | Tamanho dos times | Times das pessoas; células do setor refeitas |
| Escolher domingo (tela Domingos) | Pessoa; domingo; folga/turno | 4.4 | Aviso de edição | Célula fixada (com turno) |
| Turno de domingo habitual | Pessoa; turno | RN-DOM-10 | Mensagem | Pessoa; células de domingo com outro turno de domingo voltam ao habitual |
| Copiar domingo / aplicar modelo | Origem; destinos; confirmação | 4.4.2/4.4.3 | Contagem de mudanças | Células fixadas |
| Salvar modelo de domingo | Domingo; nome | 4.4.3 | "Modelo "X" salvo." | Modelo no setor |
| Criar/editar turno | Campos do turno | RN-HOR | Saída calculada; alertas | Turno; intervalos de sempre do turno apagados quando aplicável |
| Excluir turno | Turno; confirmação | RN-HOR-03 | — | Turno removido; pessoas e células remapeadas |
| Faixas de necessidade | Dias/data, início, fim, mínimo | RN-NEC | Pico do grupo | Faixas; movimento recalculado |
| Aplicar horário da loja aos setores | Setores marcados / exceções | RN-HOR-09 | Mensagem | Faixas gerais; movimento; marca de horário próprio |
| Feriado / dia sem folga | Data, nome, "Loja abre", "todo ano" | RN-FER | Mensagem | Lista; células das semanas refeitas |
| Jornada cadastrada | Nome, dias, horas, intervalo | RN-REG-10 | Mensagem | Jornada; contrato e escala de quem segue |
| Regras avançadas | Valores e regras | RN-RAV | — (valem na próxima geração) | Configuração da loja |
| Programar / alterar / remover férias | Pessoa; início; dias; aceite | RN-FEV | Prévia; mensagem | Células V fixadas (ou apagadas) |
| Férias programadas (de … até) | Datas | 4.7.5 | Mensagem | Pessoa (`feriasDe`, `feriasAte`) |
| Escolher automaticamente | Pessoas sem período e sem férias lançadas nos próximos 12 meses; limite simultâneo; dias de férias | RN-FEV-11 | "Férias programadas para N pessoas…" | Pessoas (`feriasDe`, `feriasAte`) |
| Rankings de faltas/atestados | Filtros | RN-ABS | Indicadores, gráficos, ranking | — |
| Criar / duplicar / excluir loja | Nomes, rede, origem, setores | RN-LOJ | Mensagem | Lojas |
| Setores (Personalizar) | Nome, cor, ordem, esconder, excluir | RN-SET | Mensagem | Setores; pessoas (na exclusão) |
| Cores do mapa / da escala / tema / fonte | Cores, limites, tema, fonte | RN-COR; 4.12 | Visual | Configuração da loja (tamanho do mapa no navegador) |
| Cópia de segurança | — | RN-DAD | Arquivo `escala5x2-backup-AAAA-MM-DD.json` | — |
| Restaurar cópia | Arquivo | RN-DAD | "Dados restaurados: N loja(s)." | Todas as lojas substituídas |
| Começar do zero / demonstração | Setores; confirmação | 4.12.10 | Loja vazia ou demonstração | Loja em uso substituída |
| Exportações (PDF/Excel) | Tela, filtros | RN-EXP | Arquivo | — |

### 9.1 Formato da cópia de segurança

```json
{ "app": "escala5x2", "version": 1, "stores": [ { "id": "…", "name": "…", "network": "…",
  "config": { … }, "sectors": [ { "id": "…", "shifts": [ … ], "minRules": [ … ],
  "schedule": { "<pessoa>": { "AAAA-MM-DD": { "c": "T", "lock": true, "shiftId": "…", "brk": "12:30", "brkMin": 90 } } } } ],
  "employees": [ … ], "reassignments": [ … ], "assignments": [ … ] } ] }
```

A cópia guarda a estrutura completa (seção 2). A restauração aceita também uma lista de lojas ou uma loja isolada.

### 9.2 Modelo de importação de colaboradores

Aba "Colaboradores" com as colunas: Nome, Matrícula, Função, Setor, Regime, Turno, Domingos, Folga fixa, Sexo, Admissão, Horas por semana, Contratação, Horas por dia (valores aceitos em RN-IMP-02/03). Aba "Instruções" com a explicação de cada coluna e a lista dos turnos existentes.

---

## 10. Exemplos práticos e cenários de homologação

### 10.1 Exemplos de cálculo

| # | Situação | Resultado esperado | Regra |
|---|---|---|---|
| EX-01 | Turno: entrada 08:15, jornada da loja 8h24, intervalo de 2h | Saída 18:39 | RN-TUR-01 |
| EX-02 | Pessoa 6x1 numa loja 5x2 (42h), turno sem horas próprias | 7h por dia (42h ÷ 6) | RN-REG-04 |
| EX-03 | Estagiário 6h num turno que entra 08:15 com intervalo às 12:00 | Entra 08:15; intervalo automático de 15 min às 12:00 (horário do turno, que cabe); sai às 14:30 | RN-REG-09, RN-TUR-05 |
| EX-04 | Pessoa entra às 08:15 | Não conta na faixa 08:00–08:30; conta a partir de 08:30–09:00 | RN-COB-02 |
| EX-05 | Pessoa em intervalo de 12:15 a 13:15 | Não conta nas faixas 12:00–12:30 e 13:00–13:30 nem 12:30–13:00 | RN-COB-02 |
| EX-06 | Necessidade seg–sex 08:30–12:00 = 3 e "só quarta" 08:30–12:00 = 5 | Na quarta vale 5 | RN-NEC-02 |
| EX-07 | Feriado aberto numa quinta | Usa horário, turno, faixas e movimento de domingo; não segue os times | RN-FER-03 |
| EX-08 | Semana 5x2 com 25/12 fechado e "feriado conta como folga" ligado | A pessoa recebe só mais 1 folga na semana | RN-FER-02 |
| EX-09 | Mesma semana com a opção desligada | A pessoa recebe 2 folgas além do feriado | RN-FER-02 |
| EX-10 | Pessoa com 3 dias de férias numa semana 5x2 | Continua com 2 folgas; trabalha 2 dias | RN-FOL-01 |
| EX-11 | Rodízio 1x1 | 25/10/2026 trabalha o Time A; 01/11 o Time B; 08/11 o A | RN-DOM-02 |
| EX-12 | Rodízio 2x1 | 3 times; a cada domingo um time folga; cada pessoa trabalha 2 domingos e folga 1 | RN-DOM-02 |
| EX-13 | Turno com 4 pessoas | No máximo 2 de folga no mesmo dia sem penalidade forte (teto = máx(1, ⌈8/6 + 0,5⌉) = 2); no Mês a linha do turno fica vermelha com 3 | RN-GER-06 |
| EX-14 | 5 pessoas do mesmo turno com intervalo de 1h, janela 12:00–15:00, "O intervalo inteiro" | Horários fixos sugeridos espaçados (ex.: 12:00, 12:30, 13:00, 13:30, 14:00); no máximo 2 almoçando juntas | RN-ALM-02 |
| EX-15 | Pessoa fixa às 12:30; usuário muda a terça para 13:30 ("Só neste dia") e depois gera a escala | Terça 13:30 (SÓ HOJE); demais dias 12:30; nada muda com a geração | RN-ALM-03 |
| EX-16 | Quadro de 10 pessoas, limites padrão | Vermelho com menos de 5 no posto; verde escuro com 8 ou mais | RN-COR-01 |
| EX-17 | Necessidade com mínimo 3 por 2 faixas faltando 1 pessoa em 2 de 4 semanas | Horas faltando por semana = 2 faixas × 30 min × 1 pessoa × 2 semanas ÷ 4 = 0h30 | RN-COB-05 |
| EX-18 | Limite oculto de sábado 2, equipe cresceu e precisa de 5 folgas no sábado | O limite sobe na proporção e o relatório avisa "sábado 2 → 5" | RN-GER-04 |
| EX-19 | Dia sem folga 24/12 numa quinta, máximo de folgas 2 por dia, loja fechada aos domingos (6 dias abertos) | Nos outros dias da semana o máximo vira ⌈2 × 6 ÷ 5⌉ = 3 | RN-FER-05 |
| EX-20 | Padaria com 9 pessoas, ninguém com férias programadas, sem limite → "Escolher automaticamente" em 06/11/2026 | Uma pessoa por mês, de 01/12/2026 a 01/08/2027 (30 dias cada), alternando as funções | RN-FEV-11 |

### 10.2 Casos de teste para homologação

Formato: pré-condição → passos → resultado esperado. Salvo indicação, partir da loja de demonstração (Personalizar → Dados → "Restaurar exemplo de demonstração").

**Geração e escala**

| ID | Caso | Passos | Resultado esperado |
|---|---|---|---|
| CT-01 | Geração básica | Escala → Frente de Caixa → "Gerar escala" | Relatório "Escala gerada" ou "Escala mantida"; nenhuma pessoa com folgas diferentes de 2 por semana, mais de 42h por semana ou mais de 6 dias seguidos (alertas "Folgas", "Jornada semanal" ou "Dias seguidos" ausentes) |
| CT-02 | Dia fixado é respeitado | Semana → "Trabalho ↔ folga" num dia de trabalho de uma pessoa → "Reorganizar o resto" | O dia fica F com ponto; a pessoa ganha trabalho em outro dia da semana; o dia continua F depois de gerar de novo |
| CT-03 | Dia fechado | Personalizar → Feriados → adicionar uma data do período (fechado) → Semana → tentar "Trabalho ↔ folga" no feriado | Dia mostra "Feriado"; o clique não põe trabalho; no Mês o dia não é clicável |
| CT-04 | Falha com regra impossível | Regras avançadas → regra 2 "Proibir" folga em todos os dias de seg a sáb para o setor → "Gerar escala" | Relatório "Não foi possível gerar" com causas; a escala anterior continua igual |
| CT-05 | Desfazer | Gerar escala → "↶ Desfazer" | A escala volta a como estava; mensagem "Mudança desfeita…" |
| CT-06 | Limpar e gerar | "LIMPAR ESCALA" → mês do período → "Limpar …" | Quadradinhos vazios; aviso "Escala em branco"; indicadores somem. "Gerar escala" → escala completa; aviso some |
| CT-07 | Limpar mantém ausências | Lançar férias e falta → limpar o mês sem "Apagar também os dias que eu fixei à mão" | V, A e os dias fixados continuam; o resto fica em branco |
| CT-08 | Semana começa no domingo | Semana → "Semana começa" = "No domingo" | Início do período passa ao domingo seguinte (ou o mesmo); folgas não fixadas refeitas; mensagem |
| CT-09 | Navegar para fora do período | "›" depois da última semana | O período passa a começar na semana mostrada; os dias novos têm escala |
| CT-10 | Mês fora do período | Mês → avançar para um mês fora → "Gerar escala do mês inteiro" | Período ampliado (até 8 semanas); mensagem "Planejamento de {loja} ampliado…" |
| CT-11 | Linhas por turno | Mês → setor com 2+ turnos | Linha por turno; vermelho em dia de seg–sáb com folgas acima do teto; domingos com "·" |
| CT-12 | Copiar escala | "Copiar escala…" → origem Açougue → destino Padaria → só "Fluxo alto (pessoas por horário)" → prévia → aceite → copiar | Faixas da Padaria iguais às do Açougue; mensagem; a escala da Padaria não muda até gerar |

**Cobertura, alertas e almoços**

| ID | Caso | Passos | Resultado esperado |
|---|---|---|---|
| CT-13 | Contagem na faixa inteira | Cobertura → clicar na faixa em que uma pessoa entra no meio | Ela não aparece em "No posto" nessa faixa; aparece na seguinte |
| CT-14 | Alerta com datas | Lançar folgas à mão num domingo até faltar gente | "Onde vai faltar gente" mostra o domingo e a data ("(só em dd/mm)") |
| CT-15 | Horário fixo sugerido | Escala de Almoço → "Semana" | Todos com horário na coluna "Almoço", repetido nos dias normais; horários diferentes entre as pessoas; nenhum em vermelho |
| CT-16 | Ajuste fica | Mudar o horário de uma pessoa → Escala → "Gerar escala" → voltar; recarregar a página | O horário escolhido continua |
| CT-17 | Só neste dia | Clicar no almoço de um dia → outro horário → "Só neste dia" → "Sugerir horários de novo" → "Recalcular todos" → recarregar | Selo "SÓ HOJE"; o dia continua com o horário escolhido; os outros dias no fixo; ↺ volta ao fixo |
| CT-18 | Rodízio | "↻ Rodízio" numa pessoa | Some o campo de hora; o almoço continua em todo dia de trabalho; resumo "1 em rodízio" |
| CT-19 | Ordem | "Ordem" = "Nome" → ▼ | A lista inverte inteira |
| CT-20 | Visão Dia | "Ver" = "Dia" | Mesmos controles; grade do dia inteiro com "No posto", "Almoçando", "Mínimo", "Sobra / falta"; no celular a página não rola para o lado |
| CT-21 | Horário que não cabe | Coluna "Almoço" → 16:00 num turno com intervalo 12:00–15:00 | Aviso "Fora do horário do intervalo do turno…"; o horário é gravado |
| CT-22 | Passagem do modelo antigo | Abrir dados salvos antes de 06/11/2026 | Quem tinha horário próprio fica com ele; os demais recebem sugestão; mensagem "Horário de almoço sugerido para N pessoas…" |

**Equipe, regimes e folgas**

| ID | Caso | Passos | Resultado esperado |
|---|---|---|---|
| CT-23 | Folga fixa no domingo | Equipe → estagiário → "Folga fixa" = "Dom" | Pessoa sai do rodízio; todos os domingos F; escala refeita |
| CT-24 | Duas folgas fixas | "Folga fixa" = Sáb e "+ 2ª folga fixa" = Dom → gerar | Sábado e domingo F em todas as semanas; nenhuma outra folga na semana (5x2) |
| CT-25 | 2ª folga fixa no 6x1 | Pessoa 6x1 | Campo da 2ª folga não aparece |
| CT-26 | 6x1 no setor 5x2 | Regime = "6x1" | Mensagem; 1 folga por semana; 7h por dia (EX-02) |
| CT-27 | Modelo da loja não muda setor | Setor com modelo 6x1 → Personalizar → modelo da loja 5x2 ↔ 6x1 | O setor continua 6x1 |
| CT-28 | 12x36 por pessoa | Regime = "12x36 · Plantão A" | Plantão criado (se não existir); dia sim, dia não, inclusive domingos; sem alertas de folga |
| CT-29 | Jornada cadastrada | Personalizar → "+ Nova jornada" (4 dias × 8h) → Equipe → Regime = jornada | 3 folgas por semana; contrato 32h |
| CT-30 | Estagiário 5h por turno | Horários → "+ Turno" com 5h → Equipe → turno | Saída = entrada + 5h (+ intervalo); "Horas" da Semana com 25h em 5 dias |
| CT-31 | Alterar em massa | Filtro "Estagiários" → "Alterar as pessoas mostradas" → Regime 6x1 → confirmar | "N pessoas alteradas…"; todos em 6x1 |
| CT-32 | Importar planilha | Baixar modelo → linhas: uma válida, uma sem nome, uma com setor inexistente, uma repetida → importar | Prévia: 1 NOVA e 3 ERRO com as observações de RN-IMP-03/04; só a válida entra |
| CT-33 | Importar "Sáb e Dom" | Folga fixa "Sáb e Dom" | Duas folgas fixas; fora do rodízio de domingos |

**Domingos**

| ID | Caso | Passos | Resultado esperado |
|---|---|---|---|
| CT-34 | Prévia da regra | Personalizar → Regra 2x1 | Prévia com 8 domingos e "folga X" por domingo; nada muda até aplicar |
| CT-35 | Aplicar regra | "Aplicar regra e refazer a escala" | Times A, B e C; mensagem; escala refeita; dias fixados mantidos |
| CT-36 | Turno de domingo habitual | Domingos → "Turno de domingo habitual" = outro turno | Domingos já escalados passam ao turno; mensagem (pedido "Atualização 2.0", item 4) |
| CT-37 | Escolha de domingo | Domingos → célula → "Folga" | Fixado; aviso "Você mudou N domingo(s) à mão…" |
| CT-38 | Copiar domingo | "Copiar um domingo…" → para "Todos" → confirmar | Domingos de destino iguais ao de origem (exceto férias/faltas) |

**Feriados, regras avançadas, férias, faltas, lojas e dados**

| ID | Caso | Passos | Resultado esperado |
|---|---|---|---|
| CT-39 | Dias sem folga | "+ 24/12 e 31/12 (todo ano)" com o período cobrindo dezembro | Ninguém (exceto 12x36, ausências, fixados) folga nesses dias; folgas vão para outros dias |
| CT-40 | Dupla entre setores | Regra 7 "Proibir" com pessoas de Caixa e Fiscais → gerar os dois setores | As duas nunca folgam no mesmo dia (folgas variáveis) |
| CT-41 | Pessoa-chave | Regra 9 com mínimo 1 e nenhuma marcada | Alerta "Pessoas-chave: nenhuma pessoa-chave marcada…" |
| CT-42 | Rodízio de turnos | Regra 12 ligada; 2 turnos marcados → gerar | Relatório "Rodízio de turnos: N dias com o turno da semana."; turno muda a cada semana |
| CT-43 | Programar férias | Férias → pessoa com férias programadas → "Programar" (início e dias do período programado) com uma falta no período → aceite → lançar | Dias V fixados; a falta virou V; mensagem |
| CT-44 | Limite simultâneo | Regras de férias: máximo 1 → programar duas pessoas do setor no mesmo período | Prévia em vermelho "{setor} ficaria com 2 pessoas de férias…"; "Atenção" lista os dias |
| CT-45 | Ranking de faltas | Lançar 3 faltas seguidas para uma pessoa e 1 para outra → Dashboards → Faltas | 1ª: 3 faltas, 1 ocorrência; 2ª: 1 falta; ordem por quantidade |
| CT-46 | Várias lojas | Lojas → criar 2 lojas copiando a estrutura → filtro com as 3 | Escala lado a lado por loja; Horários edita só a loja em uso |
| CT-47 | Excluir loja | Lojas → Excluir → confirmar | Loja e dados apagados; outra vira a loja em uso |
| CT-48 | Cópia e restauração | Baixar cópia → mudar algo → restaurar | "Dados restaurados: N loja(s)."; dados iguais aos da cópia |
| CT-49 | Restauração inválida | Restaurar um JSON qualquer | "Não foi possível restaurar: formato não reconhecido." |
| CT-50 | Persistência | Fazer uma mudança → aguardar "Salvo às HH:MM" → recarregar | Mudança mantida (exceto durações de intervalo "só neste dia"; 11.7) |
| CT-51 | Exportações | Baixar semana, mês, individual, Excel | Arquivos com os nomes de RN-EXP; individual com "Assinatura do colaborador" |
| CT-52 | Programa de computador | Fechar e abrir o programa | Dados de `Documentos/Escala 5x2/dados.json`; "Salvo no computador" no rodapé |

### 10.3 Roteiro de demonstração (do zero à escala impressa)

1. Lojas → nova loja "Loja Teste" em branco com Frente de Caixa e Açougue.
2. Personalizar → horário 08:00–21:00, domingo 08:00–13:00, regra 1x1, "+ 24/12 e 31/12".
3. Horários (Frente de Caixa) → "Abertura" com entrada 08:00 (sai 17:24 com 1h de intervalo); "+ Turno" "Fechamento" com entrada 11:36 e intervalo às 15:00 (sai 21:00); nos dois, janela de intervalo 11:30–15:00 "Espaçados por igual (linear)".
4. Fluxo alto → seg–sex 08:00–21:00 = 4; sábado 08:00–21:00 = 6; domingo 08:00–13:00 = 3.
5. Equipe → "Adicionar várias" com 12 nomes; dois estagiários com "Contratação" = Estagiário e regime 6x1; uma pessoa com folga fixa "Dom".
6. Escala → "Gerar escala" → conferir relatório, indicadores e "Onde vai faltar gente".
7. Escala de Almoço → conferir um sábado; ajustar um intervalo à mão.
8. Semana → "Baixar semana (PDF)"; Equipe → "Escala por pessoa (PDF)".

---

## 11. Situação das funcionalidades, histórico e pendências

### 11.1 Funcionalidades efetivamente simuladas [SIMULADO]

Tudo o que as seções 3 e 4 descrevem sem outro marcador funciona no protótipo. Em resumo:

- geração da escala por setor (5x2, 6x1, jornadas, 12x36 no mesmo setor), com regras obrigatórias, equilíbrio de folgas entre dias e entre turnos, domingos por times, folgas fixas (até duas), dias sem folga, regras avançadas e manutenção da escala atual quando não há melhora;
- distribuição automática dos almoços ao gerar, por movimento ou espaçada por igual numa janela;
- preenchimento automático de pessoas e dias novos; meses em branco; desfazer (30 passos);
- edição manual (folga, férias, falta, atestado) com fixação, na Semana, no Mês e em Domingos;
- cobertura por faixa de 30 min (faixa inteira), cores por % do quadro ou por necessidade, alertas com dias e datas, sugestões, indicadores;
- Equipe com filtros, ordenação, alteração em massa, importação por planilha, regimes, contratação e folgas fixas;
- escala própria de domingos, turno de domingo habitual, cópia e modelos de domingo;
- Escala de Almoço com grade por meia hora, edição de início e fim, sugestões e ordenação;
- Dashboards (faltas, atestados, colaboradores, lojas) e controle de férias;
- várias lojas (criar, copiar, duplicar, filtro, telas lado a lado) e cópia de escala entre setores e lojas;
- personalização (setores, funcionamento, modelos, regra de domingo com prévia, jornadas, feriados, aparência, cores, regras avançadas);
- PDFs, Excel, cópia de segurança e armazenamento (página compartilhada, navegador, programa para Windows e Mac).

### 11.2 Existe no motor, sem tela na versão simplificada [MOTOR-SEM-TELA]

| Item | Efeito hoje | De onde vêm os dados |
|---|---|---|
| Ideal de pessoas por faixa | Pesa na geração, nos almoços e na cor amarela do critério "necessidade" | Cópias da versão completa. A demonstração simplificada zera o ideal; mudar o mínimo apaga o ideal |
| Mínimo de pessoas trabalhando no dia | Restrição da geração e causa de inviabilidade | Versão completa |
| Limite oculto de folgas por dia | Restrição da geração, aumentado sozinho quando não cabe (RN-GER-04) | **A demonstração traz valores** (Apêndice A.4) |
| Remanejamentos | Mudam a contagem dos setores e geram alertas | Demonstração (1 remanejamento) |
| Atividades que não contam no posto | Tiram a pessoa da contagem no horário | Demonstração (1 atividade) |
| Coringa, postos, posto padrão, habilitações ("Pode ajudar em") | Guardados; aparecem no Excel ("Coringa") | Demonstração, importação, Equipe ("Pode ajudar em") |
| Teto de cobertura | Calculado, não exibido | Motor |
| Rascunho de escala inviável | Guardado no relatório de falha; não há botão para aplicar | Motor |
| Otimizador CP-SAT | Só com servidor configurado | Servidor da versão completa |
| Rodízio de domingo de 5x1 e 6x1 | Aceito pelo motor; a tela oferece até 4x1 | Dados importados |

### 11.3 Definido, mas não implementado [DEFINIDO-NÃO-IMPLEMENTADO]

O histórico não registra comportamento **aprovado** para a versão simplificada que tenha ficado sem implementação. Ficaram só oferecidos ou discutidos, sem decisão: gráficos de domingos e horas por pessoa, sugestão automática de turno novo, pedidos e trocas de folga, banco de horas, resumo da semana e comparação de versões de escala.

### 11.4 Dados fictícios [FICTÍCIO]

- Toda a loja de demonstração (Apêndice A): nomes, matrículas, sexo, loja ("Loja 1 — Centro"), rede ("Rede Bom Preço"), turnos, necessidades, limites diários, remanejamento, atividade e as folgas fixas de exemplo.
- Valores-padrão de configuração (8h24, 42h, 08:30–19:00, domingo 08:30–12:15, 4 semanas, contrato de 42h para pessoas novas) e os turnos iniciais de setor novo (Abertura 08:15, Tarde 09:30, Domingo 08:15 de 4h): precisam ser conferidos por loja.
- Catálogo de setores com termos e funções (RN-SET-06).
- Exemplos de jornada oferecidos como atalho na tela Jornadas ("Meio período", "30 horas", "4 dias de 8h", "6x1 de 7h20", "2 dias de 8h").

### 11.5 Regras inferidas que precisam de confirmação [INFERIDO]

| # | Regra adotada | Origem |
|---|---|---|
| IN-01 | "80% do quadro" = 80% das pessoas **cadastradas** no setor | Interpretação do pedido das cores |
| IN-02 | Vermelho abaixo de **50%** do quadro | O pedido não trazia o limite |
| IN-03 | Âncora dos times: 25/10/2026 = Time A trabalha (contagem desde 01/01/1970) | Escolha do protótipo; precisa ser estável |
| IN-04 | Times equilibrados **por turno** (e depois pelo setor) | Escolha do protótipo |
| IN-05 | Referências legais: mulheres folga 1 domingo a cada 2, demais 1 a cada 3; descanso 11h; intervalo 1h–2h acima de 6h; jornada diária máxima 10h; 6 dias seguidos; estagiário 6h/dia e 30h/semana; aprendiz 6h | Valores de referência; a tela pede confirmação na legislação e na convenção |
| IN-06 | Regras dos almoços: ≥ 2h de trabalho antes, ≥ 1h depois, ≤ 6h seguidas, passo de 30 min, limite padrão de 1h, janela padrão `máx(entrada+2h, intervalo−1h)` a `intervalo+1h` | Escolha do protótipo |
| IN-07 | Pesos do motor (10×W, W, equilíbrio, 0,6 × intensidade, −1,5; por turno 12 e 60 acima do teto `⌈2t/6 + 0,5⌉`; W = 1/2/3,2) e pesos das regras avançadas (+30, −14, +7, −16, +25, −12, +40, −4) | Calibração do protótipo |
| IN-08 | Intensidade do dia: forte ≥ 85% da maior carga, médio ≥ 60% | Calibração |
| IN-09 | Férias, faltas e atestados **não** reduzem as folgas da semana (salvo se sobrarem menos dias) | Regra do motor |
| IN-10 | Domingo com a loja fechada vale F e conta como folga da semana | Regra do motor (diferente do feriado fechado, que depende da opção) |
| IN-11 | Feriado aberto não segue os times | Regra do motor |
| IN-12 | "Dom. trab." no Mês conta só domingos, sem feriados | Regra da tela |
| IN-13 | Navegar para fora do período move o início do período (RN-CAL-07) | Escolha do protótipo |
| IN-14 | Uma pessoa só conta numa faixa se estiver presente na faixa **inteira** | Interpretação do item 06 do relatório de ajustes |
| IN-15 | Ao mudar o fim do intervalo, **a saída anda junto** (horas trabalhadas iguais) | Interpretação do pedido "editar o almoço início e o até"; confirmação pedida ao usuário |
| IN-16 | Distribuição linear: ordem por último início possível, entrada e rodízio diário; até 2 pessoas por horário quando há mais pessoas que horários | Interpretação do pedido de distribuição linear |
| IN-17 | Dias sem folga: limite de folgas dos outros dias sobe na proporção | Escolha do protótipo |
| IN-18 | Regra 9 "proibir" vira "evitar" quando o setor tem pessoas-chave de menos | Escolha do protótipo |
| IN-19 | "Quem fecha" / "quem abre" = até 30 min do turno que sai mais tarde / entra mais cedo | Escolha do protótipo |
| IN-20 | Férias: valores iniciais da CLT (30 dias, partes de 5 e 14, até 3 partes, aviso 60 dias, tabela do art. 130); períodos vencidos antes da admissão informada contam como quitados "a confirmar" | Regra geral; a tela pede confirmação com o RH |
| IN-21 | Rankings: dias escalados estimados fora do período (`(7 − folgas) ÷ 7`); ocorrência nova após trabalho, férias ou 14 dias | Escolha do protótipo |
| IN-22 | Importação: estagiário/aprendiz sem horas = 6h/dia e 30h/semana; horas por semana de 1h a 70h; horas por dia de 1h a 12h | Escolha do protótipo |

### 11.6 Histórico de pedidos e decisões

**Até a versão 23 (21/10/2026):**

| # | Pedido ou decisão | Resultado |
|---|---|---|
| 1 | Simulador inteligente de escala 5x2 para supermercados | Versão completa (Apêndice B) |
| 2 | Programa executável | Programa para Windows |
| 3 | Menu roxo e lilás, fonte Tahoma, sistema mais espaçado, texto branco | Tema "Roxo e lilás" (padrão) |
| 4 | Versão mais simples, com personalização (adicionar setores etc.) | Versão simplificada |
| 5 | Filtros de setor na Semana e na Cobertura; "SIMULADOR ESCALA 5X2" no topo; pizzas | Implementado |
| 6 | Tela "Produtividade do colaborador" | Construída e depois removida a pedido |
| 7 | Semana começando na segunda ou em data escolhida | "Semana começa" e "Ir para" |
| 8 | Filtro de vários setores na Semana | Seleção múltipla |
| 9 | Ordenação e filtro "igual ao Excel" na Equipe | Implementado |
| 10 | Cobertura mais espaçada, até 21h, horas alinhadas | Cabeçalho por hora |
| 11 | Cores da cobertura (vermelho, verde claro, verde escuro com mais de 80% do quadro) | Critério "% do quadro" (IN-01, IN-02) |
| 12 | Ordenação por horário na Semana | Implementado |
| 13 | Remover a pizza por loja | Removida (as pizzas voltaram depois nos Dashboards, item 28) |
| 14 | Cobertura "espremida" | Tamanhos, rolagem e arrastar |
| 15 | Testar curva do dia, escalonar intervalos e escala individual | Feitos |
| 16 | Escalonar sem ferir o almoço de 1h e respeitando o cadastro do turno | Duração sempre a do turno; limite por turno |
| 17 | Visão mensal | Mês |
| 18 | Remover a "Curva do dia" | Removida |
| 19 | Trocar folga altera o cadastro? | Não (RN-MAN-07) |
| 20 | Ordenação por turno no Mês | Implementado |
| 21 | Domingos com pouca gente; Time A e Time B | Equilíbrio e times |
| 22 | Botão de escala inteligente no Mês | "Gerar escala inteligente" |
| 23 | "Um domingo sim, outro não" | Rodízio 1x1 |

**Depois da versão 23:**

| # | Tema (pedido ou decisão) | Resultado | Onde |
|---|---|---|---|
| 24 | Versão para Mac | Programas para Mac Apple Silicon e Intel | 1.6 |
| 25 | 12x36 (plantão dia sim, dia não) | Por pessoa, setor e loja; plantões dia e noite | RN-REG-06/07 |
| 26 | Colaboradores do mesmo setor com regimes diferentes | Regime por pessoa (confirmado com o usuário) | RN-REG-01 |
| 27 | Contratação (estagiário, jovem aprendiz) | Coluna "Contratação" com horas próprias | RN-REG-09 |
| 28 | Relatórios: faltas, atestados (separados), colaboradores, lojas | Dashboards | 4.6 |
| 29 | Jornada totalmente editável (nome, dias, horas) | Jornadas cadastradas | RN-REG-10 |
| 30 | Várias lojas | Tela Lojas e filtro de lojas | 4.10, 4.11 |
| 31 | Férias | Tela Férias | 4.7 |
| 32 | Escala própria de domingo | Tela Domingos | 4.4 |
| 33 | Escala de almoço | Tela Escala de Almoço | 4.5 |
| 34 | Arrastar turnos para mudar a ordem | Alça ⠿ em Horários | 4.8 |
| 35 | Botão "limpar escala" e reversão | Limpar escala, meses em branco, Desfazer | RN-LIM, RN-DES |
| 36 | Regras avançadas | 13 regras extras | RN-RAV |
| 37 | Folgas distribuídas também por turno | Equilíbrio por turno e linhas por turno no Mês | RN-GER-06 |
| 38 | Copiar escala entre setores e lojas | Painel Copiar escala | RN-COP |
| 39 | Cores da escala, fontes; correção da cor "menos funcionários" | Cores por código, fontes, seletor de cor | 4.12.7/8, RN-COR-04 |
| 40 | Relatório de ajustes 01 — folga fixa no domingo (estagiários) | "Dom (não trabalha domingo)" | RN-FOL-06 |
| 41 | Relatório 02 — regra de domingo configurável, 2x1, prévia para o RH | Regra por loja/setor (1x1 a 4x1) com prévia | RN-DOM, 4.12.4 |
| 42 | Relatório 03 — "Aplicar sugestão" do almoço não gravava | Gravação corrigida, mensagem de confirmação, selo "Só hoje" | 4.5.3 |
| 43 | Relatório 04 — aplicar o horário da loja aos departamentos, preservando exceções | "Aplicar o horário da loja aos setores" | RN-HOR-09 |
| 44 | Relatório 05 — importação por planilha com modelo, prévia, duplicidade e erros por linha | Importar planilha | RN-IMP |
| 45 | Relatório 06 — conferir a cobertura (entradas, saídas, intervalos) | Faixa inteira; linhas "Chegam", "Saem", "No posto", "Em intervalo" | RN-COB-02, 4.5.5 |
| 46 | Atualização 2.0, itens 1 e 2 — estagiários em 6x1 e CLT em 5x2; o modelo da loja não deve mudar os setores | Regime por pessoa; setores com modelo próprio mantidos | RN-REG-02 |
| 47 | Atualização 2.0, item 3 — turno de estágio de 5h | "Horas trabalhadas" no turno | 4.8.1 |
| 48 | Atualização 2.0, item 4 — mudar o turno de domingo não refletia | Turno de domingo habitual corrige os domingos escalados | RN-DOM-10 |
| 49 | 28/10 — ajustar almoços à mão dia a dia | Almoços distribuídos automaticamente ao gerar | RN-ALM-02 |
| 50 | 28/10 — feriado fechado conta como uma das folgas | Opção ligada por padrão | RN-FER-02 |
| 51 | 28/10 — ninguém folga em 24/12 e 31/12 | Dias sem folga | RN-FER-04 |
| 52 | 28/10 — alerta de domingo sem dizer qual | Alertas com datas | RN-ALE-01 |
| 53 | Até duas folgas fixas por pessoa | 2ª folga fixa | RN-FOL-06 |
| 54 | Duplas de setores diferentes (regras 7 e 8) | Pessoas de qualquer setor | RN-RAV |
| 55 | Almoço linear entre 12h e 15h; ver por ordem de horário | Distribuição "linear"; "Ordem" na Escala de Almoço | RN-ALM-06/10 |
| 56 | Editar início e "até" do almoço | Campos editáveis; a saída anda junto (IN-15) | RN-ALM-11 |
| 57 | Área de setores ocupando espaço demais | Lista compacta | 4.12.2 |
| 58 | Documentação funcional completa | Este documento | — |
| 59 | Cobertura da semana com até 4 cores | Estilo "2 cores", "3 cores", "4 cores" ou degradê | RN-COR-01 |
| 60 | Configurar o % de cada cor | Uma linha por cor com "de X% a Y%" | RN-COR-01 |
| 61 | Mudar as datas na tela Domingos | "‹", "›" e "Ir para" | 4.4.1 |
| 62 | Ordenar a escala de domingo por pessoa ou turno | "Ordenar por" e cabeçalhos clicáveis | 4.4 |
| 63 | Linha grossa preta entre turnos na Semana, com opção de ligar/desligar | "Linha grossa entre turnos" | 4.2.5 |
| 64 | Escolher "para qual setor" valem as Regras avançadas | "Para qual setor"; regras próprias por setor | RN-RAV-03 |
| 65 | Almoço não respeitava a janela "de hora a tal hora", não distribuía de forma proporcional e não havia visão semanal | Janela obrigatória (vale mesmo quando as regras de posição não cabem), janela nova no modo "intervalo inteiro", horários usados contados entre janelas, janela também nos turnos de domingo, "Ver: Semana" na Escala de Almoço | RN-ALM-04/06, 4.5.7 |
| 66 | A ordem inicial deve ser sempre por horário de entrada | Semana abre em "Horário de entrada" e Mês em "Turno (horário de entrada)" | 4.2.5, 4.2.7 |
| 67 | Escolher a ordem nos almoços da semana | "Ordenar por" e Crescente/Decrescente em "Ver: Semana" | 4.5.7 |
| 68 | Tirar a função ("Operador(a) 10") do lado da escala | Escala de Almoço mostra só turno e horário; Domingos mostra o turno da semana no lugar da função | 4.4.1, 4.5.5 |
| 69 | Escolher o setor em cada opção das Regras avançadas | "Onde vale" em cada regra ligada | RN-RAV-04 |
| 70 | Na cópia de loja, copiar só as regras avançadas e a escala, sem funcionários | "Copiar de outra loja" e "Duplicar" sem funcionários; regras com os setores novos | RN-LOJ-01 |
| 71 | Deixar só o campo "de tal hora a tal hora" como referência do horário do intervalo | Horários: "Horário do intervalo: entre A e B"; distribuição sempre por igual dentro dele | 4.8.1, RN-ALM-04/06 |
| 72 | "A escala de almoço não está ajustando" | Almoços distribuídos sozinhos sempre que turnos, horário do intervalo, equipe ou período mudam (antes só ao "Gerar escala") | RN-ALM-02 |
| 73 | "Cores da escala" ocupando espaço demais | Versão compacta: uma linha por cor, em até 4 colunas | 4.12.8 |
| 74 | Regra 4 "Revezar o dia da folga" valer para todos os dias, não só sábado | Folgas de cada dia de segunda a sábado divididas por igual entre a equipe; domingo segue o rodízio de domingos | 3 (regras avançadas, item 4) |
| 75 | "Por que você está colocando folgas seguidas?" | Com a regra 1 desligada o gerador não tinha nenhuma preferência e colava folgas à toa. Agora prefere folgas separadas por padrão (desempate leve); em Fiscais de Caixa da Loja 1 as folgas coladas caíram de 20 para 1 com a mesma cobertura | 3.11 (1a) |
| 76 | "Não seria devido ter uma opção de preferência por folgas, juntas ou separadas (respeitando os dias que não podem)?" | Regras 1 e 1b viraram uma escolha só, "Preferência das folgas da semana": Separadas quando der (padrão) / Separadas sempre / Juntas quando der / Sem preferência; dias sem folga, limites e folgas fixas valem em todas | 3.11 (1), 4.12 |
| 77 | Escala de almoço: opção "rodízio ou variar turnos de almoço" ou "permanecer com o horário fixo" | Lista "Horário de cada pessoa" por setor: Rodízio (varia a cada dia, padrão) ou Horário fixo (sempre o mesmo, calculado com a equipe inteira) | 4.5.2, RN-ALM-06a |
| 78 | "Ele não respeita quando eu quero colocar a ordem crescente ou decrescente semanal" (Almoços da semana) | Causa: com todos entrando no mesmo horário, o desempate ficava sempre crescente, e "Horário do almoço (de sempre)" usava o horário do turno, igual para todos. Agora "Decrescente" inverte a lista inteira (também em Escala, Mês e Domingos) e a ordem por almoço usa o horário que a pessoa mais teve na semana | 4.5, 4.2, 4.4 |
| 79 | "Limpe todos os colaboradores e simule um supermercado com 100 colaboradores, teste todas as funções" | Loja 1 com 100 pessoas em 10 setores, todas em 5x2 a pedido do usuário (com estágio e aprendiz de 6h, pessoas-chave, folgas fixas, férias, atestado e falta). Teste completo pela tela: 69 verificações, todas certas; antes, uma rodada com 12x36 e 6x1 também foi testada. Defeitos achados e corrigidos: (1) com sábado sem folga e domingo escolhido pelo sistema, equipes de 20 pessoas ou mais não geravam (o limite automático de folgas por dia contava o domingo como livre); (2) 6x1 com folga só em alguns domingos dava erro sem explicação; agora explica e diz o que fazer | RN-GER-04, RN-GER-10 |
| 80 | "Deixe o descanso obrigatório como algo opcional do cliente preencher" | Regras avançadas, item 14 "Descanso mínimo entre jornadas ao gerar": campo em branco por padrão; preenchido, a geração respeita o descanso (Loja 1 simulada: descansos curtos de Fiscais e Açougue caem a zero) | 3.11 (14), 4.12 |
| 81 | Logo "Fábrica de Líderes" como marca do sistema | Logo no topo do menu, com "Simulador Escala 5x2" abaixo | 4.1 |
| 82 | "Regra para ligar/desligar se quem folga domingo também folga sábado, escolhendo a % de pessoas que podem tirar sábado e domingo juntos" | Regras avançadas 5b. Decisão (sugerida e aceita): com sábado sem folga e máximo de 6 dias seguidos, quem ganha o fim de semana inteiro folga também no domingo anterior | 3.11 (5b), 4.12 |
| 83 | "Na regra de horário de almoço, me permita cadastrar um horário fixo para cada pessoa, com a opção de rodízio ou não. Da maneira que está, está gerando erros" | Quadro "Horário de almoço de cada pessoa" (rodízio ou horário fixo por pessoa). Causa dos erros: o horário "de sempre" gravado em "Todos os dias" era sobrescrito dia a dia pela distribuição automática; agora vira horário fixo e é respeitado | 4.5, RN-ALM-06b |
| 84 | "Refaça o sistema de escala de almoço. Está muito ruim, bugado" | Escala de Almoço refeita: cada pessoa com horário fixo sugerido (espalhado para pouca gente almoçar junto), rodízio opcional por pessoa, "só neste dia" que o sistema não desfaz, visões Semana e Dia com os mesmos controles e a grade do dia inteiro. Causa do "ajuste não fica": a distribuição automática sobrescrevia as escolhas e a marca do dia não era gravada | 4.5, RN-ALM-01 a 13 |
| 85 | Regra 5b "crie a mesma função, mas para segunda-feira" | Regras avançadas 5c "Quem folga no domingo também folga na segunda", com % por domingo, revezamento e "Onde vale". Diferença da 5b: a segunda é folga da semana em que cai, então não precisa da folga no domingo anterior | 3.11 (5c), 4.12 |
| 86 | Ajuste de almoço sumia às vezes ao recarregar a página logo depois | Gravação na hora ao fechar, recarregar ou trocar de aba (RN-DAD-02) | 3.20 |
| 87 | "A Escala de férias eu não quero que tenha um campo de admissão... apenas o mês programado de férias (pode ter sistema de escolha automática)" | Férias sem admissão (saíram saldo, vencimento, situação e quitação): coluna "Mês programado", "Escolher meses automaticamente" (espalha cada setor pelos 12 meses seguintes, respeitando o limite simultâneo e separando a mesma função), mês tracejado no mapa. Decisão do usuário: o mês só anota o planejamento | 4.7, RN-FEV-11 |
| 88 | "Na programação das férias, ao invés de selecionar o mês... me permita abrir um calendário e escolher a data... de tal data até tal data" | Coluna "Férias programadas (de … até)" com dois calendários; escolha automática passa a dar o período (dia 1 ou 16, 30 dias); aviso de limite contando as programadas | 4.7.5, RN-FEV-11 |
| 89 | "Na parte Escala de almoço me permita definir o tempo de cada um almoçando" | Lista "tempo de almoço" por pessoa na coluna "Almoço" (do turno ou de 15 min a 4h); a saída anda junto, com as mesmas horas de trabalho; aviso pelo mínimo e máximo da loja | 4.5.2, RN-ALM-01 |
| 90 | "No cadastro da equipe, permita também eu definir o horário de almoço" | Coluna "Almoço" na tabela da Equipe: horário fixo e tempo de almoço de cada pessoa, os mesmos da Escala de Almoço | 4.3.4 |
| 91 | "Na tela escala do almoço, crie um gráfico embaixo da configuração"; "Faça um gráfico que mostre a quantidade de pessoas em tempo real na loja"; "o gráfico do almoço deve respeitar o setor escolhido… e ele fica embaixo da escala de almoço" | Gráfico "Pessoas trabalhando · {setor}" embaixo da Escala de Almoço: pessoas trabalhando no setor de 5 em 5 min, ao vivo no dia de hoje, detalhe por turno ao passar o mouse, "Ver agora (hoje)" | 4.5.3b |
| 92 | "Eu também gostaria de uma definição específica para o almoço do domingo" (escolha: por pessoa) | Linha "Domingo" na coluna Almoço: horário (ou automático) e tempo de almoço só do domingo; cria o almoço quando o turno de domingo não tem intervalo | 4.5.2, RN-ALM-06 |
| 93 | "Uma regra: se eu mudar o horário de alguém, ele deve responder em todos os demais comandos" | Regra RN-HOR: almoços conferidos em todas as lojas e setores a cada mudança, almoço escolhido mantido ao mudar turno/jornada/folgas quando cabe, almoço de domingo também no turno de domingo escolhido no dia; teste que muda o horário em cada tela e confere as outras | 3.19b |
| 94 | "Ative uma opção avançada: quando determinada pessoa estiver de folga, a pessoa que eu escolher irá para o turno dela, naquele dia de folga" | Regras avançadas 8b "Quem cobre a folga de quem": duplas titular → substituto; o substituto vai para o turno do titular nos dias de folga dele, na hora (também ao lançar folga à mão) e ao gerar; a geração evita folga dos dois no mesmo dia; marca de turno automático passou a ser gravada | 3.11 (8b), 4.12 |
| 95 | Regra 5b "não ficou bem desenvolvida… não está indo direito" e "as folgas do sábado devem haver um rodízio entre todos" | Rodízio dos sábados de folga sempre ligado; revezamento da 5b pelo menor número de fins de semana e menos chances; conta por extenso na tela; relatório de sábados e fins de semana por pessoa; a escala antiga sem fins de semana não é mais mantida ao gerar | 3.11 (5b′) |
| 96 | "Tire a regras avançadas da pasta personalizar, e crie uma aba somente pra ela no canto esquerdo" | Item "Regras avançadas" no menu lateral (entre Necessidade e Lojas) com tela própria; Personalizar ficou com um atalho para a nova aba | 4.1.2, 4.12.9 |
| 97 | "Faça todos os testes como se você fosse um novo usuário do sistema, e busque possíveis erros" | Corrigido: em notebooks (1366×768, 1280×720) os itens Horários, Necessidade, Lojas e Personalizar ficavam fora da tela no menu (menu compacto em telas baixas); dica antiga do menu Férias ("Programação, saldo e vencimento") trocada por "Quem sai quando". Melhorias encontradas foram apresentadas ao usuário para escolha, sem implementar | 4.1.2 |
| 98 | "Altere o nome 'necessidade' para 'Fluxo alto'" e "remova isso também" (aviso das Regras avançadas em Personalizar) | Tela e item do menu passam a se chamar "Fluxo alto" (título "Fluxo alto · {setor}", "Cores por: Fluxo alto (mínimo)", "Copiar escala": "Fluxo alto (pessoas por horário)" e demais textos que citavam a tela); o quadro "As Regras avançadas agora ficam numa aba própria" saiu de Personalizar | 4.1.2, 4.9, 4.12.9 |

### 11.7 Pontos pendentes de decisão ou de confirmação [PENDENTE]

**Decisões em aberto**

| # | Ponto | Situação atual |
|---|---|---|
| PD-01 | Perfis de usuário e permissões | Não existem; todos podem tudo |
| PD-02 | Ideal de pessoas, mínimo de pessoas no dia e limite oculto de folgas sem tela; a demonstração traz limites ocultos | Definir se viram campos ou se saem |
| PD-03 | Limites de cor (IN-01, IN-02) | Confirmar |
| PD-05 | Não há "desfazer fixação" de um dia | Definir se deve existir |
| PD-06 | Remanejamentos, coringas, postos e atividades sem tela | Definir se entram na versão simplificada |
| PD-07 | Referências legais e trabalhistas (IN-05, IN-20) | Confirmar com jurídico, RH e convenção |
| PD-08 | Validações ausentes (faixas invertidas/sobrepostas, turnos incoerentes, matrícula duplicada na Equipe) | Definir regras |
| PD-09 | Edição simultânea na página compartilhada sem controle de conflito | Definir estratégia |
| PD-11 | O PDF da semana ignora filtros de turno, função, busca e ordem; a coluna "Domingo" do Excel mostra o time só no 1x1 | Confirmar o esperado |
| PD-13 | Mudar a regra de domingo de uma pessoa na Equipe não refaz a escala (só na próxima geração) | Confirmar |
| PD-14 | O alerta de descanso entre jornadas aponta só a 1ª ocorrência por pessoa | Confirmar |
| PD-16 | Navegar para fora do período move o período (IN-13) | Confirmar |
| PD-17 | Falha ao carregar os dados cria a demonstração e grava por cima | Definir tratamento |
| PD-19 | A saída anda junto com a duração do almoço (IN-15) | Aguardando confirmação do usuário |
| PD-20 | Não existe "Refazer" depois de "Desfazer"; o histórico some ao recarregar | Confirmar |
| PD-21 | Mudar o modelo da loja entre 5x2 e 6x1 não refaz a escala (as semanas ficam com alertas de folgas até gerar) | Confirmar |
| PD-22 | A tela oferece regra de domingo até 4x1; jornadas de 1 a 6 dias | Confirmar os limites |

**Comportamentos observados no protótipo que podem não corresponder ao pretendido** (registrados sem correção, conforme pedido nesta etapa):

| # | Comportamento | Onde |
|---|---|---|
| OB-01 | Ao gerar a escala, a duração de intervalo "só neste dia" **se perde**, e a marca de turno automático também: o turno do dia trocado pelas regras 11 e 12 na geração anterior continua na célula, mas sem a marca, e passa a ser tratado como escolhido à mão (não é desfeito nas gerações seguintes) | RN-GER-12, RN-RAV-01 |
| OB-02 | Resolvido em 07/11/2026: a marca de turno automático passou a ser gravada ("~" no mapa de turnos do dia), junto com a duração e o horário "só neste dia" (06/11/2026) | RN-DAD-03 |
| OB-03 | Violações de dia fixo e de regras avançadas aparecem com o título "Limite diário" | RN-ALE-02, 8.2 |
| OB-04 | Aplicar a regra de domingo **da loja** refaz a escala de todos os setores, inclusive os que têm regra própria | 4.12.4 |
| OB-05 | "Voltar todos ao intervalo do turno" e "Voltar ao intervalo do turno" não apagam a duração de sempre própria da pessoa | RN-ALM-12 |
| OB-06 | Itens resolvidos desde a v23: folga fixa travada (antigo PD-04); "+ Outra loja" substituída pela tela Lojas (PD-10); sugestão de intervalo aponta para a Escala de Almoço (PD-12); distribuição por dia inclui domingos e feriados (PD-15); versão para Mac entregue (PD-18) | — |

---

## Apêndice A — Loja de demonstração [FICTÍCIO]

Criada na primeira abertura (RN-DAD-06) e em Personalizar → Dados → "Restaurar exemplo de demonstração" (que mantém o identificador e a data de início da loja em uso).

### A.1 Loja e configuração

| Item | Valor |
|---|---|
| Loja / rede | "Loja 1 — Centro" / "Rede Bom Preço" |
| Período | Começa na segunda-feira (hoje, se for segunda; senão a próxima); 4 semanas; semana começa na segunda |
| Funcionamento | Seg–Sáb 08:30–19:00; domingo aberto 08:30–12:15; sem feriados; sem dias sem folga |
| Modelo / jornada / limite | 5x2; 8h24 por dia; 42h por semana |
| Regra de domingo | 1x1 (domingo sim, domingo não) com todos os setores divididos em Time A e Time B |
| Referências | 6 dias seguidos; domingos: mulheres 1 a cada 2, demais 1 a cada 3; descanso 11h; jornada máxima 10h; intervalo de 1h a 2h |
| Tema / faixa | Roxo e lilás / 30 min |
| Regras avançadas extras, jornadas, regras de férias | Valores iniciais (regras extras desligadas; nenhuma jornada; férias pela CLT) |

### A.2 Setores, turnos e equipe

Visíveis (com pessoas), nesta ordem e cor: Frente de Caixa (#2a78d6), Fiscais de Caixa (#eb6834), Açougue (#1baf7a), Padaria (#eda100), Hortifruti (#e87ba4), Reposição (#008300). Escondidos: Empacotadores, Frios, Depósito, Limpeza, Prevenção de Perdas, Outros (cada um com os turnos iniciais Abertura, Tarde e Domingo).

| Setor | Pessoas | Turnos normais (entrada · início do intervalo · duração) | Turno de domingo |
|---|---|---|---|
| Frente de Caixa | 17 | Abertura 08:15 · 10:30 · 2h; Tarde A 08:45 · 13:00 · 2h; Tarde B 09:15 · 12:30 · 1h30; Intermediário 10:30 · 14:30 · 1h | Domingo 08:15, 4h |
| Fiscais de Caixa | 3 | Abertura 08:00 · 12:00 · 1h30; Fechamento 10:30 · 14:30 · 1h30 | Domingo 08:15, 4h |
| Açougue | 9 | Abertura 07:30 · 11:30 · 1h30; Tarde 09:45 · 13:30 · 1h30 | Domingo 08:00, 4h |
| Padaria | 9 | Forno 06:00 · 10:00 · 1h; Balcão 10:00 · 14:00 · 1h30 | Domingo 08:00, 5h |
| Hortifruti | 8 | Abertura 07:00 · 11:00 · 1h; Tarde 10:00 · 14:00 · 1h30 | Domingo 07:30, 4h |
| Reposição | 14 | Madrugada 06:00 · 10:30 · 1h; Manhã 07:30 · 12:00 · 1h30; Tarde 10:00 · 14:00 · 1h30 | Domingo 07:00, 4h |

Todos os turnos usam a jornada da loja (8h24), sem janela de intervalo e com limite de 1h para mover o intervalo.

**Pessoas (60):** nomes gerados; matrículas a partir de 1700; proporção de mulheres: Caixa 80%, Fiscais 50%, Açougue 20%, Padaria 50%, Hortifruti 40%, Reposição 30%; turnos em rodízio; contrato de 42h; CLT; sem admissão; divididas em Time A e Time B por turno.

**Exemplos embutidos:**
- Frente de Caixa: a 4ª pessoa tem folga fixa na terça, a 8ª na quarta e a 12ª não trabalha domingo. A função é "Operador(a) N".
- Fiscais são coringas e habilitados para a Frente de Caixa; o Hortifruti é habilitado para Reposição.
- Remanejamento: o 1º fiscal conta na Frente de Caixa aos sábados das 11:00 às 13:00 (posto "Caixa 20", "Apoio no pico de sábado") [MOTOR-SEM-TELA].
- Atividade: a 1ª operadora fica de segunda a sexta das 18:15 às 18:39 em "Fechamento de caixa" e não conta no posto [MOTOR-SEM-TELA].

### A.3 Necessidade (mínimo de pessoas)

| Setor | Segunda a sexta | Sábado | Domingo |
|---|---|---|---|
| Frente de Caixa | 08:30–09:30 3; 09:30–12:00 6; 12:00–14:00 7; 14:00–17:00 6; 17:00–19:00 8 | 08:30–09:00 4; 09:00–13:00 9; 13:00–19:00 8 | 08:30–09:00 3; 09:00–12:00 6 |
| Fiscais de Caixa | Seg–Sáb 09:00–18:00 1 (em "Exceções", porque o conjunto seg–sáb não é um grupo) | (idem) | 09:00–12:00 1 |
| Açougue | 08:30–19:00 3 | 08:30–19:00 4 | 08:30–12:00 2 |
| Padaria | Seg–Sáb 08:30–14:00 3; 14:00–19:00 2 (em "Exceções") | (idem) | 08:30–11:30 2 |
| Hortifruti | Seg–Sáb 08:30–12:00 3; 12:00–19:00 2 (em "Exceções") | (idem) | 08:30–11:30 2 |
| Reposição | Seg–Sáb 08:30–12:00 6; 12:00–17:00 4; 17:00–19:00 3 (em "Exceções") | (idem) | 08:30–11:00 3 |

O "ideal" de todas as faixas é zerado na versão simplificada.

### A.4 Movimento e limites ocultos de folga (PD-02)

| Setor | Dom | Seg | Ter | Qua | Qui | Sex | Sáb |
|---|---|---|---|---|---|---|---|
| Frente de Caixa (intensidade / máx. folgas) | médio / — | médio / 5 | fraco / 6 | fraco / 6 | médio / 5 | forte / 4 | forte / 2 |
| Açougue | médio / — | fraco / 3 | fraco / 3 | fraco / 3 | médio / 2 | forte / 2 | forte / — |
| Demais setores (intensidade) | fraco | fraco | fraco | médio | médio | forte | forte |

As intensidades são recalculadas na primeira mudança de necessidade do setor (RN-NEC-04). Os máximos de folga continuam valendo e sobem sozinhos quando não cabem (RN-GER-04).

---

## Apêndice B — Outras versões e artefatos (fora do escopo)

| Artefato | Descrição | Relação com este documento |
|---|---|---|
| Versão completa do simulador (página "Simulador de Escala 5x2" e programa "Escala 5x2" para Windows) | Primeira versão: cabeçalho editável, calendário de até 8 semanas, tabela "Movimento e limite de folgas" (intensidade, máximo de folgas e mínimo de pessoas), cobertura de 15/30 min, "Mínimo de pessoas no posto" com ideal, coringas e remanejamentos, alocação por posto, comparador 5x2 × 6x1, rede de lojas | Usa o mesmo motor. As telas da versão simplificada não existem nela. Os dois programas para Windows usam o mesmo arquivo de dados e não devem ficar abertos ao mesmo tempo |
| Serviço de otimização (FastAPI + SQLite + OR-Tools CP-SAT) | Armazenamento em servidor e otimizador exato | Só com servidor configurado (RN-GER-14) |
| Material de divulgação (slide e vídeo) | Fora do produto | — |
