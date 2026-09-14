# Anotações de análise (rascunho, minhas hipóteses antes de rodar os dados)

## 14/09/2026

- Primeiro ponto a analisar: frequência/período do cancelamento em relação ao tempo de vida do cliente (ex.: cliente entrou no mês 1, qual a média de cancelamento por mês de vida — mês 4, mês 5 etc).
- Verificar se esse padrão de período muda entre pagamento mensal e anual.
- Objetivo: achar o ponto exato (ou faixa) em que o cancelamento acontece com maior intensidade / começa a subir.

## Decisão de método (14/09/2026)

- Achado nos dados: `ravenstack_subscriptions.csv` não é 1 linha por conta — média de 10 assinaturas por conta (máx. 19), com `mrr_amount` oscilando sem padrão claro entre elas. Bate com o aviso do Kaggle de que o dataset tem "edge cases plantados de propósito".
- Risco identificado: pedir pra IA cruzar os dados e já entregar interpretação/resumo pode fazer ela ler ou alterar algum número errado, dado o formato bagunçado.
- Decisão: em vez de pedir pra IA cruzar e resumir direto, construir uma **dashboard que lê o dado bruto** e permite filtrar/organizar sob demanda — quem decide o que olhar e como agregar sou eu, os números exibidos vêm direto do CSV, sem passar por interpretação da IA antes.
