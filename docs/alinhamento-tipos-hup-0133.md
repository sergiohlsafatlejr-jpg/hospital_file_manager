# Tipos solicitados para staging HUP — migração 0133

Sergio pediu, em 07/10/2026, para **alterar apenas os 15 campos apresentados** de `stagion_faturado_recebido_urologico`. Esta entrega não cria tabela, não muda as outras 28 colunas físicas de negócio, não altera os nomes de colunas, não adiciona chave, índices ou campos de lote, não movimenta registros e não alimenta o BI. A grafia física preservada é `estabelecimentos_id` (minúsculas). `NUMERIC` corresponde a `DECIMAL` no MySQL/TiDB.

| Campo | Tipo solicitado |
|---|---|
| `aihguia` | `VARCHAR(50)` |
| `quantidade` | `DECIMAL(15,4)` |
| `vl_faturado`, `vl_recebido`, `vl_receb_a_maior`, `vl_total_recebido`, `vl_aberto`, `vl_glosas`, `gl_recurso`, `gl_aceita`, `gl_analise`, `gl_recuperada` | `DECIMAL(15,2)` |
| `complrecur` | `TEXT` |
| `vl_unitario` | `DECIMAL(15,4)` |
| `estabelecimentos_id` | `VARCHAR(100)` (mantendo a nulabilidade física atual) |

A migração 0133 é gerada de `drizzle/schema-integracao.ts` por `pnpm db:generate`. Os 14 `MODIFY COLUMN` gerados abrangem os campos que diferem do snapshot do Drizzle. `complrecur` já era `TEXT` no snapshot 0131, mas é `LONGTEXT` na tabela física atual (recriada pelo Hop); portanto foi incluído **explicitamente** um décimo quinto `MODIFY COLUMN` de regularização no SQL da 0133. A migração histórica 0131 não foi editada.

## Limites de segurança e aplicação

A tabela física foi observada com **43 colunas, sem índice e vazia** durante o preflight; a 0131 registra **46 colunas, chave primária e três índices**. Esta PR corrige **apenas os 15 tipos solicitados**; a divergência estrutural residual e o journal não devem ser descritos como totalmente reconciliados. O Hop já recarregou/recriou essa tabela em execuções anteriores; **não aplicar** se ele puder executar `DROP`, `CREATE`, `TRUNCATE` ou continuar escrevendo. Um novo ciclo de recriação após o `ALTER` apagaria a correção. Não executar `pnpm db:migrate` geral.

Antes de qualquer DDL de produção, responsável designado por Sergio deve confirmar Hop pausado e configurado para inserir por **nomes de coluna**, alvo correto, revisão humana da PR, backup/restauração e exclusividade da reserva #34; a exceção concedida a 0132 não se transfere à 0133. Revalidar em nova conexão tabela e journal; se houver registros, inspecionar **somente agregados** de nulidade, comprimento maior que 50/100, faixas DECIMAL e casas decimais adicionais sem expor pacientes. **Não arredondar valores existentes sem decisão explícita**. Conferir que o SQL 0133 modifica só os 15 campos, aplicar uma vez e verificar tipos, contagem, demais colunas inalteradas e situação do journal. Atenção: DDL TiDB não é transacional; em erro, parar e diagnosticar as alterações já concluídas antes de retomar. A rotina BI/conciliador HUP exigirá reconciliação separada da staging inteira, lote completo e prevenção de dupla contagem.
