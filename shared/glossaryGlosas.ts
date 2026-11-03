/**
 * Dicionário de Códigos de Glosa TISS (Tabela 38 - ANS)
 * Fonte: Padrão TISS - Agência Nacional de Saúde Suplementar
 * 
 * Este arquivo contém os códigos de glosa padronizados pela ANS
 * para uso no padrão TISS de troca de informações de saúde suplementar.
 * Inclui sugestões de argumentos e ações para contestação.
 */

export interface GlosaInfo {
  codigo: string;
  grupo: string;
  descricao: string;
  descricaoSimplificada: string;
  /** Sugestão de argumento para contestar a glosa */
  argumentoContestacao?: string;
  /** Ações recomendadas para resolver/contestar */
  acoesRecomendadas?: string[];
  /** Documentos que podem ser anexados como evidência */
  documentosSugeridos?: string[];
  /** Nível de dificuldade para reverter (1-5, sendo 5 mais difícil) */
  dificuldadeReversao?: number;
  /** Probabilidade estimada de sucesso na contestação (%) */
  probabilidadeSucesso?: number;
}

/**
 * Mapeamento de códigos de glosa para descrições e sugestões de contestação
 * Chave: código da glosa (string)
 * Valor: informações completas da glosa incluindo argumentos de contestação
 */
export const GLOSAS_TISS: Record<string, GlosaInfo> = {
  // ============================================
  // ELEGIBILIDADE (1001-1099)
  // ============================================
  "1001": {
    codigo: "1001",
    grupo: "Elegibilidade",
    descricao: "Número da carteira inválido",
    descricaoSimplificada: "Carteirinha inválida",
    argumentoContestacao: "O número da carteira informado está correto conforme cadastro do beneficiário. Solicitamos verificação no sistema da operadora, pois pode haver divergência cadastral que não é de responsabilidade do prestador.",
    acoesRecomendadas: [
      "Verificar se o número da carteira foi digitado corretamente",
      "Solicitar ao beneficiário cópia atualizada da carteirinha",
      "Confirmar dados com a central de atendimento da operadora"
    ],
    documentosSugeridos: ["Cópia da carteirinha do beneficiário", "Print do sistema com dados do atendimento"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 80
  },
  "1003": {
    codigo: "1003",
    grupo: "Elegibilidade",
    descricao: "A admissão do Beneficiário no prestador ocorreu antes da inclusão do Beneficiário na Operadora",
    descricaoSimplificada: "Atendimento antes da inclusão no plano",
    argumentoContestacao: "O atendimento foi realizado com base na elegibilidade verificada no momento da admissão. Se houve divergência nas datas de inclusão, esta informação não estava disponível ao prestador no momento do atendimento.",
    acoesRecomendadas: [
      "Verificar data de inclusão do beneficiário no sistema da operadora",
      "Solicitar comprovante de elegibilidade da data do atendimento",
      "Verificar se houve migração de plano ou portabilidade"
    ],
    documentosSugeridos: ["Comprovante de elegibilidade do dia do atendimento", "Protocolo de verificação de elegibilidade"],
    dificuldadeReversao: 4,
    probabilidadeSucesso: 40
  },
  "1005": {
    codigo: "1005",
    grupo: "Elegibilidade",
    descricao: "Atendimento anterior à inclusão do Beneficiário",
    descricaoSimplificada: "Atendimento antes da inclusão no plano",
    argumentoContestacao: "A elegibilidade foi verificada no momento do atendimento através do sistema da operadora, que indicou cobertura ativa. Se houve inconsistência nas datas, o prestador não tinha como identificar.",
    acoesRecomendadas: [
      "Verificar protocolo de elegibilidade do dia do atendimento",
      "Solicitar histórico de inclusão do beneficiário",
      "Verificar se há retroatividade na inclusão"
    ],
    documentosSugeridos: ["Print da tela de elegibilidade", "Protocolo de autorização"],
    dificuldadeReversao: 4,
    probabilidadeSucesso: 35
  },
  "1006": {
    codigo: "1006",
    grupo: "Elegibilidade",
    descricao: "Atendimento após o desligamento do Beneficiário",
    descricaoSimplificada: "Beneficiário desligado do plano",
    argumentoContestacao: "No momento do atendimento, a elegibilidade foi verificada e confirmada pelo sistema da operadora. O desligamento não estava registrado ou não foi comunicado adequadamente.",
    acoesRecomendadas: [
      "Verificar data exata do desligamento",
      "Solicitar comprovante de comunicação do desligamento",
      "Verificar se há período de cobertura pós-desligamento"
    ],
    documentosSugeridos: ["Print da verificação de elegibilidade", "Protocolo de atendimento"],
    dificuldadeReversao: 4,
    probabilidadeSucesso: 30
  },
  "1007": {
    codigo: "1007",
    grupo: "Elegibilidade",
    descricao: "Atendimento dentro da carência do Beneficiário",
    descricaoSimplificada: "Período de carência",
    argumentoContestacao: "O procedimento realizado se enquadra em situação de urgência/emergência, que por lei (Lei 9.656/98) não está sujeita a carência após 24 horas da contratação. Alternativamente, verificar se há portabilidade de carências.",
    acoesRecomendadas: [
      "Verificar se o atendimento foi de urgência/emergência",
      "Verificar se há portabilidade de carências de plano anterior",
      "Consultar contrato do beneficiário sobre carências específicas"
    ],
    documentosSugeridos: ["Relatório médico caracterizando urgência/emergência", "Declaração de portabilidade de carências"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 60
  },
  "1008": {
    codigo: "1008",
    grupo: "Elegibilidade",
    descricao: "Assinatura divergente",
    descricaoSimplificada: "Assinatura não confere",
    argumentoContestacao: "A assinatura foi colhida no momento do atendimento pelo próprio beneficiário ou responsável legal. Variações na assinatura são comuns e não invalidam o atendimento realizado.",
    acoesRecomendadas: [
      "Solicitar nova assinatura do beneficiário se possível",
      "Anexar documento de identificação com assinatura para comparação",
      "Verificar se há procuração ou termo de responsabilidade"
    ],
    documentosSugeridos: ["Cópia do documento de identidade", "Termo de responsabilidade assinado"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 70
  },
  "1009": {
    codigo: "1009",
    grupo: "Elegibilidade",
    descricao: "Beneficiário com pagamento em aberto",
    descricaoSimplificada: "Inadimplência do beneficiário",
    argumentoContestacao: "A inadimplência do beneficiário junto à operadora não pode ser transferida ao prestador. O atendimento foi realizado de boa-fé com elegibilidade confirmada. A cobrança deve ser direcionada ao beneficiário.",
    acoesRecomendadas: [
      "Verificar se a inadimplência estava registrada no momento do atendimento",
      "Solicitar comprovante de elegibilidade da data do atendimento",
      "Argumentar que prestador não tem acesso a informações financeiras"
    ],
    documentosSugeridos: ["Print da verificação de elegibilidade", "Protocolo de autorização"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 65
  },
  "1010": {
    codigo: "1010",
    grupo: "Elegibilidade",
    descricao: "Assinatura do Titular / Responsável inexistente",
    descricaoSimplificada: "Falta assinatura do responsável",
    argumentoContestacao: "A assinatura foi colhida conforme procedimento padrão. Caso haja falha no documento digitalizado, podemos providenciar nova via com assinatura legível.",
    acoesRecomendadas: [
      "Verificar se a guia original possui a assinatura",
      "Providenciar nova digitalização com melhor qualidade",
      "Solicitar assinatura retroativa se possível"
    ],
    documentosSugeridos: ["Guia original com assinatura", "Termo de responsabilidade"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 75
  },
  "1011": {
    codigo: "1011",
    grupo: "Elegibilidade",
    descricao: "Identificação do beneficiário não consistente",
    descricaoSimplificada: "Dados do beneficiário inconsistentes",
    argumentoContestacao: "Os dados foram preenchidos conforme informado pelo beneficiário e verificados no sistema. Pequenas divergências cadastrais não invalidam o atendimento realizado.",
    acoesRecomendadas: [
      "Verificar quais dados estão inconsistentes",
      "Solicitar atualização cadastral do beneficiário",
      "Corrigir dados e reapresentar a guia"
    ],
    documentosSugeridos: ["Cópia do documento de identidade", "Carteirinha do plano"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 80
  },
  "1012": {
    codigo: "1012",
    grupo: "Elegibilidade",
    descricao: "Serviço Profissional Hospitalar não é coberto pelo plano do beneficiário",
    descricaoSimplificada: "Serviço não coberto pelo plano",
    argumentoContestacao: "O procedimento realizado consta no Rol de Procedimentos da ANS e deve ser coberto por todos os planos de saúde. Solicitamos revisão da análise considerando a obrigatoriedade de cobertura.",
    acoesRecomendadas: [
      "Verificar se o procedimento está no Rol da ANS",
      "Consultar contrato do beneficiário sobre coberturas",
      "Argumentar com base na Lei 9.656/98 e resoluções da ANS"
    ],
    documentosSugeridos: ["Rol de Procedimentos da ANS", "Justificativa médica para o procedimento"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 70
  },
  "1099": {
    codigo: "1099",
    grupo: "Elegibilidade",
    descricao: "Outros motivos de elegibilidade",
    descricaoSimplificada: "Outros (elegibilidade)",
    argumentoContestacao: "Solicitamos detalhamento do motivo específico da glosa para que possamos apresentar a documentação adequada para contestação.",
    acoesRecomendadas: [
      "Solicitar esclarecimento do motivo específico",
      "Reunir toda documentação do atendimento",
      "Verificar elegibilidade no sistema"
    ],
    documentosSugeridos: ["Documentação completa do atendimento"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 50
  },

  // ============================================
  // PROTOCOLO (1102-1199)
  // ============================================
  "1102": {
    codigo: "1102",
    grupo: "Protocolo",
    descricao: "Protocolo é de re-apresentação",
    descricaoSimplificada: "Reapresentação de protocolo",
    argumentoContestacao: "A reapresentação foi necessária devido a correções solicitadas pela própria operadora ou por complementação de documentação. Não se trata de duplicidade de cobrança.",
    acoesRecomendadas: [
      "Verificar histórico de apresentações anteriores",
      "Identificar motivo da reapresentação",
      "Documentar correções realizadas"
    ],
    documentosSugeridos: ["Histórico de protocolos", "Comunicação anterior da operadora"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 75
  },
  "1199": {
    codigo: "1199",
    grupo: "Protocolo",
    descricao: "Outros motivos de protocolo",
    descricaoSimplificada: "Outros (protocolo)",
    argumentoContestacao: "Solicitamos especificação do motivo da glosa relacionada ao protocolo para apresentação de documentação pertinente.",
    acoesRecomendadas: [
      "Solicitar detalhamento do motivo",
      "Verificar conformidade do protocolo"
    ],
    documentosSugeridos: ["Protocolo de envio"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 50
  },

  // ============================================
  // PRESTADOR (1201-1299)
  // ============================================
  "1201": {
    codigo: "1201",
    grupo: "Prestador",
    descricao: "Atendimento fora da vigência do contrato com o credenciado",
    descricaoSimplificada: "Fora da vigência do contrato",
    argumentoContestacao: "O atendimento foi realizado durante a vigência do contrato. Solicitamos verificação das datas contratuais no sistema da operadora.",
    acoesRecomendadas: [
      "Verificar datas do contrato de credenciamento",
      "Solicitar cópia do contrato vigente",
      "Verificar se houve renovação automática"
    ],
    documentosSugeridos: ["Contrato de credenciamento", "Aditivos contratuais"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 70
  },
  "1202": {
    codigo: "1202",
    grupo: "Prestador",
    descricao: "Número do CNES inválido",
    descricaoSimplificada: "CNES inválido",
    argumentoContestacao: "O CNES informado está correto e ativo no Cadastro Nacional de Estabelecimentos de Saúde. Segue comprovante de consulta ao CNES.",
    acoesRecomendadas: [
      "Verificar CNES no site do DataSUS",
      "Confirmar se o CNES está ativo",
      "Atualizar cadastro se necessário"
    ],
    documentosSugeridos: ["Print da consulta ao CNES", "Ficha de cadastro atualizada"],
    dificuldadeReversao: 1,
    probabilidadeSucesso: 90
  },
  "1207": {
    codigo: "1207",
    grupo: "Prestador",
    descricao: "Credenciado não pertence à Rede Credenciada",
    descricaoSimplificada: "Prestador não credenciado",
    argumentoContestacao: "O prestador está devidamente credenciado conforme contrato vigente. Solicitamos verificação no cadastro de rede credenciada da operadora.",
    acoesRecomendadas: [
      "Verificar status do credenciamento",
      "Solicitar comprovante de credenciamento",
      "Verificar se há pendências cadastrais"
    ],
    documentosSugeridos: ["Contrato de credenciamento", "Termo de adesão à rede"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 80
  },
  "1211": {
    codigo: "1211",
    grupo: "Prestador",
    descricao: "Assinatura / Carimbo do Credenciado inexistente",
    descricaoSimplificada: "Falta assinatura/carimbo",
    argumentoContestacao: "A guia foi devidamente assinada e carimbada. Caso a digitalização não esteja legível, podemos providenciar nova cópia.",
    acoesRecomendadas: [
      "Verificar guia original",
      "Providenciar nova digitalização",
      "Reapresentar com assinatura/carimbo visível"
    ],
    documentosSugeridos: ["Guia original assinada e carimbada"],
    dificuldadeReversao: 1,
    probabilidadeSucesso: 85
  },
  "1214": {
    codigo: "1214",
    grupo: "Prestador",
    descricao: "Credenciado não habilitado a realizar o procedimento",
    descricaoSimplificada: "Prestador não habilitado",
    argumentoContestacao: "O profissional possui habilitação técnica e registro no conselho de classe para realizar o procedimento. Segue documentação comprobatória.",
    acoesRecomendadas: [
      "Verificar registro no conselho de classe",
      "Confirmar especialidade do profissional",
      "Anexar certificados de habilitação"
    ],
    documentosSugeridos: ["Registro no CRM/CRO/COREN", "Certificado de especialização", "RQE"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 75
  },
  "1299": {
    codigo: "1299",
    grupo: "Prestador",
    descricao: "Outros motivos de prestador",
    descricaoSimplificada: "Outros (prestador)",
    argumentoContestacao: "Solicitamos especificação do motivo da glosa relacionada ao prestador para apresentação de documentação adequada.",
    acoesRecomendadas: [
      "Solicitar detalhamento do motivo",
      "Verificar cadastro do prestador"
    ],
    documentosSugeridos: ["Documentação cadastral do prestador"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 50
  },

  // ============================================
  // GUIA (1301-1399)
  // ============================================
  "1301": {
    codigo: "1301",
    grupo: "Guia",
    descricao: "Tipo guia inválido",
    descricaoSimplificada: "Tipo de guia inválido",
    argumentoContestacao: "O tipo de guia utilizado está correto para o procedimento realizado conforme manual TISS. Solicitamos revisão da análise.",
    acoesRecomendadas: [
      "Verificar tipo de guia correto para o procedimento",
      "Consultar manual TISS",
      "Reapresentar com tipo correto se necessário"
    ],
    documentosSugeridos: ["Manual TISS", "Guia corrigida"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 80
  },
  "1305": {
    codigo: "1305",
    grupo: "Guia",
    descricao: "Item pago em outra Guia",
    descricaoSimplificada: "Item já pago em outra guia",
    argumentoContestacao: "O item cobrado não foi pago anteriormente. Trata-se de procedimentos distintos ou realizados em datas diferentes. Solicitamos verificação detalhada.",
    acoesRecomendadas: [
      "Verificar histórico de pagamentos",
      "Identificar a guia onde supostamente foi pago",
      "Demonstrar diferenças entre os procedimentos"
    ],
    documentosSugeridos: ["Histórico de guias do paciente", "Comparativo entre procedimentos"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 75
  },
  "1307": {
    codigo: "1307",
    grupo: "Guia",
    descricao: "Número da guia inválido",
    descricaoSimplificada: "Número da guia inválido",
    argumentoContestacao: "O número da guia foi gerado pelo sistema conforme padrão estabelecido. Solicitamos verificação do formato aceito pela operadora.",
    acoesRecomendadas: [
      "Verificar formato do número da guia",
      "Confirmar sequencial de numeração",
      "Corrigir e reapresentar se necessário"
    ],
    documentosSugeridos: ["Guia com número corrigido"],
    dificuldadeReversao: 1,
    probabilidadeSucesso: 90
  },
  "1308": {
    codigo: "1308",
    grupo: "Guia",
    descricao: "Guia já apresentada",
    descricaoSimplificada: "Guia duplicada",
    argumentoContestacao: "A guia não foi apresentada anteriormente ou trata-se de reapresentação por solicitação da operadora. Não há duplicidade de cobrança.",
    acoesRecomendadas: [
      "Verificar histórico de apresentações",
      "Identificar se houve reapresentação autorizada",
      "Demonstrar que não há duplicidade"
    ],
    documentosSugeridos: ["Histórico de protocolos", "Justificativa da reapresentação"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 70
  },
  "1313": {
    codigo: "1313",
    grupo: "Guia",
    descricao: "Guia com rasura",
    descricaoSimplificada: "Guia rasurada",
    argumentoContestacao: "A correção foi necessária e está devidamente rubricada pelo profissional responsável, conforme permitido pelas normas vigentes.",
    acoesRecomendadas: [
      "Verificar se a rasura está rubricada",
      "Providenciar nova guia sem rasuras se possível",
      "Justificar a necessidade da correção"
    ],
    documentosSugeridos: ["Guia original com rubrica na correção", "Nova guia sem rasuras"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 70
  },
  "1314": {
    codigo: "1314",
    grupo: "Guia",
    descricao: "Guia sem assinatura e/ou carimbo do credenciado",
    descricaoSimplificada: "Falta assinatura na guia",
    argumentoContestacao: "A guia foi devidamente assinada e carimbada pelo profissional responsável. Segue nova cópia com melhor qualidade de digitalização.",
    acoesRecomendadas: [
      "Verificar guia original",
      "Providenciar nova digitalização",
      "Reapresentar com assinatura visível"
    ],
    documentosSugeridos: ["Guia original assinada"],
    dificuldadeReversao: 1,
    probabilidadeSucesso: 85
  },
  "1317": {
    codigo: "1317",
    grupo: "Guia",
    descricao: "Guia sem data do atendimento",
    descricaoSimplificada: "Falta data do atendimento",
    argumentoContestacao: "A data do atendimento consta na guia. Caso não esteja legível, informamos que o atendimento foi realizado em [DATA]. Segue documentação comprobatória.",
    acoesRecomendadas: [
      "Verificar se a data está na guia",
      "Providenciar nova cópia legível",
      "Anexar prontuário com data do atendimento"
    ],
    documentosSugeridos: ["Guia com data legível", "Registro de atendimento"],
    dificuldadeReversao: 1,
    probabilidadeSucesso: 90
  },
  "1319": {
    codigo: "1319",
    grupo: "Guia",
    descricao: "Guia sem assinatura do assistido",
    descricaoSimplificada: "Falta assinatura do paciente",
    argumentoContestacao: "A assinatura do beneficiário foi colhida no momento do atendimento. Caso não esteja visível na digitalização, podemos providenciar nova cópia.",
    acoesRecomendadas: [
      "Verificar guia original",
      "Providenciar nova digitalização",
      "Anexar termo de consentimento assinado"
    ],
    documentosSugeridos: ["Guia original com assinatura", "Termo de consentimento"],
    dificuldadeReversao: 1,
    probabilidadeSucesso: 85
  },
  "1321": {
    codigo: "1321",
    grupo: "Guia",
    descricao: "Validade da guia expirada",
    descricaoSimplificada: "Guia vencida",
    argumentoContestacao: "O atendimento foi realizado dentro do prazo de validade da autorização. Solicitamos verificação das datas no sistema.",
    acoesRecomendadas: [
      "Verificar data de validade da autorização",
      "Confirmar data do atendimento",
      "Solicitar prorrogação se aplicável"
    ],
    documentosSugeridos: ["Autorização com data de validade", "Comprovante de data do atendimento"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 60
  },
  "1323": {
    codigo: "1323",
    grupo: "Guia",
    descricao: "Guia com informações divergentes",
    descricaoSimplificada: "Informações divergentes na guia",
    argumentoContestacao: "As informações da guia estão corretas e consistentes. Solicitamos especificação de quais dados estão divergentes para correção pontual.",
    acoesRecomendadas: [
      "Solicitar detalhamento das divergências",
      "Verificar consistência dos dados",
      "Corrigir e reapresentar"
    ],
    documentosSugeridos: ["Guia corrigida", "Documentação de suporte"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 75
  },
  "1399": {
    codigo: "1399",
    grupo: "Guia",
    descricao: "Outros motivos de guia",
    descricaoSimplificada: "Outros (guia)",
    argumentoContestacao: "Solicitamos especificação do motivo da glosa relacionada à guia para apresentação de documentação adequada.",
    acoesRecomendadas: [
      "Solicitar detalhamento do motivo",
      "Verificar preenchimento da guia"
    ],
    documentosSugeridos: ["Guia completa"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 50
  },

  // ============================================
  // AUTORIZAÇÃO/SOLICITAÇÃO (1401-1499)
  // ============================================
  "1402": {
    codigo: "1402",
    grupo: "Autorização",
    descricao: "Procedimento não autorizado",
    descricaoSimplificada: "Procedimento não autorizado",
    argumentoContestacao: "O procedimento foi autorizado conforme protocolo/senha informados. Alternativamente, tratou-se de urgência/emergência que dispensa autorização prévia conforme Lei 9.656/98.",
    acoesRecomendadas: [
      "Verificar se há autorização no sistema",
      "Caracterizar urgência/emergência se aplicável",
      "Solicitar autorização retroativa com justificativa"
    ],
    documentosSugeridos: ["Protocolo de autorização", "Relatório médico de urgência", "Justificativa clínica"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 65
  },
  "1403": {
    codigo: "1403",
    grupo: "Autorização",
    descricao: "Não existe informação sobre a senha de autorização do procedimento",
    descricaoSimplificada: "Senha de autorização não informada",
    argumentoContestacao: "A senha de autorização é [SENHA]. Caso não conste no sistema, solicitamos verificação, pois a autorização foi obtida previamente ao atendimento.",
    acoesRecomendadas: [
      "Localizar senha de autorização",
      "Verificar protocolo de solicitação",
      "Reapresentar com senha correta"
    ],
    documentosSugeridos: ["Comprovante de autorização", "Protocolo de solicitação"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 80
  },
  "1407": {
    codigo: "1407",
    grupo: "Autorização",
    descricao: "Serviço solicitado não possui cobertura",
    descricaoSimplificada: "Serviço sem cobertura",
    argumentoContestacao: "O procedimento está incluído no Rol de Procedimentos da ANS (Resolução Normativa vigente) e deve ser coberto obrigatoriamente. A negativa de cobertura contraria a legislação.",
    acoesRecomendadas: [
      "Verificar se o procedimento está no Rol da ANS",
      "Fundamentar com base na RN vigente",
      "Citar jurisprudência se necessário"
    ],
    documentosSugeridos: ["Rol de Procedimentos da ANS", "Justificativa médica", "Parecer técnico"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 70
  },
  "1408": {
    codigo: "1408",
    grupo: "Autorização",
    descricao: "Quantidade Serviço solicitada acima da Autorizada",
    descricaoSimplificada: "Quantidade acima do autorizado",
    argumentoContestacao: "A quantidade realizada foi necessária conforme indicação clínica. Segue justificativa médica para a quantidade executada.",
    acoesRecomendadas: [
      "Verificar quantidade autorizada",
      "Justificar necessidade clínica",
      "Solicitar autorização complementar"
    ],
    documentosSugeridos: ["Justificativa médica", "Evolução clínica", "Solicitação de complementação"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 60
  },
  "1410": {
    codigo: "1410",
    grupo: "Autorização",
    descricao: "Serviço solicitado em Carência",
    descricaoSimplificada: "Serviço em carência",
    argumentoContestacao: "O atendimento foi realizado em situação de urgência/emergência, que por lei dispensa carência após 24 horas da contratação (Lei 9.656/98, art. 12).",
    acoesRecomendadas: [
      "Caracterizar urgência/emergência",
      "Verificar portabilidade de carências",
      "Fundamentar com base na legislação"
    ],
    documentosSugeridos: ["Relatório médico de urgência", "Declaração de portabilidade"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 65
  },
  "1415": {
    codigo: "1415",
    grupo: "Autorização",
    descricao: "Procedimento não autorizado para o Beneficiário",
    descricaoSimplificada: "Procedimento não autorizado",
    argumentoContestacao: "O procedimento foi indicado pelo médico assistente e é necessário para o tratamento do beneficiário. Segue justificativa clínica detalhada.",
    acoesRecomendadas: [
      "Elaborar justificativa médica detalhada",
      "Solicitar autorização com documentação completa",
      "Recorrer à ANS se necessário"
    ],
    documentosSugeridos: ["Justificativa médica", "Exames complementares", "Literatura médica"],
    dificuldadeReversao: 4,
    probabilidadeSucesso: 50
  },
  "1425": {
    codigo: "1425",
    grupo: "Autorização",
    descricao: "Necessita pré-autorização da empresa",
    descricaoSimplificada: "Requer pré-autorização",
    argumentoContestacao: "O procedimento foi realizado em caráter de urgência/emergência, dispensando autorização prévia. Alternativamente, a autorização foi solicitada mas não houve resposta no prazo regulamentar.",
    acoesRecomendadas: [
      "Caracterizar urgência se aplicável",
      "Verificar se houve solicitação prévia",
      "Documentar tentativas de autorização"
    ],
    documentosSugeridos: ["Relatório de urgência", "Protocolo de solicitação", "Comprovante de tentativa de contato"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 60
  },
  "1426": {
    codigo: "1426",
    grupo: "Autorização",
    descricao: "Não autorizada pela auditoria médica",
    descricaoSimplificada: "Negado pela auditoria",
    argumentoContestacao: "Solicitamos revisão da análise pela auditoria médica, apresentando justificativa clínica detalhada e literatura médica que fundamenta a indicação do procedimento.",
    acoesRecomendadas: [
      "Elaborar parecer médico detalhado",
      "Anexar literatura científica",
      "Solicitar junta médica se necessário"
    ],
    documentosSugeridos: ["Parecer médico", "Artigos científicos", "Protocolos clínicos"],
    dificuldadeReversao: 4,
    probabilidadeSucesso: 45
  },
  "1499": {
    codigo: "1499",
    grupo: "Autorização",
    descricao: "Outros motivos de autorização",
    descricaoSimplificada: "Outros (autorização)",
    argumentoContestacao: "Solicitamos especificação do motivo da glosa relacionada à autorização para apresentação de documentação adequada.",
    acoesRecomendadas: [
      "Solicitar detalhamento do motivo",
      "Verificar processo de autorização"
    ],
    documentosSugeridos: ["Documentação de autorização"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 50
  },

  // ============================================
  // DIAGNÓSTICO (1502-1599)
  // ============================================
  "1508": {
    codigo: "1508",
    grupo: "Diagnóstico",
    descricao: "Código CID não Informado",
    descricaoSimplificada: "CID não informado",
    argumentoContestacao: "O CID do diagnóstico é [CID]. Segue guia corrigida com a informação.",
    acoesRecomendadas: [
      "Incluir CID na guia",
      "Verificar CID correto com o médico",
      "Reapresentar guia completa"
    ],
    documentosSugeridos: ["Guia com CID preenchido", "Relatório médico"],
    dificuldadeReversao: 1,
    probabilidadeSucesso: 95
  },
  "1509": {
    codigo: "1509",
    grupo: "Diagnóstico",
    descricao: "Código CID inválido",
    descricaoSimplificada: "CID inválido",
    argumentoContestacao: "O CID informado está correto conforme CID-10 vigente. Solicitamos verificação da tabela utilizada pela operadora.",
    acoesRecomendadas: [
      "Verificar CID na tabela CID-10",
      "Corrigir se necessário",
      "Reapresentar com CID válido"
    ],
    documentosSugeridos: ["Tabela CID-10", "Guia corrigida"],
    dificuldadeReversao: 1,
    probabilidadeSucesso: 90
  },
  "1599": {
    codigo: "1599",
    grupo: "Diagnóstico",
    descricao: "Outros motivos de diagnóstico",
    descricaoSimplificada: "Outros (diagnóstico)",
    argumentoContestacao: "Solicitamos especificação do motivo da glosa relacionada ao diagnóstico para apresentação de documentação adequada.",
    acoesRecomendadas: [
      "Solicitar detalhamento do motivo",
      "Verificar informações de diagnóstico"
    ],
    documentosSugeridos: ["Relatório médico com diagnóstico"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 50
  },

  // ============================================
  // ATENDIMENTO (1601-1699)
  // ============================================
  "1601": {
    codigo: "1601",
    grupo: "Atendimento",
    descricao: "Reincidência no atendimento",
    descricaoSimplificada: "Atendimento duplicado",
    argumentoContestacao: "Os atendimentos são distintos, realizados em datas/horários diferentes ou por motivos clínicos diversos. Não há duplicidade.",
    acoesRecomendadas: [
      "Demonstrar diferenças entre os atendimentos",
      "Apresentar justificativa para cada atendimento",
      "Anexar evolução clínica"
    ],
    documentosSugeridos: ["Prontuário com evolução", "Justificativa médica"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 70
  },
  "1613": {
    codigo: "1613",
    grupo: "Atendimento",
    descricao: "Consulta não autorizada",
    descricaoSimplificada: "Consulta não autorizada",
    argumentoContestacao: "A consulta não requer autorização prévia conforme contrato e normas da ANS. Consultas eletivas em rede credenciada têm livre acesso.",
    acoesRecomendadas: [
      "Verificar regras de autorização para consultas",
      "Confirmar se prestador está credenciado",
      "Citar normas da ANS sobre acesso"
    ],
    documentosSugeridos: ["Contrato do plano", "Comprovante de credenciamento"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 80
  },
  "1699": {
    codigo: "1699",
    grupo: "Atendimento",
    descricao: "Outros motivos de atendimento",
    descricaoSimplificada: "Outros (atendimento)",
    argumentoContestacao: "Solicitamos especificação do motivo da glosa relacionada ao atendimento para apresentação de documentação adequada.",
    acoesRecomendadas: [
      "Solicitar detalhamento do motivo",
      "Verificar registro do atendimento"
    ],
    documentosSugeridos: ["Registro completo do atendimento"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 50
  },

  // ============================================
  // REGRA DE VALORIZAÇÃO (1701-1799)
  // ============================================
  "1701": {
    codigo: "1701",
    grupo: "Valorização",
    descricao: "Cobrança fora do prazo de validade",
    descricaoSimplificada: "Cobrança fora do prazo",
    argumentoContestacao: "A cobrança foi apresentada dentro do prazo contratual. Solicitamos verificação das datas de apresentação e dos prazos estabelecidos.",
    acoesRecomendadas: [
      "Verificar prazo contratual para apresentação",
      "Confirmar data de protocolo",
      "Justificar atraso se houver"
    ],
    documentosSugeridos: ["Protocolo de apresentação", "Contrato com prazos"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 60
  },
  "1702": {
    codigo: "1702",
    grupo: "Valorização",
    descricao: "Cobrança de procedimento em duplicidade",
    descricaoSimplificada: "Cobrança duplicada",
    argumentoContestacao: "Não há duplicidade de cobrança. Os procedimentos foram realizados em momentos distintos ou são procedimentos diferentes que foram corretamente cobrados.",
    acoesRecomendadas: [
      "Verificar histórico de cobranças",
      "Demonstrar diferenças entre procedimentos",
      "Anexar documentação comprobatória"
    ],
    documentosSugeridos: ["Histórico de guias", "Relatório de procedimentos"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 75
  },
  "1704": {
    codigo: "1704",
    grupo: "Valorização",
    descricao: "Valor cobrado superior ao acordado em pacote",
    descricaoSimplificada: "Valor acima do pacote",
    argumentoContestacao: "O valor cobrado está de acordo com a tabela contratual. Caso haja pacote específico, solicitamos esclarecimento sobre os itens inclusos.",
    acoesRecomendadas: [
      "Verificar tabela de preços contratada",
      "Identificar composição do pacote",
      "Justificar itens extras se houver"
    ],
    documentosSugeridos: ["Tabela de preços", "Contrato com valores"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 60
  },
  "1705": {
    codigo: "1705",
    grupo: "Valorização",
    descricao: "Valor apresentado a maior",
    descricaoSimplificada: "Valor cobrado a maior",
    argumentoContestacao: "O valor cobrado está correto conforme tabela contratual vigente. Solicitamos indicação do valor que a operadora considera correto para verificação.",
    acoesRecomendadas: [
      "Verificar tabela de preços atualizada",
      "Comparar com valores contratuais",
      "Solicitar demonstrativo de cálculo"
    ],
    documentosSugeridos: ["Tabela de preços", "Contrato vigente"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 70
  },
  "1707": {
    codigo: "1707",
    grupo: "Valorização",
    descricao: "Não existe informação sobre a tabela que será utilizada na Valoração. Verifique o Contrato do Prestador",
    descricaoSimplificada: "Tabela de preços não definida",
    argumentoContestacao: "A tabela de preços aplicável é [TABELA] conforme contrato de credenciamento. Solicitamos atualização do cadastro da operadora.",
    acoesRecomendadas: [
      "Verificar tabela definida em contrato",
      "Enviar cópia do contrato",
      "Solicitar atualização cadastral"
    ],
    documentosSugeridos: ["Contrato com tabela definida", "Aditivo contratual"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 75
  },
  "1711": {
    codigo: "1711",
    grupo: "Valorização",
    descricao: "Procedimento pertence a um pacote acordado e já cobrado",
    descricaoSimplificada: "Incluso no pacote",
    argumentoContestacao: "O procedimento não está incluso no pacote contratado ou foi realizado em circunstância que justifica cobrança separada. Segue detalhamento.",
    acoesRecomendadas: [
      "Verificar composição do pacote",
      "Justificar cobrança separada",
      "Anexar contrato com definição do pacote"
    ],
    documentosSugeridos: ["Contrato com pacotes", "Justificativa para cobrança extra"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 55
  },
  "1714": {
    codigo: "1714",
    grupo: "Valorização",
    descricao: "Valor do serviço superior ao valor de tabela",
    descricaoSimplificada: "Valor acima da tabela",
    argumentoContestacao: "O valor cobrado está de acordo com a tabela contratual. Caso haja divergência, solicitamos indicação da tabela e valores considerados pela operadora.",
    acoesRecomendadas: [
      "Verificar tabela contratual",
      "Comparar valores",
      "Solicitar demonstrativo"
    ],
    documentosSugeridos: ["Tabela de preços contratada"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 70
  },
  "1799": {
    codigo: "1799",
    grupo: "Valorização",
    descricao: "Outros motivos de valorização",
    descricaoSimplificada: "Outros (valorização)",
    argumentoContestacao: "Solicitamos especificação do motivo da glosa relacionada à valorização para apresentação de documentação adequada.",
    acoesRecomendadas: [
      "Solicitar detalhamento do motivo",
      "Verificar valores cobrados"
    ],
    documentosSugeridos: ["Demonstrativo de valores"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 50
  },

  // ============================================
  // PROCEDIMENTO (1801-1899)
  // ============================================
  "1801": {
    codigo: "1801",
    grupo: "Procedimento",
    descricao: "Procedimento inválido",
    descricaoSimplificada: "Procedimento inválido",
    argumentoContestacao: "O código do procedimento está correto conforme tabela TUSS/CBHPM vigente. Solicitamos verificação da tabela utilizada.",
    acoesRecomendadas: [
      "Verificar código na tabela TUSS",
      "Confirmar vigência do código",
      "Corrigir se necessário"
    ],
    documentosSugeridos: ["Tabela TUSS atualizada", "Guia corrigida"],
    dificuldadeReversao: 1,
    probabilidadeSucesso: 85
  },
  "1807": {
    codigo: "1807",
    grupo: "Procedimento",
    descricao: "Procedimentos médicos duplicados",
    descricaoSimplificada: "Procedimento duplicado",
    argumentoContestacao: "Os procedimentos não são duplicados. Foram realizados em momentos distintos, em locais anatômicos diferentes ou por indicações clínicas diversas.",
    acoesRecomendadas: [
      "Demonstrar diferenças entre procedimentos",
      "Justificar cada procedimento",
      "Anexar relatório médico"
    ],
    documentosSugeridos: ["Relatório médico detalhado", "Descrição cirúrgica"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 70
  },
  "1808": {
    codigo: "1808",
    grupo: "Procedimento",
    descricao: "Procedimento não conforme com o CID",
    descricaoSimplificada: "Incompatível com CID",
    argumentoContestacao: "O procedimento é compatível com o diagnóstico (CID) informado. A indicação clínica está fundamentada no relatório médico anexo.",
    acoesRecomendadas: [
      "Verificar compatibilidade CID x procedimento",
      "Elaborar justificativa médica",
      "Anexar literatura se necessário"
    ],
    documentosSugeridos: ["Justificativa médica", "Literatura científica"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 65
  },
  "1809": {
    codigo: "1809",
    grupo: "Procedimento",
    descricao: "Cobrança de procedimento não executado",
    descricaoSimplificada: "Procedimento não executado",
    argumentoContestacao: "O procedimento foi devidamente executado conforme registro em prontuário e descrição técnica. Segue documentação comprobatória.",
    acoesRecomendadas: [
      "Anexar registro de execução",
      "Incluir descrição do procedimento",
      "Apresentar laudo/resultado"
    ],
    documentosSugeridos: ["Descrição do procedimento", "Laudo/resultado", "Prontuário"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 80
  },
  "1813": {
    codigo: "1813",
    grupo: "Procedimento",
    descricao: "Cobrança de procedimento sem justificativa para realização ou com justificativa insuficiente",
    descricaoSimplificada: "Justificativa insuficiente",
    argumentoContestacao: "Segue justificativa médica detalhada para a realização do procedimento, fundamentada em critérios clínicos e protocolos médicos.",
    acoesRecomendadas: [
      "Elaborar justificativa médica completa",
      "Citar protocolos e diretrizes",
      "Anexar exames que fundamentam"
    ],
    documentosSugeridos: ["Justificativa médica detalhada", "Exames complementares", "Protocolos clínicos"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 65
  },
  "1815": {
    codigo: "1815",
    grupo: "Procedimento",
    descricao: "Procedimento não autorizado",
    descricaoSimplificada: "Procedimento não autorizado",
    argumentoContestacao: "O procedimento foi autorizado (senha: [SENHA]) ou foi realizado em caráter de urgência/emergência, dispensando autorização prévia.",
    acoesRecomendadas: [
      "Localizar autorização",
      "Caracterizar urgência se aplicável",
      "Solicitar autorização retroativa"
    ],
    documentosSugeridos: ["Autorização", "Relatório de urgência"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 60
  },
  "1817": {
    codigo: "1817",
    grupo: "Procedimento",
    descricao: "Cobrança de procedimento incluso no procedimento principal",
    descricaoSimplificada: "Incluso no procedimento principal",
    argumentoContestacao: "O procedimento não está incluso no procedimento principal conforme regras da CBHPM/TUSS. São procedimentos distintos que devem ser remunerados separadamente.",
    acoesRecomendadas: [
      "Verificar regras de inclusão CBHPM",
      "Demonstrar que são procedimentos distintos",
      "Citar normas técnicas"
    ],
    documentosSugeridos: ["Regras CBHPM", "Parecer técnico"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 55
  },
  "1820": {
    codigo: "1820",
    grupo: "Procedimento",
    descricao: "Cobrança de procedimento em quantidade acima da máxima permitida / autorizada",
    descricaoSimplificada: "Quantidade acima do permitido",
    argumentoContestacao: "A quantidade realizada foi clinicamente necessária. Segue justificativa médica detalhando a indicação para cada procedimento.",
    acoesRecomendadas: [
      "Justificar necessidade clínica",
      "Solicitar autorização complementar",
      "Anexar evolução do paciente"
    ],
    documentosSugeridos: ["Justificativa médica", "Evolução clínica"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 60
  },
  "1822": {
    codigo: "1822",
    grupo: "Procedimento",
    descricao: "Cobrança de procedimento com ausência de resultado ou laudo técnico",
    descricaoSimplificada: "Falta laudo/resultado",
    argumentoContestacao: "Segue laudo/resultado do procedimento realizado, conforme solicitado.",
    acoesRecomendadas: [
      "Anexar laudo do exame",
      "Incluir resultado do procedimento",
      "Reapresentar com documentação completa"
    ],
    documentosSugeridos: ["Laudo do exame", "Resultado do procedimento"],
    dificuldadeReversao: 1,
    probabilidadeSucesso: 90
  },
  "1823": {
    codigo: "1823",
    grupo: "Procedimento",
    descricao: "Procedimento realizado pelo mesmo profissional, na mesma especialidade, no prazo inferior ao estipulado sem justificativa adequada",
    descricaoSimplificada: "Intervalo mínimo não respeitado",
    argumentoContestacao: "O novo procedimento foi necessário devido a [MOTIVO CLÍNICO]. A condição do paciente exigiu reavaliação/novo procedimento antes do prazo habitual.",
    acoesRecomendadas: [
      "Justificar necessidade clínica",
      "Demonstrar evolução do quadro",
      "Anexar prontuário com evolução"
    ],
    documentosSugeridos: ["Justificativa médica", "Evolução clínica", "Exames comparativos"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 60
  },
  "1899": {
    codigo: "1899",
    grupo: "Procedimento",
    descricao: "Outros motivos de procedimento",
    descricaoSimplificada: "Outros (procedimento)",
    argumentoContestacao: "Solicitamos especificação do motivo da glosa relacionada ao procedimento para apresentação de documentação adequada.",
    acoesRecomendadas: [
      "Solicitar detalhamento do motivo",
      "Verificar documentação do procedimento"
    ],
    documentosSugeridos: ["Documentação completa do procedimento"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 50
  },

  // ============================================
  // DIÁRIA (1901-1999)
  // ============================================
  "1902": {
    codigo: "1902",
    grupo: "Diária",
    descricao: "Permanência hospitalar incompatível com a evolução clínica",
    descricaoSimplificada: "Permanência incompatível",
    argumentoContestacao: "A permanência hospitalar foi necessária conforme evolução clínica do paciente. Segue relatório médico detalhando a necessidade de cada dia de internação.",
    acoesRecomendadas: [
      "Elaborar relatório de evolução diária",
      "Justificar cada dia de internação",
      "Anexar exames e intercorrências"
    ],
    documentosSugeridos: ["Evolução clínica diária", "Relatório de alta", "Exames realizados"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 60
  },
  "1906": {
    codigo: "1906",
    grupo: "Diária",
    descricao: "Quantidade UTI não prevista para procedimento",
    descricaoSimplificada: "UTI não prevista",
    argumentoContestacao: "A internação em UTI foi necessária devido a [MOTIVO CLÍNICO]. O paciente apresentou condição que exigiu cuidados intensivos.",
    acoesRecomendadas: [
      "Justificar necessidade de UTI",
      "Anexar critérios de admissão em UTI",
      "Demonstrar gravidade do quadro"
    ],
    documentosSugeridos: ["Justificativa para UTI", "Evolução em UTI", "Scores de gravidade"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 65
  },
  "1999": {
    codigo: "1999",
    grupo: "Diária",
    descricao: "Outros motivos de diária",
    descricaoSimplificada: "Outros (diária)",
    argumentoContestacao: "Solicitamos especificação do motivo da glosa relacionada à diária para apresentação de documentação adequada.",
    acoesRecomendadas: [
      "Solicitar detalhamento do motivo",
      "Verificar registro de diárias"
    ],
    documentosSugeridos: ["Mapa de internação"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 50
  },

  // ============================================
  // MATERIAL (2001-2099)
  // ============================================
  "2001": {
    codigo: "2001",
    grupo: "Material",
    descricao: "Material inválido",
    descricaoSimplificada: "Material inválido",
    argumentoContestacao: "O código do material está correto conforme tabela TUSS/Brasíndice vigente. Solicitamos verificação da tabela utilizada.",
    acoesRecomendadas: [
      "Verificar código na tabela",
      "Confirmar descrição do material",
      "Corrigir se necessário"
    ],
    documentosSugeridos: ["Tabela de materiais", "Nota fiscal do material"],
    dificuldadeReversao: 1,
    probabilidadeSucesso: 85
  },
  "2004": {
    codigo: "2004",
    grupo: "Material",
    descricao: "Material sem nota fiscal do fornecedor",
    descricaoSimplificada: "Falta nota fiscal",
    argumentoContestacao: "Segue nota fiscal do material utilizado, conforme solicitado.",
    acoesRecomendadas: [
      "Anexar nota fiscal",
      "Verificar dados da nota",
      "Reapresentar com documentação"
    ],
    documentosSugeridos: ["Nota fiscal do material"],
    dificuldadeReversao: 1,
    probabilidadeSucesso: 95
  },
  "2008": {
    codigo: "2008",
    grupo: "Material",
    descricao: "Cobrança de material em quantidades incompatíveis com o procedimento realizado",
    descricaoSimplificada: "Quantidade incompatível com procedimento",
    argumentoContestacao: "A quantidade de material utilizada foi necessária para o procedimento realizado. Segue justificativa técnica detalhando o consumo.",
    acoesRecomendadas: [
      "Justificar quantidade utilizada",
      "Anexar descrição do procedimento",
      "Demonstrar necessidade técnica"
    ],
    documentosSugeridos: ["Descrição do procedimento", "Justificativa técnica"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 70
  },
  "2011": {
    codigo: "2011",
    grupo: "Material",
    descricao: "Cobrança de material incluso no pacote negociado",
    descricaoSimplificada: "Material incluso no pacote",
    argumentoContestacao: "O material não está incluso no pacote contratado ou foi utilizado em quantidade/especificação além do previsto no pacote.",
    acoesRecomendadas: [
      "Verificar composição do pacote",
      "Justificar uso extra",
      "Anexar contrato com pacotes"
    ],
    documentosSugeridos: ["Contrato com pacotes", "Justificativa para material extra"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 55
  },
  "2099": {
    codigo: "2099",
    grupo: "Material",
    descricao: "Outros motivos de material",
    descricaoSimplificada: "Outros (material)",
    argumentoContestacao: "Solicitamos especificação do motivo da glosa relacionada ao material para apresentação de documentação adequada.",
    acoesRecomendadas: [
      "Solicitar detalhamento do motivo",
      "Verificar documentação do material"
    ],
    documentosSugeridos: ["Documentação do material"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 50
  },

  // ============================================
  // MEDICAMENTO (2101-2199)
  // ============================================
  "2101": {
    codigo: "2101",
    grupo: "Medicamento",
    descricao: "Medicamento inválido",
    descricaoSimplificada: "Medicamento inválido",
    argumentoContestacao: "O código do medicamento está correto conforme tabela Brasíndice/Simpro vigente. Solicitamos verificação da tabela utilizada.",
    acoesRecomendadas: [
      "Verificar código na tabela",
      "Confirmar apresentação do medicamento",
      "Corrigir se necessário"
    ],
    documentosSugeridos: ["Tabela de medicamentos", "Nota fiscal"],
    dificuldadeReversao: 1,
    probabilidadeSucesso: 85
  },
  "2104": {
    codigo: "2104",
    grupo: "Medicamento",
    descricao: "Medicamento sem nota fiscal do fornecedor",
    descricaoSimplificada: "Falta nota fiscal",
    argumentoContestacao: "Segue nota fiscal do medicamento utilizado, conforme solicitado.",
    acoesRecomendadas: [
      "Anexar nota fiscal",
      "Verificar dados da nota",
      "Reapresentar com documentação"
    ],
    documentosSugeridos: ["Nota fiscal do medicamento"],
    dificuldadeReversao: 1,
    probabilidadeSucesso: 95
  },
  "2108": {
    codigo: "2108",
    grupo: "Medicamento",
    descricao: "Cobrança de medicamento em quantidades incompatíveis com o procedimento realizado",
    descricaoSimplificada: "Quantidade incompatível com procedimento",
    argumentoContestacao: "A quantidade de medicamento utilizada foi necessária conforme prescrição médica e protocolo de tratamento. Segue justificativa.",
    acoesRecomendadas: [
      "Anexar prescrição médica",
      "Justificar posologia utilizada",
      "Demonstrar necessidade clínica"
    ],
    documentosSugeridos: ["Prescrição médica", "Protocolo de tratamento", "Evolução clínica"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 70
  },
  "2111": {
    codigo: "2111",
    grupo: "Medicamento",
    descricao: "Cobrança de medicamento incluso no pacote negociado",
    descricaoSimplificada: "Medicamento incluso no pacote",
    argumentoContestacao: "O medicamento não está incluso no pacote contratado ou foi utilizado em quantidade além do previsto no pacote.",
    acoesRecomendadas: [
      "Verificar composição do pacote",
      "Justificar uso extra",
      "Anexar contrato com pacotes"
    ],
    documentosSugeridos: ["Contrato com pacotes", "Justificativa para medicamento extra"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 55
  },
  "2112": {
    codigo: "2112",
    grupo: "Medicamento",
    descricao: "Cobrança de medicamento incompatível com o relatório técnico",
    descricaoSimplificada: "Incompatível com relatório",
    argumentoContestacao: "O medicamento é compatível com o tratamento descrito no relatório técnico. A indicação está fundamentada na prescrição médica.",
    acoesRecomendadas: [
      "Revisar relatório técnico",
      "Justificar uso do medicamento",
      "Anexar prescrição médica"
    ],
    documentosSugeridos: ["Prescrição médica", "Justificativa clínica", "Bula do medicamento"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 70
  },
  "2114": {
    codigo: "2114",
    grupo: "Medicamento",
    descricao: "Cobrança de medicamento não autorizado",
    descricaoSimplificada: "Medicamento não autorizado",
    argumentoContestacao: "O medicamento foi prescrito pelo médico assistente e é necessário para o tratamento. Segue justificativa clínica e solicitação de autorização retroativa.",
    acoesRecomendadas: [
      "Elaborar justificativa médica",
      "Solicitar autorização retroativa",
      "Anexar prescrição e evolução"
    ],
    documentosSugeridos: ["Prescrição médica", "Justificativa clínica", "Evolução do paciente"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 60
  },
  "2199": {
    codigo: "2199",
    grupo: "Medicamento",
    descricao: "Outros motivos de medicamento",
    descricaoSimplificada: "Outros (medicamento)",
    argumentoContestacao: "Solicitamos especificação do motivo da glosa relacionada ao medicamento para apresentação de documentação adequada.",
    acoesRecomendadas: [
      "Solicitar detalhamento do motivo",
      "Verificar documentação do medicamento"
    ],
    documentosSugeridos: ["Documentação do medicamento"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 50
  },

  // ============================================
  // OPM - ÓRTESE, PRÓTESE E MATERIAIS ESPECIAIS (2201-2299)
  // ============================================
  "2202": {
    codigo: "2202",
    grupo: "OPM",
    descricao: "OPM sem cobertura para atendimento ambulatorial",
    descricaoSimplificada: "OPM sem cobertura ambulatorial",
    argumentoContestacao: "A OPM utilizada tem cobertura obrigatória conforme Rol da ANS. Solicitamos revisão da análise.",
    acoesRecomendadas: [
      "Verificar cobertura no Rol da ANS",
      "Fundamentar com resolução normativa",
      "Anexar justificativa médica"
    ],
    documentosSugeridos: ["Rol da ANS", "Justificativa médica"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 65
  },
  "2203": {
    codigo: "2203",
    grupo: "OPM",
    descricao: "OPM sem nota fiscal do prestador",
    descricaoSimplificada: "Falta nota fiscal",
    argumentoContestacao: "Segue nota fiscal da OPM utilizada, conforme solicitado.",
    acoesRecomendadas: [
      "Anexar nota fiscal",
      "Incluir registro ANVISA",
      "Reapresentar com documentação"
    ],
    documentosSugeridos: ["Nota fiscal", "Registro ANVISA", "Etiqueta de rastreabilidade"],
    dificuldadeReversao: 1,
    probabilidadeSucesso: 95
  },
  "2206": {
    codigo: "2206",
    grupo: "OPM",
    descricao: "OPM informado não autorizado",
    descricaoSimplificada: "OPM não autorizado",
    argumentoContestacao: "A OPM foi indicada pelo médico e é necessária para o tratamento. Segue justificativa clínica e solicitação de autorização retroativa.",
    acoesRecomendadas: [
      "Elaborar justificativa médica",
      "Solicitar autorização retroativa",
      "Anexar laudo técnico"
    ],
    documentosSugeridos: ["Justificativa médica", "Laudo técnico", "Relatório cirúrgico"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 60
  },
  "2209": {
    codigo: "2209",
    grupo: "OPM",
    descricao: "Cobrança de OPM em desacordo com relatório técnico",
    descricaoSimplificada: "Incompatível com relatório",
    argumentoContestacao: "A OPM utilizada está de acordo com o relatório técnico e indicação cirúrgica. Segue documentação comprobatória.",
    acoesRecomendadas: [
      "Revisar relatório técnico",
      "Justificar uso da OPM",
      "Anexar descrição cirúrgica"
    ],
    documentosSugeridos: ["Relatório técnico", "Descrição cirúrgica", "Justificativa médica"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 70
  },
  "2210": {
    codigo: "2210",
    grupo: "OPM",
    descricao: "Cobrança de OPM em quantidade incompatível com o procedimento realizado",
    descricaoSimplificada: "Quantidade incompatível",
    argumentoContestacao: "A quantidade de OPM utilizada foi necessária para o procedimento. Segue justificativa técnica.",
    acoesRecomendadas: [
      "Justificar quantidade utilizada",
      "Anexar descrição do procedimento",
      "Demonstrar necessidade técnica"
    ],
    documentosSugeridos: ["Descrição cirúrgica", "Justificativa técnica"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 70
  },
  "2299": {
    codigo: "2299",
    grupo: "OPM",
    descricao: "Outros motivos de OPM",
    descricaoSimplificada: "Outros (OPM)",
    argumentoContestacao: "Solicitamos especificação do motivo da glosa relacionada à OPM para apresentação de documentação adequada.",
    acoesRecomendadas: [
      "Solicitar detalhamento do motivo",
      "Verificar documentação da OPM"
    ],
    documentosSugeridos: ["Documentação da OPM"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 50
  },

  // ============================================
  // TAXAS E SERVIÇOS (2301-2399)
  // ============================================
  "2301": {
    codigo: "2301",
    grupo: "Taxas",
    descricao: "Taxa inválida",
    descricaoSimplificada: "Taxa inválida",
    argumentoContestacao: "O código da taxa está correto conforme tabela contratual. Solicitamos verificação.",
    acoesRecomendadas: [
      "Verificar código na tabela",
      "Confirmar taxa cobrada",
      "Corrigir se necessário"
    ],
    documentosSugeridos: ["Tabela de taxas"],
    dificuldadeReversao: 1,
    probabilidadeSucesso: 85
  },
  "2309": {
    codigo: "2309",
    grupo: "Taxas",
    descricao: "Cobrança de taxa inclusa no pacote negociado",
    descricaoSimplificada: "Taxa inclusa no pacote",
    argumentoContestacao: "A taxa não está inclusa no pacote contratado ou foi cobrada por serviço adicional não previsto no pacote.",
    acoesRecomendadas: [
      "Verificar composição do pacote",
      "Justificar taxa extra",
      "Anexar contrato"
    ],
    documentosSugeridos: ["Contrato com pacotes"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 55
  },
  "2399": {
    codigo: "2399",
    grupo: "Taxas",
    descricao: "Outros motivos de taxa",
    descricaoSimplificada: "Outros (taxa)",
    argumentoContestacao: "Solicitamos especificação do motivo da glosa relacionada à taxa para apresentação de documentação adequada.",
    acoesRecomendadas: [
      "Solicitar detalhamento do motivo"
    ],
    documentosSugeridos: ["Documentação da taxa"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 50
  },

  // ============================================
  // GASES MEDICINAIS (2401-2499)
  // ============================================
  "2408": {
    codigo: "2408",
    grupo: "Gases",
    descricao: "Cobrança de gás medicinal em quantidades incompatíveis com o procedimento realizado",
    descricaoSimplificada: "Quantidade incompatível com procedimento",
    argumentoContestacao: "A quantidade de gás medicinal utilizada foi necessária conforme protocolo de tratamento e tempo de procedimento.",
    acoesRecomendadas: [
      "Justificar consumo",
      "Anexar tempo de procedimento",
      "Demonstrar necessidade"
    ],
    documentosSugeridos: ["Ficha de anestesia", "Registro de consumo"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 70
  },
  "2421": {
    codigo: "2421",
    grupo: "Gases",
    descricao: "Gás medicinal não compatível com o procedimento",
    descricaoSimplificada: "Gás incompatível com procedimento",
    argumentoContestacao: "O gás medicinal utilizado é compatível com o procedimento realizado conforme protocolo anestésico/terapêutico.",
    acoesRecomendadas: [
      "Justificar uso do gás",
      "Anexar protocolo anestésico",
      "Demonstrar indicação"
    ],
    documentosSugeridos: ["Ficha de anestesia", "Protocolo de tratamento"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 70
  },
  "2499": {
    codigo: "2499",
    grupo: "Gases",
    descricao: "Outros motivos de gás medicinal",
    descricaoSimplificada: "Outros (gás medicinal)",
    argumentoContestacao: "Solicitamos especificação do motivo da glosa relacionada ao gás medicinal para apresentação de documentação adequada.",
    acoesRecomendadas: [
      "Solicitar detalhamento do motivo"
    ],
    documentosSugeridos: ["Documentação de gases"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 50
  },

  // ============================================
  // ALUGUEIS (2501-2599)
  // ============================================
  "2507": {
    codigo: "2507",
    grupo: "Alugueis",
    descricao: "Cobrança de aluguel em quantidades incompatíveis com o procedimento realizado",
    descricaoSimplificada: "Quantidade incompatível com procedimento",
    argumentoContestacao: "O período de aluguel do equipamento foi necessário para o tratamento do paciente conforme prescrição médica.",
    acoesRecomendadas: [
      "Justificar período de uso",
      "Anexar prescrição",
      "Demonstrar necessidade"
    ],
    documentosSugeridos: ["Prescrição médica", "Registro de uso do equipamento"],
    dificuldadeReversao: 2,
    probabilidadeSucesso: 70
  },
  "2599": {
    codigo: "2599",
    grupo: "Alugueis",
    descricao: "Outros motivos de aluguel",
    descricaoSimplificada: "Outros (aluguel)",
    argumentoContestacao: "Solicitamos especificação do motivo da glosa relacionada ao aluguel para apresentação de documentação adequada.",
    acoesRecomendadas: [
      "Solicitar detalhamento do motivo"
    ],
    documentosSugeridos: ["Documentação de aluguel"],
    dificuldadeReversao: 3,
    probabilidadeSucesso: 50
  },
};

/**
 * Traduz um código de glosa para sua descrição simplificada
 * @param codigo - Código da glosa (ex: "2108")
 * @returns Descrição simplificada ou o código original se não encontrado
 */
export function traduzirCodigoGlosa(codigo: string): string {
  const glosa = GLOSAS_TISS[codigo];
  if (glosa) {
    return glosa.descricaoSimplificada;
  }
  return `Código ${codigo}`;
}

/**
 * Traduz um código de glosa para sua descrição completa
 * @param codigo - Código da glosa (ex: "2108")
 * @returns Descrição completa ou o código original se não encontrado
 */
export function traduzirCodigoGlosaCompleto(codigo: string): string {
  const glosa = GLOSAS_TISS[codigo];
  if (glosa) {
    return glosa.descricao;
  }
  return `Código ${codigo}`;
}

/**
 * Obtém informações completas de uma glosa incluindo sugestões de contestação
 * @param codigo - Código da glosa
 * @returns Objeto GlosaInfo completo ou undefined se não encontrado
 */
export function obterInfoGlosa(codigo: string): GlosaInfo | undefined {
  return GLOSAS_TISS[codigo];
}

/**
 * Obtém sugestão de argumento para contestação
 * @param codigo - Código da glosa
 * @returns Argumento sugerido ou mensagem padrão
 */
export function obterArgumentoContestacao(codigo: string): string {
  const glosa = GLOSAS_TISS[codigo];
  if (glosa?.argumentoContestacao) {
    return glosa.argumentoContestacao;
  }
  return "Solicitamos revisão da glosa apresentando a documentação comprobatória do atendimento realizado.";
}

/**
 * Obtém ações recomendadas para contestação
 * @param codigo - Código da glosa
 * @returns Lista de ações recomendadas
 */
export function obterAcoesRecomendadas(codigo: string): string[] {
  const glosa = GLOSAS_TISS[codigo];
  if (glosa?.acoesRecomendadas) {
    return glosa.acoesRecomendadas;
  }
  return ["Verificar documentação do atendimento", "Elaborar justificativa", "Reapresentar com documentação completa"];
}

/**
 * Obtém documentos sugeridos para contestação
 * @param codigo - Código da glosa
 * @returns Lista de documentos sugeridos
 */
export function obterDocumentosSugeridos(codigo: string): string[] {
  const glosa = GLOSAS_TISS[codigo];
  if (glosa?.documentosSugeridos) {
    return glosa.documentosSugeridos;
  }
  return ["Documentação do atendimento"];
}

/**
 * Traduz uma string de motivo de glosa que pode conter múltiplos códigos
 * Formato esperado: "Código: 2108" ou "2108: descrição" ou apenas "2108"
 * @param motivoGlosa - String com o(s) motivo(s) de glosa
 * @returns String com as descrições traduzidas
 */
export function traduzirMotivoGlosa(motivoGlosa: string): string {
  if (!motivoGlosa) return "";
  
  // Padrão para encontrar códigos de glosa (4 dígitos)
  const codigoPattern = /\b(\d{4})\b/g;
  const codigos = motivoGlosa.match(codigoPattern);
  
  if (!codigos || codigos.length === 0) {
    return motivoGlosa;
  }
  
  // Traduzir cada código encontrado
  const traducoes = codigos.map(codigo => {
    const glosa = GLOSAS_TISS[codigo];
    if (glosa) {
      return `${codigo}: ${glosa.descricaoSimplificada}`;
    }
    return `${codigo}: Código não catalogado`;
  });
  
  return traducoes.join("; ");
}

/**
 * Lista todos os grupos de glosa disponíveis
 */
export function listarGruposGlosa(): string[] {
  const grupos = new Set<string>();
  Object.values(GLOSAS_TISS).forEach(glosa => grupos.add(glosa.grupo));
  return Array.from(grupos).sort();
}

/**
 * Lista todas as glosas de um grupo específico
 */
export function listarGlosasPorGrupo(grupo: string): GlosaInfo[] {
  return Object.values(GLOSAS_TISS)
    .filter(glosa => glosa.grupo === grupo)
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/**
 * Busca glosas por texto (código, descrição ou argumento)
 */
export function buscarGlosas(termo: string): GlosaInfo[] {
  const termoLower = termo.toLowerCase();
  return Object.values(GLOSAS_TISS)
    .filter(glosa => 
      glosa.codigo.includes(termo) ||
      glosa.descricao.toLowerCase().includes(termoLower) ||
      glosa.descricaoSimplificada.toLowerCase().includes(termoLower) ||
      (glosa.argumentoContestacao?.toLowerCase().includes(termoLower))
    )
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/**
 * Obtém estatísticas de probabilidade de sucesso por grupo
 */
export function obterEstatisticasPorGrupo(): Record<string, { total: number; mediaSuccesso: number }> {
  const stats: Record<string, { total: number; somaSuccesso: number }> = {};
  
  Object.values(GLOSAS_TISS).forEach(glosa => {
    if (!stats[glosa.grupo]) {
      stats[glosa.grupo] = { total: 0, somaSuccesso: 0 };
    }
    stats[glosa.grupo].total++;
    if (glosa.probabilidadeSucesso) {
      stats[glosa.grupo].somaSuccesso += glosa.probabilidadeSucesso;
    }
  });
  
  const result: Record<string, { total: number; mediaSuccesso: number }> = {};
  Object.entries(stats).forEach(([grupo, data]) => {
    result[grupo] = {
      total: data.total,
      mediaSuccesso: data.total > 0 ? Math.round(data.somaSuccesso / data.total) : 0
    };
  });
  
  return result;
}


export interface MotivoGlosaPersonalizadoRef {
  codigo: string;
  descricao: string;
  descricaoSimplificada?: string | null;
  grupo?: string | null;
}

export interface GlosaPadronizadaDicionario {
  codigo: string;
  descricao: string;
  descricaoSimplificada?: string;
  grupo?: string;
  descricaoOperadora?: string;
  encontradoNoDicionario: boolean;
  textoFormatado: string;
}

/**
 * Extrai o código principal de glosa e resolve a descrição padronizada
 * a partir do Dicionário de Glosas (motivos personalizados do banco + Tabela 38 TISS/ANS),
 * com fallback para a descrição informada em erroTiss/codigoGlosa.
 */
export function resolverGlosaDicionario(
  codigoGlosa?: string | null,
  erroTiss?: string | null,
  motivosPersonalizados?: MotivoGlosaPersonalizadoRef[] | null
): GlosaPadronizadaDicionario | null {
  const rawCodigo = (codigoGlosa ?? "").trim();
  const rawErro = (erroTiss ?? "").trim();

  if (!rawCodigo && !rawErro) {
    return null;
  }

  const extrairCodigo = (valor: string): string => {
    if (!valor) return "";
    const matchInicio = valor.match(/^(\d{3,5})\b/);
    if (matchInicio) return matchInicio[1];
    const matchQualquer = valor.match(/\b(\d{4})\b/);
    if (matchQualquer) return matchQualquer[1];
    const prefixo = valor.split(/[-:]/)[0]?.trim() || "";
    return prefixo.length <= 15 ? prefixo : "";
  };

  const extrairDescricaoBruta = (valor: string, codigoExtraido: string): string => {
    if (!valor) return "";
    const semPrefixo = valor.replace(/^\d{3,5}\s*[-:]\s*/, "").trim();
    if (semPrefixo && semPrefixo !== codigoExtraido) {
      return semPrefixo;
    }
    return valor !== codigoExtraido ? valor : "";
  };

  const codigo =
    extrairCodigo(rawCodigo) ||
    extrairCodigo(rawErro) ||
    rawCodigo ||
    rawErro.split("-")[0]?.trim() ||
    "N/A";
  const descricaoOperadora =
    extrairDescricaoBruta(rawErro, codigo) ||
    extrairDescricaoBruta(rawCodigo, codigo) ||
    undefined;

  // 1. Verificar no dicionário do banco (motivosGlosa personalizados/cadastrados)
  if (motivosPersonalizados && motivosPersonalizados.length > 0 && codigo) {
    const personalizado = motivosPersonalizados.find(
      (m) => String(m.codigo).trim() === codigo
    );
    if (personalizado && personalizado.descricao) {
      const descricao = personalizado.descricao.trim();
      return {
        codigo,
        descricao,
        descricaoSimplificada: personalizado.descricaoSimplificada?.trim() || undefined,
        grupo: personalizado.grupo?.trim() || undefined,
        descricaoOperadora:
          descricaoOperadora && descricaoOperadora.toLowerCase() !== descricao.toLowerCase()
            ? descricaoOperadora
            : undefined,
        encontradoNoDicionario: true,
        textoFormatado: `${codigo} - ${descricao}`,
      };
    }
  }

  // 2. Verificar no dicionário padrão TISS/ANS (GLOSAS_TISS)
  const glosaTiss = codigo ? GLOSAS_TISS[codigo] : undefined;
  if (glosaTiss) {
    return {
      codigo: glosaTiss.codigo,
      descricao: glosaTiss.descricao,
      descricaoSimplificada: glosaTiss.descricaoSimplificada,
      grupo: glosaTiss.grupo,
      descricaoOperadora:
        descricaoOperadora && descricaoOperadora.toLowerCase() !== glosaTiss.descricao.toLowerCase()
          ? descricaoOperadora
          : undefined,
      encontradoNoDicionario: true,
      textoFormatado: `${glosaTiss.codigo} - ${glosaTiss.descricao}`,
    };
  }

  // 3. Fallback quando o código não consta no dicionário
  const descricaoFallback = descricaoOperadora || "Código não catalogado no Dicionário de Glosas";
  return {
    codigo,
    descricao: descricaoFallback,
    descricaoOperadora: undefined,
    encontradoNoDicionario: false,
    textoFormatado: descricaoOperadora ? `${codigo} - ${descricaoOperadora}` : codigo,
  };
}
