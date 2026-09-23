# Trabalho em equipe no Safatle Sistema

**Autor:** Manus AI  
**Equipe:** Sergio, Danilo e Paulo  
**Projeto Manus:** Safalte Sistemas  
**Repositório:** `sergiohlsafatlejr-jpg/safatle-sistema`

## Decisão operacional

Sergio, Danilo e Paulo podem trabalhar ao mesmo tempo, mas não devem compartilhar a mesma branch nem executar alterações concorrentes no banco. O **Manus organiza contexto e colaboração**, o **GitHub controla as versões do código** e as **migrações Drizzle controlam a estrutura do banco**.

> O trabalho de tela, serviços, testes e documentação pode ocorrer em paralelo. Mudanças em `drizzle/schema.ts`, `drizzle/schema-integracao.ts` ou `drizzle/meta/_journal.json` entram em uma fila única: somente uma migração de banco é preparada e integrada por vez.

## Situação verificada em 23 de setembro de 2026

| Item                     | Situação                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repositório principal    | Privado, com branch padrão `main`                                                                                                                    |
| Acesso GitHub            | Sergio é administrador; `Danilochavesc` e `PaulohsBorges` têm permissão de escrita                                                                   |
| Proteção de `main`       | Não está ativa                                                                                                                                       |
| Automação de CI          | Ainda não há workflow ativo; o modelo está em `docs/exemplo-ci-github-actions.yml` para ativação por uma credencial GitHub com permissão de workflow |
| Dívida técnica existente | A verificação TypeScript falha e 36 de 197 arquivos de teste apresentam falhas na `main`; parte dos testes depende de serviços e segredos externos   |
| Banco principal          | MySQL/TiDB por `DATABASE_URL`, com Drizzle ORM                                                                                                       |
| Migrações                | Versionadas em `drizzle/`, atualmente até `0124`                                                                                                     |
| Conector Manus           | GitHub está ativo; não há conector de banco ativo nesta tarefa                                                                                       |
| Segredos                 | Nenhum arquivo `.env` está versionado no repositório                                                                                                 |

Esta mudança adiciona um modelo de integração contínua, checklist de Pull Request, responsáveis de revisão para arquivos críticos e comandos separados para gerar, conferir e aplicar migrações. Ela não altera o banco nem os dados. Enquanto a dívida técnica atual não for corrigida, o modelo trata `pnpm check` e `pnpm test` como diagnósticos não bloqueantes. O build e `pnpm db:check` serão bloqueantes quando o modelo for ativado.

## Como usar o Manus em equipe

Estar no mesmo projeto Manus não torna todas as conversas automaticamente visíveis. As tarefas são privadas por padrão. Para uma conversa que os três precisam acompanhar e editar, o proprietário abre **Compartilhar**, escolhe **Colaboração** e convida Danilo e Paulo. Somente o proprietário da tarefa pode convidar pessoas. O Manus permite até cinquenta participantes em uma tarefa de colaboração, incluindo o proprietário.[1]

Para uma tarefa que precisa apenas ser consultada pelos demais, o proprietário pode usar **Compartilhar > Acesso da equipe > Copiar link**. O acesso público não deve ser usado para código privado, dados hospitalares, credenciais ou capturas de tela com informações de pacientes.[2]

A primeira entrada de um colaborador em uma tarefa Collab limpa os cookies de login do ambiente Sandbox. Portanto, integrações autenticadas pelo navegador podem pedir novo login. Credenciais de banco nunca devem ser colocadas na conversa, mesmo quando somente a equipe participa.[1]

### Estrutura recomendada no Manus

A equipe mantém uma tarefa Collab chamada **Coordenação — Safatle Sistema**. Ela registra prioridades, responsáveis, links dos Pull Requests e o estado das migrações. Cada entrega técnica maior deve ocorrer em uma tarefa separada do mesmo projeto, vinculada ao número da Issue ou do Pull Request. Assim, o histórico operacional permanece legível e o código continua controlado pelo GitHub.

Antes de começar, cada pessoa informa na tarefa de coordenação:

```text
Responsável: Danilo
Entrega: corrigir conciliação do convênio X
Branch: fix/123-conciliacao-convenio-x
Arquivos principais: server/conciliacaoService.ts
Banco: não
PR: ainda não aberto
```

Se a entrega alterar banco, deve constar `Banco: sim` e a mensagem `MIGRAÇÃO RESERVADA`. Enquanto essa reserva estiver ativa, a outra pessoa não gera migração.

## Divisão de responsabilidades

| Pessoa                       | Responsabilidade principal                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Sergio                       | Define prioridade, aceita a entrega funcional, aprova mudanças destrutivas e controla a aplicação em produção |
| Danilo                       | Desenvolve em branch própria, escreve testes, prepara migração quando necessário e abre Pull Request          |
| Paulo                        | Desenvolve em branch própria, escreve testes, prepara migração quando necessário e abre Pull Request          |
| Danilo ou Paulo como revisor | Revisa o Pull Request do outro, inclusive o SQL e o impacto nos dados                                         |

Danilo e Paulo podem trocar os papéis de autor e revisor. Quem escreveu a mudança não faz a única revisão da própria entrega. Sergio permanece como responsável final por qualquer ação em produção.

## Fluxo diário de código

Cada entrega começa em uma Issue ou tarefa com escopo curto. O desenvolvedor atualiza `main`, cria uma branch própria e trabalha apenas nela.

```bash
git switch main
git pull origin main
git switch -c feat/123-nome-curto
```

As convenções são `feat/`, `fix/`, `hotfix/` e `docs/`. Não se faz push direto em `main`. Antes de abrir o Pull Request, o autor executa:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
git diff --check
```

O Pull Request deve ser pequeno o suficiente para ser revisado por outra pessoa. O merge acontece somente depois de o build e a conferência de migrações passarem, o autor demonstrar que não adicionou novas falhas e o revisor aprovar. Até a ativação do GitHub Actions, esses comandos são executados localmente e seus resultados são registrados no Pull Request. Como `main` não possui proteção técnica no momento, essa regra depende da disciplina da equipe. Depois que a dívida de tipagem e testes for eliminada, essas verificações devem se tornar bloqueantes no CI.

## Fluxo obrigatório para alterações de banco

O schema TypeScript é a fonte de verdade. Uma mudança começa em `drizzle/schema.ts` ou `drizzle/schema-integracao.ts` e produz uma migração SQL nova. Migrações já integradas ou aplicadas nunca são editadas.

### 1. Reservar a migração

O autor informa `MIGRAÇÃO RESERVADA` na tarefa Collab de coordenação e inclui o nome da branch. Somente essa branch pode gerar uma migração até o merge ou cancelamento.

### 2. Atualizar a branch antes de gerar

```bash
git fetch origin
git rebase origin/main
```

### 3. Alterar o schema e gerar os arquivos

```bash
pnpm db:generate
pnpm db:check
```

`db:generate` cria o SQL, o snapshot e a entrada de journal. `db:check` valida a consistência do histórico. O autor precisa ler o SQL gerado antes do commit. O Drizzle separa a geração da aplicação e executa somente migrações ainda não registradas no banco.[3] [4]

### 4. Abrir o Pull Request

O mesmo commit deve conter a alteração do schema, o novo arquivo SQL, o snapshot e o journal. O checklist deve explicar o que muda, como os dados existentes são preservados, o impacto em índices e o plano de validação.

Qualquer `DROP`, `TRUNCATE`, `DELETE` em massa, redução de tipo ou remoção de coluna exige backup e aprovação explícita de Sergio antes da execução. Aprovar o Pull Request não substitui essa autorização quando a ação for destrutiva.

### 5. Validar em homologação

A equipe usa uma credencial exclusiva de homologação, nunca a credencial de produção.

```bash
pnpm db:migrate
pnpm test
pnpm build
```

Depois da aplicação, o autor valida contagens, somatórios, isolamento por estabelecimento e a tela afetada. Para valores financeiros, a comparação deve preservar a precisão decimal.

### 6. Aplicar em produção uma única vez

Após revisão, homologação e backup aplicável, Sergio ou a pessoa formalmente designada por ele executa `pnpm db:migrate` com a credencial de produção. Durante essa janela, ninguém executa outra migração no mesmo banco.

O registro da liberação deve conter o commit, o arquivo de migração, a data e hora, o executor e o resultado da validação. A equipe libera a reserva somente depois dessa conferência.

## Se duas pessoas precisarem mudar o banco

A primeira mudança mantém a reserva. A segunda pode continuar trabalhando em código que não gere migração, mas aguarda o primeiro merge. Depois disso, o segundo desenvolvedor atualiza a branch com `origin/main`, resolve o schema e gera uma nova migração a partir do histórico atualizado.

Não se renumera SQL já integrado, não se combina snapshots manualmente e não se altera `drizzle/meta/_journal.json` à mão. Se uma migração local ainda não foi integrada e ficou incompatível, ela deve ser regenerada a partir da `main` atual.

## O que pode acontecer em paralelo

| Situação                                                    | Pode ocorrer ao mesmo tempo? | Regra                                                          |
| ----------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------- |
| Danilo altera uma tela e Paulo corrige um serviço diferente | Sim                          | Branches separadas e Pull Requests separados                   |
| Danilo e Paulo editam o mesmo arquivo                       | Com cautela                  | Dividir funções ou combinar previamente para reduzir conflitos |
| Um deles altera o schema e o outro trabalha sem banco       | Sim                          | Somente o primeiro mantém a reserva de migração                |
| Ambos geram migrações Drizzle                               | Não                          | Uma migração por vez                                           |
| Ambos aplicam em homologação no mesmo instante              | Não                          | Um executor e uma janela registrada                            |
| Qualquer colaborador aplica em produção                     | Não                          | Somente Sergio ou delegado formal                              |
| Revisão do código enquanto o autor corrige comentários      | Sim                          | O autor atualiza a mesma branch do Pull Request                |

## Segredos e acesso ao banco

A aplicação usa `DATABASE_URL` para MySQL/TiDB e também possui integrações opcionais com PostgreSQL. As credenciais devem existir somente em gerenciadores de segredos ou arquivos `.env` locais ignorados pelo Git. Não devem ser copiadas para Issues, Pull Requests, tarefas Manus, documentos, logs ou capturas de tela.

Danilo e Paulo recebem, no máximo, acesso individual e revogável à homologação. A produção deve usar conta separada, com permissões mínimas e acesso restrito ao responsável pela liberação. Para inspecionar produção, prefira acesso somente leitura e consultas previamente revisadas.

## Checklist de início imediato

1. Sergio abre uma tarefa Collab **Coordenação — Safatle Sistema** e convida Danilo e Paulo.
2. Cada entrega recebe uma Issue ou tarefa curta e uma branch exclusiva.
3. Danilo e Paulo nunca fazem push direto em `main`; um revisa o Pull Request do outro.
4. A etiqueta textual `MIGRAÇÃO RESERVADA` impede duas migrações simultâneas.
5. O autor usa `db:generate` e `db:check`; somente o responsável pela liberação usa `db:migrate` em produção.
6. Nenhuma credencial ou dado hospitalar é publicado no Manus ou GitHub.
7. O merge ocorre apenas após as verificações obrigatórias, revisão e validação funcional; novas falhas de tipos ou testes não são aceitas.

## Referências

[1]: https://help.manus.im/en/articles/12135428-how-can-i-use-manus-collab "How can I use Manus Collab?"
[2]: https://help.manus.im/en/articles/11711785-how-can-manus-team-members-see-the-tasks-i-created "How can Manus Team members see the tasks I created?"
[3]: https://orm.drizzle.team/docs/migrations "Drizzle ORM migrations"
[4]: https://orm.drizzle.team/docs/kit-overview "Drizzle Kit overview"
