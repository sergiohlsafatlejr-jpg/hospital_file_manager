# Painel Faturado x Recebido — Multiestabelecimento

## Escopo e isolamento

O painel da rota `/faturado-recebido-unificado` usa sempre o **estabelecimento selecionado**. O procedimento recebe um único `estabelecimentoId`, valida a permissão de visualização e aplica esse identificador em todas as consultas de faturamento, demonstrativo, motivos, itens e recursos. Não existe opção de consolidar unidades diferentes.

## Bases oficiais

| Informação | Fonte | Eixo temporal |
| --- | --- | --- |
| Faturado | Maior valor entre o XML em `contas_convenio_itens.valorTotal` e o processado confirmado no retorno (`valor_pago + valor_glosa`) | `competencia` no formato `AAAA/MM` |
| Recebido e glosado | `demonstrativo.valor_pago` e `demonstrativo.valor_glosa` | `data_referencia` no formato `AAAA/MM` |
| Motivo e item glosado | `demonstrativo.codigo_glosa`, `descricao_item`, `codigo_item` | Mesma competência de referência |
| Glosa aceita atual | `demonstrativo.glosa_aceita` ou `classificacao_glosa` em `aceitar`/`auto_aceitar` | Mesma competência de referência |
| Glosa aceita histórica | `decisoesGlosa`, somente quando convênio, código, valor e estabelecimento formam vínculo inequívoco | Sem Mês/Ano quando a decisão original não preserva a data do demonstrativo |
| Recurso criado/enviado | `recursosGlosa`, com vínculo preferencial por estabelecimento, guia, código e valor | Competência do demonstrativo vinculado |
| Glosa recuperada | `recursosGlosa.valorRecebido` ou `valorRecuperado` | Competência do item vinculado |

## Fórmulas

| Indicador | Fórmula |
| --- | --- |
| Saldo a baixar | `máximo(faturado - recebido - glosado, 0)` |
| Acréscimo | `máximo(recebido + glosado - faturado, 0)` |
| Percentual de glosa | `glosado / faturado × 100` |
| Percentual recebido | `recebido / faturado × 100` |
| Glosa em recurso | Soma dos recursos em `rascunho`, `pendente_envio`, `enviado` ou `em_analise` |
| Glosa recuperada | Soma do maior valor disponível entre `valorRecebido` e `valorRecuperado` por recurso |
| Glosa aceita | Aceites atuais mais decisões históricas vinculadas de forma inequívoca |
| Glosa a recursar | `máximo(glosado - glosa aceita - glosa recursada, 0)` |
| Percentual de recurso | `glosa recursada / glosado × 100` |

## Interação

O filtro principal usa **Mês/Ano**. Clicar em uma linha ou barra de convênio aplica o convênio como filtro cruzado e recalcula KPIs, tabela mensal, motivos e itens glosados. A exportação Excel usa exatamente o estabelecimento e o recorte visível. Ao trocar de estabelecimento, os filtros de mês e convênio são limpos antes da nova consulta.

## Qualidade dos dados

Não se usa `demonstrativo.valor_informado` como total faturado mensal porque há importações históricas com escala incorreta. Quando o histórico do XML está incompleto e o retorno comprova valor processado maior, o painel usa `valor_pago + valor_glosa` como piso financeiro. Aceites históricos sem data confiável aparecem no consolidado geral e no convênio associado, mas não são atribuídos artificialmente a uma competência mensal.
