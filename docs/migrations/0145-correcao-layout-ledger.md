# 0145 — correção pontual do preflight do ledger

A PR #158 foi mesclada na main como `e25c7c42ce6540b4ca2e4eeb3e70d23933ff199f`. O preflight verificado retornou bloqueio com **zero DDL, zero marker e nenhum resultado de escrita incerto**.

A conferência somente de catálogo em duas conexões independentes confirmou o layout legado de `__drizzle_migrations`: `id` bigint unsigned não nulo e auto_increment; `hash` text não nulo; `created_at` bigint anulável, com default nulo. A fixture da PR #158 modelava incorretamente `created_at` como não nulo. O problema está na expectativa do validador preparado, não em uma alteração recente ou corrupção demonstrada do banco.

Esta correção muda somente o wrapper para exigir o layout real. Não executa ALTER no ledger, não altera registro histórico, SQL 0145, schema, journal/snapshots ou executor restrito original. Tipos, posições, defaults, extras e nulabilidade de todas as colunas continuam explícitos; qualquer diferença de layout ou alteração entre conexões/etapas bloqueia o procedimento.

A possibilidade de NULL na definição física **não** autoriza marcadores nulos: as verificações do conteúdo preservam IDs válidos, hash/timestamp exatos, unicidade e histórico estável. Novo teste rejeita registro legado com `created_at` nulo antes da primeira DDL. A fixture de caminho completo representa agora o catálogo real, e novo negativo rejeita uma mudança da nulabilidade física.

A reserva 0145 continua ativa na Issue #34. A exceção específica de Sergio sem backup/recuperação/homologação permanece restrita à 0145; este ajuste exige apresentação e aceite da revisão exata antes de nova tentativa. Não há autorização para modificar ledger, reparar dados, repetir DDL às cegas ou usar db:migrate/db:push geral.

Validação: 101 testes Node aprovados; build, db:check e diff aprovados. A base e25c7c4 foi revalidada com 633 testes Vitest e 187 diagnósticos TypeScript legados, zero novos. Esta correção não altera arquivos TypeScript nem sua configuração.

Coordenação: main avançou para 9c5c839 durante a validação, com uma entrega adicional em 18 arquivos. Esta branch permanece em e25c7c4 mais a correção do preflight; não incorpora nem autoriza publicar essa entrega concorrente.
