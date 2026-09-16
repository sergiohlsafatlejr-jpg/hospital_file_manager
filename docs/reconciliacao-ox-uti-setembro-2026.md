# Reconciliação OX UTI — setembro de 2026

## Valores observados

| Tela | Valor |
|---|---:|
| Conta Convênio | R$ 192.447,25 |
| Faturado x Recebido — prestador próprio | R$ 125.918,22 |
| Diferença | R$ 66.529,03 |

## Composição da diferença

O cadastro de `/convenios` identifica `1101060` como prestador próprio da Unimed no OX UTI. Os itens dessa competência totalizam R$ 130.877,36, sendo R$ 125.918,22 do prestador próprio e R$ 4.959,14 de prestadores terceiros.

A conta `74087824` apareceu em arquivos de agosto e setembro. O resumo da tela Conta Convênio acumulou R$ 37.527,61 e R$ 24.042,28 de agosto sobre os R$ 13.126,15 de setembro, exibindo R$ 74.696,04. A contaminação entre competências foi de R$ 61.569,89.

Assim, R$ 61.569,89 de competências anteriores mais R$ 4.959,14 de terceiros explicam integralmente a diferença de R$ 66.529,03.

## Correção aplicada

A listagem e o detalhe passaram a usar os itens da competência selecionada. A tela agora apresenta separadamente **Todos os prestadores**, **Prestador próprio** e **Outros prestadores**. Foram sincronizados 63 resumos históricos do OX UTI com os itens reais da mesma conta, lote e competência, eliminando 28.150 itens e R$ 1.806.700,77 que estavam acumulados indevidamente nos resumos históricos. A auditoria posterior encontrou zero divergências entre resumo e itens no OX UTI.
