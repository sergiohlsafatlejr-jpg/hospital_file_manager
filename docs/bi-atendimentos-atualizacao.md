# BI de atendimentos — atualização pela base unificada

## Fonte e funcionamento

`/bi-atendimentos` consulta diretamente `atendimentos_unificados` pelo serviço `getAtendimentosBiDashboard`. Não precisa copiar contas para outra tabela, importar o CSV de novo, nem agendar uma carga adicional. Inserções e alterações **já confirmadas no destino** são consideradas na próxima consulta do painel.

Esta entrega mantém o backend e seus critérios atuais; altera apenas a atualização da consulta no frontend:

- Reconsultar ao abrir o painel, retornar à aba e reconectar a rede.
- Enquanto a tela estiver visível, consultar novamente a cada 60 segundos. Não executar polling em segundo plano.
- Manter o botão **Atualizar** para consulta imediata.
- Exibir o horário da última consulta concluída (não a data da última importação).
- Limpar filtros ao mudar de estabelecimento, sem reutilizar o estado da unidade anterior.
- Preservar filtros selecionados durante as atualizações da mesma unidade.

## Recorte e permissões

O BI exige um estabelecimento específico e a permissão individual `relAtendimentos`. Continua retornando apenas agrupamentos, sem identificadores de pacientes ou contas. Usa registros ativos e sem título, exclui Particular-Tasy e o fluxo A_FATURAR, conforme sua metodologia atual.

Os gráficos podem divergir de uma listagem quando filtros diferentes estiverem selecionados. O BI possui filtro de **mês de entrada**, enquanto a tela de atendimentos pode usar **competência** com fallback na entrada. Esses significados não são alterados nesta entrega. A regra global do BI de excluir títulos também é mantida; na listagem, a regra de pendência por título é específica das origens Tasy.

## Verificação e liberação

Em 08/10/2026, os endpoints reais do Portal para Hemolabor, sem filtros adicionais, responderam HTTP 200 com **121.579** registros nos dois recortes. Só foram consultados agregados; nenhum dado foi alterado.

Testes cobrem política de atualização, vínculo estrutural da consulta aos filtros por unidade, ausência de cache no serviço, isolamento e autorização. As guardas estruturais não substituem teste E2E de troca de unidade/foco. Não há ambiente de preview por PR isolado já configurado; não prometer um link de homologação independente.

Sem DDL, migração, UPDATE ou INSERT. A melhoria de atualização automática precisa de revisão do PR, merge e deploy do código; a fonte atual do BI já reflete a carga anterior ao usar **Atualizar**.
