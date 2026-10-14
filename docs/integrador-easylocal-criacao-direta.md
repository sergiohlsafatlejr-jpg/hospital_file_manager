# Integrador EASYLocal — criação direta e configurações de leitura

## Escopo e decisão de Sergio

Em 14/10/2026, Sergio escolheu criar tabelas diretamente no Integrador de Dados. Esta entrega implementa uma exceção **restrita a novas tabelas dinâmicas**, sem substituir o protocolo Drizzle das tabelas de negócio.

A implementação fica em branch própria e PR. A preferência de criação direta não autoriza merge, deploy, execução de uma tabela ainda não definida ou aplicação da migração 0135 nesta tarefa.

## As três abas

### Conexões

Reutiliza o painel EASYLocal existente em modo central. A configuração permanece nos segredos do servidor; não existe cadastro de senha em Base64 nem cópia de credenciais para o catálogo.

O teste manual é opcional. As operações de metadados abrem sua própria conexão PostgreSQL, verificam TLS, usam `BEGIN READ ONLY` e `ROLLBACK`, consultam somente o catálogo e encerram a conexão. Uma falha não apaga a configuração, mas também não garante disponibilidade permanente da rede.

**Preflight real de 14/10:** os quatro cadastros de catálogo do Portal estão presentes. Credenciais administrativas são aceitas porque o EASYLocal é somente origem: o Portal não administra nem escreve no PostgreSQL. Antes de detectar origens ou salvar leituras, seguem necessárias as aprovações de origem, isolamento e dados. Não enviar credenciais em conversa, Issue ou PR.

### Tabelas

Permite criar manualmente uma tabela nova ou detectar colunas do catálogo PostgreSQL para revisão. Não lê amostras de registros.

- Estabelecimento obrigatório e validação administrativa no servidor.
- Nome físico determinado pelo servidor: `integ_el_<estabelecimentoId>_<nome>`.
- Até 64 colunas de negócio, com nomes estritos e tipos permitidos.
- Precisão e escala decimal explícitas, inclusive escala zero.
- Tipos incompatíveis, como timestamp com fuso, exigem revisão manual; não há conversão automática para um significado desconhecido.
- A confirmação mostra nome físico, colunas de negócio, nulabilidade e colunas técnicas antes de enviar o pedido.
- A criação é vazia; não importa linhas, não lê a staging Hop e não publica dados nas páginas.
- Tabelas físicas ou nomes já registrados/reservados são recusados, sem adoção ou alteração do objeto existente.

Acrescenta `_id BIGINT` como chave primária automática, `estabelecimento_id INT` obrigatório com padrão da unidade e `_sincronizado_em DATETIME` nulo, além de índice por estabelecimento.

### Leituras

Salva um contrato de preparação contendo tabela gerenciada, schema/tabela de origem, coluna e identificador do estabelecimento, chave, domínio e frequência desejada. Nesta versão o mapeamento é por nomes iguais; as colunas do destino e a chave precisam existir na origem.

**Limite importante:** salvar esse contrato ainda não executa importação, publicação, conciliação ou atualização das páginas. A associação à página precisa de adaptador e validação próprios de cada domínio. A frequência salva é apenas intenção: no catálogo legado, a configuração fica `manual` e `ativo = nao`, sem criar agendamento.

O alias interno de conexão guarda somente referência ao servidor, sem credencial real. O conteúdo estruturado da origem não é SQL executável. A API legada não pode listar, alterar ou executar esses registros.

## Como a criação física é controlada

1. Valida o payload estrito; não aceita SQL livre, nomes físicos escolhidos pelo cliente ou tabelas de negócio.
2. Confirma a existência do estabelecimento.
3. Serializa a reserva pela linha do estabelecimento. No TiDB usa `BEGIN PESSIMISTIC`; não muda configuração global ou de sessão persistente do pool.
4. Confirma que o nome não existe no catálogo nem fisicamente.
5. Grava e confirma a reserva e suas colunas no catálogo.
6. Executa um único `CREATE TABLE`, sem `IF NOT EXISTS`, `DROP`, `TRUNCATE` ou `ALTER`.
7. Confere nomes, ordem, tipos, nulabilidade, precisão/escala e colunas técnicas.
8. Marca o objeto como criado somente depois da conferência.

DDL não é uma operação integralmente reversível pela transação do catálogo. Se o comando ou sua confirmação falhar, a reserva pode permanecer pendente, e uma tabela vazia pode já existir. O sistema não faz retry automático nem apaga objetos para limpar a falha. Sergio/delegado deve conferir o catálogo e a estrutura antes de repetir qualquer ação.

Os registros guardam a identidade do administrador no descritor e timestamps do catálogo. Não são inseridos marcadores fictícios em `__drizzle_migrations` para tabelas dinâmicas.

## Proteção do legado e das entregas existentes

O namespace lógico e físico EASYLocal e o alias interno ficam bloqueados nos caminhos legados de conexão, tabela, coluna, mapeamento, sincronização, DDL e acesso a dados. A proteção considera variantes de caixa e nomes sanitizados pelo legado.

Esta entrega não altera as stagings HUP/IAD, não reativa sincronização antiga do Urológico, não aplica a 0135, não muda fontes oficiais de relatórios e não grava vínculos ou XMLs de recurso.

## Validação

- Testes sintéticos de contratos, autorização, metadados, UI e isolamento legado.
- Cobertura explícita de commit incerto: não retornar sucesso, não repetir DDL/INSERT, tentar rollback best-effort e exigir conferência.
- Ensaio real de criação em MariaDB isolado no Sandbox, por socket privado e sem rede: criação vazia/tipos, conflito, isolamento de unidade, leitura pausada e concorrência do mesmo nome. Não é uma réplica do TiDB de produção.
- Teste de UI com respostas fictícias e rede externa bloqueada.
- **Gates finais:** 72 testes sintéticos e 4 testes de homologação SQL aprovados; build, `db:check` e `git diff --check` aprovados. TypeScript mantém os mesmos 172 diagnósticos da main `640eef4`, inclusive cabeçalhos de mensagens idênticos após normalização dos caminhos locais; nenhum diagnóstico novo nos arquivos desta entrega.
- Auditoria independente não identificou P0. Os gates solicitados de homologação do protocolo final e regressões explícitas de commit incerto foram atendidos. A homologação MariaDB não substitui uma réplica TiDB.

## Teste depois da liberação do código

1. Abrir `/integracao` como administrador e selecionar uma unidade.
2. Em Tabelas, revisar um objeto novo de teste e seu nome físico; confirmar a criação exata.
3. Conferir a listagem e o estado de criação.
4. Com role EASYLocal adequada, detectar os metadados da origem aprovada.
5. Salvar uma configuração de leitura e conferir o estado preparado, sem execução.
6. Não esperar que tabelas criadas apareçam automaticamente em Atendimentos ou relatórios; implementar e validar o adaptador antes dessa ativação.

Não realizar esses testes em produção sem a liberação da PR e do objeto específico. A execução desta tarefa se limita a código, testes locais e preflight de leitura.
