# Painel Faturado x Recebido — Pronto Socorro Infantil

## Escopo e isolamento

O painel da rota `/faturado-recebido-unificado` é exclusivo do **Pronto Socorro Infantil**, estabelecimento **ID 1**. A restrição deve existir no menu, na página, no schema de entrada do procedimento e na consulta SQL. Usuários administrativos também não podem informar outro estabelecimento nesse endpoint.

## Bases oficiais

| Informação | Fonte | Eixo temporal |
| --- | --- | --- |
| Faturado | Maior valor entre o XML em `contas_convenio_itens.valorTotal` e o processado confirmado no retorno (`valor_pago + valor_glosa`) | `competencia` no formato `AAAA/MM` |
| Recebido e glosado | `demonstrativo.valor_pago` e `demonstrativo.valor_glosa` | `data_referencia` no formato `AAAA/MM` |
| Motivo e item glosado | `demonstrativo.codigo_glosa`, `descricao_item`, `codigo_item` | Mesma competência de referência |
| Glosa aceita | `demonstrativo.classificacao_glosa` em `aceitar` ou `auto_aceitar` | Mesma competência de referência |
| Recurso criado/enviado | `recursosGlosa`, com vínculo preferencial por guia, código e valor | Competência do demonstrativo vinculado; data de criação quando não houver vínculo |
| Glosa recuperada | `recursosGlosa.valorRecebido` ou `valorRecuperado` | Competência do item vinculado; data de pagamento/resposta quando disponível |

## Fórmulas

| Indicador | Fórmula |
| --- | --- |
| Saldo a baixar | `máximo(faturado - recebido - glosado, 0)` |
| Acréscimo | `máximo(recebido + glosado - faturado, 0)` |
| Percentual de glosa | `glosado / faturado × 100` |
| Percentual recebido | `recebido / faturado × 100` |
| Glosa em recurso | Soma dos recursos em `rascunho`, `pendente_envio`, `enviado` ou `em_analise` |
| Glosa recuperada | Soma do maior valor disponível entre `valorRecebido` e `valorRecuperado` por recurso |
| Glosa aceita | Valor glosado classificado como `aceitar` ou `auto_aceitar` |
| Glosa a recursar | `máximo(glosado - glosa aceita - glosa recursada, 0)` |
| Percentual de recurso | `glosa recursada / glosado × 100` |

## Interação

O filtro principal usa **Mês/Ano**. Clicar em uma linha ou barra de convênio aplica o convênio como filtro cruzado e recalcula todos os KPIs, tabela mensal, motivos e itens glosados. Clicar novamente remove a seleção. O painel deve mostrar os filtros ativos e permitir limpar o recorte. A exportação Excel deve usar exatamente o recorte visível.

## Qualidade dos dados

Não se deve usar `demonstrativo.valor_informado` como total faturado mensal porque existem importações históricas com escala incorreta. Quando o histórico do XML está incompleto e o retorno comprova valor processado maior, o painel usa `valor_pago + valor_glosa` como piso financeiro para impedir recebido acima de 100%. Recursos históricos sem vínculo atual devem permanecer no total geral, com identificação explícita, mas não podem ser atribuídos artificialmente a um mês ou item.
