# Procedimento proposto — 0139 e rotina diária de atendimentos

## Estado desta revisão

Preparação em branch própria. A 0139 está reservada na Issue #34 e não foi aplicada em produção. Nenhuma agenda real foi criada e nenhum atendimento foi publicado por esta entrega. O pedido de implantação às 10h não substitui o aceite da revisão exata, do procedimento de banco e do primeiro recorte de dados apresentados.

## Objetos e efeitos

SQL gerada pelo Drizzle: `drizzle/0139_past_toro.sql`. São oito declarações aditivas: três CREATE TABLE e cinco CREATE INDEX. As tabelas de controle, lotes e execuções possuem, em conjunto, 43 colunas, três chaves primárias, cinco restrições únicas e cinco índices não únicos. Não há FKs nesta migração. Os relacionamentos e o isolamento são validados pelo serviço em transações e locks.

As tabelas nascem vazias e pausadas. A SQL não altera as stagings ou `atendimentos_unificados`, não importa registros, não modifica permissões e não cria tarefas. Não inclui nem aplica a 0135. Os SQLs e snapshots anteriores permanecem imutáveis; o journal recebe somente o novo item gerado em desenvolvimento.

## Verificações já realizadas

A SQL foi executada integralmente em TiDB 8.5.3 local isolado, com TLS verificado e dados fictícios. O ensaio comprovou objetos, unicidades e armazenamento dos slots manuais com UUID. Esse ensaio não é backup nem restauração do Portal.

O ensaio funcional local completou 16 verificações com o serviço real e Heartbeat substituído por um fake: captura manual, prévia, ativação sem publicação imediata, cron idempotente, bloqueio de lote carregando, inserção/atualização/inativação sem apagar registros nem alterar valores/anotações/datas civis, IAD com a mesma chave isolada, bloqueio de reinício de lote publicado e revogação do administrador. Nenhuma tarefa real foi criada.

Foram aprovados 104 testes sintéticos de rotina/mapeamentos/regressão e dez verificações Playwright desktop/móvel, além do build e `db:check`. O TypeScript permanece com 172 diagnósticos legados, sem novo diagnóstico no módulo e sem aumento por arquivo/código. Dois problemas reais foram corrigidos no ensaio local: LIMIT parametrizado incompatível com o driver TiDB e campos de confirmação indevidamente enviados à consulta de resumo estrita.

O preflight produtivo somente leitura de 27/10/2026 confirmou: zero tabelas e marcadores 0139; uma entrada compatível de cada migração 0136, 0137 e 0138; zero da 0135; duas unidades ativas; histórico consultável com 99 entradas. É necessária nova conferência imediatamente antes de uma aplicação autorizada, pois esse diagnóstico não reserva o banco por si só.

## Aprovações e recuperação pendentes

Sergio é o único aprovador obrigatório. Antes da janela, apresentar e aceitar a revisão exata da PR, SQL, executor restrito, alvo, janela e plano de recuperação. Backup durável aplicável e recuperação demonstrada continuam pendentes para a 0139. As exceções das migrações 0137 e 0138 não se estendem a ela.

Antes da primeira publicação de dados, é necessário definir também proteção e recuperação do recorte de atendimentos afetado. Uma atualização do retrato aberto pode alterar campos mapeados e inativar ausentes; não equivale a uma carga apenas de novos registros. A ausência de exclusão física não elimina o risco de uma fonte incorreta.

## Aplicação estrutural, quando autorizada

1. Confirmar que a Issue #34 mantém somente a reserva 0139 e não há outro executor de migração concorrente.
2. Fixar identidade do alvo TLS, SQL/executor e histórico anterior. Confirmar ausência integral dos objetos e do marcador da 0139.
3. Usar exclusivamente um executor restrito previamente revisado para as oito declarações imutáveis, em ordem e com parada na primeira falha. Não executar `db:migrate` geral, `db:push`, reconstrução de histórico ou seleção indiscriminada de pendências.
4. Validar as três estruturas completas, tipos/defaults, índices/uniquidades e tabelas vazias. Somente após essa prova registrar uma única entrada canônica 0139, preservando todas as anteriores.
5. Em conexão independente, repetir a prova física/histórica, confirmar zero alteração das estruturas externas e registrar apenas contagens na Issue #34. Liberar somente a reserva concluída.

DDL pode ser parcial e não é revertida por ROLLBACK. Em falha/incerteza, interromper, manter evidências e estruturas, sem repetir SQL nem executar DROP/DELETE/TRUNCATE. Recuperação ou correção progressiva exige procedimento e autorização próprios.

## Publicação do código e rotina real

Publicar o código aprovado e comprovar o checkpoint publicado antes de criar Heartbeats. São duas rotinas isoladas — Urológico e IAD — no horário fixo de 10:00 de Brasília, cron UTC de seis campos `0 0 13 * * *`, sem temporizador dentro do processo e sem tarefa recorrente de agente.

O produtor Hop deverá obter a permissão de início antes de escrever e anunciar conclusão somente após todas as linhas do retrato completo, usando o mesmo identificador de lote e total esperado. Cópias antigas não sinalizadas não podem ser consideradas automaticamente novas cargas completas. Ajustar todos os escritores da staging para esse protocolo; ele é cooperativo e não bloqueia sozinho um cliente externo que o ignore.

Uma carga já concluída pode ser registrada manualmente na tela somente com confirmação de lote completo e produtor parado. Preparar prévia por unidade, conferir contagens e obter o aceite do primeiro espelhamento. Publicar agora e ativar diariamente são ações separadas. Lote vazio, fonte inválida, duplicada/mista, redução suspeita, concorrência, estado incerto ou cobertura insuficiente bloqueiam a execução.

Não criar uma rotina enquanto o callback não estiver publicado. Não afirmar que o processamento diário funciona apenas por existir um registro de agenda: validar a identidade da tarefa, próxima execução, uma execução autorizada e seu resultado agregado no Portal.

## Limites preservados

A chave é estabelecimento + origem + identificador estável do atendimento. A rotina não altera valores financeiros, anotações, notificações ou registros de outras origens/unidades. Datas civis da origem não são deslocadas de fuso. Ausentes ficam inativos, sem apagar o histórico; reaparecimento permite reativação. Uma falha incerta não libera lease nem repete DML às cegas.
