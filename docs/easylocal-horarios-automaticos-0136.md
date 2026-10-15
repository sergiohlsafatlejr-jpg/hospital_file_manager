# Integrador: horários de busca EASYLocal → Portal

## Escopo e estado

A entrega acrescenta horários à importação já publicada nas PRs #85 e #86. **O EASYLocal continua sendo somente a origem de leitura. As escritas são realizadas exclusivamente nas tabelas novas gerenciadas pelo integrador no Portal.**

Esta documentação acompanha a branch `feat/easylocal-horarios-automaticos`. A migração 0136 está preparada e reservada na Issue privada #34; sua geração e o teste local não equivalem à aplicação no Portal. Nenhum horário real é ativado ao abrir a página, salvar uma leitura, iniciar o servidor ou fazer deploy.

A publicação da base manual e o teste da conexão central/catálogo já foram conferidos. O cadastro de senha usa a chave dedicada de cifragem do servidor, sem devolver senha ao navegador. A disponibilidade dessa chave em produção precisa ser conferida após a publicação da configuração do servidor.

## Como ficará a aba Leituras

Cada configuração contém duas ações independentes:

- **Importação manual:** prévia e confirmação do recorte atual. O fluxo manual original mantém seu limite de 2.000 registros.
- **Configurar horário:** escolhe uma frequência, gera uma prévia agregada e apresenta destino, estabelecimento, leitura e impacto antes da confirmação.

Frequências desta entrega:

| Opção | Execução |
|---|---|
| A cada 15 minutos | Minutos 00, 15, 30 e 45 |
| A cada hora | Início de cada hora |
| Diariamente | Horário escolhido em Brasília |

O horário é apresentado em `America/Sao_Paulo`; o disparo usa cron UTC de seis campos. A tarefa fica na plataforma de agendamento da aplicação e funciona com a página fechada, independentemente da sessão do Sandbox. Não há scheduler recorrente em memória.

O usuário revisa as contagens, confirma o alvo e aciona **Confirmar e ativar**. Depois pode consultar o estado, última/próxima execução e contadores ou pausar o horário. Alterações de origem, chave, mapeamento, credencial ou estrutura invalidam a revisão autorizada. Uma ativação inconclusiva não é repetida automaticamente.

## Garantias da importação agendada

- Leitura PostgreSQL em transação consistente `REPEATABLE READ READ ONLY`.
- Origem escolhida no catálogo; sem SQL administrativo arbitrário nem escrita no EASYLocal.
- Tabela ou view pode ser usada; a chave configurada é verificada nos registros efetivamente lidos. Não se exige uma chave primária declarada em view.
- Paginação da origem, lote completo de até **100.000 registros** e limites operacionais de prazo e tamanho. Exceder os limites interrompe a carga sem publicar uma parte do lote.
- Insert de chaves novas e atualização por identificador técnico dos registros já existentes; comparação textual exata das chaves. Não faz `TRUNCATE`, exclusão dos ausentes ou recriação de tabela.
- Valores decimais e datas preservados, sem arredondamento/truncamento silencioso. Colunas textuais exigem suporte `utf8mb4`.
- Registro durável da revisão aprovada, identidade do agendamento, estado, slot e trava de execução. Chamadas concorrentes não ganham duas execuções para o mesmo slot.
- Resultado de commit desconhecido fica **incerto**, com conexão descartada e sem retentativa automática de gravação. Exige conferência antes de nova execução.
- Logs, prévias e respostas públicas contêm estados/contadores, nunca linhas clínicas, consultas de origem, credenciais ou erros brutos do driver.

### Permissões

O perfil `admin` do Portal é **global**, conforme a política já existente; esta entrega não cria nem amplia permissões de usuário. Cada leitura e cada tabela continua obrigatoriamente vinculada a um estabelecimento, sem misturar dados de unidades.

O responsável pelo horário precisa continuar sendo um administrador válido e a unidade precisa continuar existindo. O ciclo de vida da tarefa é gerenciado pelo usuário que a criou. A identidade técnica do agendamento não pode usar as rotas tRPC comuns, inclusive as públicas. O callback usa somente a identidade e o UID autenticados, ignorando o corpo da requisição para selecionar leitura ou estabelecimento.

## Tabela do integrador não é tabela de apresentação

Importar para `integ_el_<unidade>_<nome>` preenche um destino gerenciado, não altera automaticamente `atendimentos_unificados`, os fatos financeiros ou as conciliações existentes.

Para alimentar Atendimentos, Conta Convênio ou BI, ainda é necessário o adaptador de cada domínio, com contrato e validação de publicação próprios. Nesta etapa, os horários atualizam a tabela selecionada do integrador. Não anunciar atualização das páginas finais sem essa ligação validada.

## Migração 0136 — procedimento restrito

**Não executar `pnpm db:migrate`, `db:push` ou migração geral.** O journal já inclui a 0135 Banco/XML, que está suspensa e não foi aplicada. A existência dos arquivos em Git não significa aplicação física.

A fila foi coordenada na Issue #34: a reserva de desenvolvimento da 0135 foi suspensa e a **0136 é a única reserva ativa**. A 0135 integrada ao Git não será apagada, alterada, renumerada nem marcada como aplicada.

O arquivo `drizzle/0136_lame_dreadnoughts.sql` contém somente:

1. Criação de `integracao_easylocal_agendamentos` — controle de horários, sem dados hospitalares.
2. Índice por estabelecimento.
3. Índice por estado e prazo da trava.

A tabela contém chave primária, unicidade de leitura/unidade e unicidade do UID de tarefa. O CREATE explicita `DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`, sem herdar o padrão do banco. Essa opção física foi acrescentada ao SQL 0136 ainda não integrado; não muda as colunas do schema/snapshot e não altera migrações anteriores. Não altera as tabelas do Portal já existentes e não cria os objetos `banco_*` da 0135.

### Gates antes de produção

1. PR da revisão final, testes e liberação específica de Sergio/revisor, inclusive do SQL 0136.
2. Janela única registrada na Issue #34, executor delegado e preflight físico/histórico em conexão privada.
3. Backup aplicável do estado/histórico e homologação de restauração quando necessário. O ensaio local usa somente dados fictícios e não é uma réplica completa do TiDB.
4. Aplicar **somente os três comandos da 0136** com executor restrito, não o runner geral do Drizzle.
5. Conferir todas as colunas, tipos e índices. Só depois registrar o marcador **0136 uma única vez** em nova conexão, conforme journal aprovado.
6. Não criar marcador da 0135. Registrar expressamente que ela permanece suspensa, mesmo que o último marcador seja a 0136; o watermark do Drizzle não prova aplicação das migrações anteriores.
7. Publicar o código que inclui callback e controles; comprovar a versão pública antes de cadastrar qualquer tarefa real.
8. Escolher leitura, unidade, origem, destino, chave e horário reais; revisar impacto e ativar apenas esse alvo. Conferir primeira execução e repetição sem duplicação antes de ampliar.

Esta preparação **não aplica DDL, não cria destinos reais, não executa importações reais e não ativa tarefas**. Não inserir um marcador antecipado nem inferir autorização para aplicar a 0135.

## Homologação e evidências

O ensaio SQL de `easyLocalAgendamentoLocal.test.ts` só pode ser ativado explicitamente por `EASYLOCAL_AGENDA_HOMOLOG_LOCAL=sim` e usa socket privado local, nunca `DATABASE_URL`. Valida os três DDLs, colunas e índices, unicidades, datas com milissegundos e preservação de uma tabela legada fictícia. O banco sintético tem default latin1 para comprovar que a tabela nova permanece utf8mb4, incluindo texto com quatro bytes. O mesmo arquivo possui uma regressão estática executada sem banco. Não altera o histórico do Portal.

A interface é ensaiada com componentes reais, respostas fictícias e bloqueio de rede externa: abertura sem ativação, revisão, confirmação, pausa, expiração, erro sanitizado, ativação inconclusiva, troca de unidade e controle do criador, em desktop e mobile.

### Resultados verificados em 15/10/2026

- **161 testes aprovados** no conjunto EASYLocal, com 10 testes locais opcionais não ativados nesse comando. A regressão estática de charset está incluída.
- **7 testes aprovados** no comando separado da homologação 0136: uma regressão estática e seis testes SQL reais em MariaDB local isolado. A regressão estática é a mesma do conjunto anterior, não sete testes inéditos.
- Ensaio desktop/mobile aprovado com componentes reais e respostas sintéticas; nenhuma requisição externa ou tarefa real criada.
- `pnpm build`, `pnpm db:check` e `git diff --check` aprovados.
- `pnpm check` mantém **172 diagnósticos**, assim como a main `2c44020`: mesmos arquivos/códigos e mensagens equivalentes após normalizar caminhos, ordenação de unions, abreviação de unions e o alias `AuthenticatedUser`. Não há novos diagnósticos no escopo.
- Auditoria independente não encontrou P0. Os dois pontos finais — charset explícito na 0136 e inclusão integral dos novos arquivos no commit — foram tratados antes da abertura da PR.

**Limite de evidência:** testes de mocks, navegador sintético e MariaDB local não comprovam uma execução Heartbeat ou carga PostgreSQL → TiDB reais. A primeira execução real será validada após a liberação específica do SQL, publicação comprovada e confirmação de leitura/unidade/destino/horário. A migração 0136 continua não aplicada nesta entrega de código; a 0135 continua suspensa e não aplicada.
