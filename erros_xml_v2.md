# Erros no XML Gerado (v2)

Comparando o XML gerado com o padrão TISS correto:

## Problemas identificados:

1. **Schema version errada**: Está usando `tissV3_05_00.xsd` e `Padrao 3.05.00` - deveria ser `tissV3_02_01.xsd` e `versaoPadrao 3.02.01`
2. **Origem usa CNPJ**: Deveria usar `codigoPrestadorNaOperadora` em vez de `<ans:CNPJ>`
3. **Tag `Padrao`**: Deveria ser `<ans:versaoPadrao>` em vez de `<ans:Padrao>`
4. **CNES dentro de contratadoExecutante**: Deveria estar fora (como filho direto de dadosExecutante)
5. **sequencialItem nos procedimentos**: Deveria ser removido (não existe no TISS 3.02.01 para guiaResumoInternacao)
6. **viaAcesso e tecnicaUtilizada**: Deveria ser removido
7. **quantidadeExecutada com decimais nos procedimentos**: Deveria ser inteiro (2 em vez de 2.0000)
8. **sequencialItem nas despesas**: Deveria ser removido
9. **codigoDespesa com 1 dígito**: Deveria ter 2 dígitos (02, 03 em vez de 2, 3)
10. **dadosSaida antes de dadosExecutante**: Ordem incorreta - deveria ser dadosExecutante > dadosInternacao > dadosSaidaInternacao > procedimentos

## Conclusão:
As alterações que fizemos NÃO estão sendo aplicadas. O XML gerado ainda usa o código ANTIGO.
Possível causa: o deploy não pegou as alterações, ou o arquivo está sendo lido de cache.
