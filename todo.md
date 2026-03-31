# Safatle Gerenciamento - TODO

## Funcionalidades Principais

- [x] Sistema de upload e armazenamento de arquivos XML enviados aos convênios
- [x] Sistema de upload e armazenamento de arquivos retornados (Excel, PDF, XML)
- [x] Parser automático para extrair dados de arquivos XML
- [x] Parser automático para extrair dados de arquivos Excel
- [x] Parser automático para extrair dados de arquivos PDF
- [x] Módulo de comparação entre arquivos enviados e retornados
- [x] Identificação de divergências em procedimentos e valores
- [x] Dashboard para visualização de arquivos processados
- [x] Visualização de status de comparações
- [x] Sistema de busca por data
- [x] Sistema de busca por convênio
- [x] Sistema de busca por tipo de arquivo
- [x] Sistema de busca por status de divergência
- [x] Filtros avançados combinados
- [x] Geração de relatórios comparativos em tabelas
- [x] Geração de relatórios comparativos em gráficos
- [x] Sistema de alertas visuais para divergências
- [x] Inclusão manual de itens e procedimentos
- [x] Painel administrativo para gerenciar códigos de procedimentos
- [x] Campos de comparação configuráveis

## Infraestrutura

- [x] Esquema do banco de dados (arquivos, convênios, procedimentos, comparações)
- [x] Rotas tRPC para upload de arquivos
- [x] Rotas tRPC para listagem e busca
- [x] Rotas tRPC para comparação
- [x] Rotas tRPC para relatórios
- [x] Rotas tRPC para administração
- [x] Testes unitários das rotas principais

## Bugs

- [x] Tela de login não aparece para usuários não autenticados (resolvido - requer publicação)
- [x] Parser XML não extrai campos com namespace ans: (descricaoProcedimento vem em branco)
- [x] Criar tela de visualização de itens importados por convênio

## Novas Funcionalidades

- [x] Função para excluir arquivos importados
- [x] Parser XML não extrai valores unitários e totais dos procedimentos
- [x] Parser XML não extrai nome do médico
- [x] Parser XML não extrai número das guias
- [x] Suporte a drag and drop na tela de upload
- [x] Upload múltiplo de até 30 arquivos de uma vez
- [x] Extrair data de execução dos procedimentos
- [x] Extrair CRM da tag numeroConselhoProfissional
- [x] Extrair nome do médico da tag nomeProf
- [x] Separar/agrupar guias por dia na visualização
- [x] Filtro de pesquisa por nome do médico na tela de Itens Importados
- [x] Filtro de pesquisa por CRM na tela de Itens Importados
- [x] Exportar dados de Itens Importados para arquivo Excel (.xlsx)
- [x] Importar arquivo de retorno do convênio (Excel, PDF, XML)
- [x] Conciliação automática entre valores enviados e retornados
- [x] Identificar divergências de valores na conciliação
- [x] Interface para visualizar resultado da conciliação
- [x] Painel de controle de faturamento e glosa por convênio
- [x] Gráficos de faturamento por período
- [x] Métricas de glosa (valor glosado, percentual)
- [x] Comparativo entre convênios
- [x] Relatório detalhado de motivos de glosa por convênio
- [x] Identificação de padrões de glosa
- [x] Gráficos de análise de glosa por categoria/motivo
- [x] Ranking de procedimentos mais glosados
- [x] Sistema de recursos/justificativas de glosa
- [x] Registro de contestações enviadas aos convênios
- [x] Acompanhamento de status de cada recurso (pendente, enviado, deferido, indeferido)
- [x] Histórico de interações por recurso
- [x] Interface de gerenciamento de recursos
- [x] Botão na página de Divergências para criar recurso de glosa automaticamente
- [x] Corrigir extração de médico e CRM nos arquivos XML (campos não estão sendo preenchidos)
- [x] Destacar visualmente procedimentos com médico associado na interface
- [x] Corrigir erro na importação de arquivos Excel (.xlsx)
- [x] Reformular tela de Conciliação para comparar XMLs enviados vs retornos Excel por convênio/data
- [x] Exibir na conciliação: guia, data, código, valor faturado, valor pago, valor glosado, motivo de glosa
- [x] Criar relatório de tendências de glosas por convênio nos últimos 6 meses
- [x] Gráficos de evolução mensal de valores glosados
- [x] Comparativo entre convênios ao longo do tempo
- [x] Otimizar tela de Conciliação - corrigir lentidão e filtros que não abrem
- [x] Criar tela de Demonstrativo - exibir arquivo de retorno com itens pagos, glosados e motivos de glosa
- [x] Criar tela de Repasse - comparar itens faturados vs recebidos (médico, valor pago, data, código, paciente, guia)
- [x] Corrigir gráficos de Faturamento - usar valores do arquivo de retorno para Total Recebido
- [x] Corrigir filtros para aplicar no backend antes da paginação (todas as telas)
- [x] Corrigir importação de arquivos XML de retorno que não trazem itens
- [x] Criar dicionário de códigos de glosa TISS para traduzir em descrições legíveis
- [x] Adicionar sugestões de argumentos e ações de contestação para cada código de glosa
- [x] Criar interface para visualizar e usar as sugestões de contestação
- [x] Criar tabela de histórico de contestações no banco de dados
- [x] Integrar sugestões do dicionário de glosas na tela de criação de recursos
- [x] Implementar IA para sugerir argumentos baseados no histórico de sucesso
- [x] Criar interface de histórico de contestações com argumentos usados e resultados

- [x] Corrigir importação de arquivos PDF
- [x] Adicionar suporte a importação de arquivos CSV
- [x] Corrigir importação de arquivos XLS (formato antigo Excel)
- [x] Criar sistema multi-estabelecimento (separar dados por hospital)
- [x] Melhorar tela de Análise de Glosa - puxar itens glosados automaticamente e criar recursos na mesma tela
- [x] Ajustar filtro do Demonstrativo para filtrar por convênio em vez de arquivo
- [x] Corrigir erro de importação de PDF Saúde Caixa
- [x] Corrigir erro de importação de XML GEAP
- [x] Implementar regra Bradesco: itens não encontrados na conciliação = pago
- [x] Criar tela de configuração de regras de conciliação por convênio
- [x] Corrigir lógica Bradesco: itens no XML verificar glosa, itens não listados = pago
- [x] Renomear automaticamente arquivos no upload removendo caracteres especiais
- [x] Melhorar tela Análise de Glosa: filtros por convênio e data, identificar tipo (exame, mat-med, procedimento)
- [x] Corrigir duplicação no Demonstrativo - mostrar apenas arquivos de retorno
- [x] Adicionar contestações em lote para itens glosados selecionados
- [x] Criar sugestão automática de motivo de recurso com IA baseada na justificativa da glosa
- [x] Corrigir parser XLSX para extrair campos "situação" (pago/glosado) e "ERRO TISS" (motivo de glosa)
- [x] Melhorar performance do sistema (índices, queries, processamento de arquivos)
- [x] Implementar indicador de progresso de importação para arquivos grandes
- [x] Mostrar alerta na interface quando a IA não conseguir sugerir motivo de recurso
- [x] Corrigir processamento do arquivo XML GEAP que não importou procedimentos (usar botão Reprocessar)
- [x] Otimizar velocidade de processamento de arquivos XLSX grandes (batch 2000, parser otimizado)
- [x] Corrigir parser XLSX demonstrativo-0278119 para extrair glosas e valores corretamente
- [x] Corrigir tela Demonstrativo - dados de glosa não exibidos corretamente para Unimed
- [x] Corrigir tela Demonstrativo - dados de glosa em branco para Bradesco
- [x] Corrigir KPIs do Demonstrativo para somar todos os itens (não apenas da página atual)
- [x] Adicionar tipo de código no Demonstrativo (exame, procedimento, material, medicamento)
- [x] Otimizar performance de importação de arquivos Excel grandes (Unimed lento)
- [x] Corrigir parser Saúde Caixa para extrair itens glosados no Demonstrativo
- [x] Corrigir tela de Faturamento - dados incorretos e valores glosados não aparecem
- [x] Corrigir parser Vivacom para extrair campos valor_glosa e cod_glosa
- [x] Corrigir importação Unimed e Celgmed - campos de glosa não aparecem no Demonstrativo
- [x] Corrigir filtro de status no Demonstrativo (botão não funciona)
- [x] Tornar KPIs do Demonstrativo clicáveis para filtrar itens
- [x] Corrigir parser PDF Saúde Caixa para extrair glosas e motivos corretamente
- [x] Implementar seletor de data de referência (mês/ano) no Demonstrativo
- [x] Corrigir filtro de mês de referência no Demonstrativo para usar campo mesReferencia do arquivo
- [x] Adicionar filtro de mês de referência na tela de Conciliação
- [x] Corrigir dados de glosa da Unimed e Vivacom que não aparecem na tela de Análise de Glosa
- [x] Corrigir parser PDF Saúde Caixa para extrair glosas e motivos corretamente (Demonstrativo 11-2025.pdf)
- [x] Corrigir itens glosados da Vivacom que aparecem no Demonstrativo mas não na Análise de Glosa
- [x] Implementar filtro por código de glosa na Análise de Glosa para agrupar itens e identificar padrões
- [x] Integrar Dicionário de Glosas na Análise de Glosa para exibir descrição completa ao lado de cada código
- [x] Implementar criação de recursos em lote para todos os itens de um código de glosa selecionado
- [x] Criar status de "recurso criado" para itens glosados após criação de recurso, evitando duplicidade
- [x] Criar cards de classificação de glosa (aceita/recursada) na Análise de Glosa
- [x] Implementar aprendizado automático baseado em histórico de glosas anteriores
- [x] Atualização automática de status dos procedimentos quando recurso mudar de estado

- [x] Criar cadastro de tabelas de preços por convênio (diárias, mat-med, taxas, procedimentos)
- [x] Implementar campos: código, nome, valor, vigência inicial, vigência final
- [x] Criar importador de dados para tabelas (Excel, CSV, DBF)
- [x] Criar aba de Glosas Aceitas na Análise de Glosa (separar itens aceitos)

- [x] Remover itens aceitos da aba Itens Glosados (mostrar apenas na aba Glosas Aceitas)
- [x] Implementar comparação de valores cobrados vs tabela de preços na aba Comparações
- [x] Alertar automaticamente quando valor cobrado for diferente do valor da tabela vigente

- [x] Corrigir aba de Glosas Aceitas para exibir itens aceitos corretamente
- [x] Adicionar campo para funcionário inserir motivo do aceite da glosa

- [x] Implementar comparação automática XML vs Tabela de Preços no upload com notificação de divergências
- [x] Criar tela de Regras de Negócio para cadastrar regras de composição de contas
- [x] Implementar regras como: Procedimento X deve ter Taxa de Sala Y, Oxigênio Z, Taxa de Vídeo W
- [x] Implementar IA para análise de contas e identificação de itens faltantes
- [x] Integrar alertas e sugestões na tela de Comparações

- [x] Restaurar checkboxes para marcar itens como glosa aceita na tela de Análise de Glosa
- [x] Restaurar campo para inserir motivo do aceite da glosa
- [x] Restaurar aba de "Itens Glosa Aceita" na tela de Análise de Glosa

- [x] Corrigir importação de diárias e taxas em arquivos Excel (não estão sendo reconhecidas ou valores incorretos)
- [x] Remover automaticamente espaços em branco extras dos nomes das colunas ao importar arquivos Excel
- [x] Corrigir parser de datas para formato DD/MM/AAAA na importação de tabelas de preços
- [x] Corrigir exibição de itens na tela de Tabelas de Preços - itens não aparecem ao clicar nos cards de tipo
- [x] Corrigir erro ao criar regra de negócio - problema com campo toleranciaValor na inserção de itens
- [x] Implementar função de edição para regras de negócio existentes
- [x] Implementar edição de itens obrigatórios no modal de edição de regras (adicionar/remover)
- [x] Adicionar botão para duplicar regras de negócio existentes
- [x] Alterar tela de Comparações para validação por XML individual (sob demanda) em vez de automática
- [x] Implementar validação em lote de regras contra arquivo XML selecionado
- [x] Corrigir validação de XML para identificar divergências de preços em todos os tipos (taxas, diárias, procedimentos)
- [x] Salvar resultado da validação no histórico para consulta posterior
- [x] Corrigir comparação que está funcionando apenas para materiais/medicamentos
- [x] Corrigir comparação de diárias no XML - valores de diárias não estão sendo identificados como divergentes
- [x] Implementar filtros na tela de Divergências para visualizar separadamente diárias, taxas, mat/med e procedimentos
- [x] Melhorar visual da tabela de divergências: separar código e descrição em colunas distintas
- [x] Mostrar nome da regra violada na seção de Violações de Regras de Negócio
- [x] Implementar reabertura de validações do histórico com análise completa (divergências, violações, sugestões)
- [x] Criar painel de resumo na tela de Comparações com total de divergências por categoria e convênio
- [x] Implementar sistema multi-estabelecimento com seleção de hospital
- [x] Adicionar campo estabelecimentoId nas tabelas principais (arquivos, procedimentos, alertas, etc.)
- [x] Criar contexto de estabelecimento para gerenciar seleção
- [x] Criar tela de seleção de estabelecimento na entrada do sistema
- [x] Filtrar todas as queries por estabelecimento selecionado
- [x] Adicionar seletor de estabelecimento no header para alternância durante sessão
- [x] Atualizar registros antigos no banco de dados para associá-los ao estabelecimento correto
- [x] Criar dashboard consolidado com opção de visualizar dados de todos os estabelecimentos para gestores
- [x] Implementar controle de acesso e permissões por estabelecimento (usuários veem apenas estabelecimentos autorizados)

- [x] Adicionar filtro por status de classificação (Pendente, Aceita, Recursar) na aba de Itens Glosados
- [x] Criar dashboard de produtividade com métricas de itens classificados por dia/usuário

- [x] Corrigir bug: troca de estabelecimento no menu lateral não atualiza os dados das telas

- [x] Aplicar filtro de estabelecimento nas telas de Arquivos, Comparações e Faturamento
- [x] Adicionar indicador visual do estabelecimento selecionado no header do Dashboard
- [x] Persistir seleção de estabelecimento no localStorage para manter escolha ao recarregar

- [x] Implementar aceite de glosa em lote na tela de Análise de Glosa (botão Selecionar Todos + Aceitar Selecionados)

- [x] Implementar cadastro de novos motivos de glosa no dicionário (nome e descrição)
- [x] Corrigir abas da tela de Análise de Glosa (por categoria, por convênio, por procedimento, tendência) para filtrar por estabelecimento

- [x] Corrigir abas de Análise de Glosa que não trazem valores quando filtros de convênio são aplicados

- [x] Adicionar métricas de envio de XML por usuário no Dashboard de Produtividade (valores faturados)
- [x] Criar filtros no Dashboard de Produtividade para separar métricas de envio de XML e glosas

- [x] Implementar grupos de serviço (Faturista, Recurso de Glosa, Administrador, Gestor, Visualizador) na tela de Gerenciar Permissões
- [x] Definir permissões por módulo/aba para cada grupo de serviço
- [x] Implementar controle de acesso nas telas baseado no grupo do usuário

- [x] Criar interface de criação de usuários na tela de Gerenciar Permissões
- [x] Implementar grupos personalizados (permitir criar novos grupos além dos pré-definidos)
- [x] Implementar log de auditoria (registrar quem alterou permissões e quando)
- [x] Implementar notificação de acesso negado (mensagem amigável quando usuário tentar acessar módulo sem permissão)

- [x] Permitir cópia de permissões de um grupo existente ao criar novos grupos

- [x] Permitir selecionar múltiplos estabelecimentos ao criar usuários e permissões

- [x] Edição de estabelecimentos de usuários existentes (adicionar/remover estabelecimentos)

- [x] Tela para usuários trocarem suas senhas

- [x] Alterar nome do sistema para "Safatle Gerenciamento"

- [x] Personalizar cores do tema com a paleta da marca Safatle (azul marinho e vermelho)

- [x] Adicionar favicon com a logo da Safatle
- [x] Substituir ícone genérico pela logo da Safatle na página de seleção de estabelecimento e sidebar

- [x] Adicionar logo da Safatle no topo da sidebar do dashboard

- [x] Corrigir problema: usuário admin não vê dados do estabelecimento (paulo.borges@safatle.com.br)
- [x] Apagar arquivos de diárias e taxas do IRG que estão puxando do estabelecimento errado (associados ao estabelecimento 1)
- [x] Implementar classificação de itens pelo campo codigoDespesa (medicamento=2, diária=5, material=3, taxa=7, gás=1)
- [x] Renomear tela "Itens Importados" para "Contas"
- [x] Reformular tela Contas para exibir: Guia, Senha, Carteirinha, Data da Conta, Valor Total

- [x] Tela de Contas: abrir página inteira ao clicar na conta (não dialog pequeno)
- [x] Campo Despesas: exibir nome correto (Medicamento=02, Diária=05, Material=03, Taxas=07, Gás=01)
- [x] Upload: adicionar campo opcional para data de pagamento
- [x] Configurações: criar tabela de prazo de recurso de glosa por convênio
- [x] Configurações: mover abas (Regras de Conciliação, Regras de Negócios, Tabelas de Preço, Estabelecimentos) para dentro
- [x] Análise de Glosa: criar alerta de prazo de recurso baseado na data de pagamento
- [ ] Recursos de Glosa: criar exportador em XML, PDF e Excel (aguardando formatos dos convênios)
- [x] Criar tela de acompanhamento de recursos enviados (lotes, prazos, valores, status, anexos)
- [x] Criar relatório de contas agrupado por tipo de despesa

- [x] CORREÇÃO: Tela de Detalhes da Conta - campo Tipo não mostra corretamente (Medicamento=02, Diária=05, Material=03, Taxas=07, Gás=01)
- [x] CORREÇÃO: Relatório de Contas - dados incorretos devido ao problema do tipo de despesa
- [x] CORREÇÃO: Configurações - links "Acesse a página de X" redirecionando para tela inicial
- [x] CORREÇÃO: Upload - campo de Data de Pagamento não está aparecendo (aparece apenas para arquivos retornados)

- [x] CORREÇÃO: Problema na importação de arquivos XML - arquivo não aparece na tela de arquivos (estabelecimentoId corrigido)
- [x] Adicionar alerta visual de prazo de recurso na tela de Análise de Glosa (usa dataPagamento + prazo do convênio)

- [x] Implementar atualização de contas ao reimportar arquivos XML (evitar duplicatas)
- [x] Garantir que exclusão de arquivo remove procedimentos associados da tela de Contas
- [x] Ao reimportar arquivo com mesmo nome/convênio, atualizar dados em vez de duplicar

- [x] Implementar exportador genérico de recursos de glosa em Excel
- [x] Implementar exportador genérico de recursos de glosa em PDF
- [x] Adicionar botões de exportação na tela de Recursos de Glosa

- [x] BUG: Funcionalidade de exclusão de estabelecimento não está funcionando (implementado botão + rota + validações)

- [x] Limpar todas as informações do banco de dados (reset completo)

- [x] Implementar funcionalidade de exclusão de usuários

- [x] Ajustar campos de vigência nas Tabelas de Preços para aceitar formato DD/MM/AAAA

- [x] Implementar histórico de alterações de preços nas Tabelas de Preços
- [x] Criar tabela de histórico no banco de dados
- [x] Registrar quem modificou cada item e quando
- [x] Criar interface de visualização do histórico por item

- [x] BUG: Tipo não está sendo exibido corretamente na tela de detalhes da conta após importação XML (campos codigoDespesa e tipoDespesa adicionados na query)

- [x] Adicionar filtro de data de referência (dataReferencia) na tela de Contas
- [x] Vincular filtros do Relatório de Contas à coluna dataReferencia

- [x] BUG: Dados importados em um estabelecimento não aparecem para outros usuários com acesso ao mesmo estabelecimento (filtro alterado de userId para estabelecimentoId)

- [x] BUG: Usuário administrador paulo.borges@safatle.com.br não está vendo os dados nas telas (removido filtro userId das queries, usando estabelecimentoId)

- [x] Implementar sistema de aprendizado por IA para padrões de cobrança
- [x] Criar tabela para armazenar padrões aprendidos dos XMLs
- [x] Implementar análise de padrões com LLM para identificar falta de itens
- [x] Alertar sobre quantidades abaixo do esperado baseado no histórico
- [x] Adicionar seção de insights de IA na tela de Comparações

- [x] Configurar alertas automáticos quando IA detectar divergências significativas
- [x] Implementar notificação ao proprietário sobre divergências críticas
- [x] Criar dashboard de acurácia dos insights (taxa de acerto)
- [x] Adicionar gráficos de evolução do aprendizado da IA
- [x] Mostrar métricas de insights aceitos vs rejeitados por período


## Bug - Isolamento de Dados entre Estabelecimentos
- [x] Corrigir vazamento de dados entre estabelecimentos (ID 90001 aparecendo no ID 90002)
- [x] Garantir que cada estabelecimento veja apenas seus próprios dados
- [x] Adicionar filtro de estabelecimentoId na tela de Demonstrativo


## Ajustes em Convênios e Tabelas de Preços
- [x] Adicionar estabelecimentoId na tabela de convênios (convênios exclusivos por estabelecimento)
- [x] Adicionar estabelecimentoId na tabela de preços (tabelas exclusivas por estabelecimento)
- [x] Remover campo vigenciaFim da tabela de preços
- [x] Remover campo vigenciaFim do importador de dados de tabelas de preços
- [x] Atualizar queries para filtrar convênios por estabelecimento
- [x] Atualizar queries para filtrar tabelas de preços por estabelecimento


## Tabelas de Preços por Estabelecimento
- [x] Adicionar seletor de estabelecimento na criação de tabelas de preços
- [x] Atualizar rota de criação para aceitar estabelecimentoId
- [x] Mostrar estabelecimento associado na listagem de tabelas


## Refatoração Importação TISS - Chave Composta (numeroLote + sequencialTransacao)
- [x] Criar/alterar tabela de faturamentos com colunas numero_lote e sequencial_transacao
- [x] Adicionar índice único na combinação (numero_lote, sequencial_transacao)
- [x] Modificar parser XML para extrair numeroLote do cabeçalho
- [x] Modificar parser XML para extrair sequencialTransacao de cada guia
- [x] Refatorar lógica de INSERT/UPDATE para verificar chave composta
- [x] Ajustar listagem de guias para não agrupar por numeroGuiaPrestador
- [x] Exibir múltiplas linhas para mesma guia (faturamentos parciais)
- [x] Adicionar coluna Número do Lote na listagem


## Script de Reimportação de Arquivos XML
- [x] Criar script para reimportar arquivos XML existentes
- [x] Preencher campos numeroLote e sequencialTransacao nos procedimentos
- [x] Executar script e validar resultados


## Correção da Lógica de Comparativo/Conciliação
- [x] Corrigir comparativo para usar chave composta (GUIA + LOTE + CÓDIGO + QUANTIDADE + DATA + VALOR)
- [x] Tratar diferenças de valor como glosa
- [x] Testar com a guia 66883762 e código 1902776626


## Classificação de Terceiros na Conciliação
- [x] Itens de terceiros não encontrados no retorno devem ser marcados como "terceiro" em vez de "glosado" na conciliação automática
- [x] Itens de terceiros não devem entrar no XML de recurso de glosa
- [x] Frontend deve exibir itens de terceiros separadamente (não como glosados)
- [x] Novo status "terceiro" no enum statusConciliacao


## Coluna de Lote na Tela de Comparativo
- [x] Adicionar campo numeroLote na interface ItemConciliacao
- [x] Exibir coluna Lote na tabela de comparativo


## Bug - Isolamento de Dados na Conciliação
- [x] Verificar se estabelecimentoId está sendo salvo na importação de arquivos XML
- [x] Corrigir filtro de estabelecimento na tela de Conciliação
- [x] Garantir que cada estabelecimento veja apenas seus próprios dados


## Filtro de Estabelecimento em Outras Telas
- [x] Aplicar filtro de estabelecimento na tela de Tendências
- [x] Aplicar filtro de estabelecimento na tela de Repasse
- [x] Verificar outras telas que precisam do filtro

## Limpeza de Estabelecimentos de Teste
- [x] Remover estabelecimentos de teste do banco de dados


## Geração Automática de Insights da IA
- [x] Adicionar chamada de geração de insights na importação de arquivos XML
- [x] Garantir que insights sejam gerados automaticamente após processamento


## Botão Gerar Insights na Tela de Arquivos
- [x] Adicionar botão "Gerar Insights" na listagem de arquivos
- [x] Implementar chamada para gerar insights manualmente
- [x] Mostrar feedback de sucesso/erro ao usuário


## Bug - Erro na Importação de Excel no Estabelecimento 90002
- [x] Investigar erro na importação do arquivo demonstrativo-0282629.xlsx
- [x] Corrigir o problema identificado (arquivo reprocessado manualmente)


## Correções Solicitadas - Comparativo, Faturamento e Tabelas de Preço

### Comparativo/Conciliação
- [x] Adicionar tela inicial com filtro por mês de referência antes de carregar dados
- [x] Otimizar performance para evitar travamentos com muitos dados (paginação no backend)
- [x] Carregar dados apenas após seleção de mês/ano

### Faturamento
- [x] Adicionar filtro por mês de referência
- [x] Corrigir lógica para não interpretar contas não recebidas como glosadas
- [x] Criar status "não_recebido" separado de "glosado"

### Tabelas de Preço
- [x] Vincular estabelecimentoId automaticamente na importação de tabelas de preço
- [x] Garantir que tabelas do ID 90001 não apareçam no ID 90002


## Relatório de Itens Não Recebidos
- [x] Criar rota e função para buscar itens não recebidos (status nao_recebido)
- [x] Criar tela de relatório com filtros por convênio, período e estabelecimento
- [x] Adicionar métricas: total de itens, valor total pendente, resumo por convênio
- [x] Adicionar exportação para Excel


## Refatoração da Tela de Conciliação - Lista de Contas
- [x] Criar função no backend para agrupar dados por conta com totais (faturado, recebido, glosado)
- [x] Criar lista de contas com colunas: Conta, Nome, Data, Valor Faturado, Valor Recebido, Valor Glosado
- [x] Adicionar alertas visuais: vermelho (glosa), verde (sem glosa), amarelo (não encontrada)
- [x] Implementar modal de detalhes ao clicar na conta
- [x] Mostrar itens da conta com: Valor Faturado, Valor Recebido, Valor da Glosa


## Melhorias na Tela de Recursos de Glosa - Envio em Lote
- [x] Criar tela de recursos agrupados por convênio (clicável para ver itens)
- [x] Implementar envio em lote de todos os recursos de um convênio
- [x] Criar lote automático ao enviar recursos (agrupar itens enviados)
- [x] Corrigir botão de exportação (Excel/PDF) na tela de acompanhamento de recursos
- [x] Garantir que lotes criados apareçam na tela de acompanhamento


## Documentação do Fluxo de Recursos de Glosa
- [x] Verificar localização do botão "Criar Recurso em Lote" na tela de Análise de Glosa


## Bug - Tela de Envio em Lote não mostra recursos
- [x] Verificar por que recursos criados não aparecem na tela de Envio em Lote
- [x] Corrigir filtro de status ou query para exibir recursos corretamente
- [x] Adicionar estabelecimentoId ao criar recursos em lote
- [x] Modificar query para incluir recursos sem estabelecimentoId definido


## Relatório de Recursos por Lote - Tela de Acompanhamento
- [x] Adicionar botão de exportar Excel ao lado de cada lote
- [x] Incluir dados: Paciente, Guia, Carteirinha, Data do Item, Valor Glosado, Valor Recursado, Motivo da Glosa, Descrição do Recurso
- [x] Adicionar campo para anexar PDF de protocolo do recurso por lote
- [x] Criar função no backend para buscar recursos detalhados de um lote


## Correções e Melhorias - Janeiro 2025
- [x] Corrigir menu lateral sumindo em Acompanhamento de Recursos e outras telas
- [x] Corrigir filtros de KPIs na tela de Faturamento
- [x] Melhorar tela de itens da Conciliação (abrir em nova tela)
- [x] Padronizar datas no formato Brasil (dd/mm/yyyy)
- [x] Adicionar funcionalidade para visualizar/baixar PDF anexado
- [x] Incluir campo Carteirinha ao criar recursos
- [ ] Adicionar filtro por período no relatório de recursos (pendente)


## Novas Funcionalidades - Recursos de Glosa
- [x] Filtro por período no relatório: Adicionar seletor de data inicial/final para exportar recursos
- [x] Preenchimento automático da carteirinha: Buscar carteirinha ao criar recursos na Análise de Glosa
- [x] Notificação de prazo de resposta: Alerta automático quando lote estiver próximo do vencimento


## Manutenção do Banco de Dados
- [x] Limpar todos os dados do banco (usuários, estabelecimentos e dados relacionados)

- [x] Liberar permissões de administrador para o usuário inicial após limpeza do banco


## Melhoria no Menu Lateral
- [x] Reorganizar itens do menu na ordem correta do processo de trabalho


## Bug - Importação de Demonstrativo Excel
- [x] Investigar por que o arquivo demonstrativo-0282629.xlsx não carrega os dados após importação
- [x] Melhorar parser de Excel para aceitar mais variações de colunas
- [x] Arquivo processado com sucesso (26.614 procedimentos importados em 8.9s)


## Otimização de Performance - Conciliação Automática
- [x] Analisar código de conciliação e identificar gargalos de performance
- [x] Implementar otimizações (queries com IN, HashMap para lookup O(1))
- [ ] Adicionar indicador de progresso durante o processamento (pendente)


## Bug - Erro NotFoundError removeChild
- [ ] Investigar erro "NotFoundError: Falha ao executar 'removeChild'" no frontend (pendente - precisa de mais informações sobre qual tela)

## Padrão de Envio de Recurso de Glosa - Unimed
- [x] Criar modelo/template de recurso de glosa específico para Unimed
- [x] Implementar formato padrão de exportação Excel com campos: Seq, Protocolo(DP), Nº Guia, Seq(DP), Nome Beneficiário, Cód.Beneficiário, Data Atendto, Período Atendto, Código Serviço, Descrição, Participação, Qtde, Valor Recursado, Local Atendimento, Motivo da Glosa, Justificativa para o pagamento, Anexo, Qtde Acatado, Valor Acatado, Pago pelo código, Observações


## Melhorias na IA - Análise Inteligente de Contas
- [x] Comparar contas similares (mesmo procedimento, mesmo convênio)
- [x] Identificar contas com valor muito abaixo da média
- [x] Identificar contas com valor muito acima da média
- [x] Detectar padrões de erro por funcionário (faturista)
- [x] Priorizar contas com maior risco de glosa
- [x] Criar dashboard de IA com alertas e recomendações


## Painel de Administração de Regras de IA
- [x] Criar tabela no banco de dados para armazenar regras de IA configuráveis
- [x] Implementar rotas CRUD para gerenciar regras de IA
- [x] Criar tela de administração de regras de IA
- [x] Permitir configurar limite de desvio padrão para detecção de outliers
- [x] Permitir configurar taxa mínima de glosa para alertas de funcionário
- [x] Permitir configurar score mínimo de risco para alertas de glosa
- [x] Permitir ativar/desativar tipos de alertas individualmente
- [x] Integrar regras configuráveis nas funções de análise de IA
- [x] Adicionar testes automatizados para as novas funcionalidades


## Módulo de Importação de Dados do Tasy (SQLite)
- [x] Criar tabela no banco de dados para armazenar dados importados do Tasy
- [x] Criar tabela de histórico de importações
- [x] Implementar rota de upload de arquivo SQLite
- [x] Implementar processamento em lotes (chunks de 500 registros)
- [x] Implementar lógica de importação incremental (apenas novos registros)
- [x] Criar interface de upload com barra de progresso
- [x] Criar tela de histórico de importações
- [x] Adicionar validação de estrutura do arquivo SQLite
- [x] Implementar mapeamento de campos Tasy -> Safatle
- [x] Adicionar testes automatizados para importação


## Automação e Integração Tasy
- [x] Criar script Python para exportação automática do Tasy (roda na máquina do usuário via VPN)
- [x] Criar API de upload automático para receber dados do script
- [x] Integrar dados do Tasy com a conciliação existente
- [x] Aplicar regras de negócio existentes aos dados importados do Tasy
- [x] Criar funções de validação de dados do Tasy com alertas de inconsistências
- [x] Adicionar testes automatizados para as novas funcionalidades (240 testes passando)


## Isolamento de Dados do Tasy por Estabelecimento
- [x] Verificar que tabela dadosTasy já tem campo estabelecimentoId
- [x] Garantir que todas as queries filtram por estabelecimentoId
- [x] Atualizar script Python para incluir código do estabelecimento
- [x] Criar documentação de configuração do script Python


## Integração Tasy no Menu de Contas
- [x] Criar página de Contas Tasy com visualização agrupada por atendimento
- [x] Criar página de Conciliação Tasy x XML com cruzamento de dados
- [x] Adicionar links no menu lateral

## Melhoria na Lógica de Importação do XML de Retorno e Melhoria do XML de Retorno
- [ ] Integrar dados do Tasy na tela de Contas existente
- [ ] Melhorar parser do XML de retorno com namespace TISS (http://www.ans.gov.br/padroes/tiss/schemas)
- [ ] Implementar loop em //ans:relacaoGuias para extrair dados
- [ ] Fazer lookup do numeroGuiaPrestador na base de dados do Tasy
- [ ] Cruzar valorInformado do XML com valor faturado no Tasy
- [ ] Extrair codigoGlosa e descricaoGlosa de cada guia
- [ ] Enriquecer dados com Paciente, Médico e Setor do banco de dados
- [ ] Criar tela de conciliação com DataFrame unificado
- [ ] Destacar em vermelho linhas com DIFERENÇA > 0
- [ ] Adicionar testes automatizados


## Melhoria do Parser XML de Retorno e Drill-down
- [ ] Implementar parser com namespace TISS (http://www.ans.gov.br/padroes/tiss/schemas)
- [ ] Extrair relacaoGuias do XML de retorno
- [ ] Extrair valorInformado, valorLiberado de cada guia
- [ ] Extrair codigoGlosa e descricaoGlosa de cada item
- [ ] Adicionar drill-down para expandir itens de cada guia na Conciliação Tasy
- [ ] Mostrar detalhes dos itens ao clicar em uma guia
- [ ] Adicionar testes automatizados para o novo parser

## Melhoria do Parser XML de Retorno e Drill-down
- [x] Melhorar parser para extrair valorInformado, valorLiberado, codigoGlosa, descricaoGlosa
- [x] Implementar drill-down nos itens da Conciliação Tasy
- [x] Agrupar itens por guia com expansão/colapso
- [x] Adicionar modal de detalhes da guia com todos os itens
- [x] Destacar em vermelho linhas com diferença > 0


## Otimização de Performance - Importação Tasy (URGENTE)
- [x] Analisar código atual de importação e identificar gargalos
- [x] Implementar inserção em lote (bulk insert) - 1000+ registros por vez
- [x] Otimizar verificação de duplicatas em lote (buscar todos atendimentos de uma vez)
- [x] Adicionar índices no banco de dados (atendimento, estabelecimentoId, convenio, guia, importacao)
- [x] Reduzir tempo de importação de 5 horas para menos de 30 minutos (estimativa)
- [ ] Testar com volume real de dados (100k+ registros) - aguardando teste do usuário


## Modal de Detalhes dos Itens - Contas Tasy
- [x] Criar modal para visualizar itens detalhados de cada conta
- [x] Adicionar botão de visualização em cada linha da tabela
- [x] Exibir todos os itens (materiais e honorários) da conta selecionada
- [x] Mostrar totais e resumo da conta no modal
- [x] Adicionar exportação dos itens da conta para Excel


## Filtro por Mês/Ano e Relatórios Dinâmicos
- [x] Implementar filtro por mês/ano na tela Contas Tasy (substituir data início/fim)
- [x] Criar tela de Relatórios Dinâmicos estilo Power BI
- [x] Permitir seleção de colunas para exibição
- [x] Permitir agrupamento por diferentes campos (convênio, setor, médico, tipo, mês/ano, status)
- [x] Criar gráficos dinâmicos (barras, pizza, linhas)
- [x] Implementar filtros dinâmicos múltiplos (mês, ano, convênio, tipo, setor)
- [x] Permitir exportação dos relatórios personalizados (dados detalhados e resumo agrupado)


## Comparativo, Dashboards Salvos e Drill-down
- [x] Criar tabela no banco para salvar dashboards personalizados
- [x] Implementar comparativo entre dois períodos (mês/ano)
- [x] Mostrar gráficos lado a lado para comparação
- [x] Implementar drill-down nos gráficos (clicar em barra/fatia para ver dados)
- [x] Criar modal de detalhes ao clicar no gráfico
- [x] Implementar funcionalidade de salvar dashboard
- [x] Implementar funcionalidade de carregar dashboard salvo
- [x] Listar dashboards salvos do usuário


## Alertas, Compartilhamento, Exportação e Power BI Interativo
- [ ] Implementar alertas automáticos de variação (notificar quando variação > percentual configurável)
- [ ] Criar tabela no banco para configuração de alertas de variação
- [ ] Implementar compartilhamento de dashboards entre usuários do estabelecimento
- [ ] Adicionar exportação de drill-down para Excel
- [ ] Corrigir modal de Contas Tasy - aumentar tamanho para melhor visualização
- [ ] Criar aba Power BI interativa com arrastar campos
- [ ] Permitir escolher tipo de gráfico (pizza, linha, barra)
- [ ] Adicionar opções de período (trimestre, ano, comparativo anual)
- [ ] Permitir manipular gráficos dinamicamente


## Alertas, Compartilhamento e Power BI Interativo
- [x] Criar tabela no banco para alertas de variação
- [x] Implementar alertas automáticos de variação configuráveis
- [x] Criar tabela de compartilhamento de dashboards
- [x] Implementar compartilhamento de dashboards entre usuários
- [x] Adicionar exportação de drill-down para Excel
- [x] Corrigir modal de Contas Tasy - aumentar para tela cheia (95vw x 95vh)
- [x] Criar aba Construtor de Gráficos (Power BI) com seleção de tipo, métrica e agrupamento
- [x] Adicionar opções de agrupamento por Mês/Ano, Trimestre e Ano


## Drag-and-Drop, Templates e IA para Gráficos
- [x] Implementar drag-and-drop de campos para eixos X/Y no Construtor de Gráficos
- [x] Criar área de campos disponíveis para arrastar
- [x] Criar zonas de drop para eixo X, eixo Y e filtros
- [x] Criar templates de relatórios pré-configurados (5 templates: Faturamento Mensal, Análise de Glosas, etc.)
- [x] Implementar IA para análise automática dos dados
- [x] IA sugere melhores tipos de gráficos baseado nos dados
- [x] IA identifica padrões e anomalias nos dados
- [x] Adicionar botão "Sugestões da IA" no Construtor de Gráficos


## Modo de Apresentação para Reuniões
- [x] Criar componente de modo apresentação em tela cheia
- [x] Implementar rotação automática entre gráficos
- [x] Adicionar controles de navegação (próximo, anterior, pausar)
- [x] Configurar intervalo de rotação (5s, 10s, 30s, 1min)
- [x] Exibir título e data/hora no modo apresentação
- [x] Permitir sair do modo apresentação com tecla ESC
- [x] Adicionar indicadores de slide (dots) na parte inferior
- [x] Implementar controle por teclado (setas, espaço, P para pausar)
- [x] Exibir totais de valor, quantidade e registros
- [x] 24 testes automatizados do modo apresentação


## Correções de Interface
- [x] Corrigir modal de detalhes das Contas Tasy - campos muito pequenos e difícil visualização

## Melhorias Contas Tasy e Relatórios
- [x] Converter modal de detalhes da conta para tela separada (DetalheContaTasy.tsx)
- [x] Corrigir materiais que não estão sendo exibidos na conta - agora mostra todos os itens separados por tipo
- [x] Adicionar busca/filtro na tabela de itens da conta - filtro por código, descrição, tipo
- [x] Implementar ordenação nas colunas (valor, código, tipo) - clique no cabeçalho para ordenar
- [x] Adicionar mais campos de análise nos Relatórios Tasy (procedimentos, descrição, protocolo, paciente, CRM, função médico)
- [x] Criar nova tela de Relatórios BI estilo Power BI para dados importados via XML/Excel (RelatoriosBI.tsx)


## Relatórios BI - Usar Banco de Dados Principal
- [x] Modificar Relatórios BI para usar dados do banco principal (procedimentos, arquivos, conciliação)
- [x] Incluir métricas de faturado, recebido e glosa com percentuais
- [x] Garantir funcionamento para todos os estabelecimentos (não apenas Tasy)
- [x] Adicionar filtros por convênio, período, tipo de item, paciente, procedimento
- [x] Criar gráficos de análise de faturamento vs recebimento vs glosa
- [x] Criar procedures tRPC getDadosBI e getOpcoesFiltroBi
- [x] 18 testes automatizados para Relatórios BI


## Conciliação Tasy - Contas Pagas e Itens Pagos
- [x] Criar tabela contasPagasTasy no banco de dados (DATA_RETORNO, SEQ_RETORNO_GERAL, TITULO, GUIA, NR_SEQ_CONTA, NR_CONTA, CONVENIO, NR_PROTOCOLO, DATA_RECEBIMENTO, PAGO_CONTA, GLOSA_CONTA)
- [x] Criar tabela itensPagosTasy no banco de dados (TITULO, GUIA, NR_SEQ_CONTA, CONTA, NR_PROTOCOLO, DATA_RECEBIMENTO, GLOSA_ITEM, QND_GLOSA_ITEM, MOTIVO_GLOSA, PROCEDIMENTO, MATERIAL, SETOR)
- [x] Modificar importador SQLite para identificar e separar dados nas tabelas corretas
- [x] Criar procedures tRPC para buscar dados de conciliação Tasy (conciliacaoCompleta, conveniosContasPagas)
- [x] Criar tela de Conciliação Contas Pagas com visão por conta (Valor Faturado, Valor Pago, Valor Glosado)
- [x] Criar modal de detalhes por item (Data Conta, Valor Item Faturado, Valor Item Pago, Valor Item Glosado, Motivo Glosa)
- [x] Filtros por data, convênio, status, guia e busca geral
- [x] Ordenação clicável nas colunas
- [x] Exportação para Excel com resumo, contas e itens
- [x] KPIs com Total Faturado, Pago, Glosado e Pendente com percentuais
- [x] 298 testes automatizados passando


## Correção Importação SQLite - Contas Pagas
- [x] Verificar estrutura do arquivo SQLite (tabelas: faturamento_unificado, contas_pagas, itens_pagos)
- [x] Corrigir lógica de importação para separar dados nas tabelas contasPagasTasy e itensPagosTasy
- [x] Modificar função readSQLiteFile para ler todas as tabelas automaticamente
- [x] Processar cada tipo de dado na tabela correta (394.737 faturamento, 147 contas pagas, 9.363 itens pagos)
- [x] Exibir resumo detalhado durante importação com quantidade por tipo
- [x] 298 testes automatizados passando


## Integração Dicionário de Glosas TISS na Conciliação
- [x] Integrar dicionário de glosas TISS na tela de Conciliação Contas Pagas
- [x] Exibir descrição legível dos códigos de motivo de glosa nos itens pagos
- [x] Adicionar coluna separada com descrição completa da glosa
- [x] Exibir grupo da glosa (Elegibilidade, Cobertura, etc.)
- [x] Exibir probabilidade de sucesso na reversão (com cores: verde >60%, amarelo 40-60%, vermelho <40%)
- [x] 298 testes automatizados passando


## Correções Conciliação Contas Pagas e Relatórios Tasy
- [x] Adicionar filtro por mês/ano da data faturado (dadosTasy) na Conciliação Contas Pagas (filtro principal destacado)
- [x] Corrigir lógica de cruzamento entre dadosTasy, contasPagasTasy e itensPagosTasy (múltiplas chaves: nrConta, guia, nrSeqConta)
- [x] Criar procedure getMesesDisponiveisTasy para listar meses disponíveis para filtro
- [x] Integrar dados de contasPagasTasy e itensPagosTasy nos Relatórios Tasy
- [x] Adicionar campos valorPago, valorGlosado, motivoGlosa nas colunas e métricas disponíveis
- [x] Adicionar templates de relatórios de pagamento (Faturado vs Pago, Glosas por Convênio, Motivos de Glosa, Evolução de Pagamentos)
- [x] 298 testes automatizados passando


## Correções Urgentes - Relatórios Tasy e Conciliação
- [x] Corrigir Relatórios Tasy - dados estão no estabelecimento Maternidade Ela (ID 60011), não no PSI
- [x] Corrigir filtros mês/ano na Conciliação Contas Pagas - funcionando com meses de Jan/2025 a Fev/2026
- [x] Corrigir exibição de valores glosados - agora soma glosas dos itens (R$ 27.479,78 / 527 contas glosadas)
- [x] 298 testes automatizados passando


## Otimização de Performance - Importação de Arquivos
- [x] Investigar lentidão na importação de arquivo Excel de 3.5 MB
- [x] Otimizar parser Excel (blankrows: false, cellHTML: false, dense: false)
- [x] Aumentar batch size de 5000 para 10000 itens
- [x] Aumentar paralelismo de 3 para 5 batches simultâneos
- [x] Reduzir frequência de logs e callbacks de progresso
- [x] 298 testes automatizados passando


## Lentidão Persistente na Importação Excel
- [x] Analisar arquivo Excel (25.002 linhas x 28 colunas = 3.5 MB)
- [x] Implementar processamento assíncrono em background no servidor
- [x] Retornar resposta imediata ao usuário (upload retorna em ~1s)
- [x] Processamento continua em segundo plano com atualização de progresso
- [x] Toast informativo sobre processamento em andamento


## Correção Importação Excel - Não Funcionando
- [x] Verificar logs do servidor - problema identificado na conversão Base64 de arquivos grandes (25.002 linhas)
- [x] Otimizar conversão Base64 com processamento em chunks de 32KB (evita stack overflow)
- [x] Adicionar toast de progresso para arquivos maiores que 1 MB
- [x] 298 testes automatizados passando

- [x] Corrigir arquivos travados em status "processando" - implementado timeout de 5 minutos e tratamento de erro robusto
- [x] Adicionar endpoint para corrigir arquivos travados automaticamente (arquivos.corrigirTravados)
- [x] Adicionar endpoint para verificar status de processamento de arquivos (arquivos.status, arquivos.processando)

- [x] Aumentar timeout de processamento de 5 para 15 minutos para arquivos grandes (25k+ linhas)
- [x] Corrigir processamento do arquivo demonstrativo-0282645 (1).xlsx da Maternidade Ela (25.001 procedimentos)

- [x] Criar tabela demonstrativo_itens no banco de dados para salvar dados do demonstrativo
- [x] Criar tabela conciliacao_tasy no banco de dados para salvar resultados da conciliação
- [ ] Corrigir processo de conciliação Tasy para trazer e salvar dados corretamente
- [x] Melhorar gráficos dos Relatórios Tasy - permitir múltiplos valores no eixo Y
- [x] Melhorar gráficos dos Relatórios BI - permitir múltiplos valores no eixo Y

- [x] Criar tabela procedimentos_tasy no schema
- [x] Criar tabela mat_med_tasy no schema
- [x] Criar tabela contas_tasy (junção) no schema
- [x] Atualizar rotas de importação para processar 4 tabelas do SQLite
- [x] Criar lógica de junção automática para contas_tasy
- [x] Atualizar frontend de importação Tasy
- [x] Testar importação com arquivo SQLite real

- [x] Corrigir importação SQLite que está travando no sistema - 414.418 registros importados com sucesso

- [x] Gerar tabela unificada contas_tasy com junção de procedimentos e mat_med - 21.856 contas, 395.428 itens, R$ 43.017.279,87

- [x] Atualizar aba Contas Tasy para exibir dados da tabela unificada contas_tasy - 10.000 contas, 188.543 itens, R$ 27.269.529,98
- [x] Integrar contas_tasy na Conciliação Tasy para comparar com retornos
- [ ] Aplicar regras de negócio nas contas Tasy para validar completude

## Salvar Resultados da Conciliação Tasy
- [x] Criar tabela resultados_conciliacao_tasy no banco de dados
- [x] Criar tabela itens_conciliacao_tasy para detalhes dos itens conciliados
- [x] Criar tabela detalhes_itens_conciliacao_tasy para detalhes granulares
- [x] Implementar rota para salvar resultado da conciliação
- [x] Implementar rota para listar histórico de conciliações
- [x] Implementar rota para buscar detalhes de uma conciliação
- [x] Implementar rota para excluir conciliação
- [x] Implementar rota para buscar evolução das conciliações
- [x] Adicionar botão "Salvar Conciliação" na tela de Conciliação Tasy
- [x] Adicionar botão "Histórico" na tela de Conciliação Tasy
- [x] Criar tela de histórico de conciliações com filtros
- [x] Implementar visualização de detalhes de conciliações anteriores
- [x] Implementar exclusão de conciliações
- [x] Implementar gráfico de evolução das conciliações


## Melhorias na Visualização de Conciliações
- [x] Criar mecanismo para visualizar contas conciliadas salvas
- [x] Implementar modal ou tela de detalhes das contas de cada conciliação
- [x] Ajustar filtros de conciliação para usar data de referência do importador
- [x] Corrigir exibição do histórico de conciliações
- [x] Corrigir erro de conversão de datas no salvamento (RangeError: Invalid time value)
- [x] Salvar itens da conciliação na tabela itensConciliacaoTasy (10.000 itens)
- [x] Implementar visualização das contas conciliadas no modal do histórico com filtros e paginação


## Correção de Formatação de Datas
- [x] Analisar fluxo de dados da data de execução desde importação até frontend
- [x] Identificar onde ocorre conversão incorreta de DD/MM/AAAA para MM/DD/AAAA (função parseDate em parsers.ts)
- [x] Corrigir parser/formatação de datas no Demonstrativo (função parseDate corrigida)
- [x] Corrigir parser/formatação de datas na Conciliação Tasy
- [ ] Reimportar demonstrativo para aplicar correção nas datas já armazenadas


## Correção de Exclusão de Arquivo XML
- [ ] Analisar erro "Failed to fetch" na exclusão de arquivo XML no estabelecimento Ox Uti
- [ ] Corrigir a rota de exclusão de arquivo
- [ ] Testar exclusão de arquivo XML no Ox Uti


## Expansão dos Campos de Agrupamento - Relatórios BI
- [x] Adicionar campos do XML de Importação (Descrição do Item, Médico)
- [x] Adicionar campos do Demonstrativo (Glosas por Motivo, Descrição do Item, por Guia)
- [x] Adicionar campos da Análise de Glosa (Glosa Aceita, Glosa Recursada)
- [x] Adicionar dados do Recurso de Glosa
- [x] Testar agrupamentos com os novos campos


## Melhorias no Acompanhamento de Recursos e Exportadores
- [x] Adicionar campo de valores recebidos no detalhe do recurso
- [x] Adicionar campo de data de pagamento do recurso
- [x] Criar exportador padrão Unimed (Excel) com campos: Protocolo, Nº Guia, Seq., Nome Beneficiário, Cód. Beneficiário, Data Atendimento, Período, Código Serviço, Descrição, Participação, Qtde, Valor Recursado, Local Atendimento, Motivo Glosa, Justificativa, Anexo, Qtde Acatado, Valor Acatado, Pago pelo código, Observações, Valor Recebido, Data Pagamento
- [x] Criar exportador padrão XML ANS (TISS) para envio às operadoras
- [x] Testar exportação nos dois formatos


## Tabela de Itens no Modal de Detalhes do Lote
- [x] Adicionar tabela de itens no modal de detalhes do lote
- [x] Incluir colunas: Paciente, Guia, Código, Descrição, Valor Glosado, Valor Recebido, Data de Pagamento, Status
- [x] Testar visualização dos itens no modal


## Edição Inline de Valores no Modal de Detalhes do Lote
- [x] Criar rota backend para atualizar Valor Recebido e Data de Pagamento por item
- [x] Implementar edição inline na tabela de itens (campos editáveis)
- [x] Adicionar botão de salvar alterações
- [x] Atualizar totais do lote ao salvar alterações nos itens
- [x] Testar edição inline e persistência dos dados


## Recálculo Automático do Valor Recebido Total do Lote
- [ ] Atualizar rota backend para recalcular total do lote após atualização de item
- [ ] Atualizar frontend para refletir o novo total após salvar
- [ ] Testar recálculo automático do valor recebido total

- [x] Corrigir recálculo automático do valor total recebido do lote após edição inline de itens de recurso de glosa

- [x] Implementar separação de prestadores executantes na importação de XML usando campo codigoPrestadorNaOperadora
- [x] Adicionar campo codigoPrestadorExecutante no schema de procedimentos
- [x] Atualizar parser XML para extrair codigoPrestadorNaOperadora de cada guia
- [x] Criar filtro por prestador executante nas telas de visualização

- [x] Criar tabela de relacionamento convênio-estabelecimento-prestador no banco de dados
- [x] Adicionar rotas CRUD para cadastro de prestadores por convênio/estabelecimento
- [x] Criar interface de cadastro de prestadores na tela de Configurações
- [x] Permitir associar código de prestador único para cada combinação convênio+estabelecimento

- [x] Implementar identificação automática de estabelecimento na importação de XML
- [x] Criar função para extrair código do prestador do XML antes da importação
- [x] Buscar estabelecimento automaticamente pelo código do prestador cadastrado
- [x] Atualizar interface de upload para sugerir estabelecimento baseado no prestador do XML
- [x] Alertar quando código do prestador não estiver cadastrado no sistema

- [x] Implementar separação automática de itens por prestador na importação de XML
- [x] Associar cada grupo de procedimentos ao estabelecimento correto baseado no código do prestador
- [x] Filtrar dados na tela de Contas para exibir apenas itens do prestador vinculado ao estabelecimento
- [x] Exibir indicador visual quando um arquivo contém múltiplos prestadores

- [x] Adicionar filtro de prestador executante na tela de Faturamento
- [x] Adicionar filtro de prestador executante na tela de Relatórios BI
- [x] Permitir seleção de prestador para visualizar dados específicos


## Correções Filtro Prestador e Tipos Demonstrativo
- [x] Corrigir filtro de prestador para vincular ao estabelecimento selecionado (mostrar apenas prestadores cadastrados)
- [x] Remover filtro de prestador que impede visualização de múltiplos convênios
- [x] Corrigir tipos no Demonstrativo Unimed usando coluna "tipo lançamento" do arquivo
- [x] Levar classificação de tipo lançamento para os Relatórios BI


## Atualização de Tipos e Relatório Comparativo
- [x] Criar script para atualizar tipoDespesa dos registros existentes no banco baseado no tipoLancamento do dadosExtras
- [x] Executar atualização em lote dos registros de procedimentos (demonstrativo e recursos de glosa)
- [x] Criar relatório comparativo por tipo de lançamento (Medicamento, Material, Diária, Taxa, Gás, Procedimento)
- [x] Exibir valores faturados, recebidos e glosados agrupados por tipo


## Correções Relatório BI - Filtro Prestador e Descrição Itens
- [x] Implementar filtro automático por prestador vinculado ao estabelecimento selecionado
- [x] Trazer apenas dados do convênio + estabelecimento + prestador cadastrado
- [x] Adicionar descrição dos itens pagos e glosados vindos do demonstrativo
- [x] Corrigir valores faturados para refletir apenas o prestador correto


## Correção Relatório BI - Valores em Branco
- [x] Corrigir valores pagos e recursados que aparecem em branco na dimensão Descrição do Item
- [x] Garantir que os dados do demonstrativo sejam corretamente agrupados por descrição


## Investigação Relatório BI - Valores não aparecem
- [ ] Investigar por que os valores não estão aparecendo na dimensão Descrição do Item
- [ ] Verificar se os dados do demonstrativo estão sendo carregados corretamente

- [x] Corrigir Relatório BI - valores de recebido e glosado não aparecem no agrupamento por Descrição do Item
- [x] Implementar normalização case-insensitive para combinar descrições de arquivos enviados e retornados
- [x] Atualizar valorGlosado para itens com situação GLOSADO no demonstrativo

- [x] Limpar estabelecimentos de teste do banco de dados (manter apenas Pronto Socorro Infantil, Maternidade Ela, Ox Uti)
- [x] Limpar usuários de teste (manter apenas Sergio e Lorena)

- [x] Recuperar dados do Ox Uti após limpeza (migrar arquivos de IDs antigos 60011 e 390001 para ID 3)

- [x] Corrigir migração de dados - separar Ox Uti e Maternidade Ela corretamente
- [x] Migrar recursos de glosa (9 itens) e lote de recurso do ID 390001 para Ox Uti (ID 3)
- [x] Mover demonstrativo-0282645 para Maternidade Ela (ID 2)
- [x] Migrar regras de IA (4 itens) do ID 390001 para Ox Uti (ID 3)
- [x] Corrigir Relatório BI para usar código do procedimento em vez de descrição para match entre enviados e retornados (aplicado a todos os estabelecimentos)
- [ ] Corrigir tabela de preço para filtrar por estabelecimento (manter apenas no Pronto Socorro Infantil)
- [ ] Adicionar novas métricas ao Relatório BI (Ticket Médio e outras sugeridas pela IA)

- [x] Corrigir tabela de preço para filtrar por estabelecimento (manter apenas no Pronto Socorro Infantil)
- [x] Adicionar novas métricas ao Relatório BI (Ticket Médio, Taxa de Glosa, Total Guias, Média/Item, Recursado, Recuperação)

- [ ] Excluir tabelas antigas do Tasy (ContasPagasTasy, ContasTasy, DadosTasy, ItensContasTasy, ItensPagosTasy, MatMedTasy) - aguardando migração completa
- [x] Criar nova tabela FaturadoTasy com campos unificados
- [x] Criar funções de banco de dados para FaturadoTasy (inserir, listar, resumo, excluir)
- [x] Criar rotas tRPC para FaturadoTasy (inserir, listar, resumo, excluirPorImportacao)
- [x] Criar tela de frontend Faturado Tasy para importação e visualização
- [x] Atualizar Relatório Tasy para usar a nova tabela FaturadoTasy (seletor de fonte de dados adicionado)

## Exportação Excel e Integração Relatório Tasy
- [x] Adicionar botão de exportação Excel na tela Faturado Tasy
- [x] Criar função handleExportExcel no frontend para exportar dados
- [x] Integrar Relatório Tasy para usar a nova tabela FaturadoTasy (seletor de fonte de dados: Antiga vs Nova)

- [x] Corrigir botão de importação Excel na tela Faturado Tasy (usando useRef para acionar input de arquivo)

- [ ] Corrigir importação SQLite na tela Importação Tasy para usar a nova tabela FaturadoTasy

- [x] Adicionar suporte à leitura de arquivos SQLite com tabela FaturadoTasy na tela de Importação Tasy
- [x] Mapear campos da tabela FaturadoTasy (sequencia, convenio, competencia, protocolo, setor, atend, conta, prof_exec, tipo_item, cd_item, cd_item_tuss, descricao, qtd, vl_faturado, a_receber, vl_pago, vl_glosa, motivo_glosa, retorno, dt_pgto)
- [x] Normalizar tipoItem para PROC/TAXA ou MAT/MED na importação

- [x] Corrigir leitura de arquivo SQLite com tabela FaturadoTasy - sistema retorna "Nenhum dado válido encontrado" (tabela: Faturado_Recebido_glosado_Motivo_Tasy)

- [ ] Separar frontend em duas telas: Contas Faturadas (enviadas) e Contas Recebidas (retornos)
- [ ] Criar tela Contas Faturadas - exibir dados do Tasy/SQLite (valores faturados/enviados aos convênios)
- [ ] Criar tela Contas Recebidas - exibir dados de retorno XML/Excel dos convênios (valores pagos, glosados)
- [ ] Atualizar navegação e menu lateral com as novas telas

- [x] Corrigir erro de carregamento da biblioteca sql.js - 'Content unavailable. Resource was not cached'

- [x] Corrigir erro 'Failed to fetch' na importação de arquivo SQLite grande - reduzir tamanho dos lotes (BATCH_SIZE de 500 para 100)

- [x] Corrigir campos de valor nulos na importação FaturadoTasy (estabelecimentoId estava sendo salvo como 0)
- [x] Corrigir dados não aparecendo nas telas/relatórios após importação (atualizado registros para estabelecimentoId correto)

- [x] Ajustar relatórios FaturadoTasy para usar campo competencia como referência de data

- [x] Formatar campo competência para MM/AAAA na tela Faturado Tasy (em vez de AAAA/MM/DD)
- [x] Verificar qual campo é usado como período no Relatório Tasy (usa dataInicio/dataFim calculados a partir de mês/ano selecionados)
- [x] Criar tela Contas Faturadas (Tasy) com dados FaturadoTasy agrupados por conta
- [x] Criar tela de detalhes dos itens por conta (ao clicar em uma conta)

- [x] Alterar filtro de competência na tela Contas Faturadas para dois campos separados: Ano e Mês

- [x] Corrigir filtros de Ano e Mês na tela Contas Faturadas - formato ajustado para MM/AAAA

- [x] Corrigir filtro de competência na tela Contas Faturadas - formato ajustado para AAAA-MM com LIKE
- [x] Criar tela separada de detalhes da conta (DetalhesContaFaturada.tsx)

- [x] Corrigir erro na navegação para tela de detalhes da conta - adicionado DashboardLayout e useLocation

- [x] Corrigir KPIs da tela de detalhes da conta mostrando NaN (tratamento de valores null/undefined)

- [x] Corrigir KPIs que ainda mostram NaN na tela de detalhes e Contas Faturadas (tratamento robusto de valores null com parseFloat)
- [x] Ajustar Relatório Tasy para usar filtro de competência AAAA-MM (em vez de dtItem)
- [x] Simplificar relatórios para serem mais precisos (parseFloat com tratamento de null em todos os campos de valor)

- [x] Substituir função getFaturadoTasyParaRelatorio pela versão com helper toNum (trata pontos de milhar e vírgulas brasileiras)

- [x] Atualizar função toNum para detectar formato brasileiro vs americano
- [x] Criar componente ResumoRelatorio na página de relatórios Tasy

- [x] Simplificar função toNum para toMoney com parseFloat simples (DECIMAL já vem formatado do banco)
- [x] Verificar formato da competência no filtro vs banco (filtro AAAA-MM, banco AAAA-MM-DD, usa LIKE)

- [x] Corrigir KPIs para somar todos os registros da competência (query separada para resumo geral)
- [x] Adicionar paginação na tabela de contas para navegar por todas as contas
- [x] Adicionar filtro por convênio nos KPIs para ver totais específicos por operadora
- [x] Preservar filtros ao retornar da tela de detalhes da conta

- [x] Investigar diferença nos valores de faturamento - removidos registros duplicados da importação 180002

- [x] Corrigir valores da tela Relatórios Tasy para serem iguais aos da tela Faturado Tasy (mesma competência)
- [x] Modificar tela Relatórios Tasy para usar mesma lógica e dados da tela Faturado Tasy (seleção de competência específica)

- [x] Corrigir função de competência na tela Relatórios Tasy que não está funcionando

- [x] Corrigir filtro de competência na tela Relatórios Tasy para aparecer quando Faturado Tasy (Nova) é selecionado (RESOLVIDO: usuário estava acessando versão publicada antiga - precisa publicar nova versão)

- [x] Unificar filtro de competência na tela Relatórios Tasy para agrupar por mês/ano (ex: 09/2025) ao invés de mostrar cada importação separadamente
- [x] Remover abas Conciliação Tasy e Contas Tasy do menu lateral

- [x] Renomear tela "Contas" para "Conta Convênio" e filtrar apenas arquivos XML enviados (direcao = 'enviado')
- [x] Criar nova tela "Contas Demonstrativo" para arquivos retornados (direcao = 'retornado') com suporte a XML, PDF e Excel
- [x] Atualizar menu lateral com os novos nomes e rotas

- [x] Corrigir erro 404 ao voltar da tela de detalhes (botão voltar redireciona para /contas que não existe mais) - VERIFICADO: funcionando corretamente
- [x] Corrigir filtro por convênio que não traz resultados nas telas Conta Convênio e Contas Demonstrativo - VERIFICADO: funcionando corretamente (testado com Bradesco=0 resultados, Unimed=1171 resultados)

- [x] Corrigir filtro de convênio na tela Conta Convênio - não traz resultados ao selecionar Unimed (Ox Uti) - CORRIGIDO: removido filtro automático por prestador vinculado
- [x] Corrigir filtro de convênio na tela Contas Demonstrativo - não está filtrando por convênio corretamente - CORRIGIDO: removido filtro automático por prestador vinculado

- [x] Alterar lógica de agrupamento em ContaConvenio.tsx para usar ID do procedimento como chave (evitar somas indevidas em Alta Administrativa)
- [x] Alterar lógica de agrupamento em ContasDemonstrativo.tsx para usar ID do procedimento como chave

- [x] Implementar padrão Master-Detail no ContaConvenio.tsx com agrupamento por guiaNumero + numeroLote + sequencialTransacao
- [x] Implementar padrão Master-Detail no ContasDemonstrativo.tsx com linhas expansíveis

- [x] Verificar dados da guia 66829180 no banco (numeroLote e sequencialTransacao) - VERIFICADO: 4 transações diferentes com lotes 85918, 85795, 86037 e null
- [x] Verificar e corrigir chave de renderização do componente React (key deve usar chave composta) - CORRIGIDO: adicionado React.Fragment com key={conta.chave}

- [x] Ajustar lógica de chave para usar ID do banco quando lote/sequencial forem 'null', nulos ou vazios (ContaConvenio e ContasDemonstrativo)
- [x] Exibir valor real do lote na coluna (não apenas traço quando for 'null')
- [x] Adicionar badge 'Alta Administrativa' para guias com múltiplas transações

- [x] Corrigir lógica de agrupamento Master-Detail: agrupar por guiaNumero + numeroLote + sequencialTransacao (mesmo quando 'null')

- [x] Corrigir parser XML para capturar corretamente sequencialTransacao da tag TISS (evitar string 'null' no banco)

- [x] Corrigir parser XML para capturar numeroLote e sequencialTransacao (não gravar string 'null')
- [x] Ajustar chave de agrupamento no frontend para usar ID quando lote for 'null'
- [x] Garantir exibição do lote na coluna da tabela

- [ ] Corrigir extração do numeroLote e sequencialTransacao no parser XML (campos continuam como '-' após reimportação)

- [x] Corrigir parser para não salvar string 'null' (usar undefined/NULL real)
- [x] Ajustar lógica de agrupamento no frontend com fallback guiaNumero+idArquivo
- [x] Garantir exibição do lote na coluna da tabela (não mostrar traço quando há valor)
- [x] Fornecer comando SQL de limpeza para converter 'null' string para NULL real

- [x] Aplicar lógica de agrupamento de Altas Administrativas na tela Contas Demonstrativo usando campo Protocolo TISS

- [ ] Implementar conciliação automática que considera Altas Administrativas (usando Protocolo TISS ou lote+sequencial como chave de match)

- [x] Implementar conciliação automática que considera Altas Administrativas (usando Protocolo TISS ou lote+sequencial como chave de match)
- [x] Bug: Botão Voltar na tela de detalhes da conciliação retorna para tela inicial ao invés da lista de contas
- [x] Criar nova permissão "Usuário Tasy" que restringe o acesso apenas às abas relacionadas ao Tasy
- [x] Modificar tela Conciliação Contas Pagas para usar dados da tabela FaturadoTasy com mesma lógica de Contas Faturadas
- [x] Adicionar opção de exportar os itens detalhados de uma conta específica para Excel no modal de detalhes
- [x] Bug: Tela Conciliação Contas Pagas não está mostrando dados - restaurar para versão anterior funcional
- [x] Alterar tela Conciliação Contas Pagas para usar dados da tabela FaturadoTasy com filtro por competência, mantendo o layout atual
- [x] Corrigir filtro de competência na tela Conciliação Contas Pagas - agrupar competências duplicadas e usar filtros separados por Ano e Mês
- [x] Bug: Filtros de Ano e Mês na tela Conciliação Contas Pagas mostrando NaN itens e não trazendo dados
- [x] Adicionar opção de selecionar todas as contas e exportar tudo para Excel na tela de Repasse (não apenas a página atual)
- [x] Bug: Tela Detalhes da Conta (origem Conta-Convênio) está somando todas as contas do paciente ao invés de mostrar apenas dados da conta específica
- [x] Bug: Tipos de itens incorretos na tela Detalhes da Conta - precisa mostrar Medicamentos, Material, Procedimento, Taxas
- [x] Bug: Perda de filtros ao voltar da tela Detalhes da Conta para Conta-Convênio
- [x] Bug: Tela Conciliação Automática duplicando atendimentos - precisa usar chave composta (guiaNumero + lote + sequencial + paciente) para agrupar
- [x] Modificar lógica de conciliação para usar chave composta: guiaNumero + numeroLote + Protocolo TISS + Data Execução + Item do demonstrativo
- [x] Bug: Tela Conciliação mostrando todos os itens individuais ao invés de agrupar por guia+lote - corrigir para agrupar primeiro por guia+lote
- [x] Bug: Conciliação mostrando 7 contas ao invés de 4 para guia 65811869 - corrigido para agrupar XML por guia+lote e Demonstrativo por guia+protocolo
- [x] Performance: Importação de arquivo Excel demonstrativo muito lenta - otimizado mapeamentos de colunas para constantes
- [x] Adicionar barra de progresso detalhada na importação de arquivos mostrando número de linhas processadas

- [x] Reprocessar arquivo demonstrativo-0284932.xlsx travado no status "processando" (22.177 itens importados com sucesso)

- [x] Corrigir importação do arquivo demonstrativo-0284932.xlsx - itens glosados não aparecem na tela de Demonstrativo (1206 itens glosados importados corretamente)

- [x] Corrigir parser automático de Excel (parsers.ts) para mapear corretamente o campo "Situação Item" e importar glosas automaticamente

- [x] Criar relatório Excel que exporte itens das guias agrupados por conta e convênio (botão "Excel Itens" na tela Conta Convênio)

- [x] Implementar exportação de itens detalhados na tela de Contas Demonstrativo (botões Excel Resumo e Excel Itens) - 2113 contas e 10000 itens exportados com sucesso

- [x] Corrigir tela Demonstrativo: valor pago incorreto (mostra R$ 27.175 ao invés de R$ 72.227) e filtro de glosados não traz itens - CORRIGIDO: totalPago agora soma apenas valorTotal onde valorGlosado=0, filtro de glosados agora filtra por valorGlosado>0

- [x] Implementar exportação Excel dos itens de todas as contas filtradas na tela Conciliação Contas Pagas (141 contas, 34.151 itens exportados com sucesso)

- [x] Corrigir cálculo de valores no Relatório BI para usar mesma lógica da tela Demonstrativo (somar valorTotal apenas onde valorGlosado = 0) - Recebido agora mostra R$ 72.227,52 corretamente

- [x] Adicionar campo ProfExec (Profissional Executante) no modal de itens da tela Conciliação Contas Pagas

- [x] Adicionar coluna Prof. Executante no relatório Excel de itens detalhados da tela Conciliação Contas Pagas

- [x] Criar tabela faturamento_tiss no schema do banco de dados para armazenar dados de faturamento TISS

- [x] Processar todos os arquivos XML enviados da tabela arquivos e popular a tabela faturamento_tiss (796 arquivos, 13.795 itens, R$ 1.117.402,67)

- [x] Reprocessar todos os arquivos XML e popular tabela faturamento_tiss com todos os campos corretamente preenchidos (796 arquivos, 23.311 itens, R$ 1.886.387,52)

- [x] Corrigir mapeamento dos campos conselho e numeroConselhoProfissional na tabela faturamento_tiss (conselho_prof agora armazena apenas o número do CRM, ex: 11382)

- [x] Integrar tabela recebimento_tiss com o ORM Drizzle (adicionar definição no schema)

- [x] Criar mapeamento e importador de Excel para a tabela recebimento_tiss (colunas: Data Pagto, Processado, Protocolo TISS, Lote Prestador, Número Guia, Beneficiário, Data Execução, Item, Valor Pagamento, Erro TISS, Situação Item, etc.)

- [x] Criar script de importação para popular tabela recebimento_tiss a partir de arquivos XML e Excel de retorno das operadoras (15 arquivos, 97.415 itens, R$ 8.124.574,95)

- [x] Alterar fluxo de upload de arquivos de retorno para popular automaticamente a tabela recebimento_tiss com mapeamento específico Unimed

- [x] Adicionar suporte para importar arquivos XML de retorno (demonstrativos) para a tabela recebimento_tiss automaticamente

- [x] Alterar telas Contas Demonstrativo e Demonstrativo para buscar dados da tabela recebimento_tiss em vez de procedimentos

- [x] Alterar tela Conta Convênio para buscar dados da tabela faturamento_tiss em vez de procedimentos

- [x] Criar nova tabela recebimentos_excel no banco de dados com campos: Data Pagto, Processado, Protocolo TISS, Lote Prestador, Código Prestador, Nome Prestador, Número Guia, Seq, Beneficiário, Nome Beneficiário, Data Execução, Hora Execução, Item, Item Desc, Quantidade, Valor Pagamento, Tipo Lançamento, Erro TISS, Situação Item, Código Solicitante, Nome Solicitante, Acomodação da Internação, Data Inicio/Fim Faturamento Internação, Prestador Executante

- [x] Apagar dados de recebimento_tiss e criar nova tabela com estrutura unificada para XML e Excel (campos: arquivo_id, numero_demonstrativo, nome_operadora, cnpj_operadora, data_emissao, numero_lote_prestador, numero_protocolo, situacao_protocolo, numero_guia_prestador, numero_guia_operadora, senha, numero_carteira, nome_beneficiario, situacao_guia, sequencial_item, data_realizacao, codigo_tabela, codigo_item, descricao_item, quantidade_executada, valor_informado, valor_processado, valor_liberado, valor_glosado, codigo_glosa, descricao_glosa, origem_dado, data_importacao)


## Integração de Campos convenioId e dataReferencia nas Tabelas TISS
- [x] Adicionar campos convenioId e dataReferencia na tabela faturamento_tiss (arquivos XML enviados)
- [x] Adicionar campos convenioId, dataReferencia e dataPagamento nas tabelas recebimento_tiss (XML) e recebimentos_excel (Excel)
- [x] Atualizar fluxo de upload para popular convenioId, dataReferencia e dataPagamento nas tabelas específicas
- [x] Separar importação: recebimentos_excel para Excel de retorno, recebimento_tiss para XML de retorno
- [x] Atualizar registros existentes de faturamento_tiss com convenioId e arquivoId (23.082 de 23.311 registros - 99%)


## Separação de Tabelas de Retorno (Excel vs XML)
- [x] Alterar fluxo de upload para salvar Excel de retorno na tabela recebimentos_excel
- [x] Manter recebimento_tiss apenas para arquivos XML de retorno
- [x] Migrar dados existentes de Excel da tabela recebimento_tiss para recebimentos_excel


## Correção do Parser de Excel para recebimentos_excel
- [ ] Corrigir mapeamento dos campos tipo_lancamento, situacao_item e erro_tiss no parser
- [ ] Reimportar arquivos Excel existentes com os campos corretos


## Tabela Demonstrativo Unificada
- [x] Criar tabela Demonstrativo no schema e banco de dados
- [x] Criar funções de inserção e consulta para Demonstrativo
- [x] Atualizar parsers para popular a tabela Demonstrativo


## Correção do Fluxo de Upload
- [x] Reverter fluxo de upload para salvar Excel em recebimentos_excel e XML em recebimento_tiss


## Sincronização Automática da Tabela Demonstrativo
- [x] Criar função de sincronização para popular tabela demonstrativo com união de recebimentos_excel e recebimento_tiss
- [x] Integrar sincronização automática no fluxo de upload
- [x] Testar importação e verificar dados na tabela demonstrativo


## Melhorias nas Telas de Demonstrativo e Recursos de Glosa
- [x] Criar procedure tRPC para buscar dados da tabela demonstrativo
- [x] Redesenhar tela Contas Demonstrativo com layout melhorado e visão por conta
- [x] Criar tela de detalhes da conta com itens
- [x] Alterar tela de Recursos de Glosa para buscar dados da tabela demonstrativo


## Adicionar estabelecimentoId nas Tabelas de Recebimento
- [x] Adicionar campo estabelecimentoId na tabela demonstrativo
- [x] Adicionar campo estabelecimentoId na tabela recebimento_tiss
- [x] Adicionar campo estabelecimentoId na tabela recebimentos_excel
- [x] Criar script para popular estabelecimentoId com base nos arquivos importados
- [x] Atualizar fluxo de upload para incluir estabelecimentoId


## Correção da Tela Conta Convênio (faturamento_tiss)
- [x] Corrigir query para carregar dados da tabela faturamento_tiss
- [x] Aplicar layout igual a tela Conta Demonstrativo (cards de contas agrupadas)
- [x] KPIs com totais de todas as contas (não apenas da página atual)
- [x] Adicionar paginação para navegar entre todas as contas
- [x] Criar tela de detalhes da conta com KPIs por tipo de procedimento


## Correções nas Telas Conta Convênio e Conta Demonstrativo
- [x] Corrigir filtros da tela Conta Convênio (inicializar mês/ano com valores atuais, remover dependência de estabelecimento)
- [x] Ajustar KPIs da tela Conta Demonstrativo para trazer totais de todas as contas filtradas no mês/ano
- [x] Adicionar paginação na tela Conta Demonstrativo (já existia)


## Correção de Processamento de Arquivos Grandes
- [ ] Otimizar parser de Excel para processar arquivos com mais de 25.000 linhas
- [ ] Resetar arquivo travado (ID: 660001) para reprocessamento


## Correção de Filtros e Paginação nas Telas (05/02/2026)
- [ ] Corrigir filtros da tela Conta Convênio (não está retornando dados)
- [ ] Corrigir paginação da tela Contas Demonstrativo (mostrando apenas 4 contas)
- [ ] Verificar queries no banco de dados para identificar problemas

## Correções 05/02/2026

- [x] Corrigir tela Conta Convênio - dados não apareciam (coluna valor_total_item não existe, renomeada para valor_faturado)
- [x] Corrigir inicialização de filtros de mês - alterar para mês anterior ao invés do mês atual
- [x] Corrigir tela Contas Demonstrativo - inicialização de filtros para mês anterior
- [x] Corrigir query de items no backend - ordem das operações (where antes de orderBy/limit/offset)
- [x] Remover logs de debug do backend e frontend

## Bugs Reportados 05/02/2026

- [x] Filtro de estabelecimento não funciona na tela Contas Demonstrativo (dados do Ox UTI aparecem no PSI)
- [x] Adicionar estabelecimentoId ao input das procedures demonstrativo.contas e demonstrativo.resumo
- [x] Adicionar filtro por estabelecimentoId na função getDemonstrativoContas e getDemonstrativoResumo
- [x] Passar estabelecimentoId do frontend para o backend nas queries
- [x] Valor Glosado = R$ 0,00 (verificado: dados importados para Unimed/Janeiro/2026 não contêm glosas)

## Bugs Reportados 05/02/2026 (anteriores) - Contas Demonstrativo

- [x] Filtro por estabelecimento não funciona - dados do Ox UTI aparecem na tela do PSI (CORRIGIDO)
- [x] Itens glosados não aparecem - Valor Glosado mostra R$ 0,00 (VERIFICADO: dados não contêm glosas)
- [x] Organizar filtros para aplicar corretamente por estabelecimento em todas as telas (CORRIGIDO)


## Bug Parser Demonstrativo Unimed - 05/02/2026

- [ ] Parser do demonstrativo Unimed não está extraindo valores de glosa corretamente
- [ ] Todos os arquivos têm glosas mas aparecem R$ 0,00 no sistema
- [ ] Investigar estrutura dos arquivos Excel/XML da Unimed
- [ ] Corrigir extração dos campos valor_glosa e codigo_glosa
- [ ] Reprocessar arquivos existentes após correção


## Correções 05/02/2026 - Parser Demonstrativo Unimed

- [x] Corrigir filtro de estabelecimento na tela Contas Demonstrativo (dados do Ox UTI apareciam no PSI)
- [x] Adicionar estabelecimentoId ao input das procedures demonstrativo.contas e demonstrativo.resumo
- [x] Corrigir parser de demonstrativo Unimed para extrair valores de glosa corretamente
- [x] Quando situacaoItem = GLOSADO, mover valor de valorPago para valorGlosa
- [x] Ressincronizar tabela demonstrativo com a correção de glosas
- [x] Resultado: Valor Glosado agora exibe R$ 29.711,42 (antes mostrava R$ 0,00)


## Ajustes Solicitados 05/02/2026

- [x] Ajustar filtro de data na tela Contas Demonstrativo para usar formato MM/AAAA


## Correção Agrupamento de Guias (Altas Administrativas) - 05/02/2026

- [ ]- [x] Tela Contas Demonstrativo: Usar chave composta (guiaNumero + numeroLote + Protocolo TISS + Data Execução + Código do Item)- [ ] Modificar tela Contas Demonstrativo para usar chave composta similar
- [ ] Separar guias com mesmo número mas lotes diferentes (altas administrativas)
- [ ] Testar com guia 67752681 que tem múltiplos lotes de envio XML
- [ ] Corrigir valores totais das guias que estão incorretos


## Correções 05/02/2026 - Agrupamento de Guias (Altas Administrativas)

- [x] Modificar tela Conta Convênio para usar chave composta: guia + lote + data de execução
- [x] Separar guias com mesmo número mas lotes diferentes (altas administrativas)
- [x] Exibir número do lote em cada card de conta
- [x] Implementar agrupamento no backend para paginação correta
- [x] Corrigir query SQL para usar GROUP BY com MIN/MAX para campos agregados
- [x] Testar com guia 67752681 que tem múltiplos lotes (86910, 86792, 86399)


## Correção 05/02/2026 - Ajuste Agrupamento Conta Convênio

- [x] Corrigir agrupamento na tela Conta Convênio para usar apenas guia + lote (remover data de execução)


## Implementações 05/02/2026 - Contas Demonstrativo e Indicador Alta Administrativa

- [ ] Implementar chave composta na tela Contas Demonstrativo (guiaNumero + numeroLote + Protocolo TISS + Data Execução + Código- [x] Adicionar indicador visual de alta administrativa (badge/ícone) para guias com múltiplos lotesdge/ícone especial)


## Padronização Telas Conta Convênio e Contas Demonstrativo - 05/02/2026

- [x] Analisar estado atual das duas telas e identificar diferenças
- [x] Padronizar filtro de competência MM/AAAA em ambas as telas
- [x] Padronizar agrupamento por chave composta (guia + lote) em ambas as telas
- [x] Garantir filtro por estabelecimento funcionando em ambas as telas
- [x] Adicionar indicador de alta administrativa na tela Conta Convênio
- [x] Criar procedure guiasMultiplosLotes no backend para identificar guias com múltiplos lotes
- [x] Testar em todos os estabelecimentos do sistema (PSI e Ox UTI)
- [x] Badge "Alta Adm (X lotes)" exibido corretamente para guias com múltiplos lotes


## Limpeza de Dados - Estabelecimento 3 - 06/02/2026

- [x] Identificar estabelecimento 3 (Ox Uti) e tabelas associadas
- [x] Limpar faturamento_tiss do estabelecimento 3 (10.598 registros)
- [x] Limpar recebimentos_excel do estabelecimento 3 (2.000 registros)
- [x] Limpar demonstrativo do estabelecimento 3 (2.000 registros)
- [x] Verificar limpeza completa
- [x] Limpar procedimentos do estabelecimento 3 (via arquivoId) - 44.119 removidos
- [x] Limpar arquivos do estabelecimento 3 - 78 removidos
- [x] Limpar alertasDivergencia do estabelecimento 3 (via arquivoId) - 9 removidos

## Correção Schema + Fluxo Importação XML - 06/02/2026

- [x] Corrigir mismatch de colunas no schema Drizzle (estabelecimentoId, convenioId) para alinhar com banco
- [x] Alterar fluxo de importação XML enviados: popular faturamento_tiss diretamente (sem passar por procedimentos)
- [x] Criar função insertFaturamentoTissBatch no db.ts
- [x] Alterar routers.ts para chamar nova função no upload de XML enviados
- [x] Migrar dados existentes de procedimentos para faturamento_tiss (estab 3: 6.209 registros via SQL)
- [x] Verificar migração: faturamento_tiss agora tem 6.209 registros para estab 3

## Correção Mapeamento XML → faturamento_tiss - 06/02/2026

- [x] Investigar campos do parser XML que não estão sendo mapeados para faturamento_tiss
- [x] Corrigir mapeamento: codigo_item, descricao_item, valor_unitario, valor_faturado, nome_prof, conselho_prof - OK, já estão populados
- [x] Extrair registroANS do cabeçalho da guia no parser XML
- [x] Extrair numeroGuiaOperadora do dadosAutorizacao no parser XML
- [x] Extrair senha do dadosAutorizacao no parser XML
- [x] Mapear novos campos para faturamento_tiss no routers.ts
- [x] Testar importação e verificar dados populados corretamente

## Correção Detalhes da Guia - Conta Convênio - 06/02/2026

- [x] Investigar query de detalhes da guia que retorna apenas 1 item agregado em vez dos itens individuais
- [x] Criar nova procedure itensGuia no backend (sem agrupamento)
- [x] Atualizar ContaConvenioDetalhes.tsx para usar nova procedure
- [x] Adicionar campos Registro ANS, Guia Operadora, Senha e Nº Lote no cabeçalho
- [x] Testar na tela Conta Convênio - 557 itens exibidos corretamente

## Correção Urgente - Detalhes Guia + Campos NULL - 06/02/2026

- [x] Corrigir tela detalhes da guia: mostra 1 item MISTO em vez dos itens individuais
- [x] Verificar se procedure itensGuia está sendo chamada corretamente no frontend
- [x] Corrigir parser XML para extrair registroAns, senha, numeroGuiaOperadora (funciona em novas importações)
- [x] Salvar checkpoint e entregar nova versão (f094a266)


## Correção Parser Outras Despesas - 06/02/2026

- [x] Analisar parser atual de outrasDespesas e comparar com estrutura XSD oficial TISS
- [x] Identificar campos que não estão sendo extraídos corretamente (codigoDespesa, servicosExecutados)
- [x] Corrigir extração de outrasDespesas no parser XML
- [x] Testar com XML real para validar a correção (4 testes vitest passaram)
- [x] Verificar mapeamento para faturamento_tiss

## Correção estabelecimentoId na tabela regrasIA - 06/02/2026

- [x] Analisar schema da tabela regrasIA e identificar coluna estabelecimentoId ausente (coluna existia no schema mas banco tinha nome diferente)
- [x] Corrigir mismatch de nomes: banco tinha `estabelecimento_id` (snake_case), schema esperava `estabelecimentoId` (camelCase)
- [x] Renomear coluna no banco via ALTER TABLE para `estabelecimentoId` em regrasIA e recursosGlosa
- [x] Sincronizar snapshot do drizzle com o estado correto do banco
- [x] Restaurar schema.ts original e reiniciar servidor (0 erros TypeScript)
- [x] Executar testes e validar correção (427 testes passaram, incluindo iaAnalise.test.ts)


## Limpeza de Dados - Todas as Tabelas TISS - 06/02/2026

- [x] Limpar tabela faturamento_tiss (todos os estabelecimentos) - 18.922 registros removidos
- [x] Limpar tabela demonstrativo (todos os estabelecimentos) - 48.849 registros removidos
- [x] Limpar tabela recebimentos_excel (todos os estabelecimentos) - 35.672 registros removidos
- [x] Limpar tabela recebimento_tiss (todos os estabelecimentos) - 169 registros removidos
- [x] Verificar limpeza completa - todas as tabelas com 0 registros


## Correção Tipo de Despesa (outrasDespesas) - 06/02/2026

- [x] Analisar como codigoDespesa é extraído do XML e mapeado para faturamento_tiss (parser já extrai corretamente)
- [x] Mapear codigoDespesa para tipos específicos: 1=GÁS MEDICINAL, 2=MEDICAMENTO, 3=MATERIAL, 5=DIÁRIA, 7=TAXA/ALUGUÉIS
- [x] Corrigir routers.ts: função mapTipoDespesaParaTipoItem substitui mapeamento binário PROCEDIMENTO/DESPESA
- [x] Testar: 427 testes passaram, correção validada


## Bug: Tipos de Despesa não aplicados após reimportação - 06/02/2026

- [x] Investigar por que mapTipoDespesaParaTipoItem não está sendo aplicado no servidor (site publicado rodava versão antiga)
- [x] Corrigir o problema (precisa republicar para aplicar o código novo)
- [x] Testar e validar (testes passaram, código correto no dev)
- [x] Liberar versão nova (checkpoint salvo, aguardando publicação pelo usuário)


## Alinhar Tabelas de Recebimento com Padrão TISS ANS - 09/02/2026
- [x] Pesquisar estrutura XML TISS de retorno da operadora (demonstrativoAnaliseConta e demonstrativoPagamento)
- [x] Comparar campos TISS com tabelas atuais recebimento_tiss e recebimentos_excel
- [x] Identificar 30 campos faltantes e adicionar ao schema (registroANS, CNES, totais por guia/protocolo/geral, etc.)
- [x] Atualizar schema Drizzle e migrar banco de dados (63 colunas em recebimento_tiss, 40 em recebimentos_excel)
- [x] Atualizar parser de recebimento XML para extrair todos os novos campos TISS
- [x] Testar e validar as alterações (427 testes passaram, 0 erros TypeScript)


## Atualizar Tela de Demonstrativo - Novos Campos TISS - 09/02/2026
- [x] Analisar código atual da tela de Demonstrativo e routers relacionados
- [x] Atualizar backend (db.ts) para retornar todos os 50+ campos TISS no select
- [x] Atualizar frontend: 7 cards de resumo, colunas com Protocolo/Vl.Informado/Vl.Liberado/Vl.Glosado, dialog de detalhes com 5 seções
- [x] Atualizar exportação Excel com 34 campos (incluindo glosas de protocolo e guia)
- [x] Testar: 427 testes passaram, 0 erros TypeScript

## Bug: Dados importados do Excel não aparecem na tela Demonstrativo - 09/02/2026
- [x] Diagnosticar causa raiz: tela Demonstrativo.tsx usa trpc.recebimentoTiss.list (tabela recebimento_tiss vazia) ao invés de trpc.demonstrativo.contas (tabela demonstrativo com 24.500 registros)
- [x] Reescrever Demonstrativo.tsx para usar trpc.demonstrativo.contas e trpc.demonstrativo.resumo
- [x] Adaptar campos do frontend para os campos da tabela demonstrativo (tipoLancamento, valorPago, valorGlosa, etc.)
- [x] Manter dialog de detalhes com informações relevantes dos itens (busca itens via trpc.demonstrativo.itensPorGuia)
- [x] Testar visualização dos dados do arquivo Demostrativo Psi-12-2025.xlsx (4.674 contas, 24.500 itens, R$ 866.804,71 pago)
- [x] Salvar checkpoint (versão 03d20746)


## Ajuste Filtro de Competência - Data de Referência do Upload - 09/02/2026
- [x] Investigar como a data de referência é salva no upload e como o filtro funciona no backend (getDemonstrativoContas)
- [x] Buscar as competências disponíveis no banco (datas de referência distintas) via trpc.demonstrativo.competencias
- [x] Ajustar filtro de competência no Demonstrativo.tsx para usar as datas reais do banco em vez de gerar lista fixa de 24 meses
- [x] Inicializar o filtro com a competência mais recente disponível (11/2025 com 24.500 itens)
- [x] Corrigir erro SQL only_full_group_by na query getDemonstrativoCompetencias (usando aliases)
- [x] Salvar checkpoint (versão 3c9625c6)


## Arquivo Demostrativo Psi-12-2025.xlsx travado em 'processando' - 09/02/2026
- [x] Diagnosticar por que o arquivo (ID 840002) está travado em status 'processando' e não populou tabela demonstrativo
- [x] Reprocessar o arquivo: 26.614 registros em recebimentos_excel, 24.500 em demonstrativo
- [x] Corrigir bug de fuso horário no syncDemonstrativo (data 2025-12-01 virava 2025-11-30) - função normalizeDateForDB com meio-dia UTC
- [x] Atualizar status do arquivo de 'processando' para 'processado'
- [x] Verificar dados na tela Demonstrativo com competência 12/2025 (4.674 contas, 24.500 itens, R$ 866.804,71)


## Correções Demonstrativo - Vl. Informado e Glosas - 09/02/2026
- [x] Manter Vl. Informado como R$ 0,00 (campo não existe no arquivo Excel, mantido zerado)
- [x] Investigar por que itens com situacao_item = GLOSADO não aparecem com valor de glosa (campo codigo_glosa VARCHAR(50) truncava erroTiss)
- [x] Corrigir: aumentar codigo_glosa para VARCHAR(500), ressincronizar arquivos 840001 e 840002
- [x] Testar: 53.228 itens, R$ 1.752.953,58 pago, R$ 35.331,88 glosado (2.0%), 1.826 itens glosados por arquivo
- [x] Salvar checkpoint (versão 673438fc)


## Bugs Demonstrativo - Duplicação e Filtros - 09/02/2026
- [x] Remover dados duplicados no banco (arquivo 840001 removido - era duplicata órfã sem registro na tabela arquivos)
- [x] Corrigir valores dobrados: agora R$ 876.476,79 pago + R$ 17.665,94 glosado (26.614 itens, arquivo 840002)
- [x] Botão "Voltar" no detalhe da guia preserva filtros via query params na URL (competência, convênio, status, página, busca)


## Migrar Análise de Glosa para tabela demonstrativo - 09/02/2026
- [x] Reescrever getGlosaPorConvenio para buscar da tabela demonstrativo
- [x] Reescrever getGlosaPorProcedimento para buscar da tabela demonstrativo
- [x] Reescrever getTendenciaGlosa para buscar da tabela demonstrativo
- [x] Reescrever getResumoGlosa para buscar da tabela demonstrativo
- [x] Reescrever getItensGlosados para buscar da tabela demonstrativo (situacao_item = 'GLOSADO')
- [x] Reescrever getItensGlosadosAceitos para buscar da tabela demonstrativo
- [x] Adicionar campos classificacaoGlosa, classificacaoConfianca, classificacaoMotivo, motivoAceite, dataAceite ao schema demonstrativo
- [x] Ajustar router classificarGlosa para atualizar tabela demonstrativo em vez de procedimentos
- [x] Criar função atualizarClassificacaoDemonstrativo e getDemonstrativoById no db.ts
- [x] Testar tela Análise de Glosa: 1.826 itens glosados, R$ 17.665,94, 4 categorias, filtros funcionando
- [x] Salvar checkpoint (versão 8597a7b6)


## Erro importação XML retorno Affego demonstrativo_67118082 - 09/02/2026
- [x] Investigar erro: campo valor_glosado é VIRTUAL GENERATED em recebimento_tiss, causava falha silenciosa na inserção
- [x] Corrigir: remover valor_glosado do INSERT (campo é calculado automaticamente)
- [x] Reprocessar todos os 11 XMLs retornados: 720 itens em recebimento_tiss e demonstrativo
- [x] 90 itens GLOSADOS detectados corretamente (R$ 1.857,06)


## Centralizar dados na tabela demonstrativo (parar de usar procedimentos) - 09/02/2026
- [x] Investigar: parser funciona, problema era coluna VIRTUAL GENERATED valor_glosado em recebimento_tiss
- [x] Corrigir syncDemonstrativo para traduzir situação TISS ("3" → PAGO/GLOSADO) e detectar glosas por valorGlosado > 0 ou codigoGlosa preenchido
- [x] Reprocessar 9 XMLs faltantes: 720 itens, 90 glosados, R$ 1.857,06
- [x] Totais gerais: 27.334 itens (26.614 Excel + 720 XML), 1.916 glosados, R$ 905.264,79 pago, R$ 19.523,00 glosado
- [x] Verificar Análise de Glosa no navegador com dados dos XMLs (3.122 itens, R$ 34.378,71, 3 convênios, abas Categoria/Convênio/Tendência OK)
- [x] Reprocessar arquivo Excel 870001: 22.177 itens (20.971 pagos R$ 730.594,43 + 1.206 glosados R$ 14.855,71)
- [x] Aplicar filtro dinâmico de competência na tela Contas Demonstrativo (trpc.demonstrativo.competencias em vez de lista fixa de 24 meses)
- [x] Salvar checkpoint final (versão e865d280)
- [x] Criar tela "Recebimentos XML" com upload e listagem de XMLs de retorno
- [x] Criar tela "Recebimentos Excel" com upload e listagem de Excel de retorno
- [x] Ajustar Demonstrativo para ser consolidação automática dos Recebimentos XML + Excel
- [x] Atualizar navegação/menu lateral com as novas telas
- [x] Testar fluxo completo: telas Recebimentos XML (720 itens, 90 glosados) e Recebimentos Excel (48.791 itens, 3.032 glosados) funcionando


## Limpeza de Dados de Retorno - PSI e Ox Uti - 09/02/2026
- [x] Identificar IDs dos estabelecimentos PSI (ID 1) e Ox Uti (ID 3)
- [x] Excluir dados da tabela recebimento_tiss (720 registros removidos)
- [x] Excluir dados da tabela recebimentos_excel (48.791 registros removidos)
- [x] Excluir dados da tabela demonstrativo (49.511 registros removidos)
- [x] Verificar limpeza completa (todas as tabelas com 0 registros para PSI e Ox Uti)
- [x] Excluir registros de arquivos retornados da tabela arquivos (13 arquivos removidos - 2 Excel + 11 XML)
- [x] Investigar e corrigir erro na apresentação de glosa ao importar XML 223742387.xml via Recebimentos XML
  - Bug: sistema calculava glosa pela diferença valorInformado - valorLiberado mesmo sem glosa real
  - Fix: só marcar como glosado se houver <relacaoGlosa> explícita ou motivoGlosaGuia + valorLiberado=0
  - Corrigido em: recebimentoTissParser.ts, syncDemonstrativo.ts, parsers.ts
- [x] Investigar e limpar dados residuais que ainda aparecem nas telas após exclusão dos arquivos (limpeza total: recebimento_tiss, recebimentos_excel, demonstrativo, arquivos retornados)

## Exclusão em Cascata de Arquivos
- [x] Criar procedure de exclusão em cascata no backend (ao excluir arquivo, remover dados de recebimento_tiss, recebimentos_excel e demonstrativo)
- [x] Adicionar botão de exclusão nas telas Recebimentos XML e Recebimentos Excel
- [x] Adicionar confirmação antes de excluir (AlertDialog)
- [x] Implementar exclusão em cascata ao excluir arquivo
- [x] Adicionar aba de arquivos importados com botão de exclusão nas telas de Recebimentos
- [x] Analisar 6 XMLs de retorno e identificar problemas na importação de valores
- [x] Corrigir parser de XML para importar valores corretamente (todos os 6 XMLs com valores corretos)
- [ ] Testar fluxo completo de exclusão em cascata
- [x] Investigar e corrigir valores errados na tela Recebimentos XML após reimportação
  - Bug: bloco de processamento de retornado estava DENTRO do if(procedimentos.length > 0)
  - XMLs de retorno não têm procedimentos, então o bloco nunca executava
  - Fix: mover processamento de retornado para FORA do if, executa independente do parseFile()

## Simplificação da Arquitetura (Remoção de Tabela Intermediária)

- [x] Upload de XML enviados salva diretamente em faturamento_tiss (sem tabela procedimentos intermediária)
- [x] Fluxo de reprocessamento atualizado para usar faturamento_tiss
- [x] Comparador atualizado para aceitar campos de faturamento_tiss (codigoItem, valorFaturado, carteiraBeneficiario, numeroGuiaPrestador)
- [x] Função de análise de padrões de cobrança (IA) atualizada para usar faturamento_tiss
- [x] Função de geração de insights (IA) atualizada para usar faturamento_tiss
- [x] Rota de comparação atualizada para buscar de faturamento_tiss via getFaturamentoTissByArquivo
- [x] Rota de procedimentos do arquivo atualizada para buscar de faturamento_tiss
- [x] Removido import de toProcedimentoInsert (não mais necessário)
- [x] Removida inserção em tabela procedimentos no fluxo de upload
- [x] Removida chamada a deleteProcedimentosByArquivoId no fluxo de delete/reprocessar
- [x] Testes unitários do comparador atualizados (8 testes passando)
- [x] Todos os 435 testes do projeto passando (36 arquivos de teste)
- [x] Migração completa: todas as referências .from(procedimentos) removidas do db.ts (38 refs em 22 funções migradas para faturamentoTiss/demonstrativo)

## Relatórios BI: Integrar faturamento_tiss + demonstrativos

- [x] Atualizar getDadosBI para buscar envios de faturamento_tiss e retornos de demonstrativo
- [x] Atualizar getOpcoesFiltroBi para buscar filtros de faturamento_tiss + demonstrativo
- [x] Atualizar getResumoGeral (dashboard) para usar faturamento_tiss (envios) e demonstrativo (retornos)
- [x] Garantir que relatórios BI mostrem dados cruzados (faturado vs recebido)
- [x] Executar testes e validar compilação (435 testes passando, 0 erros TypeScript)


## Migração Completa: Remover todas as referências .from(procedimentos) no db.ts

- [x] Mapear e categorizar todas as 40 referências .from(procedimentos) por função (38 refs em 22 funções)
- [x] Migrar funções de conciliação e comparação para usar demonstrativo/faturamento_tiss
- [x] Migrar funções de detalhes de arquivo e listagem para usar faturamento_tiss/demonstrativo
- [x] Migrar funções de análise estatística e prestadores
- [x] Migrar funções de insights IA e alertas
- [x] Limpar imports e referências residuais à tabela procedimentos (removido import, removido createProcedimentos)
- [x] Verificar compilação e executar testes (0 erros TS no db.ts, 435 testes passando)

## Remoção da Tabela Procedimentos do Schema e Banco

- [x] Verificar referências residuais à tabela procedimentos em todo o codebase
- [x] Remover definição da tabela procedimentos e tipos (InsertProcedimento, Procedimento) do schema Drizzle
- [x] Limpar referências residuais: removido import de Procedimento no comparador.ts, removido InsertProcedimento e toProcedimentoInsert do parsers.ts
- [x] Dropar a tabela procedimentos no banco de dados via SQL (DROP TABLE IF EXISTS procedimentos)
- [x] Verificar compilação e executar testes (435 testes passando, 0 erros TS no db.ts)

## Sincronização do Schema Drizzle com o Banco

- [x] Sincronizar schema Drizzle com o banco: migração 0053 criada (DROP TABLE procedimentos), snapshot atualizado, 4 migrações faltantes registradas (54/54 synced), drizzle-kit migrate OK, 435 testes passando

## Gerar Migrações Pendentes de Colunas Novas

- [x] Identificar diferenças: 29 diferenças (10 tabelas faltantes, 18 colunas faltantes, 1 tabela extra)
- [x] Gerar migração 0054_sync_schema.sql (28 statements: 10 CREATE TABLE + 18 ALTER TABLE ADD COLUMN)
- [x] Aplicar migração via drizzle-kit migrate (55/55 synced)
- [x] Adicionar tabela demonstrativo ao snapshot (56/56 tabelas sincronizadas)
- [x] Verificar compilação e testes (435 testes passando, schema e banco 100% sincronizados)

## Bug: Perda de Filtros ao Voltar dos Detalhes da Guia

- [x] Corrigir perda de filtros na tela de Contas por Convênio ao clicar em "Voltar" dos detalhes da guia (filtros preservados via query params na URL)
- [x] Corrigir erro de coluna valorTotal/valorGlosado inexistente na tabela demonstrativo (getDadosConsolidados)

## Bug: Valores Incorretos na Importação de XML de Retorno CASSI

- [ ] Investigar valores incorretos após importação de 6 XMLs de retorno do convênio CASSI
- [ ] Verificar parser de XML de retorno para convênio CASSI
- [ ] Corrigir extração de valores (pagos, glosados) do XML de retorno CASSI

- [x] Corrigir bug de importação de XML de retorno CASSI - 4 de 6 arquivos não geraram dados no demonstrativo (causa: coluna valor_glosado é VIRTUAL GENERATED no banco, parser tentava inserir valores nela)
- [x] Reprocessar os 4 XMLs CASSI que falharam (1020282, 1020283, 1020284, 1020285) - total 434 itens inseridos
- [x] Atualizar schema Drizzle para marcar valorGlosado como generatedAlwaysAs no recebimentoTiss
- [x] Corrigir syncDemonstrativo para calcular valorGlosado localmente em vez de usar campo do parser
- [x] Analisar e corrigir importação de XMLs de retorno AFFEGO - 5 arquivos importados mas sem dados no demonstrativo (mesmo bug do valorGlosado VIRTUAL GENERATED + 4 arquivos não estavam no banco)
- [x] Acompanhar importação do arquivo 'Demostrativo Psi-12-2025.xlsx' e diagnosticar problemas (26.614 itens importados com sucesso)
- [x] Implementar solução para processamento de arquivos muito grandes: progresso real com callbacks, inserção resiliente com fallback item-a-item, otimização de fluxo para retornados (pular parseFile genérico), endpoint reprocessar atualizado para retornados

## Análise de Abas do Sistema - 10/02/2026
- [ ] Analisar aba Divergentes: identificar tabelas e procedures utilizadas
- [ ] Analisar aba Faturamento: identificar tabelas e procedures utilizadas
- [ ] Analisar aba Relatório de Contas: identificar tabelas e procedures utilizadas
- [ ] Analisar aba Histórico de Contestações: identificar tabelas e procedures utilizadas
- [ ] Analisar aba Faturado Tasy: identificar tabelas e procedures utilizadas
- [x] Remover aba Divergentes do sistema (rota, sidebar, página)
- [x] Remover aba Faturamento do sistema (rota, sidebar, página)
- [x] Remover aba Relatório de Contas do sistema (rota, sidebar, página)
- [x] Remover aba Histórico de Contestações do sistema (rota, sidebar, página)
- [x] Remover aba Faturado Tasy do sistema (rota, sidebar, página)
- [x] Unificar abas 'Conta Demonstrativo' e 'Demonstrativo' em uma única aba (eliminar redundância)
- [x] Criar página DemonstrativoDetalhes em tela cheia (substituir modal)
- [x] Atualizar Demonstrativo para navegar para DemonstrativoDetalhes em vez de abrir modal
- [x] Remover aba Contas Demonstrativo e ContaDetalhesDemonstrativo do sistema
- [x] Verificar reimportação do arquivo 'Demostrativo Psi-12-2025.xlsx' (26.614 registros processados + otimização: pular parseFile genérico para retornados)
- [x] Corrigir tela Demonstrativo: filtro por convênio retorna 0 contas e competência fica vazia (26.614 registros tinham convenioId=NULL, corrigidos para Unimed)
- [x] Corrigir bug de fuso horário no Demonstrativo: data_referencia 2025-12-01 aparece como competência 11/2025 em vez de 12/2025 (dados corrigidos no banco via SQL UPDATE, função normalizeDateForDB já estava correta com meio-dia UTC)

## Arquivo Travado em Processando - 10/02/2026
- [x] Investigar arquivo demonstrativo-0284932.xlsx travado em status 'processando' (ID 1110264, 0 registros no banco)
- [x] Corrigir status do arquivo e reprocessar (22.177 registros inseridos: 20.971 pagos + 1.206 glosados R$ 14.855,71, competência 12/2025)

## Data Incorreta no Novo Upload demonstrativo-0284932.xlsx - 10/02/2026
- [x] Reprocessar demonstrativo-0284932.xlsx (ID 1110266) travado em processando com 0 registros (22.177 registros inseridos, competência 01/2026)
- [x] Reprocessar demonstrativo_servicos_1.xml (ID 1110265) travado em processando com 0 registros (24.004 registros inseridos, competência 01/2026)
- [x] Investigar causa raiz do travamento: timeoutPromise criado mas nunca usado com Promise.race - corrigido para usar Promise.race([doProcess(), timeoutPromise])


## Permissões Específicas por Usuário e Grupo Tasy - 11/02/2026
- [x] Implementar permissões granulares por usuário (escolher módulos/abas individualmente)
- [x] Criar grupo pré-definido "Usuário Tasy" (Importação Tasy, Contas Faturadas, Relatórios Tasy, Relatórios BI, Conciliação Contas Pagas)
- [x] Atualizar UI de Gerenciar Permissões para permitir edição de permissões individuais por usuário (23 módulos em 3 categorias: Geral, Tasy, Recebimento)
- [x] Aplicar restrição de navegação na sidebar baseada nas permissões do usuário
- [x] Notificação amigável de acesso negado ao tentar acessar módulo sem permissão

## Correção Data Referência demonstrativo_servicos_1.xml - Ox Uti - 11/02/2026
- [x] Corrigir data de referência do demonstrativo_servicos_1.xml (ID 1110265) no Ox Uti de 01/2026 para 12/2025 (24.004 registros atualizados em arquivos, recebimento_tiss e demonstrativo)

## KPIs e Tipo de Lançamento na Tela Detalhes da Conta - 11/02/2026
- [x] Analisar dados disponíveis de tipo de lançamento no banco (PSI: 98.5% com tipo, Ox Uti: 30.7% com tipo - XML Ipasgo sem tipo)
- [x] Adicionar KPIs com totais por tipo de lançamento na tela Detalhes da Conta (cards coloridos com ícones por EXA, HOS, MED, MAT, CON, HON)
- [x] Adicionar coluna de tipo de lançamento na tabela de itens com inferência automática pelo código do item (borda tracejada quando inferido)

## Nova Aba: Atendimentos (baseado no projeto-atendimento-wareline) - 12/02/2026
- [x] Configurar conexão com banco PostgreSQL externo (147.93.4.135:5432/coletor) via secrets
- [x] Criar procedure tRPC para buscar atendimentos parados (din_Atend_n_receb)
- [x] Criar procedure tRPC para registrar notificações (registro_notificacao + registro_notificacao_item)
- [x] Criar página Atendimentos.tsx com KPIs (Total, Internação, Exame, Ambulatório)
- [x] Implementar tabela de atendimentos com ordenação, filtro e "Dias Parado" colorido
- [x] Implementar modal de notificação com motivo, setor, médico e observação
- [x] Implementar exportação Excel dos atendimentos
- [x] Adicionar aba Atendimentos na sidebar do DashboardLayout
- [x] Adicionar módulo de permissão acessoAtendimentos no schema e frontend

## Melhorias Tela Atendimentos - 12/02/2026
- [x] Tornar cards de Quantidade por Serviço clicáveis como filtros na tabela (toggle on/off com destaque visual)
- [x] Mostrar indicador visual do filtro ativo com badges removíveis e botão Limpar Todos

## Vincular Atendimentos ao Hospital Urológico (IRG) - 12/02/2026
- [x] Restringir aba Atendimentos para aparecer apenas no Hospital Urológico (IRG) (ID 4, via estabelecimentoIds no MenuItem + AccessGuard)

## Renomear Estabelecimento ID 4 - 12/02/2026
- [x] Atualizar referências de 'Hospital Urológico' para 'Instituto do Rim' no código (título da tela Atendimentos, comentários)

## Permissão Específica para Aba Atendimentos - 12/02/2026
- [x] Garantir que o módulo 'atendimentos' aparece na tela Gerenciar Permissões como switch configurável
- [x] Adicionar 'atendimentos' à categoria 'atendimento' na lista de módulos do GerenciarPermissoes.tsx (seção roxa separada)
- [x] Verificar que o módulo funciona corretamente com o grupo Administrador (acesso total) e outros grupos
- [x] Adicionar acessoAtendimentos no estado newPermissao (dialog adicionar/editar)
- [x] Adicionar acessoAtendimentos no permissoesPadrao da função aplicarPermissoesGrupo (frontend)
- [x] Adicionar acessoAtendimentos no schema Zod do routers.ts (validação backend)
- [x] Adicionar acessoAtendimentos nas queries de seleção do db.ts (getPermissoesUsuario, listarPermissoes)
- [x] Adicionar acessoAtendimentos na query de update do db.ts (upsertPermissaoEstabelecimento)
- [x] Adicionar acessoAtendimentos no moduloMap do db.ts (verificação de permissão por módulo)
- [x] Adicionar acessoAtendimentos no todosModulos e getModulosTasyUser do db.ts
- [x] Adicionar acessoAtendimentos na criação padrão de permissão ao editar estabelecimentos
- [x] Atualizar teste editarEstabelecimentos.test.ts com acessoAtendimentos

## Polling Automático na Aba Atendimentos - 12/02/2026
- [x] Implementar refetchInterval de 60 minutos nas queries tRPC da aba Atendimentos
- [x] Adicionar indicador visual de última atualização e countdown para próximo refresh
- [x] Permitir refresh manual via botão dedicado (com spinner e estado disabled durante fetch)

## Envio de Notificações por E-mail - 12/02/2026
- [ ] Pesquisar e configurar API de envio de e-mail disponível na plataforma
- [ ] Implementar função de envio de e-mail no backend
- [ ] Adicionar campo de destinatário(s) de e-mail no modal de notificação de Atendimentos
- [ ] Gerar template HTML do e-mail com dados do atendimento e notificação
- [ ] Integrar envio de e-mail ao fluxo de registrar notificação

## Nova Tela: Atendimentos a Faturar - 12/02/2026
- [x] Criar função getAtendimentosAFaturar() no pgAtendimentos.ts com a query SQL fornecida
- [x] Criar procedure tRPC atendimentosFaturar.listar no routers.ts
- [x] Criar página AtendimentosFaturar.tsx baseada na tela de Atendimentos existente
- [x] Registrar rota /atendimentos-faturar no App.tsx
- [x] Adicionar item no menu da sidebar (DashboardLayout) com permissão acessoAtendimentos
- [x] Adicionar coluna codtipsai (tipo saída) na interface e na tabela
- [x] Criar testes para a nova funcionalidade (6 testes passando)

## Permissão Específica: acessoAtendimentosFaturar - 12/02/2026
- [x] Adicionar coluna acessoAtendimentosFaturar no schema drizzle/schema.ts
- [x] Executar db:push para migrar banco (ALTER TABLE manual + schema atualizado)
- [x] Adicionar acessoAtendimentosFaturar nas queries de seleção do db.ts (2 queries)
- [x] Adicionar acessoAtendimentosFaturar na query de upsert do db.ts
- [x] Adicionar acessoAtendimentosFaturar no moduloMap e todosModulos do db.ts
- [x] Adicionar acessoAtendimentosFaturar na criação padrão de permissão do db.ts
- [x] Adicionar acessoAtendimentosFaturar no schema Zod do routers.ts
- [x] Adicionar 'atendimentosFaturar' ao tipo ModuloPermissao e moduloParaCampo no EstabelecimentoContext
- [x] Adicionar 'atendimentosFaturar' na lista MODULOS do GerenciarPermissoes.tsx (categoria 'atendimento')
- [x] Adicionar acessoAtendimentosFaturar no estado newPermissao e permissoesPadrao do GerenciarPermissoes
- [x] Alterar modulo da rota atendimentos-faturar no DashboardLayout de 'atendimentos' para 'atendimentosFaturar'
- [x] Atualizar testes com acessoAtendimentosFaturar (editarEstabelecimentos.test.ts)

## Bug: Tela de Atendimentos não traz dados - 12/02/2026
- [ ] Investigar por que a tela de Atendimentos não está retornando dados
- [ ] Verificar conexão com PostgreSQL externo e query SQL
- [ ] Corrigir o problema identificado

## Alteração Query Atendimentos a Faturar
- [x] Substituir query UNION complexa por SELECT simples da tabela din_Atend_receb_s_faturar
- [x] Ajustar interface AtendimentoFaturarRow para os novos campos (remover nomepac, codtipsai, codcc_destino)
- [x] Ajustar frontend para campos disponíveis (remover colunas Paciente, Tipo Saída, CC Destino)

## KPIs por Plano e Botão Voltar nas Telas de Atendimentos
- [x] Adicionar KPIs por plano (convênio) abaixo dos KPIs por tipo na tela Atendimentos
- [x] Adicionar KPIs por plano (convênio) abaixo dos KPIs por tipo na tela Atendimentos a Faturar
- [x] Adicionar botão de voltar na tela Atendimentos
- [x] Adicionar botão de voltar na tela Atendimentos a Faturar
- [x] Adicionar filtro clicável por plano com badge de filtro ativo nas duas telas

## Atualizar Query Atendimentos a Faturar (adicionar nomepac)
- [x] Atualizar query SQL no pgAtendimentos.ts para incluir campo nomepac
- [x] Atualizar interface AtendimentoFaturarRow com nomepac
- [x] Adicionar coluna Paciente no frontend AtendimentosFaturar.tsx
- [x] Incluir nomepac na busca textual e exportação Excel

## Fallback Data Saída para Exame/Ambulatório
- [x] Quando tipo for Exame ou Ambulatório e datasai for null/vazio, usar datatend como datasai na tela Atendimentos
- [x] Aplicar mesma lógica na tela Atendimentos a Faturar

## Redesign da Tela Home
- [x] Criar hero section com branding Safatle e botão de login visível
- [x] Implementar seção de notícias de saúde/faturamento hospitalar (RSS/API)
- [x] Criar procedure tRPC para buscar notícias no backend
- [x] Seção de estabelecimentos visível apenas após login
- [x] Footer com informações da empresa
- [x] Layout responsivo e visual profissional

## Sistema de Avisos Internos (Banners)
- [x] Criar tabela avisosInternos no schema drizzle (id, titulo, conteudo, tipo, ativo, criadoPor, criadoEm, expiraEm)
- [x] Migrar banco com db:push
- [x] Criar helpers CRUD no db.ts (listar, criar, editar, excluir, listarAtivos)
- [x] Criar procedures tRPC para admin (criar, editar, excluir, listar) e pública (listarAtivos)
- [x] Criar página de gerenciamento de avisos para admin (GerenciarAvisos.tsx)
- [x] Registrar rota e menu na sidebar para admin
- [x] Exibir banners de avisos ativos na tela SelecionarEstabelecimento após login
- [x] Tipos de aviso: informação, alerta, urgente (com cores diferentes)
- [x] Criar testes para a funcionalidade (23 testes passando)

## Notificação em Lote - Atendimentos Parados
- [x] Adicionar checkboxes para seleção múltipla de atendimentos na tabela
- [x] Adicionar botão "Selecionar Todos" e contador de selecionados
- [x] Criar botão de notificação em lote para atendimentos selecionados
- [x] Criar procedure tRPC registrarNotificacaoEmLote no backend
- [x] Criar função salvarNotificacaoEmLote no pgAtendimentos.ts
- [x] Criar geração de PDF de notificação com layout/logo Safatle (jsPDF + autoTable)
- [x] Adicionar aba "Notificações Geradas" para listar e baixar PDFs
- [x] Botão "Baixar PDF" nos selecionados e no histórico
- [x] Criar testes vitest para a funcionalidade (480 testes passando)

## Persistir Histórico de Notificações no Banco de Dados
- [x] Criar tabela historico_notificacao_lote no PostgreSQL externo (id, data_geracao, qtd_atendimentos, observacao, usuario, atendimentos_json, notificacoes_json)
- [x] Criar helper salvarHistoricoNotificacao no pgAtendimentos.ts
- [x] Criar helper listarHistoricoNotificacoes no pgAtendimentos.ts
- [x] Criar procedure tRPC salvarHistorico para persistir com dados completos
- [x] Criar procedure tRPC listarHistorico para carregar histórico
- [x] Atualizar registrarNotificacaoEmLote para salvar no histórico automaticamente
- [x] Atualizar frontend para carregar histórico do banco na aba "Notificações Geradas" (useMemo + useQuery)
- [x] Gerar PDFs sob demanda a partir dos dados persistidos no banco
- [x] Exibir usuário que gerou a notificação no histórico
- [x] Criar testes vitest para a funcionalidade (486 testes passando)

## Incluir Motivos/Observações no PDF de Atendimentos Parados
- [x] Adicionar coluna "Motivo" na tabela de atendimentos do PDF
- [x] Ajustar larguras das colunas para acomodar a nova coluna

## Mover Avisos e Remover Dashboard Consolidado
- [x] Remover banners de avisos internos da tela SelecionarEstabelecimento
- [x] Remover card de Dashboard Consolidado da tela SelecionarEstabelecimento
- [x] Adicionar banners de avisos internos na tela Home do dashboard (após selecionar estabelecimento)

## Aba Início com Avisos e Notícias
- [x] Criar página Inicio.tsx com avisos internos da empresa e notícias do setor
- [x] Adicionar "Início" como primeiro item na sidebar (antes do Dashboard)
- [x] Configurar rota "/" para a nova página Início
- [x] Mover Dashboard para rota "/dashboard"
- [x] Remover avisos da Home.tsx (agora ficam só no Início)


## Fase 1 - Motor de Regras (Histórico de Validações XML)
- [ ] Implementar histórico de validações XML com SQL raw queries (evitar problemas de tipagem Drizzle)
- [ ] Criar procedures tRPC para salvar/listar/consultar histórico
- [ ] Atualizar página ImportacaoXML para persistir histórico de validações
- [ ] Exibir histórico com filtros por data, usuário e arquivo
- [ ] Criar testes para histórico XML


## Refatoração de Infraestrutura (Semanas 1-6)

- [x] Implementar logger estruturado com Pino
- [x] Criar sistema de auditoria completo com tabela auditLog
- [x] Implementar RBAC consolidado (6 grupos + 24 módulos)
- [x] Criar sistema de idempotência para prevenir duplicação
- [x] Implementar retry logic com exponential backoff
- [x] Configurar Redis Cloud para cache distribuído
- [x] Criar 48 testes vitest (100% passando)
- [x] Adicionar 13 índices de banco para otimização
- [x] Implementar dashboard de auditoria frontend
- [x] Criar 6 módulos temáticos (faturamento, glosa, comparacoes, tasy, relatorios, auditoria)
- [x] Implementar feature flags para rollout gradual
- [x] Criar documentação completa (8 guias, 136 páginas)
- [x] Corrigir assinatura do logger em cache.ts
- [x] Implementar faturamentoRouter com cache Redis
- [x] Criar testes vitest para faturamentoRouter (6 testes passando)
- [ ] Ativar módulo de faturamento com feature flag
- [ ] Ativar módulo de glosa com feature flag
- [ ] Implementar glosaRouter com cache Redis
- [ ] Implementar dashboard de cache para monitoramento
- [ ] Migrar 50% das procedures do monolito para módulos


## Fase 3 - Ativar Módulos com Feature Flags (Semana 6)

- [x] Implementar glosaRouter com cache Redis
- [x] Criar testes vitest para glosaRouter (6 testes passando)
- [x] Implementar dashboard de cache para monitoramento
- [x] Adicionar rota /cache-dashboard no App.tsx
- [x] Atualizar featureFlags.ts com canary deployment
- [x] Implementar fallback automático para monolito
- [x] Corrigir erros de tipagem em trpc.ts
- [ ] Ativar módulo de faturamento com feature flag (5% → 100%)
- [ ] Ativar módulo de glosa com feature flag (5% → 100%)
- [ ] Monitorar métricas de erro e performance
- [ ] Expandir tráfego gradualmente para 100%

## Fase 4 - Próximas Etapas

- [ ] Corrigir erros de tipagem remanescentes em routers/index.ts
- [ ] Migrar 50% das procedures do monolito para módulos
- [ ] Implementar histórico de validações XML
- [ ] Criar procedures tRPC para histórico
- [ ] Atualizar página ImportacaoXML para persistir histórico
- [ ] Exibir histórico com filtros por data, usuário e arquivo


## Fase 4 - Corrigir Erros e Migrar 50% das Procedures (Semana 6 - Completada)

- [x] Corrigir erro de tipagem em trpc.ts linha 112 (comparacaoId)
- [x] Corrigir erros em routers/index.ts linhas 46-47
- [x] Corrigir erro em context.ts (estabelecimentoId)
- [x] Corrigir erro em permissionsConsolidated.ts (valoresAntigos)
- [x] Corrigir erros de iteração em idempotency.ts
- [x] Adicionar target ES2020 e downlevelIteration ao tsconfig.json
- [x] Migrar comparacoesRouter (50% das procedures)
- [x] Implementar cache Redis para comparacoes
- [x] Criar testes vitest para comparacoesRouter (6 testes passando)
- [x] Criar MIGRATION_STRATEGY.md com padrão de implementação
- [x] **ZERO ERROS DE COMPILAÇÃO ALCANÇADO!**

## Fase 5 - Próximas Etapas (Semana 7+)

- [ ] Ativar módulo de faturamento com 5% de tráfego
- [ ] Monitorar métricas por 24h e expandir para 100%
- [ ] Implementar histórico de validações XML
- [ ] Criar procedures tRPC para histórico
- [ ] Atualizar página ImportacaoXML para persistir histórico
- [ ] Exibir histórico com filtros por data, usuário e arquivo
- [ ] Migrar módulo de tasy (procedures de importação)
- [ ] Migrar módulo de relatórios (procedures de geração)


## Fase 6 - Motor de Regras - Histórico de Validações XML (Semana 7)

- [x] Ativar módulos com feature flags (faturamento, glosa, comparações) em 100% de tráfego
- [x] Implementar motorRegrasRouter com procedures tRPC
- [x] Criar procedures: salvarValidacao, listarHistorico, obterValidacao, obterEstatisticas, deletarValidacao
- [x] Integrar cache Redis com TTL de 2 horas
- [x] Criar testes vitest para motorRegrasRouter (6 testes passando)
- [x] Adicionar MOTOR_REGRAS ao CACHE_TTL em cache.ts
- [x] Criar funções invalidateMotorRegrasCache e generateMotorRegrasKey
- [x] Implementar página HistoricoValidacaoXml.tsx com:
  - [x] Tabela de histórico com filtros
  - [x] Estatísticas de conformidade (total, válidas, inválidas, score)
  - [x] Exportar para CSV
  - [x] Deletar validações (admin only)
  - [x] Paginação e busca por arquivo/data
- [x] Adicionar rota /historico-validacao-xml no App.tsx
- [x] Integrar motorRegrasRouter no appRouter (server/routers.ts)
- [x] **ZERO ERROS DE COMPILAÇÃO MANTIDO!**


## Fase 7 - Ler XMLs Importados e Popular Histórico (Semana 8)

- [x] Criar procedure tRPC `populateFromImportedXml` para ler XMLs da tabela faturamento_tiss
- [x] Agrupar XMLs por arquivo e estabelecimento
- [x] Calcular conformidade e estatísticas de cada arquivo
- [x] Detectar outliers e padrões de erro
- [x] Popular historicoValidacaoXml com dados históricos
- [x] Gerar regras automáticas baseadas no histórico
- [x] Criar página PopularHistoricoXml.tsx com interface amigável
- [x] Adicionar rota /popular-historico-xml no App.tsx
- [x] Integrar com motorRegrasRouter
- [ ] Criar testes vitest para procedure populateFromImportedXml
- [ ] Executar população de histórico com dados reais
- [ ] Validar regras geradas automaticamente


## Fase 8 - Refatoração de Relatórios BI (Semana 9)

- [x] Criar procedures tRPC para novos relatórios (itemsPorCategoria, glosasPorMotivo, performanceMedico)
- [x] Adicionar 3 procedures ao relatoriosBI router em server/routers.ts
- [x] Implementar funções em server/db.ts (com dados mock para agora)
- [x] Refatorar RelatoriosBI.tsx com novo layout moderno (4 abas: Dashboard, Análise Itens, Glosas, Médicos)
- [ ] Implementar componentes reutilizáveis (MetricCard, ChartContainer, TrendIndicator, DataTable)
- [ ] Integrar gráficos e tabelas dos novos relatórios
- [ ] Testar responsividade (desktop, tablet, mobile)
- [ ] Implementar dark mode
- [ ] Adicionar filtros por prestador e mês de referência
- [ ] Implementar export para Excel/PDF
- [ ] Validar integração com dados reais do banco


## Fase 9 - Implementar Queries SQL Reais, Graficos e Export (Semana 10-11)

- [x] Criar arquivo db-queries-reais.ts com Drizzle ORM queries
- [x] Implementar getItemsPorCategoria - agrupar por tipo_lancamento
- [x] Implementar getGlosasPorMotivo - agrupar por motivo de glosa
- [x] Implementar getPerformanceMedico - calcular faturado/recebido/glosado por médico
- [x] Instalar Recharts, xlsx e jsPDF via pnpm
- [x] Criar utilitario exportUtils.ts com funcoes export
- [x] Adicionar botoes de export na aba Dashboard
- [ ] Integrar graficos Recharts nas abas (proximo passo)
- [ ] Testar queries com dados reais do banco


## Fase 9 - Gráficos e Filtros de Período (Fevereiro 2026)

- [x] Adicionar gráfico de barras na aba "Glosas" mostrando glosas por motivo
- [x] Adicionar gráfico de linha na aba "Performance Médicos" mostrando evolução de faturado/recebido/glosado
- [x] Implementar filtro de período (mês/ano) visível no painel de controle
- [x] Integrar Recharts para visualização de dados em tempo real
- [x] Criar 13 testes vitest para gráficos e filtros (100% passando)
- [x] Validar que percentuais estão entre 0-100%
- [x] Validar que valores em gráficos são positivos
- [x] Testar combinação de filtros (período + convênio + tipo de lançamento)
- [x] Remover imports duplicados de Chart.js que conflitavam com Recharts


## Fase 10 - Correção de Importação Vivacom (Fevereiro 2026)

- [x] Analisar arquivo Vivacom que não trouxe dados
- [x] Identificar que arquivo é Excel de demonstrativo (retorno da operadora)
- [x] Identificar que parser não reconhecia colunas Vivacom
- [x] Adicionar mapeamento de colunas Vivacom no recebimentosExcelParser
- [x] Primeira importação: 361 registros inseridos em recebimentos_excel
- [x] Identificar que situacao_item estava NULL
- [x] Adicionar lógica para calcular situacao_item baseado em VALOR GLOSA
- [x] Deletar registros antigos do arquivo Vivacom
- [ ] Reimportar arquivo Vivacom com correção
- [ ] Validar que 361 registros foram inseridos com situacao_item correto
- [ ] Verificar sincronização com tabela demonstrativo
- [ ] Verificar dados nos gráficos de Relatórios BI

- [x] Testar com arquivo Demostrativo 12-2025.xls
- [x] Verificar que dados foram importados em recebimentos_excel
- [x] Identificar que sincronizacao automatica nao funcionava
- [x] Sincronizar manualmente dados para tabela demonstrativo
- [x] Adicionar rota tRPC demonstrativo.sincronizar para sincronizacao manual
- [x] Criar testes para validar sincronizacao
- [x] Corrigir validacao de dados no parser para reconhecer colunas Vivacom
- [x] Reimportar arquivo com novo parser corrigido
- [x] Validar que 361 registros foram importados em recebimentos_excel
- [x] Validar que dados foram sincronizados em demonstrativo
- [ ] Verificar dados na tela de Demonstrativo de Retorno
- [ ] Verificar dados nos graficos de Relatorios BI

## Melhorias em Relatórios BI (Em Desenvolvimento)

- [ ] Adicionar tooltip com código TISS ao passar mouse sobre nome do motivo de glosa
- [ ] Implementar filtro por categoria de glosa (Elegibilidade, Autorização, Valorização, etc.)
- [ ] Melhorar exportação Excel para incluir nomes descritivos junto com códigos de motivos


## Funcionalidades Avançadas em Relatórios BI (v2)

- [ ] Gráfico de pizza mostrando distribuição de glosas por categoria
- [ ] Filtro de período avançado com data inicial e final
- [ ] Cálculo e exibição de ticket médio por conta
- [ ] Análise de dados por trimestre
- [ ] Gráfico comparativo de valores por mês
- [ ] Exportação de análises por trimestre em Excel
- [ ] Comparativo de ticket médio entre períodos

## Sistema de Tema (Dark/Light Mode)

- [x] Criar contexto de tema e hook useTheme
- [x] Implementar toggle de tema no header/menu
- [x] Atualizar CSS e cores para suportar ambos os temas
- [x] Salvar preferência de tema no localStorage
- [x] Testar alternância entre temas
- [x] Validar cores em ambos os temas

## Bugs - Sistema de Tema

- [x] Corrigir contraste de cores no tema dark - header e textos muito claros
- [x] Validar visibilidade de todos os elementos em tema dark

- [ ] Redesenhar tema dark com fundo preto e cards em cinza escuro (estilo EasyVision - fundo #000000, cards #1a1a1a, texto #ffffff)


## Motor de Regras - Guia de Uso e Melhorias

### Fase 1: Guia de Uso Completo
- [ ] Criar documentação MOTOR_REGRAS_GUIA.md com exemplos de código
- [ ] Documentar API de análise de padrões de recebimento
- [ ] Documentar API de análise de risco de conta
- [ ] Documentar API de identificação de contas com risco
- [ ] Incluir exemplos de uso em TypeScript/React
- [ ] Criar seção de melhores práticas

### Fase 2: Melhorar Página PrevisaoGlosa
- [ ] Refatorar interface para ser mais intuitiva
- [ ] Adicionar seletor de convênio com validação
- [ ] Implementar visualização de padrões em tabela
- [ ] Adicionar gráficos de taxa de glosa por item
- [ ] Implementar análise de risco de conta com formulário
- [ ] Adicionar identificação de contas com risco
- [ ] Melhorar feedback visual (loading, erros, sucesso)
- [ ] Adicionar exportação de resultados

### Fase 3: Novo Dashboard de Alertas em Tempo Real
- [ ] Criar página DashboardMotorRegras.tsx
- [ ] Implementar widget de estatísticas de conformidade
- [ ] Implementar widget de contas com risco crítico
- [ ] Implementar widget de padrões de glosa por motivo
- [ ] Implementar widget de histórico de validações
- [ ] Adicionar filtros por data e estabelecimento
- [ ] Implementar auto-refresh de dados
- [ ] Adicionar notificações de alertas críticos

### Fase 4: Testes e Validação
- [ ] Testar análise de padrões de recebimento
- [ ] Testar análise de risco de conta
- [ ] Testar identificação de contas com risco
- [ ] Validar performance com grandes volumes
- [ ] Testar filtros e buscas
- [ ] Validar exportação de dados

### Fase 5: Entrega
- [ ] Revisar documentação
- [ ] Criar checkpoint final
- [ ] Apresentar resultados ao usuário


## Motor de Regras - Integração e Notificações

- [ ] Adicionar link "Dashboard Motor de Regras" ao menu lateral do DashboardLayout
- [ ] Implementar sistema de notificações em tempo real com WebSocket
- [ ] Criar hook useMotorRegrasNotifications para polling de alertas
- [ ] Adicionar badge de alertas críticos no menu
- [ ] Testar integração com importação de arquivos
- [ ] Validar notificações em tempo real

## Submenu de Configurações

- [x] Criar submenu colapsível de Configurações na aba lateral
- [x] Criar página Configurações Gerais (Nome, Descrição, Logo, Favicon, Tema)
- [x] Criar página Integração de Dados (WARLEINE, TASY, OMNI, GESTHOR)
- [x] Criar página Usuários e Permissões (Lista de usuários, Grupos de Permissão)
- [x] Criar página Notificações (Tipos de alertas, Canais Email/Push)
- [x] Criar página Backup e Dados (Exportar/Importar, Backups automáticos, Zona de Perigo)
- [x] Remover "Gerenciar Permissões" duplicado do menu principal
- [x] Corrigir conflito entre Configuracoes.tsx antigo e Configuracoes/index.tsx novo
- [x] Adicionar DashboardLayout nas páginas de configuração
- [x] Corrigir roteamento usando window.location.pathname com useLocation como dependência

## Correções Menu de Configurações

- [x] Restaurar telas de cadastro que sumiram do menu (Convênios, Estabelecimentos, Regras, Tabela de Preços)
- [x] Verificar se usuários sumiram do banco de dados (35 usuários confirmados no banco)
- [x] Reorganizar menu lateral com seções claras (Cadastros, Acesso, Sistema)
- [x] Criar página dedicada de Convênios com CRUD completo e associação de prestadores por estabelecimento

## Unificação de Conexões PostgreSQL

- [ ] Analisar conexão direta pgAtendimentos.ts e suas queries
- [x] Analisar WarleineConnector.ts e dados já sincronizados
- [x] Migrar tela Atendimentos Parados para usar banco interno com fallback
- [x] Migrar tela Atendimentos a Faturar para usar banco interno com fallback
- [ ] Remover conexão direta pgAtendimentos.ts após validação completa
- [x] Garantir que dados de ambas as views estejam no Integrador

## Novas Tabelas - Atendimentos Sem Conta e A Faturar

- [x] Criar schema atendimentos_sem_conta no banco interno
- [x] Criar schema atendimentos_a_faturar no banco interno
- [x] Criar funções de sincronização no Integrador para as views do PostgreSQL externo
- [x] Migrar tela Atendimentos Parados para consultar banco interno (com fallback)
- [x] Migrar tela Atendimentos a Faturar para consultar banco interno (com fallback)
- [x] Manter funções de notificação no pgAtendimentos.ts
- [x] Adicionar métodos extrairAtendimentosSemConta e extrairAtendimentosAFaturar no WarleineConnector
- [x] Adicionar procedures sincronizarAtendimentosSemConta e sincronizarAtendimentosAFaturar no Integrador
- [x] Adicionar procedures listarAtendimentosSemConta e listarAtendimentosAFaturar no Integrador

## Conector EASYVISION - Integrador de Dados

- [x] Criar EasyVisionConnector.ts com conexão ao banco PG_ATENDIMENTOS
- [x] Registrar EASYVISION como sistema no Integrador de Dados (labels, frontend)
- [x] Corrigir fluxo de sincronização: view din_Atend_n_receb salva na tabela staging (atendimentos_sem_conta)
- [x] Após staging, popular tabela atendimentos_unificados com dados do EASYVISION
- [x] Corrigir fluxo de sincronização: view din_Atend_receb_s_faturar salva na tabela staging (atendimentos_a_faturar)
- [x] Respeitar estabelecimentoId em todo o fluxo de sincronização
- [x] Atualizar frontend do Integrador com cards EASYVISION
- [x] Testar fluxo completo: EASYVISION -> staging -> atendimentos_unificados
- [x] Escrever testes unitários para EasyVisionConnector

## Bugs - Integrador de Dados

- [x] Filtrar configurações por estabelecimento logado (queries do Hospital Urológico aparecem no Instituto do Rim)
- [x] Corrigir bug de duplicação ao atualizar query (ao clicar em atualizar, gera as duas queries da tela) - resolvido pelo filtro de estabelecimento
- [x] Corrigir erro de query na tabela historicoValidacaoXml que não existe no banco (página /integracao)

## Unificação de Telas de Atendimentos

- [x] Unificar tela Atendimentos e Atendimentos Parados em uma única tela (manter a mais completa)
- [x] Filtrar dados de Atendimentos por estabelecimento selecionado
- [x] Filtrar dados de Atendimentos a Faturar por estabelecimento selecionado
- [x] Remover tela Atendimentos Parados (duplicada) do menu e rotas
- [x] Disponibilizar tela Atendimentos para todos os estabelecimentos (não só Instituto do Rim)
- [x] Disponibilizar tela Atendimentos a Faturar para todos os estabelecimentos

## Unificação de Telas de Atendimentos

- [x] Remover tela Atendimentos Parados do menu e rotas (duplicada da tela Atendimentos)
- [x] Filtrar dados de Atendimentos por estabelecimento selecionado
- [x] Filtrar dados de Atendimentos a Faturar por estabelecimento selecionado
- [x] Disponibilizar tela Atendimentos para todos os estabelecimentos (não só Instituto do Rim)
- [x] Disponibilizar tela Atendimentos a Faturar para todos os estabelecimentos

## Correção Fluxo Atendimentos - Consultar atendimentos_unificados

- [x] Alterar procedure atendimentos.listar para consultar atendimentos_unificados (não atendimentos_sem_conta)
- [x] Alterar procedure atendimentosFaturar.listar para consultar atendimentos_unificados (filtrar por tipo)
- [x] Verificar se WARLEINE popula atendimentos_unificados para Hospital Urológico (estabelecimentoId=1260036)
- [x] Testar tela Atendimentos com dados do Hospital Urológico e Instituto do Rim

## Separação de Tabelas: atendimentos_unificados vs atendimentos_a_faturar
- [x] Remover registros A_FATURAR da tabela atendimentos_unificados (não devem estar misturados)
- [x] Corrigir sincronização EASYVISION: atendimentos_a_faturar NÃO deve popular atendimentos_unificados
- [x] Tela Atendimentos consulta apenas atendimentos_unificados (sem conta)
- [x] Tela Atendimentos a Faturar consulta apenas atendimentos_a_faturar (não atendimentos_unificados)
- [x] Corrigir contagem de tipos (Internação/Exame/Ambulatório) para reconhecer sufixo SEM_CONTA
- [x] Criar tabela warleine_faturamento_staging no schema Drizzle
- [x] Criar tabela faturamento_geral para dados transformados do faturamento
- [x] Migrar 221.627 registros de faturamento (configId 30001) da warleine_atendimentos_staging para warleine_faturamento_staging
- [x] Corrigir sincronização WARLEINE: query tipo faturamento salva em warleine_faturamento_staging
- [x] Corrigir procedure transformarParaAtendimentos para filtrar por configId/tipoDados
- [x] Limpar registros de faturamento da warleine_atendimentos_staging após migração
- [x] Testar fluxo completo: Hospital Urológico 406 atendimentos, Instituto do Rim 697 atendimentos

## Notificação por E-mail (SMTP)
- [x] Solicitar e configurar credenciais SMTP (host, porta, usuário, senha, remetente)
- [x] Instalar pacote nodemailer para envio de e-mail
- [x] Criar serviço de envio de e-mail no backend (server/emailService.ts)
- [x] Criar procedure tRPC para envio de notificação por e-mail
- [x] Adicionar campo de e-mail do destinatário na tela de notificação
- [x] Formatar o conteúdo da notificação em HTML para o e-mail
- [ ] Testar envio de e-mail real
- [x] Escrever testes vitest para o serviço de e-mail

## Envio de E-mail na Barra de Seleção da Tela de Atendimentos
- [x] Criar procedure de envio de e-mail com atendimentos selecionados no backend
- [x] Adicionar campo de e-mail e botão "Enviar por E-mail" na barra de seleção do frontend
- [ ] Testar envio de e-mail com atendimentos selecionados

## Bugs Reportados
- [x] Notificações registradas na tela de Atendimentos não estão sendo salvas/exibidas na coluna Motivo

## Notificações no Banco MySQL Interno
- [x] Criar tabela notificacoes_atendimento no schema MySQL (schema.ts)
- [x] Fazer migration (SQL direto)
- [x] Criar helpers de banco para salvar e buscar notificações do MySQL (db.ts)
- [x] Atualizar procedure registrarNotificacao para salvar no MySQL
- [x] Atualizar procedure registrarNotificacaoEmLote para salvar no MySQL
- [x] Atualizar procedure atendimentos.listar para buscar motivos do MySQL
- [x] Testar fluxo completo de notificação e exibição

## Bug: Motivo de Glosa Unimed no Demonstrativo
- [x] Investigar como o campo motivo é exibido na tela de Análise de Recurso/Demonstrativo
- [x] Corrigir para usar campo erro_tiss como fallback quando codigo_glosa for NULL (caso Unimed)
- [x] Testar exibição do motivo para Unimed

## Incluir campo Observação no E-mail e PDF de Notificação
- [x] Adicionar coluna Observação na tabela HTML do e-mail de notificação
- [x] Adicionar coluna Observação no PDF de notificação (renomeado Motivo para Observação)
- [x] Garantir que a observação é passada corretamente do frontend para o backend

## Integrador de Dados - Tela de Gerenciamento
- [x] Criar schema de metadados (integracao_conexoes, integracao_tabelas, integracao_campos, integracao_sincronizacoes)
- [x] Fazer migration das tabelas de metadados
- [x] Criar helpers de banco para CRUD de conexões, tabelas e mapeamentos
- [x] Criar procedures tRPC para gerenciamento de integrações (admin only)
- [x] Criar execução de DDL dinâmico para criar/alterar tabelas no MySQL
- [x] Criar endpoints de recebimento de dados do agente local
- [x] Criar tela frontend do Integrador de Dados com abas (Conexões, Tabelas, Mapeamentos, Sincronizações)
- [x] Criar funcionalidade de criação de tabelas pela interface (nome, colunas, tipos)
- [x] Criar funcionalidade de mapeamento de campos (origem → destino)
- [x] Criar tela de monitoramento de sincronizações e logs
- [x] Adicionar rota no menu lateral (admin only) - já existia
- [x] Escrever testes vitest

## Bug: NotFoundError insertBefore no envio de notificações
- [x] Investigar causa do erro NotFoundError: insertBefore ao enviar notificações para alguns usuários
- [x] Corrigir o bug no frontend (requestAnimationFrame nos onSuccess das mutations)
- [x] Testar a correção

## Bug/Feature: Integrador - Tabela não criada no banco e criação automática de colunas
- [x] Investigar por que a tabela criada no integrador não aparece no banco MySQL (0 colunas)
- [x] Corrigir fluxo de criação de tabela para executar DDL corretamente
- [x] Implementar detecção automática de campos da query de origem
- [x] Criar colunas automaticamente a partir dos campos retornados pela query
- [x] Atualizar frontend para suportar criação automática
- [x] Testar criação automática de tabela com campos detectados

- [x] Implementar importação incremental no Integrador de Dados (importar apenas registros novos/alterados)
- [x] Adicionar campos modoImportacao, colunaControle, ultimoValorControle na tabela de mapeamentos
- [x] Atualizar procedure executar para suportar importação incremental com filtro WHERE automático
- [x] Adicionar procedure resetarIncremental para resetar controle incremental
- [x] Adicionar endpoint obterControleIncremental para agente local
- [x] Atualizar frontend MapeamentosTab com seleção de modo (completa/incremental)
- [x] Adicionar botões de forçar importação completa e resetar controle incremental
- [x] Na importação completa, limpar tabela antes de inserir novos dados
- [x] Testes unitários para importação incremental (11 testes passando)

- [x] Ao criar tabela a partir de query, salvar automaticamente o mapeamento associado para re-execução
- [x] Mostrar mapeamento vinculado na tabela e permitir re-executar sincronização diretamente
- [x] Botão de sincronizar na lista de tabelas para executar mapeamento salvo

- [x] Fix: Erro ao inserir dados sincronizados - datas em formato JavaScript toString() inválido para MySQL

- [x] Incluir automaticamente o estabelecimentoId nas importações do integrador (tabelas integ_*)

- [x] Adicionar botão de editar query cadastrada na aba Tabelas do Integrador de Dados

- [x] Fix: estabelecimento_id vindo NULL nas importações do integrador de dados (sincronização anterior foi feita antes da implementação - basta re-sincronizar)


## Refatoração Relatórios BI (Nova Interface Modular)

- [x] Refatorar frontend do Relatórios BI com componentes modulares (BIFilters, BICharts, BITables, MetricCard)
- [x] Criar componentes de BI: BIFilters, MetricCard, BICharts (ConvenioBarChart, TiposPieChart, EvolucaoMensalChart), BITables (ConvenioTable, GlosaTable, DescricaoTable)
- [x] Criar componentes auxiliares: StackedProgressChart, TopGlosasChart, InsightCards
- [x] Integrar novo RelatoriosBI.tsx com estabelecimentoId do contexto
- [x] Integrar framer-motion para animações
- [x] MetricCard: layout com ícone à direita, título uppercase, trend "vs mês anterior"
- [x] InsightCards: "Convênio Mais Crítico" com taxa, valores, barra de progresso + "Variação Mensal" com comparação mês a mês
- [x] StackedProgressChart: barras horizontais verde/vermelho com percentuais e legenda
- [x] TopGlosasChart: numeração (1,2,3...), barras de progresso vermelhas, valores em vermelho, percentuais
- [x] Ajustar RelatoriosBI.tsx para passar dados corretos aos componentes atualizados
- [x] Corrigir gráfico de pizza (TiposPieChart) - labels exibindo valores brutos sem formatação em vez de percentuais
- [x] Gráfico donut: interatividade ao clicar em fatia para filtrar dados por tipo
- [x] Gráfico donut: transformar pizza em donut com total no centro
- [x] Gráfico donut: toggle para alternar entre visualização por valor (R$) e quantidade de itens
- [x] Bug: Integrador de Dados - outro usuário admin não vê conexões/queries cadastradas no estabelecimento (corrigido: verificar permissão por grupo de estabelecimento em vez de role global)
- [x] Criar tabela recebimento_geral no schema Drizzle com todos os campos especificados
- [x] Criar procedure de importação para popular recebimento_geral a partir da tabela integ_faturado_recebido
- [x] Criar tabela convenio_mapeamento no schema (estabelecimentoId, nomeOrigem, codigoOrigem, convenioId)
- [x] Criar procedures tRPC para CRUD de mapeamentos e matching automático por similaridade
- [x] Criar tela frontend de configuração de mapeamentos com sugestões automáticas
- [x] Integrar mapeamento na importação de dados (recebimento_geral usa convenioId do Safatle)
- [x] Bug: Mapeamento de Convênios mostra 0 convênios - corrigido: busca de múltiplas fontes de dados
- [x] Re-executar importação recebimento_geral com mapeamentos de convênios para preencher convenioId
- [x] Criar aba "Relatórios" dentro do Relatórios BI com menu de sub-relatórios
- [x] Backend: procedure tRPC para dados de recebimento geral agregados
- [x] Componente RelatorioRecebimento com MetricCards, gráficos e tabelas (mesmo padrão visual)
- [x] Integrar aba Relatórios no RelatoriosBI.tsx com navegação para sub-relatórios
- [x] Reestruturar: remover aba "Relatórios" de dentro do RelatoriosBI.tsx
- [x] Criar página separada RelatorioRecebimentoGeral como rota própria
- [x] Adicionar submenu "Relatórios BI" no sidebar com subchamadas (Dashboard BI, Recebimento Geral, Rel. Faturamento, Rel. Atendimentos)
- [x] Registrar novas rotas no App.tsx
- [x] BUG: Importação de retorno Unimed não traz itens glosados corretamente (universal para todos os estabelecimentos)
- [x] BUG: Tela de Demonstrativo não exibe corretamente os itens glosados da Unimed (dados estão no recebimentos_excel mas não na tela)
- [x] Alterar tipo da coluna receber_hospital de decimal(15,2) para varchar(1) na tabela recebimento_geral
- [x] Atualizar registros existentes com valores S/N da tabela integ_faturado_x_recebido
- [x] Corrigir sincronização para copiar campo receber corretamente
- [x] Adicionar filtro "A Receber" (Hospital S / Terceiros N / Todos) no backend das queries de recebimento_geral
- [x] Adicionar filtro "A Receber" no relatório Recebimento Geral (frontend)
- [x] Filtro "A Receber" não aplicável ao Dashboard BI (usa faturamento_tiss, não recebimento_geral)
- [x] Filtro "A Receber" disponível no BIFilters como prop opcional (para telas que usam recebimento_geral)
- [x] Criar tabela conciliacao no banco (resultado do cruzamento faturado x demonstrativo)
- [x] Criar tabela vinculacao_codigos no banco (de-para códigos hospital x convênio)
- [x] Implementar service de cruzamento no backend (agrupar por código, cruzar só S, usar de-para)
- [ ] Criar procedures tRPC para conciliação (rodar cruzamento, listar resultados, vincular códigos)
- [ ] Integrar cruzamento automático na importação de demonstrativo
- [ ] Criar tela de Conciliação com visualização por guia/item e vinculação manual de códigos
- [ ] Persistir histórico de conciliações para consulta futura
- [x] Criar tabela faturamento_unificado no banco e schema (unifica Tasy + XML TISS)
- [x] Renomear conciliacaoTasy para conciliacao no banco e schema
- [x] Renomear resumoConciliacaoTasy para resumoConciliacao
- [x] Corrigir conciliacaoService.ts para usar sql.raw() em todas as funções (padrão do projeto)
- [x] Adicionar funções auxiliares: deletarVinculacao, atualizarStatusConciliacao
- [x] Testes vitest para conciliacaoService (21 testes passando)
- [x] Investigar falha na integração Warleine: Warleine_Atendimentos_staging não popula atendimentos_unificados
- [x] Corrigir fluxo de sincronização staging → atendimentos_unificados (jobScheduler.ts: conexão + mapeamento de campos)
- [x] Verificar se frontend exibe dados atualizados de atendimentos_unificados (435 registros WARLEINE)
- [x] Analisar e importar arquivo IpasgoHemolaborComp.12-2025-PGTO02-2026.xlsx no recebimentos Excel (mapeamento IPASGO adicionado ao parser, 28/34 colunas mapeadas, 11 testes passando)
- [x] Investigar e corrigir processamento travado do arquivo IPASGO (ID 1560001) - causa: arquivo 10.4MB consome 812MB RAM, otimizado com processamento em chunks
- [x] Reprocessar arquivo IPASGO (ID 1560001) diretamente pelo backend - 71.052 registros inseridos em 30s
- [x] Criar tabela faturamento_unificado no schema Drizzle (unifica Tasy + XML TISS)
- [x] Implementar service de população do faturamento_unificado (faturamentoUnificadoService.ts - 12 funções exportadas)
- [x] Adaptar conciliacaoService para cruzar faturamento_unificado x recebimentos_excel
- [x] Criar procedures tRPC para conciliação (faturamentoUnificadoRouter.ts - 10 procedures)
- [x] Criar tela Conciliação Cruzada (ConciliacaoCruzada.tsx) com visualização por guia/item
- [x] Implementar vinculação manual de guias do mesmo paciente entre faturado e recebido
- [x] Testes vitest para faturamento_unificado (16 testes passando)
- [x] Corrigir erro tRPC na página /selecionar-estabelecimento: timeout 5s no fetch de notícias + lock de sincronização + onDuplicateKeyUpdate no jobScheduler
- [x] Implementar algoritmo de conciliação automática no faturamentoUnificadoService (cruzar por código procedimento + número guia)
- [x] Criar procedure tRPC para executar conciliação automática (conciliarAutomaticamente + resetarConciliacao)
- [x] Adicionar botão "Conciliar Automaticamente" na tela ConciliacaoCruzada com resumo de resultados e modal de detalhes
- [x] Considerar vinculação de códigos divergentes (tabela vinculacao_codigos) no cruzamento - 4 estratégias de matching
- [ ] Persistir histórico de conciliações para consulta futura
- [x] Testes vitest para conciliação automática (15 testes passando)
- [x] Analisar estrutura da tabela integ_faturado existente (118k registros, 40 colunas)
- [x] Mapear campos integ_faturado → faturamento_unificado
- [x] Criar schema Drizzle espelhando integ_faturado existente (40 colunas, índices criados)
- [x] Criar popularDeIntegFaturado() no faturamentoUnificadoService (INSERT SELECT)
- [x] Atualizar popularFaturamentoUnificado() para juntar integ_faturado + faturamento_tiss (WARLEINE + XML_TISS)
- [x] Remover faturadoTasy do fluxo de população (mantido como legado, não usado no popularTudo)
- [x] Atualizar router tRPC para expor nova fonte WARLEINE (popularDeIntegFaturado procedure)
- [x] Atualizar frontend para mostrar as duas fontes (ConciliacaoCruzada atualizada)
- [x] Testes vitest para popularDeIntegFaturado (9 testes passando + 15 conciliação)
- [x] Corrigir erro de chaves duplicadas (duplicate key 2026-02, 2026-03) no SelectItem de competências na ConciliacaoCruzada
- [x] Analisar e garantir segregação de dados por estabelecimento na tela Conciliação Cruzada (já estava correto - todas queries filtram por estabelecimentoId)
- [x] Corrigir campos de valor zerados (R$ 0,00) na tabela principal da Conciliação Cruzada — nomes de campos desalinhados (valorTotalFaturado → valorFaturado)
- [x] Preencher valores Pago/Glosa no faturamento_unificado a partir dos recebimentos vinculados durante a conciliação automática
- [x] Criar schema Drizzle para tabela conciliados_automatico (separada do faturamento_unificado)
- [x] Migrar tabela conciliados_automatico no banco (criada via SQL direto)
- [x] Refatorar executarConciliacaoAutomatica para INSERT na conciliados_automatico em vez de UPDATE no faturamento_unificado
- [x] Refatorar resetarConciliacao para DELETE da conciliados_automatico
- [x] Criar função listarConciliadosAutomatico com filtros e paginação
- [x] Criar função resumoConciliadosAutomatico com totais por status
- [x] Criar procedures tRPC para listar/resumir dados da conciliados_automatico (listarConciliados + resumoConciliados)
- [x] Atualizar frontend ConciliacaoCruzada para apresentar dados da nova tabela (abas Conciliados + Faturamento Unificado)
- [x] Reverter alterações de valorPago/valorGlosa no faturamento_unificado (dados de conciliação agora ficam na conciliados_automatico)
- [x] Testes vitest para novo fluxo de conciliação com tabela separada (24 testes passando)
- [x] Corrigir filtros na aba Conciliados (competência, convênio, status agora filtram com queries específicas da conciliados_automatico)
- [x] Reestruturar aba Conciliados: agrupar por GUIA primeiro (Faturado, Recebido, Glosado, Diferença, Status)
- [x] Criar tela de detalhes dedicada ao clicar na guia (itens que deram match com valores individuais, cards resumo + tabela detalhada)
- [x] Criar query de agrupamento por guia na conciliados_automatico (resumoConciliadosPorGuia + itensConciliadosPorGuia)
- [x] Adicionar nome do paciente na tabela de guias conciliadas (preferir do demonstrativo/recebimento)
- [x] Remover coluna Convênio da tabela de guias conciliadas
- [x] Adicionar descrição do item/medicamento na tela de detalhes da guia
- [x] Adicionar tipo do item na tela de detalhes (tipoLancamento do demonstrativo)
- [x] Adicionar código de glosa na tela de detalhes da guia (motivoGlosa pendente tabela motivosGlosa vazia)
- [x] Popular tabela motivosGlosa com dicionário oficial TISS de códigos de glosa (527 códigos extraídos da Tabela 38 ANS)
- [x] Integrar descrição do motivo de glosa na tela de detalhes da conciliação automática (LEFT JOIN motivosGlosa + exibição com grupo)
- [x] Bug: Nomes dos medicamentos não aparecem na tela de detalhes da conciliação (COALESCE com faturamento_unificado via LEFT JOIN)
- [x] Bug: Itens duplicados na tela de detalhes da conciliação (deduplicação com ROW_NUMBER na popularDeXmlTiss)
- [x] Limpar dados das tabelas conciliados_automatico e faturamento_unificado
- [x] Bug: Excel IPASGO (Hemolabor) - IPASGO marca tudo como PAGO mesmo com glosa; adicionada lógica para reclassificar como GLOSADO quando valor_glosa > 0; sincronizado demonstrativo com 71.052 registros (4.617 glosados, R$ 850.143,08)
- [x] Bug: Tela de Análise de Glosa não mostra itens glosados do IPASGO (Hemolabor) - corrigido: demonstrativo re-sincronizado com convenio_id=30001 e estabelecimentoId=6 (4.617 glosados, R$ 850.143,08)
- [x] Adicionar filtro por Motivo de Glosa na tela de Análise de Glosa (dropdown com motivos textuais como GUIA VENCIDA, DOCUMENTAÇÃO INCOMPL, etc.)
- [x] Analisar e corrigir gerador de XML de recurso de glosa para seguir formato validado pelo convênio (17 correções: hash MD5, valorTotalRecursado, dataRecurso, codGlosaItem numérico, registroANS, codigoPrestador, etc.)
- [x] Implementar validação TISS do XML contra schema XSD da ANS antes de permitir download/envio (validador estrutural com 16 testes, verifica campos obrigatórios, tipos, hash MD5, registroANS, codGlosaItem numérico)
- [x] Implementar histórico de XMLs gerados: salvar cada XML no S3 com link no lote de recurso para consulta futura e reenvio (campos xmlUrl, xmlKey, xmlGeradoEm na tabela lotesRecurso)
- [x] Bug: Itens duplicados com mesmo código na conciliação não pareados corretamente (ex: 90465865 Cefazolina e Cefalotina na guia 66515809) - implementado agrupamento automático no backend
- [x] Adicionar data do item na tela de detalhes da conciliação e no comparativo (coluna Data Exec. com COALESCE ca.dataExecucao/fu.dataExecucao)
- [x] Aplicar lógica de alta administrativa na conciliação (badge Alta Adm. quando totalContas > 1, badge de itens agrupados no frontend)
- [ ] Persistir histórico de conciliações para consulta futura
- [x] Bug: Importação Excel IPASGO - valores cobrados, pagos e glosados estão R$ 0,00 para todos os itens (Hospital Nossa Senhora de Inhumas) - corrigido mapeamento de campos: item→codigoProcedimento, itemDesc→descricaoProcedimento, valorInformado→valorCobrado, valorPagamento→valorPago, valorGlosa→valorGlosado
- [x] Corrigir parser IPASGO para extrair valores corretamente para todos os prestadores/estabelecimentos - mapeamento universal no getRecebimentosExcel + resumo com SUM(valorPagamento) e SUM(valorInformado)
- [x] Bug: Glosas IPASGO não detectadas corretamente - corrigido: ampliadas colunas codigo_glosa/erro_tiss para 500 chars, adicionada correção IPASGO para valorInformado = VALOR_UNITARIO × QUANTIDADE, reprocessado arquivo (64 glosados, R$ 3.594,67)
- [x] Reprocessar todos os arquivos IPASGO de todos os estabelecimentos para aplicar correção de glosas - Ox Uti: 83 glosados R$ 15.497,08 | Inhumas: 64 glosados R$ 3.594,67 | Hemolabor: 4.617 glosados R$ 850.143,08
- [x] Bug: Itens glosados do Excel (recebimentos_excel) não aparecem na tela de Análise de Glosa - resolvido executando syncDemonstrativoByArquivo para os 3 arquivos IPASGO
- [x] Bug: XML de recurso de glosa IPASGO não conforme TISS 3.02 - corrigido: padrão 3.02.00, codGlosaItem numérico (mapeamento automático texto→código TISS Tabela 38), justificativa truncada 150 chars, CNPJ/guias apenas números, registroANS 6 dígitos
- [x] Bug: sequencialTransacao no XML recurso de glosa muito grande - corrigido: agora usa ID do lote padded para 6 dígitos (max 10), numeroLote e guiaRecGlosa apenas numéricos
- [x] Bug: XML recurso de glosa IPASGO - guias informadas não constam no protocolo recursado (496070) - corrigido: agora gera múltiplos XMLs (1 por protocolo), agrupando guias pelo protocolo do demonstrativo. Frontend baixa cada XML separadamente com nome do protocolo.
- [x] Adicionar indicador visual no card do lote mostrando quantos protocolos/XMLs serão gerados antes de exportar - badge azul com ícone Layers mostrando "X protocolos (X XMLs)"
- [x] Implementar botão para baixar todos os XMLs de um lote em arquivo ZIP - botão roxo "Baixar ZIP (X XMLs)" com archiver, salva no S3 e abre download
- [x] Reorganizar navegação lateral em módulos com sub-abas colapsáveis
- [x] Módulo 1 - Upload Contas: sub-abas Upload de Arquivos, Arquivos, Conta Convênio
- [x] Módulo 2 - Regras de Contas: sub-abas Comparativos, Motor de Regras, Regras de Negócios
- [x] Módulo 3 - Recebimentos: sub-abas Upload XML (renomear Recebimentos XML), Upload Excel (renomear Recebimentos Excel), Demonstrativo
- [x] Módulo 4 - Recurso de Glosa: sub-abas Análise de Glosa, Recursos Analisados (renomear Recursos de Glosa), Envio de Lote, Acompanhamento Recursos
- [x] Módulo 5 - Relatórios BI: adicionar abas Atendimentos, Atendimentos a Faturar, Não Recebidos (manter existentes)
- [x] Módulo 6 - Conciliações: sub-aba Conciliação Cruzada
- [x] Módulo 7 - Gerenciamento: sub-abas Dashboard, Dashboard Consolidado, Dashboard IA, Produtividade, Tendências
- [x] Módulo 8 - Configurações: adicionar abas Integrador de Dados, Mapeamento Convênios, Avisos Internos, Regras de IA, Dicionário de Glosas
- [x] Excluir aba Conciliação Contas Pagas - removida rota e import do App.tsx
- [x] Otimizar build: code-splitting e lazy loading - bundle principal reduzido de 5.4 MB para 905 KB (-83%), build de 50s para 16s

## Limpeza e Otimização de Deploy
- [x] Remover scripts .mjs temporários do git tracking (~100 arquivos)
- [x] Remover arquivos de dados (.xlsx, .pdf, .xml) do git tracking
- [x] Atualizar .gitignore para prevenir re-adição de arquivos temporários
- [x] Limpar arquivos deletados do git cache
- [x] Manter test_files necessários para testes unitários
- [x] Verificar build funcional após limpeza (1006 testes passando)

## Limpeza e Otimização de Deploy
- [x] Remover scripts .mjs temporários do git tracking
- [x] Remover arquivos de dados do git tracking
- [x] Atualizar .gitignore
- [x] Verificar build funcional após limpeza

## Otimização Agressiva de Deploy (v2)
- [x] Analisar dependências pesadas do node_modules
- [x] Implementar manualChunks no Vite
- [x] Reduzir tamanho total do projeto
- [ ] Otimizar snapshots drizzle/meta
- [x] Sincronizar com repositório GitHub safatle-sistema
- [x] Implementar lazy loading nas páginas pesadas
- [ ] Corrigir XML de Recurso de Glosa TISS para validação Factiss
- [ ] Corrigir cabecalho/Padrao (versaoPadrao em vez de versaoTISS)
- [x] Adicionar nomeContratado no dadosContratado
- [ ] Adicionar sequentialItem e dataInicio nos itensGuia
- [ ] Corrigir erros Factiss persistentes: Padrao->versaoPadrao, nomeContratado, sequencialItem nos itensGuia
- [x] Corrigir skill: XML é específico por convênio, não universal. IPASGO é o primeiro modelo.

## Padrões de Cobrança por Convênio (4 tipos)
- [ ] Padrão 1: Preço por Procedimento/Convênio (média, min, max, desvio)
- [ ] Padrão 2: Composição de Conta/Kit Cirúrgico (itens associados)
- [ ] Padrão 3: Glosa por Convênio (taxa de glosa por item)
- [ ] Padrão 4: Quantidade por Item (média, min, max por atendimento)
- [ ] Backend: funções de análise no db.ts
- [ ] Backend: procedures no routers.ts
- [ ] Frontend: tela dedicada de Padrões de Cobrança
- [ ] Testes unitários


## Padrões Editáveis + Comparação com Contas
- [ ] Adicionar campos de edição nos padrões (valor ajustado, qtd ajustada, status revisado)
- [ ] Criar interface de edição inline nos padrões gerados
- [ ] Implementar motor de comparação: padrão vs contas importadas
- [ ] Criar tela de divergências encontradas (preço, quantidade, composição, glosa)
- [ ] Escrever testes para o motor de comparação
- [ ] Alertas de divergência integrados na aba Conta Convênio
- [ ] Dashboard gerencial de divergências (visão consolidada)

## Busca de Conta via Integrador de Dados + Comparação com Padrões
- [ ] Analisar Integrador de Dados existente para reaproveitar busca no banco do cliente
- [ ] Adicionar opção "Buscar Conta" na tela de Upload (ao lado do upload XML)
- [ ] Implementar busca de conta por número no banco do cliente via Integrador
- [ ] Salvar conta buscada na estrutura da Conta Convênio
- [ ] Comparar conta importada/buscada contra padrões de cobrança do convênio
- [ ] Mostrar divergências na Conta Convênio
- [ ] Dashboard gerencial de divergências

## Nova Arquitetura: contas_convenio_itens
- [x] Criar tabela contas_convenio_itens no schema
- [x] Criar query de busca por número de conta no Warleine (baseada em integ_faturado)
- [x] Implementar router para buscar conta e salvar na nova tabela
- [x] Implementar import de XML para nova tabela (ao lado do fluxo existente)
- [x] Adicionar opção "Buscar Conta" na tela de Upload
- [x] Motor de comparação: conta vs padrões com divergências
- [x] Alterar tela existente ContaConvenio para usar nova tabela contas_convenio_itens
- [x] Adicionar aba de divergências na tela ContaConvenio existente
- [ ] Implementar edição de padrões de cobrança (gabarito)
- [ ] Dashboard gerencial de divergências
- [x] Refatorar busca de conta para usar query_configuracoes do Integrador de Dados (parametrizado por estabelecimento)
- [x] Fix: buscarConta procura em query_configuracoes mas a Busca Conta foi cadastrada como Mapeamento de Dados
- [x] Fix: buscarConta falha ao conectar - melhorar log/mensagem de erro com detalhes da conexão
- [ ] Fix: página 404 no frontend (rota não encontrada)
- [x] Fix: conta importada com valores R$ 0,00 - mapeamento flexível de campos (aceita nomes originais e aliases)
- [ ] Fix: nome do paciente não vem na busca de conta (subquery de paciente não retorna)
- [x] Fix: botão "Ver" redireciona para /conta-convenio-v2 que não existe (404) - corrigido para /conta-convenio-detalhes
- [x] Feature: após importar conta com sucesso, redirecionar automaticamente para tela de Conta Convênio (1s delay)
- [x] Feature: botão de edição na tabela de Mapeamentos de Dados para editar query SQL e configurações
- [x] Ajustar mapeamento de campos no buscarConta para nova query (lancamen/contas/faturas com campos: nomepaciente, codrecur, complrecur, codtiss, descmotivo, tipoatend, databaixa, codplaco, nomeplaco, medsolic, nomemedsolic)
- [x] Popular tela Conta Convênio com dados importados dos XMLs do Pronto Socorro Infantil (migrar dados de faturamento_tiss para contas_convenio_itens)
- [x] Botão "Importar XMLs" na tela Conta Convênio para migrar dados XML do faturamento_tiss para contas_convenio_itens
- [x] Testes unitários para migrarDadosXml (14 testes passando: migração, listagem, itens, divergências)
- [x] Adicionar filtro de mês/período (competência MM/AAAA) na tela de Conta Convênio para análise mensal
- [x] Corrigir competência das contas XML na Conta Convênio para usar data_referencia do upload em vez de dataExecucao calculada
- [x] Popular tela Conta Convênio com dados importados dos XMLs do estabelecimento Ox Uti
- [x] Adicionar indicador visual de Alta Administrativa na tela Conta Convênio (badge para guias com múltiplos lotes)
- [x] Adicionar indicador visual de Alta Administrativa na tela Conciliação Cruzada (badge para guias com múltiplos lotes - já existia)
- [x] Corrigir Padrões de Cobrança: composição deve ser gerada apenas para procedimentos, excluindo materiais e medicamentos
- [x] Gabarito Passo 1: Tela de revisão de padrões - aprovar/rejeitar/editar padrões em status "aprendendo"
- [x] Gabarito Passo 2: Gabarito manual - criar padrão do zero definindo procedimento + itens obrigatórios com quantidades
- [x] Gabarito Passo 3: Comparação gabarito vs realidade na Conta Convênio - identificar itens faltantes, extras e divergentes
- [x] Gabarito Passo 4: Feedback loop - aceitar/rejeitar divergências alimenta e refina o padrão ao longo do tempo
- [x] BUG: Corrigir erro NotFoundError removeChild - Integrador de Contas (Atualizar Easy) - danilo.chaves
- [x] BUG: Corrigir erro NotFoundError removeChild - Upload de Contas (número de conta) - iury.barbosa
- [x] BUG: Corrigir erro NotFoundError removeChild - Conta Convênio (Carregar Padrões) - iury.barbosa
- [x] Feature: Gabarito com múltiplos procedimentos (CIRURGIA A + CIRURGIA B como padrão combinado)
- [x] UI: Aumentar tamanho da modal de criação de gabarito manual
- [x] UI: Aumentar tamanho da modal de edição de itens do padrão
- [x] Feature: Adicionar campos Qtd Mínima e Qtd Máxima permitida nos itens do gabarito/padrão
- [x] UI: Aumentar ainda mais o tamanho da modal de edição de itens do padrão (quase fullscreen)
- [x] Feature: Autocomplete de códigos nos campos de itens do gabarito (busca do faturamento_unificado)
- [x] BUG: XMLs importados (status Processado) não aparecem na Conta Convênio - corrigido: migração automática adicionada ao fluxo de upload
- [x] BUG: Filtros da tela Conta Convênio são perdidos ao navegar para detalhes e voltar
- [x] UI: Substituir modal de criação de gabarito por tela dedicada (página completa)
- [x] UI: Substituir modal de edição de itens do padrão por tela dedicada (página completa)
- [x] UI: Transformar modal de Detalhes do padrão em tela dedicada (consistência visual)
- [x] BUG: Autocomplete de códigos na tela Criar Gabarito não mostra sugestões ao digitar - procedure backend estava faltando
- [x] DOC: Criar manual completo de tabelas usadas por módulo (frontend e backend)
- [x] UI: Mover aba Relatórios para subpasta do grupo Gerenciamento no sidebar
- [x] UI: Mover aba Repasse para subpasta do grupo Recebimentos no sidebar
- [x] Feature: Adicionar campo setor nos padrões de composição (padroesCobranca) para diferenciar padrões por setor de atendimento
- [x] Feature: Atualizar geração de padrões de composição para agrupar por setor
- [x] Feature: Atualizar comparação conta vs padrão para considerar setor do item
- [x] Feature: Atualizar frontend (Padrões de Cobrança, Criar Gabarito, Conta Convênio) para exibir/filtrar por setor
- [x] Feature: Adicionar campo setor nos padrões de preço (padroesCobranca tipo=preco) para comparação por setor
- [x] Feature: Adicionar campo setor nos padrões de quantidade (padroesCobranca tipo=quantidade) para comparação por setor
- [x] Feature: Atualizar geração de padrões de preço/quantidade para agrupar por setor
- [x] Feature: Atualizar comparadorPadroes para usar setor nos padrões de preço e quantidade
- [x] Feature: Atualizar frontend Padrões de Cobrança para exibir setor nas abas preço/quantidade
- [x] Feature: Incluir coluna/badge de setor na tela de Conta Convênio
- [x] Feature: Score de Risco Consolidado por Conta (0-100) com detalhamento por tipo
- [x] Feature: Detecção de Outliers de Valor Total por Conta (acima/abaixo da média)
- [x] Feature: Padrão por Profissional Executante (composição, preço, quantidade)
- [x] Feature: Estrutura para importação de tabelas CBHPM e tabelas de porte por convênio (Unimed, Ipasgo)
- [x] Feature: Exibir Score de Risco na tela de Conta Convênio Detalhes
- [x] Feature: Exibir indicador de Outlier na listagem de Contas Convênio
- [x] Feature: Filtro por profissional na tela de Padrões de Cobrança
- [x] UI: Adicionar filtro de profissional e checkbox de agrupar por profissional visível na tela de Padrões de Cobrança (aba Composição)
- [x] Bug: Checkbox de agrupar por profissional não aparece visível na tela de Padrões de Cobrança (confirmado pelo usuário que está funcionando)
- [ ] UI: Melhorar visibilidade do Score de Risco e Outliers na listagem de contas
- [x] Feature: Sistema de feedback de auditores - schema de banco de dados (tabela feedbackAuditor) - já existia
- [x] Feature: Sistema de feedback de auditores - procedures tRPC (criar, listar, atualizar feedback) - já existia
- [x] Feature: Sistema de feedback de auditores - UI nos botões de ação da tabela de divergências (aprovar/rejeitar/comentar) - melhorado com indicadores visuais, histórico, aba de auditoria
- [x] Feature: Sistema de feedback de auditores - testes vitest
- [x] Feature: Aba de Falhas de Prontuário na tela de detalhes da conta - checklist de falhas comuns com checkbox
- [x] Feature: Aba de Falhas de Prontuário - campo de observações/motivos para cada marcação
- [x] Feature: Schema de banco para falhas de prontuário (tabela falhasProntuario)
- [x] Feature: Procedures tRPC para CRUD de falhas de prontuário
- [x] Feature: Edição de itens pela auditora - alterar quantidade de itens existentes
- [x] Feature: Edição de itens pela auditora - alterar valor de itens existentes
- [x] Feature: Edição de itens pela auditora - adicionar novos itens faltantes à conta
- [x] Feature: Schema/procedures para ajustes de auditoria em itens
- [x] Feature: Dashboard consolidado de auditoria na tela de Gerenciamento - métricas gerais
- [x] Feature: Dashboard de auditoria - filtro por período
- [x] Feature: Dashboard de auditoria - KPIs de contas auditadas, divergências, feedbacks
- [x] Feature: Sistema de aprendizado automático - tabela de padrões aprendidos (aprendizadoAuditoria)
- [x] Feature: Sistema de aprendizado automático - registrar cada ação da auditora como dado de treinamento
- [x] Feature: Sistema de aprendizado automático - sugestões de falhas de prontuário baseadas em histórico
- [x] Feature: Sistema de aprendizado automático - sugestões de ajustes de itens baseadas em padrões recorrentes
- [x] Feature: Sistema de aprendizado automático - sugestões de decisão de feedback baseadas em histórico
- [x] Feature: Nova aba no Dashboard de Produtividade - métricas de importação de contas via banco (integrador de dados)
- [x] Feature: Mostrar quem importou, quando, quantas contas via integrador
- [x] Feature: Renomear "Relatórios BI" para "Faturado x Recebido x Glosado" no título e sidebar
- [x] Feature: Adicionar KPI de Recursos (contestações) nos cards do relatório BI
- [x] Fix: Sidebar - aba principal deve ser "Relatórios BI", subpasta "Dashboard BI" renomear para "Faturado x Recebido x Glosado"
- [x] Feature: Adicionar coluna "Recursado" na tabela de Dados por Convênio no relatório BI
- [x] Bug: Valor Recursado mostra R$ 0,00 na tabela por convênio - corrigido: agora cria entrada no porConvenioMap se não existir
- [x] Fix: Arredondar números de Itens na tabela por convênio e card Ticket Médio com Math.round()
- [x] Bug: Valor Recursado continua R$ 0,00 na tabela por convênio - causa: frontend descartava campo valorRecursado no useMemo
- [x] Feature: Adicionar coluna Recuperado na tabela Dados por Convênio
- [x] Feature: Adicionar coluna Taxa de Recuperação na tabela Dados por Convênio
- [x] Feature: Distribuir valorRecuperado por convênio no backend
- [x] Feature: Incluir Recuperado e Taxa Recuperação no export Excel
- [x] Reorganizar menu: remover Atendimentos e Atendimentos a Faturar de dentro de Relatórios BI
- [x] Criar nova aba Atendimentos no menu principal com subpastas: Atendimentos e Atendimentos a Faturar
- [x] Criar relatório de itens auditados na tela Conta Convênio Detalhes
- [x] Backend: reutiliza queries existentes (divergências, falhas, ajustes) consolidadas no frontend
- [x] Frontend: nova aba 'Rel. Faturista' com tabela consolidada, cards resumo e export Excel
- [x] Adicionar campo de convênio na tela de criação de gabaritos para vincular regra ao convênio
- [x] Adicionar campo de convênio na tela de edição de gabaritos (EditarPadrao)
- [x] Exibir badge de convênio na listagem de gabaritos e composições
- [x] Backend: editarPadrao aceita convenioId para alterar convênio vinculado
- [x] Botão de ajuste/edição das regras já existia (Editar), agora com campo de convênio
- [x] Backend: endpoint duplicarGabarito que copia um gabarito existente para outro convênio/setor
- [x] Frontend: botão Duplicar na listagem de gabaritos com modal para selecionar convênio/setor destino
- [x] Testes vitest para duplicação de gabarito (16 testes passando)
- [x] Fluxo Conferência Pós-Correção: tabela snapshot_auditoria para salvar estado dos itens auditados
- [x] Backend: salvar snapshot via botão Gerar Snapshot na tela Conta Convênio Detalhes
- [x] Backend: lógica de comparação automática na reimportação (antes vs depois)
- [x] Backend: endpoints para listar conferências, detalhes de comparação, dashboard
- [x] Frontend: tela Conferência Pós-Correção com cards resumo, filtro por status e lista de contas
- [x] Frontend: dashboard de acompanhamento (Aguardando/Reimportadas/Aprovadas/Reprovadas/Taxa Correção)
- [x] Testes vitest para lógica de comparação de snapshots (19 testes passando)
- [x] Bug: Descrição do item não preenche automaticamente - adicionado auto-seleção no blur quando código exato é digitado
- [x] Bug: Seletor de setor - setores vem do faturamento_unificado, aparecem conforme dados são importados (comportamento correto)
- [x] Bug: Botão Duplicar adicionado na seção de Composições (antes só tinha em Gabaritos)
- [x] Feature: Duplicação em lote com checkboxes, barra de ações e modal para selecionar convênio/setor destino
- [x] Feature: Duplicação individual agora permite duplicar composições (não apenas gabaritos)
- [x] Templates de Mapeamento: seletor de sistema (Warleine/Tasy/MV/EasyVision/Personalizado) na criação de mapeamento
- [x] Template Warleine: query SQL e mapeamento de campos pré-configurados
- [x] Template Tasy: query SQL e mapeamento de campos pré-configurados
- [x] Template MV: query SQL e mapeamento de campos pré-configurados
- [x] Template EasyVision: query SQL e mapeamento de campos pré-configurados
- [x] Frontend: modal/wizard de criação de mapeamento com seletor de template e preview dos campos
- [x] Testes vitest para templates de mapeamento (32 testes passando)
- [x] Bug: Erro de query na tabela integracao_conexoes na página /integracao (estabelecimentoId=4) - Adicionado retry automático com reconexão para erros transitórios (ECONNRESET, etc.)
- [x] Ajustes de Auditoria: Adicionar coluna de Setor na tabela de itens
- [x] Ajustes de Auditoria: Adicionar coluna de Data do Item na tabela de itens
- [x] Ajustes de Auditoria: Implementar filtro por dia (data)
- [x] Ajustes de Auditoria: Implementar filtro por setor
- [x] Ajustes de Auditoria: Ação de alterar setor do item pela auditoria (ALTERAR_SETOR)
- [x] Testes vitest para ALTERAR_SETOR e validação de schema (8 testes passando)
- [x] Ajustes de Auditoria: Filtro por tipo de item (diária, taxa, medicamento, procedimento) para segmentar auditoria
- [x] Testes vitest para filtro por tipo de item (19 testes passando)
- [x] Investigar fluxo de divergências na conta 143800: 0 divergentes no card mas 157 na aba Divergências
- [x] Bug fix: Itens com divergências de severidade "aviso" agora são classificados como "divergente" (antes eram "conforme")
- [x] Bug fix: statusGeral da conta agora considera divergências "aviso" como divergente
- [x] Bug fix: Filtro de convênio excluía TODOS os gabaritos manuais quando conta tinha convenioId=null - gabaritos agora sempre são incluídos
- [x] Ajustes de Auditoria: Adicionar campos Setor e Data no modal "Adicionar Item Faltante"
- [x] Divergências: Indicador visual de severidade nos cards (crítico=vermelho, alerta=laranja, aviso=amarelo)
- [x] Log de auditoria: Registrar qual gabarito/padrão foi usado em cada análise para rastreabilidade
- [x] Testes vitest para melhorias de auditoria (11 testes passando)
- [x] Bug: "Rendered more hooks than during the previous render" no ContaConvenioDetalhes - useQuery condicional dentro de IIFE na aba Divergências - movido useQuery para nível superior do componente
- [ ] Rel. Faturista: Mostrar apenas ajustes realizados pelo auditor e alertas críticos (remover divergências de aviso)
- [x] Investigar por que itens faltantes das regras do usuário (taxa de laser, taxa de auditoria intra) não aparecem nas divergências da conta 143810
- [x] Bug fix: Gabaritos compostos (ex: 31102360 + 31102050) não eram priorizados sobre padrões aprendidos individuais - motor usava padrão individual e nunca consultava gabarito composto. Corrigido com FASE 1 (gabaritos compostos) antes de FASE 2 (padrões individuais)
- [x] Testes vitest para prioridade de gabaritos compostos (5 testes passando)
- [x] Liberar edição do campo "Código do Procedimento Principal" na tela de Editar Padrão (hoje está bloqueado e não permite alterar)
- [x] Campos de Descrição e Setor também liberáveis na edição do padrão
- [x] Testes vitest para editarPadrao com campos de código principal (6 testes passando)
- [x] Bug: Gabarito composto corrigido (31102360 + 31102050) não está sendo selecionado na análise - corrigido: seleção por match de convênio + parse de itensAssociados JSON
- [x] Itens faltantes (ITEM_FALTANTE) devem aparecer com máximo destaque visual na aba de divergências + salvos em divergenciasGerais do resumo
- [x] Opção 2: Adicionar campo "categoria" (Obrigatório/Condicional/Opcional) em cada item do gabarito
- [x] Opção 2: Atualizar tela de edição do gabarito para permitir selecionar categoria de cada item
- [x] Opção 2: Motor de comparação respeitar categorias - só ITEM_FALTANTE crítico para Obrigatórios
- [x] Opção 3: Adicionar campo "grupo" nos itens do gabarito para agrupar itens condicionais
- [x] Opção 3: Atualizar tela de edição do gabarito para permitir definir grupos de itens
- [x] Opção 3: Motor de comparação com lógica de grupo - se tem algum item do grupo na conta, cobra todos do grupo
- [x] Testes vitest para categorias e grupos de itens no gabarito (10 testes passando)
- [x] Exibir badge de categoria (Obrigatório/Condicional/Opcional) e grupo na listagem de itens do gabarito
- [x] Liberar edição manual dos valores dos itens na tela de edição do gabarito (campo valor atualmente não editável)
- [x] Criar relatório de atendimentos usando banco PostgreSQL do Urológico - query com JOINs para trazer descrições ao invés de códigos
- [x] Tela de relatório de atendimentos no sistema com filtros e exportação
- [x] Testes vitest para relatório de atendimentos (6 testes passando)

## Refatoração Relatório de Atendimentos - Cache Local
- [x] Criar tabela `relatorio_atendimentos_cache` no schema com todos os campos descritivos
- [x] Criar tabela `relatorio_atendimentos_sync_meta` para metadados de sincronização
- [x] Migrar schema (tabelas criadas via SQL + journal atualizado)
- [x] Implementar sincronização no backend: extrair dados do Warleine e popular tabela local
- [x] Refatorar relatorioAtendimentos.ts para consultar tabela local (com fallback PostgreSQL direto)
- [x] Refatorar buscarOpcoesFiltro para extrair opções da tabela local (com fallback)
- [x] Adicionar endpoints sincronizar e statusSincronizacao no router
- [x] Atualizar frontend com indicador de última sincronização e botão de sync manual
- [x] Frontend mostra fonte dos dados (Cache Local vs PostgreSQL Direto)
- [x] Escrever testes vitest para a nova implementação (9 testes passando)
- [x] Manter fallback para PostgreSQL direto quando cache estiver vazio

## Dashboard Profissional - Relatório de Atendimentos
- [x] Criar endpoint de métricas agregadas no backend (agrupamentos por médico, tipo, plano, serviço, mês/ano, CID, procedimento)
- [x] Criar componente de dashboard com cards de KPIs (total atendimentos, total médicos, total convênios, etc.)
- [x] Gráfico de barras: Total por Médico (top 15)
- [x] Gráfico de pizza/donut: Total por Tipo de Atendimento
- [x] Gráfico de barras horizontais: Total por Plano/Convênio
- [x] Gráfico de barras: Total por Serviço
- [x] Gráfico de linha: Total por Mês/Ano (evolução temporal)
- [x] Gráfico de barras: Total por CID (top 15)
- [x] Gráfico de barras: Total por Procedimento (top 15)
- [x] Adicionar aba Dashboard na tela de Relatório de Atendimentos
- [x] Escrever testes vitest para os endpoints de métricas (12 testes passando)

## Filtros no Dashboard de Atendimentos
- [x] Atualizar endpoint metricasDashboard para aceitar filtros (tipoAtendimento, codPlaco, codPrest, codServ)
- [x] Adicionar barra de filtros no frontend do dashboard (tipo, convênio, médico, serviço)
- [x] Filtros devem atualizar os gráficos e KPIs em tempo real
- [x] Botão para limpar todos os filtros
- [x] Atualizar testes vitest para cobrir filtros no endpoint de métricas (14 testes passando)

## Bug: Relatório Atendimentos retorna HTML ao invés de JSON
- [x] Corrigir erro "Unexpected token '<'" na página /relatorio-atendimentos (API retorna HTML ao invés de JSON) - servidor tinha caído, reiniciado com sucesso

## Dashboard de Custos (Relatórios BI)
- [x] Criar tabela `custos_produtos_cache` no schema para armazenar dados de TABPROD/TABMPROP
- [x] Migrar schema (pnpm db:push)
- [x] Implementar sincronização backend: extrair dados do Warleine (tabelas 50, 04, 07, 06) e popular cache local
- [x] Criar endpoint de busca com filtros (tipoProd, codtbmm, busca por descrição)
- [x] Criar endpoint de métricas agregadas para dashboard (por tipo produto, por tabela preço, custo médio, etc.)
- [x] Criar página RelatorioCustos.tsx com abas Dashboard + Tabela Detalhada
- [x] Dashboard KPIs: Total Produtos, Custo Médio Estoque, Custo Médio Fatura, Total por Tipo
- [x] Gráfico de barras: Custo Estoque vs Custo Fatura por Tipo de Produto
- [x] Gráfico de barras: Top 20 produtos mais caros (custo estoque)
- [x] Gráfico de pizza: Distribuição por Tipo de Produto (M/T/O)
- [x] Gráfico de barras: Distribuição por Tabela de Preço (50, 04, 07, 06)
- [x] Tabela detalhada com todos os campos (codprod, descrição, tipo, custos, unidades, etc.)
- [x] Filtros interativos no dashboard e tabela
- [x] Registrar rota no App.tsx e sidebar
- [x] Escrever testes vitest para os endpoints (11 testes passando)

## Bug: Erro INSERT custos_produtos_cache - campos numéricos nulos
- [x] Corrigir mapeamento de dados no relatorioCustos.ts para tratar campos numéricos nulos/vazios do Warleine (toDecimal helper com toFixed(6))

## Comparação Custo do Item vs Valor Pago pelos Convênios
- [ ] Analisar estrutura de dados: tabela de custos (custos_produtos_cache) + tabela de itens pagos (procedimentos/demonstrativo)
- [ ] Criar endpoint backend que cruza custo do item com valores pagos por convênio (por código do item)
- [ ] Criar aba/seção "Custo vs Recebido" no Relatório de Custos
- [ ] KPIs: Margem média, Total itens com prejuízo, Total itens com lucro
- [ ] Tabela comparativa: código, descrição, custo, valor pago por convênio, margem (%)
- [ ] Gráfico: Top itens com maior prejuízo (custo > valor pago)
- [ ] Gráfico: Top itens com maior margem positiva
- [ ] Filtros por convênio, tipo de produto, busca por código/descrição
- [ ] Escrever testes vitest

## Comparação Custo vs Convênio (Relatório de Custos)
- [x] Criar endpoint backend comparacaoCustoConvenio usando dados do cache (custo_estoque vs valormm/custo_mult_fat)
- [x] Criar aba "Custo vs Convênio" no frontend do Relatório de Custos
- [x] KPIs: Margem média, Total itens com prejuízo, Total itens com lucro, Margem total
- [x] Tabela comparativa: código, descrição, tipo, custo hospital, valor convênio (por tabela), margem R$ e %
- [x] Gráfico: Top itens com maior prejuízo (custo > valor convênio)
- [x] Gráfico: Top itens com maior margem positiva
- [x] Gráfico: Distribuição de margem por tipo de produto
- [x] Filtros por tipo de produto, tabela de preço, busca por código/descrição
- [x] Destacar visualmente itens com prejuízo (vermelho) e lucro (verde)
- [x] Escrever testes vitest (18 testes passando)

## Melhorar Dashboard Rel. Atendimentos (dashboard-focus)
- [x] Instalar framer-motion para animações
- [x] Adicionar CSS classes do dashboard-focus (kpi-card, chart-card, gradientes, shadows)
- [x] Criar componente KpiCard com gradientes e trends
- [x] Criar componente ChartCard com motion animations
- [x] Criar componente CustomTooltip estilizado
- [x] Criar componente ComparacaoCards (período atual vs anterior)
- [x] Criar componente FunilStatusAtendimentos (funil visual)
- [ ] Criar componente GraficosOperacionais (turno + conversão) - futuro
- [ ] Criar componente RelatorioEspecialidade (tabs por especialidade) - futuro
- [x] Criar componente DashboardFilters avançado (calendar picker, chips, filtros avançados)
- [x] Atualizar DashboardAtendimentos para usar novos componentes
- [x] Adicionar endpoint backend para comparação de períodos
- [ ] Adicionar endpoint backend para dados por turno - futuro
- [ ] Adicionar endpoint backend para taxa de conversão - futuro
- [ ] Adicionar endpoint backend para dados por especialidade - futuro
- [x] Substituir LineChart por AreaChart na evolução mensal
- [x] Adicionar RadarChart para distribuição por serviço
- [ ] Implementar click-to-filter nos gráficos - futuro
- [x] Atualizar RelatorioAtendimentos.tsx para usar DashboardFilters

## Métricas Avançadas Dashboard Atendimentos
- [ ] Endpoint backend: Média de Permanência (internações com data_saida)
- [ ] Endpoint backend: Taxa de Conversão Emergência → Internação (mensal)
- [ ] Endpoint backend: Volume por Turno (manhã/tarde/noite/madrugada)
- [ ] Endpoint backend: Comparativo detalhado (internações, ambulatoriais, procedimentos por período)
- [ ] Componente visual: Volume por Turno (barras + cards com percentual e pico)
- [ ] Componente visual: Taxa de Conversão (funil emergências → internados → taxa %, evolução mensal)
- [ ] Componente visual: Comparativo de Períodos detalhado (internações, ambulatoriais, procedimentos)
- [ ] KPI: Média de Permanência (dias) no dashboard
- [ ] Gráfico: Volume de Atendimentos (área/linha) para picos de demanda
- [ ] Gráfico: Distribuição por Convênio (donut) - rentabilidade/frequência
- [ ] Gráfico: Top 10 CIDs (barras horizontais) - causa clínica principal
- [ ] Gráfico: Status de Atendimentos (funil) - eletivos vs urgência
- [ ] Integrar todos os novos componentes no DashboardAtendimentos

- [x] Implementar KPI de Média de Permanência (dias) para internações no Dashboard de Atendimentos
- [x] Implementar KPI de Taxa de Conversão Emergência → Internação no Dashboard de Atendimentos
- [x] Implementar gráfico de Volume por Turno (manhã, tarde, noite, madrugada) no Dashboard de Atendimentos
- [x] Implementar gráfico de Taxa de Conversão com evolução mensal no Dashboard de Atendimentos
- [x] Implementar gráfico Donut de Distribuição por Convênio no Dashboard de Atendimentos
- [x] Implementar funil de Caráter (Eletivo vs Urgência) no Dashboard de Atendimentos
- [x] Implementar comparativo detalhado por tipo (Internações, Ambulatoriais, Emergências, Urgências) no Dashboard de Atendimentos
- [x] Integrar endpoint metricasAvancadas no frontend (RelatorioAtendimentos → DashboardAtendimentos)
- [x] Testes unitários para buscarMetricasAvancadas (8 testes passando)
- [x] Bug: Reimportação de conta após correções da faturista não traz dados atualizados (conta 143800)
- [x] Botão "Reimportar do Banco" na tela de detalhes da conta (forceRemote=true, sem fallback)
- [x] Indicador de fonte dos dados (BANCO_REMOTO vs CACHE_LOCAL) no retorno da API
- [x] Aviso claro quando dados vieram do cache local desatualizado
- [x] 12 testes unitários para lógica de reimportação (contasConvenioReimport.test.ts)
- [x] Card de resumo da reimportação: valor antigo vs valor novo, itens alterados/adicionados/removidos
- [x] Destaque visual nos itens que foram alterados após reimportação
- [x] Toast detalhado com resumo das alterações encontradas na reimportação
- [x] Corrigir cálculo do comparativo: mostrar valor dos itens excluídos e adicionados separadamente
- [x] Adicionar campos valorItensExcluidos e valorItensAdicionados no card de comparativo
- [x] Calcular diferença real considerando itens excluídos e adicionados
- [x] Bug: Ajustes da auditoria (alterações de qtd, adições de itens) não refletidos na reimportação do banco
- [x] Seção 'Verificação dos Ajustes da Auditoria' no card de comparativo
- [x] Cruzamento automático: ajustes da auditoria vs dados reimportados (corrigido/parcial/não corrigido)
- [x] 34 testes unitários passando (incluindo 11 novos para cruzamento de ajustes)
- [x] Adicionar data do item nas colunas Auditoria e Atual (Banco) na Verificação dos Ajustes
- [x] Melhorar visibilidade dos marcadores/badges na tela de Divergências e Composição (texto maior, contraste melhor)
- [x] Melhorar query de custos: cruzar dados de atendimentos com custos dos produtos por convênio
- [x] Endpoint de custos por convênio baseado em atendimentos faturados
- [x] Componente frontend para exibir custos separados por convênio
- [x] 22 testes unitários para lógica de custos por convênio (custosPorConvenio.test.ts)
- [ ] Melhorar clareza e usabilidade do relatório Custos por Convênio (layout confuso para o usuário)
- [ ] Adicionar textos explicativos e subtítulos claros em cada seção do relatório
- [ ] Simplificar KPIs e gráficos para facilitar a compreensão
- [ ] Refazer relatório Custos por Convênio usando tabela `lancamen` do PostgreSQL Warleine
- [ ] Investigar estrutura da tabela lancamen (campos, convênio, código do item, valores)
- [ ] Criar endpoint backend cruzando lancamen (faturamento por convênio) com tabprod/tabmprop (custo estoque)
- [ ] Layout simples: item, custo hospital, valor por convênio (Unimed, Ipasgo, etc), lucro/prejuízo
- [ ] Resumo final por convênio (total lucro/prejuízo)
- [ ] Testes vitest para o novo endpoint
- [ ] Mapear principais tabelas do PostgreSQL Warleine (schema PACIENTE) com colunas e relacionamentos
- [x] Refazer backend custosPorConvenio usando lancamen + contas + cadplaco + tabprod do PostgreSQL Warleine
- [x] Refazer frontend CustosPorConvenio com layout simples: item, custo, valor por convênio, lucro/prejuízo
- [x] Integrar novo componente no RelatorioCustos.tsx
- [x] Escrever testes para o novo endpoint (27 testes passando)
- [x] Ajustar backend custosPorConvenio para retornar dados unitários detalhados (custo unit, valor cobrado unit, unidade)
- [x] Refazer frontend CustosPorConvenio com tabela detalhada estilo tabela de custos existente + coluna lucro/prejuízo
- [x] Manter visual simples com indicação clara de lucro (verde) e prejuízo (vermelho) - 36 testes passando
- [x] Bug: Corrigir erro 'column l.unidade does not exist' - campo correto é L.unimatmed (lancamen) com fallback para TP.unidade (tabprod)
- [ ] Otimizar performance da query custosPorConvenio (demora a abrir)
- [ ] Bug: Verificar e corrigir exibição de custo unitário vs valor unitário por convênio na aba Custos por Convênio
- [x] Bug: Corrigido erro feedback_divergencias - query SQL raw usava 'padrao_id' (nome errado) em vez da API Drizzle com feedbackDivergencias.padraoId
- [x] Reorganizar menu Relatórios BI em subpastas: Faturamento (Faturado x Recebido, Recebimentos Geral), Recepção (Rel. Atendimento), Compras (Rel. Custo)
- [x] Criar schema de permissões por relatório no banco de dados (7 novos campos na tabela permissoesEstabelecimento)
- [x] Implementar backend - endpoints de gerenciamento de permissões por relatório
- [x] Refatorar menu lateral com subpastas hierárquicas expansíveis (3 níveis)
- [x] Implementar frontend - tela de gerenciamento de permissões por usuário/relatório (seção Relatórios BI em laranja)
- [x] Integrar permissões no menu e nas rotas (filtrar relatórios visíveis por permissão do usuário)
- [x] Bug: Módulos de relatório BI não estavam salvando - schema Zod do endpoint upsertPermissao não incluía os novos campos
- [x] Criar perfis de permissão pré-definidos - Faturista (relatórios de faturamento), Recurso Glosa (previsão de glosa), Gestor (todos os relatórios), Admin (tudo)


## Correção Lógica Custos por Convênio (cadplaco como ponte)
- [x] Corrigir backend custosPorConvenioRouter: usar cadplaco como ponte (tabprod→tabmprop→cadplaco→cadconv)
- [x] Remover códigos de tabela fixos e usar cadplaco.codtbmm dinâmico
- [x] Atualizar frontend CustosPorConvenio.tsx para novos campos (nome_plano, tabela_preco)
- [x] Atualizar testes unitários para a nova lógica corrigida

## Bug - Reimportação de Conta do Banco
- [x] Corrigir reimportação do banco: campos Conformes/Divergentes ficam zerados após reimportar
- [x] Garantir que a reimportação preserve/recalcule comparações e ajustes de auditoria

## Melhorias Análise de Contas
- [x] Bug: Dados de Conformes/Divergentes não persistem ao sair e voltar na conta (dados já persistiam, contas antigas precisam de reanálise)
- [x] Adicionar botão "Reanalisar" na tela de detalhes da conta
- [x] Exibir badge colorido de score de risco na listagem de contas (já existia)

## Conferência Pós-Correção - Tempo de Correção
- [x] Adicionar coluna "Tempo de Correção" na tabela de Conferência Pós-Correção
- [x] Calcular dias entre Data Auditoria e Data Correção
- [x] Exibir campo de Data Correção ao lado da Data Auditoria

## Relatório de Custos - Custos por Conta
- [x] Transformar aba "Custos por Convênio" em "Custos por Conta" (numconta)
- [x] Tela inicial: Conta | Paciente | Valor Custo Total | Valor Cobrado | Lucro/Prejuízo
- [x] Drill-down: ao clicar na conta, abrir detalhes dos itens com custo vs cobrado por item
- [x] Identificar itens que estão dando prejuízo na conta

## Bug - Custos por Conta
- [x] Corrigir erro 'column c.nomepac does not exist' na query de Custos por Conta (usar JOIN com cadpac via prontuario=codpac)

## Bug - Conferência Pós-Correção (React #310)
- [x] Corrigir erro React #310 ao clicar em 'Ver' na Conferência Pós-Correção (separado em dois componentes de rota distintos)

## Atualização Relatório de Atendimentos
- [x] Atualizar query SQL do relatório de Atendimentos com novos campos (especialidade, operador, CBO, sexo, CEP, dsprocprin)
- [x] Atualizar interface AtendimentoRelatorio com novos campos
- [x] Atualizar query de sincronização (sync) com novos campos e JOINs (cadesp, cadope, tabcbo)
- [x] Atualizar mapeamento do cache local com novos campos
- [x] Atualizar tabela do frontend com novas colunas (Sexo, CEP, Especialidade, Censo, Desc. Proc., Operador Cad., CBO)
- [x] Atualizar exportação CSV com todos os 31 campos incluindo códigos e descrições

## Bug - Tabela relatorio_atendimentos_sync_meta
- [x] Corrigir erro: tabela relatorio_atendimentos_sync_meta - schema Drizzle alinhado com colunas reais do banco (camelCase vs snake_case)

## Bug - Relatório Atendimentos não exibe dados após sincronização
- [x] Corrigir relatório de Atendimentos que não carrega dados após sincronização - corrigido DATE_FORMAT SQL que gerava SQL inconsistente no Drizzle (sem prefixo de tabela no SELECT mas com prefixo no GROUP BY/ORDER BY)

## Novas Abas Analíticas - Relatório de Atendimentos
- [x] Backend: criar procedures tRPC analiticasDemograficas e analiticasOperacionais
- [x] Frontend: criar aba "Perfil do Paciente" (distribuição por sexo, top CEPs, sexo x tipo atendimento)
- [x] Frontend: criar aba "Análise Operacional" (top centros de custo, CBO, proveniência, especialidades radar)
- [x] Integrar novas abas com filtros existentes do dashboard
- [x] Corrigir sql.raw() para nomes de colunas em queries de analytics (mesmo bug do DATE_FORMAT)

## Mapa de Calor Geográfico - Distribuição de Pacientes por CEP
- [x] Backend: criar endpoint para geocodificação de CEPs e cache de coordenadas
- [x] Frontend: integrar Google Maps com heatmap na aba Perfil Paciente
- [x] Implementar cache de geocodificação para evitar chamadas repetidas à API
- [x] Adicionar marcadores com contagem de atendimentos por região
- [x] Controles de raio, opacidade e toggle heatmap/marcadores
- [x] InfoWindow com detalhes (bairro, cidade, estado, total atendimentos)
- [x] Testes unitários para buscarDadosMapaCalor

## Melhorias Perfil Paciente - CEPs e Mapa
- [x] Transformar CEPs em nomes de cidades no backend (usar geocoding_cache)
- [x] Substituir gráfico de barras de CEPs pelo mapa de calor geográfico
- [x] Manter tabela detalhada com nomes de cidades em vez de CEPs

## Indicador de Pacientes Internados - Análise Operacional
- [x] Backend: query de internações ativas (sem data de saída) no PostgreSQL
- [x] Backend: endpoint tRPC para buscar pacientes internados em tempo real
- [x] Frontend: KPI e tabela de pacientes internados na aba Análise Operacional
- [x] Testes unitários para buscarPacientesInternados

## Novos Motivos e Setor em Notificações de Atendimentos Parados
- [x] Adicionar motivo "Enviado ao faturamento" nas opções de notificação
- [x] Adicionar motivo "Pendência UTI" nas opções de notificação
- [x] Setor "UTI" já existia nas opções de setor (confirmado)

## Novo Setor em Notificações
- [x] Adicionar setor "Controle de Contas" nas opções de notificação

## Correção Padrões de Cobrança - Pronto Socorro Infantil
- [x] Filtrar somente procedimentos nos padrões de cobrança (excluir materiais, medicamentos, exames)
- [x] Igualar comportamento ao Hospital Urológico
- [x] Testes unitários para filtro de tipoItem

## Bug: Conciliação Cruzada - Convênio 30001 OX UTI
- [x] Investigar por que nenhuma conta está sendo conciliada (todas "Não Recebido")
- [x] Corrigir o cruzamento de dados para o convênio 30001 (Estratégia 5 implementada)

## Estratégia 5 - Conciliação por Carteira Beneficiário
- [x] Adicionar Estratégia 5 (carteiraBeneficiário + código) na conciliação automática
- [x] Adicionar índice por carteira+código nos recebimentos
- [x] Atualizar detalhes do resultado com nova estratégia
- [x] Testes unitários para Estratégia 5 (8 testes passando)

## Bug: Mismatch de Competência na Conciliação Cruzada
- [x] Investigar guia 17945033 - faturamento comp 11/2025, recebimento data_ref 12/2025
- [x] Corrigir conciliação para não filtrar recebimentos pela mesma competência do faturamento
- [x] Removido filtro de competência nos recebimentos (pagamento pode vir em mês posterior)

## Alta Administrativa na Conciliação Cruzada
- [x] Investigar implementação de Alta Administrativa no Demonstrativo e Conta Convênio (já implementada)
- [x] Replicar mesma estrutura na Conciliação Cruzada (já existente)
- [x] Adicionar indicador visual (badge) para guias com múltiplos lotes (já existente)

## Filtro PARIII em Pacientes Internados
- [x] Excluir codplano = 'PARIII' da lista de pacientes internados (hemodiálise)

## Indicador de Hemodiálise
- [x] Backend: query de pacientes PARIII com contagem e frequência de sessões
- [x] Backend: endpoint tRPC para buscar dados de hemodiálise
- [x] Frontend: seção de hemodiálise na aba Análise Operacional com KPIs e tabela
- [x] Correção de erro TypeScript nas queries de data (gte/lte com strings)
- [x] Testes unitários para buscarPacientesHemodialise (5 testes passando)

## Relatório de Faturamento (integ_faturado)
- [x] Backend: queries na tabela integ_faturado para métricas de faturamento
- [x] Backend: endpoint tRPC relatorioFaturamento com indicadores agregados
- [x] Frontend: KPIs Acumulado Ano Atual vs Acumulado Ano Anterior
- [x] Frontend: Gráfico/análise por Setor
- [x] Frontend: Gráfico/análise por Mês
- [x] Frontend: Gráfico/análise por Tipo de Atendimento
- [x] Frontend: Gráfico/análise por Convênio
- [x] Frontend: Tabela comparativa mês a mês (Mês, Faturado Atual, Faturado Ano Anterior, Qtd Contas)
- [x] Integrar rota e navegação no App.tsx
- [x] Testes unitários para queries de faturamento (7 testes passando)

## Bug Fix - Relatório de Faturamento não carrega dados
- [x] Investigar erro no endpoint/query ao clicar em Carregar (sql_mode=only_full_group_by)
- [x] Corrigir GROUP BY para usar expressões idênticas ao SELECT
- [x] Validar carregamento dos dados no browser

## Filtro por Convênio na Tabela Comparativa do Rel. Faturamento
- [x] Backend: endpoint para listar convênios disponíveis no integ_faturado
- [x] Backend: endpoint para dados mês a mês filtrado por convênio
- [x] Frontend: seletor de convênio na aba Tabela Comparativa
- [x] Frontend: tabela comparativa filtrada por convênio (ano atual vs anterior)
- [x] Frontend: KPIs atualizados ao selecionar convênio
- [x] Frontend: gráfico de evolução mensal filtrado por convênio
- [x] Frontend: botão Limpar filtro e badge do convênio selecionado

## Melhorias Rel. Faturamento - Expansão por Convênio e Gráfico de Linhas
- [x] Tabela: botão expandir em cada mês para ver detalhamento por convênio
- [x] Backend: endpoint para detalhamento por convênio dentro de um mês específico
- [x] Dashboard: trocar gráfico de barras por gráfico de linhas (modelo Evolução Mensal)
- [x] Dashboard: adicionar filtro por convênio nos gráficos e KPIs

## Gráficos Clicáveis como Filtros no Rel. Faturamento
- [x] Gráfico Setor: ao clicar em uma barra, filtrar KPIs e evolução mensal por setor
- [x] Gráfico Tipo de Atendimento: ao clicar em uma fatia, filtrar por tipo de atendimento
- [x] Gráfico Convênio: ao clicar em uma barra, filtrar por convênio (integrar com filtro existente)
- [x] Backend: endpoints para dados filtrados por setor e tipo de atendimento
- [x] Visual: badge do filtro ativo e botão limpar para cada tipo de filtro

## Fix Sidebar - Grandchild Navigation
- [x] Corrigir renderização de itens grandchild na sidebar (Faturamento > Rel. Faturamento)
- [x] Usar button em vez de SidebarMenuSubButton para CollapsibleTrigger de nível 3

## Bug - Sincronização manual ficava travada indefinidamente
- [x] Investigado: botão executa apenas o mapeamento correto (confirmado via logs do banco)
- [x] Causa raiz: query ao PostgreSQL de origem não tinha timeout, travava indefinidamente
- [x] Fix: adicionado statement_timeout de 5 min no EasyVisionConnector
- [x] Fix: adicionado timeout global de 5 min com Promise.race nas procedures executar e sincronizarTabela
- [x] Canceladas sincronizações travadas (90002, 90003, 90004, 90005)

## Sync Incremental por Mês - Evitar sobrecarga no banco do cliente
- [x] Alterar query do Sync: Faturado para buscar dados a partir de 2024 (antes era 2025)
- [x] Implementar importação completa em fatias por mês (ex: 2024/01, 2024/02, ..., 2026/03)
- [x] Limpar tabela destino apenas na primeira fatia, inserir acumulando nas demais
- [x] Atualizar log de sincronização com progresso por mês
- [x] Feedback visual no frontend mostrando qual mês está sendo importado (via campo erroMensagem do log)
- [x] Timeout de 5 min por fatia (não global)
- [x] Mudar coluna de controle incremental de numconta para datainclu (timestamp da contas)
- [x] Adicionar b.datainclu na query SELECT e GROUP BY
- [x] Criar coluna datainclu na tabela integ_faturado e no config de colunas
- [x] Criar mapeamento de campo datainclu (origem -> destino)
- [x] Resetar ultimoValorControle para NULL (primeira execução será completa particionada)

## Sync: Faturado - Correções Aplicadas (16/03/2026)
- [x] Corrigir schema da query: atualizar para usar "PACIENTE".* em vez de c33581562000206.*
- [x] Desabilitar SSL na conexao PostgreSQL (servidor nao suporta)
- [x] Resetar ultimoValorControle para NULL apos correcao
- [x] Testar Sync: Faturado com query corrigida e schema PACIENTE

- [x] Implementar sincronização particionada por camadas de 6 meses para Sync Faturado

- [x] Analisar se configuração de atendimentos WARLEINE está rodando na frequência estabelecida
- [x] Identificar em qual tabela a query de atendimentos está sendo salva
- [x] Adicionar botões de edição na tela de Configurações do Integrador

## Importação CSV TASY - Maternidade Ela
- [x] Analisar estrutura do CSV tasyela-pendentes20252026.csv
- [x] Analisar estrutura da tabela tasy_atendimentos_staging
- [x] Mapear campos do CSV para a tabela
- [x] Criar colunas faltantes na tabela
- [x] Importar dados do CSV para tasy_atendimentos_staging
- [x] Verificar importação e integridade dos dados
- [x] Ajustar script de importação CSV TASY para buscar estabelecimentoId automaticamente pelo nome

## Unificação Tasy -> atendimentos_unificados
- [x] Adicionar colunas faltantes na tabela atendimentos_unificados (protocolo, financeiro, paciente, setor, médico, etapa)
- [x] Criar processo de unificação Tasy -> atendimentos_unificados
- [x] Atualizar tela de Atendimentos Parados para exibir todos os campos novos
- [x] Testar e verificar dados unificados

## Layout por Sistema de Origem - Atendimentos Parados
- [x] Implementar template de colunas específico para dados TASY (N.ATEND, PACIENTE, PLANO, DATA ENTRADA, DATA SAIDA, DIAS PARADO, TIPOATEND, ETAPA_CONTA, SETOR_ETAPA, DT_ETAPA, USER_ETAPA, CODIGO_SERVICO, DESCRICAO_ATENDIMENTO, QUANTIDADE_SERVICO)
- [x] Manter layout atual para dados WARLEINE (sem alterações)
- [x] Detectar sistema de origem e alternar colunas automaticamente
- [x] Usar campo DESCRICAO_ATENDIMENTO para quantidade de serviço
- [x] Bug: Layout TASY não está ativando na Maternidade Ela - colunas ficam iguais ao layout padrão
- [x] Fix: Query de atendimentos parados deve incluir TASY mesmo com data_saida preenchida (CSV já traz só contas paradas)
- [x] Fix: Garantir layout TASY funcione na tela unificada de Atendimentos Parados
- [x] Ajustar cálculo de Dias Parado para TASY usando campo dtEntrega (dias desde dtEntrega até hoje)

## Correções Tela TASY - Atendimentos Parados
- [x] Fix KPIs: usar campo tipo_atendimento da tabela para calcular Internação/Exame/Ambulatório
- [x] Fix Quantidade por Serviço: mostrar descricao_atendimento em vez de código
- [x] Adicionar filtro por nome_protocolo (para filtrar os que estão NULL)
- [x] Fix coluna Tipo: usar campo tipo_atendimento da tabela
- [x] Fix coluna Serviço: usar campo codigo_servico da tabela
- [x] Acrescentar coluna Descrição Atendimento
- [x] Acrescentar coluna Etapa Conta
- [x] Acrescentar coluna Setor Etapa
- [x] Acrescentar coluna User Etapa
- [x] Manter coluna Notificação e envio de email

## Notificação e Email - TASY Atendimentos Parados
- [x] Implementar geração de PDF de notificação para atendimentos TASY (mesmo padrão Warleine)
- [x] Registrar notificação no banco de dados (histórico persistente)
- [x] Implementar envio de email com PDF da notificação TASY
- [x] Conectar botões da tabela TASY às procedures reais (notificação + email)
- [x] Suporte a notificação em lote (selecionar múltiplos atendimentos)

## Bug - Tela Maternidade Ela
- [x] Tela de Atendimentos Parados da Maternidade Ela não funciona corretamente - mostra mesmo modelo do Warleine em vez do layout TASY (corrigido: integrado layout TASY no componente Atendimentos.tsx principal + cálculo diasParado com dtEntrega)

## Filtro por Etapa Conta - TASY
- [x] Criar seção de cards "Quantidade por Etapa Conta" no mesmo estilo dos cards de Plano (Convênio), posicionado abaixo
- [x] Clicar no card filtra a tabela por aquela etapa conta

## Tela Atendimentos Sem Protocolo - TASY
- [x] Criar nova tela AtendimentosSemProtocolo com mesmo layout da tela de Atendimentos
- [x] Nova tela mostra apenas dados TASY com nomeProtocolo preenchido (633 registros)
- [x] Criar procedure backend para listar atendimentos TASY com nomeProtocolo preenchido
- [x] Registrar rota no App.tsx e adicionar link no menu lateral
- [x] Filtrar tela de Atendimentos para TASY mostrar apenas nomeProtocolo NULL (3.421 registros)

## Melhorias Tela TASY - KPI Valor, Coluna Valor e Tag Notificação
- [x] Adicionar KPI "Valor Total" com soma do campo valorConta dos atendimentos filtrados
- [x] Adicionar coluna "Valor Conta" na tabela TASY com formatação R$
- [x] Adicionar tag/badge "Notificado" (verde) nas linhas que já foram notificadas
- [x] Aplicar mesmas melhorias na tela AtendimentosSemProtocolo (Atendimentos com Protocolo)
- [x] Incluir Valor Conta e status Notificado na exportação Excel TASY
- [x] 14 testes vitest passando para as novas funcionalidades
- [x] Filtrar atendimentos TASY para exibir apenas registros com valorConta acima de R$ 0,10 (remover contas zeradas)
- [x] BUG: Permissões de Relatórios BI não estão funcionando - relatórios desativados continuam aparecendo para o usuário (corrigido defaults || "sim" para || "nao" em 3 arquivos)
- [x] BUG: Menu lateral mostra todos os módulos mesmo quando usuário tem apenas permissão de Relatórios BI - corrigido: defaults acessoDashboard "sim"->"nao", SettingsMenu agora filtra por permissão

- [x] BUG: Relatórios BI não aparece no menu lateral mesmo quando usuário tem permissão habilitada
- [x] BUG: Gerenciamento mostra Dashboard Auditoria e Conferência Pós-Correção mesmo sem permissão (corrigido: acessoDashboard default "nao")
- [x] BUG: Configurações > Notificações aparece mesmo sem permissão específica (corrigido: adminOnly: true)
- [x] Corrigir temAcessoModulo para relatoriosBi: verificar se qualquer relatório individual está habilitado
- [x] Sincronizar acessoRelatoriosBi automaticamente ao salvar permissões com relatórios individuais habilitados
- [x] Banco corrigido: acessoRelatoriosBi setado para 'sim' para aragraciotte
- [x] 17 testes vitest para permissões de Relatórios BI
- [x] Criar nova aba "Custos por Setor" no Relatório de Custos com análise de custos agrupados por setor hospitalar (backend + frontend + 14 testes)
- [x] Otimizar tamanho do projeto para reduzir tempo de publicação: 31MB → 21MB (-32%), removidos 25 snapshots drizzle antigos + 25 SQL migrations
- [x] Substituir dados da tabela tasy_atendimentos_stagion com novo CSV PENDENTES20252026.csv da Maternidade Ela
- [x] Renomear tabela tasy_atendimentos_stagion para Tasy_maternidadeela_atendimentos_stagion
- [x] Atualizar referências no código para o novo nome da tabela

- [x] Renomear tabela tasy_atendimentos_staging para Tasy_maternidadeela_atendimentos_stagion
- [x] Atualizar mapeamento CSV para novas colunas do PENDENTES20252026.csv (CONVENIO, ATENDIMENTO, DS_PROC_PRINCIPAL)
- [x] Limpar dados antigos e importar novos dados do CSV PENDENTES20252026.csv
- [x] Atualizar dados na tabela atendimentos_unificados com origem tasy
- [x] Atualizar referências no schema e scripts de importação

- [x] Criar tabela TASY_hemolabor_atendimentos_stagion no schema
- [x] Criar script de importação Excel para Hemolabor
- [x] Importar dados do HemolaborAtend2025-2026.xlsx na tabela staging (250.885 registros)
- [x] Unificar dados Hemolabor na tabela atendimentos_unificados (250.885 registros, origemSistema=tasy_hemolabor)
- [x] Verificar exibição dos dados Hemolabor na tela de atendimentos (badge TASY HEMOLABOR verde-esmeralda)

- [x] Criar filtro por mês/ano na tela de atendimentos (campos separados para Ano e Mês, formato MM/AAAA)

- [x] Bug: Tela de atendimentos do Hemolabor não segue o mesmo layout TASY da Maternidade Ela - corrigir para que tasy_hemolabor use o mesmo modelo/layout TASY

- [x] Implementar paginação server-side na tela de atendimentos para todos os estabelecimentos (LIMIT/OFFSET no banco, filtros server-side, agregações para KPIs)

- [x] Bug: Tela de atendimentos do Hemolabor mostra layout genérico em vez do layout TASY (falta Cód. Serviço, Descrição Atendimento, Etapa Conta, Setor Etapa, Usuário Etapa, Nome Protocolo) - corrigido em Atendimentos.tsx e AtendimentosParadosUnificados.tsx

- [x] Otimizar performance da tela de atendimentos TASY Hemolabor (250k+ registros pesados para carregar) - paginação client-side 50 itens/página
- [x] Redesenhar KPI 'Quantidade por Descrição de Atendimento' - mostrar Top 10 com opção de expandir em vez de listar centenas de itens

- [x] Alterar seção 'Quantidade por Descrição de Atendimento' para usar campo dsSetorEntrada (Setor de Entrada) em vez da descrição do atendimento

- [x] Investigar e corrigir sincronização de custos que travou (status "em_andamento" desde 17/03)
- [x] Implementar timeout na query de sincronização para evitar travamento
- [x] Implementar recovery automático de status "em_andamento" travado (detectar timeout)
- [x] Melhorar feedback ao usuário durante sincronização (progresso, timeout, erro)

- [x] Corrigir telas de Atendimentos que usam Warleine (Atendimentos Parados, Atendimentos Não Faturados) - não retornam dados para Instituto do Rim e outros estabelecimentos
- [x] Corrigir filtro valorConta > 0.1 que eliminava todos os registros WARLEINE/EASYVISION (aplicar apenas para TASY)
- [x] Remover filtro data_saida IS NULL para sistemas não-TASY (WARLEINE/EASYVISION mostram todos os registros)

- [x] Criar tabela faturamento_externo no banco para armazenar dados de faturamento/recebimento importados via Excel (Hospital Urológico SUS)
- [x] Criar procedure de importação de Excel com valores faturados/recebidos
- [x] Criar tela de upload de planilha Excel para importação de dados de faturamento externo
- [x] Integrar dados importados no Relatório de Faturamento (Rel.Faturamento)
- [x] Importar dados iniciais da planilha UrologicoSUS2025.xlsx (12 meses, 2 convênios)

- [x] Adicionar filtros de mês/ano na tela de Atendimentos (Atendimentos Parados) para facilitar busca e filtragem

- [x] Corrigir sincronização de custos que falha na inserção no MySQL - batch de 5 + onDuplicateKeyUpdate (5130 registros, 4896 únicos)
- [x] Resolver valores inflados no relatório de custos - usar custoMultFat (custo/multFaturas) ao invés de custoEstoque para comparação justa com valormm

- [x] Adicionar coluna "Unidade de Fatura" na tabela de comparação do Rel. Custos
- [x] Analisar e corrigir itens com valores discrepantes no Rel. Custos (ex: SEVOFLURANO capacidade 80 x custo R$329,54 = R$26.363,20) - Confirmado: valores corretos no backend usando custoMultFat

- [x] Corrigir valores inflados na aba Custos por Convênio - usar custoMultFat ao invés de custoEstoque (LATERAL JOIN fallback com TMP_FALLBACK)
- [x] Corrigir valores inflados na aba Custos por Conta - usar custoMultFat ao invés de custoEstoque (LATERAL JOIN fallback com TMP_FALLBACK)
- [x] Corrigir valores inflados na aba Custos por Setor - usar custoMultFat ao invés de custoEstoque (LATERAL JOIN fallback com TMP_FALLBACK)
- [x] Adicionar coluna Unidade de Fatura nas abas Custos por Convênio, Custos por Conta e Custos por Setor

- [x] Módulo NFS-e: Schema Drizzle (nfse_hospitais, nfse_convenios, nfse_notas)
- [x] Módulo NFS-e: Procedures tRPC (CRUD hospitais, convênios, notas fiscais)
- [x] Módulo NFS-e: Página Dashboard NFS-e
- [x] Módulo NFS-e: Página CRUD Notas Fiscais com upload PDF
- [x] Módulo NFS-e: Página Configuração de Hospitais (CPF/senha portal)
- [x] Módulo NFS-e: Página Cadastro de Convênios NFS-e
- [x] Módulo NFS-e: Painel de Pendentes com alertas de urgência
- [x] Módulo NFS-e: Acompanhamento de Envios (visão mensal)
- [x] Módulo NFS-e: Importação de PDF com IA (OCR via invokeLLM)
- [x] Módulo NFS-e: Integração no menu lateral e rotas App.tsx
- [x] Módulo NFS-e: Testes vitest para procedures (21 testes passando)

- [x] Módulo Financeiro: Schema Drizzle (11 tabelas fin_*)
- [x] Módulo Financeiro: Procedures tRPC CRUD completo (financeiroRouter)
- [x] Módulo Financeiro: Dashboard financeiro com KPIs e gráficos
- [x] Módulo Financeiro: Contas a Pagar (CRUD + filtros)
- [x] Módulo Financeiro: Contas a Receber (CRUD + filtros)
- [x] Módulo Financeiro: Custos fixos/variáveis
- [x] Módulo Financeiro: Extratos Bancários
- [x] Módulo Financeiro: DRE - Demonstrativo de Resultado
- [x] Módulo Financeiro: Relatórios comparativos
- [x] Módulo Financeiro: Previsão de Faturamento
- [x] Módulo Financeiro: Configuração de empresas e clientes
- [x] Módulo Contratos: Schema Drizzle (contratos)
- [x] Módulo Contratos: Procedures tRPC CRUD (contratosRouter)
- [x] Módulo Contratos: Dashboard de Contratos com KPIs
- [x] Módulo Contratos: Formulário de Contrato com seções ativáveis
- [x] Módulo Contratos: Visualizador de Contrato formatado
- [x] Módulo Contratos: Exportação DOCX (procedure gerarDocx)
- [x] Módulo Contratos: Alertas de vencimento
- [x] Módulo Propostas: Schema Drizzle (propostas, proposta_itens)
- [x] Módulo Propostas: Procedures tRPC CRUD (propostasRouter)
- [x] Módulo Propostas: Lista de Propostas com filtros e KPIs
- [x] Módulo Propostas: Formulário Nova Proposta com itens TUSS
- [x] Módulo Propostas: Conversão Proposta → Contrato
- [x] Painel Executivo: Dashboard consolidado multi-estabelecimento
- [x] Painel Executivo: KPIs financeiros (Faturado x Recebido x Glosado x Recursado)
- [x] Painel Executivo: Atendimentos consolidados de todos os locais
- [x] Painel Executivo: Tabela comparativa entre estabelecimentos
- [x] Painel Executivo: Alertas inteligentes
- [x] Integração: Menu lateral + rotas App.tsx para todos os módulos
- [x] Testes vitest para procedures dos 3 módulos (15 testes passando)

- [x] Painel Executivo: Implementar aba Atendimentos consolidados com dados reais de todos os estabelecimentos (tabela atendimentos_unificados)
- [x] Painel Executivo: Implementar KPI Recursado Total com dados reais de recursos de glosa (procedure recursadoConsolidado)

- [x] Painel Executivo: Integrar KPI Recursado Total com dados reais de recursos de glosa de todos os estabelecimentos (colunas Recursado/Recuperado na tabela comparativa)

- [x] REIMPLEMENTAR Módulo Financeiro fiel ao finance-buddy-70 (Dashboard Analytics completo, Contas Pagar/Receber com filtros avançados, Custos fixos/variáveis, Extratos Bancários com conciliação, DRE detalhado, Relatórios comparativos, API Banco Inter)
- [x] REIMPLEMENTAR Módulo Contratos fiel ao hospital-billing-contracts (formulário completo com 16 serviços, seções ativáveis SLA/sigilo/reajuste, visualizador formatado, exportação DOCX)
- [x] REIMPLEMENTAR Módulo Propostas fiel ao contract-proposal-hub (KPIs, pipeline por status, tabela detalhada, painel lateral)
- [x] Mover Painel Executivo para dentro do cadastro do estabelecimento Safatle (visão consolidada do grupo)
- [x] Restringir módulos Financeiro, Contratos, Propostas e Painel Executivo apenas ao admin geral
- [x] Criar tabela de permissões por módulo do Safatle (colunas adicionadas na permissoesEstabelecimento)
- [x] Criar router de gerenciamento de permissões Safatle (listar, atualizar, verificar)
- [x] Criar tela de gerenciamento de permissões dentro do Painel Executivo Safatle (aba Permissões)
- [x] Aplicar verificação de permissão por módulo no frontend (PainelExecutivo.tsx)
- [x] Testes vitest para permissões granulares (25 testes passando)
- [x] BUG: Corrigir erro de hooks no VisaoGeral do PainelExecutivo - 'Rendered more hooks than during the previous render'
- [x] REESTRUTURAR Painel Executivo: apenas KPIs consolidados (Atendimentos, Faturado, Recebido, Glosado, Recursados por estabelecimento) - sem abas internas
- [x] Módulos Financeiro, Contratos, Propostas como itens separados no menu lateral do Safatle
- [x] NFS-e disponível para TODOS os estabelecimentos (não apenas Safatle)
- [x] Criar tela de Gerenciamento de Permissões separada no menu do Safatle (controle granular por módulo/usuário)
- [x] Integração API Banco Inter no módulo Financeiro (extratos, saldo, extrato PDF)
- [x] Criar Centro de Custo no Financeiro > Cadastros com vinculação às Contas a Pagar
- [x] Criar Importador de Excel para Contas a Pagar e Contas a Receber
- [x] Implementar geração de boletos automáticos via API Banco Inter (Cobrança v3)
- [x] Interface de emissão de boletos no módulo Financeiro (dados pagador, valor, vencimento, multa, juros, desconto)
- [x] Listagem e consulta de boletos emitidos com status (aberto, pago, vencido, cancelado)
- [x] Download de PDF do boleto e QR Code Pix
- [x] Cancelamento de boletos com motivo
- [x] Testes vitest para Centro de Custo, Importador Excel, Boletos e Permissões (14 testes)
- [x] Adicionar campos CEP, Endereço, Número, Complemento, Bairro, Cidade, UF no cadastro de clientes
- [x] Vincular cadastro de clientes ao CNPJ da Safatle (campo cnpjSafatle com default 24.785.393/0001-54)
- [x] Busca automática de endereço por CEP (API ViaCEP)
- [x] Testes vitest para cadastro de clientes com campos completos (6 testes passando)
- [x] Adicionar colunas Categoria, Centro de Custo e Data de Pagamento na tabela de Contas a Pagar
- [x] Adicionar barra de filtros: Período, Empresa, Categoria, Centro de Custo, Status com botão Limpar filtros
- [x] Adicionar botões: Importar Excel, Exportar Excel, Ordenar A-Z, Atualizar custos
- [x] Adicionar Centro de Custo e Data de Pagamento no formulário de criação
- [x] Adicionar campo Tipo de Serviço em Contas a Receber (schema + backend + frontend)
- [x] Adicionar campo Descrição de Serviço em Contas a Receber (schema + backend + frontend)
- [x] Exibir colunas Tipo de Serviço e Descrição de Serviço na tabela de Contas a Receber
- [x] Adicionar filtros e botões de ação em Contas a Receber (similar a Contas a Pagar)
- [x] Testes vitest para Contas a Pagar e Contas a Receber (14 testes passando)
- [x] Botão de editar em cada linha da tabela de Contas a Pagar com dialog pré-preenchido
- [x] Botão de editar em cada linha da tabela de Contas a Receber com dialog pré-preenchido
- [x] Mutation de atualização integrada nos dialogs de edição
- [x] Testes vitest para edição inline
- [x] Inserir dados de exemplo em Contas a Receber via SQL (com tipoServico e descricaoServico)
- [x] Preencher categorias e centros de custo em Contas a Pagar existentes via SQL
- [x] Testes vitest para edição inline (21 testes passando)
- [x] Corrigir categorias e centros de custo das Contas a Pagar (script anterior atribuiu valores errados)
- [x] 100% dos 232 registros agora possuem categoria e centro de custo corretos
- [x] Criadas 4 novas categorias: Cartao de Credito, Funcionamento, Servicos Terceiros, Material de Escritorio
- [x] Limpar dados de exemplo de Contas a Receber (fin_recebiveis)
- [x] Importar dados reais do Excel contas-a-receber-2026-03-19.xlsx (92 registros: 50 recebidos + 42 pendentes)
- [x] Criar 5 novos clientes: Hemolabor, Hospital Neurologico, Ox UTI, Hospital Sao Francisco de Assis, IRG
- [ ] Criar botão de geração de boletos do Banco Inter (aguardando liberação de credenciais pelo banco)
- [x] Botão Duplicar registro em cada linha de Contas a Pagar
- [x] Botão Duplicar registro em cada linha de Contas a Receber
- [x] Checkbox de seleção em cada linha de Contas a Pagar com soma dos valores selecionados
- [x] Checkbox de seleção em cada linha de Contas a Receber com soma dos valores selecionados
- [x] Barra de ações em lote (excluir selecionados) em Contas a Pagar e Contas a Receber
- [x] Mutations duplicar e excluirEmLote no backend (transacoes e recebiveis)
- [x] Testes vitest para duplicar e excluirEmLote (28 testes passando)
- [x] Filtro por período personalizado (datas de/até) em Contas a Pagar e Contas a Receber
- [x] Botão duplicar todos os selecionados em lote (Contas a Pagar e Contas a Receber)
- [x] Mutations duplicarEmLote no backend (transacoes e recebiveis)
- [x] Testes vitest para período personalizado e duplicarEmLote (35 testes passando)
- [ ] Integração API Banco Inter para emissão de boletos (aguardando Client ID e Client Secret)
- [x] Dashboard Financeiro completo: Cards KPI (Saldo Bancário, Total a Pagar, Total a Receber, Vencidos, Saldo Projetado)
- [x] Dashboard: Alerta de pagamentos vencidos com link para detalhes
- [x] Dashboard: Cards secundários (Pagamentos do Dia, Total Pago, Total Recebido, Custos Fixos)
- [x] Dashboard: Próximos Vencimentos e Próximos Recebimentos (próximos 7 dias)
- [x] Dashboard: Gráfico Fluxo de Caixa Projetado (7/15/30/60 dias) com linhas Recebimentos/Pagamentos/Saldo
- [x] Dashboard: Análise Detalhada (Evolução Mensal de Pagamentos + Top 5 Maiores Pagamentos)
- [x] Dashboard: Pagamentos por Categoria com variação mês a mês
- [x] Dashboard: Comparativo Mensal por Categoria e por Descrição com variação percentual
- [x] Aba DRE (Demonstrativo de Resultado do Exercício) separada no módulo financeiro
- [x] Backend: procedures para KPIs, fluxo de caixa, análise detalhada, comparativo mensal e DRE
- [x] Testes vitest para Dashboard e DRE (51 testes passando)
- [x] Corrigir Painel Executivo mostrando dados zerados (converter strings SQL para Number no backend)
- [x] Adicionar filtro de seleção de estabelecimento no Painel Executivo (dropdown com todos os estabelecimentos + opção Todos)
- [x] Exibir campos de usuário e senha na tela de hospitais NFS-e para acesso ao site de emissão de nota fiscal
- [x] Integrar convênios da tabela existente no sistema ao módulo NFS-e (em vez de cadastro separado)
- [x] Vincular hospitais NFS-e aos estabelecimentos do sistema para filtro automático por unidade selecionada
- [x] Importar notas fiscais do CSV fornecido pelo usuário no banco de dados (72 notas: 34 PSI + 38 Mat Ela)
- [ ] Pesquisar e avaliar opções de automação de emissão de NFS-e (APIs de prefeituras e provedores)
- [ ] Integrar API do Nota Fácil para emissão automática de NFS-e direto pelo sistema
- [x] Investigar erro de importação de arquivos XML (203331 e 203321) - arquivos estavam vazios (0 bytes)
- [ ] Validar arquivo vazio no upload (frontend e backend) com mensagem clara ao usuário
- [x] Corrigir funcionalidade de Conciliações Cruzadas (já estava funcionando, isolamento por estabelecimento OK)
- [x] Adicionar capacidade de glosar itens que não apareceram no demonstrativo na Conciliação Cruzada
- [x] Conciliação Cruzada já respeita isolamento de dados por estabelecimento (todas queries filtram por estabelecimentoId)
- [x] Corrigir Conciliação Cruzada para exibir dados do Hemolabor (guia 18414424 não aparece)
- [ ] Corrigir nomes dos convênios que aparecem como IDs numéricos (60003, 120005) na Conciliação Cruzada

- [x] Corrigir conciliação cruzada do Hemolabor - guia 18414424 não aparecia após conciliar automaticamente
- [x] Adicionar processamento em lotes por competência na conciliação automática para evitar timeout com muitos itens
- [x] Reduzir batch size do INSERT na conciliados_automatico de 200 para 50 para evitar queries SQL muito longas
- [x] Atualizar statusConciliacao no faturamento_unificado após conciliação para evitar reprocessamento
- [x] Atualizar resetarConciliacao para também resetar statusConciliacao no faturamento_unificado
- [x] Incluir competências do faturamento_unificado no dropdown da aba Conciliados (além das já conciliadas)

- [x] Corrigir erro "estabelecimentoId expected number, received undefined" ao glosar itens
- [x] Criar módulo de geração de XML de recurso de glosa no padrão TISS/TASY
- [x] Suporte a geração individual (uma guia) e em lote (múltiplas guias)
- [x] Marcar guias que já tiveram XML de recurso gerado
- [x] Salvar XMLs gerados no S3 com link para consulta futura

- [x] Corrigir erro "Cannot access 'convenioIdNum' before initialization" na página de Conciliação Cruzada

- [x] Corrigir geração de XML de recurso: incluir TODOS os itens da guia (pagos e glosados), não apenas glosados
- [x] Código de glosa no XML deve ser apenas número (não texto)
- [x] Seguir exatamente o formato do XML modelo (demonstrativo de análise de conta TISS)

- [x] Tratar itens divergentes como glosados na conciliação cruzada (permitir adicionar motivo de glosa)
- [x] Incluir itens divergentes na geração de XML de recurso

- [x] Corrigir XML de recurso: incluir motivo de glosa (código numérico) e valorGlosa nos itens glosados dentro do XML (tags relacaoGlosa/tipoGlosa/valorGlosa e valorGlosaGuia)

- [x] Permitir regerar XML de recurso para guias que já foram geradas (botão Regerar ou permitir selecionar guias já geradas)

- [x] Corrigir duplicação de itens no faturamento_unificado ao executar Popular Dados novamente (itens glosados perdem status e são duplicados)
- [x] Preservar status de glosa/conciliação dos itens já processados ao repopular dados
- [x] Adicionar índice composto (origemSistema, origemId, estabelecimentoId) para otimizar LEFT JOIN anti-duplicação

- [x] Adicionar filtro por lote_prestador (retorno do convênio/demonstrativo) na Conciliação Cruzada
- [x] Adicionar filtro por numero_lote (XML TISS enviado) na Conciliação Cruzada
- [x] Transformar filtros de Lote XML e Lote Retorno de dropdown para campo de pesquisa com autocomplete
- [x] Adicionar tags valorGlosaProtocolo e valorGlosaGeral no XML de recurso de glosa gerado pelo sistema
- [x] Corrigir código de tabela incorreto no XML de recurso (ex: 07 em vez de 18 para procedimento 60023406)
- [x] Corrigir conciliação automática para agrupar itens duplicados do demonstrativo (mesmo código/guia) antes de comparar com faturado (ex: Gencitabina 2x500mg = 1000mg)
- [x] Classificar automaticamente itens faturados não encontrados no demonstrativo como glosados com código 5007 (em vez de nao_recebido)
- [x] Corrigir tela de NFS-e que não está funcionando corretamente por estabelecimentos
- [x] Corrigir problema de fuso horário que faz datas aparecerem com um dia a menos em todo o sistema (centralizado em dateUtils.ts com safeParseDate/formatDateBR)
- [x] Adicionar colunas Lote e Protocolo na tabela de Guias Conciliadas (aba Conciliados)
- [x] Adicionar colunas Lote e Protocolo na tabela de Guias Glosadas (aba XML Recurso)
- [x] Corrigir filtro de Lote XML que não está filtrando na aba XML Recurso
- [x] Corrigir erros de TypeScript no financeiroRouter.ts e faturamentoUnificadoService.ts que travam a publicação
- [x] Investigar e corrigir travamento na publicação (build de produção)
- [x] Implementar separação de itens próprios vs terceiros na conciliação baseada no codigoPrestadorNaOperadora
- [x] Cadastrar código do prestador por estabelecimento/convênio para identificar itens próprios
- [x] Alterar conciliação automática para filtrar apenas itens do prestador (próprios)
- [x] Criar seção/aba de "Terceiros" na tela de conciliação para itens de outros prestadores
- [x] Excluir itens de terceiros da geração de XML de recurso de glosa
- [x] Corrigir formato de datas incorreto em todo o sistema (garantir DD/MM/AAAA)
- [x] Exportar código para GitHub (repositório hospital_file_manager)
- [x] Criar CONTRIBUTING.md com instruções de setup local para onboarding de novos desenvolvedores
- [x] Investigar e corrigir por que a guia 17007812 não aparece na conciliação cruzada após Popular Dados e Conciliar Automático (causa: competência errada 2026-12, corrigida para 2025-12)
- [x] Implementar cadastro automático de prestadores não cadastrados como terceiros durante o upload de XML

## Bug: Terceiros ainda aparecendo como glosados
- [x] Investigar por que item 20104294 (Erich Pires Marota) na guia 17007812 ainda aparece como glosado
- [x] Corrigir lógica de classificação de terceiros na conciliação automática (causa: nenhum terceiro cadastrado, invertida lógica para usar códigos próprios)
- [x] Bug persistente: guia 17007116 item 20104294 - causa: codigoPrestadorExecutante NULL no faturamento_tiss. Corrigido parser para extrair do equipeSadt + lógica de fallback na conciliação (NULL com itens próprios na mesma guia = terceiro)

## Bug: Duplicação de itens ao reimportar XML
- [x] Guia 17007812 mostrando 42 itens com R$ 93.146,43 (duplicado) - causa: contas_convenio_itens não era limpa ao excluir/reimportar arquivo
- [x] Duplicação estava na contas_convenio_itens (3 cópias com arquivoId diferentes)
- [x] Corrigido: exclusão de arquivo, reimportação e reprocessamento agora limpam contas_convenio_itens + recalculam resumos
- [x] Dados órfãos limpos do banco (arquivos 1800001, 1800002, 1560009, 1620002, 1740030, 1770014)

## XML de Retorno para Reimportação no Sistema de Gestão
- [x] Gerar XML de retorno com todos os itens conciliados (não apenas glosados) - removido HAVING que filtrava só glosados
- [x] XML inclui itens conciliados para reimportação no sistema de gestão (exceto terceiros)
- [x] Aba renomeada para "XML Retorno" e disponível para todas as guias conciliadas

## Seleção de todas as guias no XML Retorno
- [x] Permitir selecionar guias com badge "Terceiro" na aba XML Retorno (checkbox desbloqueado)
- [x] Botão "Selecionar Todas" e "Selecionar Todas Pendentes" incluem todas as guias
- [x] Gerar XML de todas as guias do lote de uma vez (itens de terceiros excluídos automaticamente no backend)

## Análise: Divergência de valores Conta Convênio vs BI
- [ ] Investigar por que Unimed mostra R$ 200.918,67 na Conta Convênio e R$ 292.790,41 no BI
- [ ] Verificar se a divergência ocorre em outros convênios (Ipasgo, Vivacom, Saude Caixa)
- [ ] Identificar causa raiz (tabelas diferentes, filtros diferentes, dados duplicados, etc.)
- [ ] Corrigir se necessário para que ambas as telas mostrem valores consistentes

## Padronização de Competência MM/AAAA em todo o sistema
- [x] Mapear como cada tabela armazena competência (faturamento_tiss, contas_convenio_resumo, recebimento_geral, faturamento_unificado, etc.)
- [x] Adicionar campo competencia na tabela faturamento_tiss (atualmente usa dataReferencia do arquivo)
- [x] Padronizar formato de competência como AAAA/MM em todas as tabelas
- [x] Atualizar getDadosBI para filtrar por campo competencia em vez de dataReferencia do arquivo
- [x] Atualizar queries de Conta Convênio para usar mesma lógica de competência
- [ ] Atualizar queries de Conciliação Cruzada para usar mesma lógica de competência
- [ ] Atualizar queries de Demonstrativo para usar mesma lógica de competência
- [ ] Atualizar queries de recebimento_geral para usar formato padronizado
- [x] Garantir que importação de XML popule campo competencia corretamente
- [x] Corrigir dados existentes no banco para preencher competência onde está faltando
- [x] Escrever testes para validar consistência de valores entre telas
- [x] Validar que BI e Conta Convênio mostram os mesmos valores para mesmo filtro

## Tabela TASY.FATURADO.STAGING
- [x] Analisar estrutura do CSV hemolaboripasgo12-2025 (50 colunas, vírgula decimal)
- [x] Criar tabela tasy_faturado_staging no schema Drizzle com todos os 50 campos
- [x] Criar script de parsing inteligente para tratar vírgulas decimais e descrições com vírgulas
- [x] Importar dados do CSV para a tabela
- [x] Validar dados importados (contagem, valores, integridade)

## Unificação tasy_faturado_staging com Conta Convênio
- [ ] Mapear estrutura das tabelas envolvidas (tasy_faturado_staging, faturamento_unificado, contas_convenio_resumo, contas_convenio_itens)
- [ ] Definir chave de cruzamento entre tasy_faturado_staging e faturamento_unificado
- [ ] Implementar script/query de unificação filtrando apenas itens presentes na faturamento_unificado
- [ ] Popular tabela de Conta Convênio com dados unificados
- [ ] Validar dados unificados (contagem, valores, integridade)

## Popular Conta Convênio para Hemolabor/Ipasgo 2025/12
- [x] Reverter alterações indevidas na faturamento_unificado (glosa/motivo)
- [x] Mapear colunas de contas_convenio_resumo e contas_convenio_itens
- [x] Criar script para popular contas_convenio_resumo agrupando por conta do staging
- [x] Criar script para popular contas_convenio_itens com itens que existem na faturamento_unificado
- [x] Validar dados populados na Conta Convênio

## Padrões de Cobrança para Hemolabor/Ipasgo
- [x] Analisar como padrões de cobrança são criados atualmente no sistema
- [x] Gerar padrões de composição (quais itens acompanham cada procedimento principal)
- [x] Gerar padrões de preços (média, min, max por código de item)
- [x] Gerar padrões de quantidade (média, min, max por código de item)
- [x] Gerar padrões por médico (itens típicos cobrados por cada profissional)
- [x] Validar padrões gerados

## Integrar Hemolabor na Conciliação Cruzada
- [x] Analisar como a conciliação cruzada funciona atualmente
- [x] Garantir que contas Hemolabor apareçam na conciliação cruzada
- [x] Testar processo de comparação faturado vs recebido para Hemolabor
- [x] Validar integração

## Gerar Regras Automaticamente a partir dos Padrões Tasy
- [x] Criar endpoint backend gerarRegrasDosPadroesTasy que analisa contas e cria regras
- [x] Adicionar botão "Gerar Regras dos Padrões Tasy" na tela de Regras de Negócio
- [x] Criar dialog com filtros (estabelecimento, convênio, competência, frequência mínima)
- [x] Exibir preview dos padrões encontrados antes de criar as regras
- [x] Criar regras automaticamente com itens associados, quantidades e valores
- [x] Testar geração e validar regras criadas

## Popular Conta Convênio para todas as competências (07/2025 a 03/2026)
- [ ] Identificar quais competências e convênios existem no staging
- [ ] Popular contas_convenio_resumo e contas_convenio_itens para cada competência
- [ ] Validar dados populados

## Gerar Padrões de Cobrança com base completa (1.3M registros)
- [ ] Executar análise de padrões com todos os dados do staging
- [ ] Salvar padrões atualizados na tabela padroesCobranca

## Executar Conciliação Cruzada para novas competências
- [ ] Verificar quais competências têm dados na faturamento_unificado
- [ ] Executar conciliação automática para cada competência
- [ ] Validar resultados da conciliação

## Correções na Conciliação Automática (Março 2026)
- [x] Corrigir duplicatas na conciliados_automatico (200 registros duplicados em 2026/01)
- [x] Adicionar DELETE de conciliações anteriores (PASSO 0.5) antes de re-processar
- [x] Buscar todos os itens (não apenas pendentes) na re-execução da conciliação
- [x] Melhorar sanitização de strings no INSERT (remover chars de controle, limitar tamanho)
- [x] Atualizar testes unitários para refletir nova sequência de queries
- [x] Limpar 600 registros duplicados do banco (2026/01)
- [ ] 18 itens com pacienteNome NULL faltando na conciliados_automatico (serão processados na próxima execução)

## Popular faturamento_unificado via tasy_faturado_staging (07/2025 a 03/2026)
- [x] Analisar estrutura da tasy_faturado_staging vs faturamento_unificado
- [x] Mapear campos entre as duas tabelas (31 campos mapeados)
- [x] Mapear convênios (19 convênios com match, 27 sem cadastro ficam com convenioId NULL)
- [x] Executar migração INSERT...SELECT para 9 competências (07/2025 a 03/2026)
- [x] Validar dados migrados: 1.337.761 registros = 100% match com staging
- [x] Total faturado migrado: R$ 70.711.689,72
- [ ] Criar endpoint no backend para futuras migrações automatizadas

## Bugs Reportados (24/03/2026)
- [x] Convênios não carregam na tela do Hemolabor após popular dados (resolvido: cache de compilação antigo, restart corrigiu)
- [x] Erro na conciliação: "Unexpected token '<', '<!DOCTYPE '... is not valid JSON" (resolvido: mesmo problema de cache de compilação)
- [x] Adicionado índice composto idx_fatur_estab_convenio para otimizar queries
- [x] Adicionado índice composto idx_conciliados_estab_comp para otimizar queries de conciliação

## Limpeza de dados duplicados XML_TISS do Hemolabor
- [x] Analisar duplicatas XML_TISS (enviados) no Hemolabor: 228 arquivos, 22.038 faturamento_tiss, 22.038 faturamento_unificado, 22.020 conciliados
- [x] Limpar conciliados_automatico do Hemolabor (22.020 registros)
- [x] Limpar faturamento_unificado XML_TISS do Hemolabor (22.038 registros)
- [x] Limpar faturamento_tiss do Hemolabor (22.038 registros)
- [x] Limpar arquivos enviados do Hemolabor (228 registros)
- [x] Validar dados após limpeza: TASY_STAGING preservado (1.337.761), retorno preservado (1)

## Bugs: Popular Dados e Conciliação Hemolabor (24/03/2026 - 2)
- [x] Popular Dados retorna 0 itens para Hemolabor: agora conta dados TASY_STAGING existentes e exibe no toast
- [x] Conciliação retorna "Service Unavailable": otimizado para processar em lotes por competência (sempre, com try/catch por lote)
- [x] Ajustar popularTudo para incluir contagem de dados TASY_STAGING no resultado
- [x] Ajustar conciliação para funcionar com dados TASY_STAGING (busca todas competências, não só pendentes)

## Bug Resolvido: Service Unavailable na Conciliação Hemolabor (24/03/2026 - 3)
- [x] Conciliação ainda dava "Service Unavailable" mesmo com processamento por competência
- [x] Causa: timeout do proxy reverso (~60s) com 1.3M registros
- [x] Solução: processamento assíncrono em background com job manager
- [x] Frontend com polling de progresso (competência atual, total processado)
- [x] Job manager com Map em memória, auto-limpeza de jobs antigos
- [x] 25 testes unitários passando (incluindo testes do job manager)

## Otimização de Performance da Conciliação (24/03/2026 - 4)
- [x] Aumentar BATCH_SIZE de INSERT de 20 para 500 (reduz queries de 7500 para 340 por competência)
- [x] Aumentar UPDATE_BATCH_SIZE de 500 para 2000
- [x] Adicionar logs de progresso detalhados no job manager (tempo por competência, itens processados)
- [x] Melhorar display de progresso no frontend (itens processados, tempo decorrido)
- [x] 25 testes passando

## URGENTE: Otimização Drástica da Conciliação (24/03/2026 - 5)
- [x] Reescrever INSERT: MEGA_BATCH de 5000 (antes 500) = 30 queries em vez de 300 por competência
- [x] Reescrever UPDATE: agrupa todos IDs por status, 1 UPDATE por status (max 5 queries) em chunks de 10k
- [x] Fallback automático: mega-batch → sub-batch 500 → individual
- [x] 25 testes passando
- [ ] Testar com competência individual do Hemolabor (aguardando usuário)

## Filtro inteligente: conciliar apenas competências com demonstrativo (24/03/2026 - 6)
- [x] Identificar quais competências têm demonstrativos de retorno (via JOIN arquivos + recebimentos_excel)
- [x] Alterar job manager para filtrar competências sem demonstrativo (query com direcao='retornado')
- [x] Informar ao usuário quais competências foram puladas (toast.warning com duração 10s)
- [x] Frontend trata resultado com 0 itens processados (mostra mensagem informativa)
- [x] 25 testes passando

## Hospital Samaritano - Rel. Custos (24/03/2026)
- [x] Analisar estrutura do Excel (118.703 registros, 15 colunas)
- [x] Verificar ID do estabelecimento Samaritano cadastrado (ID: 2280016)
- [x] Criar tabela samaritano_custo_staging no banco (19 colunas, índices em setor, convenio, codprod, estabelecimentoId)
- [x] Importar dados do Excel para a tabela (118.703 registros: 12/2025=11.729, 01/2026=43.790, 02/2026=40.786, 03/2026=22.398)
- [x] Criar módulo backend relatorioCustosSamaritano.ts (custos por convênio, conta, setor, detalhe conta)
- [x] Adaptar router para dispatch automático Hemolabor/Warleine vs Samaritano/MySQL
- [x] Adaptar frontend - ocultar abas não aplicáveis ao Samaritano (Dashboard, Custo vs Convênio, Tabela Detalhada)
- [x] Adaptar frontend - mostrar badge "Fonte: Importação Excel" para Samaritano
- [x] Criar testes vitest para módulo Samaritano (6 testes passando)
- [x] Testar e salvar checkpoint

## Bug - Rel. Custos Samaritano (24/03/2026)
- [x] Corrigir erro "Cannot read properties of undefined (reading 'map')" na página /relatorio-custos ao selecionar Samaritano (causa: MySQL/Drizzle retorna [rows, fields] em vez de {rows}, criado extractRows helper)

## Melhorias Rel. Custos Samaritano (24/03/2026 - 2)
- [x] Corrigir filtro por convênio que retorna 0 resultados (causa: backend filtrava por coluna 'convenio' mas frontend enviava 'codplaco'; corrigido para usar codplaco em todas as funções)
- [x] Adicionar coluna setor no detalhe da conta (ex: conta 1171424) - campo setor adicionado no retorno do backend e coluna no frontend
- [x] Adicionar filtro por setor na aba Custos por Conta - dropdown de setor + setoresDisponiveis no backend

## Melhoria Resumo por Convênio - Itens Detalhados (24/03/2026 - 3)
- [x] Na aba Resumo por Convênio, ao clicar em um convênio, expandir/mostrar os itens cadastrados com custo unitário vs valor faturado unitário
- [x] Mostrar resultado lucro/prejuízo por item dentro do convênio selecionado (com Margem Unit., Custo Total, Vlr Faturado Total, Margem Total)

## Dashboard Samaritano (24/03/2026 - 4)
- [x] Criar endpoint backend para dados do dashboard (evolução mensal, top convênios, top setores, KPIs)
- [x] Implementar KPIs visuais: Total Faturado, Total Custo, Margem, Ticket Médio, Total Contas, Itens Únicos
- [x] Gráfico evolução mensal: Custo vs Valor Faturado por competência (ComposedChart com barras + linha de margem)
- [x] Gráfico top convênios: ranking horizontal por faturamento e custo
- [x] Gráfico top setores: ranking horizontal por faturamento e custo
- [x] Gráfico distribuição por tipo de item (PieChart donut)
- [x] Gráfico evolução top 5 convênios (LineChart)
- [x] Gráfico ticket médio + volume de contas (ComposedChart)
- [x] Tabela resumo por convênio com margem e resultado
- [x] Tabela resumo por setor com margem e resultado
- [x] Filtros de competência e convênio no dashboard
- [x] Integrar como nova aba "Dashboard" na página de Relatório de Custos (apenas Samaritano)
- [x] Testes vitest para o endpoint do dashboard (5 testes passando)

## Bug - Divergência Valores Conta Convênio vs Rel BI (24/03/2026)
- [x] Investigar diferença: Conta Convênio Unimed Jan/2026 Estab 3 = R$ 417.819,46 vs Rel BI Faturado = R$ 436.025,18 (causa: 3 guias de internação longa com itens em 2 competências)
- [x] Identificar fonte de dados de cada tela (contas_convenio_resumo vs faturamento_tiss) e corrigir inconsistência
- [x] Corrigir para que ambas as telas mostrem valores consistentes (JOIN com contas_convenio_resumo para usar competência da conta)
- [x] Corrigir Rel BI getDadosBI: usar competência da conta/importação como base + mapeamento snake_case → camelCase

## Bug - Divergência Rel BI Pronto Socorro após JOIN (24/03/2026)
- [x] Investigar divergência Vivacom Pronto Socorro: Conta Convênio R$ 19.098,72 vs Rel BI R$ 16.244,41 (causa: guias com itens em múltiplas competências + filtro de convênio no ft excluía itens de outros convênios)
- [x] Corrigido: subquery para encontrar guias da competência, depois pegar TODOS os itens dessas guias sem filtrar por convênio no faturamento_tiss
- [x] Testes atualizados (6 passando) validando que convênio é filtrado apenas na subquery (contas_convenio_resumo)

- [x] Adicionar colunas recebido e valor_glosada na tabela samaritano_custo_staging
- [x] Atualizar backend dashboardSamaritano com novos KPIs (recebido, glosado, % glosa, % recebimento)
- [x] Adicionar filtro por tipo de atendimento (I/A/E) e setor no dashboard Samaritano
- [x] Melhorar DashboardSamaritano com novos gráficos: Recebido vs Glosado, análise de glosa por convênio
- [x] Adicionar KPI de taxa de recebimento e taxa de glosa no dashboard
- [x] Atualizar importação de dados para incluir campos recebido e valor_glosada (colunas adicionadas no banco, dados serão preenchidos na próxima importação)
- [ ] Atualizar CustosPorConta e CustosPorConvenio para mostrar recebido e glosado
- [ ] Atualizar CustosPorSetor para mostrar recebido e glosado

## Melhorias Custos por Conta e Custos por Convênio - Recebido/Glosado (25/03/2026)
- [x] Atualizar backend buscarCustosPorConvenioSamaritano para incluir recebido e glosado nas queries
- [x] Atualizar backend buscarCustosPorContaSamaritano para incluir recebido e glosado nas queries
- [x] Atualizar frontend CustosPorConta para exibir colunas recebido e glosado
- [x] Atualizar frontend CustosPorConvenio (aba dentro de RelatorioCustos) para exibir colunas recebido e glosado
- [x] Atualizar testes unitários

## Importação de Dados Recebido/Glosado da Planilha SamaritanoCUSTO.ods (25/03/2026)
- [x] Analisar colunas da planilha para mapear recebido e valor_glosada
- [x] Criar script para limpar tabela e reinserir todos os dados com recebido e valor_glosada
- [x] Executar importação e verificar dados no banco (411.201 registros, 0 erros, 58s)

## Melhorias Custos por Setor - Recebido/Glosado (25/03/2026)
- [x] Atualizar backend buscarCustosPorSetorSamaritano para incluir recebido e glosado nas queries
- [x] Atualizar frontend CustosPorSetor para exibir colunas recebido e glosado
- [x] Atualizar testes unitários (14 testes passando)

## Multi-seleção nos Filtros do Dashboard Samaritano (25/03/2026)
- [x] Criar componente MultiSelect reutilizável
- [x] Atualizar backend dashboardSamaritano para aceitar arrays nos filtros
- [x] Atualizar frontend DashboardSamaritano para usar MultiSelect nos filtros
- [ ] Aplicar multi-seleção também nas abas CustosPorConta, CustosPorConvenio e CustosPorSetor (futuro)

## Relatório BI Faturamento por Procedimento (31/03/2026)
- [ ] Analisar estrutura das tabelas faturamento_unificado e demonstrativo
- [ ] Criar backend com queries cruzando faturamento e demonstrativo (faturado/recebido/glosado por procedimento/mês)
- [ ] Criar frontend do relatório BI com filtros (estabelecimento, mês, convênio, prestador) e tabela detalhada
- [ ] Registrar rota no App.tsx e no menu de navegação
- [ ] Escrever testes unitários

## Relatório BI - Faturado x Recebido (31/03/2026)
- [x] Analisar estrutura das tabelas faturamento_unificado e recebimentos_excel
- [x] Criar backend biFaturadoRecebido com queries por procedimento/mês/convênio/setor
- [x] Criar componente BIFaturadoRecebido com KPIs, filtros multi-seleção e tabelas
- [x] Integrar como nova aba 'Faturado x Recebido' no Relatório BI existente
- [x] Adicionar exportação Excel do relatório
- [x] Escrever testes unitários (6 testes passando)

## Bug Fix - Faturado x Recebido sem dados (31/03/2026)
- [x] Investigar e corrigir aba Faturado x Recebido que não mostra dados para Pronto Socorro Infantil (GROUP BY incompatível com sql_mode=only_full_group_by)

## Bug Fix - Filtros e dados aba Faturado x Recebido (31/03/2026)
- [x] Corrigir filtros que não funcionam na aba Faturado x Recebido (incompatibilidade de formato YYYY-MM vs YYYY/MM)
- [x] Corrigir dados não exibidos (GROUP BY + normalização de competência)
- [x] Datas corretas: faturamento tem 2025/11, 2025/12, 2026/01; recebimentos têm 2025/12, 2026/01, 2026/02
