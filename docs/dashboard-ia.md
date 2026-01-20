# Dashboard de IA - Documentação

## Visão Geral

O Dashboard de IA é uma tela dedicada para acompanhar a acurácia e evolução do aprendizado do sistema de inteligência artificial implementado no Hospital File Manager.

## Funcionalidades

### 1. Métricas Principais (Cards)

- **Taxa de Acerto**: Percentual de insights aceitos vs total avaliados
- **Total de Insights**: Quantidade total de insights gerados pela IA
- **Valor Recuperado**: Soma dos valores dos insights aceitos
- **Potencial Pendente**: Valor dos insights ainda aguardando análise

### 2. Evolução Mensal

Gráfico de linha mostrando a evolução da taxa de acerto ao longo do tempo, permitindo visualizar se o aprendizado da IA está melhorando.

### 3. Acurácia por Tipo

Gráfico de barras mostrando a taxa de acerto por categoria de insight:
- Item faltante
- Quantidade abaixo do esperado
- Valor divergente
- Outros tipos

### 4. Distribuição de Status

Cards mostrando a quantidade de insights por status:
- **Aceitos** (verde): Insights confirmados pelo usuário
- **Rejeitados** (vermelho): Insights marcados como incorretos
- **Pendentes** (amarelo): Insights aguardando avaliação
- **Ignorados** (cinza): Insights não avaliados

### 5. Verificar Críticos

Botão que permite verificar se existem insights críticos pendentes e notifica o proprietário do sistema quando há divergências significativas.

## Filtros

- **Convênio**: Filtrar métricas por convênio específico ou ver todos
- **Atualizar**: Recarregar os dados do dashboard

## Integração com Sistema de Alertas

O Dashboard IA está integrado com o sistema de notificações automáticas:

1. Quando a IA detecta divergências significativas em novas contas importadas, um alerta é gerado automaticamente
2. O proprietário do sistema é notificado via sistema de notificações do Manus
3. Os alertas críticos são destacados no dashboard para fácil identificação

## Backend

### Rotas Implementadas

- `ia.metricas`: Retorna métricas de acurácia
- `ia.evolucaoMensal`: Retorna dados para gráfico de evolução
- `ia.acuraciaPorTipo`: Retorna acurácia por categoria de insight
- `ia.verificarCriticos`: Verifica e notifica sobre insights críticos
- `ia.notificarDivergencias`: Envia notificação ao proprietário

### Banco de Dados

Tabela `insightsIA` com campos:
- `status`: 'pendente' | 'aceito' | 'rejeitado' | 'ignorado'
- `tipoInsight`: Categoria do insight
- `valorEstimado`: Valor potencial do insight
- `createdAt`: Data de criação para análise temporal
