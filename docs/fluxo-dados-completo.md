# Mapa Completo do Fluxo de Dados — Portal.Safatle

## Visão Geral

O sistema possui **três grandes "portas de entrada"** de dados e **cinco tabelas-chave** que se interconectam para alimentar os módulos de faturamento, conciliação, relatórios e auditoria de contas.

---

## Diagrama de Fluxo

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          PORTAS DE ENTRADA DE DADOS                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────┐   ┌──────────────────────┐   ┌────────────────────────┐  │
│  │  1. UPLOAD XML    │   │  2. CONTA CONVÊNIO    │   │  3. INTEGRADOR DADOS   │  │
│  │  (Tela Upload)    │   │  (Busca por Conta)    │   │  (Sincronização Bulk)  │  │
│  └────────┬─────────┘   └──────────┬───────────┘   └───────────┬────────────┘  │
│           │                        │                            │               │
└───────────┼────────────────────────┼────────────────────────────┼───────────────┘
            │                        │                            │
            ▼                        ▼                            ▼
┌───────────────────┐   ┌───────────────────────┐   ┌────────────────────────────┐
│  faturamento_tiss │   │ contas_convenio_itens  │   │      integ_faturado        │
│  (dados brutos    │   │ (origem=BANCO_CLIENTE) │   │  (bulk sync do Warleine)   │
│   do XML)         │   │                        │   │                            │
└────────┬──────────┘   └───────────────────────┘   └─────────────┬──────────────┘
         │                                                         │
         │  migração automática                                    │
         ▼                                                         │
┌───────────────────────┐                                          │
│ contas_convenio_itens  │                                          │
│ (origem=XML)           │                                          │
└───────────────────────┘                                          │
                                                                   │
         ┌─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        TABELAS DE CONSUMO (RELATÓRIOS)                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────────────┐   ┌──────────────────────────────────────────┐   │
│  │  faturamento_unificado    │   │  conciliados_automatico                  │   │
│  │  (WARLEINE + XML_TISS)    │   │  (resultado da conciliação cruzada)      │   │
│  └──────────────────────────┘   └──────────────────────────────────────────┘   │
│                                                                                 │
│  ┌──────────────────────────┐   ┌──────────────────────────────────────────┐   │
│  │  Rel. Faturamento         │   │  Rel. Ox UTI Faturado                    │   │
│  │  (usa integ_faturado)     │   │  (usa contas_convenio_itens)             │   │
│  └──────────────────────────┘   └──────────────────────────────────────────┘   │
│                                                                                 │
│  ┌──────────────────────────┐                                                   │
│  │  Comparativo Mês a Mês   │                                                   │
│  │  (usa integ_faturado)     │                                                   │
│  └──────────────────────────┘                                                   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Detalhamento por Porta de Entrada

### 1. Upload de XML (Tela "Upload")

| Aspecto | Detalhe |
|---------|---------|
| **Trigger** | Usuário faz upload de arquivo XML TISS na tela de Upload |
| **Arquivo** | `server/routers.ts` (linha ~898) |
| **Tabela destino primária** | `faturamento_tiss` |
| **Tabela destino secundária** | `contas_convenio_itens` (com `origem = 'XML'`) |
| **Fluxo** | XML parseado → inserido em `faturamento_tiss` → **migração automática** copia para `contas_convenio_itens` |

O fluxo detalhado é:

1. O XML é parseado e cada item é inserido na tabela `faturamento_tiss` com todos os campos TISS (guia, senha, código, descrição, valor, etc.).
2. Imediatamente após, uma **migração automática** é executada: os mesmos dados são copiados para `contas_convenio_itens` com `origem = 'XML'` e `arquivoId` vinculado ao arquivo processado.
3. Um resumo é criado/atualizado em `contas_convenio_resumo` agrupando por guia+lote.
4. A tabela `faturamento_tiss` serve como fonte para a **Conciliação Cruzada** (comparação com demonstrativo).
5. A tabela `contas_convenio_itens` (origem=XML) serve para a tela de **Conta Convênio** e para o **Rel. Ox UTI Faturado**.

---

### 2. Conta Convênio — Busca por Número de Conta (Tela "Conta Convênio")

| Aspecto | Detalhe |
|---------|---------|
| **Trigger** | Usuário digita um número de conta e clica "Buscar" na tela Conta Convênio |
| **Arquivo** | `server/routers/contasConvenioRouter.ts` (procedure `buscarConta`) |
| **Tabela destino** | `contas_convenio_itens` (com `origem = 'BANCO_CLIENTE'`) |
| **Fonte dos dados** | Banco do hospital (Warleine/Tasy/EasyVision) via query configurada no Integrador |
| **Fallback** | Se a conexão ao banco remoto falhar, busca na `integ_faturado` local (cache) |

O fluxo detalhado é:

1. O sistema busca a configuração de "Busca Conta" no Integrador de Dados (tabela `integracao_mapeamentos` ou `query_configuracoes`).
2. Conecta ao banco do hospital (PostgreSQL/Oracle/MySQL/SQL Server) usando o connector apropriado (`WarleineConnector`, `OracleConnector`, `EasyVisionConnector`, etc.).
3. Executa a query cadastrada passando o número da conta como parâmetro.
4. Os dados retornados são mapeados para o formato padronizado e inseridos em `contas_convenio_itens` com `origem = 'BANCO_CLIENTE'`.
5. Um resumo é criado em `contas_convenio_resumo` com `origem = 'BANCO_CLIENTE'`.
6. Se a conta já existia (reimportação), os dados antigos são excluídos e substituídos, e um comparativo de diferenças é gerado.

**Importante:** Esta é uma busca **sob demanda** (conta por conta). Não é uma sincronização em massa. Cada vez que o usuário busca uma conta, os dados são trazidos em tempo real do banco do hospital.

---

### 3. Integrador de Dados — Sincronização Bulk (Tela "Integrador de Dados")

| Aspecto | Detalhe |
|---------|---------|
| **Trigger** | Usuário clica "Sincronizar" na tela do Integrador de Dados (ou via agendamento) |
| **Arquivo** | `server/routers/integradorDadosRouter.ts` (procedures `sincronizar` e `sincronizarTabela`) |
| **Tabela destino** | `integ_faturado` (e outras tabelas `integ_*` conforme configuração) |
| **Fonte dos dados** | Banco do hospital (Warleine) via query cadastrada |
| **Modo** | Completa (limpa e reimporta tudo) ou Incremental (apenas novos registros) |

O fluxo detalhado é:

1. O sistema busca a configuração de sincronização (query SQL, conexão, modo de importação).
2. Conecta ao banco Warleine/Tasy via connector.
3. Executa a query e obtém todos os registros (ou apenas os novos, se incremental).
4. Se modo "completa", limpa a tabela destino (`integ_faturado`) antes de inserir.
5. Os dados são inseridos em batches de 500 registros na tabela `integ_faturado`.
6. A sincronização roda em **background** (fire-and-forget) para evitar timeout.
7. O frontend faz polling para acompanhar o progresso.

A tabela `integ_faturado` contém **todos os itens faturados** do hospital, com campos como: `numconta`, `guiacobra`, `procdisco`, `descricao`, `vl_faturado`, `mesprod`, `nomeconv`, `receber`, etc.

---

## Tabelas-Chave e Seus Consumidores

| Tabela | Origem dos Dados | Consumidores (Módulos) |
|--------|------------------|------------------------|
| `faturamento_tiss` | Upload XML | Conciliação Cruzada, faturamento_unificado (fonte XML_TISS) |
| `contas_convenio_itens` (XML) | Upload XML (migração automática) | Conta Convênio, Rel. Ox UTI Faturado |
| `contas_convenio_itens` (BANCO_CLIENTE) | Busca por Conta (tempo real) | Conta Convênio, Auditoria, Rel. Ox UTI Faturado |
| `integ_faturado` | Sincronização Bulk (Integrador) | Rel. Faturamento, Comparativo Mês a Mês, faturamento_unificado (fonte WARLEINE), Fallback da Busca por Conta |
| `faturamento_unificado` | Populado a partir de `integ_faturado` + `faturamento_tiss` | Conciliação Cruzada (matching), Relatórios BI |
| `conciliados_automatico` | Resultado da conciliação cruzada | Tela Conciliação Cruzada |

---

## Por que `contas_convenio_itens` tem mais dados que `faturamento_tiss`?

A resposta é simples: **`contas_convenio_itens` tem duas fontes de dados**, enquanto `faturamento_tiss` tem apenas uma.

| Fonte | Tabela Destino | Exemplo (Hosp. Urológico) |
|-------|----------------|---------------------------|
| Upload XML | `faturamento_tiss` + `contas_convenio_itens` (XML) | ~1.458 itens |
| Busca por Conta (Warleine) | `contas_convenio_itens` (BANCO_CLIENTE) | ~7.683 itens |
| **Total em contas_convenio_itens** | | **~9.141 itens** |
| **Total em faturamento_tiss** | | **~1.458 itens** |

Os 7.683 itens com `origem = 'BANCO_CLIENTE'` foram trazidos individualmente quando usuários buscaram contas específicas na tela "Conta Convênio". Cada busca traz todos os itens daquela conta do banco Warleine e os grava localmente.

---

## Rel. Ox UTI Faturado — Por que não atualiza com novos XMLs?

O **Rel. Ox UTI Faturado** consulta a tabela `contas_convenio_itens` filtrando por `dataExecucao`. Ele mostra dados de **ambas as origens** (XML e BANCO_CLIENTE).

Se após importar novos XMLs o relatório não mostra os novos dados, as causas possíveis são:

1. **Filtro de data**: O relatório filtra por `dataExecucao` — se os novos XMLs têm datas fora do período selecionado, não aparecerão.
2. **Migração automática**: Verificar se a migração de `faturamento_tiss` → `contas_convenio_itens` (origem=XML) foi executada com sucesso após o upload.
3. **Estabelecimento**: O relatório filtra por `estabelecimentoId` — confirmar que os XMLs foram importados para o estabelecimento correto.

---

## Resumo Visual das Relações

```
BANCO DO HOSPITAL (Warleine/Tasy/EasyVision)
    │
    ├── [Busca por Conta] ──────────► contas_convenio_itens (BANCO_CLIENTE)
    │   (1 conta por vez,                    │
    │    sob demanda)                        ├──► Conta Convênio (tela)
    │                                        ├──► Rel. Ox UTI Faturado
    │                                        └──► Auditoria de Contas
    │
    └── [Sincronização Bulk] ───────► integ_faturado (TODOS os itens)
        (periódica, via Integrador)          │
                                             ├──► Rel. Faturamento
                                             ├──► Comparativo Mês a Mês
                                             ├──► faturamento_unificado (WARLEINE)
                                             └──► Fallback da Busca por Conta

ARQUIVO XML (Upload pelo usuário)
    │
    ├── [Parse direto] ─────────────► faturamento_tiss (dados brutos)
    │                                        │
    │                                        ├──► Conciliação Cruzada
    │                                        └──► faturamento_unificado (XML_TISS)
    │
    └── [Migração automática] ──────► contas_convenio_itens (XML)
                                             │
                                             ├──► Conta Convênio (tela)
                                             └──► Rel. Ox UTI Faturado
```

---

## Conclusão

O sistema foi desenhado com **separação clara de responsabilidades**:

- **`faturamento_tiss`**: Armazena os dados brutos do XML exatamente como vieram, servindo como fonte de verdade para conciliação com demonstrativos.
- **`contas_convenio_itens`**: Tabela unificada para visualização de contas (tanto XML quanto banco do cliente), usada para auditoria e relatórios operacionais.
- **`integ_faturado`**: Cache local de todos os dados faturados do hospital, sincronizado periodicamente, usado para relatórios gerenciais e BI.
- **`faturamento_unificado`**: Tabela derivada que combina `integ_faturado` + `faturamento_tiss` para análises cruzadas.

A diferença de volume entre as tabelas é esperada e reflete os diferentes mecanismos de alimentação de cada uma.
