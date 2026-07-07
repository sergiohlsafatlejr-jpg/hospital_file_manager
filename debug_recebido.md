# Debug: Aba Recebido não mostra dados

## Análise
- A query no backend funciona corretamente quando testada manualmente
- Para competência 2026/06: 27 guias no faturamento, 15 recebimentos encontrados
- Exemplo: guia 71206595 tem recebimentos com protocolo 9024970, lote 55570176

## Problema provável
O frontend mostra "Nenhum dado encontrado" mas a query retorna dados.
Possíveis causas:
1. O mês default selecionado pode ser 2026-07 (mais recente) que pode não ter recebimentos
2. A query pode estar dando timeout ou erro silencioso no servidor
3. O frontend pode ter erro de renderização

## Formato dos dados
- mesesDisponiveis retorna: ['2026-07', '2026-06', '2026-05', ...]
- mesRef é passado como '2026-07' e convertido para '2026/07' na query
- Para 2026/07 pode não haver guias com recebimentos ainda

## Solução
O mês padrão é o mais recente (2026-07), que provavelmente não tem recebimentos.
O usuário precisa selecionar 2026-06 ou anterior para ver dados.
Mas o problema real é que o usuário espera ver dados na competência selecionada.
Verificar se a competência 2026-06 (Jun/2026) tem recebimentos - SIM, tem 15 registros.
