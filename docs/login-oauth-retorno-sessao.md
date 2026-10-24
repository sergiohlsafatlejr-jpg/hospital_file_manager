# Login OAuth — retorno, confirmação da sessão e erro visível

## Escopo

Entrega da Issue #104, em branch `fix/oauth-retorno-sessao`, separada da PR #103. A #103 integra somente a infraestrutura e os testes de homologação; não modifica o login do Portal.

Esta mudança corrige defeitos reproduzidos em testes e melhora o diagnóstico do retorno OAuth. Não altera permissões, senhas, vínculos de estabelecimento ou estrutura do banco. Não habilita o ambiente de QA em produção.

## Evidências e limite

Em 24/10/2026, a escolha da conta habitual retornou `callback_failed`; o navegador de diagnóstico continuou com sessão não reconhecida. O banco respondeu às consultas de metadados, e os cadastros de estabelecimento e permissões permaneceram presentes. Sem os logs de produção, ainda não foi comprovada a etapa específica responsável pelo incidente. Os avisos de estatísticas de uso e `unload` não demonstram a causa da falha de login.

Defeitos determinados no código e reproduzidos com dados sintéticos:

1. O callback podia assinar um nome vazio, que o verificador da sessão rejeita. Agora usa um nome de apresentação não vazio, sem relaxar a verificação da identidade.
2. O callback podia informar sucesso sem confirmar que o usuário foi persistido. Agora confirma o ID, a identidade, a versão e a própria sessão antes de emitir o cookie.
3. O erro era enviado à página inicial e podia perder seus parâmetros ao redirecionar para a seleção. Agora a falha vai diretamente ao login, com uma mensagem por etapa e referência técnica sem dados pessoais.
4. Metadados ausentes no provedor podiam apagar o nome, e-mail e método existentes. Esses campos não são enviados para atualização quando estiverem ausentes.
5. O estado OAuth não tinha vínculo com a tentativa iniciada no navegador. Agora contém nonce e instante, é comparado integralmente com o cookie host-only, e expira após dez minutos. Alterar origem, nonce ou instante impede a troca do código.
6. Erros de várias consultas podiam iniciar logins simultâneos e sobrescrever o estado. A ação `startLogin` possui uma guarda síncrona compartilhada pelos hooks, cliques e caches de consultas e mutações, antes de criar o estado ou navegar.

## Proteções preservadas

- Cookie de sessão HttpOnly, Secure em HTTPS, SameSite=Lax e sem Domain.
- Cards somente depois do login; seleção de unidade sem sessão permanece bloqueada.
- Middleware de estabelecimento continua exigindo vínculo; nenhuma identidade é fundida por e-mail e nenhuma permissão é inferida do provedor.
- Revogação por versão, logout, login por senha e limite de tentativas permanecem funcionando.
- O estado é gerado somente na navegação efetiva, nunca durante a renderização do hook.
- Logs do callback e da persistência de usuário têm somente referência, etapa, código técnico permitido e status HTTP numérico. Não incluem objetos de erro, consultas, tokens, e-mails ou credenciais.

## Homologação

Foram aprovados 115 testes automatizados focados em OAuth, estado, feedback, concorrência, senha e logout; 18 cenários de navegador em HTTPS com banco MariaDB exclusivamente sintético e provedor local simulado também passaram. A rede externa do QA foi bloqueada. Foram conferidos login, recarga da sessão, cards da unidade permitida, bloqueio da outra unidade, logout, revogação, limite de tentativas e a permanência da mensagem de falha na tela de login.

Build e `db:check` passaram. O TypeScript conservou 172 diagnósticos preexistentes, sem acréscimos por arquivo/código. A revisão complementar de código apontou a concorrência no iniciador, que foi corrigida e revalidada; não substitui a revisão humana exigida pelo protocolo.

## Publicação e verificação real

A entrega deve entrar por PR com revisão humana ou exceção pontual registrada por Sergio. Checkpoint não comprova deploy. Não executar `db:migrate`, não habilitar `SAFATLE_AUTH_QA` em produção e não publicar credenciais ou dados dos testes.

Depois da publicação efetivamente comprovada, iniciar uma nova tentativa pela tela de login, sem reutilizar o endereço de um fluxo antigo. Conferir que a sessão é reconhecida e que aparecem somente os cards permitidos. Se continuar falhando, registrar apenas a etapa e a referência mostradas no alerta e correlacioná-las com os logs sanitizados de produção; não declarar o incidente resolvido apenas pelo resultado da homologação.

## Referência técnica

O bloqueio de `unload` pelo navegador não equivale a um erro de autenticação: https://developer.chrome.com/docs/web-platform/deprecating-unload
