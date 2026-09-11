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

## Interação cruzada

- Cliques em mês de pagamento, convênio, item, procedimento ou motivo aplicam um filtro cruzado no endpoint consolidado.
- KPIs, demais gráficos e tabelas são recalculados no servidor; a dimensão clicada permanece aberta para permitir trocar ou remover a seleção.
- Filtros ativos aparecem como chips removíveis, e um segundo clique no mesmo elemento restaura a visão anterior.
- Excel e PowerPoint recebem o mesmo recorte interativo exibido na tela.

## Taxa real e tratamento da glosa

- A base financeira do percentual inclui **todos os itens do demonstrativo** no mesmo estabelecimento, período e recorte: `valorProcessado = valorPago + valorGlosado`.
- A taxa apresentada é `valorGlosado / valorProcessado`; as consultas não podem ser previamente limitadas a `valor_glosa > 0`, pois isso transforma artificialmente a taxa em 100% quando os registros glosados não têm pagamento parcial.
- **Glosa aceita** corresponde a `classificacao_glosa IN ('aceitar', 'auto_aceitar')`.
- **Glosa recursada** corresponde a `classificacao_glosa IN ('recursar', 'auto_recursar')` ou a um `recurso_status` criado, enviado, deferido ou indeferido, desde que o item não esteja classificado como aceito.
- **Pendente de análise** é o saldo glosado que não foi classificado como aceito nem recursado.
- A tabela `decisoesGlosa` não é usada como fonte financeira do painel porque parte do histórico está sem vínculo vigente com o demonstrativo reconstruído; o relatório usa o estado persistido no próprio `demonstrativo`, preservando estabelecimento, mês e filtros cruzados.

## Validação real

O validador exercita dois estabelecimentos separadamente: Pronto Socorro Infantil (ID 1) e Imec Senador Canedo (ID 2550001). Ele confirma quatro agrupamentos, filtros por pagamento/convênio/categoria e totais diferentes entre as unidades, evidenciando isolamento.
