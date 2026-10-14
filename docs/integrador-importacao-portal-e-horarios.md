# Integrador: EASYLocal como origem, Portal como destino e horários de busca

## Escopo confirmado por Sergio em 14/10/2026 às 15:01

1. Ler as tabelas do EASYLocal e trazer os registros para tabelas do Portal.
2. Criar tabelas novas de destino no Portal.
3. Automatizar os horários de busca, configurados na própria interface.

**Não inclui administrar ou gravar no EASYLocal.** A proposta anterior de administração PostgreSQL fica substituída por este fluxo. A credencial existente pode ser administrativa, mas as operações na origem permanecem somente de leitura. Não alterar usuários, roles, grants, replicação ou dados do EASYLocal.

## Etapas de implementação

### A — conexão e catálogo

Remover o bloqueio de role administrativa no teste e metadados, mantendo TLS, cifragem no cadastro e operações de leitura. PR própria, sem schema. Sem exigir testes manuais repetidos antes de cada leitura: o serviço resolve a configuração central e conecta quando necessário. A configuração permanece salva; o socket pode ser aberto/fechado a cada operação para recuperar falhas e funcionar no backend publicado.

### B — criação do destino e importação manual

Reutilizar o assistente da PR #79 para criar uma tabela nova, vazia e gerenciada no Portal. O namespace `integ_el_<unidade>_<nome>` evita confundir estes destinos com tabelas de negócio e stagings físicas já utilizadas por outros fluxos.

Configuração de leitura:

- Origem: schema/tabela do EASYLocal.
- Unidade: coluna e identificador correspondentes na origem.
- Destino: tabela gerenciada da mesma unidade no Portal.
- Chave: identificador estável e único; nunca deduplicar itens financeiros somente por guia.
- Campos: primeira versão faz mapeamento por nome; tipos devem ser compatíveis.
- Domínio: atendimentos, faturamento ou relatório.

Importação com prévia agregada, confirmação e token curto vinculado a usuário/unidade/configuração. Se o plano, dados de origem ou estado do destino mudarem, gerar nova prévia. A execução insere chaves novas e atualiza as existentes, sem truncar nem excluir registros ausentes na origem. Respeitar o estabelecimento em todos os campos e queries. Resultado incerto de commit exige conferência; não repetir automaticamente.

Primeira versão manual limitada a **2.000 registros completos por execução**; a leitura consulta um registro adicional para detectar excesso e bloqueia o lote, sem cortar dados. Cargas maiores precisam de execução paginada/resumível antes de ativar automação para elas. Esse limite não é suficiente para todas as cargas hospitalares existentes; não apresentar esta versão como importador irrestrito.

Nenhum teste desta preparação importa dados reais ou altera o catálogo de produção. A ação manual na interface, após publicação/revisão, tem sua própria prévia e confirmação do lote final.

### C — horários realmente automáticos

O backend publicado não deve usar `node-cron`, `setInterval` ou timers locais. O agendamento deve existir na plataforma e chamar um endpoint autenticado do Portal, sobrevivendo ao fechamento do navegador e à inatividade/reinício da aplicação.

Implementação necessária:

1. Controle persistido com `schedule_cron_task_uid` indexado, identificador do criador, unidade, configuração, horário, estado e revisão aprovada.
2. Interface para escolher horários/periodicidade, ativar, pausar e reativar; distinguir frequência desejada de tarefa realmente ativa.
3. Cadastro/alteração da tarefa por sessão autenticada do usuário autorizado.
4. Callback `/api/scheduled/...` que autentica o executor e resolve o plano **pelo task UID**, nunca pela unidade/tabela enviada no corpo.
5. Revalidar existência e autorização do criador, unidade, destino e plano; execução idempotente com lock, limites e logs agregados.
6. A versão do callback precisa estar publicada antes de cadastrar tarefas reais.
7. Retentativas não podem duplicar o lote. Cargas grandes exigem lotes e continuação duráveis dentro do prazo de execução.
8. Mostrar os horários na referência escolhida pelo usuário (padrão proposto: Brasília), convertendo para o cron UTC; indicar explicitamente o fuso. A configuração não deve depender do fuso do computador que cria a tarefa.

**Impedimento atual da fila:** a migração 0135 Banco/XML foi integrada no código, mas sua reserva permanece ativa e não aplicada na Issue #34. Pelo protocolo atual, não gerar uma nova migração de controle do agendamento enquanto essa reserva estiver ativa. Não alterar a 0135 já integrada nem aplicar `db:migrate` geral para resolver esta dependência.

Nesta preparação, os horários continuam como preferência, **não como uma tarefa automática em funcionamento**. A etapa C depende de liberação/coordenação da fila, revisão, homologação, aplicação da migração própria e publicação do callback. Não substituir por um cron em processo apenas para contornar a fila.

## Tabelas do Portal versus páginas finais

Preencher uma tabela gerenciada do integrador não muda automaticamente as telas de atendimentos, Conta Convênio ou relatórios: elas consomem contratos próprios. Depois da ingestão, o adaptador do domínio valida a carga e publica no destino de apresentação correto.

Para fluxos que já recebem Hop, escolher um único responsável por estabelecimento/domínio. Não ativar EASYLocal e Hop simultaneamente sobre o mesmo destino sem coordenação. Publicação de atendimentos/faturamento exige chave, competência, fonte e regras do domínio; não somar recebido Hop a demonstrativos nem adotar unidades por nome parecido.

## Estados apresentados ao usuário

- Conexão cadastrada/testada.
- Tabela de destino criada/conferida.
- Leitura configurada.
- Prévia disponível ou bloqueada (limite, tipos, chave, unidade).
- Importação manual confirmada ou resultado a conferir.
- Agendamento desejado, porém não ativado.
- Futuramente: automático ativo/pausado e próxima execução confirmada pelo serviço de agendamento.

Esses estados não devem ser confundidos: publicar código não cria objetos selecionados, agendar não garante uma carga concluída e importar uma staging não prova atualização das páginas finais.

## Revisão e implantação

Issue #84. Desenvolvimento em branch própria e PR; nenhuma carga real ou alteração de produção está autorizada apenas por preparar este módulo. Exceções anteriores de revisão/merge da PR #83 não se estendem às novas PRs. Reutilizar catálogo sem adicionar outra migração na etapa B; etapa C só gera a migração depois de resolver a fila.

Os gates da revisão exata e os limites do importador serão registrados na PR. A entrega de agendamento não deve ser declarada concluída enquanto faltar controle persistido, callback publicado e task UID registrado/ativado.

## Validação da etapa manual em 14/10/2026

A revisão integrada passou em **114 testes sintéticos**, com 4 testes SQL locais opcionais não executados nesta rodada. Build, `db:check` e `git diff --check` passaram. TypeScript conserva **172 diagnósticos legados nos mesmos arquivos/códigos da baseline limpa**, sem novos diagnósticos no escopo.

O navegador de QA usou somente dados fictícios e rede externa bloqueada. Foram conferidos: prévia sem importação, confirmação explícita, unidade no payload, expiração de token, ausência de retry automático, limpeza após troca de unidade, erro sanitizado e largura mobile.

A revisão corrigiu o bloqueio administrativo indevido no importador, aceitou views sem PK física quando a chave efetiva do recorte é válida, preservou chaves textuais `A`/`a`, rejeitou valores que seriam truncados/arredondados e destruiu conexões cujo rollback não pôde ser confirmado. A PK física é apenas metadado; a não nulidade e a unicidade reais continuam obrigatórias no lote.

**A etapa B será apresentada como PR rascunho dependente da PR #85**, para não confundir esta base manual limitada com a entrega completa de importação paginada, agendamento e atualização das páginas. Não foram importados registros reais, ativados horários, aplicadas migrações ou adotados destinos existentes. Não publicar a etapa B como atendimento completo dos três requisitos de Sergio.
