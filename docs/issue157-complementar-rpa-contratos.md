# Issue #157 — PR complementar de RPA, contratos e processamento

## Base e autorização

Complemento preparado sobre a `main` oficial `004bc433e4227ac52f63bed2f73c98f09c8cb2e5`, preservando os commits existentes. Sergio autorizou a preparação em 03/11/2026. A aplicação da 0145 e o deploy aguardam o aceite da revisão final; nenhuma importação ou chamada bancária/portal real faz parte da validação.

A exceção específica da 0145, com dispensa de backup, recuperação e homologação prévios, foi expressamente confirmada por Sergio. Ela não autoriza reaplicar a 0143, reparar o histórico, usar credenciais ou reprocessar dados.

## O que muda

### RPA

O envio só pode ser confirmado com evidência nova de submissão e protocolo correlacionado ao lote. Um protocolo preexistente ou genérico não comprova envio. Após uma submissão cujo resultado não pôde ser confirmado, o lote permanece aguardando reconciliação explícita, sem repetição automática da ação.

A inserção na fila e o claim de execução usam fronteiras atômicas existentes. Não foi criado índice novo para deduplicação. A política HTTPS de destino é aplicada aos redirects, frames e formulários, além do endereço inicial; o importador valida hospital, convênio e prestador antes de cadastrar o arquivo. A simulação permanece local, sem navegador remoto nem anexação de XML a um portal externo.

O teste de demonstrativos precisa transmitir o convênio e o prestador canônicos do hospital. Os diretórios de download são separados por execução, sem reutilizar uma pasta global compartilhada entre hospitais. Credenciais, chaves, URLs assinadas e conteúdo XML não integram os DTOs públicos ou a evidência de revisão.

O importador de demonstrativos valida o conteúdo e o cadastro antes de persistir o original no storage gerenciado. Somente após confirmação da escrita cadastra a referência do arquivo; não registra `rpa-private://` ou `local://` como cópia durável. Falha de storage impede cadastro/importação. Erros dinâmicos de banco, storage ou arquivo são projetados como mensagem genérica; motivos de validação são uma lista de mensagens literais revisadas, sem identificadores.

### Contratos, preços e glosas

As consultas usam a coluna física `acaoInconsistencia` e preservam hospital, convênio e vigência estritos. A seleção de tabela de preço considera a data de execução e possui ordenação determinística; falta de data ou contrato elegível não autoriza recorrer a outro convênio. A data histórica disponível no item é propagada às sugestões de justificativa.

O upload utiliza blocos binários de **4 MiB**, mantendo **150 MiB por PDF**, **600 MiB por lote** e **30 arquivos**. Os limites binários são informados na interface. Manifestações de sessão, blocos e documento final permanecem em armazenamento gerenciado; o disco temporário só auxilia montagem/leitura e não é a única cópia durável.

A sessão é vinculada ao usuário, contrato, hospital, tamanho e SHA-256. Reservas e atualizações usam transação/CAS, com conferência dos blocos antes da publicação do documento. Depois de recarregar, selecionar o mesmo contrato e os mesmos PDFs permite retomar o recebimento elegível. Sessões expiradas ou interrompidas não reiniciam o processamento sozinhas.

A montagem de PDFs é serializada por instância para respeitar o orçamento de memória. O finalizador cancela transferências que excedam o prazo cumulativo de até 150 segundos e fecha recursos antes de liberar o slot; não se usa um timeout que deixe uma montagem concorrente viva. O mesmo AbortSignal alcança o wrapper público de leitura e o Poppler: cancela o filho com SIGKILL e aguarda close dos processos/pipes antes de permitir outra leitura. Consultas/CAS do driver de banco não possuem API de cancelamento nesse contrato; não se afirma cancelamento de DB. O download exige autorização e usa stream no backend, sem devolver a chave do objeto ao cliente.

**Recebimento não equivale a leitura concluída.** PDFs sem texto selecionável continuam identificados como `ocr_necessario`. Esta PR não ativa o OCR retroativo ou o OCR da PR #152, nem analisa documentos reais com IA.

### Processamento interno

A precondição de segredo interno válido precede as escritas dos emissores revisados. Antes do HTTP, o dispatcher registra evidência em `process_logs`, tabela já existente. Sem essa evidência durável, não despacha.

Uma resposta perdida, timeout ou HTTP de recusa **não altera o arquivo para `erro` por ID**, pois o worker pode ter concluído ou outra tentativa pode estar ativa. O estado terminal continua pertencendo ao worker. A evidência impede que o watchdog trate o despacho como autorização para repetir processamento financeiro; recuperação exige conferência explícita. Isso não cria um token de tentativa ou tabela nova.

## Banco: somente a 0145 integrada

A SQL, o schema, o journal, os snapshots e o executor restrito original da 0145 permanecem inalterados em relação a `004bc43`. Não há nova migração ou DDL em endpoints.

A 0145 integrada contém quatro colunas aditivas em `credenciais_portais` e uma nova tabela `fila_envio_xml_portal`, com sua PK e três índices secundários. A PR acrescenta uma camada de execução verificada e um verificador puro de catálogo ao executor original, sem ampliar a SQL.

O procedimento preparado exige:

1. Revisão Git exata e hashes integrais dos três arquivos revisados, com árvore limpa.
2. Aceite de Sergio e reserva única `MIGRAÇÃO RESERVADA` na Issue #34 para a revisão e a janela.
3. Destino canônico, certificado TLS validado e sessões independentes para escrita e conferência.
4. Preflight recente de estrutura física e ledger; qualquer divergência impede o primeiro comando.
5. Conferência completa de colunas, tipos, nulidade, defaults, posições, índices e FKs após cada etapa, preservando a tabela-base.
6. Parada na primeira falha ou incerteza, sem repetição automática e sem declarar que nenhuma DDL ocorreu quando o resultado é desconhecido.
7. Registro tardio e transacional do único marker 0145, seguido de validação independente após o commit.

Não usar `db:migrate`, `db:push`, reparos de ledger ou reaplicação da 0143. Não foi executada a aplicação da 0145 durante a preparação.

## Validação e limitações

A bateria final de 03/11/2026 produziu os resultados abaixo. A comparação TypeScript preserva o diagnóstico e normaliza apenas posições de linhas e ordem de membros de unions literais; não suprime códigos de erro ou relaxa o compilador.

| Verificação | Resultado |
| --- | --- |
| Vitest, dependências externas simuladas | 633 testes aprovados em 27 arquivos |
| Node, procedimento/verificador 0145 sintéticos | 99 testes aprovados em 2 arquivos |
| `npm run build` | Aprovado |
| `pnpm db:check` | Aprovado |
| `git diff --check` | Aprovado |
| SQL, schema e metadados Drizzle contra `004bc43` | Sem alterações |
| TypeScript `--noEmit --incremental false` | Falhou com 187 diagnósticos legados; baseline 190, 3 removidos, zero novos |

A prévia visual usa somente dados fictícios e um servidor de respostas sintéticas, separado do backend do Portal. Ela comprova os controles visuais, não uma importação real ou um roundtrip na nuvem.

Não foram executados: envio real por RPA; emissão de boleto/PIX; uso de credenciais de produção; importação financeira; processamento de PDFs reais; medição de RSS no container; build Docker na infraestrutura de publicação; nem roundtrip cloud de 150 MiB.

Readiness somente do sandbox em 03/11/2026: storage gerenciado configurado; segredo de processamento interno, chave dedicada RPA e chave dedicada Inter ausentes ou incompatíveis com as exigências da revisão. Essa sondagem não comprova o estado da produção. Antes do deploy é necessário conferir os requisitos do ambiente publicado; operações sem a configuração exigida continuam bloqueadas de forma segura. Nenhuma chave foi solicitada em chat, gerada ou alterada nesta preparação. Alterar o segredo JWT de autenticação pode invalidar sessões e não será feito automaticamente como parte desta PR.

A hospedagem gerenciada possui limite de duração de requisição. Blocos pequenos contornam o teto por requisição, mas não ampliam esse limite nem garantem que todo PDF de 150 MiB seja processável dentro do orçamento. O leitor por arquivo possui limites próprios de tamanho de texto, tempo e páginas. A imagem de produção inclui Poppler/Python necessários à leitura, sem ativar um robô ou rotina por conta própria.

## Próxima liberação

Após o aceite da revisão final: mesclar exclusivamente a PR, revalidar a main resultante, repetir o preflight e aplicar uma única vez o procedimento 0145 aprovado, conferir catálogo/marker em conexão independente e liberar a reserva. Somente então sincronizar o WebDev, verificar lotes ativos, gerar checkpoint e publicar/reiniciar a versão autorizada, com comprovação pública separada.

A publicação não autoriza associar registros legados, mudar perfis, liberar usuários em massa, configurar chaves, executar portais ou reprocessar documentos. A produção permaneceu no checkpoint `9953b6b2` durante esta preparação.
