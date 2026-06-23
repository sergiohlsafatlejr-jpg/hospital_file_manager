# Debug - Problemas Relatório Glosas BI

## Problema 1: Valor Cobrado errado em 2026/04
- No gráfico de evolução, "Cobrado" mostra R$ 7.177,92 para 2026/04
- Mas Pago = R$ 1.074.685 e Glosado = R$ 263.591
- O campo `totalInformado` usa `tissMap[competencia]` (faturamento_tiss) como prioridade
- Se faturamento_tiss tem valor para 2026/04, usa esse valor (R$ 7.177,92 do XML)
- Se não tem, usa pago + glosa como fallback
- **Causa:** O XML do mês 04 tem apenas R$ 7.177,92 de faturamento registrado
- **Solução:** O "Cobrado" no gráfico deveria ser SEMPRE pago + glosa (do demonstrativo), não do XML

## Problema 2: Gráfico por convênio não aparece
- O código foi adicionado mas pode não ter sido publicado
- Verificar se o deploy está atualizado
