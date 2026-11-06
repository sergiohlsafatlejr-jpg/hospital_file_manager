# Issue #174 — Busca Conta, honorários vigentes e Painel TV

**Preparação:** 06/11/2026. **Base exata:** `a05872bc0bc16dfb4f6ac53304242bdc37aeb0ac`. **Branch:** `fix/issue174-identidade-honorarios-tv`. Esta corretiva preserva `3576b32`, `2c6e47d`, `a05872b` e todas as entregas de `89c5c81`. A revisão será sincronizada por PR no repositório oficial. Sergio continua sendo o único aprovador obrigatório.

Esta entrega é **código e testes para aceite**, não merge, homologação em ERP, checkpoint ou publicação. O WebDev foi preservado no checkpoint `9094484c`. Nenhuma DDL/migração, dado real, conexão ERP, SMTP, Banco Inter, importação/reprocessamento ou configuração de segredo foi executada.

## 1. Busca Conta — B1, B2 e B3

A consulta configurada em `queryOrigem` é preservada integralmente. O código não substitui queries por um template heurístico, nem escolhe uma conta por `MAX`, primeira linha ou substring. A conexão continua obrigatoriamente ativa, completa e proprietária do hospital autorizado. A validação lexical e dos binds no dialeto ocorre antes de conectar; os parâmetros seguem separados da SQL para os binds nativos já existentes.

O identificador informado pode corresponder à **conta hospitalar real** ou ao **atendimento** retornado. Busca por atendimento só é aceita se resultar em uma conta real única; o número dessa conta permanece no cabeçalho, coleção e itens. Múltiplas contas, colisões ou aliases conflitantes geram bloqueio, não renumeração ou soma de contas diferentes. Guia isolada não se torna outro modo de busca.

Campos opcionais ausentes não são tratados como divergência. Um valor presente unívoco pode enriquecer as demais linhas. Valores explícitos conflitantes de atendimento, carteira, competência, datas, guia, paciente, tipo ou convênio são recusados antes da persistência. Datas presentes inválidas não viram ausência. Conta, paciente e evidência de convênio são exigidos por linha.

Convênio é resolvido por código/ANS exato ou, na ausência desses identificadores, por nome canônico completo com normalização de caixa, acentos e espaços. Cadastro ativo global (`estabelecimentoId = NULL`) ou do hospital é elegível; cadastro inativo ou proprietário de outro hospital é negado. Identificador explícito incorreto nunca faz fallback pelo nome. Mais de um candidato é ambiguidade. Equivalências específicas do ERP devem ser expressas na query revisada, não inferidas por substring ou pontuação.

**Uso e limites:** a query precisa projetar conta e atendimento reais em aliases distintos. Não há como reconstruir uma identidade apagada pela própria projeção SQL. Não foram lidas nem executadas queries persistidas reais Urológico/Tasy/EasyVision. A allowlist conservadora permanece; compatibilidade real exige validação própria com conexão e grants somente leitura. O preview existente consulta cadastro pelo identificador informado antes de resolver a origem: ao buscar por atendimento pode não mostrar uma conta já cadastrada pelo número de conta, embora retorne corretamente a identidade real; não há renumeração na gravação.

## 2. Honorários — H1, H2 e H3

A composição usa somente os blocos de uma **revisão completa vigente**, agrupados pela referência hospitalar canônica efetivamente encontrada. A identidade abrange guias de prestador/operadora, beneficiário, datas, scope e snapshot; referências distintas não são fundidas apenas por compartilharem uma tupla ou identificador médico.

A revisão registra, no JSON existente de procedimentos, um envelope privado com procedimentos sanitizados e manifesto de hashes/contagens de todos os blocos/identidades. **Não há coluna nova.** O DTO público permanece sem esse manifesto privado e sem XML, carteira ou valores financeiros. Fontes/contextos/eventos mantêm os IDs reais e hashes da composição utilizada, em vez de um ID recente representando uma união histórica.

Envelope inválido, composição parcial, identidade removida ou hash divergente fecha a leitura sem recuperar a revisão antiga. Repetir a revisão vigente é idempotente; replay de hash histórico não atualiza lote/snapshot de fonte antiga nem a repromove silenciosamente. Mudança da fonte, snapshot ou gabarito exige nova revisão humana e pode bloquear a confirmação com `CONCORRENCIA`.

Enriquecer um profissional não cria uma execução adicional. O matching considera todas as ocorrências exatas antes de enriquecer posições. A/B/B mantém duas ocorrências; repetições internas legítimas e registros sem sequencial permanecem. A ordenação por código, sem collation local, mantém hashes independentes da ordem inclusive em nomes Unicode NFC/NFD com bytes diferentes.

**Compatibilidade e limites:** arrays legados não são recombinados. Uma única guia legada conserva a última linha; múltiplas guias legadas/misturas sem revisão distinguível falham fechado e exigem reindexação por fluxo autorizado, não reparo automático. Arquivo sem guias é recusado; esta PR não implementa publicação vazia/tombstone para revogação total. A publicação de várias identidades continua sequencial; manifesto incompleto bloqueia leitura, mas não há atomicidade entre scopes distintos. A revalidação antes do CAS não comprova snapshot transacional único de fontes/itens. Foram usados mocks, não homologação física de concorrência em banco.

## 3. Painel TV e alertas

A TV compartilha **hospital e competência dos relatórios**, com recorte pela data de recebimento Safatle. Filtros operacionais de convênio não contaminam esse recorte. Troca de scope, placeholder, loading/refetch, erro ou perda de permissão oculta dados antigos; ausência de relatório produz `Indisponível`, não produção inferida.

Zero mensal, total conhecido e produção individual zero são preservados. Na distribuição de contas, valor final zero não é substituído pelo inicial; o inicial só é usado quando final é ausente. O resumo mostra seu agregado autoritativo, sem recalcular por uma página de contas.

A interface separa explicitamente:

- **Total do scope:** indicadores do resumo e produção mensal dos endpoints existentes.
- **AMOSTRA da TV:** distribuição por convênio e alertas da página 1, limite 500, com quantidade amostrada e total da listagem separados.
- **AMOSTRA operacional:** filtros rápidos e cards de prazos da página 1, limite 100. O rótulo é “Todas da Amostra”, não todas as contas do setor.

Essa distinção não introduz agregação completa de alertas. Resumo e listagem não são um snapshot transacional comum; podem divergir durante atualização concorrente. Os agregados SQL preexistentes não foram alterados: alguns ainda escolhem valor inicial quando final não é positivo. A correção de zero desta PR vale para os zeros recebidos autoritativamente e o cálculo frontend da amostra, não redefine a política financeira desses agregados legados.

Calendário civil é validado sem normalização silenciosa de dias impossíveis, relógio ou offset inválidos. Timestamp válido conserva seu instante; alta mantém compatibilidade civil com serialização legada à meia-noite UTC. Ausência de data válida não significa “No prazo”. Foram preservados preventivos de 20 dias/48 horas e os contratos críticos **>25 dias** e **>60 horas inteiras**; exatamente 25 dias ou 60h59m ainda não dispara crítico de 61 horas. Setores/estados posteriores não recebem alerta indevido de faturamento ou entrega.

Fullscreen, três visões, rotação de 20s e atualização de 30s foram preservados e inspecionados somente numa fixture fictícia com POST/PUT/PATCH/DELETE recusados por HTTP 403. A captura não comprova implantação.

## 4. Validação final

| Verificação | Resultado efetivo |
|---|---|
| Vitest consolidado | **2.094 testes aprovados, 81 arquivos** |
| Testes Node existentes 0145 | **165 aprovados**; não executam migração real |
| Build | **Aprovado** |
| `pnpm db:check` | **Aprovado**, URL sintética; não aplica SQL |
| `git diff --check` | **Aprovado** |
| Delta de `drizzle/` e `scripts/migrations/` | **Zero** |
| `tsc --noEmit --incremental false` | **Falha com os mesmos 157 diagnósticos da base; zero novos e zero removidos** |
| `sql-audit` corrigida | **40/40 cenários**, exit 0 |
| `honorarios-audit` corrigida | **Duas suítes aprovadas**, incluindo controles de parser/baseline |
| `tv-audit` corrigida | **8/8 contratos externos aprovados** |
| Provas independentes de honorários | **Aprovadas**, incluindo Unicode corrigido, multiplicidade, evidência e revisão parcial |

A auditoria independente não encontrou bloqueio crítico/alto na composição válida não vazia. Seu achado médio de ordem Unicode foi reproduzido, corrigido e coberto por regressão versionada e reprodução externa. Os demais limites acima não são descritos como homologação real.

A bateria não herda segredos/conexões do Portal: `DATABASE_URL` vazia, identificadores OAuth/JWT fictícios, Node **22.23.4 LTS**, `TZ=America/Sao_Paulo`. O guard de rede bloqueia destinos externos e portas reais de banco/Portal; permite apenas HTTP loopback efêmero das fixtures. As evidências originais de `release-a05872b/sql-audit`, `honorarios-audit` e `tv-audit` foram preservadas; as suítes corrigidas exigem proteção segura, não a existência dos bugs originais.

Evidências da execução permanecem sob `/home/ubuntu/reports/issue174/`; a seleção/logs/resultados consolidados usam `/tmp/issue174-final-*`. Os testes comportamentais de regressão da corretiva ficam versionados no repositório. Não se declara `tsc` global aprovado.

## 5. Gate de aceite

Após a PR ser sincronizada, apresentar seu SHA exato a Sergio. **Não mesclar, reiniciar o WebDev, gerar checkpoint nem publicar esta corretiva antes do novo aceite.** Um futuro merge deve revalidar a main resultante e sua composição; atualização/restart exige nova checagem autorizada da janela de filas. Aprovação de código não autoriza importar/reindexar XML real, sincronizar ERP, escrever dados, mudar permissões, configurar chaves ou executar SMTP/Inter.
