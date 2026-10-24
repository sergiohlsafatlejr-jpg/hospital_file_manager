# Homologação isolada de autenticação

Entrega vinculada à Issue #102. Base: `github/main` em `b2ae7a3`. Não altera handlers funcionais, permissões de produção, migrações ou publicações.

## Objetivo e resultado

Investigar, por simulação controlada, o fluxo em que o login OAuth volta à página pública e os estabelecimentos não aparecem. Foram aprovados **52 testes em sete arquivos de autenticação** e **17 cenários de navegador**, sem exceções de JavaScript nas páginas exercitadas.

A sessão correta libera somente a unidade vinculada. A falha injetada no provedor local produz `callback_failed` e impede a sessão. Troca de código, leitura da identidade, persistência e emissão da sessão podem convergir para esse mesmo erro; o ensaio não determina qual delas falhou em produção.

## Componentes reais e substituições

O ensaio usa `LoginSenha`, `SelecionarEstabelecimento`, `useAuth`, `EstabelecimentoContext`, tRPC, os serviços de senha, SDK, callback OAuth e middleware global de autorização reais. A navegação é um contêiner mínimo de QA; as demais páginas hospitalares não foram abertas ou simuladas.

Somente o provedor OAuth e a lista de notícias são substituídos. O banco é um MariaDB separado, com quatro usuários e dois hospitais fictícios e seis tabelas de suporte derivadas do schema. Ele não replica a produção/TiDB. Não se copiam cadastros, pacientes, arquivos XML ou dados financeiros reais.

O backend limpa o ambiente herdado antes de importar o aplicativo, define apenas configuração sintética e rejeita conexões fora dos endereços/portas locais previstos. O navegador intercepta pedidos externos, bloqueia-os e serve o logotipo público de um arquivo local. Os cookies mantêm `HttpOnly`, `Secure` em HTTPS e `SameSite=Lax`.

## Arquivos desta entrega

- `server/oauthHomologacao.test.ts`: nove novos casos locais com mocks do provedor/SDK/banco, exercitando o callback por HTTP e o contexto real.
- `scripts/qa/auth-homologacao.ts`: servidor local opt-in e criação de dados exclusivamente sintéticos.
- `scripts/qa/auth-ui/`: páginas reais montadas em contêiner de QA, configuração HTTPS/proxy e roteiro Puppeteer.

**Nunca importar ou montar o servidor QA no bootstrap do Portal.** As rotas `/qa` existem apenas no servidor de teste. A variável `SAFATLE_AUTH_QA=1` exige intenção explícita para iniciar o script.

## Repetição no Sandbox

Os caminhos abaixo correspondem ao ambiente de execução desta entrega. As portas locais 3408, 3041 e 3042 devem estar livres. O script pressupõe um MariaDB novo e exclusivo de QA, ouvindo somente em loopback; não utilize um banco já existente do Portal. Não execute `db:migrate`, `db:push` ou SQL de produção para preparar esse ensaio.

1. Inicializar um diretório MariaDB vazio e independente com `mariadb-install-db`; iniciar `mariadbd` nele, na porta 3408, restrito a `127.0.0.1`.
2. Manter o worktree em `/home/ubuntu/auth-homologacao-isolada`, com as dependências instaladas ou vinculadas.
3. Criar `/home/ubuntu/private/auth-homologacao-runtime` com permissão 700. Gerar nele `qa.key` e `qa.crt` autoassinados, exclusivamente para HTTPS local, com SAN para localhost/loopback; a chave deve ter permissão 600. Não reutilizar certificados/chaves do Portal.
4. Executar `SAFATLE_AUTH_QA=1 pnpm exec tsx scripts/qa/auth-homologacao.ts`. O script gera senha/JWT fictícios no diretório privado; não imprime seus valores.
5. Copiar os arquivos de `scripts/qa/auth-ui/` para `/home/ubuntu/auth-homologacao-qa`, vincular as dependências nesse diretório e executar o Vite com `vite.config.ts`. O navegador local usa HTTPS na porta 3041 e faz proxy somente para o backend QA na porta 3042.
6. Executar `node test-browser.mjs` no diretório da interface. O roteiro faz os cliques, usa a senha fictícia local e salva capturas e resultados em `/home/ubuntu/reports/auth-homologacao-2026-10-23`.
7. Encerrar somente esses três serviços de QA ao concluir. Não encerrar o servidor WebDev ou a produção.

Para testes unitários, usar processo com ambiente limpo e valores sintéticos de `JWT_SECRET`, `VITE_APP_ID` e URLs locais antes de executar `vitest` nos arquivos `passwordAuth*`, `auth.logout.test.ts` e `oauthHomologacao.test.ts`. Os mocks não autorizam chamar serviços reais.

## Limites e manutenção

Os primeiros ensaios exigiram correções no próprio contêiner de QA: o proxy estava encaminhando uma rota visual ao backend; a navegação precisava aguardar a restauração do contexto; e o teste de limitação de tentativas precisava esperar cada resposta real, em vez de reaproveitar mensagens anteriores. Não foram corrigidos ou modificados handlers de produção para fazer os testes passarem.

Material de sessão, chaves, logs operacionais e banco permanecem privados, fora do Git. Somente fixtures sintéticas, testes e documentação entram na branch. Não anexar dados ou capturas reais de usuários/pacientes à PR.

O próximo diagnóstico de produção depende do erro sanitizado do callback, com a etapa e a classe/status da falha. O ensaio não justifica trocar contas, conceder acesso global, remover autorização, reiniciar produção ou publicar uma versão por tentativa.

## Validação final da branch

- 52/52 testes focados, em sete arquivos, aprovados; nove casos novos de callback/contexto.
- 17/17 cenários de navegador aprovados, com captura final após carregar os estilos reais; nenhuma exceção de JavaScript.
- Build da aplicação aprovado.
- `db:check` aprovado, sem aplicar migração e sem conexão com produção.
- TypeScript mantém 172 diagnósticos legados; comparação por arquivo/código com a base não encontrou novo diagnóstico.
- `git diff --check` aprovado; schema, journal, handlers funcionais e permissões de produção não foram modificados.
- Serviços locais de QA encerrados após concluir os testes. Nenhum serviço de produção ou do WebDev foi reiniciado.
