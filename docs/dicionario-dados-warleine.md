# Dicionário de dados do faturamento Warleine

**Autor:** Manus AI  
**Data:** 21 de setembro de 2026  
**Fonte primária:** `CamposWareline.xlsx`, fornecido pelo usuário

## Conclusão

A planilha descreve os 48 campos úteis da exportação Warleine e permite iniciar o desenho da base. O mapeamento confirmou que a primeira ocorrência de `descricao` representa o **nome do paciente** e a segunda representa o **nome do serviço ou item**. Também confirmou que `nomeconv` identifica o convênio faturado, enquanto `nomeplaco` identifica o convênio que realizou o pagamento.

A implementação deve localizar as colunas pela posição e pelo número da ocorrência. Não é seguro transformar a linha em um objeto usando apenas o texto do cabeçalho, porque `descricao` e `codrecur` aparecem duas vezes.

## Campos de identificação e faturamento

| Posição original | Campo Warleine | Campo canônico proposto | Nome no portal | Uso informado |
|---:|---|---|---|---|
| 1 | `nomeconv` | `convenioFaturadoNome` | Convênio | Conta Convênio, BI e Glosas |
| 2 | `codconv` | `convenioFaturadoCodigo` | Código do convênio | Armazenar para auditoria; não exibir |
| 3 | `mesprod` | `competencia` | Competência | Conta Convênio, BI e Glosas |
| 4 | `numfatura` | `remessaFaturamento` | Remessa de faturamento | Conta Convênio, BI e Glosas |
| 5 | `codrecur` — ocorrência 1 | `codigoRecursoOrigem1` | A definir | A definir |
| 6 | `tipoproc` | `tipoItem` | Tipo dos itens | Conta Convênio, BI e Glosas |
| 7 | `protocolo` | `protocoloConvenio` | Lote/Protocolo | Conta Convênio, BI e Glosas |
| 8 | `numconta` | `numeroConta` | Número da conta | Conta Convênio, BI e Glosas |
| 9 | `guiacobra` | `guiaOperadora` | Guia da operadora | Conta Convênio, BI e Glosas |
| 10 | `aihguia` | `guiaPrestador` | Guia do prestador | Conta Convênio, BI e Glosas |

## Paciente e datas da conta

| Posição original | Campo Warleine | Campo canônico proposto | Nome no portal | Uso informado |
|---:|---|---|---|---|
| 11 | `descricao` — ocorrência 1 | `pacienteNome` | Paciente | Conta Convênio, BI e Glosas |
| 12 | `matricula` | `carteiraBeneficiario` | Carteirinha | Conta Convênio, BI e Glosas |
| 13 | `data` | `dataAberturaConta` | Data de abertura | Conta Convênio, BI e Glosas |
| 14 | `dataint` | `dataEntrada` | Data de entrada | Conta Convênio, BI e Glosas |
| 15 | `datasai` | `dataAlta` | Data da alta | Conta Convênio, BI e Glosas |

## Item, serviço, setor e prestador

| Posição original | Campo Warleine | Campo canônico proposto | Nome no portal | Uso informado |
|---:|---|---|---|---|
| 16 | `procdisco` | `codigoTuss` | Procedimento | Conta Convênio, BI e Glosas |
| 17 | `codproprio` | `codigoItemInterno` | Procedimento do sistema | Armazenar para auditoria; não exibir |
| 18 | `codgrufi` | `codigoTipoServico` | Código do tipo de serviço | Armazenar para auditoria; não exibir |
| 19 | `descricao` — ocorrência 2 | `servicoNome` | Serviço | Conta Convênio, BI e Glosas |
| 20 | `funcaotiss` | `funcaoTiss` | Função TISS | Armazenar para auditoria; não exibir |
| 21 | `receber` | `recebimentoViaHospital` | Modalidade de recebimento | Conta Convênio, BI e Glosas |
| 22 | `codcc` | `setorCodigo` | Código do setor | Armazenar para auditoria; não exibir |
| 23 | `nomecc` | `setorNome` | Setor | Conta Convênio, BI e Glosas |
| 24 | `prestexe` | `prestadorExecutanteCodigo` | Código do prestador | Armazenar para auditoria; não exibir |
| 25 | `nomeprest` | `prestadorExecutanteNome` | Nome do prestador | Conta Convênio, BI e Glosas |
| 26 | `quantidade` | `quantidade` | Quantidade | Conta Convênio, BI e Glosas |

O campo `receber` deve ser armazenado como domínio controlado. O valor `S` significa recebimento via hospital. O valor `N` significa recebimento direto pelo prestador. O nome “Prestador” seria ambíguo no portal; por isso, a proposta é exibi-lo como **Modalidade de recebimento**.

## Valores financeiros

| Posição original | Campo Warleine | Campo canônico proposto | Nome no portal | Uso informado |
|---:|---|---|---|---|
| 27 | `vl_faturado` | `valorFaturado` | Valor faturado | Conta Convênio, BI e Glosas |
| 28 | `vl_recebido` | `valorRecebido` | Valor recebido | BI e Glosas |
| 29 | `vl_receb_a_maior` | `valorRecebidoMaior` | Valor recebido a maior | BI e Glosas |
| 30 | `vl_total_recebido` | `valorTotalRecebido` | Valor total recebido | BI e Glosas |
| 31 | `vl_aberto` | `valorAberto` | Valor em aberto | BI e Glosas |
| 32 | `vl_glosas` | `valorGlosa` | Valor da glosa | BI e Glosas |
| 33 | `gl_recurso` | `valorRecursado` | Valor recursado | BI e Glosas |
| 34 | `gl_aceita` | `valorGlosaAceita` | Valor da glosa aceita | BI e Glosas |
| 35 | `gl_analise` | `valorGlosaAnalise` | Valor da glosa em análise | BI e Glosas |
| 36 | `gl_recuperada` | `valorGlosaRecuperada` | Valor da glosa recuperada | BI e Glosas |
| 48 | `vl_unitario` | `valorUnitario` | Valor unitário | Conta Convênio, BI e Glosas |

Todos esses campos devem usar `DECIMAL` no banco. O importador não deve recalcular ou substituir valores informados pelo Warleine. Fórmulas de conferência podem gerar avisos, mas não podem alterar os dados de origem.

### Relações financeiras comprovadas no arquivo

A conferência das 319.825 linhas encontrou valores financeiros válidos em todas elas. Em **319.796 linhas**, `vl_total_recebido` corresponde a `vl_recebido + vl_receb_a_maior + gl_recuperada`. Nessas mesmas 319.796 linhas, o faturado também fecha pela relação `vl_faturado = vl_total_recebido + vl_aberto + vl_glosas - gl_recuperada - vl_receb_a_maior`, que se reduz a faturado igual a recebido normal, aberto e glosa.

Em **319.822 linhas**, a glosa fecha pela relação `vl_glosas = gl_recurso + gl_aceita + gl_analise + gl_recuperada`. Os componentes não são mutuamente exclusivos: 309 linhas possuem mais de um desses campos com valor. Portanto, eles representam uma composição financeira da glosa e devem permanecer em colunas separadas.

As 29 exceções da primeira relação e as três exceções da segunda devem gerar aviso ou quarentena. O sistema não deve corrigir esses valores automaticamente.

## Glosa, recurso, operador e pagamento

| Posição original | Campo Warleine | Campo canônico proposto | Nome no portal | Uso informado |
|---:|---|---|---|---|
| 37 | `codtiss` | `codigoGlosa` | Código da glosa | BI e Glosas |
| 38 | `descmotivo` | `motivoGlosa` | Motivo da glosa | BI e Glosas |
| 39 | `codrecur` — ocorrência 2 | `codigoMotivoInterno` | Código interno do motivo | Armazenar para auditoria; não exibir |
| 40 | `complrecur` | `observacaoGlosa` | Observação da glosa | BI e Glosas |
| 41 | `tipoatend` | `tipoAtendimento` | Tipo de atendimento | BI e Glosas |
| 42 | `codope` | `operadorCodigo` | Código do operador | Armazenar para auditoria; não exibir |
| 43 | `nomeope` | `operadorNome` | Operador do sistema | BI e Glosas |
| 44 | `data_fechou` | `dataFechamentoRemessa` | Data de fechamento da remessa | Armazenar para auditoria; não exibir |
| 45 | `data_receb` | `dataPagamento` | Data do pagamento | BI e Glosas |
| 46 | `data_associdado_ware` | `dataAssociacaoWarleine` | Data da associação no Warleine | BI e Glosas |
| 47 | `nomeplaco` | `convenioPagadorNome` | Convênio pagador | BI e Glosas |

`nomeconv` e `nomeplaco` não devem ser consolidados em uma única coluna. O primeiro identifica o convênio faturado. O segundo identifica quem pagou. Quando forem diferentes, o sistema deve preservar os dois valores e sinalizar a divergência para análise.

## Regras já fechadas

Uma conta pode aparecer em várias linhas porque possui vários itens. Portanto, `numeroConta` não identifica uma linha de forma única. A ingestão do arquivo deve usar `loteId + numeroLinha` como identidade física. O sistema também deve calcular uma chave de negócio para comparação, mas não deve excluir automaticamente linhas apenas porque conta, serviço e valores se repetem.

Os campos marcados como “Não usar” não precisam aparecer nas telas. Mesmo assim, devem ser preservados na staging ou no registro bruto para auditoria e para a futura integração direta com o banco Warleine.

A tabela final deve manter separadamente o convênio faturado e o convênio pagador. O relatório **Sistema Warleine** poderá filtrar por ambos. O relatório oficial não será alterado durante o piloto.

O nome do paciente, a carteirinha e os dados do operador exigem acesso restrito por estabelecimento. Relatórios agregados não devem retornar esses campos. A tela Conta Convênio poderá exibi-los apenas para usuários autorizados, enquanto exportações e logs técnicos devem omiti-los por padrão.

## Definições ainda necessárias

1. A primeira ocorrência de `codrecur`, na posição 5, ainda não possui significado ou uso definido. No arquivo analisado, ela coincide com a segunda ocorrência na maioria das linhas, mas existem três divergências.
2. A análise indica que `vl_total_recebido` é composto por `vl_recebido + vl_receb_a_maior + gl_recuperada`. Ainda é necessário confirmar se o portal deve exibir o valor total informado pelo Warleine como medida oficial ou somente usá-lo para conferência.
3. A análise comprovou que `gl_recurso`, `gl_aceita`, `gl_analise` e `gl_recuperada` compõem o valor glosado e podem coexistir na mesma linha. Falta apenas confirmar se essa decomposição deve aparecer dessa forma nos indicadores do portal.
4. É necessário confirmar se `protocolo` deve aparecer no portal como **Lote**, **Protocolo do convênio** ou **Protocolo/Lote**.
5. Para a futura leitura direta do banco Warleine, será necessário incluir a chave primária original da linha consultada e a data de última atualização. Esses campos não existem no arquivo atual.
6. As 41 linhas estruturalmente deslocadas do arquivo original devem ser confirmadas como erro de exportação ou tratadas por uma regra específica. Até essa confirmação, permanecerão em quarentena.

## Próximo passo técnico

Após essas definições, o schema pode ser criado com `warleine_faturamento_lotes`, uma única `warleine_faturamento_staging`, `warleine_faturamento_quarentena` e `warleine_faturamento_itens`. O importador será posicional, idempotente e recortado por estabelecimento. A futura conexão direta ao banco usará as mesmas tabelas e regras; somente o adaptador de entrada será diferente.

## References

[1]: https://github.com/sergiohlsafatlejr-jpg/safatle-sistema "Repositório Safatle Sistema"
