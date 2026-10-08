# Atendimentos: quantidade sem valores e saída considerada Warleine

| Identificação | Informação |
| --- | --- |
| Data | 08/10/2026 |
| Responsável | Manus |
| Branch | `fix/atendimentos-sem-valor-saida-warleine` |
| Base validada | GitHub `main`, commit `8b3eb5f` |
| Pull Request | [#63](https://github.com/sergiohlsafatlejr-jpg/safatle-sistema/pull/63) |
| Banco | Nenhuma alteração estrutural ou de dados nesta entrega |

## O que muda

### 1. Painéis por quantidade quando não há valores

A tela `/atendimentos` mantém cinco painéis: mês de entrada, etapa, convênio, setor e permanência. Eles continuam filtrando a mesma tabela por paciente, sem criar outra aba ou outra fonte de atendimentos.

A métrica é escolhida automaticamente para o estabelecimento e os filtros selecionados:

| Situação do recorte | Métrica dos painéis |
| --- | --- |
| Nenhum `valorConta` informado: `COUNT(valorConta) = 0` | Quantidade de contas |
| Pelo menos um valor informado, inclusive zero | Valor das contas, com quantidade complementar |
| Sem contas no recorte | Estado vazio; nenhum valor é inventado |

A escolha usa contagem de valores informados, não a soma. Portanto, valores zero ou valores que se compensam não são confundidos com ausência de informação. Em quantidade, rótulos, barras e ordenação dos agrupamentos usam o número de contas.

O clique em uma barra adiciona o filtro correspondente. Um novo clique na mesma barra remove esse filtro; filtros de painéis diferentes podem ser combinados. A tabela e os agrupamentos reutilizam o mesmo recorte. As regras existentes de acesso por estabelecimento e módulo, de contas com título e de seleção da unidade não são ampliadas nesta entrega.

### 2. Saída considerada para Warleine

A regra vale somente quando:

1. A origem normalizada é `warleine`.
2. A categoria canônica é exame ou ambulatório, incluindo a descrição ambulatoria normalizada.
3. Não existe data de saída real.
4. Existe data de entrada.

Nessas condições, a entrada é utilizada como **saída efetiva para apresentação e cálculo de dias parados**. Os dias são contados dessa referência até a data atual da consulta; não representam duração de internação.

A data clínica original `data_saida` permanece nula. A API acrescenta `dataSaidaEfetiva` e `dataSaidaInferida`, sem UPDATE ou persistência. Quando houver saída real, ela prevalece. Internações e outras origens não recebem a inferência.

A tabela identifica a data com “(considerada)”. PDF e Excel apresentam “Saída considerada na entrada”, evitando que a inferência seja confundida com alta informada pela fonte.

### 3. Consistência dos dias TASY

A auditoria encontrou e corrigiu uma divergência: a lista recalculava dias TASY por horas no Node, mas filtros e ordenação utilizavam dias civis no SQL.

A listagem agora seleciona a expressão SQL como `diasParadoCalculado` e retorna somente `diasParado` numérico. O alias técnico não é incluído na resposta dos itens. A mesma expressão é usada na ordenação. Para TASY, dias e faixas usam `DATEDIFF(CURDATE(), COALESCE(dtEntrega, dtEtapa))`, com normalização de caixa e espaços na origem. Para Warleine, usam a saída efetiva, quando aplicável.

## Validações concluídas

| Verificação | Resultado |
| --- | --- |
| Vitest: helpers de dias, painéis, regressões estruturais de UI e autorização | 4 arquivos; 33 testes aprovados |
| Ensaio SQL somente leitura, com relógio fixo e dados sintéticos | 12 casos aprovados, incluindo limites das faixas e referências nulas |
| `pnpm build` | Aprovado |
| `pnpm db:check` | Aprovado; verifica histórico local, não aplica migração |
| `git diff --check` | Aprovado |
| Auditoria técnica independente focal | Sem P0/P1 bloqueantes; inconsistência de dias corrigida |
| `pnpm check` | Continua falhando com 172 erros preexistentes |
| Comparação de tipagem com worktree limpo da mesma `main`, nas mesmas dependências | 172 no baseline e 172 na branch; zero novos e zero removidos após normalização de posições |

Os testes de autorização exercitam o middleware com contextos e permissões simulados; as regressões de UI incluem verificações estruturais. Eles não substituem uma homologação com login e banco separados. O ensaio SQL não consultou tabelas de pacientes e não executou escrita. Não houve teste de carga nem validação desta nova versão em produção.

## Ressalvas fora do escopo

- Alguns filtros históricos de origem/situação ainda comparam literalmente `tasy` e `tasy_hemolabor`. A expressão de dias e a serialização da listagem foram normalizadas; esses filtros legados não foram ampliados.
- Para EASYVISION e demais origens não TASY/não Warleine, a permanência mantém a referência histórica em entrega/etapa, enquanto a coluna Dias usa a saída. Essa diferença preexistente não foi redesenhada.
- Rotinas históricas de cálculo fora de `listarPaginado` não foram alteradas.
- Nenhuma atualização periódica do BI é ativada por esta PR.

## Separação da entrega IAD

A criação dos layouts IAD pertence exclusivamente à **PR #61** e à migração reservada **0134**. Esta branch não contém schema, SQL, snapshot, journal ou publicador IAD. Nenhuma promoção de dados entre unidades é realizada.

## Publicação

Esta entrega é preparada em branch e Pull Request, sem push direto em `main`. O merge exige revisão de outra pessoa ou exceção pontual e explícita de Sergio para esta PR. A autorização da PR #60 não se estende a esta mudança.

Depois da liberação, sincronizar somente a versão aprovada e conferir o checkpoint. **Salvar checkpoint não comprova deploy.** Validar a versão publicada antes de afirmar que os novos painéis e a saída considerada estão em produção.

Esta PR não requer migração, DDL, DML, carga ou atualização dos atendimentos. A implantação da 0134 permanece uma janela separada e coordenada de banco e código.
