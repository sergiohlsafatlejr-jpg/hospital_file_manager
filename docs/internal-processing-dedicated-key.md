# Chave dedicada para o processamento interno

A correção sobre `4cd3b91` separa a autenticação do processamento de arquivos da chave gerenciada das sessões. Não altera login, parser, mapeamento de planilha, barra de progresso, schema, migrations, filas ou dados existentes.

## Seleção e validação

`server/internalFileDispatch.ts` exporta `resolveInternalProcessingSecret`, utilizado tanto pelas precondições dos endpoints quanto pelo emissor e pelo processador em `server/fileProcessor.ts`.

Se `INTERNAL_PROCESSING_SECRET_KEY` estiver presente, seu valor deve ter exatamente 64 dígitos hexadecimais. Uma variável vazia, curta ou fora desse formato bloqueia o processamento, mesmo quando existe um JWT válido. Nenhum valor é derivado, normalizado ou gerado pela aplicação.

Somente quando a variável dedicada está ausente é permitido usar `JWT_SECRET`, exigindo pelo menos 32 caracteres. O processador aceita exclusivamente o mesmo valor selecionado pelo emissor. Configurar a chave dedicada não modifica nem invalida as sessões JWT.

A chave deve ser produzida a partir de 32 bytes criptograficamente aleatórios, independente do JWT e das chaves Inter/RPA, e cadastrada exclusivamente no formulário seguro. Nunca incluir valor, hash ou fragmento em chat, Git, logs, Issues, PRs, capturas ou relatórios.

## Proteções preservadas

O emissor valida a chave e o identificador antes do acesso ao banco, conserva a evidência persistente de reconciliação antes do HTTP e não repete automaticamente uma tentativa com resposta incerta. O processador recusa segredo incorreto antes de consultar arquivo, baixar conteúdo, escrever logs ou alterar status. A proteção das âncoras de glosa manual permanece intacta.

Nenhum endpoint público de readiness foi adicionado. Não usar uma importação real como teste de configuração. A validação privada da chave configurada utiliza uma API local isolada com a guarda real, sem `arquivoId`, terminando antes de qualquer consulta ou escrita; banco e funções de negócio permanecem mockados.

## Validação e publicação

A nova suíte `server/internalProcessingSecretKey.test.ts` cobre prioridade da dedicada, fallback ausente, limite do JWT, configurações inválidas, preservação do ambiente, ausência de efeitos anteriores à guarda, emissor e receptor concordantes e proteção da origem manual. As regressões existentes de startup e despacho também devem permanecer aprovadas. Resultados finais e a comparação TypeScript com a baseline serão registrados na PR.

A entrega usa branch própria e PR no repositório oficial. Merge depende do aceite de Sergio sobre a revisão apresentada. O checkpoint é preparação de código, não prova de publicação; Sergio fará Publish no painel para a revisão aprovada.

Habilitar a prontidão remove uma barreira do watchdog preexistente. Antes de reiniciar ou publicar, conferir trabalhos ativos/elegíveis e candidatos de retomada somente por contagens. Esta correção não cria agenda, não remove marcas de reconciliação e não autoriza replay de importações antigas. Nenhum processamento, importação, reprocessamento, migração, DDL ou operação financeira/RPA real faz parte da validação.

## Resultado executado em 04/11/2026

A bateria final aprovou 1.442 testes Vitest em 57 arquivos e 165 testes Node, além de build, `db:check`, `git diff --check` e zero delta em `drizzle/` e `scripts/migrations/`. O TypeScript global continua com os mesmos 177 diagnósticos legados da base, sem novos; não é um type-check global aprovado.

Os 52 novos testes estão incluídos na bateria Vitest. A chave cadastrada no formulário seguro passou ainda por três testes privados separados: formato e seleção real, distinção em relação ao JWT e aos cofres e requisição à API leve local com a guarda real sem `arquivoId`. A requisição correta terminou em 400 na validação do identificador, e a incorreta em 403; nenhuma função de acesso ao banco foi chamada. A origem aleatória deve ser garantida pelo gerador seguro usado pelo administrador; o teste de formato não demonstra entropia por si só.

O preflight de produção foi somente de metadados e contagens. Um lote XML ativo foi respeitado até deixar de estar ativo, antes de sincronizar a cópia gerenciada; não houve interrupção, retry ou alteração de estado por esta tarefa.
