# Conciliação Banco: nomes dos itens e consolidação Unimed

## Entrega visual

Na mesma página e no mesmo detalhe por item da Conciliação Cruzada, apresentar os nomes de origem abaixo do código TUSS. O nome vem de `servicoNome` no snapshot Hop publicado. Não consultar diretamente a staging em carga.

Quando um grupo possui descrições diferentes, mostrar todas as descrições distintas, preservando os itens e os valores. Nome ausente é identificado como **Nome não informado**, nunca preenchido artificialmente. O nome não muda a chave do comparador nem agrega setores que anteriormente estavam separados.

## Auditoria Unimed de 13/10/2026

Foi auditada exclusivamente a guia/conta indicada por Sergio em consulta somente leitura, usando snapshot publicado e demonstrativo processado. Identificadores da guia, da conta, nomes reais e linhas individuais não estão neste documento.

| Verificação | Resultado |
|---|---:|
| Itens do faturado | 68 |
| Setores distintos | 2 |
| Grupos por código e data do item | 61 |
| Eventos de demonstrativo | 57 |
| Arquivos de demonstrativo | 1 |
| Itens faturados com nome disponível | 68 |
| Eventos com nome disponível | 57 |
| Grupos multissetor | 3 |
| Grupos multissetor com retorno único | 3 |
| Grupos multissetor com quantidade igual à soma | 3 |
| Grupos multissetor com valor informado igual ao faturado somado | 3 |
| Grupos multissetor com pago + glosa igual ao faturado somado | 3 |
| Grupos código/data com retorno único | 55 |
| Grupos com quantidade igual à soma | 55 |
| Grupos com faturado igual a informado e a pago + glosa | 37 |
| Grupos sem retorno exato | 6 |

**Conclusão:** a hipótese de consolidação de setores se confirma para três grupos. Não explica todas as diferenças da guia. Há outros grupos com valores diferentes e grupos sem correspondência; não se deve concluir que a guia inteira está conciliada ao corrigir a apresentação por setor.

A auditoria não cria vínculos, não modifica faturado/pago/glosa e não associa eventos automaticamente. Totais do retorno nunca devem ser repetidos em cada setor. A evolução de consolidação será tratada no trabalho separado de conciliação persistida Banco/XML, com composição preservada e revisão explícita.

## Validação da entrega visual

- 110 testes focados aprovados: nomes, contexto, comparador, guias, serviço, permissões e apresentação.
- Build, `db:check` e `git diff --check` aprovados.
- TypeScript: 172 diagnósticos históricos, sem novos locais/códigos ou erros nos novos arquivos, comparados à main da PR #73.
- Ensaio da página real em Chromium com dados fictícios e rede externa bloqueada: nomes sob TUSS, detalhes, desktop/mobile e nenhuma mutação.
- Sem alteração de schema, migração, publicação de dados ou mudança de regras financeiras nesta PR.

## Liberação

Branch própria e PR independente. Merge/publicação dependem de revisão humana ou exceção específica de Sergio. Esta correção não habilita persistência ou geração XML Banco.
