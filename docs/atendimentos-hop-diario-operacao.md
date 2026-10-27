# Atendimentos em aberto — rotina diária das 10h

**Solicitação:** Sergio, 27/10/2026. **Estado:** desenvolvimento em branch própria; não é declaração de implantação ou agenda ativa.

## Onde controlar

A seção **Atualização de Atendimentos** ficará no Integrador de Dados do Portal. Haverá um controle por estabelecimento: Hospital Urológico e IAD. A tarefa nativa do Portal será disparada todos os dias às **10:00, horário de Brasília (America/Sao_Paulo)**. Não dependerá da conversa Manus, navegador aberto ou computador de desenvolvimento ligado.

O controle de horário existente do EASYLocal não deve ser usado diretamente para estas stagings: importar para uma tabela e publicar em Atendimentos são ações diferentes. Esta entrega acrescenta o adaptador específico de atendimentos e não modifica o fluxo financeiro do integrador.

## Regra de negócio

A staging completa representa todos os atendimentos que continuam em aberto na origem. O destino será atualizado pela chave estabelecimento + origem WARLEINE + número estável do atendimento.

- Novos serão inseridos.
- Existentes terão atualizados somente os campos presentes no mapeamento Hop.
- Atendimentos que voltarem serão reativados com o mesmo identificador.
- Ausentes de uma carga completa serão inativados na fonte, deixando a visão de parados sem excluir o registro ou seu histórico.
- Anotações, notificações, valores financeiros e dados de outras unidades/origens serão preservados.

A ausência não será classificada como recebimento, faturamento ou alta: significa apenas que o atendimento deixou de constar no retrato dos abertos. Os atendimentos serão contados por chave, não por paciente, pois o mesmo paciente pode ter vários atendimentos.

## Ajuste obrigatório do Hop

Cada workflow da unidade precisa seguir a sequência: **registrar início da carga → executar a carga existente e confirmar as gravações → registrar conclusão**. O ramo de erro registra falha e não pode sinalizar conclusão. O registro de início precisa ser aceito antes de qualquer escrita na staging, inclusive uma limpeza já existente. Um produtor que ignore esse protocolo não é compatível com a ativação.

O início e o término usarão a credencial dedicada à unidade gerada na tela administrativa. O Portal guarda apenas o hash e não exibe novamente a credencial nas consultas. O segredo deve ser colocado na configuração segura de execução do Hop, sem logs, repositório, capturas ou mensagens. O identificador de lote será um UUID técnico novo, sem nome de paciente, guia ou outro dado hospitalar. O término informa o total esperado da carga completa; o Portal valida os registros e calcula uma assinatura privada do snapshot.

Não haverá escrita no EASYLocal por esta rotina. Não é necessário cadastrar agendamento no DBeaver, cron do servidor de desenvolvimento ou máquina do auditor.

O workflow Hop deve concluir antes das 10h. Se ainda estiver carregando, se falhou ou se o retrato mudou sem novo lote completo, a execução diária não publica nem inativa contas. O estado anterior permanece e o resultado informa a pendência. Não é prometida uma execução imediata ao terminar uma carga atrasada; a correção pode usar a ação manual com prévia, ou a próxima execução diária após um lote válido.

## Primeira carga já feita

Sergio confirmou que as cargas atuais terminaram. A tela permitirá registrar a carga existente com duas confirmações explícitas: **carga completa** e **Hop parado**. Isso apenas registra o lote; não publica os atendimentos. Antes de publicar, a prévia deve apresentar quantos serão inseridos, atualizados, reativados e inativados por unidade.

A leitura das 10:51 de 27/10 encontrou 670 atendimentos na staging Urológico e 13.043 no IAD. Esses números não serão fixados no código nem tratados como contagens atuais: o procedimento recalcula o retrato imediatamente antes do aceite e da transação.

A primeira publicação será distinta de **Ativar diariamente às 10h**. Ativar o horário não fará uma carga escondida. Nenhuma dessas ações será executada automaticamente ao abrir a página ou publicar o código.

## Proteções

Uma trava persistida por unidade impede publicação concorrente e impede um novo início do produtor enquanto o publicador estiver trabalhando. O lote completo é confrontado com a fonte e o destino atuais. Registros duplicados, unidade errada, fonte vazia, redução extraordinária ou lote alterado impedem a publicação. O mesmo lote/horário não pode ser aplicado duas vezes. Resultado de commit incerto fica bloqueado para conferência, sem repetição automática.

O histórico mostrará somente estado, duração e contagens agregadas. Credenciais, dados de pacientes, SQL bruto e assinaturas privadas não aparecem nos registros públicos.

## Liberação em produção

A implementação entra por PR própria. O controle de agenda/lotes/execuções exige a migração aditiva reservada 0139, que ainda precisa ter sua revisão, SQL, homologação e procedimento apresentados a Sergio. Não executar migrador geral nem db:push. A 0135 não pertence a esta entrega. As exceções de backup aceitas para 0137 e 0138 não autorizam uma nova migração.

A ordem será: revisar/autorizar a PR e o procedimento → aplicar somente a nova migração → publicar e comprovar o código → configurar o protocolo no Hop → fazer prévia e primeira sincronização por unidade → ativar e validar a agenda das 10h. Qualquer pendência ficará identificada, sem anunciar a rotina como funcionando antes da prova da primeira execução.

## Referências

[1]: https://hop.apache.org/manual/latest/workflow/workflows.html "Apache Hop: Workflows"
[2]: https://hop.apache.org/manual/latest/workflow/create-workflow.html "Apache Hop: Create a Workflow"

O encadeamento de ações e seus ramos de sucesso/falha descritos acima seguem o modelo de workflows documentado pelo Apache Hop [1] [2]. A documentação não comprova que o workflow real do usuário já foi alterado.
