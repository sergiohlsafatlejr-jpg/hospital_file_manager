# Recurso Glosa Demonstrativo — filtros e identificação

Entrega vinculada à Issue #94, na branch `feat/recurso-glosa-filtros-multiplos`, baseada em `cc11c55`. Esta mudança não cria ou migra tabelas, não reimporta arquivos e não altera registros em produção durante o desenvolvimento.

## Funcionamento

**Competência e Data Pagamento:** seletores de múltiplos valores, com busca e opção Todas. Uma seleção vazia equivale a todas as opções. Os valores selecionados de um mesmo filtro são combinados como alternativas; filtros diferentes se combinam entre si. Neste módulo, a competência continua sendo o mês da data de pagamento, como já era antes. A mudança não redefine esse critério.

A lista de datas disponíveis considera o estabelecimento, as competências e o convênio, mas não restringe suas próprias opções à primeira data escolhida. Isso permite adicionar a segunda ou outras datas sem precisar limpar o filtro.

**Por Item:** ao expandir um item, o detalhe recebe um filtro interno de motivo de glosa. Cada opção identifica o código e a descrição presentes nas linhas daquele item, incluindo ausência de código. Códigos iguais com descrições distintas permanecem identificáveis separadamente. O filtro não modifica os indicadores gerais nem os outros itens; a contagem diferencia ocorrências visíveis do total do detalhe.

**Protocolo e Lote:** aparecem em cada linha de guia no detalhe do item, diretamente dos campos do próprio registro do Demonstrativo. Ausências permanecem como “-”; não são preenchidas por inferência, por MAX do grupo ou por outra guia.

## Ações no recorte exibido

Gerar justificativas, replicar justificativas e aceitar glosas no detalhe do item usam somente as linhas visíveis após o filtro interno. Os botões identificam as ocorrências filtradas. A replicação envia IDs explícitos junto com estabelecimento, item e filtros globais, em vez de atualizar todo o item sem delimitar as linhas.

Selecionar filtros não executa mutações. Durante carregamento, falha ou troca de contexto, as ações em lote do detalhe ficam indisponíveis. A seleção de motivo não é apagada automaticamente durante recarregamento do detalhe, pois isso ampliaria silenciosamente o recorte para Todos.

As ações em lote têm limite defensivo de 5.000 IDs por operação, suficiente para o cenário de 767 ocorrências apresentado no pedido. Acima do limite, a interface informa que o período ou motivo deve ser reduzido e bloqueia a operação; não trunca a lista silenciosamente. As rotas validam IDs inteiros positivos e não aceitam listas malformadas. O resultado do aceite em lote usa a contagem realmente afetada pelo banco.

Trocas de estabelecimento ou de filtros globais encerram detalhes e edições em curso e reposicionam a página. A seleção de motivos de um item não é reaproveitada silenciosamente em outro item. A identidade do estabelecimento permanece no predicado das consultas e das ações em lote.

## Fontes e compatibilidade

A tela consulta a tabela unificada `demonstrativo`, que recebe as importações XML e Excel. Não foi acrescentada uma segunda união com a tabela original de Excel, evitando contar os mesmos registros duas vezes.

Os contratos preservam os filtros escalares `competencia` e `dataPagto` e acrescentam `competencias` e `datasPagto`. Quando uma lista é informada, ela prevalece sobre o escalar. Datas e competências passam por validação de formato e calendário; entradas inválidas são rejeitadas, não convertidas silenciosamente em Todas.

Não houve alteração do cálculo financeiro, da conciliação, do prompt de IA ou da geração de XML de recurso. Relatórios de acompanhamento, exportação de lotes e anexos PDF de protocolo não fazem parte deste pedido.

## Validação realizada em 20/10/2026

- **60 testes Vitest aprovados**, em quatro arquivos: helpers/serviço, contratos de router, helpers da interface e regressão do serviço de faturamento.
- **Build, db:check e git diff --check aprovados** na árvore final.
- TypeScript conserva os **172 diagnósticos preexistentes**, sem novos diagnósticos após normalizar caminhos, posições e ordem dos membros de uniões de tipos.
- Ensaio de navegador com a página real e dependências de dados substituídas integralmente: múltiplas competências, múltiplas datas, manutenção das opções após escolher a primeira data, motivo interno por código/texto, IDs das três ações em lote, carregamento/erro sem ampliação do recorte, protocolo/lote e troca de item/unidade.
- Prévia desktop e celular inspecionada. A página cabe em viewport de 390 px; as tabelas extensas mantêm rolagem horizontal interna.

Todos os testes usaram dados sintéticos e mocks. A rede externa foi bloqueada no ensaio. Não houve consulta ou atualização de registros de produção, chamada real de IA ou nova importação. Capturas reais fornecidas pelo usuário não entram no GitHub.

## Produção

Desenvolvimento, envio da branch e abertura de PR não significam merge ou publicação. Esta entrega aguarda revisão humana e liberação específica. Nenhuma migração foi gerada ou aplicada, e nenhum checkpoint de publicação foi criado para esta branch.
