# Tarefa 2: Reorganizar filtros do Relatório Ox UTI Faturado

## Requisito do Sergio:
- Competência = data de faturamento (informada na importação do XML)
- Convênio = convênio
- Pagamento = data pagamento (informada na importação do demonstrativo)

## Arquivo: client/src/pages/RelatorioOxUtiFaturado.tsx

## Aba "Faturado x Pago" (adicionada recentemente):
- Procedure backend: `relatorioOxUtiFaturado.faturadoXPago` no server/routers.ts (~linha 9700)
- Filtros atuais: competência (mês), convênio, busca, status
- Precisa adicionar: filtro de data de pagamento (do demonstrativo)

## Fontes de dados:
- faturamento_tiss: tem competencia (data faturamento do XML)
- conciliados_automatico: tem competenciaPagamento (data pagamento do demonstrativo)
- recebimentos_excel: tem data_referencia e dataPagamentoUpload
