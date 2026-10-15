# Integrador EASYLocal — reutilização de stagings existentes

## Escopo desta entrega

Issue [#89](https://github.com/sergiohlsafatlejr-jpg/safatle-sistema/issues/89), branch `feat/easylocal-stagings-existentes`.

Esta entrega prepara **a seleção e o vínculo persistido** das quatro stagings existentes. Não cria cópias, não recria tabelas e não inicia cargas ou horários. O código necessita revisão por Pull Request e publicação posterior; este documento não comprova implantação.

## Destinos permitidos

| Unidade   | Domínio      | Destino existente                        | Campos físicos observados |
| --------- | ------------ | ---------------------------------------- | ------------------------: |
| Urológico | Atendimentos | `stagion_atendimentos_parados_urologico` |                        13 |
| Urológico | Faturamento  | `stagion_faturado_recebido_urologico`    |                        43 |
| IAD       | Atendimentos | `stagion_atendimentos_parados_iad`       |                        14 |
| IAD       | Faturamento  | `stagion_faturado_recebido_iad`          |                        43 |

A auditoria de 15/10/2026 consultou **somente metadados**, sem pacientes, linhas clínicas ou financeiras. IAD tem um campo adicional de cadastro da origem; a ordem dos campos também pode diferir da origem. Isso não autoriza alterar o layout para igualá-lo ao Urológico.

O contrato físico é próprio de cada staging. Ele preserva nomes, tipos, ordem e nulabilidade observados, inclusive `Estabelecimentos_id` em atendimentos e `estabelecimentos_id` no financeiro. Não são exigidas ou acrescentadas as colunas técnicas das tabelas novas (`_id`, `estabelecimento_id`, `_sincronizado_em`).

Só são aceitos os pares de unidade, staging, domínio e origem aprovados no código. Tabelas finais, nomes arbitrários, outras unidades e troca HUP↔IAD não entram nesse catálogo.

## Como funcionará a tela após a publicação

1. Selecionar o estabelecimento do Portal.
2. Na aba **Tabelas**, conferir as stagings disponíveis para vínculo e eventuais incompatibilidades. A consulta da lista não registra nem modifica nada.
3. Na aba **Leituras**, escolher **Destino no Portal**: tabela nova do integrador ou staging existente da unidade.
4. Para staging, o par de origem e domínio é previamente definido; o servidor repete a validação.
5. Ao selecionar a origem, a tela consulta metadados e preenche `estabelecimentos_id` se o campo realmente existir. Não depende de um teste manual de conexão a cada configuração.
6. Informar/revisar o valor do estabelecimento **no EASYLocal**. Esse valor não é presumido igual ao ID interno do Portal.
7. Revisar e confirmar o vínculo. A associação fica persistida e reaparece na lista de configurações; o valor pode ser reaproveitado no mesmo contexto de origem/unidade.

**Confirmar vínculo grava apenas metadados de configuração. Não importa dados hospitalares nem ativa horários.** A frequência desejada é uma intenção salva, não uma agenda ativa.

A senha continua cifrada no servidor; o navegador não recebe a credencial armazenada. Neste fluxo, EASYLocal é somente origem e Portal é o destino.

## Persistência sem nova migração

O vínculo usa as estruturas de catálogo já existentes: `integracao_tabelas`, `integracao_conexoes` e `integracao_mapeamentos`. O descritor de staging é separado do descritor de tabela nova. Nomes físicos e identidade da unidade não são traduzidos para o prefixo reservado das tabelas criadas pelo assistente.

O cadastro é uma transação, serializada pela unidade. O contrato físico é novamente conferido antes de gravar o registro; nomes já ocupados por outro contrato são rejeitados. Não há execução de `CREATE`, `ALTER`, `DROP` ou `TRUNCATE`, nem mudança no histórico Drizzle.

## Por que cargas e horários de staging continuam bloqueados

A auditoria encontrou:

- **Nenhuma das quatro stagings possui chave primária ou índice único.** `numatend` é candidato de negócio para atendimentos, mas sua unicidade, ausência de nulos e estabilidade precisam ser verificadas no recorte antes de uma carga.
- O financeiro não oferece, pelo layout, uma chave estável evidente de cada item. **Número da conta, guia ou fatura não pode ser presumido único**: uma conta pode possuir diversos itens.
- Valores financeiros na origem são `double precision`, enquanto os destinos usam `DECIMAL(15,2)` ou `DECIMAL(15,4)`. A política de conversão, arredondamento e confronto de agregados precisa ser validada, não silenciosamente aplicada.
- A situação do Hop e de outros escritores é **não confirmada**. Cadastrar a staging não equivale a autorizar seu uso exclusivo pelo EASYLocal.

Por isso, esta versão não apresenta ações de importar/configurar horário nas leituras de staging. O servidor também bloqueia prévias de importação, retomada e callbacks existentes destinados a esse contrato — esconder um botão não é a única proteção.

O fluxo atual de **tabelas novas** permanece separado, com suas prévias, confirmação, limites e horários persistidos. Esta entrega não modifica sua estratégia de escrita.

## Próxima liberação de uma carga real

Antes de habilitar um escritor de staging:

1. Escolher unidade, destino, origem e valor de estabelecimento específicos.
2. Validar o recorte por agregados e fechar a estratégia de chave/idempotência; no financeiro, fechar também precisão e conversão.
3. Confirmar o lote completo e a pausa/exclusividade de Hop e publicadores concorrentes.
4. Implementar e revisar o adaptador de escrita próprio; eventual necessidade estrutural entra na fila de migrações da Issue #34.
5. Obter autorização específica para a carga inicial e validar seu resultado por contagens/agregados.
6. Somente depois, revisar e autorizar separadamente o horário automático.

Não há substituição automática por snapshot, exclusão de registros ausentes, limpeza de staging ou promoção para tabelas finais nesta entrega.

## Relação com as páginas finais

O caminho permanece:

**EASYLocal → staging da unidade → validação/adaptador do domínio → tabela/visão consumida pela página.**

Escolher domínio Atendimentos ou Faturamento não publica automaticamente em Atendimentos, Conta Convênio, BI ou Conciliação Cruzada. Os adaptadores existentes continuam independentes; não são executados por salvar este vínculo.

## Validações

Os resultados finais dos testes unitários, regressão, build, `db:check`, comparação TypeScript com a main e QA sintético serão registrados na Pull Request. A auditoria e os simuladores desta tarefa não autorizam nem comprovam execução em produção.

### Resultado da validação desta branch — 15/10/2026

- **205 testes passaram**, em 27 arquivos EASYLocal; 10 testes de integração externa permaneceram desativados. Nenhum desses testes executou uma carga real em produção.
- Build, `db:check` e `git diff --check` aprovados. `db:generate` não foi necessário porque não há alteração de schema ou migração nesta entrega; não foi executado `db:migrate`.
- TypeScript mantém **172 diagnósticos legados**, com o mesmo inventário por arquivo/código da base e nenhum diagnóstico novo no escopo.
- Os quatro contratos do código conferem com a auditoria somente de metadados: 13/43 campos HUP, 14/43 campos IAD e zero índices únicos observados.
- QA de navegador com dados fictícios: desktop e celular 390 px, isolamento das unidades, detecção da coluna, valor não presumido, confirmação antes de gravar, reuso restrito do vínculo, ausência de ações de carga/agenda de staging e ausência de overflow. Todas as chamadas externas foram bloqueadas nesse ensaio.
- As barreiras do servidor foram exercitadas também com confirmação manual assinada, execução paginada, retomada e callback previamente existente. O destino de staging foi recusado antes da leitura de registros ou da escrita de dados.

**Não houve merge, deploy, DDL, DML, registro de staging, importação ou ativação de horário em produção nesta entrega.** A revisão humana e a liberação do código continuam pendentes. Uma liberação de código não substitui a autorização operacional da carga.
