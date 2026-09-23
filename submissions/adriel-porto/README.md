# Submissão — Adriel Porto — Challenge 001

## Sobre mim

- **Nome:** Adriel Porto
- **LinkedIn:** <!-- COLAR A URL DO LINKEDIN AQUI — é o único campo que falta preencher -->
- **Challenge escolhido:** 001 — Diagnóstico de Churn (RavenStack)

---

## Executive Summary

O CEO disse que algo não batia: o churn subiu, mas o CS diz que a satisfação está ok e o produto diz que o uso cresceu. **Os três estão certos, e é por isso que a empresa não enxerga o problema.** O churn subiu de verdade — 14,4% do MRR ativo terminou encerrado no 4º trimestre de 2024, contra 2,6% a 3,9% nos trimestres anteriores. A satisfação "está ok" porque a pesquisa não consegue capturar insatisfação: em 2.000 tickets **não existe uma única nota 1 ou 2**, só 3, 4 e 5, e 41% dos tickets não têm nota. E o uso "cresceu" 1,1% em dois anos — ou seja, ficou parado.

A causa raiz não é um segmento nem um motivo: **é a medição.** "Churn" significa três coisas diferentes nos dados da empresa (110, 352 e 45 contas, com apenas 6 em comum); a data do evento de churn coincide com o fim de uma assinatura em 6 de 600 casos; o motivo declarado e o comentário do cliente são estatisticamente independentes (p = 0,988); e 77,7% dos registros de uso têm data fora da vigência da própria assinatura. Testei país, setor, canal, plano, tamanho, cobrança, renovação, upgrade, downgrade, suporte e uso: **nenhum separa quem sai de quem fica** (p > 0,05 em todos). Um modelo preditivo com 35 variáveis e validação no tempo ficou em AUC 0,525 — não prevê melhor que o acaso.

Dois padrões sobrevivem aos testes: **conta nova sai mais** (32,6% das contas com menos de 3 meses contra 17,2% das com mais de 12) e **o dinheiro está concentrado** (as assinaturas acima de US$ 5 mil/mês são 16% dos cancelamentos e 59% do MRR perdido; 30 contas respondem por 45,5% de tudo que saiu). A recomendação número 1 é operacional e cabe em uma planilha: **a lista das 25 contas prioritárias, com US$ 61,5 mil de MRR em risco por trimestre, pode ir para o CS amanhã.** A número 2 é consertar a definição de churn — sem ela, nenhuma meta de retenção é auditável.

---

## Solução

📄 **[`solution/RELATORIO_DIAGNOSTICO_CHURN.md`](./solution/RELATORIO_DIAGNOSTICO_CHURN.md)** — o relatório de diagnóstico (também em [PDF](./solution/RELATORIO_DIAGNOSTICO_CHURN.pdf))
🔎 **[`solution/cruzamento-uso-x-tickets/RESULTADO_CRUZAMENTO.md`](./solution/cruzamento-uso-x-tickets/RESULTADO_CRUZAMENTO.md)** — o cruzamento `feature_usage` × `support_tickets`, ~45 testes
📊 **[`solution/tabelas/12_contas_em_risco_31dez2024.csv`](./solution/tabelas/12_contas_em_risco_31dez2024.csv)** — as 500 contas priorizadas, para o CS abrir no Excel amanhã
🛠 **[`solution/dashboards/`](./solution/dashboards/)** — 5 ferramentas que recalculam tudo ao vivo a partir do CSV bruto
▶️ **[`solution/COMO-RODAR.md`](./solution/COMO-RODAR.md)** — como abrir cada coisa e reproduzir cada número

### Abordagem

**Comecei pelo formato do dado, não pelo churn.** A primeira coisa que olhei foi a estrutura de `subscriptions.csv` — e ela não é uma linha por conta: são ~10 assinaturas por conta (máximo 19), às vezes duas ativas ao mesmo tempo, com o MRR oscilando entre elas. Isso decidiu tudo o que veio depois.

**Decisão de método:** num dado desse formato, pedir para a IA "cruzar as tabelas e achar a causa raiz" é convidar uma correlação bonita e não auditável. Inverti a ordem — **eu defino a regra de cálculo, a IA implementa, e a ferramenta recalcula do CSV bruto a cada vez.** A metodologia fica no código, onde dá para conferir, e não dentro de um parágrafo de resposta.

**Antes de confiar na ferramenta, testei a ferramenta:** copiei o CSV, apaguei de propósito um número conhecido de linhas e conferi se a contagem batia. (Na primeira tentativa o erro foi meu — apaguei o cabeçalho junto. Está registrado.)

**Depois cruzei as 5 tabelas por dois caminhos independentes:** um de estatística (14 scripts em Python, testes de permutação, intervalo de Wilson, validação temporal do modelo) e um visual (as 5 ferramentas). Quando os dois discordaram em algum número, fui atrás do motivo em vez de escolher o mais conveniente — está tudo em [`docs/CONCILIACAO-DOS-NUMEROS.md`](./docs/CONCILIACAO-DOS-NUMEROS.md).

### Resultados / Findings

**1. As três falas do CEO, verificadas uma a uma**

| O que cada time diz | O que os dados mostram |
|---|---|
| "O churn subiu" | **Verdade, e só no último trimestre.** 14,4% do MRR ativo encerrado no 4º tri/2024, contra 2,6%-3,9% antes. Só dezembro foi 6,8% |
| "A satisfação está ok" | **A medição não consegue mostrar insatisfação.** Zero notas 1 e 2 em 2.000 tickets; 41% sem nota; média igual entre quem saiu e quem ficou (3,98) |
| "O uso cresceu" | **Não.** +1,1% de 2023 para 2024. E 77,7% dos registros de uso caem fora da vigência da própria assinatura |

**2. A causa raiz é a medição, não um segmento**

- **"Churn" são três números diferentes:** `churn_flag` = 110 contas · `churn_events` = 352 · última assinatura encerrada = 45. Só **6 contas** aparecem nas três. As 110 marcadas com `churn_flag` **continuam com assinatura paga ativa** em 31/12/2024.
- A data do churn bate com o fim de uma assinatura em **6 de 600 eventos**.
- Motivo (`reason_code`) e comentário (`feedback_text`) são **independentes** (p = 0,988).
- O ranking de canais **inverte conforme a definição usada**: "event" é o pior canal por uma e o melhor por outra. Decidir "cortar o canal X" com esses dados seria decidir sobre ruído.

**3. O que foi testado e NÃO explica o churn** (p > 0,05 em todos)

País, setor, canal de aquisição, plano, nº de seats, cobrança mensal vs anual, renovação automática, upgrade, downgrade, tickets, satisfação, escalações, tempo de resolução e uso de features. O cruzamento uso × suporte, sozinho, rodou ~45 testes: a correlação entre erros de uso e nº de tickets é **−0,010**. O quadrante clássico de risco ("usa pouco e abre muito ticket") tem a **menor** taxa de churn da tabela.

**4. Os dois padrões que sobrevivem**

- **Conta nova sai mais:** 32,6% das contas com menos de 3 meses têm evento de churn em 90 dias, contra 17,2% das com mais de 12 meses (intervalos de confiança não se cruzam; o padrão se mantém mesmo tirando o trimestre atípico).
- **Nem todo churn pesa igual:** assinaturas acima de US$ 5 mil/mês são 16,4% dos cancelamentos e **59% do MRR perdido**. 30 contas concentram 45,5% de tudo.

**5. O modelo preditivo que não funcionou (e está publicado assim mesmo)**

Regressão logística, 35 variáveis das 5 tabelas, validação no tempo: **AUC 0,525** — praticamente acaso. A idade da conta sozinha (0,677) ordena melhor que as 35 juntas. Com os campos atuais de suporte, uso e motivo, **não há sinal para prever churn**. Um modelo de "90% de acerto" aqui seria enganoso.

### Recomendações

Em ordem de prioridade, com a premissa de cada estimativa escrita junto (são simulações, não promessas). Detalhamento completo no §4 do relatório.

| # | Ação | Prazo | Impacto estimado |
|---|---|---|---|
| 1 | **Passar as 25 contas prioritárias ao CS**, com dono por conta e contato em até 14 dias | amanhã | US$ 61,5 mil de MRR em risco por trimestre; evitar metade ≈ **US$ 123 mil/ano** |
| 2 | **Definição única de churn** (assinatura paga encerrada sem outra no lugar), gerando `churn_events` a partir de `subscriptions` | 30 dias | Não gera receita direta — **sem isso nenhuma meta de churn é auditável**. É pré-requisito das ações 3 e 4 |
| 3 | **Programa de 90 dias para contas novas**, rodando em metade delas e deixando a outra metade como **grupo de controle** | 1 trimestre | Reduzir a taxa em 20% ≈ US$ 94 mil/ano; em 50% ≈ **US$ 235 mil/ano** |
| 4 | **Consertar a pesquisa de satisfação**: escala 1-5 de verdade, nota pedida no fechamento | 30 dias | Torna verificável a frase "a satisfação está ok" |
| 5 | **Motivo de saída em pergunta única e obrigatória**, com o comentário ligado ao motivo | 30 dias | Permite achar a causa declarada de verdade |
| 6 | **Registrar uso por assinatura, com data dentro da vigência** | 60 dias | Permite testar "o uso cresceu" e criar alerta de queda de uso |

**O que NÃO fazer com os dados de hoje:** cortar ou priorizar canal de aquisição, mudar preço por país ou setor, tratar upgrade como sinal de churn. Nenhum passou nos testes — recomendar isso seria vender decisão baseada em ruído.

### Limitações

- **O dataset é declaradamente fictício.** O autor diz no Kaggle que foi gerado em Python/ChatGPT, com casos-limite plantados de propósito. Isso está escrito em toda conclusão: **não dá para separar "não há sinal neste negócio" de "o gerador não criou sinal"**.
- **Dezembro/2024 é o último mês da base** e também o mês com mais assinaturas novas. Parte do pico do 4º trimestre pode ser efeito de fim de base — não descartado.
- **Tudo aqui é correlação.** Nenhum teste estabelece causa. A única forma de provar que onboarding reduz churn é a ação 3, com grupo de controle.
- **Contas têm várias assinaturas pagas ao mesmo tempo.** Somei todas; se cada assinatura nova substituir a anterior, os valores absolutos mudam (as comparações, não).
- **Linha do tempo conta a conta não foi possível** — com ~10 assinaturas por conta e pulos de plano em dias, não existe narrativa limpa por conta neste dado. Registrei como limitação em vez de forçar uma história.
- **`scipy` não estava instalado na máquina**, então os testes do cruzamento foram implementados à mão em `stats_min.py` e não foram conferidos contra o `scipy`. Sem correção para múltiplas comparações em ~45 testes.
- **O que eu diria numa empresa de verdade, e este dataset não permite:** a origem do cliente vem antes da tabela de churn. Se a atribuição estiver errada, todo o resto está. O dataset só tem `referral_source` com 5 rótulos, sem investimento, UTM ou tracking — então virou uma simulação com o dado real, em [`docs/ORIGEM_TRAFEGO_E_ATRIBUICAO.md`](./docs/ORIGEM_TRAFEGO_E_ATRIBUICAO.md): o mesmo investimento vira US$ 946 mil ou US$ 3,74 milhões de lucro dependendo só de como a origem foi marcada.

---

## Process Log — Como usei IA

> **Este bloco é obrigatório.** Sem ele, a submissão é desclassificada.

📝 **A narrativa completa está em [`process-log/COMO-TRABALHEI.md`](./process-log/COMO-TRABALHEI.md)** — com horários, as 5 iterações, os 4 erros e o que foi descartado.

### Ferramentas usadas

| Ferramenta | Para que usou |
|------------|--------------|
| **Claude Code** (terminal) | Construir as 5 ferramentas e os 14 scripts de análise; revisar cálculo. Eu leio o código que ele escreve — o número passa por uma regra auditável, não por um parágrafo de resposta |
| **Claude Code, 2ª sessão em paralelo** | Rodar o cruzamento uso × suporte e o relatório estatístico enquanto eu seguia nas ferramentas |
| **PromptCapture AI** (ferramenta minha, anterior ao desafio) | Registro automático do processo: 1 print a cada 2 s + OCR nativo do Mac + anotação de cada passo por IA via **Amazon Bedrock** (Gemma 3 12B → Gemma 3 4B → Ministral 3B) |
| **API do Kaggle** | Baixar os 5 CSVs e ler a descrição oficial — foi assim que descobri que o dataset é sintético, o que mudou o tom de todas as conclusões |

### Workflow

1. **Antes de promptar:** abri os CSVs e olhei o formato, não o churn. Descobri que não é 1 linha por conta e que as assinaturas se sobrepõem — e foi isso que definiu o método.
2. **Decisão de método (commit `395fc12`):** não pedir causa raiz para a IA. Construir uma ferramenta que lê o dado bruto e aplica **a minha** regra de cálculo, sempre somente-leitura.
3. **Validação da ferramenta (commit `6308c6d`):** teste com amostra controlada — apagar linhas de propósito e conferir se a contagem bate.
4. **Metodologia própria (commit `2126178`):** entrada real vs trial, upgrade/downgrade datado no dia exato e **cancelamento medido por valor perdido, não por quantidade**.
5. **Cruzamento das 5 tabelas** por dois caminhos independentes: 14 scripts de estatística e as 5 ferramentas visuais.
6. **Conciliação** dos números que não bateram entre os dois caminhos, em vez de escolher o mais conveniente.
7. **Relatório para não-técnico**, com a lista de contas em CSV que o CS abre no Excel.

**5 iterações de ferramenta**, cada uma com um motivo registrado: leitor bruto → metodologia própria → funil progressivo → origem do churn → simulação de tráfego.

### Onde a IA errou e como corrigi

**1. "A taxa de cancelamento está estável em ~5%" — o erro mais caro.** A primeira versão da análise dividia os cancelamentos pelo **total de assinaturas ativas**; como cada conta tem várias assinaturas ao mesmo tempo, esse divisor cresce mais rápido que a base de clientes e **achata a curva**. O número contrariava a premissa do CEO e batia bem demais com uma resposta tranquilizadora. Refiz o denominador por conta e por MRR: o 4º tri/2024 aparece com **14,4%**, contra 2,6%-3,9% antes.

**2. A pizza que mostrava 0 conta cancelada** num dataset com 600 eventos de churn. Causa: o código perguntava "a conta tem alguma linha cobrindo o último mês?" — e com assinaturas sobrepostas quase toda conta passava. Corrigido para olhar **a assinatura mais recente de cada conta**: 454 ativas / 46 canceladas.

**3. Números da aba "Origem do Churn" conferidos fora do navegador.** Rodei o mesmo código por fora (Node) e comparei seção por seção com o texto de origem: **2 erros de contagem**, corrigidos.

**4. O erro que foi meu, não da IA:** no teste de validação apaguei o cabeçalho do CSV junto com as linhas. Registrei junto com os outros de propósito — quem só registra o erro da ferramenta está construindo um álibi, não um log.

### O que eu adicionei que a IA sozinha não faria

**1. Desconfiei da origem antes de olhar a tabela.** Uma IA que recebe 5 tabelas analisa as 5 tabelas; ela não pergunta "e se a origem do cliente estiver marcada errada?", porque nunca perdeu dinheiro com atribuição errada. Eu já perdi — são 10 anos fazendo tráfego pago. Simulei os dois cenários com o dado real: o mesmo investimento vira US$ 946 mil ou US$ 3,74 milhões de lucro dependendo só da marcação.

**2. Medi cancelamento por valor, não por quantidade.** É a diferença entre "perdemos 101 assinaturas pequenas" e "perdemos 67 assinaturas que valem 59% de todo o dinheiro que saiu".

**3. Publiquei o modelo que falhou.** AUC 0,525, à mostra, com a explicação de por que um modelo de 90% seria enganoso aqui.

**4. Disse o que os dados NÃO sustentam** — a lista explícita de "o que não fazer", que é onde a maioria das análises inventa recomendação.

**5. Parei de construir ferramenta quando o obrigatório não existia.** Em 15/09 eu tinha 5 ferramentas e nenhuma linha do relatório: o diferencial pronto e o deliverable em branco. Reordenei — primeiro as 3 perguntas do desafio.

---

## Evidências

- [x] **Git history** — os commits desta branch, com o motivo de cada decisão de método na mensagem
- [x] **Narrativa escrita** — [`process-log/COMO-TRABALHEI.md`](./process-log/COMO-TRABALHEI.md), [`process-log/anotacoes-analise.md`](./process-log/anotacoes-analise.md), [`process-log/verificacao-dashboard.md`](./process-log/verificacao-dashboard.md)
- [x] **Código que gera cada número** — 14 scripts + a saída bruta de cada um, reproduzível a partir desta pasta
- [x] **Os prompts do registro automático** — [`process-log/prompts-promptcapture.md`](./process-log/prompts-promptcapture.md)
- [ ] **Screenshots** — a sessão de 14/09 foi gravada inteira (8.058 prints, filtrados para 31 momentos de decisão), mas **não estão publicados de propósito**: são capturas de tela inteira, com material de clientes reais meus ao fundo. Publicar exporia dado de terceiro que não tem nada a ver com este desafio. O critério de filtragem e a conferência que ela permitiu (5 dos 6 commits caem no mesmo segundo de um momento de decisão gravado) estão no §5 do process log.

---

_Submissão enviada em: <!-- PREENCHER COM A DATA DO PUSH -->_
