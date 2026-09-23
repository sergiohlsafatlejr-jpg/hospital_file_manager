# Processo de migrações de banco para a equipe Safalte

**Autor:** Manus AI  
**Sistema:** `safatle-sistema`
**Banco:** MySQL/TiDB  
**Ferramenta de migração:** Drizzle Kit

## Decisão principal

A equipe deve adotar um fluxo **codebase-first com migrações SQL versionadas**. Isso significa que a estrutura do banco é definida no repositório, cada alteração produz um arquivo SQL novo em `drizzle/` e a aplicação em produção ocorre somente depois de revisão e validação.

> **Uma migração é uma alteração versionada e sequencial da estrutura ou dos dados do banco.** Ela não deve ser tratada como um comando pessoal de um desenvolvedor; é um registro permanente que todos os ambientes precisam aplicar na mesma ordem.

O projeto já está preparado para esse modelo. O arquivo `drizzle.config.ts` lê os dois schemas — `drizzle/schema.ts` e `drizzle/schema-integracao.ts` — e gera os arquivos SQL na pasta `drizzle/`. O journal `drizzle/meta/_journal.json` mantém a sequência das migrações. As migrações `0119` a `0124`, por exemplo, já registram a implantação Warleine e não devem ser alteradas.

## O que cada pessoa pode fazer

| Papel              | Permissões recomendadas                                                             | Responsabilidade                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Sergio             | Administrador do repositório e responsável pela liberação                           | Priorizar entregas, aprovar operações destrutivas e controlar a aplicação em produção                                           |
| Danilo             | Acesso de escrita ao repositório e à homologação; sem credencial direta de produção | Criar branch, desenvolver, preparar migração, escrever testes e abrir Pull Request                                              |
| Paulo              | Acesso de escrita ao repositório e à homologação; sem credencial direta de produção | Criar branch, desenvolver, preparar migração, escrever testes e revisar o trabalho de Danilo                                    |
| Revisor da entrega | Acesso ao repositório e ao ambiente de homologação                                  | Revisar SQL, impacto nos dados, índices, isolamento por estabelecimento e plano de reversão; Danilo e Paulo alternam este papel |
| Usuário do portal  | Acesso funcional aos módulos autorizados por estabelecimento                        | Validar a tela e os resultados; não executa comandos de banco                                                                   |

Danilo e Paulo podem desenvolver e preparar migrações, mas **não precisam nem devem receber a senha do banco de produção**. A mudança chega ao banco por arquivo SQL versionado e por uma liberação controlada.

## Estrutura que deve permanecer no repositório

```text
drizzle/
  schema.ts                     # tabelas principais do portal
  schema-integracao.ts          # tabelas de integrações, Tasy e Warleine
  0125_nome_descritivo.sql      # próxima migração, por exemplo
  meta/
    _journal.json               # ordem das migrações; gerado pelo Drizzle
    0125_snapshot.json          # fotografia do schema; gerada pelo Drizzle

drizzle.config.ts               # dialeto MySQL e caminhos dos dois schemas
scripts/
  validar-*.ts                  # validadores reais, quando necessários
```

Os dois schemas são fonte de verdade. Uma tabela de integração não deve ser declarada em `schema.ts` e em `schema-integracao.ts` ao mesmo tempo. O Drizzle é configurado para ler ambos, portanto uma mudança em qualquer um deles pode gerar migração.

Os arquivos SQL, snapshots e journal devem entrar no mesmo commit. Não é permitido enviar somente uma alteração em TypeScript sem a migração correspondente quando essa alteração altera tabela, coluna, índice, chave, enum ou view.

## Configuração recomendada dos comandos

O projeto mantém o atalho legado `pnpm db:push`, que executa `drizzle-kit generate && drizzle-kit migrate`. Para uma equipe, ele é prático, porém perigoso: quem o executa pode gerar e aplicar uma migração na mesma ação.

O procedimento recomendado é separar os comandos abaixo no `package.json`:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:check": "drizzle-kit check",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

A equipe deve tratar `db:generate` como comando de desenvolvimento e `db:migrate` como comando de liberação. O script atual `db:push` deve deixar de ser usado por colaboradores, mesmo que permaneça temporariamente por compatibilidade operacional.

O Drizzle Kit gera os arquivos SQL a partir da diferença entre o schema TypeScript atual e o histórico de migrações. Em seguida, `drizzle-kit migrate` consulta o histórico já aplicado no banco e executa apenas as migrações pendentes, na ordem registrada.[1] [2]

## Ambientes e credenciais

O ideal é manter dois bancos separados:

| Ambiente    | Finalidade                                          | Quem aplica migração              | Credencial                                                |
| ----------- | --------------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| Homologação | Testes de schema, importações e validação funcional | Desenvolvedor ou revisor          | Segredo de homologação, limitado ao ambiente              |
| Produção    | Portal Safatle e dados reais                        | Apenas responsável pela liberação | Segredo de produção, nunca exposto ao código ou ao GitHub |

A configuração atual usa `DATABASE_URL`. Para separar os ambientes, devem existir secrets distintos, como `DATABASE_URL_STAGING` e `DATABASE_URL_PRODUCTION`, configurados apenas no ambiente de execução. Os valores não entram no GitHub, em mensagens, arquivos `.env` versionados ou capturas de tela.

Uma implantação inicial segura pode continuar usando o banco atual como produção, desde que Danilo não receba a credencial e a execução de `db:migrate` continue concentrada no responsável pela liberação. A homologação deve ser criada antes de alterações estruturais maiores, especialmente as que envolvem tabelas com alto volume.

## Fluxo obrigatório para cada alteração de banco

### 1. Criar uma branch exclusiva

O desenvolvedor começa atualizando a branch principal e criando uma branch de trabalho. A alteração não deve ser feita diretamente em `main`.

```bash
git checkout main
git pull origin main
git checkout -b feat/nome-da-alteracao
```

Exemplos de nomes: `feat/indice-conta-convenio`, `feat/campo-data-recebimento` e `fix/chave-unica-lote-tasy`.

### 2. Alterar o schema TypeScript

A alteração é feita em `drizzle/schema.ts` ou `drizzle/schema-integracao.ts`. Colunas financeiras devem usar `decimal`, datas civis devem ser modeladas sem conversão de fuso e toda tabela de negócio deve possuir `estabelecimentoId` quando o dado depende de unidade.

Em dados importados, a tabela deve ter chave idempotente e índices compatíveis com as consultas reais. Em especial, não se deve confiar em filtros apenas na interface: os routers e serviços devem recortar as consultas pelo estabelecimento autorizado.

### 3. Gerar uma nova migração

Depois de revisar o schema, o desenvolvedor executa:

```bash
pnpm db:generate
pnpm db:check
```

O resultado deve criar uma nova migração, por exemplo `drizzle/0125_nome_gerado.sql`, um snapshot correspondente e uma entrada no journal. A equipe deve abrir o SQL gerado e ler cada comando antes de aplicar.

### 4. Revisar o SQL antes da aplicação

A Pull Request deve responder claramente às perguntas abaixo.

| Pergunta                                            | Exemplo de resposta esperada                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A migração cria, altera ou remove o quê?            | “Adiciona índice composto para consulta de itens por estabelecimento e competência.” |
| O dado existente será preservado?                   | “Sim; coluna nova aceita nulo na primeira etapa.”                                    |
| Há `DROP`, `DELETE`, `TRUNCATE` ou redução de tipo? | “Não.” Se houver, exige autorização explícita do responsável.                        |
| O banco suporta a alteração com o volume atual?     | “Índice criado após medir a tabela; execução testada em homologação.”                |
| Há isolamento por estabelecimento?                  | “A tabela e os índices incluem `estabelecimentoId`.”                                 |
| Existe validação depois da aplicação?               | “O script valida totais, quantidade e ausência de cruzamento de unidades.”           |

Nunca se deve editar uma migração já aplicada, inclusive `0119` a `0124`. A correção deve ser uma migração nova. Alterar histórico aplicado faz o repositório divergir do banco e impede auditoria confiável.

### 5. Testar em homologação

Antes da produção, a branch deve passar por testes automatizados, build e validação no banco de homologação.

```bash
pnpm test
pnpm build
pnpm db:migrate
```

Quando houver alteração de dados, o teste também deve comparar contagens e somatórios. Para valores financeiros, as comparações devem usar `DECIMAL` ou `Decimal`; não se deve validar valores monetários com estimativas em ponto flutuante.

### 6. Aprovar e aplicar em produção

A execução em produção é feita por uma única pessoa responsável, depois que a Pull Request foi revisada e o checkpoint foi salvo. O comando recomendado é:

```bash
pnpm db:migrate
```

O responsável precisa registrar o commit liberado, a migração aplicada, data e hora, usuário executor e o resultado da validação. Durante a aplicação, ninguém deve gerar outra migração nem executar outro `db:migrate` contra o mesmo banco.

Para esta aplicação Manus, as mudanças de schema também podem ser aplicadas de forma controlada pela ferramenta SQL do WebDev depois de a migração ter sido gerada e revisada. A regra é a mesma: executar o SQL versionado, nunca comandos manuais diferentes do arquivo que será commitado.

### 7. Validar e fechar a entrega

Depois da migração, a equipe executa o validador funcional correspondente e revisa a tela afetada. Só então salva checkpoint, sincroniza o GitHub e marca a tarefa concluída.

## Mudanças destrutivas e grandes tabelas

Toda operação com `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE` em massa, mudança de tipo com perda de dados ou substituição completa de snapshot precisa de aprovação explícita do responsável. Essa aprovação deve indicar a tabela, o que será removido, se existe backup e o motivo.

A única autorização destrutiva anterior foi para duas stagings Tasy específicas. Ela **não autoriza** apagar nenhuma outra tabela. Em particular, `staging_faturamento_warleine` permanece no banco até receber autorização explícita separada, mesmo estando vazia e fora do fluxo operacional.

Para tabelas grandes, a mudança deve ser executada em etapas compatíveis:

1. Adicionar a coluna nova de forma compatível, normalmente aceitando nulo.
2. Publicar código que reconhece o formato antigo e o novo.
3. Preencher os dados gradualmente por script idempotente e auditável.
4. Validar contagem, valor e isolamento.
5. Tornar a coluna obrigatória ou remover o legado somente em uma migração posterior aprovada.

A implantação Warleine segue esse padrão. Os itens são materializados por lote e a visão ativa muda por ponteiro de snapshot; assim, as telas não observam uma publicação parcial e não dependem de atualização massiva das linhas antigas.

## Resolução de conflitos entre desenvolvedores

Quando dois desenvolvedores alterarem o schema, somente uma migração deve ser gerada por vez a partir da `main` atual. O segundo desenvolvedor precisa atualizar sua branch depois que a primeira Pull Request entrar na `main`, resolver o conflito de schema e gerar sua própria migração novamente.

Não se deve tentar combinar manualmente dois snapshots do Drizzle ou renumerar uma migração já aplicada. Se forem criadas duas migrações paralelas, a segunda deve ser regenerada após o rebase para que o journal reflita uma única sequência.

Antes de abrir Pull Request, execute:

```bash
git fetch origin
git rebase origin/main
pnpm db:check
pnpm test
pnpm build
git diff --check
```

## Checklist de liberação

| Item                                                      | Obrigatório |
| --------------------------------------------------------- | ----------- |
| Branch atualizada com `main`                              | Sim         |
| Schema TypeScript alterado no arquivo correto             | Sim         |
| Nova migração, snapshot e journal incluídos no commit     | Sim         |
| SQL revisado por outra pessoa                             | Sim         |
| Testes, build e `db:check` aprovados                      | Sim         |
| Homologação validada para mudanças relevantes             | Sim         |
| Aprovação explícita para qualquer ação destrutiva         | Sim         |
| `db:migrate` executado uma única vez por responsável      | Sim         |
| Validador funcional e conferência de isolamento aprovados | Sim         |
| Checkpoint Manus e push GitHub confirmados                | Sim         |

## Regra operacional para Danilo e Paulo

Danilo e Paulo podem preparar migrations, testes e Pull Requests. Eles não devem executar `pnpm db:migrate` no banco de produção, nem receber a `DATABASE_URL` de produção. Sergio, ou outro responsável formalmente designado por ele, executa a aplicação depois da revisão.

Danilo (`Danilochavesc`) e Paulo (`PaulohsBorges`) já possuem acesso de escrita ao repositório. Como a branch `main` não está protegida, a proibição de push direto depende do processo da equipe e da revisão por Pull Request. O fluxo de CI, o arquivo `CODEOWNERS` e o checklist de Pull Request reduzem o risco, mas não substituem uma regra de proteção de branch quando ela estiver disponível.

## References

[1]: https://orm.drizzle.team/docs/migrations "Drizzle migrations fundamentals"
[2]: https://orm.drizzle.team/docs/kit-overview "Migrations with Drizzle Kit"
