# Sincronização diária de atendimentos em aberto — IAD e Urológico

Solicitação de Sergio em 27/10/2026: todos os dias às **10:00 America/Sao_Paulo**, espelhar as duas stagings de contas abertas em `atendimentos_unificados`. Preparação em branch própria, PR obrigatória. Nenhuma execução produtiva, migração ou agenda real ativada pela implementação.

## Contrato

Fontes permitidas: Urológico (1260036) e IAD (2550002), com seus layouts Hop físicos próprios; origem fixa `WARLEINE`, chave `numatend`. Inserir novos, atualizar apenas campos do mapeamento Hop, reativar presentes e inativar ausentes do snapshot completo. Preservar IDs, histórico, anotações, notificações, dados financeiros e outras origens/unidades. A ausência não prova faturamento ou recebimento.

Horário fixo inicial 10:00 Brasília, cron UTC de seis campos `0 0 13 * * *`. Disparo Heartbeat nativo do Portal, não timer em memória nem tarefa de agente. Controles e logs sem linhas hospitalares. Fila de migração 0139 reservada na Issue #34; nenhuma exceção de backup antiga é reutilizada.

## Segurança do produtor e da publicação

O Hop deve sinalizar **iniciar** antes de escrever na staging, e **concluir** somente após todos os pipelines da unidade terminarem com sucesso e as gravações estarem confirmadas. Ambas as operações são autenticadas por credencial aleatória dedicada à unidade, gerada uma única vez na UI administrativa, guardada apenas como hash no Portal. Nenhuma credencial vai para logs, Issues, documentação ou chat. O token não aceita unidade/tabela arbitrária: unidade vem do controle autenticado. `loteRef` deve ser UUID não clínico; contagem esperada validada na conclusão; o Portal calcula o fingerprint privado do snapshot.

Um controle único por unidade serializa produtor e publicador. Nunca aceitar novo início enquanto a publicação tem lease ativo/incerto; nunca publicar enquanto o lote está carregando/falhou. No início do lote, invalidar qualquer snapshot anterior ainda não publicado. Não existe exclusão automática da staging pela API. Escritores que não participem do protocolo são incompatíveis com a ativação; não afirmar que fingerprints substituem a exclusividade cooperativa. Resultado incerto bloqueia novas mutações até conferência. Não liberar automaticamente lease expirado.

A primeira carga já existente pode ser registrada por um administrador com duas confirmações explícitas: carga completa e Hop parado. Isso não publica nada. Antes da publicação manual/ativação, mostrar prévia de inserções, atualizações, reativações e inativações, com aceite explícito e token de prévia assinado, vinculado a ator/unidade/lote/estado vigente. Redução extraordinária/zero não deve ser aplicada automaticamente. Limite 100.000 e prazo inferior ao timeout Heartbeat; transação curta e consultas em lotes.

## Responsabilidades de arquivos

- Módulo puro: `server/atendimentosHopSnapshot.ts` e `.test.ts`, recebe arrays sintéticos/privados, sem banco. Exportar `construirPlanoHop(estabelecimentoId, fonte, destino)` e tipos do destino/plano; plano inclui fonte mapeada, novas/atualizadas/reativadas/inalteradas/inativarIds, contagens, fingerprint privado; `slotHopDiario(now)` aceita a janela de 10:00 BRT e retries curtos.
- Serviço/schema: `server/atendimentosHopDiarioService.ts`, router e callbacks específicos, `drizzle/schema-atendimentos-hop-diario.ts`, testes próprios. Três tabelas aditivas de controle, lotes e execuções; sem FKs externas para evitar alterações em tabelas legadas. Não gerar SQL até schema estabilizado e coordenador avisado. Métodos e DTOs em `shared/atendimentosHopDiario.ts` são contrato comum.
- UI: `client/src/components/integrador/AtendimentosHopDiario.tsx` e componente de painel puro/fixture/teste. Integrar após abas na página `IntegradorEasyLocal.tsx`. Usar router `trpc.atendimentosHopDiario`, métodos `resumo`, `confirmarCarga`, `gerarCredencial`, `prever`, `publicar`, `ativar`, `pausar`. Mostrar token de produtor só no modal após geração e limpar ao fechar; não persistir em localStorage.
- Coordenador integra registro do router/schema/callback, gera/verifica migração, ensaios TiDB local, auditoria focal e PR. Mantém a informação médica XML separada e responde seu estado publicado sem indexar/confirmar dados reais.

## Chamadas

`resumo(escopo) -> HopDiarioResumo`; `confirmarCarga({escopo,confirmarCargaCompleta:true,confirmarHopParado:true}) -> resumo`; `gerarCredencial(escopo) -> {credencial:string}`; `prever(escopo) -> HopDiarioPrevia`; `publicar/ativar({escopo,tokenPrevia,confirmarEspelhamento:true}) -> resumo`; `pausar(escopo) -> resumo`. Ativação não publica imediatamente. Horário não configurável nesta entrega. Todos são admin, cron identity recusada nas rotas comuns. Criador/admin proprietário controla agenda; resumo pode ser lido por admin com a mesma unidade autorizada. O callback recebe exclusivamente task UID autenticado. API Hop separada da de cron.

## Referências do produtor

A documentação oficial descreve workflows Hop sequenciais por padrão e saídas success/failure; ações finais devem seguir apenas o caminho de sucesso, jamais um hop incondicional: https://hop.apache.org/manual/latest/workflow/workflows.html e https://hop.apache.org/manual/latest/workflow/create-workflow.html. Esses documentos não comprovam configuração do Hop do usuário; essa configuração será etapa explícita de implantação.
