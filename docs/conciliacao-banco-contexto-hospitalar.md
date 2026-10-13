# Conciliação Banco: contexto preservado e faturado hospitalar

## Pedido de Sergio em 13/10/2026

1. Sair da Conciliação Cruzada e voltar sem perder a consulta Banco.
2. Retirar os itens de médico direto do valor faturado hospitalar.
3. Habilitar o fluxo da aba XML Retorno também para itens vindos do Banco.

Esta entrega de código resolve **1 e 2**. O ponto **3 é uma evolução separada**, pois depende de identidade estável e confirmação dos vínculos financeiros; não foi ativado por atalhos sobre candidatos.

## 1. Contexto ao sair e voltar

A página lembra a fonte Banco, competência, convênio, situação, período de pagamento e página da lista por **usuário + estabelecimento**, na sessão da aba do navegador. Retornar pela navegação ou recarregar com F5 restaura essas preferências e faz novamente a consulta autorizada, usando o snapshot publicado mais recente.

- Não são armazenados resultados, pacientes, guias, itens, candidatos ou valores financeiros no armazenamento do navegador.
- Texto livre de busca é mantido **somente em memória** enquanto a aplicação permanece aberta. Voltar pela navegação preserva esse texto; F5 o limpa e reinicia a página para não reutilizar a posição de um filtro ausente.
- Não é persistida uma guia selecionada nem um detalhe aberto; ao retornar, a pessoa vê a lista e pode abrir detalhes atualizados.
- Trocar usuário, estabelecimento ou permissão remonta o corpo da página e descarta seleções antigas. Revogação temporária bloqueia Banco sem apagar a preferência; quando o acesso retorna, a preferência pode ser restaurada após nova autorização de leitura. Preferência não concede acesso: a fonte Banco exige unidade habilitada e permissão de conciliação; o servidor continua protegendo as consultas.
- Banco e Base atual mantêm recortes separados. Reativar Banco restaura seu último recorte, sem sobrescrever os filtros legados.
- A restauração aguarda as opções disponíveis antes de consultar. Competência/convênio que não existem mais não disparam leitura com identificadores inventados.
- Mudança real de filtros volta à página 1. Se um snapshot novo tiver menos páginas, a posição é ajustada ao novo limite.
- Storage corrompido ou bloqueado não impede o uso da tela.

O período desta persistência é a **sessão da aba**; não há promessa de restaurar preferências em outro navegador, dispositivo ou nova sessão.

## 2. Faturado hospitalar sem médico direto

A coluna Faturado da lista Banco passa a usar o subtotal `valorFaturadoHospital`, já calculado com precisão decimal e somente para **receber = S**. Itens **receber = N** são médico direto e não compõem esse total.

Os itens originais permanecem disponíveis para revisão, sem DELETE, UPDATE, transformação ou recarga da origem. Uma guia exclusivamente de médico direto tem faturado hospitalar zero, sem ser tratada como pendência hospitalar. Nos detalhes, a coluna Faturado hospitalar apresenta traço para itens de médico direto e identifica o motivo no tooltip.

Isso **não exclui procedimentos ou honorários cobrados via hospital** quando receber = S, nem confunde tipo MED (medicamento) com médico direto. O critério é modalidade S/N, não nome do tipo de item.

Pago, glosa, diferenças, regras de candidato e os dados da Base atual não foram recalculados por esta mudança. O corpo Banco continua somente leitura e nunca marca candidatos como Conciliado.

## 3. XML Retorno: desenho separado

O exemplo enviado tem tipo **DEMONSTRATIVO_ANALISE_CONTA**, padrão **TISS 3.03.01**, que é o tipo realmente produzido pelo gerador da aba existente. Embora os nomes internos usem “recurso de glosa”, não se deve confundi-lo com uma transação RECURSO_GLOSA.

A aba legada lê `conciliados_automatico` e complementa os itens a partir do faturamento normalizado. Geração registra histórico e altera marcações de XML. O piloto Banco, por outro lado, só compara snapshot publicado e demonstrativos, sem gravar vínculos.

Para geração Banco no mesmo fluxo, a próxima entrega precisa definir e implementar:

1. Identidade durável do item faturado e do evento de demonstrativo na mesma unidade e convênio.
2. Seleção/confirmação explícita para casos ambíguos, pagamentos múltiplos e datas incompletas.
3. Faturado hospitalar S; valores pagos/glosados confirmados do demonstrativo, sem somar recebido do Hop ou inferir glosa ausente como zero.
4. Dados de lote, protocolo, prestador e glosa originados do retorno confirmado, sem buscar qualquer linha pela guia com LIMIT 1.
5. Fila, geração e histórico da fonte Banco no visual original, com validação do XML aplicável antes de liberar o arquivo.

Não basta mostrar o botão legado no Banco: isso poderia exportar informações de conciliações de outra fonte ou sem vínculo confirmado. Nesta correção, nenhum XML real foi gerado, enviado ou importado.

## Validação desta entrega

- Testes sintéticos de armazenamento: namespaces, restauração, permissão, busca em memória, storage inválido/bloqueado, versões, páginas e lista permitida de propriedades.
- Regressões do motor, guias, serviço, autorização, UI e comparativo.
- Ensaio da **página real** em Chromium, com rede externa bloqueada: guia mista S+N, guia N, detalhes, página 2, desmontagem/retorno, F5 com opções atrasadas, snapshot reduzido, busca privada, retorno Base/Banco, troca de unidade/usuário e revogação de acesso.
- Desktop e mobile mantêm o visual da Conciliação Cruzada existente; nenhuma mutação foi acionada no ensaio.
- **105 testes**, build, `db:check` e diff check aprovados na revisão final.
- TypeScript: os **172 diagnósticos históricos** equivalem à main atual, com **zero novos**, normalizados caminhos/linhas.
- Auditoria independente encontrou perda de preferência numa revogação temporária; corrigida e revalidada. Parecer focal final: P1 resolvido, sem outros bloqueantes no escopo auditado. Ensaio do navegador confirmou bloqueio de acesso sem apagar a preferência e restauração ao retorno da permissão.

## Liberação

Branch própria e Pull Request revisável. Sem alteração de backend, schema, migração, dados, cron ou autorização de produção. A aprovação anterior da PR #71 não é reutilizada automaticamente para esta nova PR. Checkpoint não significa deploy.
