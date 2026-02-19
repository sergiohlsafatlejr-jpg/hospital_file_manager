# Roadmap: Sistema de Previsão de Risco de Glosa

## 📋 Visão Geral

Sistema inteligente que analisa padrões históricos de recebimento (faturamento vs. demonstrativo) para prever risco de glosa em novas contas, permitindo ação preventiva antes do processamento.

---

## 🎯 Objetivos

1. **Prever risco de glosa** - Identificar contas com alto risco antes do recebimento
2. **Baseado em dados reais** - Usar histórico de 12 meses de faturamento e recebimento
3. **Análise por item** - Calcular taxa de glosa específica para cada procedimento/item
4. **Alertas automáticos** - Notificar sobre contas/itens de risco
5. **Ação preventiva** - Permitir correção antes de enviar para operadora

---

## 🔧 Componentes Implementados

### ✅ 1. Analisador de Risco de Glosa (`server/analisadorRiscoGlosa.ts`)

**Funcionalidades:**

#### A. Análise de Padrões de Recebimento
```typescript
AnalisadorRiscoGlosa.analisarPadroesRecebimento(
  estabelecimentoId: number,
  convenioId?: number,
  mesesHistorico?: number (default: 12)
): Promise<PadraoRecebimento[]>
```

**Retorna para cada item:**
- `codigoItem` - Código do procedimento/item
- `descricaoItem` - Descrição
- `totalFaturado` - Quantas vezes foi faturado
- `totalRecebido` - Quantas vezes foi recebido
- `totalGlosado` - Quantas vezes foi glosado
- `taxaGlosa` - Percentual de glosa (0-100%)
- `taxaRecebimento` - Percentual de recebimento (0-100%)
- `valorMedioFaturado` - Valor médio faturado
- `valorMedioRecebido` - Valor médio recebido
- `valorMedioGlosado` - Valor médio glosado
- `motivosGlosaFrequentes` - Top 5 motivos de glosa com frequência
- `risco` - Classificação (baixo/médio/alto/crítico)

**Classificação de Risco:**
- **Baixo**: Taxa de glosa < 5%
- **Médio**: Taxa de glosa 5-15%
- **Alto**: Taxa de glosa 15-30%
- **Crítico**: Taxa de glosa > 30%

**Exemplo de Saída:**
```json
{
  "codigoItem": "00301",
  "descricaoItem": "Consulta Médica",
  "totalFaturado": 342,
  "totalRecebido": 312,
  "totalGlosado": 30,
  "taxaGlosa": 8.77,
  "taxaRecebimento": 91.23,
  "valorMedioFaturado": 150.50,
  "valorMedioRecebido": 145.30,
  "valorMedioGlosado": 125.00,
  "motivosGlosaFrequentes": [
    {
      "codigo": "1705",
      "descricao": "Valor cobrado a maior",
      "frequencia": 15,
      "percentual": 50.0
    },
    {
      "codigo": "1426",
      "descricao": "Negado pela auditoria",
      "frequencia": 10,
      "percentual": 33.33
    }
  ],
  "risco": "medio"
}
```

#### B. Análise de Risco de Conta
```typescript
AnalisadorRiscoGlosa.analisarRiscoConta(
  estabelecimentoId: number,
  convenioId: number,
  numeroGuia: string,
  itens: Array<{
    codigoItem: string;
    descricaoItem: string;
    quantidade: number;
    valorFaturado: number;
  }>,
  mesesHistorico?: number
): Promise<AnaliseRiscoConta>
```

**Retorna:**
- `numeroGuia` - Número da guia
- `convenioId` - ID do convênio
- `valorFaturado` - Valor total faturado
- `itens` - Array com análise de cada item:
  - `codigoItem` - Código
  - `descricaoItem` - Descrição
  - `quantidade` - Quantidade
  - `valorFaturado` - Valor faturado
  - `riscoPrevisto` - Risco do item
  - `taxaGlosaEsperada` - % de glosa esperada
  - `motivosGlosaProvaveis` - Motivos mais prováveis
- `riscoConta` - Risco geral (baixo/médio/alto/crítico)
- `scoreRisco` - Score numérico (0-100)
- `motivosAlerta` - Lista de alertas

#### C. Identificação de Contas com Risco
```typescript
AnalisadorRiscoGlosa.identificarContasComRisco(
  estabelecimentoId: number,
  convenioId: number,
  arquivoId: number,
  limiteRisco?: "alto" | "critico" (default: "alto")
): Promise<AnaliseRiscoConta[]>
```

**Funcionalidade:**
- Processa todas as guias de um arquivo XML importado
- Analisa risco de cada conta
- Retorna apenas contas acima do limite de risco
- Ordena por score de risco (maior risco primeiro)

---

## 📝 Próximos Passos de Implementação

### Fase 2: Procedimentos tRPC

Adicionar ao `server/routers/motorRegrasRouter.ts` ou criar novo router:

```typescript
/**
 * Analisar padrões de recebimento histórico
 */
analisarPadroesRecebimento: protectedProcedure
  .input(
    z.object({
      estabelecimentoId: z.number().positive(),
      convenioId: z.number().optional(),
      mesesHistorico: z.number().default(12),
    })
  )
  .query(async ({ input }) => {
    const padroes = await AnalisadorRiscoGlosa.analisarPadroesRecebimento(
      input.estabelecimentoId,
      input.convenioId,
      input.mesesHistorico
    );
    return { padroes, total: padroes.length };
  }),

/**
 * Analisar risco de uma conta específica
 */
analisarRiscoConta: protectedProcedure
  .input(
    z.object({
      estabelecimentoId: z.number().positive(),
      convenioId: z.number().positive(),
      numeroGuia: z.string(),
      itens: z.array(
        z.object({
          codigoItem: z.string(),
          descricaoItem: z.string(),
          quantidade: z.number(),
          valorFaturado: z.number(),
        })
      ),
    })
  )
  .query(async ({ input }) => {
    return await AnalisadorRiscoGlosa.analisarRiscoConta(
      input.estabelecimentoId,
      input.convenioId,
      input.numeroGuia,
      input.itens
    );
  }),

/**
 * Identificar contas com risco em arquivo importado
 */
identificarContasComRisco: protectedProcedure
  .input(
    z.object({
      estabelecimentoId: z.number().positive(),
      convenioId: z.number().positive(),
      arquivoId: z.number().positive(),
      limiteRisco: z.enum(["alto", "critico"]).default("alto"),
    })
  )
  .query(async ({ input }) => {
    const contas = await AnalisadorRiscoGlosa.identificarContasComRisco(
      input.estabelecimentoId,
      input.convenioId,
      input.arquivoId,
      input.limiteRisco
    );
    return { contas, total: contas.length };
  }),
```

### Fase 3: Interface Frontend

Criar página `client/src/pages/PrevisaoGlosa.tsx` com:

1. **Seção 1: Padrões de Recebimento**
   - Filtro: Convênio, Período (meses)
   - Botão: "Analisar Padrões"
   - Tabela com colunas:
     - Código Item
     - Descrição
     - Taxa Glosa (%)
     - Taxa Recebimento (%)
     - Risco (badge colorida)
     - Motivos Top 3
   - Ordenação por risco

2. **Seção 2: Análise de Conta**
   - Filtro: Convênio, Número Guia
   - Botão: "Analisar Risco"
   - Card com:
     - Score de Risco (0-100)
     - Classificação (badge)
     - Alertas
   - Tabela de itens com risco individual
   - Motivos prováveis de glosa

3. **Seção 3: Contas com Risco (Pós-Importação)**
   - Seletor: Arquivo XML importado
   - Filtro: Limite de risco (Alto/Crítico)
   - Botão: "Identificar Contas"
   - Tabela com:
     - Número Guia
     - Score de Risco
     - Valor Faturado
     - Itens de Risco
     - Ações (Visualizar, Editar, Marcar para Revisão)

### Fase 4: Integração com Relatórios BI

Adicionar widget em `RelatoriosBI.tsx`:
- Gráfico: Distribuição de risco de contas (pizza)
- Gráfico: Evolução de taxa de glosa por mês (linha)
- Tabela: Top 10 itens com maior taxa de glosa
- Alerta: Contas importadas recentemente com risco crítico

### Fase 5: Testes

```typescript
describe("Análise de Risco de Glosa", () => {
  it("deve calcular taxa de glosa corretamente", async () => {
    // Inserir dados de teste
    // Chamar analisarPadroesRecebimento
    // Validar cálculos
  });

  it("deve classificar risco corretamente", async () => {
    // Testar classificação de risco
  });

  it("deve identificar contas com risco", async () => {
    // Testar identificação de contas
  });

  it("deve retornar motivos de glosa", async () => {
    // Testar motivos mais frequentes
  });
});
```

---

## 📊 Fluxo de Dados

```
Histórico de Faturamento (12 meses)
    ↓
Cruzar com Demonstrativo de Pagamento
    ↓
Calcular Taxa de Glosa por Item
    ↓
Identificar Motivos Frequentes
    ↓
Classificar Risco (Baixo/Médio/Alto/Crítico)
    ↓
Novo XML Importado
    ↓
Analisar Cada Conta
    ↓
Comparar com Padrões
    ↓
Gerar Score de Risco
    ↓
Alertar Usuário
    ↓
Ação Preventiva (Corrigir antes de enviar)
```

---

## 🎨 Exemplo de Visualização

```
┌─────────────────────────────────────────────────────────┐
│ Previsão de Risco de Glosa                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Padrões de Recebimento (Últimos 12 meses)              │
│ Convênio: [Dropdown]  Período: [12 meses]             │
│ [Analisar Padrões]                                     │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Código | Descrição | Taxa Glosa | Risco | Motivos │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ 00301  │ Consulta  │ 8.77%      │ 🟡    │ 1705... │ │
│ │ 00401  │ Exame     │ 25.5%      │ 🔴    │ 1426... │ │
│ │ 00501  │ Cirurgia  │ 45.2%      │ 🔴🔴  │ 1408... │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Análise de Conta                                        │
│ Guia: [Input]  [Analisar Risco]                       │
│                                                         │
│ Score de Risco: 65/100  [🔴 ALTO RISCO]              │
│ Alertas:                                                │
│ • 2 itens com risco alto                               │
│ • Taxa de glosa esperada: 22.5%                        │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Benefícios

1. **Prevenção Proativa** - Corrigir antes de enviar para operadora
2. **Redução de Glosa** - Evitar itens problemáticos
3. **Economia de Tempo** - Focar em contas de risco
4. **Inteligência Automática** - Padrões detectados automaticamente
5. **Rastreabilidade** - Histórico completo de análises

---

## 📈 Métricas de Sucesso

- [ ] 100% das contas analisadas em < 2 segundos
- [ ] Taxa de acurácia de previsão > 85%
- [ ] Redução de glosa em 30% (comparado a período anterior)
- [ ] 90% das contas de risco crítico corrigidas antes do envio
- [ ] Tempo de análise manual reduzido em 50%

---

## 🔄 Próximas Fases (Futuro)

1. **Machine Learning Avançado** - Modelos preditivos mais sofisticados
2. **Recomendações Automáticas** - Sugerir correções específicas
3. **Integração com Regras** - Aplicar regras de negócio automaticamente
4. **Dashboard de Conformidade** - Monitorar efetividade
5. **Alertas em Tempo Real** - Notificar durante importação

---

## 📞 Suporte

Para dúvidas ou sugestões sobre este roadmap, consulte a documentação do motor de regras.
