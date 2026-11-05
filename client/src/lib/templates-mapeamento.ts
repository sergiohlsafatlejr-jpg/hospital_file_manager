/**
 * Templates de Mapeamento para Integrador de Dados
 *
 * Cada template contém query SQL e mapeamento de campos pré-configurados
 * para facilitar o onboarding de novos clientes/hospitais.
 */

export interface TemplateCampo {
  colunaOrigemNome: string;
  colunaDestinoNome: string; // nome legível para exibição
  descricao: string;
}

export interface TemplateMapeamento {
  id: string;
  nome: string;
  sistema: string;
  descricao: string;
  bancoTipo: string; // SQL Server, Oracle, PostgreSQL, etc.
  querySQL: string;
  campoChaveSugerido: string;
  campos: TemplateCampo[];
  observacoes: string[];
}

export const TEMPLATES_MAPEAMENTO: TemplateMapeamento[] = [
  {
    id: "warleine_faturamento",
    nome: "Warleine - Faturamento Completo",
    sistema: "Warleine",
    descricao: "Importa dados de faturamento do sistema Warleine (SQL Server). Inclui valores faturados, recebidos, glosados e dados de recurso.",
    bancoTipo: "SQL Server",
    querySQL: `SELECT
  f.numconta,
  f.numatend,
  f.nomeconv AS nomeconv,
  f.mesprod,
  f.setor,
  f.codproc,
  f.descricao,
  f.tipo,
  f.qtd,
  f.vl_faturado,
  f.vl_pago,
  f.vl_glosa,
  f.motivo_glosa,
  f.dt_faturamento,
  f.dt_pagamento,
  f.protocolo,
  f.lote,
  f.guia,
  f.nomepac,
  f.codconv,
  f.gl_aceita,
  f.gl_analise,
  f.gl_recuperada,
  f.gl_recurso,
  f.vl_recurso,
  f.vl_recuperado,
  f.status_recurso,
  f.dt_recurso
FROM vw_faturamento_completo f
WHERE f.mesprod >= '{competencia_inicio}'
ORDER BY f.numconta, f.codproc`,
    campoChaveSugerido: "numconta",
    campos: [
      { colunaOrigemNome: "numconta", colunaDestinoNome: "Número da Conta", descricao: "Número da conta hospitalar" },
      { colunaOrigemNome: "numatend", colunaDestinoNome: "Número do Atendimento", descricao: "Número do atendimento" },
      { colunaOrigemNome: "nomeconv", colunaDestinoNome: "Convênio", descricao: "Nome do convênio" },
      { colunaOrigemNome: "mesprod", colunaDestinoNome: "Competência", descricao: "Mês de produção/competência" },
      { colunaOrigemNome: "setor", colunaDestinoNome: "Setor", descricao: "Setor do atendimento" },
      { colunaOrigemNome: "codproc", colunaDestinoNome: "Código Procedimento", descricao: "Código do procedimento/item" },
      { colunaOrigemNome: "descricao", colunaDestinoNome: "Descrição", descricao: "Descrição do procedimento/item" },
      { colunaOrigemNome: "tipo", colunaDestinoNome: "Tipo", descricao: "Tipo do item (Taxa, Mat/Med, Proc, etc.)" },
      { colunaOrigemNome: "qtd", colunaDestinoNome: "Quantidade", descricao: "Quantidade cobrada" },
      { colunaOrigemNome: "vl_faturado", colunaDestinoNome: "Valor Faturado", descricao: "Valor faturado ao convênio" },
      { colunaOrigemNome: "vl_pago", colunaDestinoNome: "Valor Pago", descricao: "Valor efetivamente pago" },
      { colunaOrigemNome: "vl_glosa", colunaDestinoNome: "Valor Glosa", descricao: "Valor glosado pelo convênio" },
      { colunaOrigemNome: "motivo_glosa", colunaDestinoNome: "Motivo Glosa", descricao: "Motivo da glosa" },
      { colunaOrigemNome: "dt_faturamento", colunaDestinoNome: "Data Faturamento", descricao: "Data do faturamento" },
      { colunaOrigemNome: "dt_pagamento", colunaDestinoNome: "Data Pagamento", descricao: "Data do pagamento" },
      { colunaOrigemNome: "protocolo", colunaDestinoNome: "Protocolo", descricao: "Número do protocolo" },
      { colunaOrigemNome: "lote", colunaDestinoNome: "Lote", descricao: "Número do lote" },
      { colunaOrigemNome: "guia", colunaDestinoNome: "Guia", descricao: "Número da guia" },
      { colunaOrigemNome: "nomepac", colunaDestinoNome: "Paciente", descricao: "Nome do paciente" },
      { colunaOrigemNome: "codconv", colunaDestinoNome: "Código Convênio", descricao: "Código do convênio" },
      { colunaOrigemNome: "gl_aceita", colunaDestinoNome: "Glosa Aceita", descricao: "Valor da glosa aceita" },
      { colunaOrigemNome: "gl_analise", colunaDestinoNome: "Glosa em Análise", descricao: "Valor da glosa em análise" },
      { colunaOrigemNome: "gl_recuperada", colunaDestinoNome: "Glosa Recuperada", descricao: "Valor da glosa recuperada" },
      { colunaOrigemNome: "gl_recurso", colunaDestinoNome: "Glosa Recurso", descricao: "Valor da glosa em recurso" },
      { colunaOrigemNome: "vl_recurso", colunaDestinoNome: "Valor Recurso", descricao: "Valor total do recurso" },
      { colunaOrigemNome: "vl_recuperado", colunaDestinoNome: "Valor Recuperado", descricao: "Valor recuperado via recurso" },
      { colunaOrigemNome: "status_recurso", colunaDestinoNome: "Status Recurso", descricao: "Status do recurso de glosa" },
      { colunaOrigemNome: "dt_recurso", colunaDestinoNome: "Data Recurso", descricao: "Data do recurso" },
    ],
    observacoes: [
      "Substitua '{competencia_inicio}' pela competência desejada (ex: '2024-01')",
      "A view vw_faturamento_completo deve existir no banco Warleine",
      "Se não existir a view, adapte a query para as tabelas do seu Warleine",
      "Campos de glosa (gl_*) são opcionais — remova se não existirem no seu banco",
    ],
  },
  {
    id: "warleine_busca_conta",
    nome: "Busca Conta - Warleine (Esteira em Tempo Real)",
    sistema: "Warleine",
    descricao: "Busca uma conta individual em tempo real pelo Nº da Conta ($1) para Recepção, Faturamento e Auditoria Interna na Esteira.",
    bancoTipo: "SQL Server",
    querySQL: `SELECT
  c.numconta AS numconta,
  c.numatend AS numatend,
  c.guiacobra AS guiacobra,
  c.aihguia AS aihguia,
  c.nomepac AS pacientenome,
  c.matricula AS matricula,
  c.nomeconv AS nomeconv,
  c.codconv AS codconv,
  c.tipoatend AS tipoatend,
  c.dataint AS datainternacao,
  c.datasai AS dataalta,
  c.mesprod AS competencia,
  i.nomecc AS setor,
  i.tipoproc AS tipoproc,
  i.procdisco AS codigoitem,
  i.codproprio AS codigoitemtuss,
  i.descricao AS descricao,
  i.quantidade AS quantidade,
  i.vl_unitario AS valorunitario,
  i.vl_faturado AS valortotal,
  i.data AS dataexecucao,
  i.nomeprest AS nomeprest
FROM contas c
LEFT JOIN itens_conta i ON i.numconta = c.numconta
WHERE CAST(c.numconta AS VARCHAR(50)) = $1
ORDER BY i.data, i.tipoproc, i.descricao`,
    campoChaveSugerido: "numconta",
    campos: [
      { colunaOrigemNome: "numconta", colunaDestinoNome: "Número da Conta", descricao: "Identificador da conta no hospital" },
      { colunaOrigemNome: "numatend", colunaDestinoNome: "Número do Atendimento", descricao: "Identificador do atendimento" },
      { colunaOrigemNome: "guiacobra", colunaDestinoNome: "Número da Guia", descricao: "Guia TISS / cobrança" },
      { colunaOrigemNome: "pacientenome", colunaDestinoNome: "Nome do Paciente", descricao: "Nome completo do paciente" },
      { colunaOrigemNome: "nomeconv", colunaDestinoNome: "Convênio", descricao: "Nome do convênio" },
      { colunaOrigemNome: "datainternacao", colunaDestinoNome: "Data Internação/Entrada", descricao: "Data de entrada/internação" },
      { colunaOrigemNome: "dataalta", colunaDestinoNome: "Data Alta/Saída", descricao: "Data da alta hospitalar" },
      { colunaOrigemNome: "codigoitem", colunaDestinoNome: "Código Item", descricao: "Código do item cobrado (NULL se sem baixa)" },
      { colunaOrigemNome: "descricao", colunaDestinoNome: "Descrição Item", descricao: "Descrição do item cobrado" },
      { colunaOrigemNome: "quantidade", colunaDestinoNome: "Quantidade", descricao: "Quantidade lançada" },
      { colunaOrigemNome: "valorunitario", colunaDestinoNome: "Valor Unitário", descricao: "Valor unitário do item" },
      { colunaOrigemNome: "valortotal", colunaDestinoNome: "Valor Total", descricao: "Valor total do item" },
    ],
    observacoes: [
      "IMPORTANTE: Mantenha 'Busca Conta' no nome do mapeamento para ativar a busca direta na Esteira e em Contas Convênio",
      "Use LEFT JOIN na tabela de itens para que contas recém-abertas (ainda sem baixas de farmácia) também retornem o cabeçalho na Recepção",
      "O parâmetro $1 é substituído automaticamente pelo Número da Conta digitado pelo usuário",
    ],
  },
  {
    id: "tasy_faturamento",
    nome: "Tasy - Faturamento Completo",
    sistema: "Tasy",
    descricao: "Importa dados de faturamento do sistema Tasy (Oracle). Inclui procedimentos, materiais/medicamentos, valores e glosas.",
    bancoTipo: "Oracle",
    querySQL: `SELECT
  ic.nr_interno_conta AS numconta,
  ic.nr_atendimento AS numatend,
  c.ds_convenio AS nomeconv,
  TO_CHAR(ic.dt_conta, 'YYYY-MM') AS mesprod,
  s.ds_setor_atendimento AS setor,
  pi.cd_procedimento AS codproc,
  pi.ds_procedimento AS descricao,
  CASE
    WHEN pi.ie_tipo_item = 1 THEN 'Procedimento'
    WHEN pi.ie_tipo_item = 2 THEN 'Mat/Med'
    WHEN pi.ie_tipo_item = 3 THEN 'Taxa'
    WHEN pi.ie_tipo_item = 4 THEN 'Diária'
    ELSE 'Outros'
  END AS tipo,
  pi.qt_procedimento AS qtd,
  pi.vl_procedimento AS vl_faturado,
  NVL(pi.vl_pago, 0) AS vl_pago,
  NVL(pi.vl_glosa, 0) AS vl_glosa,
  mg.ds_motivo_glosa AS motivo_glosa,
  TO_CHAR(ic.dt_conta, 'YYYY-MM-DD') AS dt_faturamento,
  TO_CHAR(pi.dt_pagamento, 'YYYY-MM-DD') AS dt_pagamento,
  ic.nr_protocolo AS protocolo,
  ic.nr_lote AS lote,
  ic.nr_guia AS guia,
  p.nm_pessoa_fisica AS nomepac,
  c.cd_convenio AS codconv
FROM procedimento_item pi
JOIN interno_conta ic ON pi.nr_interno_conta = ic.nr_interno_conta
JOIN convenio c ON ic.cd_convenio = c.cd_convenio
JOIN setor_atendimento s ON ic.cd_setor_atendimento = s.cd_setor_atendimento
JOIN pessoa_fisica p ON ic.cd_pessoa_fisica = p.cd_pessoa_fisica
LEFT JOIN motivo_glosa mg ON pi.cd_motivo_glosa = mg.cd_motivo_glosa
WHERE ic.dt_conta >= TO_DATE('{data_inicio}', 'YYYY-MM-DD')
AND (NVL(pi.ie_situacao, 'A') <> 'C')
ORDER BY ic.nr_interno_conta, pi.cd_procedimento`,
    campoChaveSugerido: "numconta",
    campos: [
      { colunaOrigemNome: "numconta", colunaDestinoNome: "Número da Conta", descricao: "nr_interno_conta do Tasy" },
      { colunaOrigemNome: "numatend", colunaDestinoNome: "Número do Atendimento", descricao: "nr_atendimento do Tasy" },
      { colunaOrigemNome: "nomeconv", colunaDestinoNome: "Convênio", descricao: "ds_convenio do Tasy" },
      { colunaOrigemNome: "mesprod", colunaDestinoNome: "Competência", descricao: "Mês de produção formatado" },
      { colunaOrigemNome: "setor", colunaDestinoNome: "Setor", descricao: "ds_setor_atendimento do Tasy" },
      { colunaOrigemNome: "codproc", colunaDestinoNome: "Código Procedimento", descricao: "cd_procedimento do Tasy" },
      { colunaOrigemNome: "descricao", colunaDestinoNome: "Descrição", descricao: "ds_procedimento do Tasy" },
      { colunaOrigemNome: "tipo", colunaDestinoNome: "Tipo", descricao: "ie_tipo_item convertido para texto" },
      { colunaOrigemNome: "qtd", colunaDestinoNome: "Quantidade", descricao: "qt_procedimento do Tasy" },
      { colunaOrigemNome: "vl_faturado", colunaDestinoNome: "Valor Faturado", descricao: "vl_procedimento do Tasy" },
      { colunaOrigemNome: "vl_pago", colunaDestinoNome: "Valor Pago", descricao: "vl_pago do Tasy" },
      { colunaOrigemNome: "vl_glosa", colunaDestinoNome: "Valor Glosa", descricao: "vl_glosa do Tasy" },
      { colunaOrigemNome: "motivo_glosa", colunaDestinoNome: "Motivo Glosa", descricao: "ds_motivo_glosa do Tasy" },
      { colunaOrigemNome: "dt_faturamento", colunaDestinoNome: "Data Faturamento", descricao: "dt_conta formatada" },
      { colunaOrigemNome: "dt_pagamento", colunaDestinoNome: "Data Pagamento", descricao: "dt_pagamento formatada" },
      { colunaOrigemNome: "protocolo", colunaDestinoNome: "Protocolo", descricao: "nr_protocolo do Tasy" },
      { colunaOrigemNome: "lote", colunaDestinoNome: "Lote", descricao: "nr_lote do Tasy" },
      { colunaOrigemNome: "guia", colunaDestinoNome: "Guia", descricao: "nr_guia do Tasy" },
      { colunaOrigemNome: "nomepac", colunaDestinoNome: "Paciente", descricao: "nm_pessoa_fisica do Tasy" },
      { colunaOrigemNome: "codconv", colunaDestinoNome: "Código Convênio", descricao: "cd_convenio do Tasy" },
    ],
    observacoes: [
      "Substitua '{data_inicio}' pela data desejada (ex: '2024-01-01')",
      "A query usa tabelas padrão do Tasy — verifique se os nomes correspondem à versão do seu Tasy",
      "Para incluir glosas de recurso, adicione JOINs com as tabelas de recurso do Tasy",
      "Campos de recurso (vl_recurso, vl_recuperado, etc.) podem ser adicionados conforme necessidade",
    ],
  },
  {
    id: "tasy_busca_conta",
    nome: "Busca Conta - Tasy (Esteira em Tempo Real)",
    sistema: "Tasy",
    descricao: "Busca uma conta individual no Tasy (Oracle) pelo nr_interno_conta ($1) para Recepção, Faturamento e Auditoria Interna na Esteira.",
    bancoTipo: "Oracle",
    querySQL: `SELECT
  ic.nr_interno_conta AS numconta,
  ic.nr_atendimento AS numatend,
  ic.nr_guia AS guiacobra,
  p.nm_pessoa_fisica AS pacientenome,
  c.ds_convenio AS nomeconv,
  c.cd_convenio AS codconv,
  TO_CHAR(ap.dt_entrada, 'YYYY-MM-DD') AS datainternacao,
  TO_CHAR(ap.dt_alta, 'YYYY-MM-DD') AS dataalta,
  TO_CHAR(ic.dt_conta, 'YYYY-MM') AS competencia,
  s.ds_setor_atendimento AS setor,
  CASE
    WHEN pi.ie_tipo_item = 1 THEN 'PROCEDIMENTO'
    WHEN pi.ie_tipo_item = 2 THEN 'MAT_MED'
    WHEN pi.ie_tipo_item = 3 THEN 'TAXA'
    WHEN pi.ie_tipo_item = 4 THEN 'DIARIA'
    ELSE 'OUTROS'
  END AS tipoproc,
  pi.cd_procedimento AS codigoitem,
  pi.cd_procedimento_tuss AS codigoitemtuss,
  pi.ds_procedimento AS descricao,
  pi.qt_procedimento AS quantidade,
  CASE WHEN NVL(pi.qt_procedimento, 0) > 0 THEN ROUND(pi.vl_procedimento / pi.qt_procedimento, 4) ELSE pi.vl_procedimento END AS valorunitario,
  pi.vl_procedimento AS valortotal,
  TO_CHAR(pi.dt_procedimento, 'YYYY-MM-DD') AS dataexecucao
FROM interno_conta ic
JOIN atendimento_paciente ap ON ic.nr_atendimento = ap.nr_atendimento
JOIN pessoa_fisica p ON ap.cd_pessoa_fisica = p.cd_pessoa_fisica
JOIN convenio c ON ic.cd_convenio = c.cd_convenio
LEFT JOIN setor_atendimento s ON ic.cd_setor_atendimento = s.cd_setor_atendimento
LEFT JOIN procedimento_item pi ON pi.nr_interno_conta = ic.nr_interno_conta AND NVL(pi.ie_situacao, 'A') <> 'C'
WHERE TO_CHAR(ic.nr_interno_conta) = $1
ORDER BY pi.dt_procedimento, pi.cd_procedimento`,
    campoChaveSugerido: "numconta",
    campos: [
      { colunaOrigemNome: "numconta", colunaDestinoNome: "Número da Conta", descricao: "nr_interno_conta do Tasy" },
      { colunaOrigemNome: "numatend", colunaDestinoNome: "Número do Atendimento", descricao: "nr_atendimento do Tasy" },
      { colunaOrigemNome: "guiacobra", colunaDestinoNome: "Número da Guia", descricao: "nr_guia do Tasy" },
      { colunaOrigemNome: "pacientenome", colunaDestinoNome: "Nome do Paciente", descricao: "nm_pessoa_fisica do Tasy" },
      { colunaOrigemNome: "nomeconv", colunaDestinoNome: "Convênio", descricao: "ds_convenio do Tasy" },
      { colunaOrigemNome: "datainternacao", colunaDestinoNome: "Data Internação/Entrada", descricao: "dt_entrada do Tasy" },
      { colunaOrigemNome: "dataalta", colunaDestinoNome: "Data Alta/Saída", descricao: "dt_alta do Tasy" },
      { colunaOrigemNome: "codigoitem", colunaDestinoNome: "Código Item", descricao: "cd_procedimento do Tasy" },
      { colunaOrigemNome: "descricao", colunaDestinoNome: "Descrição Item", descricao: "ds_procedimento do Tasy" },
      { colunaOrigemNome: "quantidade", colunaDestinoNome: "Quantidade", descricao: "qt_procedimento do Tasy" },
      { colunaOrigemNome: "valortotal", colunaDestinoNome: "Valor Total", descricao: "vl_procedimento do Tasy" },
    ],
    observacoes: [
      "IMPORTANTE: Mantenha 'Busca Conta' no nome do mapeamento para ativar a busca direta na Esteira",
      "Usa LEFT JOIN em procedimento_item para retornar o cabeçalho mesmo quando a conta ainda não tem itens baixados",
      "O parâmetro $1 é substituído automaticamente pelo Número da Conta digitado pelo usuário",
    ],
  },
  {
    id: "mv_faturamento",
    nome: "MV - Faturamento Completo",
    sistema: "MV",
    descricao: "Importa dados de faturamento do sistema MV/Soul (Oracle/PostgreSQL). Inclui itens de conta, valores e glosas.",
    bancoTipo: "Oracle/PostgreSQL",
    querySQL: `SELECT
  r.CD_REGISTRO AS numconta,
  a.CD_ATENDIMENTO AS numatend,
  c.NM_CONVENIO AS nomeconv,
  TO_CHAR(r.DT_COMPETENCIA, 'YYYY-MM') AS mesprod,
  u.DS_UNID_INT AS setor,
  ic.CD_PRO_FAT AS codproc,
  pf.DS_PRO_FAT AS descricao,
  CASE
    WHEN ic.TP_ITEM = 'P' THEN 'Procedimento'
    WHEN ic.TP_ITEM = 'M' THEN 'Mat/Med'
    WHEN ic.TP_ITEM = 'T' THEN 'Taxa'
    WHEN ic.TP_ITEM = 'D' THEN 'Diária'
    ELSE 'Outros'
  END AS tipo,
  ic.QT_LANCAMENTO AS qtd,
  ic.VL_TOTAL_CONTA AS vl_faturado,
  NVL(ic.VL_PAGO, 0) AS vl_pago,
  NVL(ic.VL_GLOSA, 0) AS vl_glosa,
  mg.DS_MOT_GLOSA AS motivo_glosa,
  TO_CHAR(r.DT_COMPETENCIA, 'YYYY-MM-DD') AS dt_faturamento,
  TO_CHAR(ic.DT_PAGAMENTO, 'YYYY-MM-DD') AS dt_pagamento,
  r.NR_PROTOCOLO AS protocolo,
  r.NR_LOTE AS lote,
  r.NR_GUIA AS guia,
  p.NM_PACIENTE AS nomepac,
  c.CD_CONVENIO AS codconv
FROM DBAMV.ITREG_FAT ic
JOIN DBAMV.REG_FAT r ON ic.CD_REG_FAT = r.CD_REG_FAT
JOIN DBAMV.ATENDIME a ON r.CD_ATENDIMENTO = a.CD_ATENDIMENTO
JOIN DBAMV.CONVENIO c ON r.CD_CONVENIO = c.CD_CONVENIO
JOIN DBAMV.PRO_FAT pf ON ic.CD_PRO_FAT = pf.CD_PRO_FAT
JOIN DBAMV.PACIENTE p ON a.CD_PACIENTE = p.CD_PACIENTE
LEFT JOIN DBAMV.UNID_INT u ON a.CD_UNID_INT = u.CD_UNID_INT
LEFT JOIN DBAMV.MOT_GLOSA mg ON ic.CD_MOT_GLOSA = mg.CD_MOT_GLOSA
WHERE r.DT_COMPETENCIA >= TO_DATE('{data_inicio}', 'YYYY-MM-DD')
ORDER BY r.CD_REGISTRO, ic.CD_PRO_FAT`,
    campoChaveSugerido: "numconta",
    campos: [
      { colunaOrigemNome: "numconta", colunaDestinoNome: "Número da Conta", descricao: "CD_REGISTRO do MV" },
      { colunaOrigemNome: "numatend", colunaDestinoNome: "Número do Atendimento", descricao: "CD_ATENDIMENTO do MV" },
      { colunaOrigemNome: "nomeconv", colunaDestinoNome: "Convênio", descricao: "NM_CONVENIO do MV" },
      { colunaOrigemNome: "mesprod", colunaDestinoNome: "Competência", descricao: "DT_COMPETENCIA formatada" },
      { colunaOrigemNome: "setor", colunaDestinoNome: "Setor", descricao: "DS_UNID_INT do MV" },
      { colunaOrigemNome: "codproc", colunaDestinoNome: "Código Procedimento", descricao: "CD_PRO_FAT do MV" },
      { colunaOrigemNome: "descricao", colunaDestinoNome: "Descrição", descricao: "DS_PRO_FAT do MV" },
      { colunaOrigemNome: "tipo", colunaDestinoNome: "Tipo", descricao: "TP_ITEM convertido para texto" },
      { colunaOrigemNome: "qtd", colunaDestinoNome: "Quantidade", descricao: "QT_LANCAMENTO do MV" },
      { colunaOrigemNome: "vl_faturado", colunaDestinoNome: "Valor Faturado", descricao: "VL_TOTAL_CONTA do MV" },
      { colunaOrigemNome: "vl_pago", colunaDestinoNome: "Valor Pago", descricao: "VL_PAGO do MV" },
      { colunaOrigemNome: "vl_glosa", colunaDestinoNome: "Valor Glosa", descricao: "VL_GLOSA do MV" },
      { colunaOrigemNome: "motivo_glosa", colunaDestinoNome: "Motivo Glosa", descricao: "DS_MOT_GLOSA do MV" },
      { colunaOrigemNome: "dt_faturamento", colunaDestinoNome: "Data Faturamento", descricao: "DT_COMPETENCIA formatada" },
      { colunaOrigemNome: "dt_pagamento", colunaDestinoNome: "Data Pagamento", descricao: "DT_PAGAMENTO formatada" },
      { colunaOrigemNome: "protocolo", colunaDestinoNome: "Protocolo", descricao: "NR_PROTOCOLO do MV" },
      { colunaOrigemNome: "lote", colunaDestinoNome: "Lote", descricao: "NR_LOTE do MV" },
      { colunaOrigemNome: "guia", colunaDestinoNome: "Guia", descricao: "NR_GUIA do MV" },
      { colunaOrigemNome: "nomepac", colunaDestinoNome: "Paciente", descricao: "NM_PACIENTE do MV" },
      { colunaOrigemNome: "codconv", colunaDestinoNome: "Código Convênio", descricao: "CD_CONVENIO do MV" },
    ],
    observacoes: [
      "Substitua '{data_inicio}' pela data desejada (ex: '2024-01-01')",
      "As tabelas usam o schema DBAMV padrão do MV — ajuste se o schema for diferente",
      "Para PostgreSQL, substitua TO_CHAR/TO_DATE por funções equivalentes",
      "NVL deve ser substituído por COALESCE em PostgreSQL",
      "Campos de recurso podem ser adicionados via tabelas de recurso do MV",
    ],
  },
  {
    id: "mv_busca_conta",
    nome: "Busca Conta - MV / Soul (Esteira em Tempo Real)",
    sistema: "MV",
    descricao: "Busca uma conta individual no MV/Soul pelo CD_REG_FAT ($1) para Recepção, Faturamento e Auditoria Interna na Esteira.",
    bancoTipo: "Oracle/PostgreSQL",
    querySQL: `SELECT
  r.CD_REG_FAT AS numconta,
  a.CD_ATENDIMENTO AS numatend,
  r.NR_GUIA AS guiacobra,
  p.NM_PACIENTE AS pacientenome,
  c.NM_CONVENIO AS nomeconv,
  c.CD_CONVENIO AS codconv,
  TO_CHAR(a.DT_ATENDIMENTO, 'YYYY-MM-DD') AS datainternacao,
  TO_CHAR(a.DT_ALTA, 'YYYY-MM-DD') AS dataalta,
  TO_CHAR(r.DT_COMPETENCIA, 'YYYY-MM') AS competencia,
  u.DS_UNID_INT AS setor,
  ic.CD_PRO_FAT AS codigoitem,
  pf.DS_PRO_FAT AS descricao,
  ic.QT_LANCAMENTO AS quantidade,
  ic.VL_UNITARIO AS valorunitario,
  ic.VL_TOTAL_CONTA AS valortotal,
  TO_CHAR(ic.DT_LANCAMENTO, 'YYYY-MM-DD') AS dataexecucao
FROM DBAMV.REG_FAT r
JOIN DBAMV.ATENDIME a ON r.CD_ATENDIMENTO = a.CD_ATENDIMENTO
JOIN DBAMV.PACIENTE p ON a.CD_PACIENTE = p.CD_PACIENTE
JOIN DBAMV.CONVENIO c ON r.CD_CONVENIO = c.CD_CONVENIO
LEFT JOIN DBAMV.UNID_INT u ON a.CD_UNID_INT = u.CD_UNID_INT
LEFT JOIN DBAMV.ITREG_FAT ic ON ic.CD_REG_FAT = r.CD_REG_FAT
LEFT JOIN DBAMV.PRO_FAT pf ON ic.CD_PRO_FAT = pf.CD_PRO_FAT
WHERE TO_CHAR(r.CD_REG_FAT) = $1
ORDER BY ic.DT_LANCAMENTO, ic.CD_PRO_FAT`,
    campoChaveSugerido: "numconta",
    campos: [
      { colunaOrigemNome: "numconta", colunaDestinoNome: "Número da Conta", descricao: "CD_REG_FAT do MV" },
      { colunaOrigemNome: "numatend", colunaDestinoNome: "Número do Atendimento", descricao: "CD_ATENDIMENTO do MV" },
      { colunaOrigemNome: "guiacobra", colunaDestinoNome: "Número da Guia", descricao: "NR_GUIA do MV" },
      { colunaOrigemNome: "pacientenome", colunaDestinoNome: "Nome do Paciente", descricao: "NM_PACIENTE do MV" },
      { colunaOrigemNome: "nomeconv", colunaDestinoNome: "Convênio", descricao: "NM_CONVENIO do MV" },
      { colunaOrigemNome: "datainternacao", colunaDestinoNome: "Data Internação/Entrada", descricao: "DT_ATENDIMENTO do MV" },
      { colunaOrigemNome: "dataalta", colunaDestinoNome: "Data Alta/Saída", descricao: "DT_ALTA do MV" },
      { colunaOrigemNome: "codigoitem", colunaDestinoNome: "Código Item", descricao: "CD_PRO_FAT do MV" },
      { colunaOrigemNome: "descricao", colunaDestinoNome: "Descrição Item", descricao: "DS_PRO_FAT do MV" },
      { colunaOrigemNome: "quantidade", colunaDestinoNome: "Quantidade", descricao: "QT_LANCAMENTO do MV" },
      { colunaOrigemNome: "valortotal", colunaDestinoNome: "Valor Total", descricao: "VL_TOTAL_CONTA do MV" },
    ],
    observacoes: [
      "IMPORTANTE: Mantenha 'Busca Conta' no nome do mapeamento para ativar a busca direta na Esteira",
      "Usa LEFT JOIN em ITREG_FAT para retornar o cabeçalho mesmo quando a conta ainda não tem itens baixados",
      "O parâmetro $1 é substituído automaticamente pelo Número da Conta digitado pelo usuário",
    ],
  },
  {
    id: "easyvision_faturamento",
    nome: "EasyVision - Faturamento Completo",
    sistema: "EasyVision",
    descricao: "Importa dados de faturamento do sistema EasyVision (PostgreSQL). Inclui atendimentos, procedimentos e valores.",
    bancoTipo: "PostgreSQL",
    querySQL: `SELECT
  c.numero_conta AS numconta,
  a.numero_atendimento AS numatend,
  cv.nome_convenio AS nomeconv,
  TO_CHAR(c.data_competencia, 'YYYY-MM') AS mesprod,
  s.descricao_setor AS setor,
  i.codigo_procedimento AS codproc,
  i.descricao_procedimento AS descricao,
  CASE
    WHEN i.tipo_item = 'PROC' THEN 'Procedimento'
    WHEN i.tipo_item = 'MATMED' THEN 'Mat/Med'
    WHEN i.tipo_item = 'TAXA' THEN 'Taxa'
    WHEN i.tipo_item = 'DIARIA' THEN 'Diária'
    ELSE 'Outros'
  END AS tipo,
  i.quantidade AS qtd,
  i.valor_cobrado AS vl_faturado,
  COALESCE(i.valor_pago, 0) AS vl_pago,
  COALESCE(i.valor_glosa, 0) AS vl_glosa,
  i.motivo_glosa AS motivo_glosa,
  TO_CHAR(c.data_faturamento, 'YYYY-MM-DD') AS dt_faturamento,
  TO_CHAR(i.data_pagamento, 'YYYY-MM-DD') AS dt_pagamento,
  c.numero_protocolo AS protocolo,
  c.numero_lote AS lote,
  c.numero_guia AS guia,
  p.nome_paciente AS nomepac,
  cv.codigo_convenio AS codconv
FROM itens_conta i
JOIN contas c ON i.conta_id = c.id
JOIN atendimentos a ON c.atendimento_id = a.id
JOIN convenios cv ON c.convenio_id = cv.id
JOIN setores s ON a.setor_id = s.id
JOIN pacientes p ON a.paciente_id = p.id
WHERE c.data_competencia >= '{data_inicio}'::date
ORDER BY c.numero_conta, i.codigo_procedimento`,
    campoChaveSugerido: "numconta",
    campos: [
      { colunaOrigemNome: "numconta", colunaDestinoNome: "Número da Conta", descricao: "numero_conta do EasyVision" },
      { colunaOrigemNome: "numatend", colunaDestinoNome: "Número do Atendimento", descricao: "numero_atendimento do EasyVision" },
      { colunaOrigemNome: "nomeconv", colunaDestinoNome: "Convênio", descricao: "nome_convenio do EasyVision" },
      { colunaOrigemNome: "mesprod", colunaDestinoNome: "Competência", descricao: "data_competencia formatada" },
      { colunaOrigemNome: "setor", colunaDestinoNome: "Setor", descricao: "descricao_setor do EasyVision" },
      { colunaOrigemNome: "codproc", colunaDestinoNome: "Código Procedimento", descricao: "codigo_procedimento do EasyVision" },
      { colunaOrigemNome: "descricao", colunaDestinoNome: "Descrição", descricao: "descricao_procedimento do EasyVision" },
      { colunaOrigemNome: "tipo", colunaDestinoNome: "Tipo", descricao: "tipo_item convertido para texto" },
      { colunaOrigemNome: "qtd", colunaDestinoNome: "Quantidade", descricao: "quantidade do EasyVision" },
      { colunaOrigemNome: "vl_faturado", colunaDestinoNome: "Valor Faturado", descricao: "valor_cobrado do EasyVision" },
      { colunaOrigemNome: "vl_pago", colunaDestinoNome: "Valor Pago", descricao: "valor_pago do EasyVision" },
      { colunaOrigemNome: "vl_glosa", colunaDestinoNome: "Valor Glosa", descricao: "valor_glosa do EasyVision" },
      { colunaOrigemNome: "motivo_glosa", colunaDestinoNome: "Motivo Glosa", descricao: "motivo_glosa do EasyVision" },
      { colunaOrigemNome: "dt_faturamento", colunaDestinoNome: "Data Faturamento", descricao: "data_faturamento formatada" },
      { colunaOrigemNome: "dt_pagamento", colunaDestinoNome: "Data Pagamento", descricao: "data_pagamento formatada" },
      { colunaOrigemNome: "protocolo", colunaDestinoNome: "Protocolo", descricao: "numero_protocolo do EasyVision" },
      { colunaOrigemNome: "lote", colunaDestinoNome: "Lote", descricao: "numero_lote do EasyVision" },
      { colunaOrigemNome: "guia", colunaDestinoNome: "Guia", descricao: "numero_guia do EasyVision" },
      { colunaOrigemNome: "nomepac", colunaDestinoNome: "Paciente", descricao: "nome_paciente do EasyVision" },
      { colunaOrigemNome: "codconv", colunaDestinoNome: "Código Convênio", descricao: "codigo_convenio do EasyVision" },
    ],
    observacoes: [
      "Substitua '{data_inicio}' pela data desejada (ex: '2024-01-01')",
      "Os nomes de tabelas podem variar conforme a versão do EasyVision",
      "Verifique se o schema público é o correto ou se há um schema específico",
      "Para incluir dados de recurso, adicione JOINs com as tabelas de recurso",
    ],
  },
  {
    id: "easyvision_busca_conta",
    nome: "Busca Conta - EasyVision (Esteira em Tempo Real)",
    sistema: "EasyVision",
    descricao: "Busca uma conta individual no EasyVision (PostgreSQL) pelo numero_conta ($1) para Recepção, Faturamento e Auditoria Interna na Esteira.",
    bancoTipo: "PostgreSQL",
    querySQL: `SELECT
  c.numero_conta AS numconta,
  a.numero_atendimento AS numatend,
  c.numero_guia AS guiacobra,
  p.nome_paciente AS pacientenome,
  p.numero_carteirinha AS matricula,
  cv.nome_convenio AS nomeconv,
  cv.codigo_convenio AS codconv,
  a.tipo_atendimento AS tipoatend,
  TO_CHAR(a.data_entrada, 'YYYY-MM-DD') AS datainternacao,
  TO_CHAR(a.data_alta, 'YYYY-MM-DD') AS dataalta,
  TO_CHAR(c.data_competencia, 'YYYY-MM') AS competencia,
  s.descricao_setor AS setor,
  CASE
    WHEN i.tipo_item = 'PROC' THEN 'PROCEDIMENTO'
    WHEN i.tipo_item = 'MATMED' THEN 'MAT_MED'
    WHEN i.tipo_item = 'TAXA' THEN 'TAXA'
    WHEN i.tipo_item = 'DIARIA' THEN 'DIARIA'
    ELSE 'OUTROS'
  END AS tipoproc,
  i.codigo_procedimento AS codigoitem,
  i.codigo_tuss AS codigoitemtuss,
  i.descricao_procedimento AS descricao,
  i.quantidade AS quantidade,
  CASE WHEN COALESCE(i.quantidade, 0) > 0 THEN ROUND(i.valor_cobrado / i.quantidade, 4) ELSE i.valor_cobrado END AS valorunitario,
  i.valor_cobrado AS valortotal,
  TO_CHAR(i.data_execucao, 'YYYY-MM-DD') AS dataexecucao
FROM contas c
JOIN atendimentos a ON c.atendimento_id = a.id
JOIN pacientes p ON a.paciente_id = p.id
JOIN convenios cv ON c.convenio_id = cv.id
LEFT JOIN setores s ON a.setor_id = s.id
LEFT JOIN itens_conta i ON i.conta_id = c.id
WHERE c.numero_conta::text = $1
ORDER BY i.data_execucao, i.codigo_procedimento`,
    campoChaveSugerido: "numconta",
    campos: [
      { colunaOrigemNome: "numconta", colunaDestinoNome: "Número da Conta", descricao: "numero_conta do EasyVision" },
      { colunaOrigemNome: "numatend", colunaDestinoNome: "Número do Atendimento", descricao: "numero_atendimento do EasyVision" },
      { colunaOrigemNome: "guiacobra", colunaDestinoNome: "Número da Guia", descricao: "numero_guia do EasyVision" },
      { colunaOrigemNome: "pacientenome", colunaDestinoNome: "Nome do Paciente", descricao: "nome_paciente do EasyVision" },
      { colunaOrigemNome: "nomeconv", colunaDestinoNome: "Convênio", descricao: "nome_convenio do EasyVision" },
      { colunaOrigemNome: "datainternacao", colunaDestinoNome: "Data Internação/Entrada", descricao: "data_entrada do EasyVision" },
      { colunaOrigemNome: "dataalta", colunaDestinoNome: "Data Alta/Saída", descricao: "data_alta do EasyVision" },
      { colunaOrigemNome: "codigoitem", colunaDestinoNome: "Código Item", descricao: "codigo_procedimento do EasyVision" },
      { colunaOrigemNome: "descricao", colunaDestinoNome: "Descrição Item", descricao: "descricao_procedimento do EasyVision" },
      { colunaOrigemNome: "quantidade", colunaDestinoNome: "Quantidade", descricao: "quantidade do EasyVision" },
      { colunaOrigemNome: "valortotal", colunaDestinoNome: "Valor Total", descricao: "valor_cobrado do EasyVision" },
    ],
    observacoes: [
      "IMPORTANTE: Mantenha 'Busca Conta' no nome do mapeamento para ativar a busca direta na Esteira",
      "Usa LEFT JOIN em itens_conta para retornar o cabeçalho mesmo quando a conta ainda não tem itens baixados pela farmácia",
      "O parâmetro $1 é substituído automaticamente pelo Número da Conta digitado pelo usuário",
    ],
  },
];

export const SISTEMAS_DISPONIVEIS = [
  { id: "warleine", nome: "Warleine", banco: "SQL Server" },
  { id: "tasy", nome: "Tasy", banco: "Oracle" },
  { id: "mv", nome: "MV / Soul", banco: "Oracle / PostgreSQL" },
  { id: "easyvision", nome: "EasyVision", banco: "PostgreSQL" },
  { id: "personalizado", nome: "Personalizado", banco: "Qualquer" },
];

export function getTemplatesBySistema(sistemaId: string): TemplateMapeamento[] {
  return TEMPLATES_MAPEAMENTO.filter(
    (t) => t.sistema.toLowerCase() === sistemaId.toLowerCase()
  );
}
