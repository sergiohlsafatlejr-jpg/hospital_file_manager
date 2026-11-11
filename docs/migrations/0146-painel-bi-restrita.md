# 0146 — procedimento restrito, preparado para revisão

## Estado e escopo exato

Preparado offline na branch `fix/bi0146-isolamento-procedimento`, a partir de `4543b484a54be99de5a621c2a95cb29013fe1c91`. Nenhuma execução real, homologação ou aprovação humana é comprovada por este documento ou pelos mocks. O parent é o eventual executor final e informa ter registrado a reserva e a exceção específica na Issue #34. Essas evidências devem ser autenticadas pelo leitor confiável; a preparação não autentica o aceite por conta própria nem substitui revisão final.

**A SQL exata e o snapshot integrados definem uma tabela aditiva com 12 colunas.** Os nomes são `id`, `estabelecimento_id`, `tema_preset`, `logo_url`, `nome_exibicao`, `titulo_relatorio`, `rodape_texto`, `configuracao_json`, `atualizado_por_id`, `atualizado_por_nome`, `created_at`, `updated_at`. Há uma PK (`id`) e um UNIQUE (`estabelecimento_id`), sem FKs. O executor exige esse contrato exato no manifesto; o teste de um manifesto sintético com 13 colunas confirma a rejeição de escopo incompatível. SQL/schema/snapshot/journal permanecem imutáveis.

A SQL imutável é `drizzle/0146_painel_bi_personalizado.sql`; SHA-256 `75532edc571deec6acd128f126a4a41b75d704d8de268d358249bd6a161dfc30`; marker `created_at=1794400248375`. O único CREATE envia todos os bytes UTF-8 do arquivo, inclusive ponto-e-vírgula e newline, sem divisão ou reordenação.

## API e aprovação externa

O módulo `scripts/migrations/0146-painel-bi-restrita.mjs` exporta:

- `loadRestricted0146Attestation()`: somente arquivos locais e Git; não abre conexões.
- `preflightRestricted0146(options)`: dois leitores físicos novos, após gates, atestação e Git limpo.
- `applyRestricted0146({ ...options, preflight })`: consome exatamente o objeto opaco emitido nesta instância; nunca JSON, clone ou comprovante de outra revisão/processo.
- `assert0146LedgerBaseline(ledger)` e `assert0146CommittedLedger(baseline, observed)`: helpers puros, sem política permissiva injetável ou emissão de tokens.
- `createInjectedMysql2TlsFactory({ mysql, connectionOptions })`: factory opcional sem descoberta de credenciais/alvo e sem conexão ao ser construída.

`options` tem somente `canonicalTarget`, `createConnection` e `readIssueApprovalManifest`. Não há `gates` ecoados para inventar aprovação, `root`, `now`, baseline arbitrária, `allowTestRevisionInjection` ou CLI. O leitor recebe `{ issue: 34, migrationTag, approvalRevision }` e devolve o manifesto abaixo. O parent deve implementar esse leitor a partir de evidência independente e confiável de Sergio/Issue #34, verificável por ele; uma função que retorna um objeto fabricado ou ecoa dados do executor **não autentica aprovação**. O módulo valida campos, vínculo, janela e estabilidade; não consegue provar a origem humana de um callback desonesto. Nunca preencher documentos, referências, flags ou hashes como se fossem evidência real.

### Contrato do manifesto

```text
approvedBy: 'Sergio'
issue: 34
scope: ['0146_painel_bi_personalizado']
approvalRevision, reviewRevision, gitRevision: revisão final inteira de 40 hex
reviewReference: referência real da revisão
exactSql: SHA-256 exato acima
fileSha256: mapa INTEGRAL retornado por loadRestricted0146Attestation
canonicalTarget: alvo abaixo, sem certificatePem
physicalContract: { tables: 1, columns: 12, primaryKeys: 1, uniqueIndexes: 1, empty: true }
authorization: { reference, operator, operation: 'applyRestricted0146', only0146: true }
reservation: { reference, issue: 34, status: 'MIGRAÇÃO RESERVADA', exclusive: true,
  migrationTag: '0146_painel_bi_personalizado', revision: revisão final, operator }
window: { issuedAt, expiresAt } // epoch ms; duração máxima 300000, ainda válida
backupExceptionOrProof: uma das alternativas abaixo
```

Ambas as alternativas de backup exigem `migrationTag` exato, `approvedBy:'Sergio'`, `confirmed:true`, `confirmationReference` e `riskReference`. Prova: `kind:'proof'`, `durable:true`, `restorationVerified:true`, `proofReference`, `restorationReference`, `recoveryOwner`, `retentionReference`. Exceção única: `kind:'exception'`, `exceptionAuthorized:true`, `waivedRequirements:['backup','recovery','homologation']`, exatamente nessa ordem e somente para 0146. Exceção da 0145 não se transfere. Sem uma destas evidências, falha antes de abrir conexão. Referências são identificadores seguros de evidência, não texto livre, segredos ou dados hospitalares.

O mapa de atestação inclui SQL 0144/0145/0146, snapshots 0144/0145/0146, journal, ambos schemas, wrapper integrado 0145 e os três novos arquivos 0146. Os artefatos integrados têm hashes fixos privados. Os arquivos novos são comparados byte a byte com Git e seus hashes integrais entram no manifesto, sem hash autorreferente constante. A primeira atestação explícita fixa a revisão/bytes na instância; nenhuma leitura acontece no import. Alteração posterior exige nova instância e nova aprovação/preflight. Git deve estar totalmente limpo, inclusive untracked, e todos os arquivos revisados precisam constar na revisão final. **Os arquivos recém-preparados ainda não versionados bloqueiam o uso operacional; esta tarefa não faz commit/push.**

### Alvo canônico

`canonicalTarget` deve conter `{ reference, host, databaseName, serverProduct:'tidb', serverVersion, certificateFingerprint, certificatePem }`. Host DNS canônico, database identificador simples, versão TiDB exata e fingerprint SHA-256 de certificado leaf são privados. O certificado é conferido por validade, hostname e hash; não substitui confiança de cadeia no handshake. `certificatePem` não entra no manifesto público do contrato; host/fingerprint/alvo tampouco aparecem nos relatos sanitizados.

## Contrato do adapter físico

`createConnection()` deve abrir uma sessão física nova a cada chamada, nunca pool reaproveitando objeto, connection ID ou objeto TLS já observado. Todos os adapters, inclusive leitores, oferecem métodos vinculados `query(sql, params)`, `execute(sql, params)`, `getIdentity()`, `close()`, `beginTransaction()`, `commit()`, `rollback()`.

`query` devolve `{ rows: [objetos] }` ou a lista diretamente, com as chaves do catálogo sem normalização permissiva. `execute` recebe o CREATE exato ou o INSERT parametrizado e devolve `{ affectedRows: 1 }` para o INSERT. DDL não é agrupada em transação; `beginTransaction()` inicia **BEGIN PESSIMISTIC** no TiDB, jamais no-op, e `commit/rollback` são reais da mesma sessão. `getIdentity()` devolve `{ tlsVerified:true, host, databaseName, serverProduct:'tidb', serverVersion, certificateFingerprint, connectionId, tls }`; `tls` é um objeto independente por sessão, estável pela vida da sessão, com `{ verified:true, host, certificateFingerprint }`. O identity deve vir do socket certificado e `DATABASE()/VERSION()/CONNECTION_ID()` reais, não do manifesto/configuração. Troca de socket/sessão/fingerprint ou conexão TLS não autenticada bloqueia.

A definição real de options de 14xx está em `scripts/migrations/0144-fabrica-faturamento-restrita.mjs:459–481`, e a implementação/tipos instalados em `node_modules/mysql2/lib/base/connection.js:333–381` e `node_modules/mysql2/typings/mysql/lib/Connection.d.ts`. Não foi adivinhada outra API. A factory nova recebe `mysql2/promise` já carregado e options privados completos; exige `host`, `database`, `ssl.ca`, `ssl.rejectUnauthorized:true`, `ssl.verifyIdentity:true`, `ssl.servername === host`. mysql2 efetivamente usa `config.host` para SNI e hostname; `ssl.servername` é somente a guarda explícita do contrato legado. `multipleStatements:true`, `stream` customizado e debug habilitado são recusados. A factory força `multipleStatements:false`, `supportBigNumbers:true`, `bigNumberStrings:false`; inteiros seguros do ledger ficam números como na assinatura integrada, e inteiros grandes não são arredondados silenciosamente. Representações de linhas precisam coincidir exatamente com a assinatura existente, não são reassinadas.

A factory verifica `socket.encrypted`, `socket.authorized`, ausência de `authorizationError`, `checkServerIdentity(host, peer)`, certificado raw e socket estável antes de consultas. Ela envia DDL com `raw.query(sql, params)` em protocolo texto para manter os bytes exatos; não interpreta um resultado de DDL como INSERT. Não usar o adapter legado 0144 diretamente: ele não possui o contrato transacional/session/TLS completo exigido aqui. Quando usar a factory opcional, passar `factory.createConnection.bind(factory)` como `options.createConnection` e preservar essa mesma função no apply.

## Sequência e invariantes

1. Gates externos, alvo/certificado, bytes integrados/Git/revisão final limpos. Nenhum acesso de banco antes disso.
2. Duas sessões novas abertas independentemente; leituras sequenciais por sessão somente do catálogo restrito e ledger. Tabela 0146 deve estar ausente no catálogo, inclusive colunas/índices/FKs órfãos.
3. Layout ledger exato: `id bigint unsigned NOT NULL auto_increment`, `hash text NOT NULL`, `created_at bigint NULL`, defaults NULL e posições 1/2/3. Não modificar ledger/schema.
4. Baseline **sempre 106**: primeiras 105 com três identificadores legados e assinatura integral fixa `ddba1fe00d43958df2e585b43887c52b495736cce7a508279518b9dcd9bbb452` (stable da 0145 e ordenação numérica por id), marker 0144 exato e só o marker 0145 adicional `{hash:cde762c7cfdb9626ec948ba22ffd069790ff8e974b3fcc469d428a9022b215c1, created_at:1793720945369}`. IDs únicos/positivos e timestamps inteiros seguros. Marker 0146 ausente. Nenhuma baseline nova permissiva, reparo ou captura substituindo assinatura.
5. Token opaco em WeakMap, single-use, TTL estrito menor que 5 min, relógio real, mesma factory/leitor/alvo. Relê atestação e manifesto antes de CREATE, INSERT e commit. Exclusão por host/database entre factories no processo; depois de tentativa CREATE o alvo nunca recebe outra CREATE nessa instância, mesmo com outro token. A exclusão entre processos depende da reserva exclusiva real #34; não é demonstrada por um Set.
6. Sessão escritora nova refaz baseline; envia o único CREATE exato uma vez. Contador é incrementado antes da chamada, mesmo em timeout.
7. **Conexão nova antes do marker** verifica tabela BASE TABLE, 12 nomes/posições/tipos/null/default/extra, PK e UNIQUE exatos com unicidade, sequência/prefixo/BTREE e ausência de FKs de entrada e saída. Somente depois verifica `COUNT(*)=0` da tabela alvo. Nenhuma linha de negócio é retornada. Reconfere a sessão escritora também.
8. Só após a prova física: `BEGIN PESSIMISTIC`, leitura de todas as linhas ledger `FOR UPDATE`, comparação integral da baseline, nova conexão física de verificação antes do INSERT e nova leitura bloqueada. INSERT parametrizado exato da 0146; `affectedRows=1`; conferência de todas as linhas baseline e único marker adicional antes do commit.
9. Commit uma única vez; depois **outra conexão nova**, diferente de todas anteriores, repete prova física/contagem/layout/ledger e preservação integral das 106 linhas. Só este sucesso produz `complete`.

Tipos inteiros com display width, `CURRENT_TIMESTAMP()`/`(now())`, strings default com aspas SQL e `DEFAULT_GENERATED` são representações explicitamente normalizadas. Mudanças reais de tipo, ordem, nullable, valor default, autoincrement/on-update, PK/UNIQUE/prefixo/índice adicional/FK ou count não zero falham. SQLs de dados limitam-se ao ledger e COUNT da tabela recém-criada; catálogo restrito ao alvo, referências ao alvo e layout ledger. Identity usa apenas DATABASE/VERSION/CONNECTION_ID. Nunca há consultas de pacientes ou outras tabelas de negócio.

## Falhas e risco residual

Relatos retornam somente `ok/phase/reason`, `ddlCount`, `ddlVerifiedCount`, flags `uncertain/ddlOutcomeUncertain/journalOutcomeUncertain/noRetry/retryAllowed:false` e contagens contratuais. Erros do driver/Git, SQL bruto, credenciais, alvo, fingerprint, IDs e linhas não são propagados ou logados. Primeira falha/ambiguidade interrompe; nunca retry, DROP, ALTER, TRUNCATE, DELETE, reconciliação ou reparo. Rollback é somente best-effort de marker antes de tentar commit, nunca de CREATE e nunca prova de recuperação. Commit ambíguo não é repetido nem seguido de rollback enganoso; marker sem pós-leitura confirmada fica incerto.

DDL TiDB pode autocommit: uma tabela pode existir mesmo após erro. Sem backup/restauração/homologação separada, a exceção deixa risco explícito de recuperação não demonstrada. Leituras e FOR UPDATE reduzem janelas, mas não substituem manutenção exclusiva: escritor externo pode alterar catálogo/dados/ledger entre checkpoints; concorrência fora do procedimento precisa estar bloqueada operacionalmente. Certificado pinado pode rotacionar e exigir nova revisão/manifesto. Uma falha exige suspender reserva e preservar evidências sanitizadas para decisão humana, não novo preflight para reaplicar.

## Testes offline

Executar com Node LTS atual pelo PATH:

```sh
node --test tests/scripts/0146-painel-bi-restrita.test.mjs
git diff --check
```

Testes usam banco/factory TLS, Git/atestação e evidência sintéticos. A baseline fixture de 105 linhas não pode ter o digest de produção: o hash criptográfico é remapeado **somente nos mocks de teste e somente para os bytes integrais de uma única fixture sintética conhecida**. Mutação de qualquer linha não recebe o remapeamento. Há teste separado sem esse remapeamento provando que baseline sintética e políticas inventadas são rejeitadas. Isso permite exercitar caminhos completos sem ler banco ou capturar linhas reais; não constitui confirmação física, autorização ou validação do digest de produção. Os pins SQL/snapshot/journal e demais hashes usam SHA-256 real nos testes.

`pnpm db:check` é somente verificação estática Drizzle e pode usar URL sintética explicitamente injetada para satisfazer o carregamento do config; nunca executar `db:generate`, `db:migrate` ou `db:push` nesta migração integrada. A revisão exata, exceção e reconhecimento das 12 colunas devem ser autenticados pelo parent antes da janela; este documento não libera a aplicação.

### Resultado desta preparação

Em 11/11/2026, Node pelo PATH `v22.23.4`: `node --check` do módulo aprovado; `node --test tests/scripts/0146-painel-bi-restrita.test.mjs` com **109 testes aprovados, zero falhas/skips**; `git diff --check` aprovado no estado local consultado. Estas são verificações offline, não homologação/banco reais. Build e `db:check` da release são responsabilidade do parent; não foram novamente executados por este executor preparador.

A branch foi posteriormente trocada pelo parent para `fix/bi0146-isolamento-procedimento`, com HEAD-base ainda `4543b484a54be99de5a621c2a95cb29013fe1c91`. Mudanças concorrentes de aplicação são do parent/outras responsabilidades e não foram tocadas por esta preparação.

**Atenção ao versionamento:** `.gitignore:114` contém `*.mjs`, então os dois novos `.mjs` são ignorados e não aparecem no status comum. Não foram feitos staging, commit, push ou alteração do ignore. O parent deverá incluí-los explicitamente na revisão (por exemplo, staging autorizado com `git add -f` dos dois caminhos exatos), junto à documentação, antes de revisão final e Git limpo. Arquivo ignorado não versionado nunca passa a comparação byte a byte com `git show` no executor; sua ausência no status não autoriza execução.

Hashes imutáveis reconferidos após a suíte: SQL 0146 `75532edc571deec6acd128f126a4a41b75d704d8de268d358249bd6a161dfc30`; snapshot 0146 `5b1680148c9715694a1f5304f082acf285552cfea269836f43a7d10758d1645d`; journal `b436eab13fe8d161f44b33b8e59e99429debf4748f813004491f43ceb331f00e`. Todos preservados.
