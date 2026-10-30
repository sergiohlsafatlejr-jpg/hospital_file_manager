# Fábrica de Faturamento — correção de perfis e importação canônica

## Escopo

Branch `fix/fabrica-xml-perfis-canonicos`, baseada na main oficial `fe2742b` (inclui PR #146). Preparação autorizada por Sergio em 30/10/2026. Esta autorização não inclui merge, publicação, importação real ou configuração de segredos.

A entrega corrige exclusivamente os controles da PR #145: permissões operacionais de setor/hospital, correlação de honorários e persistência efetiva do XML original. Não altera schema, SQL, snapshots, journal, índices ou executor de migração. Não cria agenda nem reprocessa arquivos existentes.

## Permissões

O retorno MySQL2/Drizzle `[rows, fields]` é interpretado corretamente. Uma linha de perfil salva é validada estritamente. Falha de consulta, JSON inválido ou formato inesperado bloqueiam a operação com mensagem amigável; nunca se convertem em ausência de perfil.

Apenas ausência efetiva de linha mantém o comportamento legado, sempre limitado pelas permissões existentes de hospital e da central. Perfil com setores vazios não autoriza nenhum setor. Visualizar relatórios não transforma o operador em gestor. O bypass existente exige papel administrador ou permissão real de gerenciamento da central.

Lotes são verificados em todos os setores antes da primeira escrita, com uma leitura do perfil por operação. Edição, exclusão, atribuição e vínculo automático também não contornam a guarda operacional. O estado Enviado/Recursos mantém a correspondência com os perfis Recursos/Limpeza já usados pela interface.

Alterações de perfil passam a ser append-only na estrutura existente: preservam revisões anteriores e registram autor e data UTC no payload de auditoria. O leitor escolhe a revisão mais recente. Não há janela de exclusão/inserção em que um operador restrito seja tratado como usuário sem perfil.

## XML e contexto médico

O XML original é persistido pelo cofre AES-256-GCM existente, usando a chave dedicada já prevista `XML_IMPORTACAO_FILE_KEY`. Nenhuma chave é criada, configurada ou divulgada nesta entrega.

O namespace criptográfico utiliza a conta da Fábrica e o ID global do arquivo, além de hospital/convênio, mantendo AAD/HMAC e isolamento do cofre. Isso não cria lote ou claim do worker XML. O marcador interno de releitura referencia um objeto cifrado efetivamente gravado; não é um URL público do original nem uma referência `local://` fictícia.

Classificação e validação do XML em memória podem ocorrer antes da gravação para identificar/autorizar o convênio. Isso não confirma processamento nem persiste itens. A gravação cifrada precede a materialização hospitalar e o status `processado`.

Honorários não são inseridos diretamente em `conta_contexto_medico_fontes`. A Fábrica utiliza exclusivamente o serviço canônico, restringindo hospital + convênio + arquivo hospitalar + guia/conta + lote + competência. Não há fallback por nome, carteira isolada ou primeira guia. Um arquivo com guia sem correspondência única ou fora do snapshot selecionado é recusado sem associação parcial.

No envio somente de honorários, a tupla vem do resumo hospitalar efetivamente vinculado à conta, não de inferências baseadas em datas editáveis.

## Transação e falhas

A rota usa uma transação única para os metadados, itens, resumo, contexto médico e avanço da Fábrica. O repositório canônico e o comparador recebem essa mesma conexão internamente. Falha de cofre ou correlação interrompe a operação e faz rollback; não confirma novos itens nem avança a conta de setor.

A escrita no storage não é transacional com o banco: se o objeto cifrado for gravado e uma etapa posterior falhar, o rollback pode deixar objeto cifrado sem referência. Ele não é associado, não é acessível como XML público e não autoriza repetir/reprocessar dados. Não foi implementada exclusão de objetos, pois o storage gerenciado não oferece esse contrato. Esta limitação não deve ser confundida com backup ou recuperação de produção.

Releitura médica autorizada reconhece o marcador do cofre e exige a mesma tupla criptográfica. Após sucesso, a interface navega para o snapshot correto em Conta Convênio, sem transportar URL/chave do original.

## Validação

Testes usam exclusivamente fixtures sintéticas e banco/storage simulados. Cobrem restrições de Recepção/Faturamento, lotes mistos, relatórios sem elevação, perfis inválidos, histórico de alteração, sucesso com dois XMLs, falha de armazenamento, correlação canônica, diferenças em cada componente do snapshot, rollback e ausência de avanço, AES-GCM/releitura, proteção do worker/upload legado e navegação pós-importação.

Build e `db:check` são executados na cópia isolada. O type-check global permanece falhando pelos 194 diagnósticos históricos; a comparação desconsidera apenas localização e ordem de membros de unions na impressão do TypeScript, preservando conteúdo semântico dos erros. Não é apresentado como type-check global aprovado.

A revisão independente sinalizou a classificação em RAM anterior ao cofre. O critério autorizado é persistir antes de marcar o arquivo como processado; essa observação foi confrontada com o fluxo e os testes: nenhum item hospitalar ou status processado precede a escrita protegida. Não há proibição de validação em memória no escopo aprovado.

## Liberação futura

Apresentar a Sergio o SHA final e a PR com os resultados finais. Somente após seu aceite específico: sincronizar a cópia WebDev, verificar ausência de lotes XML ativos, reiniciar/checkpoint e publicar a revisão aprovada. A validação em produção inicial deve ser somente leitura. Imports reais ou reprocessamentos, se desejados, precisam de autorização própria. Não executar `db:migrate`, `db:push` ou qualquer DDL para esta entrega.
