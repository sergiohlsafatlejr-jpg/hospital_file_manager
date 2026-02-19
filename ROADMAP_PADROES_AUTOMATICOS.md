# Roadmap: Sistema Automático de Geração de Padrões de Regras

## 📋 Visão Geral

Sistema inteligente que analisa XMLs já importados na tabela `faturamento_tiss` e gera automaticamente sugestões de regras de negócio baseadas em padrões reais dos dados.

---

## 🎯 Objetivos

1. **Reduzir trabalho manual** - Não precisar criar cada regra do zero
2. **Baseado em dados reais** - Usar histórico de XMLs importados
3. **Inteligente** - Detectar padrões, anomalias e outliers
4. **Confiável** - Calcular confiança de cada padrão
5. **Fácil de usar** - Interface simples para revisar e aplicar

---

## 🔧 Componentes Implementados

### ✅ 1. Analisador de Padrões (`server/analisadorPadroes.ts`)

**Funcionalidades:**

```typescript
// Análise de Padrões
AnalisadorPadroes.analisarPadroesXml(
  estabelecimentoId: number,
  convenioId?: number,
  limiteMinimoProcedimentos?: number
): Promise<PadraoDetectado[]>
```

**O que faz:**
- Agrupa procedimentos principais com itens associados
- Calcula frequência de associação (%)
- Calcula quantidade média e valor médio
- Calcula confiança do padrão (0-100%)
- Calcula prioridade (1-10)
- Retorna padrões ordenados por confiança

**Exemplo de Saída:**
```json
{
  "codigoProcedimentoPrincipal": "00301",
  "descricaoProcedimentoPrincipal": "Consulta Médica",
  "itensAssociados": [
    {
      "codigoItem": "00401",
      "descricaoItem": "Eletrocardiograma",
      "tipoItem": "PROCEDIMENTO",
      "frequencia": 85,
      "quantidadeMedia": 1.2,
      "valorMedio": 150.50
    }
  ],
  "confianca": 85,
  "totalOcorrencias": 342,
  "sugestaoAcao": "deve_conter",
  "sugestaoInconsistencia": "alerta",
  "prioridade": 9
}
```

### ✅ 2. Detecção de Anomalias

```typescript
AnalisadorPadroes.detectarAnomalias(
  estabelecimentoId: number,
  convenioId?: number
): Promise<{
  contasComValorAlto: any[];
  contasComValorBaixo: any[];
  contasComMuitosItens: any[];
}>
```

**O que faz:**
- Identifica contas com valor muito acima da média (outliers altos)
- Identifica contas com valor muito abaixo da média (outliers baixos)
- Identifica contas com muitos itens (>20)
- Usa desvio padrão para cálculo

---

## 📝 Próximos Passos de Implementação

### Fase 2: Procedimentos tRPC

Adicionar ao `server/routers/motorRegrasRouter.ts`:

```typescript
/**
 * Analisar padrões automáticos a partir de XMLs importados
 */
analisarPadroesAutomaticos: protectedProcedure
  .input(
    z.object({
      estabelecimentoId: z.number().positive(),
      convenioId: z.number().optional(),
      limiteMinimo: z.number().default(5),
    })
  )
  .query(async ({ input }) => {
    const padroes = await AnalisadorPadroes.analisarPadroesXml(
      input.estabelecimentoId,
      input.convenioId,
      input.limiteMinimo
    );
    return { padroes, total: padroes.length };
  }),

/**
 * Detectar anomalias e outliers em contas
 */
detectarAnomalias: protectedProcedure
  .input(
    z.object({
      estabelecimentoId: z.number().positive(),
      convenioId: z.number().optional(),
    })
  )
  .query(async ({ input }) => {
    return await AnalisadorPadroes.detectarAnomalias(
      input.estabelecimentoId,
      input.convenioId
    );
  }),

/**
 * Criar regra a partir de padrão detectado
 */
criarRegraDePatrao: trackedProtectedProcedure
  .input(
    z.object({
      codigoProcedimentoPrincipal: z.string(),
      descricaoProcedimentoPrincipal: z.string(),
      convenioId: z.number().optional(),
      estabelecimentoId: z.number().optional(),
      itens: z.array(
        z.object({
          codigoItem: z.string(),
          descricaoItem: z.string(),
          tipoItem: z.enum(["procedimento", "taxa", "material", "medicamento", "diaria", "outros"]),
          frequencia: z.number(),
          quantidadeMedia: z.number(),
          valorMedio: z.number(),
        })
      ),
      confianca: z.number(),
      prioridade: z.number(),
      sugestaoAcao: z.enum(["deve_conter", "pode_conter"]),
    })
  )
  .mutation(async ({ input, ctx }) => {
    // Criar regra + itens
    // Retornar ID da regra criada
  }),
```

### Fase 3: Interface Frontend

Criar página `client/src/pages/PadroesAutomaticos.tsx` com:

1. **Seletor de Convênio** - Filtrar padrões por convênio
2. **Botão "Analisar Padrões"** - Dispara análise
3. **Tabela de Padrões Detectados** com colunas:
   - Procedimento Principal
   - Confiança (%)
   - Total de Ocorrências
   - Itens Associados
   - Ações (Visualizar, Aceitar, Rejeitar)

4. **Modal de Revisão** - Mostrar detalhes do padrão:
   - Código e descrição do procedimento
   - Lista de itens com frequência
   - Confiança e prioridade
   - Botões: "Criar Regra", "Cancelar"

5. **Seção de Anomalias** - Mostrar:
   - Contas com valor muito alto
   - Contas com valor muito baixo
   - Contas com muitos itens

### Fase 4: Testes

Criar `server/routers/motorRegrasRouter.test.ts` com testes para:

```typescript
describe("Análise de Padrões Automáticos", () => {
  it("deve detectar padrões de itens associados", async () => {
    // Inserir dados de teste
    // Chamar analisarPadroesXml
    // Validar resultado
  });

  it("deve calcular confiança corretamente", async () => {
    // Testar cálculo de confiança
  });

  it("deve detectar anomalias", async () => {
    // Testar detecção de outliers
  });

  it("deve criar regra a partir de padrão", async () => {
    // Testar criação de regra
  });
});
```

---

## 📊 Fluxo de Dados

```
XMLs Importados (faturamento_tiss)
         ↓
   Analisador de Padrões
         ↓
   Padrões Detectados
         ↓
   Interface de Revisão
         ↓
   Usuário Aceita/Rejeita
         ↓
   Criar Regra de Negócio
         ↓
   Regra Ativa no Sistema
```

---

## 🎨 Mockup da Interface

```
┌─────────────────────────────────────────────────────────┐
│ Padrões Automáticos                                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Convênio: [Dropdown]  [Analisar Padrões] [Detectar Anomalias] │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Padrões Detectados (12 encontrados)                 │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ Procedimento | Confiança | Ocorrências | Ações    │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ Consulta     │ 95%      │ 342         │ ✓ ✗ ...  │ │
│ │ Internação   │ 87%      │ 156         │ ✓ ✗ ...  │ │
│ │ Cirurgia     │ 72%      │ 89          │ ✓ ✗ ...  │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Anomalias Detectadas                                │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ Contas com Valor Alto: 5                           │ │
│ │ Contas com Valor Baixo: 3                          │ │
│ │ Contas com Muitos Itens: 8                         │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Benefícios

1. **Economia de Tempo** - Reduz 80% do tempo de criação de regras
2. **Baseado em Dados** - Regras refletem padrões reais
3. **Inteligência Automática** - Detecta padrões que humanos podem perder
4. **Controle Total** - Usuário revisa antes de aplicar
5. **Rastreabilidade** - Cada regra criada tem origem documentada

---

## 📈 Métricas de Sucesso

- [ ] 10+ padrões detectados automaticamente
- [ ] Confiança média dos padrões > 80%
- [ ] 100% das regras criadas funcionando corretamente
- [ ] Tempo de criação de regras reduzido em 80%
- [ ] 0 falsos positivos em anomalias

---

## 🔄 Próximas Fases (Futuro)

1. **Machine Learning** - Usar modelos para prever novos padrões
2. **Aprendizado Contínuo** - Sistema aprende com novas regras criadas
3. **Recomendações Inteligentes** - Sugerir regras baseado em histórico
4. **Validação Automática** - Testar regras antes de aplicar
5. **Dashboard de Conformidade** - Monitorar efetividade das regras

---

## 📞 Suporte

Para dúvidas ou sugestões sobre este roadmap, consulte a documentação do motor de regras.
