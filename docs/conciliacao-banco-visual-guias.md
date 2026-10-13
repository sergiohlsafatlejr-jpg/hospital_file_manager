# Conciliação Cruzada — Banco no visual de Guias / Contas

## O que mudou

Revisão do piloto da PR #69, conforme o feedback de Sergio em 13/10/2026. A origem Banco passa a usar o mesmo padrão visual da Conciliação Cruzada: cabeçalho, filtros, indicadores coloridos, tabela de guias/contas e olho para detalhes. Não há a lista anterior de cartões por grupo de TUSS.

Na tela principal, **Buscar dados do banco** fica imediatamente ao lado de **Popular Dados**. A rota continua `/conciliacao-cruzada`; a origem fica identificada como **Banco**. Não é uma nova página de navegação nem uma nova tabela física.

| Elemento | Comportamento |
| --- | --- |
| Buscar dados do banco | Consulta o faturado do snapshot Hop publicado e os candidatos dos demonstrativos |
| Competência e convênio da tela principal | Reaproveitados se forem válidos nas opções Banco; sem ambos, solicitar seleção antes da consulta |
| Guias / Contas | Uma linha por conta e par de guias, com origem Banco, competência, quantidade de itens e valores |
| Olho da guia | Abre modal com itens, TUSS, data, tipo, setor, modalidade, valores e candidatos |
| Atualizar | Reexecuta a mesma consulta sem gravar |
| Ver base atual | Retorna ao fluxo anterior, mantendo-o separado dos resultados Banco |

O filtro de competência continua proeminente e necessário para a consulta. Lote XML não é mostrado como filtro Banco, pois não pertence a essa origem. Mês de pagamento é opcional e não se presume igual à competência do faturado.

## Segurança e limites mantidos

Esta é uma revisão **de apresentação e projeção de leitura**, não a conciliação persistida definitiva. O motor de comparação por item da PR #69 permanece sem alteração. Snapshot de lotes publicados, unidade HUP, de-para manual inequívoco, arquivos de demonstrativo processados, precisão decimal e valores ausentes continuam seguindo as mesmas regras.

**Popular Dados fica desabilitado no modo Banco**, com explicação. Conciliar Automaticamente, Resetar, associar manualmente e gerar recursos não são oferecidos nesse modo. Essas ações continuam pertencendo ao fluxo antigo, acessível por Ver base atual. O fluxo antigo é desmontado enquanto o Banco é exibido: não basta esconder botões de mutações montadas.

Não houve migração, criação de tabela, importação, publicação de lote ou gravação de conciliações. Buscar significa consultar o snapshot já publicado, não importar a staging ou salvar os candidatos nas tabelas antigas.

## Valores por guia

O faturado inclui todas as ocorrências da conta e par de guias no recorte. Contas diferentes com a mesma guia, guias diferentes da mesma conta e modalidades diferentes nos itens não são deduplicadas indevidamente. Identificadores sem informação não fundem registros sem prova.

**Pago candidato e Glosa candidata não significam valor conciliado.** Na guia, esses campos somam somente grupos classificados pelo motor como candidatos exclusivos, com valor conhecido. Ambiguidades não recebem uma soma de pagamento presumida. A contagem `x/y grupos hospitalares` informa a cobertura; valores desconhecidos permanecem “—”, não zero. Médico direto N permanece separado nos detalhes e no faturado por modalidade.

Se há grupos hospitalares e nenhum valor conhecido, a cobertura continua aparecendo como `0/y` ao lado de “—”, tanto para pago quanto para glosa. Guia exclusivamente de médico direto não recebe uma cobertura hospitalar fictícia `0/0`.

Os quatro indicadores superiores têm recortes declarados: faturado da competência/convênio; pago e glosa dos eventos de demonstrativo no período selecionado. Não são totais já vinculados às guias. Avisos de valores não informados e subtotais parciais continuam visíveis.

## Agrupamento, busca e paginação

O agrupamento por guia é feito sobre todos os grupos comparados do recorte **antes** da paginação. Assim, uma guia não fica dividida por uma página de 50 grupos e seu faturado não muda porque o usuário foi à página seguinte.

Busca por conta, guia ou TUSS e situação filtram guias já agregadas, preservando os indicadores globais. Uma guia com diferentes situações recebe **Situação mista**; o modal apresenta a quantidade de grupos de cada situação. Não rotular candidatos como associados ou sem candidato como não recebido.

Detalhes do modal são limitados aos primeiros 100 grupos de uma guia, com aviso quando esse limite é atingido. Os totais da guia incluem todos os itens, mesmo nesse caso. Os candidatos de cada grupo continuam limitados aos primeiros cinco, com quantidade total informada. Nenhum desses limites permite apresentar soma truncada como total completo.

## Como testar após publicação

1. Selecionar Hospital Urológico na Conciliação Cruzada.
2. Selecionar competência e convênio, se disponíveis, e clicar **Buscar dados do banco** ao lado de Popular Dados.
3. Se o recorte anterior não existir no snapshot/de-para, escolher competência e convênio Banco e clicar no mesmo botão.
4. Conferir Guias / Contas e clicar no olho para inspecionar os itens.
5. Usar busca, situação, mês de pagamento, paginação e Atualizar.
6. Voltar por **Ver base atual**. Não executar Popular Dados/Conciliar/Resetar para testar a consulta Banco.

Troca de unidade, filtro, erro ou consulta em andamento não devem deixar detalhes ou resultados antigos disponíveis. A modalidade Banco continua restrita ao Urológico e à permissão específica `conciliacaoContasPagas`; não se aplica automaticamente a outras unidades.

## Validação e liberação

A validação inclui testes de agrupamento, precisão, nulos, isolamento/autorização, ausência de escrita, filtros/paginação e UI, além de build, `db:check`, diff e TypeScript comparado à baseline. Ensaio visual local usa dados inteiramente sintéticos e rede externa bloqueada; não é homologação persistente nem produção.

Resultados já concluídos:

- **77 testes focados aprovados**, incluindo o comparador original e a regressão de cobertura `0/y`.
- Ensaio Chromium desktop/mobile aprovado: tabela, modal, nulos, busca, situação, paginação, recorte reaproveitado e erro/loading sem dados antigos.
- Leitura real de dois recortes de agosto: **1.284 itens / 1.235 grupos / 53 guias** e **2.632 itens / 2.562 grupos / 272 guias**. Resumo financeiro igual ao da API anterior, totais completos e chaves únicas; busca e mudança de página preservaram os indicadores. Nenhum vínculo gravado.
- No segundo recorte há uma guia com detalhe acima do limite de 100 grupos entre as primeiras 50; o aviso é necessário e os totais não foram truncados.
- Build, `db:check` e `git diff --check` finais aprovados. TypeScript mantém **172 diagnósticos históricos**, idênticos à baseline da main nas mesmas dependências, sem novos erros.
- Auditoria independente final sem bloqueantes após corrigir a cobertura zero. Revisão técnica não substitui aprovação humana ou exceção de Sergio.

A PR #69 já publicada foi confirmada pelos arquivos públicos e endpoint, mas **esta nova revisão visual tem branch/PR própria**: `fix/68-conciliacao-banco-visual-guias`. Não reutiliza automaticamente a autorização de merge e publicação da #69. Revisão humana ou exceção pontual de Sergio e novo checkpoint são necessários antes de publicar esta revisão.
