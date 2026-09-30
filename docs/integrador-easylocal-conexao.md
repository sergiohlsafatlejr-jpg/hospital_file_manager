# EASYLocal — portão de conectividade PostgreSQL

**Escopo deste PR:** apenas teste administrativo de conexão (`SELECT 1`); não lê tabelas, não importa dados e não substitui o integrador legado.

## Topologia definida

Hospitais → banco PostgreSQL **EASYLocal** da empresa → backend do Portal Safatle → banco MySQL/TiDB do Portal. O EASYLocal terá uma porta acessível pela origem IP autorizada. A saída IP do backend publicado **ainda não foi comprovada**; não presumir que o IP do Sandbox corresponde ao IP da aplicação em produção.

## Código do primeiro incremento

`server/easyLocalConnection.ts` lê configurações **somente do servidor**, exige DNS e validação TLS de certificado/hostname e abre uma conexão curta. Pode usar CA privada em PEM ou, **explicitamente**, a lista de CAs públicas confiáveis do Node. Executa apenas `SELECT 1 AS conectividade`, encerra o cliente com limite de espera de limpeza e devolve exclusivamente `conectado`, `falha_conexao` ou `configuracao_pendente`, sem valor de linha, hostname, erro bruto ou credencial. Não faz fallback para conexão sem TLS.

`easyLocal.testarConexao` é uma **mutation tRPC só para administrador** com entrada estrita `{}`. É uma **sonda global**: não há mapeamento de `estabelecimentoId` para o EASYLocal nesta fase e a entrada não aceita unidade, SQL, host, senha ou nome de tabela. Não há configuração de conexão controlada pelo navegador. O teste manual não é monitoramento contínuo; a etapa de sincronização durável será desenhada separadamente depois da validação de rede e dos dados.

### Segredos requeridos no ambiente backend

- `EASYLOCAL_PG_HOST`: DNS que corresponde ao certificado TLS, não IP literal;
- `EASYLOCAL_PG_PORT`: porta TCP liberada exclusivamente para a origem autorizada;
- `EASYLOCAL_PG_DATABASE`: banco técnico autorizado pelo TI;
- `EASYLOCAL_PG_USER`: role exclusiva de leitura;
- `EASYLOCAL_PG_PASSWORD`: senha da role;
- `EASYLOCAL_PG_CA_CERT`: certificado CA privada em PEM (quebras de linha reais ou `\n`) **ou** valor literal `SYSTEM` para usar as CAs públicas confiáveis do Node. Ausência/valor inválido bloqueia a conexão. Em ambos os casos `rejectUnauthorized: true` e verificação do DNS permanecem ativos.

**Nunca** usar `VITE_*`, `DATABASE_URL`, Issues, PRs, tarefas, prints ou logs para compartilhar valores desses segredos. A role deve ter somente `CONNECT`, `USAGE` e `SELECT` nas views expressamente autorizadas para a fase posterior; `pg_hba.conf` com `hostssl` restrito ao banco/usuário/origem. Consulte a [documentação PostgreSQL de `hostssl`](https://www.postgresql.org/docs/current/auth-pg-hba-conf.html) e [verificação de identidade TLS](https://www.postgresql.org/docs/current/libpq-ssl.html).

## Critérios de aceite antes de ativar

1. Revisão por outra pessoa, testes e build da branch; nenhuma migração de banco é necessária nesta fase.
2. Administrador recebe `configuracao_pendente` enquanto não houver segredos; usuário comum não pode disparar a conexão. Nenhuma unidade é vinculada ao destino ainda.
3. O TI confirma que a **origem efetiva do runtime de produção** é o IP pré-definido na allowlist. Testar acesso na infraestrutura real; se a saída não for estável, definir caminho privado ou gateway persistente antes de abrir o banco a outra origem.
4. Com os segredos configurados por canal seguro, `SELECT 1` funciona com certificado/hostname válidos; erro de certificado, indisponibilidade ou timeout retorna somente `falha_conexao`.
5. Somente na próxima fase definir estabelecimento piloto, views autorizadas, chaves e contrato de lotes. **Não habilitar importação, agendamento nem leitura de dados nesta entrega.**

O código antigo `PostgresConnector.ts` e `WarleineConnector.ts` contém opções de TLS mais fracas: **não reutilizar sua configuração** para EASYLocal. Não substituir ou apagar conexões antigas nesta mudança.

## Primeiro ensaio de rede (somente diagnóstico)

Em 30/09/2026, **a partir do Sandbox**, DNS, porta TCP e handshake TLS com validação do nome foram confirmados sem autenticação. A primeira configuração usava nome de usuário no campo database e retornou SQLSTATE `3D000` (banco inexistente). Após corrigir o campo database e selecionar explicitamente `SYSTEM` para a CA pública confiável do Node, o teste real **`SELECT 1` passou** com os parâmetros persistidos no projeto. Nenhuma tabela foi consultada, nenhum dado foi importado e o teste temporário foi removido. **Ainda não há prova da origem IP nem de conectividade do backend publicado em produção.** Não registrar hostname, usuário ou senha em logs/Issues/PRs.
