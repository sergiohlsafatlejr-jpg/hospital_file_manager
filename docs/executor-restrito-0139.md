# Executor restrito — migração 0139

## Escopo fechado

`scripts/migrations/0139-atendimentos-restrita.mjs` é o único executor desta entrega. Ele admite exclusivamente os oito comandos, na ordem versionada, de `drizzle/0139_past_toro.sql`: três criações de tabela e cinco criações de índice. O executor não imprime nem duplica a SQL, não descobre credenciais, não lê variáveis de ambiente e não chama `db:migrate`, `db:push` ou qualquer migrador genérico.

O CLI é apenas identificador local; inclusive `--apply` falha sem executar. A aplicação só é possível pela API, mediante fábrica de conexão explicitamente injetada.

## Pré-condições obrigatórias

O executor verifica os bytes da SQL contra checksum fixo, o snapshot e o journal versionados, e a revisão Git que contém esses três artefatos. Modificação local dos artefatos ou divergência de revisão bloqueia antes de conexão.

O modo de aplicação exige gates externos injetados e verificados por uma função externa. Não há atestado embutido, nem valor padrão para exceção ou backup. A atestação externa precisa estar vinculada a:

- revisão Git, checksum da SQL e digest do executor exatos;
- aprovação e autorização registradas por Sergio para `executor-0139`;
- janela vigente;
- prova de backup/restauração ou exceção específica aprovada, ambas restritas à 0139;
- alvo canônico TiDB, incluindo identificador de referência, banco, versão e fingerprint SHA-256 do certificado TLS.

A factory TLS requer CA, validação de certificado, `verifyIdentity`, SNI igual ao host e transporte autorizado. Cada conexão compara produto, banco, versão e fingerprint do certificado ao alvo canônico. São necessárias conexões independentes para os preflights, execução, pós-validação, journal e confirmação final.

## Controles do banco

Antes de DDL, dois preflights somente leitura devem coincidir. Eles confirmam layout do histórico, baseline de 99 entradas, marcadores íntegros de 0136–0138, ausência da 0135 e ausência integral do marcador 0139, além de zero objetos alvo.

Cada unidade é executada uma única vez e imediatamente inspecionada. Na primeira falha ou divergência física, a execução encerra sem retry, sem comando compensatório e sem gravação de journal. Após as oito unidades, o executor exige em conexão independente as três estruturas exatas, índices/uniquidades esperados, tabelas vazias e histórico inalterado.

Somente depois dessa prova física o executor abre uma transação pessimista de journal, relê e bloqueia o histórico, insere uma única linha canônica e confirma a leitura. Uma confirmação incerta ou uma duplicidade bloqueia a conclusão. A validação final ocorre em outra conexão independente.

## Evidência privada

No modo `apply`, o chamador fornece um arquivo de estado exclusivo e uma captura AES-256-GCM privada. O executor grava neles somente evidência técnica necessária, com permissões privadas. Eles não são criados por preflight e não fazem parte do repositório.

## Validação sintética

`server/atendimentos0139Executor.test.ts` cobre, com fábrica fake e sem banco externo: gates externos, baseline/histórico, checksum/revisão, TLS/alvo, execução ordenada, validação por unidade, parada na primeira falha e journal único.

O executor também foi homologado em TiDB 8.5.3 local, descartável e protegido por TLS sintético. As oito declarações foram aplicadas em ordem; as três tabelas resultaram vazias; houve um único marcador de journal; e a base fictícia foi removida no encerramento. Esta evidência não é backup, recuperação, homologação de dados do Portal ou autorização para produção.
