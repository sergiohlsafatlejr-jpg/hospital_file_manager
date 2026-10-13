# Piloto Banco HUP — Conciliação Cruzada somente leitura

## Escopo e decisão

Issue [#68](https://github.com/sergiohlsafatlejr-jpg/safatle-sistema/issues/68). Em 09/10/2026, às 14:45, Sergio escolheu por último o piloto rápido, substituindo sua seleção imediatamente anterior de nova tabela definitiva. Implementação retomada e validada em 13/10/2026.

- Mesma rota `/conciliacao-cruzada`, com entrada **Piloto Banco — somente leitura**, disponível apenas para Hospital Urológico e com permissão `conciliacaoContasPagas`.
- Fonte de faturado: somente os itens Hop do snapshot Warleine publicado.
- Fonte do pagamento/glosa informada: somente `demonstrativo`, sem somar o espelho `recebimentos_excel`.
- Sem nova tabela, migração, carga, publicação de lote, associação persistida ou substituição de conciliações.
- Sem alterar a política oficial dos demais relatórios/unidades; a estrutura definitiva continua outra etapa da Issue #68.

## Que tabela será usada?

A origem permanece `stagion_faturado_recebido_urologico`. **O piloto não consulta essa staging**, pois ela pode estar recebendo linhas. Consulta `warleine_faturamento_itens_ativos`, a view do snapshot publicado, limitada à unidade HUP, itens de origem Hop e lotes publicados da mesma unidade.

Do snapshot seleciona apenas os campos faturados e de identificação: conta, variantes de guia, competência, convênio, TUSS, tipo, setor, modalidade, data do item, quantidade e valor faturado. Não seleciona recebido, glosa ou data de pagamento do Hop para comparar com demonstrativos.

Os resultados são calculados em memória e descartados após a consulta. Não é necessário inserir dados em `faturamento_unificado`. **Novos INSERTs na staging não atualizam o snapshot automaticamente**: publicar outro lote é uma operação separada, não incluída neste piloto.

## Como testar após publicar o código

1. Abrir Conciliação Cruzada e selecionar Hospital Urológico.
2. Usar **Piloto Banco — somente leitura**. O componente legado é desmontado; seus botões de Popular Dados, Conciliar Automaticamente, Resetar e recursos não aparecem no piloto. A entrada fica bloqueada enquanto a tela antiga tem conciliação ou publicação em andamento.
3. Selecionar uma competência do faturamento e um convênio com de-para manual confirmado.
4. Opcionalmente selecionar o mês de pagamento. Sem mês, os eventos disponíveis do convênio são considerados, independentemente da competência faturada.
5. Clicar **Comparar sem gravar**.
6. Abrir um grupo para ver campos faturados e candidatos do demonstrativo.
7. Usar filtros de situação/busca e paginação para revisar o resultado; ao alterar filtros, o resultado anterior é limpo.
8. Voltar à conciliação atual sem gravar nenhum vínculo.

## Interpretação

| Situação | Significado |
| --- | --- |
| Candidato à revisão | Correspondência conservadora encontrada; não é conciliação confirmada |
| Ambíguo | Há múltiplas possibilidades, suspeita de evento repetido ou evento compartilhado por grupos; não alocar automaticamente |
| Sem candidato | Nenhum candidato elegível foi encontrado nos retornos disponíveis; não prova glosa ou falta de pagamento |
| Médico direto | Modalidade N; não é pendência de recebimento hospitalar |
| Dados incompletos | Faltam conta, guia, código, modalidade ou data válida do item faturado |

O match usa unidade, convênio confirmado, variantes de guia e TUSS, com data quando disponível no demonstrativo. Ausência de data no demonstrativo é indicada como candidato sem prova de item. Data ausente/inválida no faturado impede o match. Não usa nome de paciente como fallback nem interpreta `numfatura` como lote TISS. Códigos e guias continuam texto, sem remover zeros à esquerda, sem match aproximado.

S significa recebimento via hospital; N é médico direto. Data do item corresponde ao campo `data` do Hop, preservado no snapshot como `dataAberturaConta` para a origem Hop HUP. Tipo vem de `codgrufi`, setor de `nomecc`.

O de-para é ativo, manual e da mesma unidade. A resolução usa código ou nome de origem literalmente normalizado, sem fuzzy match. Quando nome/código apontam a convênios canônicos diferentes, o item é excluído do recorte e a quantidade excluída aparece no aviso. Vários registros de mapeamento do mesmo convênio não duplicam itens. Convênios de outra unidade não são oferecidos nem aceitos.

Itens de tipos, setores e modalidades diferentes não são misturados. Ocorrências legítimas repetidas permanecem contabilizadas no faturado. O agrupamento é só apresentação, não gravação/deduplicação dos fatos. Se um evento puder corresponder tanto a um grupo hospitalar S quanto a um grupo médico N, o hospitalar fica ambíguo.

A **diferença estimada**, quando permitida para um candidato exclusivo e com valores completos, é faturado menos pago menos glosa informada. Não é glosa automática, nem status contábil/pagamento confirmado. Vários eventos ou rateio não são resolvidos automaticamente neste piloto. A exclusividade avaliada se restringe ao recorte selecionado; não autoriza alocação em outra competência.

## Valores não informados

A verificação real encontrou demonstrativos com `valor_glosa` nulo. **Nulo não significa zero.**

- Um valor pago/glosa não informado permanece nulo na resposta e aparece como “—”.
- Nenhuma diferença estimada é calculada se pago ou glosa do candidato estiver ausente.
- Indicadores do demonstrativo somam somente os valores conhecidos. Se houver ausências, a tela destaca que o total daquele campo é parcial e apresenta a contagem de eventos sem informação.
- Se todos os valores do campo estiverem ausentes, o indicador é “—”, não zero.
- Zero explícito continua sendo zero informado. Valor numérico inválido aborta a leitura, sem substituição por zero.
- Não se preenche o valor ausente com a glosa/recebido do Hop nem com outra fonte.

## Totais, filtros e consistência

- Faturado hospital/médico direto: recorte da competência e do convênio com de-para inequívoco, cada item contado uma vez. Modalidade desconhecida aparece nos grupos incompletos, não nos subtotais S/N.
- Pago/glosa do demonstrativo: eventos oficiais do convênio e mês de pagamento escolhido, ou todos os pagamentos; não são valores já vinculados à competência do faturado.
- Somente arquivos de demonstrativo processados, da mesma unidade e convênio do item, são elegíveis. Não unir seu espelho Excel.
- Busca e situação filtram grupos exibidos, não alteram os indicadores integrais do recorte.
- Candidatos não são somados como recebido conciliado. O mesmo evento pode aparecer para revisão em vários grupos ambíguos, mas não multiplica o total de eventos.
- Valores são somados com Decimal em precisão 80 e retornados como strings; datas do item são civis.
- Uma transação repeatable-read e rollback garantem uma visão consistente por consulta. Paginar/recomparar faz nova leitura; uma publicação concorrente de snapshot pode mudar o resultado entre consultas.

## Disponibilidade e segurança

Sem snapshot publicado, sem faturado elegível ou com excesso do limite, apresentar estado explícito. Nunca fallback para XML, `integ_faturado`, outra unidade, staging ou recebimento Hop. Não truncar fontes silenciosamente e mostrar totais parciais como completos.

Limites do piloto: 50.000 itens na competência inteira antes do de-para; 50.000 eventos no recorte de demonstrativo; 5.000 mapeamentos/pares de origem; 240 competências nas opções; 100 grupos por página e cinco candidatos exibidos por grupo, com contagem total preservada. Consultas SQL têm timeout de 20 segundos; uma conexão que exceder o prazo é descartada, não devolvida ao pool.

Router próprio, apenas queries protegidas por unidade e módulo. Statements são SELECT e controle transacional, sem DML/DDL. O banco usado pela aplicação não é uma credencial exclusiva read-only; o caminho é restrito pelo código/testes e rollback. Uma credencial dedicada somente leitura permanece reforço futuro de defesa em profundidade, não uma alteração feita nesta entrega.

Mensagens são sanitizadas, sem SQL, credenciais ou mensagens do driver. UI não exibe pacientes, hashes, identidade técnica de origem ou linhas hospitalares completas. Scripts e logs de auditoria são privados, fora do Git.

## Validação em 13/10/2026

- 63 testes focados: comparador, serviço, autorização e UI. Cobrem datas, precisão, grandes somas sem notação científica, nulos, S/N, ambiguidades, repetição, limites, timeout, ausência de fallback/escrita, filtros e paginação.
- QA desktop/mobile com dados inteiramente sintéticos e rede externa bloqueada: campos, candidatos, filtros, paginação, retorno e ausência de erros React. A prévia sintética não é produção nem usa dados hospitalares.
- Opções reais consultadas somente por agregados: dez competências e 13 convênios com mapeamento manual inequívoco.
- Quatro recortes reais de setembro/outubro, em dois convênios, concluíram com status `ok`; filtros e paginação conservaram os resumos. Não foram encontrados candidatos nesses recortes recentes, sem inferir falta de pagamento.
- Dois recortes adicionais de agosto concluíram: em um convênio, **607 grupos candidatos e 132 ambíguos**; no outro, nenhum candidato. Esses números são resultados de leitura para revisão, não conciliações gravadas nem afirmação de cobertura de toda a unidade.
- Em um recorte de demonstrativo, 4.549 eventos sem valor de glosa permanecem não informados, sem cálculo de diferença baseado em zero presumido.
- Build, `db:check` e diff check aprovados na versão final. TypeScript: 172 diagnósticos na branch e 172 na baseline limpa da mesma main; nenhum nos arquivos novos do piloto, sem aumento de diagnósticos por arquivo/código.
- Duas auditorias técnicas independentes aprovaram o recorte sem bloqueantes P0/P1. A sugestão de formatação de objetos Decimal sem notação científica foi incorporada e testada.

## Liberação

Branch `feat/68-piloto-hup-conciliacao-leitura`. PR independente e revisão de outra pessoa pelo protocolo, ou exceção específica de Sergio para esta PR. As exceções de PRs já mescladas não se estendem automaticamente.

Após liberação do código, conferir a árvore aprovada, preparar o checkpoint e comprovar a publicação. Validar o endpoint de produção usando somente agregados; não acionar conciliação persistida, cargas ou migrações para esse teste. Um checkpoint ou a presença do código na PR não comprovam deploy.
