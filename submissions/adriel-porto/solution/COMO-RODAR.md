# Como rodar

Tudo nesta pasta roda localmente, sem instalar servidor, banco ou conta em serviço nenhum. Os 5 CSVs do dataset já estão em `dashboards/data/` — são cópia fiel dos arquivos do Kaggle (conferido por hash MD5), nunca alterados por nenhuma ferramenta daqui.

> Fonte dos dados: [SaaS Subscription & Churn Analytics](https://www.kaggle.com/datasets/rivalytics/saas-subscription-and-churn-analytics-dataset) — licença MIT.

---

## 1. Ler o relatório (não precisa rodar nada)

`RELATORIO_DIAGNOSTICO_CHURN.md` — abre direto no GitHub, com os gráficos.
`RELATORIO_DIAGNOSTICO_CHURN.pdf` — mesma coisa em PDF, para leitura fora do GitHub.

Para o time de CS usar amanhã, sem ferramenta nenhuma: `tabelas/12_contas_em_risco_31dez2024.csv` abre no Excel ou no Google Sheets, com as 500 contas em ordem de prioridade.

---

## 2. Abrir as 5 ferramentas

São páginas estáticas (HTML + JavaScript, sem framework e sem dependência). Elas leem os CSVs por `fetch`, então precisam de um servidor local — abrir o arquivo com duplo clique **não** funciona (o navegador bloqueia leitura de arquivo local).

A partir desta pasta (`solution/`):

```bash
cd dashboards
python3 -m http.server 8787
```

E abra no navegador:

| Ferramenta | Endereço |
|---|---|
| 001 — leitor genérico de CSV | http://localhost:8787/dashboard-churn-001/ |
| 002 — diagnóstico com a metodologia própria | http://localhost:8787/dashboard-churn-002-diagnostico/ |
| 003 — funil progressivo | http://localhost:8787/dashboard-churn-003-funil/ |
| 004 — origem do churn | http://localhost:8787/dashboard-churn-004-origem/ |
| 005 — faturamento por origem + simulação de Ads | http://localhost:8787/dashboard-churn-005-trafego/ |

As ferramentas 002, 003 e 004 também aceitam upload manual dos CSVs (botão no topo), caso você queira testar com outro arquivo. A 001 funciona **só** por upload — é um leitor genérico, serve para qualquer CSV.

Para parar o servidor: `Ctrl+C`.

---

## 3. Reproduzir os números do relatório

Rode sempre a partir desta pasta (`solution/`) — os caminhos são relativos ao próprio script.

```bash
python3 scripts/definicoes.py       # as 3 definicoes de churn, por dimensao
python3 scripts/explora2.py         # exploracao das 5 tabelas
python3 scripts/churn_analise.py    # analise base
python3 scripts/diagnostico.py      # gera as 12 tabelas de tabelas/
python3 scripts/modelo.py           # regressao logistica com validacao no tempo
```

A saída de cada um está salva em `saidas_dos_scripts/`, exatamente como saiu em 15/09/2026. Para conferir que reproduz:

```bash
python3 scripts/definicoes.py | diff - saidas_dos_scripts/definicoes_out.txt && echo "idêntico"
```

**Dependências, script por script:**

| Script | Precisa de |
|---|---|
| `churn_analise.py`, `explora2.py` | nada — só a biblioteca padrão |
| `definicoes.py`, `diagnostico.py`, `modelo.py` | `numpy` |
| `graficos.py` (regenera os 6 PNGs) | `matplotlib` |
| `md2pdf.py` (regenera o PDF) | Google Chrome instalado (usa o modo headless) |
| `cruzamento-uso-x-tickets/*.py` | `pandas` + `numpy` |

```bash
pip3 install pandas numpy matplotlib
```

---

## 4. Reproduzir o cruzamento uso × suporte

```bash
python3 cruzamento-uso-x-tickets/01_integridade.py
python3 cruzamento-uso-x-tickets/02_painel_conta.py      # gera painel_conta.csv
python3 cruzamento-uso-x-tickets/03_janela_fixa_e_testes.py
python3 cruzamento-uso-x-tickets/04_uso_x_tickets.py
python3 cruzamento-uso-x-tickets/05_segmentos_tempo_auc.py
python3 cruzamento-uso-x-tickets/06_direcoes_e_assinatura.py
```

Saída completa em `cruzamento-uso-x-tickets/saida_bruta.txt` e leitura em `RESULTADO_CRUZAMENTO.md`.

**Nota de honestidade:** `scipy` não está instalado na máquina onde isto foi feito, então Mann-Whitney, qui-quadrado e Spearman foram implementados à mão em `stats_min.py` e **não** foram conferidos contra o `scipy`. Está declarado também no §5 do `RESULTADO_CRUZAMENTO.md`.

---

## 5. Estrutura da pasta

```
solution/
├── RELATORIO_DIAGNOSTICO_CHURN.md   ← o deliverable principal
├── RELATORIO_DIAGNOSTICO_CHURN.pdf
├── COMO-RODAR.md                    ← este arquivo
├── graficos/                        ← 6 PNGs usados no relatório
├── tabelas/                         ← 12 CSVs, um por tabela do relatório
├── scripts/                         ← código que gera o relatório (Python)
├── saidas_dos_scripts/              ← saída bruta de cada script
├── cruzamento-uso-x-tickets/        ← feature_usage × support_tickets: scripts + resultado
└── dashboards/                      ← as 5 ferramentas + data/ com os 5 CSVs
```

Testado em macOS com Python 3.14.
