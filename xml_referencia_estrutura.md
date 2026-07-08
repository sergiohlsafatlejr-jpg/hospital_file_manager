# Estrutura XML TISS de Referência (Guia Resumo Internação)

## Versão: 3.02.01

## Envelope:
```xml
<ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas">
  <ans:cabecalho>
    <ans:identificacaoTransacao>...</ans:identificacaoTransacao>
    <ans:origem>
      <ans:identificacaoPrestador>
        <ans:codigoPrestadorNaOperadora>02429</ans:codigoPrestadorNaOperadora>
      </ans:identificacaoPrestador>
    </ans:origem>
    <ans:destino>
      <ans:registroANS>999999</ans:registroANS>
    </ans:destino>
    <ans:versaoPadrao>3.02.01</ans:versaoPadrao>
  </ans:cabecalho>
```

## Guia Resumo Internação - Ordem dos elementos:
```xml
<ans:guiaResumoInternacao>
  <ans:cabecalhoGuia>
    <ans:registroANS>999999</ans:registroANS>
    <ans:numeroGuiaPrestador>934813</ans:numeroGuiaPrestador>
  </ans:cabecalhoGuia>
  <ans:numeroGuiaSolicitacaoInternacao>934813</ans:numeroGuiaSolicitacaoInternacao>  <!-- FORA do cabecalho! -->
  <ans:dadosAutorizacao>
    <ans:numeroGuiaOperadora>934813</ans:numeroGuiaOperadora>  <!-- PRIMEIRO em dadosAutorizacao -->
    <ans:dataAutorizacao>2025-09-01</ans:dataAutorizacao>
    <ans:senha>934813</ans:senha>  <!-- DEPOIS de dataAutorizacao -->
  </ans:dadosAutorizacao>
  <ans:dadosBeneficiario>
    <ans:numeroCarteira>070306800</ans:numeroCarteira>
    <ans:atendimentoRN>N</ans:atendimentoRN>
    <ans:nomeBeneficiario>...</ans:nomeBeneficiario>
  </ans:dadosBeneficiario>
  <ans:dadosExecutante>
    <ans:contratadoExecutante>
      <ans:codigoPrestadorNaOperadora>02429</ans:codigoPrestadorNaOperadora>
      <ans:nomeContratado>...</ans:nomeContratado>
    </ans:contratadoExecutante>
    <ans:CNES>2337819</ans:CNES>  <!-- CNES é filho direto de dadosExecutante, FORA de contratadoExecutante! -->
  </ans:dadosExecutante>
  <ans:dadosInternacao>
    <ans:caraterAtendimento>1</ans:caraterAtendimento>
    <ans:tipoFaturamento>4</ans:tipoFaturamento>
    <ans:dataInicioFaturamento>2025-09-01</ans:dataInicioFaturamento>
    <ans:horaInicioFaturamento>15:23:24</ans:horaInicioFaturamento>
    <ans:dataFinalFaturamento>2025-09-04</ans:dataFinalFaturamento>
    <ans:horaFinalFaturamento>12:24:43</ans:horaFinalFaturamento>
    <ans:tipoInternacao>1</ans:tipoInternacao>  <!-- DEPOIS das datas! -->
    <ans:regimeInternacao>1</ans:regimeInternacao>
  </ans:dadosInternacao>
  <ans:dadosSaidaInternacao>  <!-- NÃO é "dadosSaida"! É "dadosSaidaInternacao" -->
    <ans:diagnostico>C18</ans:diagnostico>  <!-- CID aqui! -->
    <ans:indicadorAcidente>2</ans:indicadorAcidente>
    <ans:motivoEncerramento>14</ans:motivoEncerramento>
  </ans:dadosSaidaInternacao>
  <ans:procedimentosExecutados>
    <ans:procedimentoExecutado>
      <ans:dataExecucao>2025-09-03</ans:dataExecucao>  <!-- SEM sequencialItem antes! -->
      <ans:horaInicial>01:00:00</ans:horaInicial>
      <ans:horaFinal>01:00:00</ans:horaFinal>
      <ans:procedimento>
        <ans:codigoTabela>22</ans:codigoTabela>
        <ans:codigoProcedimento>30010136</ans:codigoProcedimento>
        <ans:descricaoProcedimento>...</ans:descricaoProcedimento>
      </ans:procedimento>
      <ans:quantidadeExecutada>1</ans:quantidadeExecutada>  <!-- INTEIRO! -->
      <ans:reducaoAcrescimo>1.00</ans:reducaoAcrescimo>
      <ans:valorUnitario>16.85</ans:valorUnitario>
      <ans:valorTotal>16.85</ans:valorTotal>
      <ans:identEquipe>
        <ans:identificacaoEquipe>
          <ans:grauPart>12</ans:grauPart>
          <ans:codProfissional>
            <ans:codigoPrestadorNaOperadora>02429</ans:codigoPrestadorNaOperadora>
          </ans:codProfissional>
          <ans:nomeProf>...</ans:nomeProf>
          <ans:conselho>6</ans:conselho>
          <ans:numeroConselhoProfissional>37788</ans:numeroConselhoProfissional>
          <ans:UF>52</ans:UF>
          <ans:CBOS>225121</ans:CBOS>
        </ans:identificacaoEquipe>
      </ans:identEquipe>
    </ans:procedimentoExecutado>
  </ans:procedimentosExecutados>
  <ans:valorTotal>
    <ans:valorProcedimentos>317.15</ans:valorProcedimentos>
    <ans:valorDiarias>411.00</ans:valorDiarias>
    <ans:valorTaxasAlugueis>0.00</ans:valorTaxasAlugueis>
    <ans:valorMateriais>222.35</ans:valorMateriais>
    <ans:valorMedicamentos>15403.37</ans:valorMedicamentos>
    <ans:valorOPME>0.00</ans:valorOPME>
    <ans:valorGasesMedicinais>0.00</ans:valorGasesMedicinais>
    <ans:valorTotalGeral>16353.87</ans:valorTotalGeral>  <!-- É "valorTotalGeral" NÃO "valorTotal"! -->
  </ans:valorTotal>
  <ans:outrasDespesas>  <!-- DEPOIS de valorTotal! -->
    <ans:despesa>
      <ans:codigoDespesa>02</ans:codigoDespesa>  <!-- 2 DÍGITOS: 01, 02, 03, 05, 07, 08 -->
      <ans:servicosExecutados>
        <ans:dataExecucao>2025-09-01</ans:dataExecucao>
        <ans:horaInicial>18:41:32</ans:horaInicial>
        <ans:horaFinal>01:00:00</ans:horaFinal>
        <ans:codigoTabela>00</ans:codigoTabela>
        <ans:codigoProcedimento>0000010057</ans:codigoProcedimento>
        <ans:quantidadeExecutada>1.0000</ans:quantidadeExecutada>  <!-- DECIMAL com 4 casas! -->
        <ans:unidadeMedida>008</ans:unidadeMedida>
        <ans:reducaoAcrescimo>1.00</ans:reducaoAcrescimo>
        <ans:valorUnitario>0.37</ans:valorUnitario>
        <ans:valorTotal>0.37</ans:valorTotal>
        <ans:descricaoProcedimento>Alprazolam 0,5mg Cpr</ans:descricaoProcedimento>  <!-- ÚLTIMO! -->
      </ans:servicosExecutados>
    </ans:despesa>
  </ans:outrasDespesas>
</ans:guiaResumoInternacao>
```

## DIFERENÇAS CRÍTICAS do nosso XML atual vs referência:

1. **Envelope**: Nosso usa `tissV3_05_00` e `<ans:Padrao>3.05.00</ans:Padrao>` / Referência usa `tissV3_02_01` e `<ans:versaoPadrao>3.02.01</ans:versaoPadrao>`
2. **Origem**: Nosso usa `<ans:CNPJ>` / Referência usa `<ans:codigoPrestadorNaOperadora>`
3. **cabecalhoGuia**: Nosso coloca `guiaPrincipal` dentro / Referência NÃO tem guiaPrincipal no cabecalho
4. **numeroGuiaSolicitacaoInternacao**: É filho direto de guiaResumoInternacao (FORA do cabecalhoGuia)
5. **dadosAutorizacao**: Ordem é `numeroGuiaOperadora > dataAutorizacao > senha` (nosso está invertido)
6. **CNES**: É filho direto de `dadosExecutante` (FORA de contratadoExecutante)
7. **dadosInternacao**: `tipoInternacao` e `regimeInternacao` vêm DEPOIS das datas (nosso coloca antes)
8. **dadosSaida vs dadosSaidaInternacao**: Nome correto é `dadosSaidaInternacao` com filhos: diagnostico, indicadorAcidente, motivoEncerramento
9. **procedimentoExecutado**: NÃO tem `sequencialItem`! Começa direto com `dataExecucao`
10. **procedimentoExecutado**: NÃO tem `viaAcesso` nem `tecnicaUtilizada`
11. **quantidadeExecutada em procedimentos**: É INTEIRO (sem casas decimais)
12. **identEquipe**: Estrutura é `identEquipe > identificacaoEquipe > grauPart + codProfissional > codigoPrestadorNaOperadora` (NÃO é equipeSadt)
13. **valorTotal**: Filho final é `valorTotalGeral` (NÃO `valorTotal`)
14. **outrasDespesas**: Vem DEPOIS de valorTotal (nosso coloca antes)
15. **despesa**: NÃO tem `sequencialItem`! É direto `codigoDespesa > servicosExecutados`
16. **codigoDespesa**: Deve ter 2 dígitos: `01`, `02`, `03`, `05`, `07`, `08` (nosso usa 1 dígito)
17. **servicosExecutados**: `descricaoProcedimento` é o ÚLTIMO elemento (nosso coloca antes de quantidadeExecutada)
18. **quantidadeExecutada em despesas**: É DECIMAL com 4 casas: `1.0000`, `2.0000`, etc.
