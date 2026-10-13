# Fonte Banco no visual original da Conciliação Cruzada

## Decisão de Sergio em 13/10/2026

Sergio rejeitou o layout inicial da PR #71 e pediu para seguir a Conciliação Cruzada existente, mais limpa e prática. Esta revisão substitui a proposta visual anterior: não é uma terceira tela nem uma nova página de piloto.

## O que permanece igual

- Mesma rota e página principal, cabeçalho, filtros fixos e área rolável.
- Botão **Buscar dados do banco** ao lado de **Popular Dados**.
- Mesma tabela de guias, com a sequência **Guia, Paciente, Comp., Lote, Protocolo, Itens, Faturado, Recebido, Glosado, Acréscimo, Status, Pendentes/Desassociados e Detalhes**.
- Cores e alinhamento da tabela existente. O componente da tabela é compartilhado pelas duas fontes, não duas aproximações visuais diferentes.
- Clique na guia ou no olho abre os itens dentro da mesma tela, com **Voltar às guias**, sem o modal alternativo proposto antes.

Os cartões adicionais e os blocos explicativos extensos foram retirados da listagem. Os motivos ficam nos detalhes dos itens; a fonte e a condição de revisão são identificadas de forma compacta.

## Fonte e ações

**Base atual** mantém os dados, vínculos, funções e estados da conciliação já existente. **Banco** consulta somente o faturado do snapshot Hop publicado e procura candidatos nos demonstrativos processados. Ao alternar para Banco, a página usa as opções e consultas próprias dessa fonte; consultas legadas são desativadas e os modais de gravação não são montados.

Popular Dados, Conciliar Automaticamente e Resetar ficam visíveis no mesmo cabeçalho, mas indisponíveis enquanto a fonte Banco continuar em leitura. Não se aciona uma ação da base XML sobre um recorte Banco. O botão Base atual retorna ao fluxo persistido e aos filtros anteriores do estabelecimento.

**Esta mudança de visual não habilita a gravação de conciliação Banco.** Para executar a mesma conciliação persistida com essa origem, ainda é preciso implementar o adaptador e o fluxo de vínculo seguros em entrega separada. Não houve autorização nesta revisão para corrigir demonstrativos, excluir eventos ou gravar vínculos.

## Campos e filtros

Competência é o mês do faturado. Data Pagamento permite todas as datas ou a escolha de mês de pagamento. Um mês escolhido precisa ser informado, sem transformar competência em pagamento. Convênio e estabelecimento continuam obrigatórios no recorte Banco.

Status usa os estados reais de revisão da fonte Banco: candidato, ambíguo, sem candidato, médico direto, dados incompletos e situação mista. Não se apresenta “Conciliado” verde para uma correspondência ainda não confirmada.

Lote XML não se aplica ao faturado Banco; lote do retorno e prestador ainda não possuem filtros no contrato desse comparador. Permanecem na posição visual original, mas desativados e identificados, em vez de fingir que filtram. Busca Banco pesquisa guia/conta/TUSS; busca da base atual conserva paciente.

Quando paciente, lote ou protocolo não estão disponíveis no contrato publicado do Banco, mostra “—”. Não se pega nome de paciente de outra fonte, não se inventa lote/protocolo e não se soma recebido do Hop. A tabela tem o mesmo visual, mas não falseia os fatos.

## Valores e detalhes

Recebido e Glosado, no modo Banco, são **valores candidatos para revisão**, identificados como tal; não vínculos confirmados. Cobertura parcial fica em indicação compacta ou detalhe. Valores ausentes são “—”, não zero. A diferença é exposta apenas para candidato exclusivo com data de item coincidente e valores conhecidos; acréscimo só quando a diferença integral é negativa.

Os itens são paginados em 50 grupos e todos ficam disponíveis. Médico direto é separado da pendência hospitalar. Abertura por conta/guias literais protege contra troca de posição visual após republicação. Não há rateio arbitrário ou soma de ambiguidades.

## Dados verificados anteriormente nesta PR

A leitura de agosto/2026 encontrou Ipasgo com 2.447 grupos hospitalares sem candidato e Unimed com 429 sem candidato e 739 ambíguos por repetição entre arquivos. Selecionar somente agosto no pagamento Unimed não eliminou essas ambiguidades. Esses bloqueios continuam; mudar a apresentação não cria diferenças confiáveis artificialmente.

O diagnóstico técnico e as regras do comparador estão em `docs/hup-comparativo-guia-item.md`; o layout descrito na versão inicial desse documento foi substituído por esta revisão visual. Arquivos de origem e repetições precisam de investigação separada antes de correção ou vínculo.

## Validação e liberação

Testes do comparador e dos contratos de fonte, regressões de isolamento da página, ensaio da página real com mocks inteiramente sintéticos e rede externa bloqueada, desktop/mobile, build, db:check e TypeScript comparado à baseline. Resultados finais são registrados na PR da revisão exata.

Sem schema, migração ou dados alterados. PR #71 permanece para revisão funcional; ainda sem merge, checkpoint novo ou publicação desta revisão.

### Evidências desta revisão visual

- 90 testes focados: comparador, guias, serviço, permissões, apresentação e isolamento da página.
- Ensaio da página principal real com dados sintéticos e rede externa bloqueada: mesmo nó de cabeçalho ao trocar fonte, mesmas colunas, nenhuma mutation, consultas legadas desativadas, filtros automáticos, mês explícito, retorno à base e restauração do filtro anterior.
- Detalhes inline e navegação até os 121 grupos de uma guia sintética (50/50/21), sem truncar os itens.
- Desktop e mobile sem erro de execução e sem estouro de largura da página.
- Auditoria independente: sem P0/P1. Os dois apontamentos de acabamento foram corrigidos: teste de cabeçalho tolerante à formatação JSX e tooltip de médico direto indicando valor candidato não confirmado.

- Build, db:check e git diff --check aprovados na revisão final.
- TypeScript: mesmos 172 diagnósticos e mesmas mensagens da baseline limpa após normalizar caminhos; nenhum diagnóstico novo.
