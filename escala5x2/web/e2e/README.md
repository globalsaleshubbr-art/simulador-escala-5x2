# Testes de navegador

Simulam uma pessoa usando o sistema (cliques, filtros, lançamentos) no arquivo gerado `dist/simples-local.html`.

```
cd web
node scripts/build-standalone.mjs
python3 e2e/run_all.py
```

Requer Python 3 com `pip install playwright` e `python3 -m playwright install chromium`.

| Arquivo | O que testa |
|---|---|
| test_melhorias.py | cores, segunda loja, filtros por loja, domingos, almoço, copiar escala, persistência, celular |
| test_filtro_lojas.py | filtro de loja em todas as telas, dashboards, seletor de loja em Horários/Necessidade |
| test_cadastro_lojas.py | tela Lojas: criar uma ou várias, copiar estrutura ou tudo, em branco, renomear, duplicar, excluir |
| test_faltas.py | lançar faltas, ranking, filtros, Excel, várias lojas |
| test_atestados.py | lançar atestados (Semana e Mês), ranking separado das faltas |
| test_ferias.py | programar, alterar e remover férias, mapa, saldo, filtros, regras |
| test_ajustes.py | nada é refeito sozinho ao abrir, intervalo só de um dia, filtro de loja único, férias a confirmar |
| test_exportacoes.py | PDF da semana, PDF do mês, PDF por pessoa e Excel com duas lojas |
| test_cores_cobertura.py | cores escolhidas no mapa de cobertura (3 faixas e degradê) |

Os testes do motor (escala, folgas, férias, faltas, cópias) ficam em `tests/` e rodam com `npx vitest run`.
