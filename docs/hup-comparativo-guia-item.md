# Conciliação Banco — comparativo explícito por guia e item

> **Revisão visual de 13/10/2026:** Sergio rejeitou a apresentação inicial. A PR #71 agora reutiliza a própria página, filtros fixos e tabela da Conciliação Cruzada, com detalhes inline. A descrição visual anterior abaixo é histórica; o funcionamento atual está em [Visual original da Conciliação Cruzada](conciliacao-banco-visual-original.md). As regras financeiras e os diagnósticos de dados continuam válidos.


## Por que a tela anterior confundia

Na versão da PR #70, competência filtrava o faturado do snapshot Hop publicado; mês do pagamento era opcional. Se vazio, os demonstrativos processados do mesmo convênio e estabelecimento eram consultados em todos os meses. Isso não misturava estabelecimentos, mas os dois indicadores superiores de pago e glosa somavam todos os eventos do recorte de pagamento, inclusive outras guias e competências. Eram contexto, não valor recebido das contas faturadas selecionadas.

O motor já procurava correspondências por guia (prestador ou operadora), TUSS e data do item quando informada. Itens sem candidato, com múltiplos candidatos, evento compartilhado ou repetição entre arquivos ficavam para revisão. A diferença faturado menos pago menos glosa informada aparecia dentro de detalhes recolhidos, e não como um comparativo explícito de guia e item.

## Ajuste solicitado por Sergio

Manter a mesma tela Guias / Contas e tornar o comparativo financeiro visível. Fonte Banco continua somente faturado publicado, recebimentos e glosas vêm dos demonstrativos oficiais; não se usa recebido do Hop. Nenhuma conciliação é gravada, nenhuma tabela nova ou migração é criada.

### Dois períodos diferentes

**Competência** é o mês do faturado. **Período dos demonstrativos** é a data de pagamento, com seleção explícita entre todos os meses ou um mês. Ao escolher um mês, é obrigatório preenchê-lo antes de buscar. Não se aplica automaticamente a competência faturada ao pagamento: uma conta de agosto pode ser paga em setembro ou depois.

Buscar em todos os meses continua disponível para localizar os retornos das guias. Essa abrangência não autoriza somar retornos de outras guias ao comparativo. O texto e o contexto dos demonstrativos deixam a seleção explícita.

### Comparativo por guia

A tabela ganha a coluna **Diferença da guia**, usada somente quando todos os grupos hospitalares dessa guia são comparáveis. Médico direto N não compõe a pendência hospitalar. Se há cobertura parcial, mostra “—” e a quantidade de grupos comparáveis; não transforma subtotal em saldo integral.

Pago e glosa candidatos continuam restritos às correspondências exclusivas com valor conhecido. No modal, subtotal da diferença dos grupos comparáveis é apresentado separadamente e rotulado como parcial quando a guia não está completamente coberta. Os totais da guia não são truncados pela paginação dos itens.

### Comparativo por item

O olho abre uma tabela paginada com TUSS, data do item faturado e do retorno, tipo, setor, modalidade, quantidade faturada, faturado, pago candidato, glosa candidata, diferença e motivo. Há acesso a todos os grupos da guia, 50 por página, em vez de limitar a revisão aos primeiros 100.

A diferença exige candidato exclusivo e data do item comprovadamente coincidente, além de pago e glosa informados. Zero explícito continua válido; valor ausente é “—”. Data ausente, ambiguidade ou valor incompleto bloqueiam a diferença, sem inferir glosa ou falta de pagamento. A quantidade paga não está disponível no contrato atual, portanto não se apresenta uma comparação de quantidade inexistente.

Itens idênticos da mesma conta/guias/TUSS/data/tipo/setor/modalidade continuam agrupados, preservando quantidade e faturado. Não há alocação ou rateio arbitrário entre itens. Eventos múltiplos para o mesmo grupo não são somados automaticamente.

### Indicadores coerentes

Os cartões de pago e glosa candidatos usam somente candidatos das guias do recorte completo de faturado, não o total geral do demonstrativo. Busca e situação filtram a tabela, enquanto os indicadores permanecem referentes ao recorte completo de competência/convênio/período. O subtotal comparável traz cobertura declarada.

Totais gerais dos demonstrativos permanecem em contexto recolhido, identificado como **não somado ao comparativo das guias**. Não se subtrai o pago geral do convênio do faturado selecionado.

## Segurança e atualização

A consulta de itens conserva autorização por estabelecimento e módulo, snapshot de lote publicado, de-para manual inequívoco e arquivos de demonstrativo processados. Apenas queries, transação de leitura e rollback; sem mutações no modo Banco. A abertura dos detalhes confere os identificadores literais da guia/conta, não depende apenas da posição visual da linha. Identificadores insuficientes/ambíguos não abrem outra conta por engano.

A staging em carga não é consultada. Sem UPDATE, INSERT, DELETE, DDL, importação ou gravação de vínculos neste escopo. Autorizações antigas de merge/deploy não se estendem à nova PR.

## Validação e implantação

Regressões sintéticas de precisão, nulos, datas, exclusividade, diferenças parciais/integral, isolamento e detalhes paginados; ensaio desktop/mobile com rede externa bloqueada; leitura real somente por agregados; build, db:check, diff e TypeScript comparado à main. Publicação somente após revisão humana ou exceção pontual de Sergio e novo checkpoint.

### Evidências reais em 13/10/2026

| Recorte de faturamento 08/2026 | Itens | Guias | Grupos hospitalares | Sem candidato | Ambíguos | Grupos comparáveis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ipasgo | 2.632 | 272 | 2.447 | 2.447 | 0 | 0 |
| Unimed | 1.284 | 53 | 1.168 | 429 | 739 | 0 |

Os 739 grupos ambíguos Unimed são bloqueados pela regra de repetição de eventos entre arquivos. Isso é indício a investigar, não autorização para eliminar eventos ou escolher um arquivo arbitrariamente. Restringir o mês de pagamento a agosto manteve os mesmos 739 grupos ambíguos. Não foi apagado, corrigido ou deduplicado nenhum demonstrativo.

No recorte Ipasgo, os 4.595 eventos de demonstrativo disponíveis tinham data de pagamento em junho/2026. No Unimed, os eventos disponíveis estavam distribuídos em dezembro/2025 (2.886), maio/2026 (2.861) e agosto/2026 (1.838). O filtro setembro/2026 retorna zero eventos nesses dois recortes; não usar a competência de agosto para presumir pagamento em setembro. São datas atualmente registradas, não validação da competência ou correção dos arquivos importados.

Logo, **o novo visual por si só não produzirá diferenças financeiras confiáveis nesses recortes atuais**. Exibe os candidatos/motivos, preserva ausência como “—” e informa que não há cobertura. Próximo trabalho de dados: identificar os arquivos de retorno corretos e auditar repetição/chaves por guia/TUSS/data, com confirmação das regras antes de qualquer correção ou vínculo. Não inferir pagamento inexistente pela falta de candidato.

Totais e resumo da API antiga conferiram; busca e paginação preservam o comparativo global. O detalhe real de uma guia com 124 grupos foi conferido em páginas, incluindo a última página além do antigo limite de 100.

**Gates:** 91 regressões focadas aprovadas, ensaio sintético Chromium desktop/mobile (incluindo 121 grupos em três páginas), build, `db:check` e diff aprovados; 172 diagnósticos TypeScript históricos idênticos à baseline após normalizar caminhos, zero novos. Auditoria independente sem P0/P1. Gates repetidos após o aviso de cobertura zero, todos aprovados.
