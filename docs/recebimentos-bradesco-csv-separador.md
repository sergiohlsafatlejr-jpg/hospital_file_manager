# Recebimentos Excel — CSV Bradesco com ponto e vírgula

## Diagnóstico confirmado

A tela `/recebimentos-excel` aceita CSV, mas o parser específico do Extrato de Pagamento Bradesco lia somente campos separados por vírgula. O arquivo analisado usa **ponto e vírgula**, com decimais brasileiros dentro dos campos.

O processamento antigo reconhecia o título do extrato e retornava `success: true`, porém com **zero lotes, zero guias e zero itens**. O upload ignorava essa condição e podia registrar o arquivo como processado sem alimentar a listagem ou o Demonstrativo.

A auditoria de produção, estritamente somente leitura, confirmou **uma tentativa registrada como processada**, de mesmo tamanho do anexo, com **zero itens em recebimentos_excel e zero itens no Demonstrativo vinculados a essa tentativa**. Não é um caso de itens importados escondidos pelo filtro.

## Correção preparada

1. Detectar vírgula ou ponto e vírgula a partir do cabeçalho do extrato, sem contar separadores dentro de aspas.
2. Preservar aspas escapadas, códigos e referências com zeros iniciais, guias, protocolos e vínculo de estabelecimento/convênio.
3. Manter as regras financeiras existentes do parser Bradesco. Não alterar valores, inventar valor de glosa, modificar a conciliação ou somar fatos de outra fonte.
4. Retornar falha quando nenhum item for reconhecido. No caminho CSV pequeno via tRPC, tentar marcar o arquivo como erro e interromper o processamento antes da marcação final como processado. Falha ao gravar status ou progresso também encerra esse caminho; o banco pode manter um estado antigo indisponível, mas a rota não prossegue para sucesso.
5. Corrigir uma falha adicional de exibição: os filtros **Todos Convênios / Todos Meses / Todos Anos** enviavam `NaN`; agora omitem o filtro, como os endpoints esperam. A mesma regra vale para lista e resumo.

O layout, as abas, arrastar/soltar e o limite de **30 arquivos por envio** permanecem iguais. Não foi criada uma nova tela.

## Validação do anexo, sem importação

| Conferência | Resultado |
|---|---:|
| Lotes reconhecidos | 9 |
| Guias reconhecidas | 141 |
| Itens reconhecidos | 432 |
| Itens com situação GLOSADO pelo critério de quantidade do parser | 31 |
| Conferência individual de campos, quantidade, datas e valores | Aprovada |
| Igualdade com a variante por vírgula lida pelo parser anterior | Aprovada |
| Preservação da unidade e do convênio vinculados à tentativa | Aprovada |

A situação GLOSADO não significa, por si só, que o arquivo informe um valor financeiro de glosa suficiente para recurso. Não houve inferência nova de valores.

Os testes usam somente dados fictícios; o anexo e os scripts privados de auditoria não entram no Git. A comparação real imprimia apenas contagens e verificações de igualdade.

## Gates

- **66 testes focados aprovados**: parser Bradesco anterior, novas regressões de separador/aspas/lotes/filtros e regressões de Excel, upload multipart e background.
- Build, `db:check` e `git diff --check`: aprovados.
- TypeScript: 172 erros legados na branch e na mesma main, sem novos diagnósticos; mensagens reordenadas/abreviadas foram conferidas e o trecho legado residual permaneceu idêntico.
- Revisão independente final: P1 de encerramento em falha de status/progresso corrigido; sem P0/P1 remanescentes no escopo. Foram acrescentados oito testes que incluem o guard real da rota com falhas simuladas de atualização.

## Liberação e uso

Branch própria: `fix/bradesco-csv-separador`. Issue privada de acompanhamento: [#80](https://github.com/sergiohlsafatlejr-jpg/safatle-sistema/issues/80).

A entrega exige PR e revisão ou exceção específica de Sergio. A autorização da PR #79 do integrador é separada. Não houve merge, deploy, DDL, DML, reimportação ou conciliação nesta correção.

Após publicar e comprovar esta versão, importar/reprocessar o mesmo CSV pelo fluxo normal, com o estabelecimento correto e Bradesco selecionado. Evitar novas tentativas na versão antiga. Conferir 432 itens no arquivo e no Demonstrativo, sem filtros de mês/ano que excluam os atendimentos. O relatório não autoriza apagar a tentativa anterior nem executar importação automaticamente.

A alteração do parser é específica do layout de Extrato de Pagamento Bradesco. O guard de falha do upload aqui revisado pertence ao caminho CSV pequeno via tRPC; os demais caminhos legados não foram redesenhados.
