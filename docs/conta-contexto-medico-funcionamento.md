# Conta Convênio — procedimentos médicos informativos e composição

## Como utilizar

A conta hospitalar proveniente de XML ganha a aba **Contexto médico**. A aba é separada dos itens financeiros e só é habilitada quando arquivo hospitalar e convênio são identificados sem ambiguidade. Contas Banco/Warleine não recebem esta associação de XML nesta entrega.

O usuário seleciona um XML médico **já importado no Portal** e escolhe **Indexar como informação**. Abrir a página, sozinho, não importa nem indexa arquivos. O servidor confere estabelecimento, convênio, referência de guia, beneficiário quando informado e datas compatíveis. Correspondência ambígua ou incompatível é bloqueada; não há busca por semelhança de nome de paciente. A indexação só acrescenta informação nas tabelas novas, mantendo o XML original e os itens hospitalares intactos.

O painel exibe código/descrição do procedimento, data e profissionais/conselho quando presentes no XML. Informações ausentes são indicadas como não informadas. A presença de um profissional não comprova pagamento direto. Valores de honorários não são incluídos na informação persistida nem nas respostas desta aba.

## Escolher o gabarito

Os procedimentos médicos ajudam a reconhecer os principais de cada gabarito. Um gabarito é aplicável somente dentro do estabelecimento/convênio correto e quando todos os seus principais distintos estão identificados como procedimentos. Material com código coincidente não satisfaz um procedimento principal.

Quando existe um único gabarito aplicável, ele recebe a recomendação. Isso não confirma automaticamente a associação. Um modelo com somente dois de três principais continua visível como inelegível e não pode ser confirmado.

Faltas e diferenças de quantidade da composição hospitalar são resultados a revisar. Elas não tornam o gabarito inaplicável: o auditor pode confirmar que aquele modelo deve ser usado para analisar a conta, mantendo as pendências visíveis. Confirmar aplicabilidade não significa declarar a cobrança conforme.

Para confirmar, o usuário seleciona **Confirmar composição**, revisa a abrangência e informa uma justificativa obrigatória. O servidor recompõe as informações atuais e registra a decisão com usuário, horário e revisão. **Invalidar com histórico** cancela a confirmação sem apagar a decisão anterior. Fontes, gabarito ou itens hospitalares alterados exigem nova revisão; uma confirmação antiga não é reutilizada silenciosamente.

## Diárias e grupos alternativos

Nos editores **Criar Gabarito** e **Editar Padrão**, os itens podem receber o mesmo nome de **Grupo alternativo (OR)**. Exemplo de configuração: diária de apartamento e diária de enfermaria pertencem ao grupo `acomodacao`. A presença de uma alternativa satisfaz o grupo na composição informativa; as outras alternativas não aparecem como faltas independentes.

A obrigatoriedade do grupo é uma escolha explícita. Se o grupo é opcional e nenhuma alternativa aparece, não há pendência obrigatória. Se o grupo foi explicitamente marcado como obrigatório, a ausência de todas as alternativas gera **uma** pendência de grupo, não uma pendência por alternativa.

Não há máximo implícito de uma diária. Uma conta pode conter mais de um tipo de acomodação em momentos diferentes. UTI, hospital-dia e internação não são reunidos automaticamente no mesmo grupo; essa regra depende da escolha do responsável. Categorias e limites de quantidade existentes são preservados. Nesta implantação não é alterado nenhum gabarito real automaticamente.

A nova semântica OR é avaliada na composição informativa desta aba. A auditoria/comparação legada e os cálculos financeiros permanecem separados nesta entrega; não há reexecução automática desses fluxos.

## O que não muda

Honorários médicos não são inseridos em `faturamento_tiss`, `contas_convenio_itens`, recebimentos ou conciliações. Não há soma com valores hospitalares, criação de glosa, ajuste de saldo, recebimento, estorno ou envio de recurso. A informação médica permanece isolada por conta, arquivo hospitalar, estabelecimento, convênio, lote e competência.

A busca de fontes usa arquivos previamente autorizados; a seleção não aceita URL fornecida pelo cliente. O leitor consulta o SDK autenticado de armazenamento pela chave exata do arquivo e exige URL HTTPS pública sem credenciais embutidas; redirecionamentos são bloqueados. Um fallback só é permitido para origens HTTPS previamente configuradas no servidor. O carregamento é limitado e a estrutura XML rejeita DTD/entidades externas. Os retornos públicos não expõem URL, hash, carteirinha ou XML bruto.

## Validação da análise anterior

A primeira simulação misturou o snapshot antigo de 44 itens com o XML hospitalar novo. A conferência corrigida encontrou **39 itens hospitalares, seis registros médicos e dois códigos médicos distintos**. O modelo com 32 itens tem **12 códigos presentes, 20 ausentes, sendo quatro ausências opcionais e 16 ausências obrigatórias de alta frequência**. Ausência por código não comprova erro clínico ou cobrança indevida; equivalência e aplicabilidade exigem análise humana.

O modelo de 31 itens só tem dois de três principais encontrados e não é um segundo modelo automaticamente confirmável. A recomendação do modelo de 32 itens continua sendo uma sugestão de aplicabilidade. A análise real foi somente leitura/em memória; não foi confirmada associação nem alterado gabarito da conta.

O ensaio funcional final utilizou o leitor SDK, o parser e o serviço novos, com SELECTs restritos e toda persistência substituída explicitamente por memória. Foram reconhecidas três guias médicas no arquivo, com seis registros e dois códigos distintos, três fontes apenas em memória e uma única recomendação elegível. O Modelo 1 manteve 12 códigos presentes, 16 faltas obrigatórias e quatro opcionais, sem transformar essas contagens em diagnóstico clínico ou glosa. A interoperabilidade SAX no Node ESM e a separação dos principais compostos foram verificadas no mesmo ensaio.

## Estrutura e implantação

A migração **0138_known_blink** contém sete declarações aditivas: três tabelas, 45 colunas, três chaves primárias, três unicidades de negócio e quatro índices explícitos. As tabelas são `conta_contexto_medico_fontes`, `conta_contexto_medico_contextos` e `conta_contexto_medico_eventos`. Não há DML, exclusão, alteração de tabela financeira, FK ou cascata; a integridade de referências externas é validada pela aplicação e deve ser mantida nos fluxos de exclusão/reimportação.

O histórico legado Drizzle continua exigindo procedimento restrito: **não usar `db:migrate` geral nem `db:push`**. A 0135 está fora desta entrega e os artefatos da 0136/0137 permanecem imutáveis. A 0138 foi gerada com `db:generate` e conferida com `db:check` na branch própria.

A homologação SQL local foi concluída em TiDB 8.5.3 com TLS: três tabelas, 45 colunas e dez índices físicos, com nove ensaios sintéticos de unicidade, versionamento, compare-and-swap, eventos atômicos e rollback. Esse ensaio não é restauração de backup de produção. A prévia renderiza o componente real com dados fictícios, backend ausente e requisições externas bloqueadas.

Sergio informou em 27/10/2026 que não há backup automático e autorizou seguir sem backup nesta nova migração. Essa exceção não comprova recuperação nem dispensa homologação, revisão do procedimento, janela exclusiva ou autorização ligada à revisão final. Uma falha de DDL pode deixar estrutura parcial sem cópia de recuperação; a execução deve parar na primeira falha, sem repetir comandos ou apagar estruturas para remediar.

**Validação final:** 43 testes de módulos novos e 34 testes de regressão, nove ensaios SQL no TiDB local e ensaio completo das sete DDLs pelo executor local. A prévia passou por oito verificações de interação desktop/mobile com dados fictícios e rede externa bloqueada. Build, `db:check` e diff conferidos; TypeScript mantém 172 diagnósticos legados, sem novos por arquivo/código. Auditoria focal somente de código sem bloqueantes; não é aprovação humana de Sergio.

**Estado deste documento:** pronta para PR e revisão de Sergio; a migração não foi aplicada em produção e a branch nova não foi publicada. O merge, a aplicação restrita e o deploy dependem do aceite da revisão exata apresentada. Não foi alterado gabarito real, indexado XML médico nem confirmado vínculo em produção.
