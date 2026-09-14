# Verificação da dashboard de leitura de dados brutos

## 14/09/2026

**Por que verificar:** a dashboard (`solution/` ou ferramenta local, ver decisão em `anotacoes-analise.md`) foi construída pra ler o CSV bruto sem a IA interpretar os dados no meio do caminho. Antes de confiar nos números que ela mostra, era preciso confirmar que ela realmente lê o arquivo fiel ao original — não adianta tirar a IA da interpretação se a leitura em si pode estar errada.

**Método:** como não é viável conferir 5.000 linhas manualmente, a validação foi feita com uma amostra pequena e controlada:
1. Cópia do `ravenstack_subscriptions.csv` original.
2. Remoção deliberada de um pequeno número de linhas.
3. Recarregar o arquivo alterado na dashboard e conferir se a contagem de linhas bate com o esperado e se os registros removidos realmente não aparecem mais.

**Primeira tentativa — erro encontrado (meu, não da ferramenta):** ao editar a cópia, a linha de cabeçalho (nomes das colunas) foi apagada junto com as linhas de dado, sem perceber. Arquivo: `dataset-001-raw/teste-verificacao-dashboard/ravenstack_subscriptions-alterado : errado.csv` (4.990 linhas, primeira linha já é dado, sem cabeçalho).

**Segunda tentativa — correta:** refeito removendo só linhas de dado, mantendo o cabeçalho. Arquivo: `dataset-001-raw/teste-verificacao-dashboard/ravenstack_subscriptions- editado 2.0.csv` (4.990 linhas, cabeçalho preservado). Resultado: dashboard carregou certo, contagem e valores batendo com o esperado.

**Observação extra:** os dois arquivos de teste foram salvos com `;` como separador (em vez de `,`, padrão de exportação do Excel/Numbers em PT-BR). A ferramenta leu corretamente mesmo assim (detecção automática de separador).

**Conclusão:** dashboard validada para leitura fiel do dado bruto. Os 2 arquivos de teste ficam fora do repositório git (mesma regra do dataset), em `~/github/dataset-001-raw/teste-verificacao-dashboard/`, não fazem parte da entrega.
