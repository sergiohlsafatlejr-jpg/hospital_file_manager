# Upload de demonstrativos: desempenho e status

## Diagnóstico de 16/10/2026

Investigação somente leitura solicitada por Sergio após demora ao enviar uma planilha de retorno. Nenhum arquivo real foi reprocessado pelo Manus e não houve DDL, DML, limpeza, alteração de status ou reinício de produção durante a auditoria.

- O primeiro envio observado recebeu o arquivo, mas ficou em 10%, sem inserir registros. Os logs mostraram download concluído e três tentativas automáticas; não mostraram entrada no parser. A sequência do worker situa a interrupção entre o download e o início da leitura, na etapa de limpeza.
- A tabela `recebimentos_excel` não possui índice por `arquivo_id`. O plano **EXPLAIN**, sem executar o DELETE, mostrou `TableFullScan` com aproximadamente 662 mil linhas estimadas. Isso confirma uma limpeza ampla e desnecessária para IDs que acabam de ser criados. Não prova, isoladamente, todos os fatores que fizeram a primeira execução interromper.
- Um segundo envio observado chegou a ser marcado `processado` com progresso parcial enquanto o worker ainda inseria lotes. O código da requisição delegadora continuava até a finalização inline depois de disparar o worker.
- Esse segundo envio concluiu em 100%, com **19.572 recebimentos e 19.572 registros no Demonstrativo**, conforme contagens por arquivo. Essa conclusão ocorreu no sistema existente e não é resultado da correção proposta.
- O diagnóstico não demonstra indisponibilidade total nem esgotamento de recursos da hospedagem de produção. Recursos do Sandbox não foram tratados como recursos de produção.

Nenhuma informação individual de paciente, valor financeiro, credencial, URL de armazenamento ou conteúdo de planilha integra esta documentação.

## Correção de código

1. O upload tRPC de Excel/CSV grande delega o processamento e retorna da sua rotina, sem marcar `processado` antecipadamente.
2. O envio multipart usa o mesmo helper de delegação e não executa uma primeira limpeza duplicada antes de chamar o worker.
3. Somente o **primeiro processamento de um Excel com ID recém-criado** envia o sinal interno booleano `limparDadosAnteriores: false`.
4. O worker dispensa a limpeza inicial de Excel apenas com esse sinal. Sinal ausente, `true`, texto ou valor inválido mantêm a limpeza. Reimportação, reprocessamento e watchdog antigo continuam no comportamento conservador anterior.
5. CSV e XML não ganham dispensa de limpeza. Parser, mapeamento, cálculos, estabelecimento, convênio, datas e tamanho dos lotes não mudam.
6. Falha de rede ou resposta HTTP não OK do worker registra erro em vez de ignorar a falha HTTP.

O sinal só é usado na rota interna já protegida pelo segredo do servidor. Não é parâmetro novo exposto ao usuário.

## Limites

- Não é uma fila durável nem implementa exclusividade persistente entre workers. A política legada de reenvio e watchdog permanece; não enviar repetidamente o mesmo arquivo durante processamento.
- Não altera regras legadas de erro parcial, sincronização, conciliação automática ou aceite de glosas.
- Não resolve o índice ausente para reimportações, buscas e sincronizações. Uma futura alteração de banco exige avaliação e migração separada na fila da Issue #34; nenhum índice deve ser criado avulsamente.
- A planilha original não foi recebida como anexo nesta tarefa. Os testes de código são sintéticos; não existe comparação de desempenho antes/depois com o arquivo real.
- Não há promessa de tempo de importação. A melhoria elimina trabalho desnecessário e corrige o status; a redução efetiva de tempo deve ser medida após publicação aprovada.

## Validação e liberação

- Testes do helper cobrem retorno enquanto o HTTP do worker está pendente, falhas de rede/HTTP, registro de erro, sinal estrito, reimportação e ligação dos caminhos tRPC/multipart.
- Testes do handler real do worker, com dependências inteiramente simuladas, cobrem primeiro Excel sem limpeza, limpeza conservadora, falha de inserção, segredo inválido e ausência de conclusão durante inserção pendente.
- Regressão dos parsers, mapeamentos e uploads existentes faz parte da validação.
- Build, `db:check`, diff e comparação de tipos com a main devem ser conferidos na revisão exata da PR.

A correção é separada da PR #90. **Não fazer merge nem publicar sem revisão e autorização próprias.** Nenhuma nova carga real é necessária para preparar a PR; validar a versão publicada não autoriza reprocessar demonstrativos anteriores.

### Resultados desta entrega

Foram aprovados **93 testes em 8 arquivos**, build, `db:check` e `git diff --check`. O TypeScript manteve **172 diagnósticos na main e na branch**, sem novos diagnósticos por arquivo/código nem nas linhas alteradas. A revisão técnica independente não encontrou bloqueantes; observabilidade sanitizada e cobertura de Excel grande/falha no registro de erro foram ampliadas antes da validação final. Essa revisão técnica não substitui a revisão humana exigida pelo protocolo do projeto.
