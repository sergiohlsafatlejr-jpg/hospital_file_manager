# Hemolabor — novas contas pendentes do CSV na tela de atendimentos

## Escopo

- Fonte: CSV privado recebido em 07/10/2026. **Nunca** anexar o CSV, manifesto, fingerprints ou registros a Issues/PRs.
- Destino: `atendimentos_unificados`, exclusivamente estabelecimento Hemolabor (ID interno 6), `origemSistema='tasy'` e chave de conta `ATENDIMENTO:CONTA`.
- O script de atualização da PR #56 já alterou **8.289 contas existentes**; esta entrega **não as modifica novamente**.
- Inserir só chaves inéditas nas origens `tasy` e `tasy_hemolabor`, sem título e com convênio não particular. Não desativar contas ausentes, não importar títulos nem substituir snapshot completo.
- Dados de competência ausentes continuam nulos, sem inventar referência; a tela usa data de entrada como fallback. Valor ausente permanece nulo, não zero.

## Prévia em 07/10/2026 (sem escrita)

| Verificação | Resultado |
|---|---:|
| Linhas do CSV | 695.690 |
| Chaves únicas | 149.973 |
| Chaves já existentes no Hemolabor | 139.376 |
| Chaves novas sem título | 9.662 |
| Particulares não exibidos no filtro atual | 878 |
| Descrições ocultas pelo filtro `A_FATURAR` | 0 |
| **INSERTs previstos para a tela** | **8.784** |
| Desses, competência ausente (data de entrada como fallback) | 6.861 |
| Novas com título, fora deste lote | 935 |

Contagens são fotografia da prévia; **reexecutar imediatamente antes de aplicar**, pois as origens TASY podem mudar. O arquivo deve ser o mesmo, com manifesto privado aprovado. A inserção exige transação, índice único `(estabelecimentoId,origemSistema,origemId)`, lock da unidade, rechecagem das chaves sob lock, batch limitado e pós-verificação independente. `--apply` jamais é executado só porque a prévia passou.

## Gates para publicação

1. PR exclusiva com build, testes, `db:check` e revisão por outra pessoa; a exceção de Sergio para a PR #56 **não se estende** a esta entrega.
2. Confirmar que não há importação TASY concorrente; a rotina de snapshot completo não deve ser executada ao mesmo tempo que o INSERT-only.
3. Guardar manifesto e CSV somente no ambiente privado. Validar fingerprint e quantidade de candidatos no preflight.
4. Aplicar `--apply` uma única vez com as confirmações do script, em janela coordenada. Se houver resposta ambígua do commit, **não repetir**: reconciliar chaves em nova conexão antes de nova decisão.
5. Pós-validar somente agregados: novos registros, unidade, origem, chaves únicas, pendências da tela e estabilidade das contas anteriormente atualizadas. Não exibir pacientes, guias nem valores individuais.

**Estado:** código e prévia preparados; sem INSERT de novas contas até revisão/merge e autorização operacional conforme protocolo.
