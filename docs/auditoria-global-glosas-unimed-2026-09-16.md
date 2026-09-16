# Auditoria global de glosas Unimed

**Data:** 16 de setembro de 2026  
**Escopo:** arquivos retornados Excel vinculados a convênios cujo nome contém “Unimed”, em todos os estabelecimentos.

## Inventário inicial

O auditor reabriu cada arquivo original disponível e executou o mesmo parser que o pipeline utilizaria atualmente. Os valores calculados a partir da planilha foram comparados, por `arquivo_id`, com `recebimentos_excel` e `demonstrativo`.

| Classificação | Arquivos |
|---|---:|
| Corretos | 9 |
| Glosa subestimada e recuperável | 12 |
| Glosa marcada sem valor no próprio arquivo | 1 |
| Arquivo indisponível ou inválido | 6 |
| Total auditado | 28 |

Os 12 arquivos recuperáveis preservam a mesma quantidade de itens entre a planilha original, a fonte normalizada e o demonstrativo. A diferença está somente na interpretação financeira dos itens glosados pelo parser antigo. A glosa recuperável comprovada nos arquivos originais soma **R$ 112.508,02**.

## Arquivos recuperáveis

| Estabelecimento | Arquivo | Itens | Glosa atual | Glosa da planilha |
|---|---|---:|---:|---:|
| Hospital Urológico | Demostrativo 12-2025.xlsx | 2.886 | R$ 0,00 | R$ 4.182,48 |
| Hospital Urológico | demonstrativo-Urologico05-2026.xlsx | 2.861 | R$ 0,00 | R$ 19.069,03 |
| Imec Senador Canedo | UNIMED FAT 07-2026.xlsx | 675 | R$ 0,00 | R$ 590,58 |
| Imec Senador Canedo | UNIMED FAT 08-2026.xlsx | 698 | R$ 0,00 | R$ 1.912,22 |
| Ox UTI | demonstrativo-0293325.xlsx | 1.750 | R$ 0,00 | R$ 3.016,64 |
| Ox UTI | demonstrativo-02.2026.xlsx | 2.872 | R$ 0,00 | R$ 12.322,37 |
| Ox UTI | demonstrativo-Ox-05.2026.xlsx | 3.102 | R$ 0,00 | R$ 2.182,59 |
| Ox UTI | demonstrativo-0304496.xlsx | 2.527 | R$ 0,00 | R$ 362,11 |
| Ox UTI | demonstrativo-0308166.xlsx | 9.474 | R$ 0,00 | R$ 40.776,34 |
| Ox UTI | demonstrativo-0311767.xlsx | 4.554 | R$ 0,00 | R$ 3.637,66 |
| Pronto Socorro Infantil | Demostrativo Psi-12-2025 .xlsx | 26.614 | R$ 0,00 | R$ 17.665,94 |
| Pronto Socorro Infantil | Unimed Psi 02.2026.xlsx | 21.036 | R$ 0,00 | R$ 6.790,06 |

## Limitações comprovadas

Seis arquivos antigos retornaram HTTP 403 e não possuem fonte normalizada: um do Hospital Nossa Senhora de Inhumas, um do Hospital Teste, três do Hospital Urológico e um do Ox UTI. Eles não podem ser reconstruídos sem restaurar o objeto ou um backup.

O arquivo `demonstrativo-0308205.xlsx`, do Instituto do Rim, está correto em **R$ 32.959,53** de glosa. Três linhas estão marcadas como glosadas sem valor na própria planilha; portanto, nenhum valor deve ser inventado para elas.

## Método de segurança

O reprocessamento será limitado aos 12 arquivos comprovadamente subestimados. Antes de cada gravação, a quantidade recalculada deve ser idêntica à fonte atual e o estabelecimento e o convênio devem corresponder ao cadastro do arquivo. Depois da gravação, a quantidade e a soma de glosa devem coincidir exatamente com a planilha original. Uma segunda auditoria deverá retornar zero arquivos recuperáveis.

## Resultado da recuperação

O reprocessamento controlado do arquivo 3450001 foi executado duas vezes. As duas execuções produziram exatamente 2.527 itens e R$ 362,11 de glosa, sem divergência de estabelecimento ou convênio, comprovando a idempotência do fluxo.

Os 11 arquivos restantes foram reprocessados sequencialmente. A recuperação terminou com **11 arquivos recuperados, 1 já corrigido no teste controlado, zero falhas e R$ 112.508,02 de glosa total restaurada**.

| Estabelecimento | Arquivos Unimed disponíveis validados | Glosa final exibida no Demonstrativo |
|---|---:|---:|
| Hospital Urológico | 3 | R$ 23.917,31 |
| Imec Senador Canedo | 2 | R$ 2.502,80 |
| Ox UTI | 6 | R$ 62.297,71 |
| Pronto Socorro Infantil | 8 | R$ 93.274,71 |
| Hospital Samaritano de Goiânia | 1 | R$ 17.661,26 |
| Hospital Teste | 1 | R$ 9.679,84 |
| Instituto do Rim | 1 | R$ 32.959,53 |

Os totais acima incluem os arquivos Unimed corretos que já existiam em cada estabelecimento, além dos reprocessados. A validação pela mesma função usada nos cartões da tela Demonstrativo confirmou os valores de Hospital Urológico, Imec, Ox UTI e Pronto Socorro Infantil. Nos 12 arquivos recuperados, foram validados quantidade, soma de glosa e isolamento, com **zero divergências**.

## Auditoria pós-recuperação

| Classificação final | Arquivos |
|---|---:|
| Corretos, incluindo linhas sem valor no próprio arquivo | 22 |
| Arquivos ainda com glosa subestimada | 0 |
| Arquivos indisponíveis por HTTP 403 | 6 |
| Total auditado | 28 |

Quatro arquivos corretos possuem algumas linhas marcadas como glosadas sem valor na própria planilha. Elas foram preservadas sem atribuição financeira artificial. Os seis arquivos HTTP 403 permanecem sem recuperação possível até a restauração do armazenamento ou de um backup.

Foram aprovados **19 testes direcionados** do parser, o build de produção e a verificação de formatação do diff.
