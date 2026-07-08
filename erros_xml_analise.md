# Erros de Validação XML TISS - Análise

## Erros Identificados e Correções Necessárias:

### 1. Ordem dos elementos no cabecalhoGuia (linha 29)
**Erro:** `numeroGuiaOperadora` aparece antes de `numeroGuiaSolicitacaoInternacao`
**Correção:** A ordem correta TISS é:
1. registroANS
2. numeroGuiaPrestador
3. numeroGuiaSolicitacaoInternacao (obrigatório para internação)
4. guiaPrincipal (opcional)

### 2. Elemento `senha` na posição errada (linha 31)
**Erro:** `senha` aparece antes de `numeroGuiaOperadora`
**Correção:** Ordem correta em dadosAutorizacao:
1. numeroGuiaOperadora
2. dataAutorizacao
3. senha (opcional)
4. dataValidadeSenha (opcional)

### 3. Elemento `tipoInternacao` na posição errada (linha 42)
**Erro:** `tipoInternacao` aparece antes de `dataInicioFaturamento`
**Correção:** Ordem correta em dadosInternacao:
1. caraterAtendimento
2. tipoFaturamento
3. dataInicioFaturamento
4. horaInicioFaturamento
5. dataFinalFaturamento
6. horaFinalFaturamento
7. tipoInternacao
8. regimeInternacao
9. CID
10. indicacaoClinica
11. indicadorAcidente
12. motivoEncerramento

### 4. CNES na posição errada (linha 60)
**Erro:** `CNES` aparece como filho direto de dadosExecutante
**Correção:** CNES deve estar DENTRO de contratadoExecutante, na ordem:
1. codigoPrestadorNaOperadora
2. nomeContratado
3. CNES

### 5. Falta `dataExecucao` nos procedimentos (linha 65)
**Erro:** `sequencialItem` aparece sem `dataExecucao` antes
**Correção:** Ordem correta em procedimentoExecutado:
1. dataExecucao (OBRIGATÓRIO - vem ANTES de sequencialItem)
2. sequencialItem
3. ...

ERRADO! Na verdade a ordem TISS é:
1. sequencialItem
2. dataExecucao
... verificar schema

### 6. quantidadeExecutada com valor decimal (linha 74)
**Erro:** `2.0000` não é inteiro válido
**Correção:** quantidadeExecutada deve ser inteiro: `Math.round()` ou `parseInt()`

### 7. Código de despesa com formato errado (linhas 94, 111, etc.)
**Erro:** Valores `2`, `3` não são válidos. Enumeração aceita: `[01, 02, 03, 05, 07, 08]`
**Correção:** Código de despesa deve ter 2 dígitos: `01`, `02`, `03`, `05`, `07`, `08`

### 8. Ordem dos elementos em outrasDespesas/despesa (linhas 93, 101, etc.)
**Erro:** `sequencialItem` aparece antes de `codigoDespesa`
**Correção:** Ordem correta em despesa:
1. codigoDespesa (PRIMEIRO!)
2. servicosExecutados (contém sequencialItem, dataExecucao, etc.)

### 9. descricaoProcedimento na posição errada (linha 101)
**Erro:** `descricaoProcedimento` aparece depois de `codigoProcedimento` mas antes de `quantidadeExecutada`
**Correção:** Verificar ordem TISS de servicosExecutados:
1. dataExecucao
2. horaInicial
3. horaFinal
4. codigoTabela
5. codigoProcedimento
6. quantidadeExecutada
7. unidadeMedida
8. reducaoAcrescimo
9. valorUnitario
10. valorTotal
11. descricaoProcedimento (vai DEPOIS dos valores!)
