# Conciliação — onde dois números desta pasta não batem, e por quê

Esta submissão tem duas análises feitas em momentos diferentes: o diagnóstico principal (`solution/RELATORIO_DIAGNOSTICO_CHURN.md`) e o cruzamento uso × suporte (`solution/cruzamento-uso-x-tickets/`). Em dois pontos elas dão números diferentes. **Não é erro de nenhuma das duas — é a mesma pergunta feita de dois jeitos.** Esta página existe para ninguém ter que adivinhar.

---

## 1. "A última assinatura da conta já terminou": 45 ou 46 contas?

`scripts/definicoes.py` diz **45**. `cruzamento-uso-x-tickets/01_integridade.py` diz **46**.

**Causa, verificada:** os dois pegam a assinatura mais recente pela `start_date` — mas **21 contas têm duas ou mais assinaturas começando no mesmo dia**, e cada script desempata de um jeito.

Em **6 dessas 21 contas, as assinaturas empatadas têm desfechos opostos na mesma data.** Exemplo literal do dado:

```
A-db5e9e   S-984f8b   início 2024-12-28   fim 2024-12-28   churn_flag True
A-db5e9e   S-23587d   início 2024-12-28   fim (vazio)      churn_flag False
```

A conta `A-0b0d6d` abre **8 assinaturas no mesmo 31/12/2024**, uma delas encerrada no próprio dia.

Pelo mesmo motivo, o número de contas que aparecem nas **três** definições de churn ao mesmo tempo sai **6** no relatório e **7** no cruzamento. A diferença de 1 conta não muda conclusão nenhuma. **Mas a causa dela é o achado central do relatório:** quando uma regra de desempate legítima muda a resposta, o problema não é o script — é a definição de churn da empresa.

---

## 2. "91% do valor perdido vem de quem entra direto" × "trial não é significativo"

Parece contradição e não é. São duas perguntas:

- **Fatia:** de todo o valor cancelado, quanto veio de conta sem trial → **91%**.
- **Taxa:** quem entra sem trial cancela *proporcionalmente* mais? → **não** (p = 0,318).

As duas convivem porque **403 das 500 contas (80,6%) já são de entrada direta**. Um grupo que é 80,6% da base responder por 91% do valor perdido é quase o tamanho dele.

**Como usar cada uma:** a fatia serve para o CS priorizar esforço (é onde está o dinheiro). A taxa serve para decidir política de aquisição — e ela diz para **não** mexer no trial com base nesses dados.
