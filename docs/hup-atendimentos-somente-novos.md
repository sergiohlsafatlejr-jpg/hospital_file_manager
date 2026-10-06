# HUP: atendimentos novos sem substituir os antigos

**É possível.** O Portal identifica cada atendimento pelo trio `(estabelecimentoId, origemSistema, origemId)`. No piloto HUP, `origemId` é o `numatend` e a origem preserva o identificador `WARLEINE` da primeira publicação, mesmo que o transporte atual seja o Apache Hop. Assim, o Portal pode ler a staging e inserir **apenas chaves que ainda não existem** nesse trio. O índice único físico impede que duas execuções criem duas cópias da mesma chave.

Na comparação agregada de 06/10/2026, a staging tinha 737 chaves e o destino 731: **16 chaves novas**, **3 registros existentes com campos diferentes** e **10 chaves do destino ausentes da staging**. A soma líquida é +6, mas uma carga *somente novos* insere 16, deixa os 3 dados anteriores como estavam e mantém as 10 chaves ausentes visíveis. Ela **não é** atualização completa da tela e não deve ser descrita como tal.

## Organização recomendada no Hop

| Etapa | Comportamento requerido |
| --- | --- |
| Origem | Buscar `numatend` estável e os 13 campos já usados no piloto; validar que não há ID vazio/repetido nem outro estabelecimento. |
| Transformação | Fixar o vínculo do estabelecimento Urológico na configuração controlada do fluxo; manter `numatend` intacto, datas civis e os nomes das colunas compatíveis com a staging física. |
| Destino Hop | Escrever **somente** na staging `stagion_atendimentos_parados_urologico`, por colunas nomeadas; não fazer `CREATE/DROP/TRUNCATE` na staging do Portal e nunca escrever diretamente em `atendimentos_unificados`. |
| Término da carga | O último passo do fluxo só pode sinalizar sucesso **após todos os INSERTs terminarem e o lote estar íntegro**. Para automação durável, precisaremos de um manifesto persistido com unidade, origem, ID do lote, contagem e estado `COMPLETO`. |
| Publicação do Portal | O script incremental proposto compara chaves, faz prévia e, apenas com revisão/manifesto privado/confirmação de fim do Hop, insere as ausentes em transação. `UPDATE`, `DELETE`, `TRUNCATE` e desativação de ausentes não fazem parte desse modo. |

**Por que não filtrar só pelo número maior?** Um atendimento pode chegar atrasado ou mudar no hospital. A comparação deve ser por chave completa, não `MAX(numatend)`, data ou diferença entre contagens. Se no futuro também quisermos corrigir os três registros alterados e decidir o destino dos dez ausentes, isso requer sincronização de snapshot completo e regra explícita para retificação/inativação, não INSERT-only.

## Segurança e ativação

`node --import tsx scripts/publicar-hop-urologico-novos.mts` executa **somente prévia**. A escrita requer `--apply --confirm-insert-only --confirm-hop-finished --confirm-reviewed-pr` mais `SAFATLE_HUP_EXPECTED_COUNT`, `SAFATLE_HUP_EXPECTED_NEW_COUNT`, `SAFATLE_HUP_EXPECTED_SHA256` e `SAFATLE_HUP_EXPECTED_DATABASE` definidos em canal privado a partir da prévia. A execução aborta se contagem, fingerprint, quantidade de novas chaves, banco, índice único, tipos ou status do integrador legado divergirem. A prévia inclui fingerprint; redirecioná-la para arquivo privado, nunca para Issue/PR/chat.

**Nenhum agendamento é ativado nesta PR.** Para automatizar sem intervenção, o Hop deve marcar o lote como concluído e o backend deve ter um handler autenticado, idempotente e publicado; para checagem periódica WebDev, usar Heartbeat após deploy, nunca outro cron em memória. A divergência física observada na staging **financeira** 0131 é separada desta rotina de atendimentos e não deve ser ocultada por um automatismo compartilhado.
