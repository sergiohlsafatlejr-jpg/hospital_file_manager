# Executor restrito — migração 0141

## Escopo fechado

`scripts/migrations/0141-contratos-convenios-restrita.mjs` é preparação de código para a migração versionada `0141_woozy_union_jack`. Ele admite exclusivamente as três declarações aditivas, na ordem da SQL versionada `drizzle/0141_woozy_union_jack.sql`: criação de `contratos_convenios_documentos` e criação de dois índices não únicos. A chave primária e o índice único declarado dentro do `CREATE TABLE` são validados como parte do contrato físico da tabela. Não há DML, carga, leitura de linhas de negócio ou operação sobre documentos.

| Ordem | Objeto                                   | Escopo permitido                                                                                           |
| ----- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1     | `contratos_convenios_documentos`         | Uma tabela nova com 16 colunas, uma chave primária e o índice único `uq_contratos_conv_doc_contrato_hash`. |
| 2     | `idx_contratos_conv_doc_contrato`        | Índice não único em `contratos_convenios_documentos` sobre `contratoId, createdAt`.                        |
| 3     | `idx_contratos_conv_doc_estabelecimento` | Índice não único em `contratos_convenios_documentos` sobre `estabelecimentoId, createdAt`.                 |

O executor não imprime ou reproduz a SQL, não abre `.env`, não lê `DATABASE_URL`, não descobre conexão e não chama `db:migrate`, `db:push` ou migrador genérico. O CLI é somente identificador local: `--apply` falha sem executar. Qualquer aplicação depende da API do módulo e de uma factory TLS explicitamente injetada.

A 0141 não é registrada nem ativada por esta preparação. O marcador 0141 presente no journal versionado é conferido como identidade do artefato; o ledger do banco precisa permanecer sem 0141 no preflight. A única escrita prevista pela API `apply`, depois de todas as provas, é uma linha 0141 em `__drizzle_migrations`.

## Integridade dos artefatos e revisão Git

Antes de abrir conexão, o executor confere:

- SHA-256 fixo e allowlist estrutural das três declarações da SQL 0141;
- contrato físico do snapshot 0141 para a tabela nova;
- contrato físico do snapshot 0140 e SHA-256 da SQL 0140, usados como baseline pós-0140;
- marcador 0140 e marcador versionado 0141 no journal;
- âncoras históricas 0135–0139 e seus arquivos SQL;
- revisão Git (`HEAD`) e igualdade byte a byte dos artefatos verificados.

Divergência, arquivo ausente, alteração local dos artefatos ou revisão inválida bloqueiam o fluxo. O executor não altera SQL, snapshot, journal ou schema, não gera migração e não reconcilia histórico.

## Gates externos obrigatórios

O modo `apply` não possui aprovação, autorização, exceção ou alvo embutidos. O chamador deve injetar gates vigentes e uma função de verificação externa que ateste canonicamente:

- autorização e revisão de Sergio, registradas para `executor-0141`;
- digest exato da SQL, digest do executor e revisão Git;
- revisão de artefatos `0141_woozy_union_jack`;
- janela de execução válida;
- prova aplicável de backup/restauração ou exceção específica aprovada para esta migração;
- alvo canônico TiDB com referência, banco, versão e fingerprint SHA-256 do certificado TLS.

A factory `createInjectedMysql2TlsFactory` exige CA, `rejectUnauthorized`, `verifyIdentity`, SNI idêntico ao host e transporte TLS autorizado. A identidade observada em cada conexão deve coincidir com o alvo atestado. Não devem ser colocadas credenciais, strings de conexão, certificados, fingerprints reais, nomes de pacientes ou conteúdo de documentos em código, documentação, issues, logs ou PRs.

## Preflight e baseline pós-0140

O preflight é somente leitura e ocorre em duas conexões independentes. Ambas precisam retornar a mesma identidade canônica e os mesmos metadados. O estado seguro exige simultaneamente:

- layout exato de `__drizzle_migrations`;
- ledger com 101 entradas, âncoras 0136–0140 exatas, ausência da âncora 0135 e ausência do marcador 0141;
- contrato físico exato das duas tabelas da 0140 (`prontuario_pdf_anexo_eventos` e `prontuario_pdf_anexos`), inclusive colunas, nulabilidade, defaults, chave primária e índices;
- ausência integral de `contratos_convenios_documentos` no catálogo;
- estabilidade entre as duas leituras.

A existência do arquivo/journal versionado 0141 não substitui o baseline do ledger: a aplicação permanece bloqueada se a linha 0141 já existir.

## Execução única e provas independentes

Somente depois de gates e preflight estáveis o executor cria uma captura privada AES-256-GCM e um arquivo de estado exclusivo, ambos fora do repositório e com permissões privadas. Executa as três declarações uma por vez, estritamente na ordem da SQL. Após cada declaração, relê o catálogo e exige o estado incremental permitido. Na primeira falha, divergência ou incerteza, para sem retry, sem DDL compensatório, sem DML e sem journal.

Depois do terceiro DDL, uma conexão independente comprova o contrato físico final, a tabela vazia e o ledger ainda inalterado. Só então uma conexão nova inicia transação pessimista, relê/bloqueia o ledger, insere exatamente uma linha com o hash da SQL 0141 e o timestamp versionado, relê antes do commit e rejeita duplicidade, contagem inesperada ou commit incerto. Uma última conexão independente valida novamente a tabela vazia, o contrato físico e a presença única do marcador 0141, preservando todas as entradas anteriores.

A captura privada contém somente estados agregados de controle; não registra linhas de negócio. As respostas públicas retornam apenas fase, motivo sanitizado e contagens estruturais.

## Procedimento de janela

1. Confirmar a reserva única e a autorização específica da revisão na Issue #34; a 0140 continua sendo a única migração ativa nesta preparação.
2. Validar backup/restauração aplicável ou exceção específica; não inferir dispensa a partir de aprovações anteriores.
3. Entregar ao chamador somente a factory TLS injetada e gates externos já verificados; não transmitir segredos.
4. Executar primeiro `preflight`. Se não retornar `preflight-read-only`, encerrar sem DDL.
5. Para `apply`, conferir novamente digest do executor, revisão Git e artefatos atestados. Executar uma vez; não retomar ou repetir após falha parcial.
6. Registrar apenas resultado agregado sanitizado, revisão, janela e bloqueios. Não registrar dados hospitalares, linhas, conteúdo de documentos ou credenciais.
7. Liberar a reserva somente após validação independente final. A estrutura não autoriza upload, processamento, download, OCR ou ativação funcional.

## Testes sintéticos locais

`server/contratosConvenios0141Executor.test.ts` usa snapshots locais, ledger sintético, conexões fake e nenhum banco externo. A cobertura inclui preflight read-only; ausência de factory, alvo e gates; validação TLS; baseline físico pós-0140; sequência de três DDLs; parada na primeira falha; divergência de catálogo; journal duplicado; e segunda execução bloqueada por 0141 já presente.

Esta preparação não executa conexão externa, DDL real, `db:migrate`, `db:push`, migração genérica, carga de dados, backup/restauração, produção ou publicação.
