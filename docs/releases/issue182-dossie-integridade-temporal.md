# Corretiva da Issue #182 — Dossiê Contratual/XML/Glosas

## Base, autorização e escopo

Sergio autorizou em 11/11/2026 preparar PR corretiva sobre **b613b912dccd44b09f7ba9741fc5c94d7d246ee8**, preservando BI de Glosas/Logo e Dossiê Contratual/Cobrança XML/Recursos de Glosa. Branch: **fix/issue182-dossie-integridade-temporal**. Referência: Issue privada #182.

A autorização cobre implementação, revisão, testes, commit em branch própria e abertura de PR. **Não cobre merge, sincronização/reinício WebDev, checkpoint, Publish, DDL/migração/reaplicação da 0146, dados reais, segredos, ERP, SMTP, Inter, IA ou importações reais.** Sergio dará o aceite ligado ao SHA final apresentado.

## Correções entregues

### Schema real, vigência e preços

O enriquecimento de `itensPorGuia` consome o Array alinhado por item do seletor temporal existente, com hospital, convênio, código e execução real. Não chama Array como Map, não inventa data atual/de criação e não elimina procedimentos repetidos. Valores e quantidades, incluindo zeros, permanecem autoritativos; cálculo decimal somente dos campos informativos. Preço ausente, contexto indeterminado e consulta indisponível têm estados distintos, com erro sanitizado.

Auditoria de demonstrativos usa os campos físicos reais; competência deriva da data de referência. XML/glosas usam o seletor de preço por execução de cada item, sem transformar preço futuro/global inaplicável em perda histórica. Múltiplas versões não são anunciadas como preço unitário único; soma parcial não é apresentada como total contratual completo.

Sincronização de preços insere versões com vigência/proveniência comprovadas, sem sobrescrever ou reativar histórico. Usa transação e locks de contrato/convênio estável, inclusive entre contratos do mesmo convênio; repetição do mesmo código/dia/valor não duplica. Ausência de extração nova não grava; divergência causa rollback. Documento/tabela/aditivo ambíguo sem vigência é recusado.

### Fundamentação e consumo do texto

Fundamentação transacional valida hospital, convênio, origem e ID, estado, vínculo e valor; não altera glosas aceitas/finalizadas ou já vinculadas nem admite valor superior à glosa. Guarda a justificativa, confere o texto e conta apenas registros efetivamente alterados, com repetição idempotente e falha fechada.

Para conciliação, o texto usa a **estrutura legada já referenciada pela base** `recursos_glosa_justificativas`; os consumidores de fila, lote e campo ANS passam a ler essa fundamentação. Correlação exclusiva por PK da conciliação, hospital e convênio, sem colisão com IDs do demonstrativo ou join multiplicador. Em duplicatas legadas, maior PK da justificativa vence deterministicamente, por subconsulta `MAX(id)`, sem seleção arbitrária de item. Não empresta texto de outra origem nem escolhe versão antiga quando a atual está vazia.

Tabela/coluna indisponível, resultado SQL de formato inesperado ou justificativa ausente/vazia **interrompem leitura/exportação**, sem DDL ou reparo. Um recurso legado elegível sem texto pode, portanto, bloquear o consumo; não será removido da lista nem convertido silenciosamente em sucesso vazio. Os novos deltas dos consumidores são somente de leitura; regras, recortes, valores, destinos e transportes existentes permanecem.

### Modal, cache e confirmação de IA

Modal limpa seleções e descarta respostas de outro contexto; erro/fetch/stale/placeholder/invalidation/TTL são conferidos também no clique, antes de efeitos. Exportação e aplicação com cache antigo são bloqueadas. Após alteração da base, invalida **todas as competências/lotes do contrato originário**, não apenas o recorte aberto e não outros contratos. Bloqueio de operação sobrevive ao remount e impede duplo envio. Seis abas, semáforo, tabelas e layout foram preservados; seleção/payload limitados a 200, com revalidação manual explícita.

Geração IA retorna `{dossie, geradoComIA, salvo, motivo}` e a interface distingue resultado-base, indisponibilidade, ausência de texto e salvamento confirmado. Flags positivas exigem persistência/readback dos **pontos de atenção (`pontosImportantes`)**, não roundtrip durável de todo o dossiê enriquecido. Os demais campos IA no retorno são transitórios; não alegar que remuneração/tabela/cláusulas inteiras foram persistidas. Não houve IA real.

Páginas de recurso não inventam hoje/competência/pagamento como execução única de resumo agregado. Sem referência autoritativa, apresentam base indeterminada e não liberam atalho temporal fictício. Fundamentação por itens reais permanece no servidor.

## Validação final

| Verificação | Resultado |
|---|---|
| Vitest consolidado | **2.657 testes / 113 arquivos aprovados** |
| Node do legado 0145 | **165 aprovados**, offline e contra baseline imutável |
| Node da 0146 | **109 aprovados**, somente testes offline |
| Build | **Aprovado** |
| `db:check` | **Aprovado** com URL sintética |
| `git diff --check` | **Aprovado** |
| TypeScript | **157 diagnósticos legados, zero novos** |
| SQL/schema/snapshots/journal/executores/core/BI-Logo | **Sem delta** |

`tsc --noEmit` global continua retornando falha pela dívida técnica legada; não é declarado limpo. O novo diagnóstico de enriquecimento presente em `b613b91` foi removido. A comparação final usa a release anterior validada de 157 diagnósticos, não tolera novos erros.

Regressões incluem 55 cenários backend, 5 de router, 21 de enriquecimento e wrappers de harnesses com 20 cenários de modal, 2 de invalidação tRPC/TanStack real e 7 de consumo ponta a ponta. Esses cenários encapsulados não são somados de novo à contagem Vitest. A fixture SQL legada recebeu somente a dependência de justificativa como CTE sintética, mantendo as asserções de vínculo, multiplicidade, parâmetros e proibição de subquery em ON/seleção arbitrária.

A revisão independente identificou duas pendências residuais (consumo do texto e cache de competência vizinha), corrigidas posteriormente e cobertas nas regressões e bateria final. Resultados de execuções iniciais com falhas foram preservados; somente a última execução completa fundamenta os números acima. Fontes finais atestadas por hashes antes do commit.

## Limites e preservações

Provas usam fonte/componentes/helpers reais, serviços mockados, dados fictícios, DATABASE_URL vazio, segredos sintéticos e rede bloqueada. Não iniciar backend da revisão nova. Concorrência/rollback de gravação são simulados, **não homologação física TiDB de locks**. SQL de vínculo/consumo tem prova adicional em memória/CTEs; não comprova plano ou execução TiDB de produção. XML foi conferido no prefixo de leitura e expressão ANS/escape, sem geração/envio real.

Não foi consultado o provisionamento físico da estrutura legada de justificativas nem de colunas auxiliares durante esta preparação. Antes de eventual promoção, recomenda-se preflight autorizado somente de catálogo e filas; ausência deve bloquear o fluxo, sem criar/alterar estrutura automaticamente. A 0146 já foi aplicada/liberada anteriormente e **não foi reaplicada**.

A prévia privada é SSR estática do JSX real com hosts UI sintéticos/CSS compilado, sem Radix/backend ou Portal; não equivale a homologação, autenticação ou publicação. O WebDev permaneceu no checkpoint **1a17cb3a** durante toda a preparação. Nenhum merge/checkpoint/Publish novo ou operação de dados reais foi executado.
