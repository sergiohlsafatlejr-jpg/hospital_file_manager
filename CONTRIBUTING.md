# Guia de Contribuição - Portal Safatle

Este documento descreve como configurar o ambiente de desenvolvimento local para contribuir com o projeto **Portal Safatle** (Gerenciamento Hospitalar). Leia atentamente antes de iniciar.

---

## Visão Geral do Projeto

O Portal Safatle é uma plataforma de automação de processos hospitalares focada em faturamento, conciliação de contas, análise de glosas e geração de XML de recurso TISS. O sistema é composto por um frontend React e um backend Express com tRPC, utilizando banco de dados MySQL/TiDB.

| Componente             | Tecnologia                | Versão |
| ---------------------- | ------------------------- | ------ |
| Runtime                | Node.js                   | 22.x   |
| Gerenciador de pacotes | pnpm                      | 10.4.x |
| Frontend               | React 19 + Tailwind CSS 4 | -      |
| Backend                | Express 4 + tRPC 11       | -      |
| ORM                    | Drizzle ORM               | 0.44.x |
| Banco de dados         | MySQL / TiDB              | 8.x    |
| Linguagem              | TypeScript                | 5.9.x  |
| Testes                 | Vitest                    | 2.1.x  |
| Build                  | Vite 7 + esbuild          | -      |

---

## Pré-requisitos

Antes de começar, certifique-se de ter instalado em sua máquina:

1. **Node.js 22.x** (LTS) — recomendamos usar o [nvm](https://github.com/nvm-sh/nvm) para gerenciar versões.
2. **pnpm 10.x** — instale com `npm install -g pnpm@10` ou via [corepack](https://nodejs.org/api/corepack.html).
3. **Git** — para clonar o repositório e gerenciar branches.
4. **IDE** — recomendamos VS Code ou Antigravity com as extensões: ESLint, Prettier, Tailwind CSS IntelliSense e TypeScript.

---

## Clonando o Repositório

```bash
git clone https://github.com/sergiohlsafatlejr-jpg/safatle-sistema.git
cd safatle-sistema
```

---

## Instalando Dependências

```bash
pnpm install
```

Esse comando instala todas as dependências do frontend e backend. O projeto usa um monorepo com `client/` (frontend) e `server/` (backend) na mesma raiz.

---

## Configuração de Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis. Solicite os valores ao administrador do projeto (Sergio Safatle).

```env
# Banco de dados principal (TiDB/MySQL)
DATABASE_URL=mysql://usuario:senha@host:porta/banco?ssl={"rejectUnauthorized":true}

# Autenticação OAuth (Manus)
JWT_SECRET=sua_chave_secreta
VITE_APP_ID=id_do_app
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://portal.manus.im

# Proprietário do sistema
OWNER_OPEN_ID=open_id_do_owner
OWNER_NAME=Nome do Owner

# APIs internas Manus (LLM, Storage, etc.)
BUILT_IN_FORGE_API_URL=url_da_api
BUILT_IN_FORGE_API_KEY=chave_da_api
VITE_FRONTEND_FORGE_API_KEY=chave_frontend
VITE_FRONTEND_FORGE_API_URL=url_frontend

# Banco PostgreSQL - Atendimentos (opcional)
PG_ATENDIMENTOS_HOST=host
PG_ATENDIMENTOS_PORT=5432
PG_ATENDIMENTOS_DATABASE=banco
PG_ATENDIMENTOS_USER=usuario
PG_ATENDIMENTOS_PASSWORD=senha

# Banco PostgreSQL - Warleine (opcional)
WARLEINE_DB_HOST=host
WARLEINE_DB_PORT=5432
WARLEINE_DB_NAME=banco
WARLEINE_DB_USER=usuario
WARLEINE_DB_PASSWORD=senha

# SMTP para envio de e-mails (opcional)
SMTP_HOST=smtp.exemplo.com
SMTP_PORT=587
SMTP_USER=usuario
SMTP_PASS=senha
SMTP_FROM=noreply@exemplo.com

# Redis (opcional)
REDIS_URL=redis://host:porta
```

> **Importante:** O arquivo `.env` nunca deve ser commitado no repositório. Ele já está listado no `.gitignore`.

---

## Executando o Projeto

### Modo desenvolvimento

```bash
pnpm dev
```

O servidor de desenvolvimento inicia na porta **3000** com hot-reload habilitado para frontend e backend. Acesse em `http://localhost:3000`.

### Build de produção

```bash
pnpm build
```

Gera o bundle de produção em `dist/`. Para testar localmente:

```bash
pnpm start
```

### Verificação de tipos TypeScript

```bash
pnpm check
```

Executa `tsc --noEmit` para verificar erros de tipo sem gerar arquivos.

### Executar testes

```bash
pnpm test
```

Executa todos os testes com Vitest. Para rodar um teste específico:

```bash
npx vitest run server/nomeDoArquivo.test.ts
```

### Migrações de banco de dados

```bash
pnpm db:generate
pnpm db:check
```

Esses comandos geram e validam a migração do Drizzle ORM sem aplicá-la em produção. Execute-os sempre que alterar `drizzle/schema.ts` ou `drizzle/schema-integracao.ts`.

O comando `pnpm db:migrate` aplica as migrações pendentes e é reservado à homologação e ao responsável pela liberação em produção. O comando legado `pnpm db:push`, que gera e aplica na mesma execução, não deve ser usado durante o desenvolvimento normal.

---

## Estrutura do Projeto

```
hospital_file_manager/
├── client/                    # Frontend React
│   ├── public/                # Arquivos estáticos
│   └── src/
│       ├── components/        # Componentes reutilizáveis (shadcn/ui)
│       ├── contexts/          # React contexts
│       ├── hooks/             # Custom hooks
│       ├── lib/               # Utilitários (trpc, dateUtils, etc.)
│       ├── pages/             # Páginas da aplicação
│       ├── App.tsx            # Rotas e layout
│       ├── main.tsx           # Providers
│       └── index.css          # Estilos globais e tema
├── server/                    # Backend Express + tRPC
│   ├── _core/                 # Infraestrutura (NÃO EDITAR)
│   ├── connectors/            # Conectores externos (Warleine, Inter)
│   ├── routers/               # Routers tRPC por módulo
│   ├── services/              # Serviços de negócio
│   ├── validators/            # Validadores Zod
│   ├── db.ts                  # Helpers de banco de dados
│   ├── routers.ts             # Router principal tRPC
│   └── storage.ts             # Helpers S3
├── drizzle/                   # Schema e migrações do banco
│   ├── schema.ts              # Schema principal
│   ├── schema-integracao.ts   # Schema de integração
│   └── meta/                  # Metadados de migração
├── shared/                    # Tipos e constantes compartilhados
├── types/                     # Tipos TypeScript adicionais
├── docs/                      # Documentação
└── scripts/                   # Scripts utilitários
```

> **Atenção:** Os arquivos dentro de `server/_core/` são infraestrutura do framework e **não devem ser editados** a menos que esteja estendendo a infraestrutura.

---

## Fluxo de Desenvolvimento

O ciclo de desenvolvimento segue quatro etapas principais:

1. **Schema** — Atualize as tabelas em `drizzle/schema.ts` e execute `pnpm db:push` para aplicar as migrações.

2. **Backend** — Adicione helpers de banco em `server/db.ts`, crie ou estenda procedures em `server/routers.ts` (ou em `server/routers/*.ts` para módulos específicos). Use `protectedProcedure` para rotas autenticadas e `publicProcedure` para rotas públicas.

3. **Frontend** — Consuma os dados via hooks tRPC (`trpc.*.useQuery` / `trpc.*.useMutation`). Use componentes shadcn/ui de `@/components/ui/*` e Tailwind CSS para estilização.

4. **Testes** — Escreva testes em `server/*.test.ts` usando Vitest. Execute com `pnpm test` antes de enviar o PR.

---

## Padrões de Código

### Formatação de datas

Todas as datas vindas do banco devem ser tratadas com `safeParseDate` antes de exibição para evitar problemas de fuso horário (UTC-3 mostrando um dia a menos).

```tsx
import { safeParseDate, formatDateBR } from "@/lib/dateUtils";

// Correto
const dataFormatada = formatDateBR(item.dataExecucao);

// Incorreto - NÃO FAÇA ISSO
const data = new Date(item.dataExecucao).toLocaleDateString("pt-BR");
```

### Convenções gerais

| Aspecto            | Padrão                                                             |
| ------------------ | ------------------------------------------------------------------ |
| Estilo de código   | Prettier (configuração do projeto)                                 |
| Nomes de variáveis | camelCase                                                          |
| Nomes de tabelas   | camelCase (Drizzle)                                                |
| Nomes de arquivos  | PascalCase para componentes, camelCase para serviços               |
| Commits            | Mensagens descritivas em português                                 |
| Branches           | `feat/nome-da-feature`, `fix/descricao-do-bug`, `hotfix/descricao` |

### Componentes UI

Antes de criar um novo componente, verifique se já existe um equivalente em `client/src/components/`. O projeto usa extensivamente shadcn/ui e componentes customizados como `DashboardLayout`, `AIChatBox` e `Map`.

---

## Fluxo de Contribuição (Git)

O fluxo completo de trabalho simultâneo entre Sergio, Danilo e Paulo está descrito em [`docs/trabalho-em-equipe-manus-github-banco.md`](docs/trabalho-em-equipe-manus-github-banco.md). Quando houver alteração de banco, também é obrigatório seguir [`docs/processo-migracoes-banco-equipe.md`](docs/processo-migracoes-banco-equipe.md).

1. Certifique-se de estar na branch `main` atualizada:

   ```bash
   git checkout main
   git pull origin main
   ```

2. Crie uma branch para sua feature ou correção:

   ```bash
   git checkout -b feat/minha-nova-feature
   ```

3. Faça suas alterações, commite e envie:

   ```bash
   git add .
   git commit -m "Implementar nova funcionalidade X"
   git push origin feat/minha-nova-feature
   ```

4. Abra um **Pull Request** no GitHub para a branch `main`.

5. Aguarde a revisão e aprovação antes do merge.

> **Regra importante:** Nunca faça push direto na branch `main`. Sempre use Pull Requests. Toda alteração em `drizzle/` precisa ser revisada por outra pessoa antes da aplicação.

---

## Módulos do Sistema

O sistema é dividido nos seguintes módulos principais:

| Módulo           | Descrição                                    | Arquivos principais                                               |
| ---------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| Faturamento      | Upload e processamento de XMLs TISS          | `server/faturamentoUnificadoService.ts`, `ConciliacaoCruzada.tsx` |
| Conciliação      | Comparação automática XML enviado vs retorno | `server/faturamentoUnificadoService.ts`                           |
| Análise de Glosa | Identificação e recurso de glosas            | `AnaliseGlosa.tsx`, `server/xmlRecursoService.ts`                 |
| XML Recurso      | Geração de XML de recurso de glosa TISS      | `server/xmlRecursoService.ts`                                     |
| Demonstrativo    | Visualização de retornos dos convênios       | `Demonstrativo.tsx`                                               |
| Financeiro       | Contas a receber, repasses, fluxo de caixa   | `FinanceiroModule.tsx`, `server/routers/financeiroRouter.ts`      |
| Atendimentos     | Integração com sistema Tasy                  | `Atendimentos.tsx`, `server/connectors/`                          |
| Tabelas de Preço | Cadastro de tabelas por convênio             | `TabelasPreco.tsx`                                                |
| Integrador       | Conexões com sistemas externos               | `client/src/components/integrador/`                               |

---

## Resolução de Problemas

**O servidor não inicia:**
Verifique se o arquivo `.env` está configurado corretamente e se o banco de dados está acessível. As variáveis `DATABASE_URL` e `JWT_SECRET` são obrigatórias.

**Erros de migração:**
Se uma migração falhar porque a coluna ou tabela já existe, interrompa a execução e registre o erro. Não edite uma migração antiga e não marque a migração manualmente na tabela `__drizzle_migrations` sem diagnóstico, backup e autorização do responsável pela liberação. A correção normal é criar uma nova migração versionada.

**Datas aparecendo com um dia a menos:**
Sempre use `safeParseDate()` do `@/lib/dateUtils` ao converter strings de data do banco. Nunca use `new Date(string)` diretamente.

**Erros de TypeScript:**
Execute `pnpm check` para listar todos os erros. O projeto deve compilar com 0 erros antes de abrir um PR.

---

## Contato

Em caso de dúvidas sobre o projeto, entre em contato com o administrador do repositório ou abra uma issue no GitHub.
