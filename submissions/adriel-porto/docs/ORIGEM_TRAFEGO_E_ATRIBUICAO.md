# Por que a origem do tráfego vem antes da análise da tabela

## 14/09/2026 — nota de método, baseada em experiência própria (não em dado deste dataset)

**Premissa central:** antes de confiar em qualquer número da tabela de churn, a pergunta anterior é *de onde veio esse cliente*. Se a origem de captação estiver marcada errado, todo o resto do resultado está errado — esse fator pode mudar o resultado inteiro e, numa situação real de empresa, seria o ponto de partida da análise, não uma etapa posterior.

Este dataset (RavenStack) não tem esse nível de detalhe — só um campo `referral_source` com 5 categorias (organic, ads, event, partner, other), sem investimento, canal, UTM ou tracking por evento. As perguntas abaixo são o que eu investigaria se esses dados existissem, baseado em 10+ anos fazendo tráfego pago e estratégia, com mais de 500 mil unidades vendidas desde 2017 (produtor, afiliado e hoje atendendo clientes com o mesmo problema).

## 01. Tráfego pago (Ads)

- Qual o investimento de tráfego por mês e por ano?
- Existe demarketing feito com algum bônus ou ângulo de promessa diferente? Um demarketing bem feito costuma funcionar muito bem pra high-ticket — esse público demora mais pra decidir, então precisa ver mais anúncios por um período mais longo, com motivos diferentes pra comprar.
- Qual canal de investimento (Google Ads, Facebook Ads, X)? O canal influencia diretamente a qualidade do público e o churn:
  - **Google:** o usuário geralmente tem mais urgência — veio de uma busca ativa, tem mais chance de comprar porque precisa resolver um problema real, e tende a se manter usando.
  - **Facebook/Instagram:** o usuário é mais curioso — pode comprar por curiosidade ou só pra ver como funciona, sem ter o problema de verdade, e cancela logo em seguida por falta de necessidade real.
- Se o tráfego pago está investindo um valor muito alto, pode estar dando prejuízo. **Ou o contrário:** o tráfego pago pode ser responsável por todo o faturamento, mas se a origem dos eventos não for marcada corretamente, aparecer como "organic". Exemplo: o cliente acessa o site hoje vindo de um anúncio, mas só compra daqui 1 mês por um link na bio/descrição em outro dispositivo — e a venda é marcada como "organic" por engano. Por isso a origem precisa estar marcada com precisão.
- Eu faria essa investigação de origem antes de qualquer análise da tabela em si, porque os dados provavelmente divergem dependendo de como a origem foi marcada.

## 02. Orgânico

- Primeiro passo: garantir que essas vendas não são resquício de tráfego pago mal atribuído. Isso se faz de várias formas — antigamente com Tag Manager, hoje com ferramentas de IA de forma mais fácil. O ideal é sempre combinar ferramenta de tracking + confirmação simples (e-mail de inscrição, nome) batendo os dados como segunda forma de checagem.
- Depois disso, entender a origem do tráfego orgânico também importa, porque pode ser sazonal ou ter prazo de validade.
  - Ex.: busca no Google por palavra-chave de tendência crescente tende a aumentar ao longo do tempo, mas depende da demanda do serviço.
  - Pra um serviço de tecnologia, a tendência já tende a ser temporária, só por isso.
  - YouTube tem comportamento diferente — pode viralizar, e nesse caso o pico de venda também pode acabar mais rápido.
- **Nada disso é regra fixa** — são padrões que podem se aplicar, baseados na experiência prática dele com tráfego pago e estratégia, não em dado comprovado deste dataset específico.

## 03. Partner

- Ainda não dá pra opinar sobre esse canal — precisaria entender melhor a origem desse tipo de cliente antes de ter uma posição.

## CAC e LTV — o outro lado que fecha a conta

- Depois de descobrir o investimento mensal em tráfego, calcular com precisão o **custo de aquisição por cliente (CAC)**.
- Calcular quanto esse cliente dá de lucro ao longo do tempo (**LTV**), inclusive considerando a possibilidade de cancelar e voltar a comprar depois (reativação).
- O LTV é fundamental principalmente por causa do investimento: ele impacta diretamente o lucro final da empresa, e isso muda a leitura final dos números de churn.

## Nota sobre a ordem ideal (14/09/2026)

**Isso deveria ter sido investigado antes de qualquer análise da tabela de churn — não depois.** Não foi feito nessa ordem nesta entrega porque a análise da tabela de assinaturas já estava em andamento quando esse ponto foi levantado, e terminar o que já estava em progresso foi mais rápido do que parar e recomeçar do zero. A exceção à regra "origem primeiro" é justamente essa: quando a análise já em curso está perto de terminar e é mais rápida de concluir do que reiniciar o processo. Fora esse caso, o ideal é sempre confirmar a origem/atribuição antes de tirar qualquer conclusão da tabela.

## Simulação numérica (ferramenta `dashboard-churn-005-trafego`, dado real do dataset)

Para provar o argumento com números, construí uma ferramenta que separa o faturamento real por `referral_source` e simula um investimento hipotético em Ads (o dataset não tem valor de investimento nenhum — isso é sempre um valor digitado por mim na hora).

**Faturamento histórico real por origem** (24 meses cobertos pelo dataset, jan/2023 a dez/2024):
- organic: 114 contas, US$ 2.798.707 (24,7%)
- other: 103 contas, US$ 2.377.728 (21,0%)
- ads: 98 contas, US$ 2.146.619 (18,9%)
- partner: 89 contas, US$ 2.094.243 (18,5%)
- event: 96 contas, US$ 1.921.450 (16,9%)

**Cenário A x B, simulando US$ 50.000/mês em Ads (US$ 1.200.000 no total dos 24 meses):**
- Cenário A (atribuição como está marcada): faturamento do Ads = US$ 2.146.619, lucro simulado = US$ 946.619, CAC simulado ≈ US$ 14.118 (85 clientes novos sem trial).
- Cenário B (simulando que "organic" é na verdade Ads mal atribuído): faturamento somado = US$ 4.945.326, lucro simulado = US$ 3.745.326, CAC simulado cai pra ≈ US$ 6.780 (177 clientes novos).

A leitura muda drasticamente entre os dois cenários com o MESMO investimento — é exatamente o ponto: sem confirmar a atribuição de origem, dá pra concluir coisas bem diferentes sobre o retorno do tráfego pago.

## Prova de que isso não é teoria (repositório próprio, verificado)

Antes de começar o desafio do G4, eu já tinha publicado um repositório próprio no GitHub sobre exatamente esse tema — feito pra aprender a mexer no GitHub, não pensado como currículo pro processo seletivo. Só que ele prova na prática o argumento acima: é uma ferramenta que uso no meu dia a dia (não é um projeto pro repositório do G4), que conecta Meta Ads, Hotmart e ROI, fazendo esse tipo de cálculo em tempo real — exatamente o cruzamento entre origem de tráfego, investimento e retorno que a análise acima defende.

- Repositório: `porto-studio/dashboard-roi` — https://github.com/porto-studio/dashboard-roi (público, confirmado no ar)
- Demo publicada: https://porto-studio.github.io/dashboard-roi/ (confirmado no ar, HTTP 200, em 14/09/2026)
- Não foi construído pra este desafio — é a automação pessoal que já uso pra decisão de tráfego pago, e por coincidência aborda o mesmo problema que apareceu aqui ao analisar o dataset do RavenStack.
