# Cruzamento `feature_usage` × `support_tickets` — RavenStack (Challenge 001)

**Data:** 15/09/2026
**Fonte dos dados:** `~/github/dataset-001-raw/` (5 CSVs originais do Kaggle, nenhum alterado)
**Scripts que geram tudo abaixo:** `01_integridade.py` … `06_direcoes_e_assinatura.py` (nesta mesma pasta)
**Saída bruta dos 6 scripts:** `saida_bruta.txt`
**Escopo:** só o cruzamento das duas tabelas pedido no README do desafio. Nada foi escrito em `~/github`.

---

## 0. Como as duas tabelas se ligam

`feature_usage` **não** tem `account_id`. A ligação é:

```
feature_usage.subscription_id → subscriptions.subscription_id → subscriptions.account_id → support_tickets.account_id
```

Checagens de integridade (script 01):
- 0 órfãos nas 4 chaves (`feature_usage→subscriptions`, `support_tickets→accounts`, `subscriptions→accounts`, `churn_events→accounts`).
- 500 contas: **500 têm uso**, **492 têm ticket**, **492 têm os dois**, 8 contas sem nenhum ticket.
- 4.967 das 5.000 assinaturas têm uso; 33 assinaturas sem nenhum registro de uso.
- Janela dos dados: uso 01/01/2023 a 31/12/2024; tickets 02/01/2023 a 31/12/2024.

---

## 1. Resultado central do cruzamento

**Não há relação estatística detectável entre uso de features e tickets de suporte, nem de um deles com churn**, em nenhum dos cortes testados.

### 1.1 Volume (por conta, vida toda) — script 04-A
Correlação de Spearman entre as métricas das duas tabelas:

| Par | rho | p |
|---|---|---|
| erros de uso × nº de tickets | −0,010 | 0,816 |
| volume de uso × nº de tickets | −0,048 | 0,282 |
| taxa de erro × nº de tickets | +0,056 | 0,215 |
| erros × escalações | +0,067 | 0,132 |
| taxa de erro × satisfação | −0,027 | 0,555 |
| eventos beta × nº de tickets | −0,000 | 0,999 |

Quartis de erro acumulado por conta (Q1 = 14 erros médios → Q4 = 45 erros médios): tickets médios **4,09 · 3,97 · 3,91 · 4,03**. Q1 vs Q4, p = 0,956.

### 1.2 Tempo (o erro antecede o ticket?) — script 04-B
Para cada um dos 2.000 tickets, o uso da própria conta nos 7 dias anteriores, comparado com uma data-placebo sorteada na mesma conta:

| 7 dias antes | Antes do ticket | Data aleatória | p |
|---|---|---|---|
| eventos de uso | 0,451 | 0,484 | 0,132 |
| erros | 0,241 | 0,287 | 0,052 |
| usos (`usage_count`) | 4,559 | 4,832 | 0,169 |

- 65,0% dos tickets **não têm nenhum uso registrado** nos 7 dias anteriores (placebo: 62,5%).
- 12,7% dos tickets têm algum erro nos 7 dias anteriores (placebo: 14,8%).
- Tickets escalados (n=95) e high/urgent (n=1.024): mesma ausência de diferença (p = 0,17 e 0,16).

A diferença que existe aponta para o lado contrário do esperado (menos erro antes do ticket do que numa data qualquer) e não é significativa.

### 1.3 Por feature — script 04-C/D
- Maior sobre-representação nos 7 dias antes de um ticket: `feature_33` (+0,91 pp), `feature_14` (+0,81 pp), `feature_11`/`feature_24` (+0,76 pp) — com n de 29 a 31 eventos cada. Diferenças dessa ordem, com esse n, não sustentam ranking de feature problemática.
- Taxa de erro por feature varia só de **4,70%** (`feature_20`) a **6,56%** (`feature_4`); média global 5,63%.
- Beta vs não-beta: taxa de erro 5,54% vs 5,64%. Eventos beta são 12,75% do uso nos 7 dias antes de um ticket contra 10,18% do uso geral.

### 1.4 O ticket derruba o uso depois? — script 06-I
Uso 30 dias antes × 30 dias depois de cada ticket: **20,35 → 19,66 (−3,4%)**, p = 0,255.
Único recorte com p < 0,05: tickets com resolução > 48h (n=675), −9,1%, p = 0,041. Com 4 comparações feitas nesse bloco, esse valor está no limite do que se espera por acaso.

### 1.5 O ticket ruim antecede churn? — script 06-J
Base: 12,9% dos 2.000 tickets são seguidos de um `churn_event` na mesma conta em até 90 dias.

| Recorte do ticket | n | churn em 90d | demais | p |
|---|---|---|---|---|
| escalado | 95 | 13,7% | 12,9% | 0,939 |
| high/urgent | 1.024 | 12,9% | 12,9% | 1,000 |
| satisfação 4-5 | 779 | 13,0% | 12,9% | 0,999 |
| satisfação não respondida | 825 | 12,7% | 13,0% | 0,900 |
| resolução > 48h | 675 | 12,9% | 12,9% | 1,000 |
| 1ª resposta > 120 min | 653 | 13,6% | 12,5% | 0,544 |

---

## 2. Churn × uso × suporte, com as 3 definições de churn

As três definições de churn do dataset são incompatíveis entre si (script 01):

| Definição | Contas |
|---|---|
| D1 — `accounts.churn_flag = True` | 110 |
| D2 — tem ≥1 registro em `churn_events` | 352 |
| D3 — assinatura mais recente já encerrada | 46 |

Interseções: D1∩D2 = 75 · D1∩D3 = 12 · D2∩D3 = 34 · D1∩D2∩D3 = **7**.

### 2.1 Janela fixa de 90 dias antes do evento — script 03
(churn = 90 dias antes do 1º `churn_event`; quem ficou = 90 dias antes de 31/12/2024)

| Métrica | Ficou | Churn | p |
|---|---|---|---|
| eventos de uso | 6,36 | 6,30 | 0,609 |
| `usage_count` | 63,96 | 62,77 | 0,538 |
| dias ativos | 6,07 | 6,09 | 0,787 |
| features distintas | 5,89 | 5,82 | 0,632 |
| erros | 3,16 | 3,54 | 0,635 |
| taxa de erro | 5,27% | 5,93% | 0,638 |
| eventos beta | 0,72 | 0,56 | 0,063 |
| nº de tickets | 0,520 | 0,528 | 0,761 |
| escalações | 0,027 | 0,020 | 0,621 |
| resolução (h) | 33,94 | 34,29 | 0,985 |
| 1ª resposta (min) | 84,79 | 86,86 | 0,686 |
| satisfação | 3,98 | 4,05 | 0,591 |

Nenhuma diferença significativa. A janela de 180 dias dá o mesmo resultado (todos os p entre 0,51 e 0,98).
Contas sem nenhum uso nos 90 dias: 0,7% (ficou) vs 1,1% (churn), p = 1,000. Sem nenhum ticket: 59,5% vs 57,4%, p = 0,742.

### 2.2 Poder de separação (AUC) — script 05-G

| Variável | D1 | D2 | D3 |
|---|---|---|---|
| `usage_count` | 0,540 | 0,512 | **0,609** (p = 0,015) |
| erros | 0,509 | 0,520 | 0,587 (p = 0,052) |
| nº de tickets | 0,471 | 0,486 | 0,522 |
| satisfação média | 0,520 | 0,506 | 0,486 |
| escalações | 0,518 | 0,523 | 0,531 |

AUC 0,50 = mesma capacidade de separar churn que jogar uma moeda. Os dois valores de D3 são os únicos fora do ruído entre 15 testes, e apontam para **mais uso e mais erros** nas contas em churn — direção oposta à hipótese usual de abandono. Com 15 comparações, 1 resultado com p < 0,05 é o que se espera por acaso (não verificado com correção de múltiplas comparações).

### 2.3 Quadrante uso × tickets — script 05-F

| Quadrante | Contas | Churn D1 | Churn D2 | Churn D3 |
|---|---|---|---|---|
| uso alto + poucos tickets | 155 | 25,2% | 71,0% | 12,3% |
| uso alto + muitos tickets | 95 | 25,3% | 70,5% | 11,6% |
| uso baixo + poucos tickets | 152 | 21,7% | 71,1% | 4,6% |
| uso baixo + muitos tickets | 98 | 14,3% | 68,4% | 9,2% |

"Uso baixo + muitos tickets" (o quadrante clássico de risco) tem a **menor** taxa de churn D1 da tabela: 14,3% contra 21,7%-25,3%. p = 0,055.

### 2.4 Nível assinatura — script 06-K
Assinaturas encerradas (486) vs ativas (4.514): uso, erros, taxa de erro, dias ativos e beta praticamente iguais (p de 0,35 a 0,65). `upgrade_flag` 9,5% vs 10,7%; `downgrade_flag` 5,1% vs 4,3%; `auto_renew` 80,2% vs 80,1%.
A única diferença grande — uso por 30 dias 161,7 vs 64,1 — é artefato mecânico: a assinatura encerrada dura metade do tempo (88 vs 169 dias) com o mesmo número de eventos de uso (4,9 vs 5,0).

---

## 3. As duas falas do CEO, checadas no dado — script 05-E

**"O time de produto diz que o uso da plataforma cresceu":** não se sustenta no agregado. O uso é **plano** nos 24 meses — entre 9.468 e 11.450 `usage_count` por mês, sem tendência. Primeiros 6 meses 62.477 → últimos 6 meses 63.522 (**+1,7%**). Contas ativas no uso oscilam entre 409 e 440, sem tendência.

**"O time de CS diz que a satisfação está ok":** se sustenta — e é impossível ela não estar. `satisfaction_score` só assume os valores **3, 4 e 5** (396 · 405 · 374), mais 825 nulos (41,2%). **Não existe uma única nota 1 ou 2 no dataset**, apesar de o schema oficial dizer "1–5". A média mensal fica entre 3,73 e 4,36 o tempo todo; primeiros 6 meses 4,000 → últimos 6 meses 4,009.

**O que de fato muda:** os `churn_events` saem de 0-5 por mês no começo de 2023 para **117 em dezembro/2024** — enquanto uso, tickets (70-98/mês), taxa de erro (5,0%-6,3%) e satisfação ficam constantes. Correlação mensal tickets por conta ativa × churn_events: rho = 0,296, p = 0,146.

---

## 4. Qualidade de dados encontrada neste cruzamento

1. **`usage_id` não é único:** 21 IDs aparecem 2 vezes, em 42 linhas que são **eventos diferentes** (outra assinatura, outra data, outra feature). O schema diz "Unique usage event". Rodando tudo com e sem remoção dessas 21 linhas, os resultados não mudam (AUC muda na 3ª casa).
2. **`satisfaction_score` sem notas 1 e 2** (item 3) e com 41,2% de nulos.
3. **Distribuições uniformes em `support_tickets`:** prioridade 514/510/491/485 nos 4 níveis; resolução espalhada de 1h a 72h (mediana 35h); 1ª resposta de 1 a 180 min (mediana 88). Escalação em 4,8% dos tickets.
4. **Satisfação não varia com nada:** por prioridade 3,94-4,02; escalado 4,08 vs não escalado 3,98.
5. As 3 definições de churn do dataset se contradizem (seção 2) — só 7 contas satisfazem as três.

---

## 5. Limites desta análise

- Tudo aqui é **correlação**. Nenhum teste feito estabelece causa.
- O dataset é declaradamente sintético (README do Kaggle: gerado em Python/ChatGPT, com edge cases plantados). A ausência de sinal pode ser propriedade do gerador, não um achado sobre um negócio real. **Não verificado** qual das duas coisas é.
- Testes usados: Mann-Whitney U (aproximação normal com correção de empates), qui-quadrado 2×2 com correção de Yates, Spearman com aproximação normal — implementados em `stats_min.py` porque `scipy` não está instalado nesta máquina. Não conferidos contra o `scipy`.
- Nenhuma correção para múltiplas comparações foi aplicada. Foram ~45 testes no total.
- A janela de observação por conta usa o **1º** `churn_event` como corte; contas com reativação (10% do dataset) têm uso e tickets depois desse corte que ficaram de fora das seções 2.1 e 2.2.
