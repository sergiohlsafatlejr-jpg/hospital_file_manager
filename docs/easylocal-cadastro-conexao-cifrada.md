# EASYLocal — cadastro da conexão central com segredo cifrado

## Escopo

Entrega da Issue #82, branch `feat/easylocal-cadastro-conexao`, baseada na main `7475680`.

Sergio autorizou em 14/10/2026 a exceção restrita para armazenar a senha cifrada no banco do Portal com chave exclusiva mantida nos segredos do servidor. A autorização refere-se à preparação da funcionalidade; não altera a conexão atual e não autoriza merge, deploy, carga ou ativação automática.

## Funcionamento da aba Conexões

A aba agora possui o formulário completo no padrão visual existente:

- Nome e descrição.
- Tipo PostgreSQL, host DNS, porta, banco e usuário.
- Senha, preenchida apenas para cadastro ou troca; em edição, deixar em branco mantém a atual.
- TLS obrigatório: cadeia pública do sistema ou certificado próprio PEM. A opção Sistema **não desliga SSL/TLS**.
- Certificado próprio somente de entrada; em branco mantém o atual quando essa modalidade continua selecionada.
- Testar dados: valida o rascunho sem salvar, consultar pacientes ou iniciar importação.
- Salvar conexão central: requer confirmação explícita de que a configuração serve às leituras EASYLocal de todas as unidades.
- Editar e Testar conexão salva.

A mesma configuração salva é consumida pela sonda de conexão e pela detecção de tabelas/colunas. Não é um cadastro paralelo sem efeito.

## Armazenamento e privacidade

O catálogo existente `integracao_conexoes` é reutilizado. Uma linha global, reservada ao serviço dedicado, tem alias interno `__EASYLOCAL_SERVER__` e estabelecimento nulo. As referências internas por unidade já criadas pelo integrador são preservadas.

O envelope cifrado contém os dados completos de conexão, incluindo senha e certificado. Campos visíveis do catálogo técnico usam placeholders, sem guardar host ou senha em texto aberto. A linha permanece inativa para os executores do integrador legado.

- AES-256-GCM, nonce aleatório e autenticação por propósito.
- Chave exclusiva `EASYLOCAL_CONNECTION_ENCRYPTION_KEY`, no gerenciador de segredos do servidor; 32 bytes, representados por 64 caracteres hexadecimais.
- Não usa `JWT_SECRET` como fallback e não gera chave automaticamente.
- A senha, o PEM, o envelope e a chave nunca integram o retorno do endpoint.
- O administrador recebe somente os campos não secretos de edição e indicadores de senha/certificado configurados.
- Não persiste formulário, senha ou resultados em localStorage/sessionStorage. As mutações de rascunho são descartadas e o formulário é limpo ao fechar/cancelar/salvar.
- Auditoria do último salvamento registra responsável e instante dentro do payload autenticado. **Não equivale a um histórico imutável de todas as edições.**
- Endpoints exclusivos de administrador; as leituras por estabelecimento continuam sob o contrato do integrador atual.

A criptografia usa codificação Base64URL somente para representar bytes do envelope. Isso não deve ser confundido com o armazenamento Base64 puro de senha do legado, que não foi reaproveitado.

## Precedência e falhas

1. Cadastro global cifrado, quando existir e estiver íntegro.
2. Configuração atual em variáveis EASYLOCAL_PG_* somente quando não houver cadastro global.

Erro de banco, duplicidade, chave ausente ou envelope corrompido **não** fazem o sistema voltar silenciosamente à conexão ENV. A operação falha com mensagem sanitizada.

Sem a chave dedicada, o formulário informa a pendência e bloqueia salvamento. A configuração ENV não é apagada nem modificada por abrir a tela ou testar dados.

Na criação/edição, uma transação trava uma linha existente para serializar reservas globais; no TiDB utiliza `BEGIN PESSIMISTIC`. A revisão do cadastro é capturada ao abrir o formulário e conferida antes da gravação. Outra sessão que alterou o cadastro provoca conflito, não sobrescrita silenciosa.

Se o resultado do commit não puder ser confirmado, a aplicação informa a incerteza, sem repetir automaticamente a gravação. O operador deve atualizar o cadastro antes de tentar novamente.

## TLS, privilégios e limites

A sonda e o catálogo mantêm `rejectUnauthorized: true`, verificação de hostname e limites de conexão/consulta. Aceitam somente DNS válido, não IP, URL ou SQL.

O teste exige role dedicada de leitura, sem privilégios administrativos diretos/assumíveis. Ter autoridade sobre o banco da empresa não altera automaticamente esse contrato técnico: a role pode ser provisionada pela própria equipe Safatle. A aplicação não retira privilégios nem muda permissões do PostgreSQL.

O teste usa consulta de privilégios e SELECT 1. A detecção consulta somente metadados. Salvar conexão não executa leitura hospitalar, DDL de destino, carga ou agendamento.

As leituras da PR #79 continuam sendo configurações preparadas, sem execução/importação automática e sem atualização automática das páginas. Os adaptadores de publicação dos domínios permanecem fora desta entrega.

## Liberação e reversão

1. Revisar esta PR e os gates; obter liberação de Sergio para merge/deploy se não houver revisão de outra pessoa.
2. Provisionar a chave dedicada nos segredos do ambiente publicado, por canal autorizado, sem enviá-la em conversa, Issue, PR ou captura.
3. Guardar uma cópia segura da chave fora do catálogo cifrado. Não trocar/perder a chave depois de existir cadastro sem procedimento de recifragem.
4. Publicar o código e verificar a versão do Portal.
5. Abrir o formulário administrativo, conferir os dados não secretos e preencher senha/certificado somente no sistema.
6. Testar a role e salvar após confirmar que esta é a conexão central. Validar metadados separadamente.

Não é necessária nova migração. A 0135 Banco/XML não é aplicada, alterada ou incluída nesta funcionalidade.

Antes do primeiro salvamento, rollback de código não exige mudança de dados: o fallback ENV permanece. **Depois de salvar**, rollback de código pode retornar ao uso das variáveis ENV e ignorar o novo cadastro; deve ser coordenado por Sergio. Não apagar o registro global ou a chave para simular reversão sem autorização e backup.

## Validação

Testes exclusivamente sintéticos e com mocks, sem salvar conexão ou testar credenciais reais. Cobrem cifra, adulteração, chaves, fallback, conflito, commit incerto, certificate write-only, autorização, TLS e integração com o consumidor. Há ensaio de navegador desktop/mobile com rede externa bloqueada, usando dados inteiramente fictícios.

**Gates concluídos:** 88 testes aprovados em 13 arquivos; 4 ensaios SQL opcionais ignorados nesta execução (não foram executados contra produção). Build, `db:check`, conferência do diff e teste visual desktop/mobile aprovados. TypeScript mantém exatamente os mesmos 172 diagnósticos históricos da baseline limpa `7475680`, sem novos erros. Auditoria focal somente leitura não encontrou bloqueantes.

Nenhuma alteração no banco de produção, conexão atual, segredos do ambiente ou permissões de PostgreSQL foi executada nesta preparação.
