# EASYLocal: credencial administrativa aceita, origem somente leitura

## Decisão

Em 14/10/2026, Sergio pediu para remover o bloqueio de role privilegiada. Às 15:01, esclareceu o fluxo desejado: **ler o EASYLocal, importar para tabelas do Portal, criar destinos no Portal e configurar horários de busca**. Isso substitui a proposta anterior de administrar/gravar dados no PostgreSQL pela tela.

Esta entrega remove apenas o bloqueio da credencial administrativa no teste e na consulta de metadados. Não executa GRANT, não cria ou modifica roles, não amplia privilégios no PostgreSQL e não altera a credencial armazenada.

## O que permanece

- Conexão PostgreSQL TLS, verificando cadeia e nome do certificado.
- Credenciais somente no backend, cifradas no cadastro central quando utilizada a PR #83.
- Teste restrito a conectividade; catálogo restrito a nomes e metadados.
- Operações EASYLocal em transação somente leitura, com encerramento e timeouts.
- Administração do cadastro apenas por administradores do Portal.
- Criação de tabelas dinâmicas novas no **Portal**, pelo assistente já existente; nenhuma criação de tabela no EASYLocal nesta entrega.

Aceitar uma conta administrativa aumenta o alcance potencial da credencial caso ela ou o servidor sejam comprometidos. Uma credencial dedicada continua recomendável, mas deixa de ser um requisito bloqueante para os testes e metadados. Uma transação de leitura protege estas operações específicas, não reduz os privilégios da conta nem substitui o isolamento por estabelecimento na aplicação.

## Separação de entregas

Esta PR é o primeiro desbloqueio técnico; **não implementa nem ativa importação ou agendamento**. A importação EASYLocal → Portal e o agendamento durável são outra entrega, acompanhada pela Issue #84. Não usar timers internos no backend publicado.

Criar uma tabela dinâmica ou preenchê-la não implica publicar automaticamente em tabelas de apresentação de atendimentos/faturamento. A publicação final depende do contrato e adaptador do domínio, com autorização do recorte e lote.

## Liberação

Branch própria e revisão via PR. Não há schema ou migração nesta entrega. Merge/publicação pendentes de revisão humana ou exceção específica de Sergio. Nenhuma operação real no EASYLocal ou Portal será executada como parte dos testes sintéticos.

## Validação

Resultados finais de testes, build, db:check, conferência do diff e tipagem serão registrados na PR após executar os gates da revisão exata.

### Resultados em 14/10/2026

- 85 testes sintéticos aprovados; 4 testes opcionais SQL local não executados nesta rodada.
- Build, `db:check` e `git diff --check` aprovados.
- TypeScript: 172 diagnósticos históricos, mesmos arquivos/códigos da main; nenhum nos arquivos desta mudança. Duas mensagens variam apenas na ordem textual dos tipos/propriedades de arquivos legados não alterados; não são regressões da conexão.
- Teste adicional da configuração central real: conexão validada e catálogo consultado, com **4 origens elegíveis**. Foram lidos somente `SELECT 1` e metadados; **0 registros hospitalares lidos e nenhuma escrita/importação**.

A validação real comprova conectividade pelo ambiente de desenvolvimento; não constitui prova de que a nova PR foi publicada nem de uma importação/automação funcionando em produção.
