# Análise: integ_faturado_x_recebido vs faturamento_tiss vs faturamento_unificado

## Volumes de Dados

| Tabela | Estabelecimento | Registros |
|--------|----------------|-----------|
| integ_faturado_x_recebido | 1260036 | 111.193 |
| faturamento_tiss | 1 | 29.066 |
| faturamento_tiss | 3 | 35.642 |
| faturamento_tiss | 6 | 21.911 |
| faturamento_tiss | 1170001 | 727 |
| faturamento_tiss | 1260036 | 530 |
| faturadoTasy | - | 0 |
| faturamento_unificado | - | 0 |

## Overlap entre integ e faturamento_tiss

- Guias distintas integ: 9.279
- Guias distintas tiss: 8.615
- Guias comuns: 214 (overlap baixo - são fontes complementares)
- Códigos comuns: 398

## Campos-chave para mapeamento

### integ_faturado_x_recebido → faturamento_unificado
| integ_faturado_x_recebido | faturamento_unificado | Observação |
|---|---|---|
| guiacobra | numeroGuia | Número da guia de cobrança |
| aihguia | numeroGuiaOperadora | Guia operadora |
| numconta | contaNumero | Número da conta |
| procdisco | codigoItem | Código do procedimento (TUSS) |
| codproprio | codigoItemTuss | Código próprio do sistema |
| descricao | descricaoItem | Descrição do item |
| nomeconv | convenio | Nome do convênio |
| codconv | - | Código do convênio (precisa lookup) |
| mesprod | competencia | Mês de produção (formato 2025/02) |
| protocolo | protocolo | Número do protocolo |
| matricula | carteiraBeneficiario | Carteirinha |
| quantidade | quantidade | Quantidade |
| vl_unitario | valorUnitario | Valor unitário |
| vl_faturado | valorFaturado | Valor faturado |
| vl_recebido | valorPago | Valor recebido/pago |
| vl_glosas | valorGlosa | Valor de glosa |
| codtiss | codigoGlosa | Código TISS da glosa |
| descmotivo | motivoGlosa | Descrição motivo glosa |
| nomeprest | profissionalExecutante | Nome do prestador |
| nomecc | setor | Nome do setor |
| tipoproc | tipoItem | Tipo do procedimento |
| data | dataExecucao | Data do item |
| _sincronizado_em | dataSincronizacao | Data de sincronização |

### Convenios em integ (14 convênios)
AFFEGO, AMIL, ASSEFAZ, BRADESCO, CAESAN, CASSI, GEAP, IPASGO, PARTICULAR, SAUDE CAIXA, SAUDE ITAU, SUL AMERICA, UNIMED, VIVACOM

### Competências em integ (últimas 10)
2026/03 (614), 2026/02 (3.564), 2026/01 (9.715), 2025/12 (9.119), 2025/11 (9.254), 2025/10 (9.103), 2025/09 (8.394), 2025/08 (8.439), 2025/07 (9.031), 2025/06 (8.988)

## Conclusão

A tabela integ_faturado_x_recebido já contém dados ricos de faturamento do sistema Warleine (111k registros).
O overlap com faturamento_tiss é baixo (214 guias comuns), indicando que são fontes complementares:
- integ_faturado_x_recebido = dados do sistema Warleine (faturamento + recebimento)
- faturamento_tiss = dados dos XMLs TISS enviados aos convênios

A proposta é criar integ_faturamento como schema Drizzle que espelha a integ_faturado_x_recebido,
e usar ambas (integ_faturamento + faturamento_tiss) para popular faturamento_unificado.
