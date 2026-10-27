# Executor restrito 0138 — contexto médico informativo

**Situação: PR #113 autorizada e mesclada; correção focal de compatibilidade do preflight aguardando aceite. Nenhuma DDL produtiva executada.** Este documento descreve apenas o executor de `0138_known_blink`. Ele não altera a SQL, o snapshot, o journal, nem migrações anteriores. A migração é aditiva e cria exclusivamente as três tabelas informativas de contexto médico previstas no plano.

## Escopo imutável

O executor lê os artefatos locais e falha fechado se a identidade não corresponder ao contrato interno. A conferência é deliberadamente privada: nenhuma impressão criptográfica, conteúdo SQL, nome de banco, host, credencial ou dado clínico é emitido em stdout.

O contrato permitido contém exatamente sete declarações, em ordem fixa:

| Declarações | Quantidade |
| --- | ---: |
| `CREATE TABLE` para contextos, eventos e fontes | 3 |
| `CREATE INDEX` nomeados | 4 |
| Tabelas novas | 3 |
| Colunas nas três tabelas | 45 |
| Chaves primárias | 3 |
| Índices únicos de negócio | 3 |
| Índices não únicos explícitos | 4 |
| Foreign keys | 0 |
| DML clínico | 0 |

Não há `ALTER`, `DROP`, `DELETE`, `UPDATE`, importação, associação clínica, `db:migrate`, `db:push` ou mecanismo de retry. Nomes de tabelas e índices não são aceitos de forma genérica: a allowlist é restrita somente às três tabelas e aos quatro índices da 0138.

## Uso da API e CLI

A API é:

```js
await runRestricted0138({ mode: "preflight" | "apply", ...deps });
```

- `preflight` exige uma `connectionFactory` explicitamente injetada e realiza somente leituras de metadados.
- `apply` exige, além da factory, gates externos verificados, TLS, arquivo de estado exclusivo e captura privada cifrada.
- O módulo nunca importa `mysql2`, nunca lê `.env`, `DATABASE_URL` ou credenciais e nunca monta conexão automaticamente.

O CLI é intencionalmente incapaz de aplicar DDL. Sem argumentos ele mostra apenas a identificação resumida do contrato, sem abrir banco. Com `--apply`, ele falha com `dependency_injection_required`; uma integração autorizada precisa injetar todas as dependências na API. Não há prompt nem código operacional de produção no CLI.

## Conexão e preflight

A factory para mysql2 é opcional e é fornecida pelo chamador autorizado. Quando usada, requer CA, `rejectUnauthorized: true`, `verifyIdentity: true`, stream TLS cifrado, autorizado e com certificado apresentado. Cada conexão confirma TiDB, banco e versão; todas precisam ter a mesma identidade. O executor exige conexões independentes para:

1. dois preflights consistentes;
2. a execução de DDL;
3. a inspeção física posterior independente;
4. a transação de journal, depois de uma nova inspeção física fresca;
5. a validação final independente.

O preflight bloqueia se qualquer tabela alvo já existir, se uma FK tocar o escopo, se o layout de `__drizzle_migrations` não for estritamente `id` bigint unsigned auto-increment, `hash` text e `created_at` bigint, ou se o histórico anterior não estiver íntegro. Ele exige ausência do marcador 0135, presença exata dos marcadores 0136 e 0137, preservação de todos os registros históricos anteriores e ausência do marcador 0138.

O layout real tem `created_at` nullable. A definição admite `YES` ou `NO`, mas todos os valores históricos devem ser não nulos, dígitos decimais, inteiros positivos seguros e anteriores à 0138. Datas nulas, vazias, whitespace, inválidas, fracionárias, zero/negativas ou fora do limite seguro bloqueiam antes de DDL. O executor não altera a nulabilidade nem preenche/repara registros antigos para passar pelo gate.

## Gates externos de aplicação

`apply` permanece bloqueado por padrão. O callback `verifyExternalGates` é responsabilidade de um wrapper futuro autorizado; `() => true` é recusado. Ele precisa devolver um atestado canônico ligado à identidade exata da SQL e deste executor, à revisão de artefatos, à janela e ao escopo 0138.

Antes de uma conexão de aplicação/DDL, a chamada exige os sete signoffs booleanos abaixo, todos verdadeiros, mais a conferência canônica externa:

1. `authorization` — autorização específica de execução;
2. `review` — revisão humana exata;
3. `exactSql` — SQL imutável exata;
4. `executorDigest` — bytes exatos do executor;
5. `artifactsRevision` — revisão exata dos artefatos;
6. `window` — janela válida e vigente;
7. `backupExceptionOrProof` — prova externa de backup/restauração ou exceção explícita, datada e restrita à 0138.

Os gates de revisão e autorização devem estar registrados por Sergio, indicar escopo `executor-0138` e vincular SQL, executor e revisão exatos. A exceção de backup, quando usada, também é estritamente vinculada a `0138_known_blink`, possui validade e não pode ser criada pelo executor. Evidência fictícia, callback permissivo, checkpoint, cópia local, banco sintético ou a presença de dados em interface não comprovam backup, restauração, aprovação ou autorização.

**Estado em 27/10/2026:** Sergio aprovou às 10:17 a revisão da PR #113 e a 0138 restrita, incluindo o risco de ausência de backup/recuperação. O preflight original parou antes de DDL, porque exigia nulabilidade `NO` para a coluna antiga de data, enquanto a definição real informa `YES`. Não se alterou metadado para simular outro layout. O código corretivo será apresentado em PR/revisão próprias antes de novo apply. A exceção continua exclusiva à 0138 e não se declara backup ou restauração como comprovados.

## Aplicação eventual, somente após autorização externa completa

Uma integração futura autorizada deve construir dependências explícitas, por exemplo:

```js
const result = await runRestricted0138({
  mode: "apply",
  connectionFactory: createInjectedMysql2TlsFactory({ mysql, connectionOptions }),
  gates: canonicalGates,
  verifyExternalGates: verifyCanonical0138Gates,
  privateCaptureKey: keyDe32Bytes,
  privateCaptureFile: caminhoPrivado0600,
  stateFile: caminhoPrivado0600,
});
```

O executor não fornece `canonicalGates`, não fornece `verifyCanonical0138Gates`, não cria a chave, não configura a conexão e não transforma autorização textual em gate. A autorização e a revisão devem ser validadas externamente no momento da execução, não configuradas por variáveis de ambiente.

Antes da primeira DDL, o executor cria um state file exclusivo e uma captura AES-256-GCM, ambos em diretório privado (`0700`) e arquivos `0600`. Se houver estado/captura anterior, ele não reinicia. Uma falha de DDL para na primeira instrução, não faz rollback fictício nem tenta de novo. O estado parcial permanece bloqueado para investigação.

Após cada uma das sete instruções, ele compara o catálogo físico contra a assinatura esperada: colunas, tipos, nulidade, defaults, enums, `ON UPDATE`, PKs, únicos, índices, ordem e ausência de FKs. Ao final, exige três tabelas vazias, 45 colunas, três PKs, três únicos, quatro índices não únicos e nenhuma estrutura extra no escopo.

Somente depois de uma confirmação física independente — e de nova confirmação física na conexão de journal — ele tenta inserir o marcador 0138. A inserção usa transação pessimista, relê e trava todo o ledger, exige uma linha afetada e confirma que há um único marcador 0138, preservando cada linha anterior. Commit ambíguo não recebe retry. A validação final usa uma conexão independente.

## Ensaio permitido em ambiente sintético

O ensaio futuro pode usar somente banco TiDB sintético isolado e nomes/dados sintéticos, mediante factory TLS injetada. A autorização do ensaio deve ser identificada como sintética e jamais transferida para produção. O ensaio não deve usar XML, dados hospitalares, contas, credenciais ou registros reais.

A suite atual usa conexões fake e verifica: preflight somente leitura, ausência de conexão automática, gate canônico obrigatório, TLS injetado, sequência das sete declarações, parada sem retry em falha parcial, bloqueio de journal diante de divergência física, proteção do marcador 0137, journal duplicado e segunda execução não idempotente. Ela não é prova de backup/restauração, autorização de Sergio ou prontidão operacional.

Também foi concluído um ensaio separado do executor real em **TiDB 8.5.3 local isolado, com TLS verificado**. O preflight somente leitura e a aplicação das sete declarações foram aprovados, com três tabelas, 45 colunas, três PKs, três únicos e quatro índices não únicos. A sequência incluiu inspeção após cada declaração, conexão independente, journal transacional único e validação final. O histórico e os gates desse ensaio eram explicitamente fictícios; não contêm nem substituem aprovação, credenciais ou recuperação de produção. A instância sintética foi encerrada ao final.

O ensaio da correção repetiu o executor completo em TiDB 8.5.3 local/TLS, agora com `created_at BIGINT NULL` na tabela fictícia de histórico, igual à definição observada em produção. Preflight, sete DDLs, journal e validação final passaram. São 21 testes fake do executor, incluindo os dois layouts, a preservação do histórico e dez valores históricos inválidos bloqueados sem DDL/journal. Não se exportou o histórico real para o ambiente local.

## Limites preservados

Nenhum arquivo da 0137, nenhum SQL/journal/snapshot existente e nenhum schema legado é editado por este executor. Ele não executa 0135, não repara 0136/0137 e não reutiliza exceções da 0137. Não há alegação de restauração, backup ou execução produtiva neste repositório.
