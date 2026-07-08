# Debug: XML ainda saindo com formato antigo após deploy

## Problema:
O XML gerado em produção ainda mostra:
- tissV3_05_00.xsd (deveria ser tissV3_02_01)
- CNPJ na origem (deveria ser codigoPrestadorNaOperadora)
- Padrao 3.05.00 (deveria ser versaoPadrao 3.02.01)
- sequencialItem nos procedimentos e despesas (deveria não ter)
- CNES dentro de contratadoExecutante (deveria estar fora)
- codigoDespesa com 1 dígito (deveria ter 2)
- quantidadeExecutada com decimais nos procedimentos (deveria ser inteiro)
- viaAcesso e tecnicaUtilizada (deveria não ter)

## Análise:
O código em /home/ubuntu/hospital_file_manager/server/faturamentoExportService.ts está CORRETO.
Mas o XML gerado em produção está ERRADO.

## Hipótese:
O lote já tinha um xmlUrl salvo anteriormente (gerado com o código antigo).
Quando o usuário clica "Regenerar", o botão chama gerarXmlTiss que importa faturamentoExportService e gera novo XML.
MAS: o XML está sendo servido de uma URL S3 antiga que foi salva no campo xmlUrl do lote.

## Verificação necessária:
1. Verificar se o botão "Regenerar" realmente chama gerarXmlTiss (que gera novo XML)
2. Ou se ele apenas abre o xmlUrl existente (que é o antigo)

## Solução provável:
O botão "XML" e "Regenerar" na tela de Remessas Fechadas AMBOS chamam gerarXml.mutate({ loteId: lote.id })
que chama a procedure gerarXmlTiss que importa gerarXmlTissLote.
A função gerarXmlTissLote gera novo XML, faz upload para S3, e atualiza o campo xmlUrl.
Então deveria funcionar...

## Outra hipótese:
O sequencialTransacao é "783536239011" e o numeroLote é "LF1783531841498" - esses são os mesmos valores
do XML anterior. Se o XML fosse regenerado, o sequencialTransacao seria diferente (usa Date.now()).
CONCLUSÃO: O usuário está abrindo o XML ANTIGO salvo no S3, não o regenerado.
Possivelmente o botão "Regenerar" está falhando silenciosamente ou o browser está cacheando.
