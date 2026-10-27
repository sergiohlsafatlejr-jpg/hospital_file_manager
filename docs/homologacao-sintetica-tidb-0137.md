# Homologação sintética TiDB — migration 0137

**Status: BLOCKED.** A migration aprovada foi aplicada integralmente em uma instância local, isolada e sintética de TiDB v8.5.3, e as cinco chaves estrangeiras foram efetivamente impostas. O runbook, porém, proíbe índices físicos extras ao fim da SQL. A inspeção final encontrou um índice automático de FK residual, `fk_rec_ret_rev_linha` em `recursos_retornos_revisoes(linha_id)`. Por isso a homologação não está liberada e não houve qualquer aplicação em produção.

**Nota de atualização — 26/10/2026, 22:09 BRT:** este documento preserva o ensaio anterior e seu bloqueio pelo contrato de zero extras. Uma rodada posterior homologou o núcleo corrigido do executor em TiDB 8.5.3 local por TLS: dezesseis instruções, histórico sintético de 97 para 98 com uma 0137, quatro tabelas vazias e vinte índices, incluindo somente o auxiliar identificado. Vinte violações de FK foram rejeitadas, com rollback. O [estado atual do executor](executor-restrito-0137.md) propõe aceitar esse único auxiliar por gate específico de Sergio, sem alterar a SQL. O aceite físico e o backup recuperável real continuam pendentes; isso não libera produção.

## Ambiente e procedência

A execução usou somente `127.0.0.1:3427` para MySQL e `127.0.0.1:3428` para status, com armazenamento local `unistore` sob `/home/ubuntu/private/qa-tidb-0137`. Não foi utilizado `DATABASE_URL`, `APP_DATABASE_URL`, navegador, backup, XML ou dado hospitalar real. A base sintética `qa_0137_synthetic` foi removida no encerramento; não restou processo escutando nas portas reservadas.

O binário foi instalado pelo TiUP obtido do instalador HTTPS oficial da PingCAP. O catálogo oficial ofereceu `v8.5.3`; a identidade retornada por `tidb-server -V` confirmou essa versão, edição Community e store `unistore`. As identidades de build e o hash local foram preservados apenas em registro privado. A documentação pública de pacotes não forneceu, nesta verificação, um checksum de fornecedor separado para confronto manual; o hash local não deve ser descrito como checksum independente do fornecedor.

TiDB documenta `unistore` como engine local e permite definir `--path`, host, porta e status por flags; foi esse o modo usado, não um substituto MariaDB nem outra versão. [1] O TiUP é o gerenciador oficial para instalar componentes em versão específica. [2]

Foram lidos sem alteração os arquivos aprovados:

- `drizzle/0137_retornos_recursos_cassi.sql`: identidade conferida por registro privado, sem expor o hash.
- `drizzle/meta/0137_snapshot.json`: identidade conferida por registro privado, sem expor o hash.

Os hashes foram rechecados após a rodada final e permaneceram iguais. A SQL foi fragmentada apenas pelos seus delimitadores `--> statement-breakpoint`, produzindo e executando as **16 instruções originais, na ordem original**: quatro `CREATE TABLE`, cinco `ALTER TABLE ... ADD CONSTRAINT`, e sete `CREATE INDEX`. A migration e o snapshot não foram editados, reordenados ou copiados para o repositório.

## Configuração e resultado estrutural

A verificação somente de leitura no servidor retornou `foreign_key_checks=ON` e `tidb_enable_metadata_lock=ON`. A versão de protocolo retornada por `VERSION()` foi `8.0.11-TiDB-v8.5.3`.

As quatro tabelas foram criadas com contagem inicial zero:

- `recursos_retornos_importacoes`: `0`
- `recursos_retornos_linhas`: `0`
- `recursos_retornos_pagamentos`: `0`
- `recursos_retornos_revisoes`: `0`

As colunas abaixo estão na ordem física retornada por `information_schema.columns`. `NULL` em default significa sem default explícito. Os timestamps retornaram `CURRENT_TIMESTAMP`, correspondente a `now()` na SQL aprovada.

### `recursos_retornos_importacoes`

1. `id` — `bigint`, NOT NULL, default `NULL`, `AUTO_INCREMENT`.
2. `estabelecimento_id` — `int`, NOT NULL, default `NULL`.
3. `convenio_id` — `int`, NOT NULL, default `NULL`.
4. `criado_por` — `int`, NOT NULL, default `NULL`.
5. `origem_recurso` — `enum('externo','portal')`, NOT NULL, default `NULL`.
6. `lote_portal_id` — `int`, NULL, default `NULL`.
7. `nome_arquivo_xml` — `varchar(255)`, NOT NULL, default `NULL`.
8. `arquivo_hash` — `varchar(64)`, NOT NULL, default `NULL`.
9. `arquivo_storage_key` — `varchar(512)`, NOT NULL, default `NULL`.
10. `resposta_hash` — `varchar(64)`, NOT NULL, default `NULL`.
11. `conteudo_semantico_hash` — `varchar(64)`, NOT NULL, default `NULL`.
12. `formato` — `varchar(80)`, NOT NULL, default `NULL`.
13. `versao_tiss` — `varchar(32)`, NOT NULL, default `NULL`.
14. `registro_ans` — `varchar(32)`, NOT NULL, default `NULL`.
15. `codigo_prestador` — `varchar(80)`, NOT NULL, default `NULL`.
16. `numero_lote` — `varchar(100)`, NOT NULL, default `NULL`.
17. `protocolo_recurso` — `varchar(150)`, NOT NULL, default `NULL`.
18. `guia_recurso_prestador` — `varchar(100)`, NOT NULL, default `NULL`.
19. `guia_recurso_operadora` — `varchar(100)`, NOT NULL, default `NULL`.
20. `data_recurso` — `date`, NOT NULL, default `NULL`.
21. `data_resposta` — `date`, NOT NULL, default `NULL`.
22. `total_recursado_cabecalho` — `decimal(14,2)`, NULL, default `NULL`.
23. `total_acatado_cabecalho` — `decimal(14,2)`, NULL, default `NULL`.
24. `total_recursado_itens` — `decimal(14,2)`, NOT NULL, default `NULL`.
25. `total_acatado_itens` — `decimal(14,2)`, NOT NULL, default `NULL`.
26. `cabecalho_divergente` — `enum('sim','nao')`, NOT NULL, default `'nao'`.
27. `alertas` — `json`, NULL, default `NULL`.
28. `nome_arquivo_pdf` — `varchar(255)`, NULL, default `NULL`.
29. `protocolo_pdf_hash` — `varchar(64)`, NULL, default `NULL`.
30. `protocolo_pdf_storage_key` — `varchar(512)`, NULL, default `NULL`.
31. `criado_em` — `timestamp`, NOT NULL, default `CURRENT_TIMESTAMP`.

### `recursos_retornos_linhas`

1. `id` — `bigint`, NOT NULL, default `NULL`, `AUTO_INCREMENT`.
2. `importacao_id` — `bigint`, NOT NULL, default `NULL`.
3. `posicao` — `int`, NOT NULL, default `NULL`.
4. `guia_prestador` — `varchar(100)`, NOT NULL, default `NULL`.
5. `guia_operadora` — `varchar(100)`, NOT NULL, default `NULL`.
6. `sequencial_item` — `varchar(50)`, NULL, default `NULL`.
7. `data_execucao` — `date`, NULL, default `NULL`.
8. `codigo_tabela` — `varchar(20)`, NOT NULL, default `NULL`.
9. `codigo_item` — `varchar(80)`, NOT NULL, default `NULL`.
10. `codigo_glosa` — `varchar(80)`, NOT NULL, default `NULL`.
11. `valor_recursado` — `decimal(14,2)`, NOT NULL, default `NULL`.
12. `valor_acatado` — `decimal(14,2)`, NOT NULL, default `NULL`.
13. `justificativa_prestador` — `varchar(4000)`, NOT NULL, default `NULL`.
14. `justificativa_operadora` — `varchar(4000)`, NOT NULL, default `NULL`.
15. `referencias_normalizadas` — `json`, NOT NULL, default `NULL`.
16. `estado_sugestao` — `enum('sugerido','ambiguo','sem_vinculo','divergente')`, NOT NULL, default `NULL`.
17. `motivo_sugestao` — `varchar(2000)`, NOT NULL, default `NULL`.
18. `candidatos_snapshot` — `json`, NOT NULL, default `NULL`.
19. `demonstrativo_atual_id` — `int`, NULL, default `NULL`.
20. `atualizado_em` — `timestamp`, NOT NULL, default `CURRENT_TIMESTAMP`, `ON UPDATE CURRENT_TIMESTAMP`.
21. `criado_em` — `timestamp`, NOT NULL, default `CURRENT_TIMESTAMP`.

### `recursos_retornos_pagamentos`

1. `id` — `bigint`, NOT NULL, default `NULL`, `AUTO_INCREMENT`.
2. `importacao_id` — `bigint`, NOT NULL, default `NULL`.
3. `estabelecimento_id` — `int`, NOT NULL, default `NULL`.
4. `convenio_id` — `int`, NOT NULL, default `NULL`.
5. `tipo` — `enum('recebimento','estorno')`, NOT NULL, default `NULL`.
6. `pagamento_origem_id` — `bigint`, NULL, default `NULL`.
7. `valor` — `decimal(14,2)`, NOT NULL, default `NULL`.
8. `data_evento` — `date`, NOT NULL, default `NULL`.
9. `referencia` — `varchar(150)`, NOT NULL, default `NULL`.
10. `observacao` — `varchar(2000)`, NOT NULL, default `NULL`.
11. `chave_operacao` — `varchar(36)`, NOT NULL, default `NULL`.
12. `payload_hash` — `varchar(64)`, NOT NULL, default `NULL`.
13. `registrado_por` — `int`, NOT NULL, default `NULL`.
14. `registrado_em` — `timestamp`, NOT NULL, default `CURRENT_TIMESTAMP`.

### `recursos_retornos_revisoes`

1. `id` — `bigint`, NOT NULL, default `NULL`, `AUTO_INCREMENT`.
2. `importacao_id` — `bigint`, NOT NULL, default `NULL`.
3. `linha_id` — `bigint`, NULL, default `NULL`.
4. `tipo` — `enum('aprovacao','rebusca','conflito','anexo_protocolo')`, NOT NULL, default `NULL`.
5. `aprovado` — `enum('sim','nao')`, NULL, default `NULL`.
6. `demonstrativo_id` — `int`, NULL, default `NULL`.
7. `demonstrativo_chave` — `varchar(255)`, NULL, default `NULL`.
8. `arquivo_fonte_id` — `int`, NULL, default `NULL`.
9. `arquivo_fonte_hash` — `varchar(64)`, NULL, default `NULL`.
10. `candidatos_snapshot` — `json`, NULL, default `NULL`.
11. `justificativa` — `varchar(2000)`, NOT NULL, default `NULL`.
12. `conflito_hash` — `varchar(64)`, NULL, default `NULL`.
13. `revisado_por` — `int`, NOT NULL, default `NULL`.
14. `revisado_em` — `timestamp`, NOT NULL, default `CURRENT_TIMESTAMP`.

## Chaves e índices físicos

Foram encontrados os 4 PKs e as 8 únicas esperadas:

- PK: `PRIMARY(id)` em cada uma das quatro tabelas.
- Únicas: `uq_rec_ret_imp_est_conv_arquivo_hash(estabelecimento_id, convenio_id, arquivo_hash)`; `uq_rec_ret_imp_est_conv_resposta_hash(estabelecimento_id, convenio_id, resposta_hash)`; `uq_rec_ret_linha_importacao_posicao(importacao_id, posicao)`; `uq_rec_ret_pag_escopo_operacao(estabelecimento_id, convenio_id, chave_operacao)`; `uq_rec_ret_pag_importacao_tipo_referencia(importacao_id, tipo, referencia)`; `uq_rec_ret_pag_estorno_origem(pagamento_origem_id)`; `uq_rec_ret_rev_tipo_demo(tipo, demonstrativo_chave)`; `uq_rec_ret_rev_conflito(importacao_id, tipo, conflito_hash)`.

Os 7 índices explícitos finais também existem:

- `idx_rec_ret_imp_escopo_data(estabelecimento_id, convenio_id, data_resposta)`.
- `idx_rec_ret_imp_lote_portal(lote_portal_id)`.
- `idx_rec_ret_linha_importacao(importacao_id)`.
- `idx_rec_ret_linha_demo_atual(demonstrativo_atual_id)`.
- `idx_rec_ret_pag_importacao(importacao_id, id)`.
- `idx_rec_ret_rev_importacao(importacao_id, id)`.
- `idx_rec_ret_rev_linha(linha_id, id)`.

As 5 FKs existem, todas com `ON UPDATE NO ACTION` e `ON DELETE RESTRICT`:

- `fk_rec_ret_linha_importacao`: `recursos_retornos_linhas.importacao_id` → `recursos_retornos_importacoes.id`.
- `fk_rec_ret_pag_importacao`: `recursos_retornos_pagamentos.importacao_id` → `recursos_retornos_importacoes.id`.
- `fk_rec_ret_pag_origem`: `recursos_retornos_pagamentos.pagamento_origem_id` → `recursos_retornos_pagamentos.id`.
- `fk_rec_ret_rev_importacao`: `recursos_retornos_revisoes.importacao_id` → `recursos_retornos_importacoes.id`.
- `fk_rec_ret_rev_linha`: `recursos_retornos_revisoes.linha_id` → `recursos_retornos_linhas.id`.

A documentação de TiDB determina que, se não houver índice filho correspondente ao criar uma FK, é criado automaticamente um índice com o mesmo nome da constraint. [3] Como as FKs são criadas antes dos índices explícitos nesta SQL, o resultado físico final foi inspecionado especificamente para esse efeito. Não restaram índices automáticos separados para quatro FKs. Para a quinta, permaneceu `fk_rec_ret_rev_linha(linha_id)`, apesar da presença de `idx_rec_ret_rev_linha(linha_id, id)`. O motivo interno dessa diferença não foi comprovado neste ensaio; o dado efetivamente observado é a coexistência desses dois índices.

Contagem física observada: **4 tabelas, 4 PKs, 8 índices UNIQUE, 7 índices explícitos, 5 FKs, 1 índice automático de FK e 20 índices no total**. A regra do runbook exige **0** índices extras/automáticos após a SQL; logo o valor observado `1` bloqueia a liberação. O SQL não foi corrigido, reordenado, nem recebeu `DROP INDEX`.

## Enforcement de FK

Cada suite foi executada exclusivamente com valores sintéticos, dentro de transação e seguida de `ROLLBACK`. Em todas as cinco FKs, quatro operações foram rejeitadas com o erro referencial esperado: insert de filho sem pai e update do filho para pai inexistente retornaram `ER_NO_REFERENCED_ROW_2` (1452); update e delete do pai referenciado retornaram `ER_ROW_IS_REFERENCED_2` (1451). As cinco transações concluíram rollback.

- `fk_rec_ret_linha_importacao`: 4 rejeições; rollback concluído.
- `fk_rec_ret_pag_importacao`: 4 rejeições; rollback concluído.
- `fk_rec_ret_pag_origem`: 4 rejeições; rollback concluído.
- `fk_rec_ret_rev_importacao`: 4 rejeições; rollback concluído.
- `fk_rec_ret_rev_linha`: 4 rejeições; rollback concluído.

Portanto, o **enforcement das 5 FKs passou** no TiDB v8.5.3 com `foreign_key_checks=ON`. A documentação confirma que TiDB rejeita insert ou update filho sem referência pai e que `RESTRICT`/`NO ACTION` impede update ou delete do pai referenciado. [3]

## Limitações e encaminhamento

Esta é somente uma homologação estrutural e de integridade referencial com dados sintéticos. **Backup não foi validado**: nenhum backup foi restaurado, aberto ou inspecionado. Não houve validação contra dados hospitalares, XMLs reais, credenciais, variáveis globais de produção, banco de homologação compartilhado ou produção.

O bloqueio é restrito ao índice automático residual. Não se deve declarar a migration pronta para produção com o runbook atual. A decisão sobre o conflito entre a ordem imutável da SQL, o comportamento documentado de índice de suporte de FK e a regra de zero extras requer revisão humana do runbook/migration em processo próprio; esta homologação não alterou nenhum desses itens.

O script reutilizável e o resultado sanitizado estão no diretório privado:

- `/home/ubuntu/private/qa-tidb-0137/run-homologacao-0137.sh`
- `/home/ubuntu/private/qa-tidb-0137/run-homologacao-0137.js`
- `/home/ubuntu/private/qa-tidb-0137/artifacts/homologacao-tidb-0137-result.json`

**References**

[1]: https://docs.pingcap.com/tidb/stable/command-line-flags-for-tidb-configuration/ "TiDB command-line configuration options"
[2]: https://docs.pingcap.com/tidb/stable/tiup-overview/ "TiUP overview"
[3]: https://docs.pingcap.com/tidb/stable/foreign-key/ "TiDB foreign key constraints"
[4]: https://docs.pingcap.com/tidb/stable/release-8.5.3/ "TiDB 8.5.3 release notes"
[5]: https://docs.pingcap.com/tidb/stable/binary-package/ "TiDB installation packages"
