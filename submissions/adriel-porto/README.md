# Submissão — Adriel Porto — Challenge 001

**Diagnóstico de Churn — RavenStack** · [Ler o relatório completo →](./solution/RELATORIO_DIAGNOSTICO_CHURN.md)

![Notas de satisfação](./solution/graficos/02_satisfacao_distribuicao.png)

Esta imagem resume o diagnóstico. O CS diz que a satisfação está ok — e está. **Ela não tem como não estar: em 2.000 tickets não existe uma única nota 1 ou 2**, e 41% não têm nota. A empresa está medindo o próprio termômetro errado.

---

## Por onde começar

| Se você tem | Leia |
|---|---|
| **2 minutos** | O Executive Summary, logo abaixo |
| **15 minutos** | [`solution/RELATORIO_DIAGNOSTICO_CHURN.md`](./solution/RELATORIO_DIAGNOSTICO_CHURN.md) — as 3 perguntas do desafio, respondidas |
| **Quer ver como eu trabalhei** | [`process-log/`](./process-log/) — 15 momentos de decisão, com o print da tela e o que pedi em cada um · [versão visual](https://porto-studio.github.io/ai-master-challenge/submissions/adriel-porto/process-log/linha-do-tempo.html) |
| **Quer conferir os números** | [`solution/COMO-RODAR.md`](./solution/COMO-RODAR.md) — roda na sua máquina e reproduz cada número |

---

## Sobre mim

- **Nome:** Adriel Porto
- **LinkedIn:** https://www.linkedin.com/in/adrielportoribeiro/
- **Challenge escolhido:** 001 — Diagnóstico de Churn

---

## Executive Summary

O CEO disse que algo não batia: o churn subiu, o CS diz que a satisfação está ok, o produto diz que o uso cresceu. **Os três estão certos — e é exatamente por isso que ninguém enxerga o problema.**

O churn subiu de verdade: **14,4% do MRR ativo terminou encerrado no 4º trimestre de 2024**, contra 2,6% a 3,9% nos trimestres anteriores. A satisfação "está ok" porque a pesquisa não consegue registrar insatisfação. E o uso "cresceu" 1,1% em dois anos, ou seja, ficou parado.

**A causa raiz não é um segmento nem um motivo: é a medição.** Testei 11 dimensões e nenhuma separa quem sai de quem fica. O que dá para fazer amanhã é a lista das 25 contas prioritárias, com US$ 61,5 mil de MRR em risco por trimestre, pronta em CSV. O que precisa ser feito em 30 dias é uma definição única de churn — sem ela, nenhuma meta de retenção é auditável.

---

## Solução

📄 [Relatório de diagnóstico](./solution/RELATORIO_DIAGNOSTICO_CHURN.md) (também em [PDF](./solution/RELATORIO_DIAGNOSTICO_CHURN.pdf)) · 🔎 [Cruzamento uso × suporte](./solution/cruzamento-uso-x-tickets/RESULTADO_CRUZAMENTO.md) · 📊 [As 500 contas priorizadas, em CSV](./solution/tabelas/12_contas_em_risco_31dez2024.csv) · 🛠 [2 ferramentas interativas](./solution/dashboards/)

### Abordagem

**Comecei pelo formato do dado, não pelo churn.** A primeira coisa que olhei foi a estrutura de `subscriptions.csv` — e não é uma linha por conta: são ~10 assinaturas por conta (máximo 19), às vezes duas ativas ao mesmo tempo, com o MRR oscilando entre elas.

Isso decidiu o método. Num dado assim, pedir para a IA "cruzar as tabelas e achar a causa raiz" é convidar uma correlação bonita e inconferível. Inverti a ordem: **eu defino a regra de cálculo, a IA implementa, e a ferramenta recalcula do CSV bruto a cada vez.** A metodologia fica no código, onde dá para auditar.

Antes de confiar na ferramenta, testei a ferramenta: copiei o CSV, apaguei de propósito um número conhecido de linhas e conferi se a contagem batia. Depois cruzei as 5 tabelas por dois caminhos independentes — 14 scripts de estatística e as ferramentas visuais — e, quando os dois discordaram em algum número, fui atrás do motivo em vez de escolher o mais conveniente ([conciliação](./docs/CONCILIACAO-DOS-NUMEROS.md)).

### Resultados / Findings

**1. As três falas do CEO, verificadas uma a uma**

| O que cada time diz | O que os dados mostram |
|---|---|
| "O churn subiu" | **Verdade, e só no último trimestre.** 14,4% do MRR ativo encerrado no 4º tri/2024, contra 2,6%-3,9% antes. Só dezembro foi 6,8% |
| "A satisfação está ok" | **A medição não consegue mostrar insatisfação.** Zero notas 1 e 2 em 2.000 tickets; 41% sem nota; média igual entre quem saiu e quem ficou (3,98) |
| "O uso cresceu" | **Não.** +1,1% de 2023 para 2024. E 77,7% dos registros de uso caem fora da vigência da própria assinatura |

**2. A causa raiz é a medição, não um segmento.** "Churn" são três números diferentes nos dados: `churn_flag` = 110 contas · `churn_events` = 352 · última assinatura encerrada = 45. Só **6 contas** aparecem nas três — e as 110 marcadas com `churn_flag` **continuam com assinatura paga ativa** em 31/12/2024. A data do churn bate com o fim de uma assinatura em **6 de 600 eventos**, e motivo declarado e comentário do cliente são estatisticamente independentes (p = 0,988). O ranking de canais **inverte conforme a definição usada**: "event" é o pior por uma e o melhor por outra.

**3. O que foi testado e NÃO explica o churn** (p > 0,05 em todos): país, setor, canal, plano, seats, cobrança, renovação automática, upgrade, downgrade, tickets, satisfação, escalações, tempo de resolução e uso de features. Só o cruzamento uso × suporte rodou ~45 testes — a correlação entre erros de uso e nº de tickets é **−0,010**, e o quadrante clássico de risco ("usa pouco e abre muito ticket") tem a **menor** taxa de churn da tabela.

**4. Os dois padrões que sobrevivem:** **conta nova sai mais** (32,6% das contas com menos de 3 meses contra 17,2% das com mais de 12, com intervalos que não se cruzam) e **nem todo churn pesa igual** (assinaturas acima de US$ 5 mil/mês são 16,4% dos cancelamentos e **59% do MRR perdido**; 30 contas concentram 45,5% de tudo).

**5. O modelo preditivo não funcionou — e está publicado assim mesmo.** Regressão logística, 35 variáveis, validação no tempo: **AUC 0,525**, praticamente acaso. A idade da conta sozinha (0,677) ordena melhor que as 35 juntas. Um modelo de "90% de acerto" com esses dados seria mentira bem apresentada.

### Recomendações

Em ordem de prioridade, com a premissa de cada estimativa escrita junto — são simulações, não promessas. Detalhamento no §4 do relatório.

| # | Ação | Prazo | Impacto estimado |
|---|---|---|---|
| 1 | **Passar as 25 contas prioritárias ao CS**, com dono por conta e contato em até 14 dias | amanhã | US$ 61,5 mil de MRR em risco por trimestre; evitar metade ≈ **US$ 123 mil/ano** |
| 2 | **Definição única de churn** (assinatura paga encerrada sem outra no lugar) | 30 dias | Sem isso **nenhuma meta de churn é auditável**. É pré-requisito das ações 3 e 4 |
| 3 | **Programa de 90 dias para contas novas**, em metade delas, com **grupo de controle** | 1 trimestre | Reduzir a taxa em 20% ≈ US$ 94 mil/ano; em 50% ≈ **US$ 235 mil/ano** |
| 4 | **Consertar a pesquisa de satisfação**: escala 1-5 de verdade, nota no fechamento | 30 dias | Torna verificável a frase "a satisfação está ok" |
| 5 | **Motivo de saída em pergunta única e obrigatória**, com o comentário ligado a ele | 30 dias | Permite achar a causa declarada de verdade |
| 6 | **Registrar uso por assinatura, com data dentro da vigência** | 60 dias | Permite testar "o uso cresceu" e criar alerta de queda |

**O que NÃO fazer com os dados de hoje:** cortar ou priorizar canal de aquisição, mudar preço por país ou setor, tratar upgrade como sinal de churn. Nenhum passou nos testes — recomendar isso seria vender decisão baseada em ruído.

### Limitações

- **O dataset é declaradamente fictício** (o autor diz no Kaggle que foi gerado em Python/ChatGPT, com casos-limite plantados). Não dá para separar "não há sinal neste negócio" de "o gerador não criou sinal".
- **Dezembro/2024 é o último mês da base** e o mês com mais assinaturas novas — parte do pico do 4º trimestre pode ser efeito de fim de base.
- **Tudo aqui é correlação.** Nenhum teste estabelece causa.
- **Linha do tempo conta a conta não foi possível** — com ~10 assinaturas por conta e pulos de plano em dias, não existe narrativa limpa por conta. Registrei como limitação em vez de forçar uma história.
- **Sem `scipy` na máquina**, os testes do cruzamento foram implementados à mão e não conferidos contra a biblioteca. Sem correção para múltiplas comparações em ~45 testes.
- **O que eu diria numa empresa de verdade e este dataset não permite:** a origem do cliente vem antes da tabela de churn. Virou uma simulação com o dado real em [`docs/ORIGEM_TRAFEGO_E_ATRIBUICAO.md`](./docs/ORIGEM_TRAFEGO_E_ATRIBUICAO.md) — o mesmo investimento vira US$ 946 mil ou US$ 3,74 milhões de lucro dependendo só de como a origem foi marcada.
- Lista completa no §7 do relatório.

---

## Process Log — Como usei IA

> Os **15 momentos de decisão**, com print da tela e a conversa exata de cada um: [`process-log/`](./process-log/) · A narrativa completa: [`process-log/COMO-TRABALHEI.md`](./process-log/COMO-TRABALHEI.md)

### Ferramentas usadas

| Ferramenta | Para que usei |
|---|---|
| **Claude Code** (terminal, 2 sessões em paralelo) | Construir as ferramentas e os 14 scripts; revisar cálculo. Eu leio o código que ele escreve — o número passa por uma regra auditável, não por um parágrafo de resposta |
| **PromptCapture AI** (ferramenta minha, anterior ao desafio) | Gravar o processo: 1 print a cada 2 s + OCR nativo do Mac + anotação de cada passo por IA via **Amazon Bedrock** (Gemma 3 12B → Gemma 3 4B → Ministral 3B) |
| **API do Kaggle** | Baixar os 5 CSVs e ler a descrição oficial — foi assim que descobri que o dataset é sintético, o que mudou o tom de todas as conclusões |

### Workflow

1. **Antes de promptar:** abri os CSVs e olhei o formato, não o churn. Descobri que não é 1 linha por conta e que as assinaturas se sobrepõem — foi isso que definiu o método.
2. **Decisão de método** (commit `395fc12`): não pedir causa raiz para a IA; construir uma ferramenta que lê o dado bruto e aplica **a minha** regra de cálculo, sempre somente-leitura.
3. **Validação da ferramenta** (commit `6308c6d`): amostra controlada — apagar linhas de propósito e conferir se a contagem bate.
4. **Metodologia própria** (commit `2126178`): entrada real vs trial, upgrade/downgrade datado no dia exato, **cancelamento medido por valor perdido**.
5. **Cruzamento das 5 tabelas** por dois caminhos independentes: 14 scripts de estatística e as ferramentas visuais.
6. **Conciliação** dos números que não bateram, em vez de escolher o mais conveniente.
7. **Relatório para não-técnico**, com a lista de contas em CSV que o CS abre no Excel.

Foram **5 iterações de ferramenta**, cada uma com um motivo registrado; publiquei as 2 últimas, porque a 4ª já faz o que a 2ª e a 3ª faziam.

### Onde a IA errou e como corrigi

1. **"A taxa está estável em ~5%"** — a primeira versão da análise dividia os cancelamentos pelo total de assinaturas ativas. Como cada conta tem várias ao mesmo tempo, esse divisor cresce mais rápido que a base e **achata a curva**. O número batia bem demais com uma resposta tranquilizadora. Refiz o denominador por conta e por MRR: 14,4% no 4º tri. Foi o erro mais caro.
2. **Uma pizza mostrando 0 conta cancelada** num dataset com 600 eventos de churn — o código perguntava "a conta tem alguma linha cobrindo o último mês?", e com assinaturas sobrepostas quase toda conta passava. Corrigido para olhar a assinatura mais recente: 454 ativas / 46 canceladas.
3. **Números da ferramenta conferidos fora do navegador**, rodando o mesmo código por fora (Node): 2 erros de contagem.
4. **Um erro que foi meu, não da IA:** apaguei o cabeçalho do CSV durante o teste de validação. Registrei junto — quem só registra o erro da ferramenta está montando álibi, não log.

### O que eu adicionei que a IA sozinha não faria

1. **Desconfiei da origem do cliente antes de olhar a tabela.** Uma IA que recebe 5 tabelas analisa as 5 tabelas; ela não pergunta "e se a origem estiver marcada errada?", porque nunca perdeu dinheiro com atribuição errada. Eu já perdi — são 10 anos fazendo tráfego pago.
2. **Medi cancelamento por valor, não por quantidade.** É a diferença entre "perdemos 101 assinaturas pequenas" e "perdemos 67 que valem 59% do dinheiro".
3. **Publiquei o modelo que falhou** e a lista explícita do que os dados **não** sustentam — é onde a maioria das análises inventa recomendação.
4. **Parei de construir ferramenta quando o obrigatório não existia.** Em 15/09 eu tinha 5 ferramentas e nenhuma linha do relatório. Reordenei: primeiro as 3 perguntas do desafio.

---

## Evidências

- [x] **Screenshots** — 30 imagens da sessão gravada, em [`process-log/screenshots/`](./process-log/screenshots/), com os [15 momentos de decisão comentados](./process-log/) e uma [galeria visual](https://porto-studio.github.io/ai-master-challenge/submissions/adriel-porto/process-log/linha-do-tempo.html)
- [x] **Chat export** — a conversa exata desses momentos, extraída do transcript da sessão do Claude Code: [`process-log/chat-export/`](./process-log/chat-export/CONVERSA-NOS-MOMENTOS-DE-DECISAO.md)
- [x] **Narrativa escrita** — [`COMO-TRABALHEI.md`](./process-log/COMO-TRABALHEI.md), [`anotacoes-analise.md`](./process-log/anotacoes-analise.md), [`verificacao-dashboard.md`](./process-log/verificacao-dashboard.md)
- [x] **Git history** — os commits desta branch, com o motivo de cada decisão na mensagem
- [x] **Código auditável** — 14 scripts com a saída bruta salva, reproduzíveis a partir de `solution/`

A sessão de 14/09 gerou **8.058 prints**; publiquei 30, escolhidos pelos blocos que a IA marcou como `[DECISÃO]` e pelos que curei à mão. As 31 candidatas foram conferidas uma a uma: em 5, o painel direito do terminal mostrava uma lista de atalhos pessoais com endereços de e-mail — cortadas para o painel da esquerda, onde está o trabalho. Uma sexta, que era só a Mesa do computador, ficou de fora.

---

_Submissão enviada em: 23/09/2026_
