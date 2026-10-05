# Contrato preliminar: faturado e recebido do Hospital Urológico via Hop

## Escopo

Esta PR **prepara somente a estrutura** de `stagion_faturado_recebido_urologico`. O Portal ainda não lê essa tabela para relatórios, nem a publica nas tabelas financeiras finais. A carga de atendimentos da PR #42 é independente.

São **43 campos do usuário**, mantidos com a grafia e os sufixos originais: `nomeconv`, `codconv`, `mesprod`, `numfatura`, `codrecur`, `tipoproc`, `protocolo`, `numconta`, `guiacobra`, `aihguia`, `descricao`, `matricula`, `data`, `dataint`, `datasai`, `procdisco`, `codproprio`, `codgrufi`, `descricao_1`, `funcaotiss`, `receber`, `codcc`, `nomecc`, `prestexe`, `nomeprest`, `codtiss`, `descmotivo`, `codrecur_1`, `complrecur`, `tipoatend`, `quantidade`, `vl_faturado`, `vl_recebido`, `vl_receb_a_maior`, `vl_total_recebido`, `vl_aberto`, `vl_glosas`, `gl_recurso`, `gl_aceita`, `gl_analise`, `gl_recuperada`, `vl_unitario`, `estabelecimentos_id`.

A estrutura acrescenta `id` (chave técnica autoincremental), `lote_ref` (opcional por ora) e `capturado_em` (carimbo de chegada). A presença de `lote_ref` não representa, por si, um lote completo; uma futura rotina precisa de sinal explícito de fechamento/cobertura antes de substituir um snapshot.

## Tipos e instruções para o Hop

| Grupo | Campos | Tipo físico | Regra |
| --- | --- | --- | --- |
| Identificadores/códigos | `codconv`, `numfatura`, `numconta`, `protocolo`, guias, recurso, TISS e similares | `VARCHAR` | Preservar zeros à esquerda; não fazer cast para inteiro. |
| Descrições extensas | `descricao_1`, `descmotivo`, `complrecur` | `TEXT` | Não truncar informação da extração. |
| Competência e datas | `mesprod`, `data`, `dataint`, `datasai` | `VARCHAR` | Preservar conteúdo civil bruto; normalizar somente no adaptador validado. |
| Quantidade | `quantidade` | `DECIMAL(18,4)` | Enviar decimal com ponto, não float nem texto com separador de milhar. |
| Valores | 11 colunas `vl_*` e `gl_*` | `DECIMAL(20,4)` | Enviar decimal com ponto ou NULL; não inferir pagamento de valor recebido sem conciliação. |
| Unidade | `estabelecimentos_id` | `INT NOT NULL` | Hop deve enviar o ID **1260036** para toda linha; publicação futura deve rejeitar qualquer outro ID. A tabela não valida sozinha a igualdade com 1260036. |

Os 43 campos podem ser enviados pelo Hop após configuração e validação de formato/unidade, deixando os três metadados técnicos para o banco (exceto se o próprio Hop preencher `lote_ref`). **Não habilitar a carga direta só porque a tabela existe.** A leitura de metadados do TiDB nesta preparação mostrou `tidb_enable_check_constraint` desabilitado; [a documentação oficial do TiDB](https://docs.pingcap.com/tidb/stable/constraints/) confirma que o recurso CHECK depende dessa flag. `estabelecimentos_id NOT NULL` **não impõe** a unidade Urológico. Hop deve rejeitar registros de outra unidade antes de enviar; o publicador posterior também deve falhar fechado. Uma restrição física CHECK só pode ser prometida após suporte/habilitação confirmados em homologação e revisão de migração própria. **Não usar TRUNCATE da tabela final, nem gravar automaticamente em `faturamento_unificado` ou em relatórios oficiais.** A staging pode ter repetição legítima de itens/contas; por isso não há índice único em `numconta` ou `numfatura`. Idempotência deverá usar uma identidade de item por lote ainda a validar.

## Antes de ligar o relatório

1. Testar uma extração **sem dados identificáveis no PR**: nomes/tipos de coluna, formatos de data/competência/decimal, múltiplos itens por conta e possíveis duplicidades de linha.
2. Confirmar significado de `vl_recebido`, `vl_total_recebido`, glosas e recursos; não somar com XML/demonstrativos já importados sem chave de conciliação por estabelecimento, competência, conta e pagamento.
3. Implementar fechamento do lote, validação de unidade, montantes e chaves, quarentena de inválidos e publicação transacional/idempotente em PR separada. A tabela Warleine compartilhada já contém pipeline por lote, mas não deve ser reaproveitada cegamente sem verificar equivalência do layout Hop.
4. Revisar a migração Drizzle 0131 na Issue #34 e em PR. Ela cria **uma tabela e três índices não únicos** (unidade+lote, unidade+competência, unidade+conta), sem alterar tabelas existentes; esses índices também precisam de revisão. **Não executar `pnpm db:migrate` geral em produção** devido à divergência histórica 0105–0129. Sergio/delegado define janela e procedimento de aplicação após revisão/homologação.
