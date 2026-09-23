# Anotações de análise (rascunho, minhas hipóteses antes de rodar os dados)

## 14/09/2026

- Primeiro ponto a analisar: frequência/período do cancelamento em relação ao tempo de vida do cliente (ex.: cliente entrou no mês 1, qual a média de cancelamento por mês de vida — mês 4, mês 5 etc).
- Verificar se esse padrão de período muda entre pagamento mensal e anual.
- Objetivo: achar o ponto exato (ou faixa) em que o cancelamento acontece com maior intensidade / começa a subir.

## Decisão de método (14/09/2026)

- Achado nos dados: `ravenstack_subscriptions.csv` não é 1 linha por conta — média de 10 assinaturas por conta (máx. 19), com `mrr_amount` oscilando sem padrão claro entre elas. Bate com o aviso do Kaggle de que o dataset tem "edge cases plantados de propósito".
- Risco identificado: pedir pra IA cruzar os dados e já entregar interpretação/resumo pode fazer ela ler ou alterar algum número errado, dado o formato bagunçado.
- Decisão: em vez de pedir pra IA cruzar e resumir direto, construir uma **dashboard que lê o dado bruto** e permite filtrar/organizar sob demanda — quem decide o que olhar e como agregar sou eu, os números exibidos vêm direto do CSV, sem passar por interpretação da IA antes.

## Segunda decisão de método (14/09/2026) — dashboard de diagnóstico com metodologia própria

- Depois de validar a primeira dashboard (ver `verificacao-dashboard.md`), decidi ir além de só filtrar: construir uma segunda ferramenta (`dashboard-churn-002-diagnostico`) que já aplica a MINHA metodologia de cálculo (regra de entrada real vs trial, upgrade/downgrade datado no dia exato, cancelamento por valor perdido) em cima dos 5 CSVs brutos, sempre somente-leitura.
- Motivo: em vez de pedir pra IA "achar a causa raiz" (que é exatamente o tipo de pedido aberto que pode fazer ela alucinar ou inventar uma correlação), eu defino a regra de cálculo e a IA só aplica — o resultado é auditável porque a metodologia está explícita no código, não escondida numa resposta de texto.
- Isso também resolve o problema de eu não conseguir analisar 5.000 linhas manualmente: a ferramenta faz o cruzamento entre `accounts`, `subscriptions` e `churn_events` (por `account_id`), e eu decido o que investigar a partir dos números que ela mostra, não o contrário.
- Os arquivos CSV usados pela ferramenta são cópias dos originais (nunca os arquivos da pasta do GitHub), e a ferramenta nunca escreve neles — só lê e calcula em memória. O próprio dashboard tem uma aba de "qualidade de dados" que aponta inconsistências (sem corrigir nada), pra eu decidir o que fazer com cada caso.

---

_Nota de 23/09/2026, ao organizar a entrega: a `dashboard-churn-002-diagnostico` citada acima foi a 2ª de 5 versões. A publicada é a `dashboard-churn-004-origem`, que já contém a metodologia descrita aqui. O motivo de não subir as cinco está no §4 de `COMO-TRABALHEI.md`._
