# Issue #163 — Corretiva da Etapa 3

## Estado e escopo

Base autorizada: `1c386e2968fec7a69b9db91e357bd2a1035d117d`. Branch: `fix/issue163-etapa3-startup-glosas`. Esta entrega preserva os commits de Recebimentos Excel (`b6c8cf8`) e glosas manuais/FUSEX/fisioterapia (`ee1f357`), além das corretivas anteriores das Etapas 1 e 2. A revisão exata apresentada para aprovação será a ponta desta branch na PR.

A autorização atual é preparar, testar e apresentar a corretiva. **Não inclui merge, checkpoint da Etapa 3, publicação, migração, alteração de dados reais ou ativação operacional.** A cópia WebDev foi preservada na Etapa 2, checkpoint `ed8ccde6`.

## Inicialização sem reparos ou replay novos

O entrypoint não cria `process_logs`, não globaliza cadastros de convênio, não limpa logs, não deriva/sobrescreve `JWT_SECRET` e não executa o replay/reprocessamento global introduzido pela Etapa 3. Os inicializadores preexistentes de scheduler e workers foram preservados; esta revisão não redesenha suas rotinas.

O despacho interno continua exigindo segredo explícito e infraestrutura já provisionada, com falha fechada nas precondições. Ausência de configuração não é corrigida com DDL ou segredo previsível. A regressão de startup inspeciona o AST sem importar/executar o entrypoint. Ela não equivale a uma auditoria integral dos efeitos transitivos de todos os módulos legados.

## Lançamento manual com isolamento e atomicidade

A mutation exige escrita no hospital. O serviço relê hospital ativo, usuário/papel, visualizar/editar e módulos de demonstrativo e recursos dentro da transação, sob locks, antes de gravar. O convênio deve ser canônico, existente, ativo e selecionado explicitamente por ID: proprietário exatamente `NULL` (cadastro global compartilhado já previsto no Portal) ou o hospital atual. Proprietário definido de outro hospital é negado, inclusive para admin; não existe fallback por nome nem alteração cadastral.

A transação grava uma âncora persistente de metadados, um demonstrativo por item e, quando houver glosa positiva com justificativa, um recurso ligado ao ID exato do demonstrativo. Falhas cancelam o conjunto. Não se chama o sincronizador legado por guia e não se fundem procedimentos repetidos legítimos: código/data/sequencial identificam o item. Datas impossíveis, limites físicos, precisão decimal e coerência dos valores são validados antes da gravação.

O registro em `arquivos` é **metadado real de origem manual**, não um documento inventado. Não há blob, upload, objeto de storage, URL ou arquivo físico fictício. A interface mostra “Lançamento manual” e “Sem arquivo original”, sem expor os hashes internos. Exclusão, reprocessamento, substituição e processamento/download documentais genéricos recusam essa origem antes de alterar dados/status, despachar ou baixar conteúdo. Esse bloqueio inclui usuários admin nas rotas genéricas suportadas; não é proteção contra SQL externo ou remoção administrativa fora da aplicação.

## Idempotência e resposta incerta

A mesma chave e o mesmo payload retornam o resultado original sem nova escrita; conteúdo diferente com a mesma chave gera conflito. A serialização usa uma linha real do hospital, sem depender de gap lock, índice novo ou `GET_LOCK`.

Antes de enviar, a interface persiste e relê somente `{version, estado, uuid}` em `sessionStorage`, separado por usuário/hospital. **Paciente, guia, itens, valores, payload e hash hospitalar não são persistidos no navegador por este controle.** O payload da tentativa permanece somente em memória enquanto o componente está montado.

Falha HTTP não comprova rollback. A tentativa preserva o UUID após erro, edição ou recarregamento. A consulta de reconciliação é autenticada, somente leitura, sob o mesmo lock hospitalar, e retorna apenas status, quantidade e data/competência. Ausência ou erro de consulta nunca libera uma nova chave: a chamada original pode concluir depois. Após recarregar, é possível retomar explicitamente os dados originais com a mesma UUID; divergência é decidida pelo hash de payload no servidor, não por heurística da interface.

Somente um resultado confirmado permite limpar todos os campos/itens e descartar a tentativa. Storage indisponível/adulterado bloqueia o envio. A proteção de retomada cobre a sessão da aba: fechar/limpar a sessão, outro navegador ou um novo lançamento intencional não constituem deduplicação financeira global. Não se deve contornar uma tentativa incerta apagando manualmente seu controle; solicitar revisão responsável.

## Consultas, vínculos e exportação

Os joins priorizam IDs exatos, verificam hospital/convênio e não recorrem ao fallback quando um ID explícito é inválido. Fallback legado só enriquece quando existe um único candidato elegível; ambiguidade não escolhe arbitrariamente um snapshot. Não se usa `DISTINCT` ou `LIMIT 1` para esconder multiplicação de valores.

O alias `fu.lotePrestador AS lote` usa a coluna física correta e preserva o DTO. Busca/exportação usam SQL parametrizado. A regressão de deduplicação afirma SQL compilado com placeholders e bindings, não literais interpolados. Valores da conciliação continuam provenientes da fonte financeira existente, sem converter valor solicitado em recebimento/acatamento.

## Evidências da validação consolidada

Executada em worktree isolada, com ambiente mínimo, sem `.env`, conexões/segredos reais ou inicialização do servidor:

| Verificação | Resultado |
|---|---|
| Vitest selecionado — Etapas 1/2/3 e novas regressões | **1.390 aprovados em 56 arquivos** |
| Node — testes existentes do procedimento 0145, sem aplicar executor | **165 aprovados** |
| Build frontend/backend | **Aprovado** |
| `pnpm db:check` — somente validação dos artefatos | **Aprovado** |
| `git diff --check` | **Aprovado** |
| Delta em `drizzle/` e `scripts/migrations/` | **Zero** |
| TypeScript global | **Exit 2: 177 diagnósticos legados; baseline 177; zero novos** |

Os testes cobrem escopo, globais/inativos/alheios, revalidação temporal de permissões/cadastro, rollback, replays, concorrência simulada, repetidos legítimos, origem manual, resposta perdida/reload, storage mínimo, status somente leitura, binds SQL e calendário/Excel. A bateria é selecionada e não representa todos os testes existentes do repositório.

Auditorias independentes não identificaram bloqueios críticos/altos no delta de joins e confirmaram por inspeção o fechamento dos dois bloqueios finais de convênio global e retomada incerta. São evidências técnicas automatizadas, não aprovação humana de Sergio.

## Prévia visual e limites antes da operação real

A prévia usa o frontend do build validado, hospital/usuário/convênios fictícios e um servidor de fixtures separado. Todas as operações de escrita da fixture retornam 403; não existe acesso a banco, storage, IA, RPA ou ao backend real do Portal. A conferência visual é uma evidência de apresentação/estado da interface, não uma prova de gravação em produção.

**TiDB/conexões concorrentes reais ainda não foram homologados neste fluxo.** Os testes de locks e rollback usam simuladores; a compilação MySQL valida bindings, não o plano de execução no motor. Antes de ativar operações reais de glosa manual, validar em homologação TiDB compatível: mesma chave/payload em conexões independentes, chave igual/payload diferente, espera pelo lock e leitura corrente após commit, timeout/conflito/rollback, além da reconciliação após resposta perdida. Medir também os joins/subconsultas com volume e `EXPLAIN`, sem acrescentar DDL nesta PR.

Merge/publicação dependem do aceite de Sergio da revisão exata. Após autorização, revalidar o commit resultante, conferir processamentos ativos e configuração sem revelar segredos, sincronizar o WebDev, gerar checkpoint e comprovar Publish. Checkpoint não comprova publicação. Nenhuma etapa autoriza por si só importação/reprocessamento, uso de RPA/Banco Inter, boletos, alteração de perfis ou dados reais.
