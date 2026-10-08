# IAD — primeira publicação manual dos atendimentos Hop

## Objetivo

Publicar o lote concluído de `stagion_atendimentos_parados_iad` na tabela padrão `atendimentos_unificados`, mantendo a mesma tela `/atendimentos`, seus filtros, permissões e painéis. Não existe uma tabela separada de apresentação por unidade.

A chave permanece **estabelecimento + WARLEINE + número de atendimento (`numatend`)**. Esta entrega não altera o publicador HUP, não cria estabelecimento e não contém DDL ou migração nova.

## Cadastro e carga observados

O cadastro enviado na imagem já existe como **Institudo do Endovideo do Aparelho Digestivo, ID 2550002**. A grafia foi preservada conforme o cadastro, sem criar duplicado ou corrigir o nome automaticamente.

Auditoria somente leitura em 08/10/2026: 13.439 linhas e 13.439 chaves únicas, todas pertencentes ao mesmo ID. Destino da unidade vazio. Sem paciente, convênio ou entrada ausentes, sem saída anterior à entrada e sem descrição excedendo o destino. Distribuição: 10.625 ambulatório, 2.773 exame e 41 internação; 2.921 saídas originais nulas. Nenhum valor ou identificador de paciente é registrado nesta documentação.

A prévia do executor leu o lote duas vezes e confirmou a mesma assinatura privada, destino vazio e zero integradores legados/modernos ativos para a unidade. A estabilidade em duas leituras não substitui a confirmação de que o Hop terminou.

## Concorrência no TiDB

O banco real é TiDB e todas as cinco tabelas envolvidas foram verificadas como InnoDB; não foram encontrados triggers no destino. O executor volta a checar engines, índices e ausência de triggers na execução. O TiDB suporta REPEATABLE READ/Snapshot Isolation e READ COMMITTED, **não a garantia SERIALIZABLE nem gap locks MySQL**. Um SELECT FOR UPDATE de faixa não bloqueia novas linhas inexistentes nessa faixa.

Por isso a aplicação exige uma **janela operacional exclusiva do IAD**, com Hop concluído/parado, integradores IAD inativos e sem outro usuário/processo publicando ou alterando dados/configurações dessa unidade durante a transação. Não é necessário interromper o fluxo de outras unidades.

No TiDB usa transação pessimista explícita, REPEATABLE READ, timeout de locks e retry automático desativado, locks das linhas existentes/cadastro e leituras finais em outra conexão autocommit para detectar mudanças recentes. Confere todas as origens no destino, não apenas WARLEINE. Essas checagens **não equivalem a bloqueio de novos escritores não cooperantes**; a pausa operacional é indispensável. Não é criado bloqueio global, não há nova DDL, revogação de acessos ou mudança de permissões.

Referências oficiais: [isolamento TiDB](https://docs.pingcap.com/tidb/stable/transaction-isolation-levels/) e [transações pessimistas e ausência de gap locking](https://docs.pingcap.com/tidb/stable/pessimistic-transaction/).

## Diferença de layout encontrada

A 0134 criou 13 colunas brutas. Após a carga, a tabela física passou a ter 14, com **`codpac INT NULL`** como única diferença frente ao layout HUP. Esta alteração não foi feita por esta entrega.

O executor aceita somente esse campo adicional opcional além das 13 colunas obrigatórias. Ele lê uma projeção explícita dos 13 campos de atendimento, não usa `codpac` como chave e não o copia para o destino. Não altera ou recria a staging; a reconciliação do schema desse campo extra é uma entrega separada, com fila de migração própria. O manifesto guarda uma assinatura privada do layout e deve ser regenerado se o layout mudar.

## Escopo da primeira publicação

- Somente INSERT de registros novos para o estabelecimento explicitamente informado.
- Exige destino completamente vazio para essa unidade, inclusive outras origens. Não sobrescreve, atualiza ou desativa registros existentes.
- Valida cadastro ativo, todas as linhas pertencentes à unidade, chaves únicas, campos obrigatórios, limites e datas civis.
- Preserva `data_saida = NULL` quando a origem não tem saída. A saída considerada de exames/ambulatórios é responsabilidade do cálculo/apresentação já existente da tela, não de UPDATE no banco.
- Origem WARLEINE fixa; número de atendimento estável. Datas DATETIME transferidas como strings civis, sem conversão para outro dia.
- Não preenche valores financeiros inexistentes, título, etapas ou setores por suposição.
- Não consulta outros bancos hospitalares nem promove dados financeiros.

## Operação

`scripts/publicar-hop-iad.mts` executa prévia por padrão. Usa `DATABASE_URL` já configurada e variáveis locais para estabelecimento e caminho do manifesto privado; nenhuma credencial é incluída no código.

A aplicação exige confirmação explícita de **Hop concluído**, **PR revisada ou exceção pontual autorizada**, **primeira carga** e **janela exclusiva IAD**. A intenção desta versão está fixada ao estabelecimento 2550002 e total 13.439. O manifesto contém banco, cadastro, total, assinatura do conteúdo, contrato físico canônico e assinatura do executor/validadores; nunca é publicado no Git, tarefas ou Issues. Arquivos privados são criados de modo exclusivo, com proprietário/modo conferidos, sem symlinks, e manifesto futuro ou mais antigo que 24 horas é rejeitado.

Antes do INSERT, o executor valida novamente manifesto e guardas, cria backup local criptografado em raiz privada e chave em raiz separada, persiste de forma exclusiva e relê os dois arquivos para verificar integridade. Executa em transação, insere em lotes de 200 e verifica quantidade/chaves, staging e integradores antes do commit. Falhas antes do commit causam rollback. Se o COMMIT não puder ser confirmado, o resultado é **incerto**: não reaplicar, apenas reconciliar em nova conexão. Falha ao fechar a conexão após commit confirmado não é anunciada como rollback. Logs exibem apenas agregados e fase sanitizada, nunca erros brutos do driver ou pacientes.

Backup local e chave não são publicados nem anexados. Não se trata de backup durável externo nem homologação completa de réplica TiDB.

## Revisão e liberação

[Issue #64](https://github.com/sergiohlsafatlejr-jpg/safatle-sistema/issues/64) acompanha a entrega. A autorização anterior das PRs #61/#63 e da 0134 não libera automaticamente o código ou DML desta nova entrega.

**Validação final:** 72 testes em cinco arquivos, build, `db:check`, diff e tipagem estrita do executor/helpers aprovados. `pnpm check` global mantém os mesmos 172 diagnósticos por arquivo/código, sem novos. Prévia real somente leitura aprovada com 13.439 linhas/chaves, unidade 2550002, destino vazio e integradores inativos. A aplicação sem confirmações obrigatórias foi testada e recusada antes de conexão/escrita. Nenhuma carga em produção foi executada nesta preparação.

A carga deve ser liberada após revisão de outra pessoa ou exceção pontual de Sergio para a nova PR, com confirmação do total e de que o Hop terminou. Não há rotina automática, cron ou sinal durável de lote implantado aqui.

Após a carga, validar em nova conexão contagens, isolamento por unidade, campos transferidos e o endpoint paginado da mesma tela. Não publicar dados clínicos em capturas ou documentos de evidência.
