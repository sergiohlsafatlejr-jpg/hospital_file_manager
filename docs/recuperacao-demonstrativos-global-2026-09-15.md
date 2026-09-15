# Recuperação global dos demonstrativos

**Data da execução:** 15 de setembro de 2026  
**Escopo:** todos os estabelecimentos e convênios com arquivos de retorno registrados no banco.

## Resultado executivo

A auditoria encontrou **156 arquivos de retorno relevantes**. No estado inicial, 75 já estavam completos, 60 tinham fonte normalizada no banco mas não possuíam itens na tabela `demonstrativo`, um CSV Bradesco ainda estava acessível porém era rejeitado pelo pipeline, e 20 arquivos históricos estavam sem fonte normalizada e com o objeto de armazenamento retornando HTTP 403.

Foram reconstruídos **52.004 itens de 60 arquivos** usando exclusivamente `recebimento_tiss` e `recebimentos_excel`. Além disso, o pipeline CSV passou a reconhecer o formato Bradesco já suportado pelo parser existente, permitindo reprocessar o arquivo `8948861_1.csv` e recuperar mais **576 itens**. O acréscimo total foi de **52.580 itens reais**, sem dados simulados.

| Indicador | Antes | Depois |
|---|---:|---:|
| Arquivos completos | 75 | 136 |
| Recuperáveis pela fonte normalizada | 60 | 0 |
| Acessíveis para reprocessamento | 1 | 0 |
| Históricos indisponíveis | 20 | 20 |
| Arquivos com divergência de quantidade | 0 | 0 |
| Itens no demonstrativo vinculados a arquivos | 547.211 | 599.791 |

## Recuperação por estabelecimento

Os demonstrativos ausentes foram encontrados em três unidades. Os demais estabelecimentos já estavam consistentes e não tiveram registros regravados.

| Estabelecimento | Antes | Recuperados | Depois |
|---|---:|---:|---:|
| Hospital Edmundo Fernandes | 8.631 | 49.142 | 57.773 |
| Maternidade Ela | 5.995 | 233 | 6.228 |
| Pronto Socorro Infantil | 210.582 | 3.205 | 213.787 |
| **Total** | **225.208** | **52.580** | **277.788** |

No Pronto Socorro Infantil, o acréscimo inclui **2.629 itens reconstruídos das fontes normalizadas** e **576 itens do CSV Bradesco reprocessado**.

## Totais finais por estabelecimento

| Estabelecimento | Arquivos completos | Arquivos indisponíveis | Itens no demonstrativo |
|---|---:|---:|---:|
| HF Visão Serviços Médicos | 1 | 1 | 71 |
| Hemolabor | 1 | 0 | 71.052 |
| Hospital Edmundo Fernandes | 6 | 0 | 57.773 |
| Hospital Nossa Senhora de Inhumas | 1 | 1 | 5.008 |
| Hospital Samaritano de Goiânia | 1 | 0 | 19.481 |
| Hospital Teste - Novo | 2 | 1 | 43.183 |
| Hospital Urológico | 3 | 3 | 10.342 |
| Imec Senador Canedo | 24 | 0 | 18.698 |
| Instituto do Rim | 1 | 0 | 23.257 |
| Maternidade Ela | 17 | 1 | 6.228 |
| Ox UTI | 13 | 1 | 130.911 |
| Pronto Socorro Infantil | 66 | 12 | 213.787 |

## CSV Bradesco recuperado

O arquivo `8948861_1.csv`, registro 4650001 do Pronto Socorro Infantil, era identificado incorretamente como se todo CSV de retorno fosse IPASGO. O parser Bradesco já existente foi conectado ao pipeline antes do fallback IPASGO.

| Métrica | Resultado |
|---|---:|
| Itens gravados em `recebimentos_excel` | 576 |
| Itens sincronizados em `demonstrativo` | 576 |
| Guias exibidas pela consulta da tela | 215 |
| Lotes | 7 |
| Valor pago | R$ 46.060,12 |
| Valor de glosa | R$ 0,00 |
| Status final do arquivo | Processado — 100% |

## Isolamento, deduplicação e validação

O recuperador atua somente quando existe fonte normalizada e o arquivo possui zero itens em `demonstrativo`. Antes da sincronização, ele bloqueia o arquivo se qualquer linha da fonte tiver estabelecimento ou convênio diferente do cadastro do arquivo. Depois da gravação, exige correspondência exata entre quantidade da fonte e quantidade final.

| Validação | Resultado |
|---|---:|
| Candidatos em nova execução sem `--apply` | 0 |
| Divergências de estabelecimento contra o arquivo de origem | 0 |
| Divergências de convênio contra o arquivo de origem | 0 |
| Divergências de quantidade entre fonte e demonstrativo | 0 |
| Testes direcionados | 8 aprovados em 3 arquivos |
| Testes do parser Bradesco | 3 de 3 aprovados |
| Build de produção | Aprovado |

A mesma consulta usada pela tela de Demonstrativo confirmou as 215 contas e 576 itens do arquivo Bradesco, além de contas disponíveis para Hospital Edmundo Fernandes e Maternidade Ela. O Relatório de Visitas também foi validado após a recuperação: seis itens AFFEGO e dois itens CASSI passaram a ter correspondência com retornos reconstruídos, reduzindo os itens aguardando retorno de 198 para 190.

O `pnpm check` completo ainda aponta **164 erros TypeScript legados** em módulos não alterados nesta tarefa. Nenhum erro foi encontrado nos dois scripts de auditoria/recuperação, no pipeline CSV modificado, no novo teste Bradesco ou no validador atualizado. O build de produção foi concluído normalmente.

## Arquivos que não puderam ser recuperados

Permanecem **20 arquivos históricos** sem fonte normalizada e com o objeto de armazenamento retornando HTTP 403. Esses registros não foram inventados nem preenchidos por aproximação.

| Estabelecimento | Arquivos indisponíveis |
|---|---:|
| HF Visão Serviços Médicos | 1 |
| Hospital Nossa Senhora de Inhumas | 1 |
| Hospital Teste - Novo | 1 |
| Hospital Urológico | 3 |
| Maternidade Ela | 1 |
| Ox UTI | 1 |
| Pronto Socorro Infantil | 12 |
| **Total** | **20** |

Para recuperar esses 20 arquivos no futuro, será necessário restaurar os objetos originais no armazenamento ou obter uma cópia de backup. Depois da restauração, a auditoria identifica os arquivos novamente e o pipeline pode reprocessá-los sem alterar os demonstrativos já consistentes.
