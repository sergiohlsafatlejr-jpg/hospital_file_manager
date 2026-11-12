# Corretiva curta — cache e avisos por domínio do Dossiê

## Escopo autorizado

Sergio autorizou em 12/11/2026 a preparação de uma PR sobre `a121bc992e66b712893c629569c3680aa4c204bf`, na branch `fix/dossie-glosas-cache-domains`, limitada à identidade/eventos do cache da aba de Glosas e aos avisos por domínio. O novo SHA e os testes devem ser apresentados antes de merge, sincronização do WebDev ou checkpoint.

O WebDev anterior permanece no checkpoint `1efa5de1`. Esta preparação não autoriza Publish, DDL, migrações, reaplicação da 0146, tratamento de filas, dados reais, IA real, segredos ou integrações externas.

A main avançou durante o trabalho para `5199039`, com `0500bc5` e `5199039` de importação de decisões de Glosas por Excel. Essa entrega fica fora da árvore revisada `a121bc9 + corretiva` e não foi auditada nesta PR.

## Defeito de origem

A revisão-base alterou `glosasProntas` e `podeSelecionar` para não dependerem do sucesso da auditoria XML. A assinatura de cache, contudo, ainda incluía os eventos da query XML e invalidava a guarda após eventos de opções dos observers em uma query com erro persistente.

A reprodução com React, TanStack Query, Radix e CSS reais mostrou dossiê e glosas frescos e botões habilitados, mas seleção e operação automática sem efeito. O aviso global também afirmava que erro exclusivo de XML bloqueava a aplicação de fundamentação. Testes simplificados não reproduziam o ciclo real de atualização dos observers e não detectaram o defeito.

## Contrato implementado

A seleção/aplicação de Glosas utiliza identidade própria, dependente da base contratual e da consulta/cache de Glosas atuais. Eventos, competência, lote e recálculo exclusivos da auditoria XML não invalidam esse domínio.

Excel utiliza guarda/identidade separadas e continua exigindo as três bases/caches válidos. Separar a prontidão de Glosas não autoriza utilizar XML indisponível, gerar Excel parcial como completo ou contornar as guardas do servidor.

A assinatura só considera `updated` e `removed` e compara `data`, `dataUpdatedAt`, `status`, `fetchStatus` e `isInvalidated`. Eventos de observer/opções sem transição efetiva do estado protegido não revogam identidades. Mudanças relevantes de base contratual/Glosas revogam ambos os domínios; XML revoga somente Excel. Erros, refetch, invalidação, remoção e mudanças completas antes do render continuam bloqueando handlers antigos. A verificação síncrona do cache no clique permanece, incluindo sucesso, idle, ausência de invalidação, referência da base e frescor inferior a 60 segundos.

Avisos distinguem Glosas disponíveis de XML indisponível/exportação completa bloqueada. Quando dossiê/Glosas estão indisponíveis ou há operação em processamento, aplicação e exportação continuam bloqueadas.

## Preservações

- Correção física de `fu.lotePrestador`, consultas parametrizadas e escopo de hospital/convênio da revisão-base; nenhum backend alterado.
- Botões de revalidação, seleção manual e “Responder Recursos Automaticamente”.
- Filtros, máximo de 200 itens, justificativas e valores enviados ao endpoint existente.
- Locks por contrato, fechamento/remontagem e descarte de handlers/respostas de outro contrato ou recorte de Glosas.
- Confirmação somente após retorno da mutação e invalidação de todas as competências do contrato originário.
- BI de Glosas/Logo, layout, helper legado e testes anteriores.

O automático aplica fundamentação ao recorte contestável filtrado carregado, não somente aos checkboxes marcados. Não significa enviar recursos a um portal nem executar IA. A operação manual continua utilizando a seleção explícita. Trocas exclusivamente XML não mudam o domínio de uma aplicação de Glosas em andamento.

## Resultados reais

| Verificação | Resultado |
|---|---|
| Bateria Vitest completa | 2.660 testes aprovados, 115 arquivos. |
| Node legado | 165 testes aprovados, artefatos imutáveis. |
| Executor 0146 offline | 109 testes aprovados; nenhum modo apply executado. |
| Build, `db:check`, diff e imutabilidade | Aprovados. |
| TypeScript | 157 diagnósticos legados, os mesmos da baseline; zero novos. O comando global continua falhando. |
| Regressão DOM real | 35 cenários positivos na corretiva; no original a mesma suíte falha em 8 cenários (27 PASS). |
| Regressão unitária | 10 cenários positivos. |
| Runners finais portáveis | DOM e unitário reconfirmados após retirar dependência de caminho privado; tipos novamente comparados com a baseline. |

Os 35 cenários DOM são executados dentro de um teste Vitest e os 10 unitários dentro de outro; não devem ser somados novamente aos 2.660 testes. Os runners finais e fontes de produto foram atestados na revisão apresentada.

A primeira bateria apresentou uma divergência isolada na classificação de rejeição de uma fixture PDF legada (`PDF_LIMITE_TEXTO` versus `PDF_EXTRACAO_INCOMPLETA`). Fontes e asserções PDF permaneceram intactas. A suíte focada e a repetição completa passaram; a primeira falha foi preservada. Não foi atribuída causa definitiva e a corretiva não foi ampliada para o módulo PDF.

## Prova DOM e prévia

O componente/helper/CSS reais são montados com React 19.2.1, TanStack Query 5.90.2 e Radix, sem instrumentação do produto. Somente tRPC/backend de fixtures, notificações e navegação são substituídos. O teste exige seleção e payload exatos após repetidos eventos de observer com XML em erro persistente; Excel permanece desabilitado.

Cobre erros, fetch, invalidação, expiração, substituição, remoção/reinserção e refetch completo de dossiê/Glosas antes do render; recuperação; troca de contrato, competência e filtros; teto de 200; duplo clique; fechamento/remontagem e ack tardio.

Chromium privado utiliza pipe e diretório temporário fora do Git, sem servidor. O guard versionado proíbe rede Node, inclusive loopback/listen, e a página bloqueia requests externos. O executável é descoberto no ambiente; sua ausência falha explicitamente, sem skip. A comparação original utiliza `git archive`, sem alterar a worktree. Testes executados com Node LTS v22.23.4, banco vazio e configurações sintéticas.

## Limites

A captura é offline com dados fictícios, não homologação do Portal. Fixtures e acknowledgements não comprovam autenticação, elegibilidade contratual real, persistência, concorrência TiDB, IA ou envio de recursos. Nenhum dado real, banco de produção, DDL, fila ou integração foi acessado na corretiva.

Warnings preexistentes de descrição Radix e os defeitos de acessibilidade/overflow documentados na auditoria-base não fazem parte desta correção e não devem ser apresentados como resolvidos. Qualquer promoção continua dependendo do aceite de Sergio para a revisão exata, revalidação, preflight autorizado e janela segura. Checkpoint não comprova Publish.
