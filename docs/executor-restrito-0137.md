# Executor restrito 0137 — homologação sintética, produção bloqueada

**Atualização: 26/10/2026.** O núcleo do executor foi corrigido e concluiu a SQL imutável em TiDB Community 8.5.3 isolado, com TLS e dados exclusivamente sintéticos. Isso não equivale à aplicação em produção, à recuperação de backup real ou à aprovação de Sergio da revisão final. A PR permanece separada da versão publicada.

## Escopo e identidade

O CLI `node scripts/migrations/0137-retornos-restrita.mjs` continua em conferência local/dry-run, sem descobrir conexão, ler `.env`, `DATABASE_URL`, XML ou credenciais. A execução exige fábrica explicitamente injetada e evidências verificadas por um chamador confiável e autorizado.

SQL, schema específico, snapshot e journal são comparados byte a byte com as revisões aprovadas `8837a94` e `98233a8`. Não foram alterados. A ordem continua exatamente dezesseis instruções: quatro tabelas, cinco FKs e sete índices explícitos. Não há migração geral, execução/registro da 0135, reparo da 0136, remoção de índices, importação ou lançamento financeiro.

## Contrato físico proposto — depende de aceite específico

O TiDB observado criou quatro PKs, oito índices únicos, sete índices explícitos e **um único índice auxiliar automático**: `fk_rec_ret_rev_linha(linha_id)` em `recursos_retornos_revisoes`, totalizando vinte índices físicos. O auxiliar surge ao adicionar a última FK e permanece depois do índice explícito composto.

O executor admite somente esse auxiliar exato, nas etapas pertinentes e no resultado final. Qualquer outro extra, unicidade, coluna, prefixo ou ordem divergente é rejeitado. As FKs mantêm as ações referencialmente restritivas originais. Não houve alteração ou reordenação da SQL integrada para eliminar o auxiliar.

Essa admissão é condicionada **antes de conexão de aplicação/DDL** ao atestado específico `contratoFisicoSergio`, com opção `known-residual-fk-index`, identificação do auxiliar exato e aprovação de Sergio ligada aos bytes da revisão final. O ensaio sintético usa atestados fictícios claramente identificados; não declara que Sergio aprovou produção ou esse contrato.

## Requisitos externos cumulativos

1. Backup durável aplicável, retenção e responsável de recuperação identificados, com restauração comprovada em destino TiDB compatível.
2. Homologação TiDB aceita, incluindo contrato físico e enforcement das cinco FKs.
3. Aceite humano de Sergio da revisão exata do executor e dos artefatos.
4. Autorização de Sergio para executor/escopo/janela de aplicação.
5. Exclusividade operacional e reserva única na Issue #34.
6. Aceite específico do único auxiliar automático acima.

A ausência ou expiração de atestado, ou a recusa do verificador externo, bloqueia antes de DDL. A biblioteca não sabe comprovar um backup do fornecedor: isso pertence ao processo externo confiável. Retornar `true` num callback ou preencher referências fictícias não comprova requisito real. Checkpoint, cópia no mesmo host e ensaio local também não substituem recuperação.

## Proteções implementadas

O preflight exige duas conexões independentes, TLS validado, TiDB, mesma identidade de banco e versão, FKs habilitadas, ausência das quatro tabelas/objetos do escopo, ausência da 0135 e de marcador da 0137 e baseline histórico íntegro. Os marcos 0135/0136 são derivados do journal e SQL locais imutáveis. Exige 97 entradas históricas, uma 0136 exata e nenhum timestamp posterior a ela. Captura e comparação preservam todas as entradas, sem publicá-las.

O adaptador mysql2 recebe configurações explicitamente, exige CA, validação de certificado e verificação de identidade TLS. Não importa ambiente nem registra dados de conexão. Cada conexão posterior, inclusive a de DDL e a do journal, precisa corresponder à identidade validada inicialmente. A fábrica sintética limita host a loopback e nome de banco a um namespace de QA.

Antes da primeira DDL, cria estado exclusivo e captura privada cifrada. Cada instrução é única, sem retry, seguida de inspeção física. Estado parcial/incerto não é apagado para rerodar. Não existe rollback fictício de DDL.

Após a SQL, conexão independente compara colunas, tipos, defaults, atualização automática, PKs, únicos, índices e FKs, tabelas vazias, catálogo externo ao escopo e histórico. A normalização de defaults distingue literais de enum e só equipara as expressões temporais documentadas observadas.

O journal só é tentado depois da prova física. Usa transação pessimista, locks, baseline novamente conferido, uma linha afetada e releitura exata do marcador único e de todas as linhas anteriores antes do commit. Commit ambíguo não recebe retry. A validação final é independente.

## Evidência e limites

Em QA local TLS, o executor completou dezesseis DDLs e passou o histórico sintético de 97 para 98, com uma única 0137 e nenhuma 0135. As quatro tabelas terminaram vazias, com cinco FKs e vinte índices físicos. Um ensaio separado rejeitou vinte violações de FK, com cinco rollbacks e tabelas vazias depois. Os bancos sintéticos foram removidos e o processo de QA encerrado.

As referências de aprovação/backup usadas em QA são fictícias, confinadas ao banco local: não se transferem para produção. Não foram restaurados backups nem copiados registros hospitalares. A definição técnica da tabela de histórico foi reproduzida a partir de metadados, com linhas inteiramente fictícias.

**Situação operacional:** a autorização de Sergio para prosseguir com a 0137 foi recebida. Ainda faltam comprovação de backup/recuperação, aceite explícito do contrato físico e liberação da revisão final/executor operacional. A tela Backup e Dados da aplicação foi identificada como demonstrativa, sem backup/restauração real implementados; seus dados ou mensagens não são evidência. Nenhuma DDL ou entrada histórica de produção foi executada por este preparo.

## Validação da revisão preparada

Foram aprovados 17 testes fake de gates, identidade TLS, journal, duplicidade, baseline e parada sem reexecução. A regressão selecionada somou 63 testes aprovados (17 de executor, 28 de parser e 18 de anexos); oito ensaios MariaDB opcionais ficaram explicitamente desabilitados nessa rodada. O ensaio TiDB real local foi executado separadamente, como descrito acima.

Build, verificação de sintaxe, `db:check` e diff foram aprovados. TypeScript continua falhando com 172 diagnósticos legados; a comparação por arquivo, posição e código não encontrou diagnósticos novos nem removidos. Diferenças de ordenação na impressão de tipos e de caminho do checkout não foram tratadas como novos erros. Os testes são executados por Vitest; o tsconfig legado exclui arquivos de teste da compilação normal.
