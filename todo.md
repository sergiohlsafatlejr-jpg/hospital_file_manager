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
