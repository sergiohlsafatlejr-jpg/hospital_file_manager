# Reconciliação Drizzle para aplicar apenas a migração 0130

**Estado em 02/10/2026: BLOQUEADO PARA ESCRITA EM PRODUÇÃO.** Este documento é uma auditoria e proposta de execução; **não** marca migrações como aplicadas, não aplica SQL e não autoriza publicação automática. Base do código: `main` `6cf2033`. Banco: conexão configurada para o Portal, inspecionada **somente por metadados e contagens agregadas**. Não expor credenciais, registros hospitalares ou identificadores de usuários em Issues e PRs.

## Por que `db:migrate` não pode ser executado agora

Na versão de `drizzle-orm/mysql-core/dialect.cjs` instalada, o migrador lê `__drizzle_migrations` ordenando por `created_at` descendente, pega a última linha e executa cada SQL local cujo `folderMillis` seja **maior** que esse marco. Ele não verifica objetos no `information_schema` nem a presença de cada hash individual para decidir o que pular.

O banco contém **91** registros no histórico, mas o último `created_at` é `1782841349000`, posterior à 0104 e anterior à 0105. Existem **26** SQLs candidatos, de **0105 a 0130**. A 0129 foi substituída funcionalmente pela 0130 e Sergio decidiu **não** criá-la; a 0130 define **cinco** stagings por unidade, ausentes no banco. A simulação local, sem escrita, confirma: *se* a linha histórica pudesse ser avançada até o timestamp da 0129 após auditoria, **somente a 0130** seria selecionada. Isso **não** torna seguro avançar o marco agora.

## Evidências somente leitura recolhidas

| Verificação | Resultado | Limite da conclusão |
| --- | --- | --- |
| Estruturas de 0105–0128 | As tabelas criadas nesse intervalo existem e as colunas `ADD` examinadas também; dos índices `CREATE INDEX` examinados, só falta `pacientes.idx_pacientes_convenio`. | Presença de nomes não prova aplicação da migração, definição exata, efeitos de DML ou autoria. |
| Tipos de colunas do SQL histórico versus estado atual | **18 divergências** detectadas na comparação mecânica: 16 atribuídas ao SQL 0105, uma à 0115 e uma à 0119. Algumas podem ter sido alteradas depois por migrações ou intervenções legítimas. | Precisam de revisão de tipos, nulabilidade, defaults e alterações posteriores antes de qualquer correção; **não** reverter tipos ao formato antigo por reflexo. |
| 0129 | A tabela genérica e seus índices estão ausentes. | Deve permanecer dispensada, não executada, com decisão registrada separadamente do histórico físico. |
| 0130 | Cinco tabelas e seus 20 índices estão ausentes. | O SQL versionado já as define; executar diretamente à margem do histórico criaria dívida de reconciliação e risco de reexecução. |
| Hashes históricos | Três registros posteriores ao início do journal versionado não têm arquivo correspondente identificado neste checkout; dois são posteriores à 0104. | Investigar proveniência; não apagar, regravar ou atribuir autoria sem evidência. |
| 0110, 0111, 0113, 0114: pós-condições atuais | Em contagens agregadas: **1** divergência atual na relação entre permissões da 0110; **0** divergências na regra atual de e-mail da 0111; **0** grupos de permissões duplicados da 0113; **0** linhas elegíveis sem BI da 0114. | A divergência da 0110 pode ser alteração posterior intencional. Não modificar permissões nem aplicar `UPDATE` antigo automaticamente. Os zeros são compatibilidade **atual**, não prova de execução histórica. |
| 0121 e 0123 | SQLs incluem backfill de origem Warleine e seleção de snapshot ativo; a presença de estrutura não prova os efeitos históricos. | Reaplicar a 0123 pode mudar o ponteiro de lote e o horário de ativação; exige auditoria da lógica e de snapshots por ambiente. |

A análise dos seis SQLs que contêm efeitos de dados foi revisada separadamente em leitura estática. Nenhuma linha individual, nome de paciente ou valor operacional foi extraído. Comparações de tipos são preliminares: algumas mudanças posteriores tornam impossível usar o tipo original da 0105 como especificação atual sem verificação.

## Sequência de reconciliação proposta

1. **Coordenação e isolamento.** Identificar a tarefa Collab **Coordenação — Safatle Sistema**, registrar `MIGRAÇÃO RESERVADA`, commit, responsável e janela exclusiva. Não há tarefa Collab identificável na lista acessível desta sessão. Fazer PR para toda alteração de schema e obter revisão de Danilo ou Paulo; não fazer push direto na main.
2. **Recuperação real.** Concluir cópia cifrada recente em armazenamento privado durável, com chave em cofre distinto, e **restaurar em banco de homologação isolado**. O backup do Sandbox de 01/10 teve integridade verificada, mas é local, não sincroniza alterações posteriores e **não foi restaurado**. Credencial exclusiva de homologação ainda não está configurada.
3. **Certificar 0105–0128.** Comparar para cada SQL seus `CREATE`, `ALTER`, índices e unicidades com `information_schema` (incluindo tipos, defaults, nulabilidade, ordem das colunas). Investigar o índice ausente e as 18 divergências de tipo. Para `UPDATE`/`DELETE`/`INSERT`, usar contagens agregadas e evidência histórica quando disponível; para permissões e snapshots, validar mudança de comportamento e não reexecutar comandos antigos. Se um efeito necessário estiver de fato ausente, corrigir por **nova mudança mínima versionada**, gerada via `db:generate`, conferida via `db:check`, PR e revisão — não reexecutar a migração antiga inteira.
4. **Registrar a exceção da 0129 em plano auditável.** Ela já está no journal da main, mas sua tabela não deve ser criada. O procedimento exato de avanço de metadados até **0129 dispensada** deve ser preparado e revisado por DBA/equipe, distinguindo claramente *baseline reconciliado* de *SQL executado*. Requer guards para banco/commit/último registro/objetos, operação idempotente e trilha separada. Não editar SQL/journal integrados nem apagar/regravar os 91 registros. **Nenhum marcador foi inserido.**
5. **Ensaiar no clone.** No banco restaurado, aplicar só correções físicas aprovadas, a reconciliação específica do histórico e, então, `pnpm db:migrate`. Antes de executar, um preflight deve provar que a fila candidata é `[0130_dapper_moon_knight]`, e que a staging 0129 não existe. Após, conferir as cinco tabelas, chaves e 20 índices; executar `pnpm db:check`, testes de isolamento por estabelecimento e simulação de falha/recuperação. DDL no TiDB não deve ser tratado como reversível por transação.
6. **Produção por janela exclusiva.** Somente após restore testado, PR/revisão, backup externo recente, reserva Collab e aprovação do plano exato por Sergio: conferir novamente schema e watermark do banco-alvo; aplicar o mesmo procedimento validado em homologação; verificar cinco tabelas/índices, histórico e escopo; publicar código compatível separadamente. Se qualquer guarda não corresponder, **interromper sem modificar o histórico**.

**Proibição explícita:** não rodar `db:migrate` direto no estado atual, não usar `db:push`, não editar `drizzle/meta/_journal.json` ou migrações antigas à mão, não reaplicar o `DELETE` da 0113 nem o UPSERT da 0123, e não marcar 0105–0129 como *executadas* com base só na presença de tabelas.

## Estado desta entrega

- **Feito:** inventário da main, comparação mecânica de metadados, revisão estática de seis migrações com DML, contagens agregadas pontuais, prova de seleção hipotética apenas da 0130.
- **Não feito:** homologação, restauração, prova histórica completa dos 24 SQLs, correção de índice/tipos/permissões, reserva na tarefa Collab, escrita no histórico, criação das tabelas ou deploy.
- **Próxima decisão:** identificar responsáveis e acesso à homologação/guarda externa para concluir a certificação; só então preparar uma mudança operacional exata de baseline para revisão formal.
