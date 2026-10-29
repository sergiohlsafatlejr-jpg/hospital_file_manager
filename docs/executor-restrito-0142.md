# Executor restrito — migração 0142

## Escopo fechado

`scripts/migrations/0142-xml-importacao-lote-restrita.mjs` é código de preparação para aplicar **somente** a migração versionada `0142_large_krista_starr`. A API do módulo aceita apenas `preflight` ou `apply`, com uma factory TLS explicitamente injetada. Não lê `.env`, `DATABASE_URL` ou credenciais, não descobre conexão e não chama `db:migrate`, `db:push` ou migrador genérico. O CLI é apenas identificador local: `--apply` falha fechado, sem abrir conexão e sem executar DDL.

O executor permite exatamente as 14 declarações byte a byte da SQL versionada, na ordem abaixo. A allowlist é o digest SHA-256 integral de cada declaração; qualquer DML, `DROP`, `TRUNCATE`, alteração textual, reordenação ou declaração adicional é rejeitada.

| Ordem | Classe | Escopo físico permitido |
| --- | --- | --- |
| 1–2 | `CREATE TABLE` | Duas novas tabelas de metadados de lote/itens XML. |
| 3–7 | `ALTER TABLE … ADD` | Cinco colunas aditivas nos três objetos de Conta Convênio/Contexto médico. |
| 8 | `ALTER TABLE … ADD CONSTRAINT` | Uma restrição única de escopo de snapshot. |
| 9–14 | `CREATE INDEX` | Seis índices explícitos da migração. |

Não há carga, leitura de linhas de negócio, DML, associação de registros, rollback compensatório, retry de DDL ou mudança fora desses objetos. O marcador 0142 versionado no journal é somente uma identidade de artefato; antes da aplicação, o ledger do banco deve continuar **sem** a entrada 0142.

## Integridade, revisão e baseline

Antes de abrir conexão, o executor exige simultaneamente:

- hashes SHA-256 fixos e igualdade byte a byte com o `HEAD` Git para SQL 0142, snapshot 0142, journal, SQL/snapshots 0140 e 0141 e âncoras históricas 0135–0139;
- SHA-256 fixo da SQL 0142 e allowlist estrita das 14 declarações individuais;
- journal versionado com marcadores exatos de 0140, 0141 e 0142, além das âncoras históricas exigidas;
- revisão Git válida e ausência de alteração local em qualquer artefato verificado;
- delta físico exato do snapshot 0142: duas tabelas novas, cinco colunas, uma restrição única e seis índices, preservando integralmente o baseline pós-0141;
- consistência entre snapshots 0140 e 0141 para as tabelas de baseline criadas pela 0140.

Arquivo ausente, hash divergente, revisão inválida, mudança local, snapshot incompatível ou journal diferente bloqueia o fluxo antes de qualquer conexão. O executor não edita artefatos, não gera migração e não tenta reconciliar histórico.

## Gates externos obrigatórios para `apply`

O código não contém autorização, alvo, janela, exceção ou segredo. O chamador precisa injetar gates vigentes e uma função externa que os ateste canonicamente. O gate deve vincular, no mínimo:

- autorização e revisão registradas por Sergio para o escopo literal `executor-0142`;
- digest exato da SQL, digest do executor, revisão Git e revisão de artefatos `0142_large_krista_starr`;
- janela válida de execução;
- alvo canônico TiDB, identificado por referência, banco, versão e fingerprint SHA-256 do certificado TLS;
- a exceção de backup específica da 0142, aprovada por Sergio e limitada a `0142_large_krista_starr`.

A exceção de backup não é inferida de outras migrações. O executor exige a forma explícita `kind: "exception"` com escopo 0142; não aceita prova ou exceção genérica. A factory `createInjectedMysql2TlsFactory` exige CA, `rejectUnauthorized`, `verifyIdentity`, SNI igual ao host, transporte TLS autorizado e `multipleStatements: false`. A identidade observada em cada conexão deve coincidir com o alvo canônico atestado.

Não inclua strings de conexão, credenciais, certificados, fingerprints reais, nomes de banco de produção, pacientes, contas, XML ou conteúdo hospitalar em código, documentação, logs, issues ou PRs.

## Preflight somente leitura

O `preflight` usa duas conexões independentes, ambas TLS/TiDB e ambas iguais ao alvo canônico. Ele lê somente metadados e exige estabilidade entre as duas leituras:

- layout exato de `__drizzle_migrations`;
- ledger de 102 entradas, âncoras 0136–0141 exatas, ausência da âncora 0135 e ausência do marcador 0142;
- baseline físico exato pós-0141 de seis tabelas: as duas da 0140, a tabela da 0141 e os três objetos que a 0142 altera;
- ausência integral das duas novas tabelas e das cinco colunas, uma restrição única e seis índices introduzidos pela 0142;
- identidade, ledger e catálogo idênticos nas duas leituras.

O preflight nunca executa DDL, DML ou escrita de journal. A existência dos arquivos versionados da 0142 não substitui a ausência da linha 0142 no ledger real.

## Aplicação única e validação independente

Após gates e preflight estáveis, `apply` cria, fora do repositório, uma captura privada AES-256-GCM e um arquivo de estado exclusivo com permissões privadas. Em seguida, executa uma única declaração por vez, em ordem. Depois de cada DDL, relê o catálogo e exige exatamente o estado físico incremental permitido para aquela posição.

Na primeira falha, divergência ou incerteza, o processo termina sem retry, sem DDL compensatório e sem escrever o journal. Não se deve retomar uma execução parcial com esse executor.

Depois do 14º DDL, uma conexão independente confirma o contrato físico final, as duas tabelas novas vazias e o ledger ainda inalterado. Só então uma nova conexão inicia transação pessimista, relê/bloqueia o ledger, insere uma única entrada 0142 com hash/timestamp versionados, relê antes do commit e rejeita duplicidade, contagem inesperada ou incerteza de commit. Uma última conexão independente valida contrato físico, tabelas vazias e marcador 0142 único, preservando todas as entradas anteriores.

A captura privada registra somente estados agregados de controle. As respostas públicas são sanitizadas por fase, motivo e contagens; elas nunca imprimem SQL, hashes, identidade de banco, segredos ou dados hospitalares.

## Limite de autorização

A existência desta PR, do executor, da SQL versionada ou a aplicação do DDL **não autoriza** importação, upload, reprocessamento, associação retroativa, materialização de contas, ativação de worker, ativação de fluxo XML ou alteração de dados já existentes. Cada uma dessas ações requer sua própria revisão, autorização operacional e controles de negócio.

A reserva da 0142 na Issue #34 e a autorização de Sergio para a exceção de backup são pré-condições de governança; a execução real permanece dependente da revisão/merge deste executor, dos gates externos vigentes e do preflight aprovado. Este documento não é autorização de produção.

## Testes sintéticos locais

`server/xmlImportacao0142Executor.test.ts` usa snapshots e hashes locais, ledger sintético e conexões fake; não abre socket nem consulta banco. A cobertura inclui:

- preflight somente leitura em duas conexões independentes;
- ausência de descoberta por ambiente e exigência de factory, alvo e gates externos;
- validação de requisitos TLS antes de conectar;
- bloqueio de objeto 0142 já existente;
- sequência exata de 14 DDLs, revalidação incremental e journal único;
- parada na primeira falha sem retry/journal;
- bloqueio de desvio físico antes do journal;
- bloqueio de journal duplicado e de segunda execução após marcador 0142.

Esta preparação não executa conexão externa, DDL real, migração genérica, carga de dados, importação/reprocessamento, backup/restauração, produção, commit ou PR.
