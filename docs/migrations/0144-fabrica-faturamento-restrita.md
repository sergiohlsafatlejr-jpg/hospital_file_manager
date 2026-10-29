# Migração 0144 — Fábrica de Faturamento Safatle (executor restrito)

## Escopo e invariantes

O executor [`scripts/migrations/0144-fabrica-faturamento-restrita.mjs`](../../scripts/migrations/0144-fabrica-faturamento-restrita.mjs) é a única implementação autorizada para a aplicação controlada da migração Drizzle `0144_fabrica_faturamento_safatle`.

Ele não é um migrador geral e não descobre destino, credenciais ou `DATABASE_URL`. Não lê `.env`, não chama `db:migrate`, `db:push`, Drizzle CLI, nem executa SQL arbitrário. Conexões TLS são injetadas pelo chamador; cada conexão precisa atestar certificado, banco, versão e produto TiDB.

A migração permite exclusivamente quatro declarações `CREATE TABLE IF NOT EXISTS`, na ordem registrada no SQL original:

1. `fabrica_contas`
2. `fabrica_historico_fluxo`
3. `fabrica_erros_conta`
4. `fabrica_metas`

Os quatro hashes das declarações e o hash SHA-256 integral do SQL são pinados no executor. O SQL em `drizzle/0144_fabrica_faturamento_safatle.sql` não é reformatado, regenerado ou alterado por este fluxo.

## Artefatos atestados

O loader `loadRestricted0144Artifacts(options)` exige hashes fixos para:

- `drizzle/0144_fabrica_faturamento_safatle.sql`;
- `drizzle/meta/0143_snapshot.json`;
- `drizzle/meta/0144_snapshot.json`;
- `drizzle/meta/_journal.json`.

Em produção ele também exige que esses bytes e o próprio executor sejam idênticos à revisão `HEAD` e que não haja diff local neles. O snapshot 0144 deve apontar para o ID do snapshot 0143, manter todos os objetos históricos sem edição e acrescentar apenas as quatro tabelas alvo. O journal atual é pinado com a entrada `idx: 144`, tag `0144_fabrica_faturamento_safatle` e timestamp `1793303472606`; a entrada 0143 também é conferida.

A injeção de `approvedRevision` existe somente em `NODE_ENV=test`, com `allowTestRevisionInjection: true` e `root` diferente do worktree de produção. Ela serve para fixtures e não é um bypass disponível no fluxo de produção.

## Interfaces exportadas

| Export | Assinatura | Finalidade |
|---|---|---|
| `loadRestricted0144Artifacts` | `async ({ root, approvedRevision, allowTestRevisionInjection } = {})` | Carrega e atesta SQL, snapshots e journal. |
| `read0144Catalog` | `async (connection)` | Lê apenas catálogo `information_schema` das quatro tabelas alvo. |
| `preflightRestricted0144` | `async ({ connectionFactory, canonicalTarget, root, now, ... } = {})` | Executa preflight read-only com duas conexões TLS independentes. |
| `applyRestricted0144` | `async ({ connectionFactory, gates, verifyExternalGates, preflight, root, now, ... } = {})` | Executa as quatro DDL uma única vez e registra o marker após verificação independente. |
| `runRestricted0144` | `async ({ mode: "preflight" | "apply", ... } = {})` | Faz preflight ou preflight seguido de aplicação. |
| `getRestricted0144ExecutorDigest` | `()` | Retorna o digest de funções de controle, que deve coincidir com o valor pinado. |
| `createInjectedMysql2TlsFactory` | `({ mysql, connectionOptions } = {})` | Adaptador opcional para `mysql2/promise` com TLS estritamente configurado. |

Os retornos são sanitizados: não incluem host, nome de banco, fingerprint, SQL, catálogo nem segredos.

## Preflight obrigatório

O preflight só lê `information_schema` para os quatro destinos e o ledger `__drizzle_migrations`. Ele abre duas conexões distintas e exige, nas duas:

- TLS verificado, produto `TiDB`, `databaseName`, `serverVersion` e fingerprint SHA-256 válidos;
- identidade idêntica e igual ao `canonicalTarget` injetado;
- catálogo idêntico entre as duas leituras;
- todas as quatro tabelas, suas colunas, índices e FKs ausentes;
- zero FKs associadas aos alvos;
- layout esperado do ledger;
- uma e somente uma linha do baseline 0143, com o hash SQL pinado;
- ausência total do timestamp ou hash do marker 0144;
- nenhum timestamp de ledger posterior ao baseline 0143.

O comprovante de preflight contém somente hora, referência canônica e atestações derivadas do catálogo/identidade e do ledger. Para aplicar, ele precisa ter no máximo cinco minutos e a referência de alvo deve continuar igual. O executor relê o baseline imediatamente antes da primeira DDL e exige igualdade integral com a atestação anterior; confirma novamente catálogo e ledger depois de cada DDL. Alteração de qualquer linha histórica do ledger interrompe a execução, mesmo que não haja um marker novo.

## Gates de aplicação

O modo `apply` exige todos os signoffs abaixo, validados por `verifyExternalGates`:

- `authorization` e `review` com hash do SQL, hash do executor, revisão Git e `ARTIFACTS_REVISION` exatos;
- `exactSql`, `executorDigest`, `artifactsRevision` e `gitRevision` marcados;
- janela com emissão anterior e expiração futura, sem exceder cinco minutos de duração nem cinco minutos a partir da hora de validação;
- `backupExceptionOrProof`, específico para a tag 0144, com exceção autorizada ou prova verificada;
- `canonicalTarget` com os mesmos produto, banco, versão e fingerprint observados via TLS;
- verificação externa canônica `restricted-0144-v1` retornando os mesmos digests e revisão.

O digest retornado por `getRestricted0144ExecutorDigest()` é comparado ao valor literal pinado `EXPECTED_EXECUTOR_FUNCTION_SHA256` antes de qualquer DDL. Portanto alterações nas funções que compõem o digest exigem nova revisão e nova autorização explícita.

## Execução e marker

Cada DDL é executada uma vez, sem retry, repair, compensação, `DROP`, `TRUNCATE`, DML de negócio ou leitura de dados de negócio. Uma falha ou divergência interrompe a execução e preserva o estado já criado para investigação; o executor jamais transforma uma existência parcial em correção automática.

Após as quatro estruturas passarem em validação completa contra o snapshot — contagem, ordem e tipos de colunas, nulidade, defaults, `AUTO_INCREMENT`, `ON UPDATE`, PK, todos os índices e zero FKs — uma conexão independente verifica novamente o resultado e a estabilidade do ledger.

Somente então o executor abre uma transação `BEGIN PESSIMISTIC`, trava o ledger com `FOR UPDATE`, relê seu baseline e insere o marker exato:

- `hash`: SHA-256 do SQL 0144 original;
- `created_at`: `1793303472606`.

A transação envolve somente o marker e é compatível com DDL autocommit de TiDB. Uma última conexão independente exige uma única linha marker e o baseline restante inalterado.

## Exceções aprovadas 0144

Apenas para esta entrega, Sergio autorizou expressamente a aplicação sem backup/restauração comprovados e sem homologação TiDB, ciente de criação parcial sem recuperação comprovada. Testes sintéticos não são homologação TiDB e checkpoint de código não é backup de dados.

A exceção aprovada para 0144 é estritamente limitada às quatro DDL de criação acima e ao marker técnico do ledger Drizzle após validação completa. Ela **não** autoriza importação, carga, `INSERT` de dados de negócio, atribuição de responsáveis, alteração de contas existentes, reparo de estado parcial, `UPDATE`, `DELETE`, `DROP` ou `TRUNCATE`.

## Validação local sem banco

A suíte usa somente conexões sintéticas e fixtures locais:

```bash
node --test tests/scripts/0144-fabrica-faturamento-restrita.test.mjs
node --check scripts/migrations/0144-fabrica-faturamento-restrita.mjs
```

Ela cobre: artefato sujo/hash divergente, gates ausentes, TLS divergente, baseline/ledger inválido, tabelas parcialmente existentes, ledger historicamente alterado após preflight, falha DDL sem retry, divergência intermediária, mudança tardia no ledger e sucesso das quatro DDL com marker único.
