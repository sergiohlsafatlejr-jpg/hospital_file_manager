# EASYLocal — portão de conectividade PostgreSQL

**Escopo:** teste administrativo de conexão PostgreSQL; não lê tabelas hospitalares, não importa dados e não substitui o integrador legado.

## Topologia definida

Hospitais → banco PostgreSQL **EASYLocal** da empresa → backend do Portal Safatle → banco MySQL/TiDB do Portal. O EASYLocal terá uma porta acessível pela origem IP autorizada. A saída IP do backend publicado **ainda não foi comprovada**; não presumir que o IP do Sandbox corresponde ao IP da aplicação em produção.

## Código do primeiro incremento

`server/easyLocalConnection.ts` lê configurações **somente do servidor**, exige DNS e validação TLS de certificado/hostname e abre uma conexão curta. Pode usar CA privada em PEM ou, **explicitamente**, a lista de CAs públicas confiáveis do Node. Credenciais administrativas são aceitas: a sonda executa apenas `BEGIN READ ONLY`, `SELECT 1 AS conectividade` e `ROLLBACK`; ela não consulta catálogo de privilégios e não emite SQL de escrita ou administração. O cliente é encerrado com limite de espera de limpeza e devolve somente um status sanitizado (`conectado`, `falha_conexao` ou `configuracao_pendente`), sem valor de linha, hostname, erro bruto ou credencial. Não faz fallback para conexão sem TLS.

`easyLocal.testarConexao` é uma **mutation tRPC só para administrador** com entrada estrita `{}`. É uma **sonda global**: não há mapeamento de `estabelecimentoId` para o EASYLocal nesta fase e a entrada não aceita unidade, SQL, host, senha ou nome de tabela. Não há configuração de conexão controlada pelo navegador. O teste manual não é monitoramento contínuo; a etapa de sincronização durável será desenhada separadamente depois da validação de rede e dados.

### Segredos requeridos no ambiente backend

- `EASYLOCAL_PG_HOST`: DNS que corresponde ao certificado TLS, não IP literal;
- `EASYLOCAL_PG_PORT`: porta TCP liberada exclusivamente para a origem autorizada;
- `EASYLOCAL_PG_DATABASE`: banco técnico autorizado pelo TI;
- `EASYLOCAL_PG_USER`: credencial PostgreSQL autorizada;
- `EASYLOCAL_PG_PASSWORD`: senha da role;
- `EASYLOCAL_PG_CA_CERT`: certificado CA privada em PEM (quebras de linha reais ou `\n`) **ou** valor literal `SYSTEM` para usar as CAs públicas confiáveis do Node. Ausência/valor inválido bloqueia a conexão. Em ambos os casos `rejectUnauthorized: true` e verificação do DNS permanecem ativos.

**Nunca** usar `VITE_*`, `DATABASE_URL`, Issues, PRs, tarefas, prints ou logs para compartilhar valores desses segredos. A operação do Portal sobre o EASYLocal permanece somente de origem: as sondas e consultas de metadados usam transações `READ ONLY` e não administram nem escrevem no PostgreSQL. `pg_hba.conf` deve usar `hostssl` restrito ao banco/usuário/origem. Consulte a [documentação PostgreSQL de `hostssl`](https://www.postgresql.org/docs/current/auth-pg-hba-conf.html) e [verificação de identidade TLS](https://www.postgresql.org/docs/current/libpq-ssl.html).

## Critérios de aceite antes de ativar

1. Revisão por outra pessoa, testes e build da branch; nenhuma migração de banco é necessária nesta fase.
2. Administrador recebe `configuracao_pendente` enquanto não houver segredos; usuário comum não pode disparar a conexão. Nenhuma unidade é vinculada ao destino ainda.
3. O TI confirma que a **origem efetiva do runtime de produção** é o IP pré-definido na allowlist. Testar acesso na infraestrutura real; se a saída não for estável, definir caminho privado ou gateway persistente antes de abrir o banco a outra origem.
4. Com os segredos configurados por canal seguro, `SELECT 1` funciona com certificado/hostname válidos; erro de certificado, indisponibilidade ou timeout retorna somente `falha_conexao`.
5. O Hospital Urológico foi escolhido como piloto; ainda falta aprovar a view de consumo, a chave de unidade e o contrato de lotes. **Não habilitar importação, agendamento nem leitura de dados nesta entrega.**

O código antigo `PostgresConnector.ts` e `WarleineConnector.ts` contém opções de TLS mais fracas: **não reutilizar sua configuração** para EASYLocal. Não substituir ou apagar conexões antigas nesta mudança.

## Primeiro ensaio de rede (somente diagnóstico)

Em 30/09/2026, **a partir do Sandbox**, DNS, porta TCP e handshake TLS com validação do nome foram confirmados sem autenticação. A primeira configuração usava nome de usuário no campo database e retornou SQLSTATE `3D000` (banco inexistente). Após corrigir o campo database e selecionar explicitamente `SYSTEM` para a CA pública confiável do Node, o teste real **`SELECT 1` passou** com os parâmetros persistidos no projeto. Nenhuma tabela foi consultada, nenhum dado foi importado e o teste temporário foi removido. **Ainda não há prova da origem IP nem de conectividade do backend publicado em produção.** Não registrar hostname, usuário ou senha em logs/Issues/PRs.

## Piloto — EASYLocal como origem somente leitura

Credenciais administrativas podem ser usadas para conectar, porque o Portal não usa suas permissões para administrar ou escrever no PostgreSQL do EASYLocal. A sonda de conectividade e a descoberta de metadados operam em transações `READ ONLY`; nenhuma delas consulta catálogo de privilégios como bloqueador. Descoberta de tabelas, importação e execução automática continuam condicionadas à aprovação separada de origem, isolamento e dados.

O escopo do piloto é exclusivamente **Hospital Urológico**. O domínio inicial e a view final devem ser confirmados antes de qualquer leitura de dados. Não foram criadas migrações, rotinas, cópias de itens nem execução automática nesta entrega.

## Interface de preparação no Integrador

A página **EASYLocal · conexão** da rota `/integracao` é administrativa e independente da rota anterior `/integracao-legado`. `easyLocal.obterPreparacao` retorna apenas se os segredos estão estruturalmente presentes, o identificador fixo do piloto e `ingestaoAtiva: false`; **não abre conexão** nem devolve host, usuário ou segredo. A mutation `easyLocal.testarConexao` é chamada **somente ao clicar**, enquanto o Hospital Urológico está selecionado, e continua validando permissões no backend sem aceitar estabelecimento enviado pelo navegador. O resultado vale apenas para o teste atual, não é um monitor permanente nem é prova de dados prontos. Selecionar a unidade é conveniência visual, **não é autorização de leitura por unidade**.

O painel informa que credenciais administrativas são aceitas e que o EASYLocal é somente origem de leitura; o Portal não administra nem escreve no PostgreSQL. As seções legadas permanecem identificadas e separadas em `/integracao-legado`; não se deve cadastrar EASYLocal nelas. Foi removida uma contagem estática não verificada da página legada. Nenhuma das duas páginas monta os hooks legados antes de confirmar papel administrativo; o backend continua sendo a autoridade de cada operação. **A API legada tem regras de autorização próprias, não foi migrada para o novo contrato EASYLocal nem endurecida por esta PR; sua revisão é uma tarefa separada antes de reutilizá-la para qualquer dado da empresa.**

**Próximo portão:** testar a credencial pelo gerenciador de segredos; Sergio e TI aprovam view e isolamento antes de qualquer descoberta ou SELECT de dados. Nenhum registro hospitalar é lido nesta fase.
