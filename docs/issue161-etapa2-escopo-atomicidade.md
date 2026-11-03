# Etapa 2 — corretiva da Issue #161

## Escopo e estado

Corretiva preparada na branch `fix/issue161-etapa2-escopo-atomicidade`, sobre `7edcd2f`, por autorização de Sergio em 03/11/2026. Preserva as quatro melhorias de `9c5c839`: Esteira Ambulatorial, painel da Esteira na Home, auditoria de preços em Conta Convênio e correção de datas/fuso. Preserva também as PRs #158, #159 e #160.

Este documento descreve código e testes de preparação. Não comprova implantação. Não houve merge desta corretiva, checkpoint de produção, reinício, importação, envio a operadora, alteração de perfis ou execução de banco nesta etapa. A produção permanece na Etapa 1, checkpoint `6fb42f12`. A migração 0145 já aplicada não deve ser reexecutada.

## Correções

| Frente | Garantia |
| --- | --- |
| Home | Painel, totais, valores, destaques e distribuição respeitam hospitais autorizados e setores do perfil persistido. Gestão da Central não amplia o perfil operacional; indisponibilidade de autorização falha fechada. |
| Auditoria de itens | Marcar/desmarcar itens exige permissão de edição do hospital proprietário. Seleções misturando contas, convênios ou snapshots são recusadas antes de escrever. |
| Ajustes manuais | A transação usa os IDs retornados pelos próprios INSERTs, sem consulta global ao último registro. Falhas revertem ajuste, item, resumo e aprendizado. Adição manual pode usar um item-âncora do snapshot exibido; o servidor deriva e valida a tupla completa. Sem âncora, apenas um resumo inequivocamente único é aceito. |
| Conexão transacional | Autorizações persistidas e ownership do convênio usam a mesma conexão da transação, sem reentrar na pool global ou fazer fallback após uma falha. O papel administrador continua sendo conferido no registro persistido do usuário. |
| Lotes ambulatoriais | Hospital, convênio canônico, guia, lote, competência, XML e resumo integram a identidade. Tipo ambulatorial, estado e setor são verificados para todas as contas pertinentes. Atualização concorrente ou seleção incompleta gera conflito e rollback. |
| Revisão humana | O modal captura XML final, resumo e versão de atualização de cada guia ao ser aberto. A confirmação envia essa cópia. Reimportação que muda uma versão bloqueia a decisão antiga antes de corrigir erros ou avançar qualquer conta do lote. |
| Preços e regras | Seleção por data real de cada item, hospital/global, vigência e desempate determinístico. Convênio por ID ou nome exato normalizado e unívoco; nunca substring ou primeiro candidato arbitrário. Falha de dependência não equivale a conformidade. |
| Datas XML | Data de execução ausente/inválida permanece ausente, sem herdar outra guia, item ou data da importação. O parser real rejeita rollover de calendário, inclusive dias inexistentes e ano não bissexto. Data válida continua preservada; data civil sem horário mantém a proteção de fuso existente. |
| Limites de identidade | Guia/lote têm validação explícita de 1 a 20 caracteres antes da persistência. Lote automático mantém aleatoriedade e cabe no limite físico existente, sem DDL. |

## Regressões e evidências

A seleção de testes é executada em worktree isolada, com banco e credenciais de produção indisponíveis no processo, dependências externas simuladas e segredo de autenticação exclusivamente fictício. `db:check` usa URL fictícia inacessível somente para satisfazer o contrato da configuração; não executa DDL nem consulta o banco do Portal.

As regressões incluem leitura e escrita negadas, Central sem ampliação indevida, lote misto, snapshots distintos, conflito de UPDATE, rollback de núcleo, INSERT ID concorrente, dez transações simultâneas com I/O sintético e sentinela contra pool global, mudança X→Y entre abertura e confirmação do modal, preços históricos com de-para real, XML bruto com parser real e calendário impossível, ano bissexto válido, datas por item e limite de lote automático.

A revisão técnica independente identificou os pontos residuais de conexão, consentimento e data; foram fechados com implementação e regressões específicas. Não é aprovação humana nem homologação do banco de produção. O resultado definitivo de testes/build/Drizzle/tipos será registrado na descrição da PR e na Issue #161.

A prévia visual usa apenas o build estático e uma API fictícia. Todas as mutações HTTP são bloqueadas. É uma conferência de interface, não uma prova de autorização real ou de envio a operadora. A imagem de revisão mostra unidade/convênio fictícios e somente dois setores simulados.

## Release e coordenação

Durante a preparação, a main avançou para `b6c8cf8`, com uma entrega independente de Recebimentos Excel em quatro arquivos. Ela não foi incorporada à branch desta corretiva nem validada para publicação neste escopo. A PR deve apresentar a revisão exata sobre `7edcd2f`; não publicar automaticamente a main inteira ao mesclá-la. O aceite de Sergio deve definir a release contendo apenas a Etapa 2 e esta corretiva, mantendo o commit concorrente fora do deploy até sua revisão específica.

Nenhum schema, SQL, snapshot, journal ou script de migração foi modificado. Não se aplicam 0143, 0145 ou qualquer migrador geral neste fluxo.

## Limites e liberação futura

- Os testes transacionais simulam I/O; não equivalem a homologação em TiDB ou validação de dados reais.
- Não foram reconciliados ou reprocessados lotes antigos, nem modificados perfis, preços, contratos, valores ou contas em produção.
- Uma tentativa que falha após gravar no storage pode deixar objeto protegido sem referência, conforme limite anterior; este trabalho não autoriza limpeza retroativa.
- O avanço de setor e o registro de canal/protocolo no Portal não comprovam, por si sós, entrega real à operadora. Execução RPA, envio, boletos e uso de credenciais continuam dependendo do escopo e da configuração autorizados.
- O TypeScript global deve ser apresentado como dívida técnica se ainda falhar; comparação com baseline não é aprovação do type-check.

Após o aceite da revisão: mesclar somente a PR aprovada, preservar a árvore da release isolada, revalidar, conferir configuração e contagens de filas ativas, gerar checkpoint, reiniciar/publicar se seguro e comprovar a versão pública. A autorização não deve ser estendida a commits concorrentes, migrações ou dados.

## Resultado definitivo — 03/11/2026

| Verificação | Resultado |
| --- | --- |
| Vitest isolado | 901 testes aprovados em 42 arquivos |
| Node test runner (procedimentos anteriores preservados) | 165 testes aprovados |
| Build de produção | Aprovado |
| Drizzle `db:check` | Aprovado; somente verificação local |
| Diff / whitespace | Aprovado |
| Delta de schema, SQL, snapshots, journal e scripts de migração | Zero |
| TypeScript `tsc --noEmit` | Falha global com os mesmos 180 diagnósticos da base `7edcd2f`; zero diagnósticos novos ou removidos nesta corretiva |

O ensaio específico em `America/Sao_Paulo` com XML bruto e parser real também passou. Ele comprova que calendário impossível chega sem data ao importador, o comparador real retorna `incompleta` e a transação não publica a guia; ano bissexto válido continua aceito. O teste de ligação do ajuste e a guarda contra reentrada na pool usam concorrência sintética, não dados reais.

A imagem privada de prévia foi preservada fora do Git em `/home/ubuntu/reports/issue161/previa-esteira-ambulatorial-ficticia.webp`. Não contém paciente, guia, valor individual, documento ou credencial de produção.
