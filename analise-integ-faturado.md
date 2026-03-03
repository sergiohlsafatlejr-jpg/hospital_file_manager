# integ_faturado - Estrutura

118.718 registros, estabelecimento 1260036

## Colunas (40)
_id (PK), estabelecimento_id, nomeconv, codconv, mesprod, numfatura, codrecur, tipoproc, protocolo, numconta, guiacobra, aihguia, descricao, matricula, data, dataint, datasai, procdisco, codproprio, codgrufi, funcaotiss, receber, codcc, nomecc, prestexe, nomeprest, medsolic, nomemedsolic, codtiss, descmotivo, complrecur, tipoatend, databaixa, codplaco, nomeplaco, vl_unitario, quantidade, vl_faturado, _sincronizado_em, _atualizado_em

## Diferenças vs integ_faturado_x_recebido
integ_faturado NÃO tem: vl_recebido, vl_receb_a_maior, vl_total_recebido, vl_aberto, vl_glosas, gl_recurso, gl_aceita, gl_analise, gl_recuperada
integ_faturado TEM a mais: medsolic, nomemedsolic, databaixa, codplaco, nomeplaco

## Mapeamento integ_faturado → faturamento_unificado
_id → origemId
'WARLEINE' → origemSistema
estabelecimento_id → estabelecimentoId
numconta → contaNumero
guiacobra → numeroGuia
aihguia → numeroGuiaOperadora
protocolo → protocolo
numfatura → lotePrestador
matricula → carteiraBeneficiario
nomeconv → convenio
mesprod → competencia (converter 2025/01 → 2025-01)
nomeprest → profissionalExecutante
nomecc → setor
tipoproc → tipoItem
procdisco → codigoItem
codproprio → codigoItemTuss
descricao → descricaoItem
data → dataExecucao
quantidade → quantidade
vl_unitario → valorUnitario
vl_faturado → valorFaturado
