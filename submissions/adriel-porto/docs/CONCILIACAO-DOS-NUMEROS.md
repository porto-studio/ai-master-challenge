# Conciliação dos números — por que dois documentos desta pasta contam diferente

Esta submissão tem três análises feitas em momentos diferentes, com regras de contagem diferentes:

| Análise | Arquivo | Regra de contagem |
|---|---|---|
| Diagnóstico principal | `solution/RELATORIO_DIAGNOSTICO_CHURN.md` | MRR perdido por período, fotos trimestrais, testes de significância |
| Cruzamento uso × suporte | `solution/cruzamento-uso-x-tickets/RESULTADO_CRUZAMENTO.md` | correlação entre tabelas, por conta e por ticket |
| Ferramentas de leitura | `solution/dashboards/` | valor cancelado por episódio, entrada real vs trial |

Quem ler os três de seguida vai achar números que não batem. **Eles não batem de propósito — cada um responde uma pergunta diferente.** Esta página existe para que ninguém tenha que adivinhar qual é o certo.

---

## 1. "A última assinatura da conta já terminou": 45 ou 46 contas?

- `solution/scripts/definicoes.py` → **45**
- `solution/cruzamento-uso-x-tickets/01_integridade.py` → **46**

**Causa, verificada em 23/09/2026:** os dois pegam "a assinatura mais recente da conta" pela `start_date`, mas **21 contas têm duas ou mais assinaturas começando no mesmo dia**, e aí cada script desempata de um jeito (um pega a primeira da lista, o outro pega a última depois de ordenar).

Em **6 dessas 21 contas, as assinaturas empatadas têm desfechos opostos no mesmo dia** — uma encerrada e outra aberta. Exemplo literal do dado:

```
A-db5e9e  S-984f8b  início 2024-12-28  fim 2024-12-28  churn_flag True
A-db5e9e  S-23587d  início 2024-12-28  fim (vazio)      churn_flag False
```

A conta `A-0b0d6d` tem **8 assinaturas abertas no mesmo 31/12/2024**, uma delas encerrada no próprio dia.

**Leitura:** a diferença de 1 conta não muda conclusão nenhuma, mas a causa dela é o próprio achado central do relatório — **o dado não consegue dizer sozinho quem cancelou.** Quando uma regra de desempate legítima muda a resposta, o problema não é o script, é a definição de churn da empresa (ação 2 do relatório).

Reproduzível: `python3 scripts/definicoes.py` e `python3 cruzamento-uso-x-tickets/01_integridade.py`, ambos a partir de `solution/`.

---

## 2. "O uso cresceu": +1,1% ou +1,7%?

- Relatório: **+1,1%** — ano de 2023 (124.561) contra 2024 (125.964).
- Cruzamento: **+1,7%** — primeiros 6 meses (62.477) contra últimos 6 meses (63.522).

Janelas diferentes, mesma conclusão: **o uso é plano**. Nenhuma das duas sustenta a frase do time de produto.

---

## 3. Dashboards: "91% do valor perdido vem de quem entra direto" × relatório: "trial não é significativo"

Isto parece contradição e não é. São duas perguntas diferentes:

- **Dashboard (fatia):** de todo o valor cancelado, quanto veio de conta sem trial → **91%**.
- **Relatório (taxa):** quem entra sem trial cancela *proporcionalmente* mais do que quem entra por trial → **não** (p = 0,318 no z-test, 0,349 na permutação).

As duas coisas convivem porque **403 das 500 contas (80,6%) já são de entrada direta**. Um grupo que é 80,6% da base responder por 91% do valor perdido não é, por si só, sinal de risco maior — é quase o tamanho dele.

**Como usar cada uma:** a fatia serve para priorizar esforço de CS (é ali que está o dinheiro). A taxa serve para decidir política de aquisição (e ela diz para **não** mexer no trial com base nesses dados).

---

## 4. Três definições de churn, três respostas

O relatório (§1.1) e o cruzamento (§2) chegam no mesmo lugar por caminhos diferentes:

| Definição | Contas |
|---|---|
| `accounts.churn_flag = True` | 110 |
| ≥ 1 registro em `churn_events` | 352 |
| assinatura mais recente encerrada | 45 / 46 (item 1) |

Só **6 a 7 contas** aparecem nas três ao mesmo tempo. Qualquer número de churn desta submissão só faz sentido junto da definição que o gerou — por isso ela vem escrita em toda tabela.

---

## 5. O que foi corrigido no caminho

A primeira versão da análise (PDF de 14/09/2026, não publicado nesta pasta) concluiu que a taxa de cancelamento estava **estável em ~5%**. Estava errada: o cálculo dividia pelo total de assinaturas ativas, e como uma conta tem várias assinaturas ao mesmo tempo, esse divisor cresce mais rápido que a base de clientes e **esconde a alta**. Refeito por conta e por MRR, o 4º trimestre de 2024 aparece com 14,4% do MRR encerrado contra 2,6%-3,9% nos trimestres anteriores (relatório, §1.5).

Esse é o erro mais caro que apareceu no processo, e está contado em `process-log/COMO-TRABALHEI.md`.
