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
