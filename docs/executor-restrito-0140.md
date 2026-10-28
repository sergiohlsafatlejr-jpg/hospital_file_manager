# Executor restrito — migração 0140

## Escopo fechado

`scripts/migrations/0140-prontuario-pdf-restrita.mjs` é o único executor preparado nesta entrega para a migração integrada `0140_bumpy_quasimodo`. Ele admite exclusivamente as seis declarações versionadas, na ordem do arquivo `drizzle/0140_bumpy_quasimodo.sql`: criação de duas tabelas e criação de quatro índices não únicos. Não há DML, carga, importação, leitura de registros clínicos nem operação sobre dados de negócio.

A allowlist exata é:

| Objeto | Escopo permitido |
|---|---|
| `prontuario_pdf_anexo_eventos` | Uma tabela nova, com chave primária e dois índices explícitos permitidos. |
| `prontuario_pdf_anexos` | Uma tabela nova, com chave primária e dois índices explícitos permitidos. |
| `idx_pront_pdf_evento_anexo` | Índice não único em `prontuario_pdf_anexo_eventos`. |
| `idx_pront_pdf_evento_escopo` | Índice não único em `prontuario_pdf_anexo_eventos`. |
| `idx_pront_pdf_escopo_ativo` | Índice não único em `prontuario_pdf_anexos`. |
| `idx_pront_pdf_arquivo_hospitalar` | Índice não único em `prontuario_pdf_anexos`. |

O executor não imprime ou reproduz a SQL, não abre `.env`, não lê `DATABASE_URL`, não descobre conexão e não chama `db:migrate`, `db:push` ou migrador genérico. O CLI é somente identificador local: `--apply` falha sem executar. Qualquer aplicação depende da API do módulo e de uma factory de conexão explicitamente injetada.

## Integridade de artefatos e revisão

Antes de abrir conexão, o executor confere a identidade fixa da SQL por SHA-256, o contrato físico do snapshot 0140, o marcador 0140 do journal e a revisão Git que contém os três artefatos. Ele também exige que os bytes locais de SQL, snapshot e journal sejam idênticos aos da `HEAD` examinada. Divergência, arquivo indisponível ou alteração local bloqueiam o fluxo.

Os artefatos `drizzle/0140_bumpy_quasimodo.sql`, `drizzle/meta/0140_snapshot.json` e `drizzle/meta/_journal.json` são imutáveis para este procedimento. O executor não os altera, não gera migração e não tenta reconciliar histórico legado.

## Gates externos obrigatórios

O modo `apply` não possui aprovação, autorização, exceção ou alvo embutidos. O chamador deve injetar gates e uma função de verificação externa que ateste canonicamente, com referências vigentes:

- aprovação e autorização de Sergio, registradas para `executor-0140`;
- revisão Git, digest da SQL e digest do executor exatos;
- revisão de artefatos `0140_bumpy_quasimodo`;
- janela de execução vigente;
- prova aplicável de backup/restauração ou exceção específica aprovada para esta migração;
- alvo canônico TiDB, com referência, nome do banco, versão e fingerprint SHA-256 do certificado TLS.

A factory TLS injetada exige CA, certificado validado, `verifyIdentity`, SNI exatamente igual ao host e transporte autorizado. A identidade observada em cada conexão precisa coincidir com o alvo externo atestado. Não devem ser colocadas credenciais, strings de conexão, certificados, fingerprints reais ou quaisquer dados clínicos em documentação, logs, issues ou PRs.

## Preflight e sequência restrita

O preflight é estritamente de leitura e é repetido em duas conexões independentes. Os resultados devem coincidir e demonstrar: layout esperado de `__drizzle_migrations`; baseline de 100 entradas; âncoras íntegras de 0136 a 0139; ausência do marcador 0135; ausência integral do marcador 0140; e ausência das duas tabelas alvo.

Somente após gates e preflight estáveis, o executor cria captura privada AES-256-GCM e arquivo de estado exclusivo com permissões privadas, ambos fora do repositório. Em seguida, executa apenas as seis declarações permitidas, uma por vez e na ordem versionada. Depois de cada declaração, reinspeciona o catálogo e exige exatamente o estado físico incremental previsto. Na primeira falha, divergência ou incerteza, para sem retry, sem DDL compensatório, sem DML e sem journal.

Depois das seis declarações, uma conexão independente comprova as duas tabelas exatas, suas chaves primárias, os quatro índices permitidos, ausência de objetos alvo adicionais, tabelas vazias e histórico ainda inalterado. Somente depois dessa prova física, uma conexão nova abre transação pessimista, relê e bloqueia o ledger, insere uma única linha canônica de journal e relê antes do commit. Duplicidade, contagem inesperada ou commit incerto bloqueiam a conclusão. Uma última conexão independente verifica novamente contrato físico e marcador único de journal.

## Procedimento de janela

1. Confirmar na Issue #34 a reserva única, escopo, executor, janela exclusiva e autorização específica de Sergio para a revisão apresentada.
2. Validar backup/restauração aplicável ou exceção específica; não inferir dispensa a partir de aprovações anteriores.
3. Entregar ao chamador somente a factory TLS injetada e os gates externos já verificados. Não transmitir credenciais no código, na documentação, em chat ou em logs.
4. Executar primeiro o preflight. Se não retornar `preflight-read-only`, encerrar e preservar somente evidência técnica sanitizada.
5. Para `apply`, verificar que o digest atual do executor, a revisão Git e os artefatos permanecem exatamente os atestados. Executar uma vez; não retomar ou repetir depois de falha parcial.
6. Registrar na Issue #34 apenas revisão, arquivo, janela, executor, resultado agregado das verificações e eventual bloqueio. Não registrar segredos, identificadores clínicos, conteúdos de PDF ou linhas de dados.
7. Liberar a reserva somente depois de validação independente final e do registro sanitizado. A execução da estrutura não autoriza upload, download, inativação, importação ou qualquer ativação funcional.

## Testes sintéticos locais

`server/prontuarioPdf0140Executor.test.ts` usa uma factory fake, metadados sintéticos e nenhum banco externo. A cobertura inclui: preflight somente leitura; ausência de descoberta por ambiente; validação TLS antes de conexão; gates externos canônicos; baseline histórico; seis declarações na ordem; validação após cada declaração; parada na primeira falha; bloqueio do journal em divergência física ou duplicidade; e identidade TLS/alvo incompatível.

Esta entrega não inclui conexão a produção, DDL aplicado, homologação externa, backup, restauração ou autorização de produção. Esses itens permanecem gates operacionais externos.
