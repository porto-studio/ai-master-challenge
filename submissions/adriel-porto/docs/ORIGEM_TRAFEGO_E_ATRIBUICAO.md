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
