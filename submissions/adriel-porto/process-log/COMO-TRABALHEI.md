# Process Log — como eu trabalhei

> 🖼 **Prefere ver em vez de ler?** [`README.md` desta pasta](./README.md) tem os 15 momentos de decisão com o print da tela e o que eu pedi em cada um, e [`chat-export/`](./chat-export/CONVERSA-NOS-MOMENTOS-DE-DECISAO.md) tem a conversa exata.

Narrativa do processo, na ordem em que aconteceu. Os horários saem do histórico de commits desta branch (`git log`) e do registro automático de tela descrito no item 5.

---

## 1. Ferramentas de IA que usei, e para quê

| Ferramenta | Para quê | Por que essa |
|---|---|---|
| **Claude Code** (terminal) | Construir as 5 ferramentas de leitura, os 14 scripts de análise e revisar os cálculos | Roda no meu computador, com acesso aos arquivos. Eu leio o código que ele escreve — o número aparece depois de passar por uma regra que eu posso auditar, não dentro de um parágrafo de resposta |
| **Claude Code, segunda sessão em paralelo** | Rodar o cruzamento `feature_usage` × `support_tickets` e o relatório estatístico enquanto eu seguia nas ferramentas | Duas frentes ao mesmo tempo. O custo disso aparece no item 6 (erro que isso me gerou) |
| **PromptCapture AI** (ferramenta minha, já existia antes do desafio) | Registro automático do processo: 1 print a cada 2 s, OCR nativo do Mac e anotação de cada passo por IA via Amazon Bedrock (Gemma 3 12B → Gemma 3 4B → Ministral 3B, nessa ordem de queda) | Eu não confio na minha memória para reconstruir 7 horas de trabalho depois. Preferi gravar tudo e curar no fim |
| **API do Kaggle** | Baixar os 5 CSVs e ler a descrição oficial do dataset | Foi assim que descobri que o dataset é declaradamente sintético — o que mudou o tom de todas as conclusões |

---

## 2. O que eu decidi ANTES de escrever qualquer prompt

Abri os CSVs e a primeira coisa que olhei não foi churn, foi o **formato**: `ravenstack_subscriptions.csv` não é uma linha por conta. São ~10 assinaturas por conta (máximo 19), com `mrr_amount` oscilando entre elas, e contas com duas assinaturas "ativas" ao mesmo tempo.

Isso decidiu o método (commit `395fc12`, 14/09 15:53):

> **Não vou pedir para a IA cruzar as tabelas e me dizer a causa.** Num dado desse formato, um pedido aberto como "ache a causa raiz" é exatamente o tipo de coisa que faz a IA escolher um recorte conveniente e me entregar uma correlação bonita que eu não tenho como conferir.

O que fiz no lugar: **eu defino a regra de cálculo, a IA implementa, e a ferramenta recalcula a partir do CSV bruto toda vez.** A metodologia fica escrita no código, não escondida numa resposta de texto. Está registrado em `anotacoes-analise.md`.

---

## 3. Antes de confiar na ferramenta, testei a ferramenta

Não adianta tirar a IA da interpretação se a leitura do arquivo já estiver errada. Como conferir 5.000 linhas na mão não é viável, fiz um teste com amostra controlada (commit `6308c6d`, 14/09 17:02):

1. Copiei o `subscriptions.csv`.
2. Apaguei de propósito um número conhecido de linhas.
3. Recarreguei na ferramenta e conferi se a contagem batia e se as linhas apagadas sumiram mesmo.

**Na primeira tentativa o erro foi meu, não da IA:** apaguei o cabeçalho junto com as linhas. Refiz mantendo o cabeçalho e aí sim bateu. Anotei os dois arquivos de teste em `verificacao-dashboard.md` — inclusive o errado, porque o erro faz parte da verificação.

Efeito colateral útil: salvei os arquivos de teste com `;` em vez de `,` (padrão do Excel em PT-BR) e a ferramenta leu certo mesmo assim.

---

## 4. As iterações — 5 ferramentas, cada uma com um motivo

Cada versão nasceu de uma pergunta que a anterior não respondia. **Publiquei só as duas últimas** (`solution/dashboards/`): a 004 já faz tudo o que a 002 e a 003 faziam, e subir as cinco obrigaria quem avalia a ler quase o mesmo código três vezes. As três primeiras continuam aqui na tabela porque o caminho é que importa.

| # | O que mudou | Por que |
|---|---|---|
| 001 | Leitor genérico de CSV com filtro e gráfico | Primeiro precisava ver o dado cru, sem nenhuma regra minha em cima |
| 002 | Minha metodologia: entrada real vs trial, upgrade/downgrade datado no dia exato, **cancelamento medido por valor perdido, não por quantidade** | Perder uma conta de US$ 50 não é perder uma de US$ 5 mil. Contar cancelamento por unidade mistura as duas |
| 003 | Filtro vira funil progressivo: cada recorte salvo filtra quem sobrou do anterior | Para comparar segmentos de verdade, não recomeçar do total a cada filtro |
| 004 | Aba "Origem do Churn", 7 seções recalculadas ao vivo pelo filtro | Reproduzir a análise escrita dentro da ferramenta, para conferir número contra número |
| 005 | Faturamento por `referral_source` + simulação de investimento em Ads | Provar com número o argumento de atribuição de origem (`docs/ORIGEM_TRAFEGO_E_ATRIBUICAO.md`) |

Em paralelo, 14 scripts em Python: 7 para o diagnóstico (`solution/scripts/`) e 7 para o cruzamento uso × suporte (`solution/cruzamento-uso-x-tickets/`), que rodaram ~45 testes estatísticos.

---

## 5. Como o processo ficou gravado

O PromptCapture gravou a sessão de 14/09 inteira: **8.058 prints**. Ninguém revisa 8.058 prints, então filtrei por critério, não por "o que ficou bonito":

- os **14 blocos de decisão** (a IA que anota os prints marca `[DECISÃO]` quando a tela mostra uma escolha; blocos com menos de 3 min entre si viram um só) — guardei o print do início e o do fim de cada um;
- mais **8 momentos** que eu escolhi à mão.

Resultado: **31 prints mantidos, 8.027 movidos** para fora (nenhum apagado, para poder voltar atrás).

**Conferência que essa gravação permitiu:** 5 dos 6 commits desta branch caem no mesmo segundo de um momento curado (15:53, 17:02, 17:25, 20:57, 21:09). A imagem da decisão e o commit que ela gerou se confirmam um ao outro.

**O que está publicado:** os **30 prints** estão em [`screenshots/`](./screenshots/), e os 15 momentos de decisão — cada um com a hora, a imagem e o que eu pedi — estão no [`README.md` desta pasta](./README.md). A conversa exata desses momentos, extraída do transcript do Claude Code, está em [`chat-export/`](./chat-export/CONVERSA-NOS-MOMENTOS-DE-DECISAO.md).

**O que foi tirado:** são capturas de tela inteira de 7 horas de trabalho. Em 5 delas o painel direito do terminal mostrava uma lista de atalhos pessoais com endereços de e-mail — cortei para o painel da esquerda, onde está o trabalho. Uma sexta, que era só a Mesa do computador sem conteúdo nenhum, ficou de fora. As 31 foram conferidas uma a uma antes de subir.

---

## 6. Onde a IA errou — e como eu percebi

### 6.1 O erro mais caro: "a taxa está estável em ~5%"

A primeira versão da análise (PDF de 14/09) concluiu que o cancelamento estava **estável em ~5%**, o que contrariava a premissa do CEO.

Estava errado. O cálculo dividia os cancelamentos pelo **total de assinaturas ativas** — e como cada conta tem várias assinaturas ao mesmo tempo, esse divisor cresce mais rápido do que a base de clientes e **achata a curva**. Recortado por conta e por MRR, o 4º trimestre de 2024 aparece com **14,4% do MRR encerrado**, contra 2,6% a 3,9% nos trimestres anteriores.

**Como percebi:** o número batia com a intuição de quem quer uma resposta tranquilizadora e não batia com o que a base mostrava mês a mês. Refiz o denominador. Está no relatório, §1.5.

### 6.2 A pizza que mostrava zero conta cancelada

A aba de resumo dizia **0 contas canceladas**, o que é absurdo num dataset com 600 eventos de churn. Causa: o código checava "a conta tem alguma linha cobrindo o último mês?" — e como as assinaturas se sobrepõem, quase toda conta passava nesse teste. Corrigido para olhar **a assinatura mais recente de cada conta**: 454 ativas / 46 canceladas.

### 6.3 Números da aba "Origem do Churn" conferidos fora do navegador

A aba 004 reproduz 7 seções de uma análise escrita. Em vez de confiar no que a tela mostrava, rodei o mesmo código por fora (Node, sem navegador) e comparei seção por seção com o texto de origem. Apareceram **2 erros de contagem**, corrigidos ali.

### 6.4 O caso em que o erro foi meu

O cabeçalho apagado no teste do item 3. Registrei junto com os outros de propósito: quem só registra o erro da ferramenta está construindo um álibi, não um log.

---

## 7. O que eu tentei e não deu certo

**Reconstruir a linha do tempo conta por conta** (entrada → eventos → cancelamento). Não funcionou: com ~10 assinaturas por conta, duas às vezes ativas ao mesmo tempo e pulos de plano em poucos dias, não existe narrativa limpa por conta neste dado. Parei e registrei como limitação, em vez de forçar uma história que o dado não sustenta.

**O modelo preditivo.** Treinei uma regressão logística com 35 variáveis das 5 tabelas, com validação no tempo (treino em mar/jun 2024, teste em out-dez 2024). **AUC 0,525 — não prevê melhor que o acaso.** A idade da conta sozinha (AUC 0,677) ordena melhor do que as 35 variáveis juntas.

Deixei o modelo que falhou dentro da entrega, com o resultado à mostra (relatório, §5). Um modelo de "90% de acerto" com esses dados seria enganoso, e eu prefiro entregar o teste que mostra que não dá do que o número que impressiona.

---

## 8. O que eu adicionei que a IA sozinha não faria

**1. Desconfiei da origem antes de olhar a tabela.** Nenhuma IA que recebe 5 tabelas pergunta "e se a origem do cliente estiver marcada errada?", porque ela nunca perdeu dinheiro com atribuição errada. Eu já perdi — são 10 anos fazendo tráfego pago. Simulei os dois cenários com o dado real (`dashboard-churn-005-trafego`) e o mesmo investimento vira US$ 946 mil ou US$ 3,74 milhões de lucro dependendo só de como a origem foi marcada. Está em `docs/ORIGEM_TRAFEGO_E_ATRIBUICAO.md`.

**2. Medi cancelamento por valor, não por quantidade.** É a diferença entre "perdemos 101 assinaturas pequenas" e "perdemos 67 assinaturas que valem 59% de todo o dinheiro que saiu".

**3. Testei a ferramenta antes de acreditar nela** (item 3), e conciliei as duas análises em `docs/CONCILIACAO-DOS-NUMEROS.md` em vez de escolher a versão mais conveniente de cada número.

**4. Disse o que os dados NÃO sustentam.** O relatório tem uma lista explícita de "o que não fazer": não cortar canal de aquisição, não mexer em preço por país ou setor, não tratar upgrade como sinal de churn. Nenhum passou nos testes. Recomendar isso com p > 0,05 seria vender decisão baseada em ruído.

**5. Parei de construir ferramenta quando o obrigatório ainda não existia.** Em 15/09 eu tinha 5 ferramentas e nenhuma linha do relatório — o diferencial pronto e o deliverable em branco. Reordenei: primeiro as 3 perguntas do desafio, depois o resto.

---

## 9. Quantas iterações, em número

| | |
|---|---|
| Sessões de trabalho | 3 (14/09, 15/09, fechamento) |
| Commits nesta branch | 6 na análise + os de organização da entrega |
| Ferramentas construídas | 5 |
| Scripts de análise | 14 |
| Testes estatísticos rodados | ~45 |
| Prints gravados / mantidos | 8.058 / 31 |
| Erros achados e corrigidos | 4 (3 da IA, 1 meu) |
