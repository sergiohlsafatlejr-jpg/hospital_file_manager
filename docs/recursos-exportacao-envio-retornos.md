# Recursos de glosa — preparação, envio e recebimento

## Entrega atual: primeira etapa

Solicitação de Sergio: começar pela distinção entre arquivo exportado e recurso enviado, e entre pagamento original da conta e recebimento posterior do recurso. A Issue #106 coordena a implementação em branch própria. Esta entrega não modifica schema, não executa manutenção de dados, não reclassifica os históricos e não publica em produção sem a liberação da PR.

### Preparar e exportar não é enviar

A criação do lote mantém os itens como preparados/vinculados. Excel, XML e ZIP geram arquivos; não registram envio ao convênio e não iniciam um prazo de resposta. O XML gerado é um artefato, não um comprovante de transmissão. O prazo automático de 30 dias a partir da criação foi removido dos novos lotes; prazos reais exigem regra contratual válida, não uma referência presumida à ANS.

A ação **Confirmar envio** exige protocolo, data civil válida e confirmação explícita. Registra uma declaração manual de envio externo. Não transmite ao sistema do hospital ou do convênio, nem verifica o recebimento do destinatário. Só admite lotes em rascunho/pendentes; repetição idêntica é idempotente, preservando inclusive lotes que avançaram para análise/resposta/finalização. O serviço usa transação, bloqueio do lote e conferência de unidade/convênio dos itens antes de gravar. Respostas anteriores dos itens não são sobrescritas. Rotas genéricas não podem registrar protocolo/data de envio nem contornar esta confirmação.

A criação do lote também é transacional: exige a seleção integral elegível, bloqueia os itens livres e verifica quantos vínculos foram efetivados em cada fonte. Reserva perdida ou erro após o INSERT causa rollback, evitando lote órfão ou seleção parcial tratada como sucesso. Nenhuma dessas operações foi executada em dados reais nesta entrega.

Os estados antigos foram preservados. Alguns lotes históricos podem ter sido marcados como enviados pelas exportações anteriores; corrigir esses registros exige evidência e manutenção específica, não uma mudança de código retroativa.

### Valores separados

| Campo | Significado | Fonte nesta etapa |
|---|---|---|
| Pago original da conta | Pagamento do demonstrativo original que precedeu o recurso | Demonstrativo ou conciliação original |
| Recursado | Valor solicitado no recurso | Item/lote de recurso |
| Acatado (registrado) | Decisão favorável informada, não prova de dinheiro recebido | Recurso legado com deferimento/deferimento parcial |
| Recebido do recurso (informado) | Valor posterior lançado manualmente no controle legado | `recursosGlosa.valorRecebido` |
| Data do recebimento do recurso | Data do lançamento manual desse recebimento posterior | `recursosGlosa.dataPagamento` |

Ausência de registro de recebimento não comprova ausência de pagamento. Demonstrativo/conciliação/XML de recurso não podem preencher recebimento de recurso com o pagamento original, com o valor solicitado ou com o valor da decisão. Valores originais desconhecidos são apresentados como desconhecidos, não como pagamento zero comprovado. Totais de recebimento e acatamento são calculados a partir de registros próprios, com precisão decimal. Totais históricos podem ser expostos somente como rastreabilidade/divergência, não como caixa confirmado.

Esta etapa mantém o controle manual legado. Ele representa um valor acumulado informado; ainda não é um histórico de parcelas nem um retorno importado e revisado. O relatório Excel preserva os campos existentes e acrescenta colunas separadas de original, acatamento e recebimento de recurso.

## Segunda etapa: aba Retornos — ainda não implementada

O piloto será no Hospital COTEFI / CASSI, confirmado por Sergio em 26/10/2026. Dois caminhos precisam convergir para o mesmo acompanhamento:

1. **Recurso externo:** o hospital apresentou o recurso diretamente no sistema do convênio. O Portal registra suas referências, protocolo, itens e valores para acompanhamento. Não reenvia nem gera outro recurso automaticamente.
2. **Recurso preparado no Portal:** os itens são preparados e exportados aqui, entregues ao hospital para envio. A exportação não se torna enviada antes da confirmação manual. O destino exato (sistema interno do hospital ou portal do convênio) e o modelo compatível serão confirmados por Sergio.

A aba Retornos deverá importar um arquivo específico de convênio/modelo para área de revisão. Unidade, convênio e identificadores fortes de recurso/lote/item determinam a associação. Guia/código repetidos, valor semelhante ou nome de paciente não permitem escolher silenciosamente uma ocorrência. Vínculos ambíguos ou ausentes permanecem pendentes e não alteram saldo.

Após aprovação, cada parcela será um evento financeiro próprio, com referência de origem e chave idempotente. Repetir o mesmo arquivo/ocorrência não gera novo recebimento. Estornos geram eventos compensatórios; o histórico original permanece. Decisão do recurso e crédito financeiro são eventos diferentes. O valor solicitado ainda não recuperado e o saldo acatado a receber devem aparecer separadamente. Indeferimento/aceite encerra uma parcela da contestação, mas não comprova pagamento nem transforma um valor rejeitado em conta a receber. Recebimento acima do acatamento ou do solicitado ficará como divergência para revisão.

A referência dos itens precisa sobreviver à reimportação do demonstrativo, cujo fluxo atual pode excluir e recriar suas linhas. Não basta ligar o retorno a um ID transitório sem preservar um vínculo de origem auditável.

### Estrutura futura proposta — não gerada nem reservada

Uma migração aditiva poderá registrar canal/origem do lote, referências-fonte dos itens, importações e linhas em revisão, além de eventos de decisão/pagamento/estorno. Índices e chaves idempotentes devem incluir estabelecimento e convênio. O desenvolvimento dessa estrutura exigirá uma reserva única na Issue #34, geração por `db:generate` e conferência por `db:check`. A 0135 Banco/XML permanece suspensa; esta entrega não a reativa ou aplica. Nunca executar migrador geral para esta funcionalidade.

### Pendências do piloto

- Relatório dos recursos já apresentados, com protocolo e referências dos itens.
- Exemplo de resposta/pagamento de recurso (XML, Excel ou PDF) e explicação de quais valores representam decisão e quais comprovam crédito.
- Destino/modelo de exportação do recurso preparado no Portal e responsável pela revisão das associações ambíguas.
- Definir o critério do filtro por período nos retornos: data de envio, resposta ou pagamento, com o mesmo recorte no relatório exportado. A competência de faturamento não deve ser presumida como data do recebimento do recurso.

## Validação

- **64 testes sintéticos** aprovados em 6 arquivos, com URLs de banco removidas do processo.
- **10 cenários de navegador** aprovados: Excel/XML/ZIP sem envio; valores e datas separados; protocolo obrigatório; confirmação explícita; reexportação; largura móvel; troca de unidade e callback tardio. Excel gerado no ensaio foi reaberto para conferir os campos.
- **Build, `db:check` e `git diff --check`** aprovados. Não houve geração ou aplicação de migração.
- **TypeScript:** 172 diagnósticos na base e 172 na revisão final, sem novo par arquivo/código de erro. A dívida legada permanece.
- Revisão técnica focal concluída; o bloqueante de criação não atômica foi corrigido e reconferido. Isso não substitui a revisão humana prevista no protocolo.
- A suíte legada de integração `recursosHistoricosRouter.test.ts` depende de uma base específica. Um ensaio sem conexão não satisfaz seus dados/permissões esperados; ela não foi usada como evidência de regressão aprovada desta entrega.

Nenhum resultado sintético comprova comportamento em produção nem concorrência efetiva sob carga. A PR permanece sujeita à revisão e liberação; não houve merge, deploy, alteração histórica ou lançamento real de recebimento. PDF de contrato, integração automática com o convênio, agendamento e novos formatos de retorno permanecem fora da primeira etapa.
