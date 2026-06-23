# Debug - Valor Cobrado IPASGO no Gráfico por Convênio

## Problema
O gráfico por convênio mostra Cobrado = Pago + Glosado, mas a query porConvenio filtra `WHERE valor_glosa > 0`.

Quando filtra apenas itens com glosa > 0:
- valor_pago = R$ 66,72 (quase zero - porque itens glosados do IPASGO têm valor_pago = 0)
- valor_glosa = R$ 213.584,48
- Cobrado = 66,72 + 213.584 = ~R$ 213.651 (quase igual ao glosado)

Quando pega TODOS os itens do convênio:
- valor_pago = R$ 995.637,71
- valor_glosa = R$ 213.584,48
- valor_informado = R$ 1.209.222,19
- Cobrado correto = 995.637 + 213.584 = R$ 1.209.222

## Causa raiz
A procedure porConvenio calcula valor_pago apenas dos itens com valor_glosa > 0.
Mas no IPASGO, os itens glosados têm valor_pago = 0 (a glosa é total).
O valor_pago está nos OUTROS itens (os que não foram glosados).

## Solução
A query porConvenio precisa buscar o valor_pago de TODOS os itens do convênio (não só os glosados),
e o valor_glosa dos itens glosados. Ou usar valor_informado como base.

Na verdade, o Cobrado deveria ser = SUM(valor_informado) de TODOS os itens, não apenas dos glosados.
Ou melhor: Cobrado = SUM(valor_pago) de todos + SUM(valor_glosa) de todos.
