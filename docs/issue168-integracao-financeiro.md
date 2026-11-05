# Issue #168 — Integração hospitalar e Nota Fiscal/Boleto

## Revisão e estado

Base autorizada: `86250df538395bdd0ce2d1ef4a547e04033a56c5`, contendo `efc6399`, a PR #165, a PR #167, Home/BI, `e6152ef`, `2aa143c` e a correção de collation da PR #169. Branch: `fix/issue168-integracao-financeiro`.

Este documento acompanha uma corretiva de código validada em ambiente isolado e preparada para revisão. **Não comprova merge, checkpoint, publicação, homologação com ERP, operação Banco Inter ou entrega SMTP desta corretiva.** A autorização mais recente de Sergio é preparar a PR e apresentar SHA/testes para aceite. A versão publicada passou para a release isolada `318a538`, checkpoint `8d5c48c0`, contendo a PR #170 via PR #172, mas não as alterações da Issue #168.

Nenhuma DDL, migração, mudança de schema, carga, exclusão, reprocessamento, alteração de perfis ou uso de dados reais faz parte desta corretiva. Nenhuma conexão real ao ERP, Inter, SMTP ou storage foi usada nas provas da implementação.

## Conectores e leitura remota

MySQL e SQL Server deixam de interpolar valores no texto SQL. Placeholders numéricos são analisados fora de strings, comentários e identificadores, validados contra os parâmetros, e transformados em binds nativos de `mysql2` e `mssql`. Oracle e PostgreSQL/EasyVision recebem o caminho restrito necessário à busca bancária, sem reutilizar interpolação no novo fluxo.

O caminho de busca remota utiliza os campos reais do Integrador: `queryOrigem`, `conexaoOrigemId` e `tipo`. Configuração e conexão precisam pertencer explicitamente ao hospital autorizado. Uma conexão sem proprietário inequívoco não é usada por fallback global.

A consulta precisa ser um único `SELECT` ou `WITH` de leitura. Escrita, múltiplos statements, comandos administrativos e operações SQL com efeitos colaterais são recusados antes da execução. Binds não autorizam uma consulta perigosa. O caminho restrito exige o modo de leitura implementado pelo adaptador; não degrada silenciosamente para a execução genérica.

Essa validação de código não certifica os grants, TLS, disponibilidade ou desempenho de um ERP real. A ativação futura exige conta remota de privilégio mínimo e ensaio supervisionado no hospital, autorizado separadamente.

## Snapshots da Esteira

A rede é consultada antes da transação local. A resposta deve ter identidade, hospital, convênio, origem e estrutura consistentes. A confirmação local revalida a autorização e o estado da conta sob transação, lock e atualização condicional. Não há `delete(contasConvenioItens)` nem `delete(contasConvenioResumo)` no router da Esteira.

Uma sincronização produz uma nova coleção referenciada pelo resumo da conta. Histórico anterior é preservado. Uma resposta vazia autoritativa pode confirmar uma coleção vazia; falha de rede ou identidade ambígua não equivale a ausência autoritativa e não substitui a coleção vigente.

O resultado do comparador não é inventado: dados incompletos, associação insegura ou falha do comparador continuam pendentes. Auditoria faz parte da confirmação transacional e sua falha impede o sucesso.

A UI transmite a revisão esperada, reutiliza a chave da mesma tentativa e descarta respostas de buscas anteriores após mudança de hospital, número, identidade do formulário ou desmontagem. A navegação bancária utiliza `BANCO_CLIENTE`, hospital, conta da Esteira e referência exata do resumo. Não converte uma conta bancária em origem XML nem mistura versões entre consultas.

O acesso bancário não permite que comandos genéricos de reimportação ou comparação substituam o snapshot versionado. A sincronização/revisão deve ocorrer no fluxo próprio da Esteira.

Os achados finais foram corrigidos e cobertos por regressões comportamentais: a leitura por resumo revalida hospital/setor/origem; convênio global canônico ativo é aceito, mas proprietário alheio é recusado; a competência é proveniente da resposta autoritativa, sem inventar o mês atual. A confirmação transacional revalida a versão e trata o replay como recibo restrito, sem exibir dados de setor não autorizado. Coleção vazia confirmada permanece consultável sem declarar Conforme nem liberar avanço automático. Concorrência foi ensaiada com mocks, não homologada em banco hospitalar real.

## Nota Fiscal: referência imutável e leitura autenticada

Cada anexo novo recebe referência versionada, UUID independente e digest. O PDF é cifrado com AES-256-GCM; o AAD inclui finalidade, hospital, empresa, recebível e revisão. A chave financeira explícita existente é usada com separação de propósito; não há derivação de JWT, nova configuração automática ou gravação de segredo no código.

Sucesso do upload exige storage confirmado e posterior associação transacional. `expectedKey` impede que duas substituições concorrentes da mesma revisão sobrescrevam silenciosamente a referência. Não há fallback de sucesso para disco local depois de falha do storage.

O download ocorre pelo servidor, com autorização por hospital/empresa/recebível, verificação de cifra/integridade, MIME, cabeçalho PDF e limite de tamanho. O cliente recebe o documento autenticado, não uma URL pública de storage.

Referências legadas só são lidas nas formas estritas já reconhecidas, sem basename, symlink, adivinhação de caminhos ou migração automática. O legado remoto plaintext não ganha privacidade histórica por esta PR; não houve reencriptação de documentos reais. Legado incompatível exige reanexo autorizado.

Rollback posterior ao upload pode deixar um objeto cifrado sem referência. Retenção/limpeza de objetos, rotação de chave e migração do legado exigem procedimentos próprios; não houve exclusão ou varredura nesta entrega.

## Emissão de boleto separada da entrega

A emissão usa reserva durável no campo existente `boletoSolicitacaoId`, antes de qualquer chamada externa. Reserva, resultado incerto e protocolo confirmado são estados distintos. A tentativa cobre dados relevantes por fingerprint autenticado e não é liberada por TTL, reinício, nova instância ou retry automático.

O sucesso da emissão só é retornado após a confirmação transacional do protocolo. Upload de NF, download e SMTP não ficam na mesma promessa de emissão. Replay confirmado não chama o banco novamente; tentativa reservada/incerta exige reconciliação humana, sem mutation de limpeza automática nesta PR.

A entrega explícita **Enviar boleto + NF** ocorre depois. Exige protocolo confirmado e NF válida. Falha de leitura/anexo não envia boleto sozinho nem marca entrega. Atualização condicional garante que uma entrega de revisão anterior não marque a NF nova como enviada.

O SMTP manual continua sem outbox exactly-once: uma queda após envio pode deixar confirmação local pendente e uma nova ação humana pode reenviar e-mail, **sem reemitir o boleto**. Não há certificação de SLA ou de entrega real.

**Alteração funcional relevante:** a emissão avulsa sem recebível foi fechada, porque o schema atual não oferece reserva durável para esse caminho. O operador deve usar Contas a Receber. Isso não preserva literalmente agenda/pagador avulso personalizado; reabrir esse fluxo exige desenho específico e autorização. Cancelamento não certifica estado bancário atual; reconciliação operacional permanece necessária.

## Validação e limites

Provas realizadas em ambiente com variáveis mínimas, `DATABASE_URL` vazia, identidades/chaves fictícias e mocks/fixtures. Rede externa bloqueada; somente HTTP efêmero de fixtures em loopback permitido. Resultados finais da árvore de código:

- **1.870 testes Vitest aprovados em 72 arquivos**, incluindo regressões anteriores e os novos contratos de segurança/UI.
- **165 testes Node aprovados**.
- Fixtures externas corrigidas de integração: **66/66**; Financeiro/NF: **29/29**, sem chamadas reais.
- Build, `db:check`, `git diff --check` e zero delta em `drizzle/`/`scripts/migrations/` aprovados.
- TypeScript da base exata `86250df`: **163 diagnósticos**; árvore corrigida: **157**, **zero novos** e seis removidos. `tsc --noEmit` global continua falhando; não está aprovado.
- Auditoria independente Financeiro/NF: sem novo bloqueante crítico/alto concreto. Os achados backend foram corrigidos e as respectivas regressões/fixtures passaram.

Antes de merge/publicação desta corretiva, apresentar a PR e o SHA exatos para aceite de Sergio, conferir eventual avanço da main e revalidar o resultado de integração. Testes simulados de concorrência não equivalem a homologação física em TiDB/ERP. Não se afirma operação funcional real de integração hospitalar, Inter ou SMTP.

## PR #170 e exportação de lotes

Durante a janela, a main avançou para `5be1069`, merge da PR #170 (`1f88f1e`) de compatibilidade TiDB. Esse avanço está **fora da base autorizada `86250df`** e não foi incorporado automaticamente à corretiva.

A release isolada publicada `318a538`, checkpoint `8d5c48c0`, incorporou a PR #170 por autorização própria. Sua exportação pública foi confirmada em 05/11/2026 às 20:00 BRT: HTTP 200 e 272 recursos do lote autorizado; o Excel foi validado apenas em memória, sem salvar/divulgar dados ou mudar o lote. Essa implantação não incluiu a corretiva #168. A integração posterior da PR desta corretiva com a main deve preservar o patch TiDB já integrado, sem revertê-lo.
