# Melhorias na IA - Dashboard de Análise Inteligente

## Funcionalidades Implementadas

### 1. Alertas da IA
- **Seção:** Alertas da IA
- **Descrição:** Exibe problemas identificados que requerem atenção imediata
- **Tipos de alerta:**
  - **Crítico (vermelho):** Funcionários com taxa de glosa elevada (>20%)
  - **Alerta (amarelo):** Contas com valores muito abaixo da média ou alto risco de glosa
  - **Info (azul):** Contas com valores acima da média
- **Categorias:** outlier, padrao_erro, risco_glosa, tendencia

### 2. Contas com Valores Fora da Média (Outliers)
- **Seção:** Contas com Valores Fora da Média
- **Descrição:** Identifica contas com valores significativamente diferentes da média histórica
- **Algoritmo:** Usa desvio padrão para detectar outliers (padrão: 2 desvios)
- **Divisão:**
  - **Abaixo da Média:** Contas com valores muito menores que a média (possível falta de itens)
  - **Acima da Média:** Contas com valores muito maiores que a média (verificar antes de enviar)
- **Informações exibidas:**
  - Nome do paciente
  - Número da guia
  - Código e descrição do procedimento
  - Valor atual vs. Valor médio
  - Percentual de diferença

### 3. Padrões de Erro por Funcionário
- **Seção:** Padrões de Erro por Funcionário
- **Descrição:** Analisa taxa de glosa por faturista nos últimos 6 meses
- **Métricas:**
  - Total de contas processadas
  - Total de procedimentos
  - Total de procedimentos glosados
  - Taxa de glosa (%)
  - Valor total glosado
- **Destaque visual:**
  - Verde: Taxa de glosa ≤ 10%
  - Amarelo: Taxa de glosa entre 10% e 20%
  - Vermelho: Taxa de glosa > 20%

### 4. Contas com Alto Risco de Glosa
- **Seção:** Contas com Alto Risco de Glosa
- **Descrição:** Prioriza contas com maior probabilidade de glosa baseado no histórico
- **Algoritmo:** Calcula score de risco baseado na taxa histórica de glosa por código de procedimento
- **Informações exibidas:**
  - Nome do paciente
  - Número da guia
  - Quantidade de procedimentos
  - Nome do arquivo
  - Risco máximo (%)
  - Valor total da conta
  - Procedimentos de risco com seus respectivos percentuais

## Rotas de API

### ia.alertas
- **Entrada:** `{ estabelecimentoId: number }`
- **Saída:** Array de alertas com tipo, categoria, título e descrição

### ia.contasOutliers
- **Entrada:** `{ estabelecimentoId: number, convenioId?: number, limiteDesvio?: number }`
- **Saída:** Array de outliers com procedimento, tipo, valor médio, desvio padrão e diferença percentual

### ia.padroesErroPorFuncionario
- **Entrada:** `{ estabelecimentoId: number }`
- **Saída:** Array com métricas por funcionário

### ia.riscoGlosa
- **Entrada:** `{ estabelecimentoId: number, arquivoId?: number }`
- **Saída:** Array de contas com score de risco

### ia.estatisticasPorCodigo
- **Entrada:** `{ estabelecimentoId: number, convenioId?: number }`
- **Saída:** Estatísticas agregadas por código de procedimento

### ia.motivosGlosaPorFuncionario
- **Entrada:** `{ estabelecimentoId: number, userId: number }`
- **Saída:** Motivos de glosa mais frequentes por funcionário

## Testes Automatizados

Arquivo: `server/iaAnalise.test.ts`
- 18 testes cobrindo todas as funcionalidades de IA
- Testes de estrutura de dados
- Testes de integração
- Testes de concorrência

## Observações

- As análises são baseadas em dados históricos dos últimos 90-180 dias
- Mínimo de 3 contas por código para gerar estatísticas significativas
- O sistema aprende com o tempo conforme mais dados são processados
