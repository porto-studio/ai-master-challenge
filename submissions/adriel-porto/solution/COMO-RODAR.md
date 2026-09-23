# Como rodar

Tudo aqui roda local, sem instalar servidor, banco nem conta em serviço nenhum. Os 5 CSVs já estão em `dashboards/data/` — cópia fiel dos arquivos do Kaggle ([dataset, licença MIT](https://www.kaggle.com/datasets/rivalytics/saas-subscription-and-churn-analytics-dataset)), conferida por MD5 e nunca alterada por nenhuma ferramenta desta pasta.

## Só ler (não precisa rodar nada)

- **`RELATORIO_DIAGNOSTICO_CHURN.md`** — abre no GitHub, com os gráficos. Também em `.pdf`.
- **`tabelas/12_contas_em_risco_31dez2024.csv`** — as 500 contas em ordem de prioridade. Abre no Excel ou no Google Sheets. É o que o CS usaria amanhã.

## As 2 ferramentas

São páginas estáticas (HTML + JavaScript, sem framework e sem dependência) que leem os CSVs por `fetch` — então precisam de um servidor local. Duplo clique no arquivo **não** funciona: o navegador bloqueia leitura de arquivo local.

```bash
cd dashboards
python3 -m http.server 8787
```

| Ferramenta | Endereço | O que faz |
|---|---|---|
| **Diagnóstico + origem do churn** | http://localhost:8787/dashboard-churn-004-origem/ | Filtro em funil progressivo (cada recorte salvo filtra quem sobrou do anterior) e 7 seções que recalculam ao vivo. Aplica a metodologia própria: entrada real vs trial, upgrade/downgrade datado no dia exato e **cancelamento medido por valor perdido, não por quantidade** |
| **Origem do tráfego × churn** | http://localhost:8787/dashboard-churn-005-trafego/ | Faturamento real por `referral_source` + simulação de investimento em Ads. É a prova numérica de `docs/ORIGEM_TRAFEGO_E_ATRIBUICAO.md` |

A primeira também aceita upload manual de outros CSVs (botão no topo), e a aba de qualidade de dados refaz os testes de integridade contra o arquivo que estiver carregado.

> Foram 5 iterações de ferramenta no total; as 3 primeiras eram versões destas duas e não estão publicadas para não fazer ninguém ler o mesmo código três vezes. O caminho está contado em `../process-log/COMO-TRABALHEI.md`.

## Reproduzir os números

Rode sempre a partir desta pasta (`solution/`) — os caminhos são relativos ao próprio script.

```bash
python3 scripts/definicoes.py      # as 3 definições de churn, por dimensão
python3 scripts/diagnostico.py     # gera as 12 tabelas de tabelas/
python3 scripts/modelo.py          # a regressão logística com validação no tempo
```

A saída de cada um está salva em `saidas_dos_scripts/`, como saiu em 15/09/2026. Para conferir que reproduz:

```bash
python3 scripts/definicoes.py | diff - saidas_dos_scripts/definicoes_out.txt && echo "idêntico"
```

O cruzamento uso × suporte é a mesma ideia:

```bash
python3 cruzamento-uso-x-tickets/01_integridade.py     # ... até o 06_
```

**Dependências:** `numpy` para `definicoes.py`, `diagnostico.py` e `modelo.py` · `matplotlib` para `graficos.py` · `pandas` + `numpy` para os scripts do cruzamento · Chrome instalado para `md2pdf.py` · nada além da biblioteca padrão para `churn_analise.py` e `explora2.py`.

```bash
pip3 install pandas numpy matplotlib
```

**Nota:** `scipy` não estava instalado na máquina onde isto foi feito, então Mann-Whitney, qui-quadrado e Spearman foram implementados à mão em `stats_min.py` e **não** foram conferidos contra o `scipy`. Está declarado também no §5 do `RESULTADO_CRUZAMENTO.md`.

Testado em macOS com Python 3.14.
