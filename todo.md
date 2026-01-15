# Hospital File Manager - TODO

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
