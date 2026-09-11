# Redesenho do Relatório de Glosas BI

Referência enviada pelo usuário em 11/09/2026: `/home/ubuntu/upload/pasted_file_CkigVt_image.png`.

O usuário solicitou aproveitar a **estrutura dos gráficos**, sem copiar as cores. Os quatro eixos obrigatórios são: **Glosa por mês de pagamento**, **Glosa por item**, **Glosa por convênio** e **Glosa por procedimento**.

## Decisões aplicadas

- Visual claro, clínico e executivo, com base neutra e acentos próprios em rosa, azul, âmbar, violeta e verde-petróleo.
- O período dos filtros e do gráfico mensal usa `demonstrativo.data_pagamento`.
- `valorCobrado = valorPago + valorGlosado` para a mesma seleção.
- `taxaGlosa = valorGlosado / valorCobrado`.
- `ticketMedio = valorGlosado / quantidade de itens glosados`.
- `glosaRecursada` considera status `recurso_criado`, `recurso_enviado`, `recurso_deferido`, `recurso_indeferido` ou `classificacao_glosa = recursar`.
- `glosaSemRecurso` corresponde ao restante do valor glosado.
- O relatório exige um estabelecimento específico; não executa com `estabelecimentoId = 0`.
- O backend valida permissão de visualização para o estabelecimento solicitado.
- O Excel exporta Resumo, Mês, Convênio, Item, Procedimento e Motivo com código e descrição.

## Validação real

O validador exercita dois estabelecimentos separadamente: Pronto Socorro Infantil (ID 1) e Imec Senador Canedo (ID 2550001). Ele confirma quatro agrupamentos, filtros por pagamento/convênio/categoria e totais diferentes entre as unidades, evidenciando isolamento.
