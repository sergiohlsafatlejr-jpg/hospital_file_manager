/**
 * Service para geração de XML de recurso de glosa
 * Formato: TISS 3.03.01 - DEMONSTRATIVO_ANALISE_CONTA
 * Baseado no modelo de importação do TASY
 * 
 * IMPORTANTE: O XML gerado contém TODA a guia (itens pagos e glosados),
 * não apenas os itens glosados. Os itens glosados são identificados
 * pelo código de glosa numérico.
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { storagePut } from "./storage";
import * as crypto from "crypto";

// ============================================================
// TIPOS
// ============================================================

interface GuiaCompleta {
  numeroGuia: string;
  numeroGuiaOperadora: string | null;
  senha: string | null;
  pacienteNome: string | null;
  carteiraBeneficiario: string | null;
  dataInicioFat: string | null;
  dataFimFat: string | null;
  itens: ItemGuia[];
  valorInformadoGuia: number;
  valorProcessadoGuia: number;
  valorLiberadoGuia: number;
  valorGlosaGuia: number;
  temGlosa: boolean;
}

interface ItemGuia {
  id: number;
  codigoItem: string;
  descricaoItem: string;
  codigoTabela: string;
  dataExecucao: string | null;
  valorFaturado: number;
  valorPago: number;
  valorGlosa: number;
  quantidade: number;
  statusConciliacao: string;
  codigoGlosa: string | null; // Código numérico da glosa
  motivoGlosa: string | null; // Descrição do motivo da glosa
}

interface DadosPrestador {
  cnpj: string;
  nome: string;
  cnes: string;
  codigoPrestador: string;
}

interface DadosConvenio {
  registroANS: string;
  nome: string;
  cnpj: string;
}

// ============================================================
// MAPEAMENTO DE CÓDIGO DE TABELA
// ============================================================

/**
 * Mapeia tipoItem do faturamento para codigoTabela TISS
 * Baseado no XML modelo do IPASGO:
 * 19 = Material (OPME)
 * 20 = Medicamento
 * 22 = Procedimento
 * 18 = Diária
 * 07 = Taxa
 */
function mapearCodigoTabela(tipoItem: string | null, codigoTabelaOriginal: string | null): string {
  // Se temos o código original do faturamento_tiss, usar mapeamento direto
  if (codigoTabelaOriginal) {
    const mapa: Record<string, string> = {
      '02': '20', // Medicamento -> 20
      '03': '19', // Material -> 19
      '04': '22', // Procedimento -> 22
      '05': '18', // Diária -> 18
      '07': '07', // Taxa -> 07
      '01': '01', // Gás -> 01
    };
    return mapa[codigoTabelaOriginal] || codigoTabelaOriginal;
  }

  // Fallback: mapear pelo tipoItem
  if (!tipoItem) return '22'; // Default: procedimento
  const tipo = tipoItem.toUpperCase();
  if (tipo.includes('MEDICAMENTO') || tipo.includes('MED')) return '20';
  if (tipo.includes('MATERIAL') || tipo.includes('MAT')) return '19';
  if (tipo.includes('DIARIA') || tipo.includes('DIÁRIA')) return '18';
  if (tipo.includes('TAXA')) return '07';
  if (tipo.includes('GAS') || tipo.includes('GÁS')) return '01';
  return '22'; // Procedimento como default
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function escapeXml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatarData(data: string | Date | null): string {
  if (!data) return new Date().toISOString().split('T')[0];
  const d = new Date(data);
  return d.toISOString().split('T')[0];
}

function formatarValor(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '0';
  return Number(valor).toFixed(2);
}

function limparCnpj(cnpj: string | null): string {
  if (!cnpj) return '';
  return cnpj.replace(/[^\d]/g, '');
}

function gerarHashMD5(conteudo: string): string {
  return crypto.createHash('md5').update(conteudo).digest('hex');
}

/**
 * Extrai apenas o código numérico da glosa (remove texto)
 */
function extrairCodigoGlosaNumerico(codigoGlosa: string | null): string | null {
  if (!codigoGlosa) return null;
  // Extrair apenas dígitos
  const numeros = codigoGlosa.replace(/[^\d]/g, '');
  return numeros || null;
}

// ============================================================
// BUSCAR DADOS PARA GERAÇÃO DO XML
// ============================================================

/**
 * Busca TODOS os itens das guias selecionadas na conciliados_automatico
 * (pagos, glosados, divergentes - tudo)
 * e enriquece com dados do faturamento_unificado e faturamento_tiss
 */
async function buscarDadosGuiasCompletas(
  estabelecimentoId: number,
  guias: string[]
): Promise<GuiaCompleta[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const esc = (v: string) => `'${v.replace(/'/g, "''")}'`;
  const guiasStr = guias.map(g => esc(g)).join(',');

  // Buscar TODOS os itens da guia (não apenas glosados)
  const [itensResult] = await db.execute(sql.raw(`
    SELECT 
      ca.id,
      ca.numeroGuia,
      ca.codigoItem,
      ca.descricaoItem,
      ca.tipoItem,
      ca.dataExecucao,
      ca.valorFaturado,
      ca.valorPago,
      ca.valorGlosa,
      ca.quantidade,
      ca.competencia,
      ca.convenio,
      ca.convenioId,
      ca.statusConciliacao,
      ca.codigoGlosa,
      ca.motivoGlosa,
      ca.pacienteNome
    FROM conciliados_automatico ca
    WHERE ca.estabelecimentoId = ${estabelecimentoId}
      AND ca.numeroGuia IN (${guiasStr})
    ORDER BY ca.numeroGuia, ca.dataExecucao, ca.codigoItem
  `));

  const itens = itensResult as any[];
  if (itens.length === 0) return [];

  // Buscar dados complementares do faturamento_unificado (senha, carteirinha, etc.)
  const [fuResult] = await db.execute(sql.raw(`
    SELECT DISTINCT
      fu.numeroGuia,
      fu.numeroGuiaOperadora,
      fu.senha,
      fu.pacienteNome,
      fu.carteiraBeneficiario,
      fu.protocolo,
      fu.lotePrestador,
      MIN(fu.dataExecucao) as dataInicioFat,
      MAX(fu.dataExecucao) as dataFimFat
    FROM faturamento_unificado fu
    WHERE fu.estabelecimentoId = ${estabelecimentoId}
      AND fu.numeroGuia IN (${guiasStr})
    GROUP BY fu.numeroGuia, fu.numeroGuiaOperadora, fu.senha, fu.pacienteNome, fu.carteiraBeneficiario, fu.protocolo, fu.lotePrestador
  `));

  const fuMap = new Map<string, any>();
  for (const fu of fuResult as any[]) {
    fuMap.set(String(fu.numeroGuia), fu);
  }

  // Buscar codigo_tabela do faturamento_tiss original
  const [ftResult] = await db.execute(sql.raw(`
    SELECT 
      numero_guia_prestador as numeroGuia,
      codigo_item as codigoItem,
      codigo_tabela as codigoTabela
    FROM faturamento_tiss
    WHERE numero_guia_prestador IN (${guiasStr})
  `));

  const ftMap = new Map<string, string>();
  for (const ft of ftResult as any[]) {
    const key = `${ft.numeroGuia}|${ft.codigoItem}`;
    ftMap.set(key, String(ft.codigoTabela || ''));
  }

  // Agrupar itens por guia
  const guiasMap = new Map<string, GuiaCompleta>();

  for (const item of itens) {
    const guia = String(item.numeroGuia);
    const fu = fuMap.get(guia);
    const codigoTabelaOriginal = ftMap.get(`${guia}|${item.codigoItem}`);
    const statusConc = String(item.statusConciliacao || '');

    if (!guiasMap.has(guia)) {
      guiasMap.set(guia, {
        numeroGuia: guia,
        numeroGuiaOperadora: fu?.numeroGuiaOperadora ? String(fu.numeroGuiaOperadora) : `0${guia}`,
        senha: fu?.senha ? String(fu.senha) : null,
        pacienteNome: fu?.pacienteNome ? String(fu.pacienteNome) : (item.pacienteNome ? String(item.pacienteNome) : null),
        carteiraBeneficiario: fu?.carteiraBeneficiario ? String(fu.carteiraBeneficiario) : null,
        dataInicioFat: fu?.dataInicioFat ? formatarData(fu.dataInicioFat) : null,
        dataFimFat: fu?.dataFimFat ? formatarData(fu.dataFimFat) : null,
        itens: [],
        valorInformadoGuia: 0,
        valorProcessadoGuia: 0,
        valorLiberadoGuia: 0,
        valorGlosaGuia: 0,
        temGlosa: false,
      });
    }

    const guiaObj = guiasMap.get(guia)!;
    const valorFaturado = Number(item.valorFaturado) || 0;
    const valorPago = Number(item.valorPago) || 0;
    const valorGlosa = Number(item.valorGlosa) || 0;
    const isGlosado = statusConc === 'glosado' || valorGlosa > 0;

    if (isGlosado) {
      guiaObj.temGlosa = true;
    }

    guiaObj.itens.push({
      id: Number(item.id),
      codigoItem: String(item.codigoItem || ''),
      descricaoItem: String(item.descricaoItem || ''),
      codigoTabela: mapearCodigoTabela(item.tipoItem, codigoTabelaOriginal || null),
      dataExecucao: item.dataExecucao ? formatarData(item.dataExecucao) : null,
      valorFaturado,
      valorPago,
      valorGlosa,
      quantidade: Number(item.quantidade) || 1,
      statusConciliacao: statusConc,
      codigoGlosa: extrairCodigoGlosaNumerico(item.codigoGlosa ? String(item.codigoGlosa) : null),
      motivoGlosa: item.motivoGlosa ? String(item.motivoGlosa) : null,
    });

    guiaObj.valorInformadoGuia += valorFaturado;
    guiaObj.valorProcessadoGuia += valorPago;
    guiaObj.valorLiberadoGuia += valorPago;
    if (isGlosado) {
      guiaObj.valorGlosaGuia += valorGlosa > 0 ? valorGlosa : (valorFaturado - valorPago);
    }
  }

  return Array.from(guiasMap.values());
}

/**
 * Busca dados do prestador (estabelecimento)
 */
async function buscarDadosPrestador(estabelecimentoId: number): Promise<DadosPrestador> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const [result] = await db.execute(sql.raw(`
    SELECT nome, cnpj FROM estabelecimentos WHERE id = ${estabelecimentoId}
  `));

  const estab = (result as any[])[0];
  if (!estab) throw new Error(`Estabelecimento ${estabelecimentoId} não encontrado`);

  return {
    cnpj: limparCnpj(estab.cnpj),
    nome: String(estab.nome || ''),
    cnes: '2337819', // TODO: adicionar campo CNES na tabela estabelecimentos
    codigoPrestador: '',
  };
}

/**
 * Busca dados do convênio
 */
async function buscarDadosConvenio(
  convenioId: number,
  estabelecimentoId: number
): Promise<{ convenio: DadosConvenio; codigoPrestador: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const [convResult] = await db.execute(sql.raw(`
    SELECT c.nome, c.codigo FROM convenios c WHERE c.id = ${convenioId}
  `));

  const conv = (convResult as any[])[0];
  if (!conv) throw new Error(`Convênio ${convenioId} não encontrado`);

  // Buscar código do prestador na operadora
  const [cepResult] = await db.execute(sql.raw(`
    SELECT codigoPrestador FROM convenioEstabelecimentoPrestador 
    WHERE convenioId = ${convenioId} AND estabelecimentoId = ${estabelecimentoId}
    LIMIT 1
  `));

  const cep = (cepResult as any[])[0];

  return {
    convenio: {
      registroANS: '',
      nome: String(conv.nome || ''),
      cnpj: '',
    },
    codigoPrestador: cep ? String(cep.codigoPrestador) : '',
  };
}

// ============================================================
// GERAÇÃO DO XML
// ============================================================

/**
 * Gera o XML no formato TISS DEMONSTRATIVO_ANALISE_CONTA
 * seguindo o modelo do TASY/IPASGO
 * 
 * INCLUI TODOS OS ITENS DA GUIA (pagos e glosados)
 * Itens glosados são identificados pelo código de glosa numérico
 */
function gerarXmlDemonstrativo(
  guias: GuiaCompleta[],
  prestador: DadosPrestador,
  convenioNome: string,
  codigoPrestador: string,
  registroANS: string,
  cnpjOperadora: string,
  numeroDemonstrativo: string,
  numeroProtocolo: string,
  lotePrestador: string,
  dataProtocolo: string
): string {
  const agora = new Date();
  const dataRegistro = agora.toISOString().split('T')[0];
  const horaRegistro = `${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}:${agora.getSeconds().toString().padStart(2, '0')}.0000000-03:00`;

  // Calcular totais
  let valorInformadoProtocolo = 0;
  let valorProcessadoProtocolo = 0;
  let valorLiberadoProtocolo = 0;

  for (const guia of guias) {
    valorInformadoProtocolo += guia.valorInformadoGuia;
    valorProcessadoProtocolo += guia.valorProcessadoGuia;
    valorLiberadoProtocolo += guia.valorLiberadoGuia;
  }

  // Gerar XML das guias
  let guiasXml = '';
  for (const guia of guias) {
    let detalhesXml = '';
    for (const item of guia.itens) {
      // Para itens glosados: valorProcessado e valorLiberado = valorPago (que pode ser 0)
      // Para itens pagos: valorProcessado e valorLiberado = valorPago (= valorFaturado)
      const isGlosado = item.statusConciliacao === 'glosado' || item.valorGlosa > 0;
      
      detalhesXml += `
            <ans:detalhesGuia>
              <ans:dataRealizacao>${item.dataExecucao || dataRegistro}</ans:dataRealizacao>
              <ans:procedimento>
                <ans:codigoTabela>${escapeXml(item.codigoTabela)}</ans:codigoTabela>
                <ans:codigoProcedimento>${escapeXml(item.codigoItem)}</ans:codigoProcedimento>
                <ans:descricaoProcedimento>${escapeXml(item.descricaoItem)}</ans:descricaoProcedimento>
              </ans:procedimento>
              <ans:valorInformado>${formatarValor(item.valorFaturado)}</ans:valorInformado>
              <ans:qtdExecutada>${item.quantidade}</ans:qtdExecutada>
              <ans:valorProcessado>${formatarValor(item.valorPago)}</ans:valorProcessado>
              <ans:valorLiberado>${formatarValor(item.valorPago)}</ans:valorLiberado>${isGlosado && item.codigoGlosa ? `
              <ans:relacaoGlosa>
                <ans:valorGlosa>${formatarValor(item.valorGlosa > 0 ? item.valorGlosa : (item.valorFaturado - item.valorPago))}</ans:valorGlosa>
                <ans:tipoGlosa>${escapeXml(item.codigoGlosa)}</ans:tipoGlosa>
              </ans:relacaoGlosa>` : ''}
            </ans:detalhesGuia>`;
    }

    // Determinar situacaoGuia: 6 = processado normalmente
    guiasXml += `
          <ans:relacaoGuias>
            <ans:numeroGuiaPrestador>${escapeXml(guia.numeroGuia)}</ans:numeroGuiaPrestador>
            <ans:numeroGuiaOperadora>${escapeXml(guia.numeroGuiaOperadora)}</ans:numeroGuiaOperadora>${guia.senha ? `
            <ans:senha>${escapeXml(guia.senha)}</ans:senha>` : ''}${guia.pacienteNome ? `
            <ans:nomeBeneficiario>${escapeXml(guia.pacienteNome)}</ans:nomeBeneficiario>` : ''}${guia.carteiraBeneficiario ? `
            <ans:numeroCarteira>${escapeXml(guia.carteiraBeneficiario)}</ans:numeroCarteira>` : ''}
            <ans:dataInicioFat>${guia.dataInicioFat || dataRegistro}</ans:dataInicioFat>
            <ans:horaInicioFat>00:00:00.0000000-03:00</ans:horaInicioFat>
            <ans:dataFimFat>${guia.dataFimFat || dataRegistro}</ans:dataFimFat>
            <ans:horaFimFat>00:00:00.0000000-03:00</ans:horaFimFat>
            <ans:situacaoGuia>6</ans:situacaoGuia>${detalhesXml}
            <ans:valorInformadoGuia>${formatarValor(guia.valorInformadoGuia)}</ans:valorInformadoGuia>
            <ans:valorProcessadoGuia>${formatarValor(guia.valorProcessadoGuia)}</ans:valorProcessadoGuia>
            <ans:valorLiberadoGuia>${formatarValor(guia.valorLiberadoGuia)}</ans:valorLiberadoGuia>${guia.valorGlosaGuia > 0 ? `
            <ans:valorGlosaGuia>${formatarValor(guia.valorGlosaGuia)}</ans:valorGlosaGuia>` : ''}
          </ans:relacaoGuias>`;
  }

  // Montar XML completo
  const xmlBody = `<ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.ans.gov.br/padroes/tiss/schemas http://www.ans.gov.br/padroes/tiss/schemas/tissV3_03_01.xsd">
  <ans:cabecalho>
    <ans:identificacaoTransacao>
      <ans:tipoTransacao>DEMONSTRATIVO_ANALISE_CONTA</ans:tipoTransacao>
      <ans:sequencialTransacao>1</ans:sequencialTransacao>
      <ans:dataRegistroTransacao>${dataRegistro}</ans:dataRegistroTransacao>
      <ans:horaRegistroTransacao>${horaRegistro}</ans:horaRegistroTransacao>
    </ans:identificacaoTransacao>
    <ans:origem>
      <ans:registroANS>${escapeXml(registroANS)}</ans:registroANS>
    </ans:origem>
    <ans:destino>
      <ans:identificacaoPrestador>
        <ans:codigoPrestadorNaOperadora>${escapeXml(codigoPrestador)}</ans:codigoPrestadorNaOperadora>
      </ans:identificacaoPrestador>
    </ans:destino>
    <ans:Padrao>3.03.01</ans:Padrao>
  </ans:cabecalho>
  <ans:operadoraParaPrestador>
    <ans:demonstrativosRetorno>
      <ans:demonstrativoAnaliseConta>
      <ans:cabecalhoDemonstrativo>
        <ans:registroANS>${escapeXml(registroANS)}</ans:registroANS>
        <ans:numeroDemonstrativo>${escapeXml(numeroDemonstrativo)}</ans:numeroDemonstrativo>
        <ans:nomeOperadora>${escapeXml(convenioNome)}</ans:nomeOperadora>
        <ans:numeroCNPJ>${escapeXml(cnpjOperadora)}</ans:numeroCNPJ>
        <ans:dataEmissao>${dataRegistro}</ans:dataEmissao>
      </ans:cabecalhoDemonstrativo>
      <ans:dadosPrestador>
        <ans:dadosContratado>
          <ans:cnpjContratado>${escapeXml(prestador.cnpj)}</ans:cnpjContratado>
          <ans:nomeContratado>${escapeXml(prestador.nome)}</ans:nomeContratado>
        </ans:dadosContratado>
        <ans:CNES>${escapeXml(prestador.cnes)}</ans:CNES>
      </ans:dadosPrestador>
      <ans:dadosConta>
        <ans:dadosProtocolo>
          <ans:numeroLotePrestador>${escapeXml(lotePrestador)}</ans:numeroLotePrestador>
          <ans:numeroProtocolo>${escapeXml(numeroProtocolo)}</ans:numeroProtocolo>
          <ans:dataProtocolo>${dataProtocolo}</ans:dataProtocolo>
          <ans:situacaoProtocolo>6</ans:situacaoProtocolo>${guiasXml}
          <ans:valorInformadoProtocolo>${formatarValor(valorInformadoProtocolo)}</ans:valorInformadoProtocolo>
          <ans:valorProcessadoProtocolo>${formatarValor(valorProcessadoProtocolo)}</ans:valorProcessadoProtocolo>
          <ans:valorLiberadoProtocolo>${formatarValor(valorLiberadoProtocolo)}</ans:valorLiberadoProtocolo>
        </ans:dadosProtocolo>
      </ans:dadosConta>
      <ans:valorInformadoGeral>${formatarValor(valorInformadoProtocolo)}</ans:valorInformadoGeral>
      <ans:valorProcessadoGeral>${formatarValor(valorProcessadoProtocolo)}</ans:valorProcessadoGeral>
      <ans:valorLiberadoGeral>${formatarValor(valorLiberadoProtocolo)}</ans:valorLiberadoGeral>
    </ans:demonstrativoAnaliseConta>
    </ans:demonstrativosRetorno>
  </ans:operadoraParaPrestador>
  <ans:epilogo>
    <ans:hash>HASH_PLACEHOLDER</ans:hash>
  </ans:epilogo>
</ans:mensagemTISS>`;

  // Calcular hash MD5 do conteúdo (excluindo o próprio hash)
  const hash = gerarHashMD5(xmlBody.replace('HASH_PLACEHOLDER', ''));
  return xmlBody.replace('HASH_PLACEHOLDER', hash);
}

// ============================================================
// FUNÇÕES EXPORTADAS
// ============================================================

/**
 * Gera XML de recurso para uma ou mais guias
 * O XML contém TODOS os itens da guia (pagos e glosados)
 */
export async function gerarXmlRecurso(params: {
  estabelecimentoId: number;
  guias: string[];
  convenioId?: number;
  registroANS?: string;
  cnpjOperadora?: string;
  numeroDemonstrativo?: string;
  numeroProtocolo?: string;
  lotePrestador?: string;
  dataProtocolo?: string;
  userId?: number;
}): Promise<{
  xmlUrl: string;
  xmlKey: string;
  nomeArquivo: string;
  totalGuias: number;
  totalItens: number;
  totalItensGlosados: number;
  valorTotalFaturado: number;
  valorTotalGlosado: number;
  registroId: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  // 1. Buscar TODOS os dados das guias (pagos + glosados)
  const guiasData = await buscarDadosGuiasCompletas(params.estabelecimentoId, params.guias);
  
  if (guiasData.length === 0) {
    throw new Error("Nenhum item encontrado para as guias selecionadas");
  }

  // 2. Buscar dados do prestador
  const prestador = await buscarDadosPrestador(params.estabelecimentoId);

  // 3. Buscar dados do convênio (se fornecido)
  let convenioNome = '';
  let codigoPrestador = '';
  if (params.convenioId) {
    const dadosConv = await buscarDadosConvenio(params.convenioId, params.estabelecimentoId);
    convenioNome = dadosConv.convenio.nome;
    codigoPrestador = dadosConv.codigoPrestador;
  }

  // 4. Buscar lotePrestador do faturamento_unificado se não fornecido
  let lotePrestador = params.lotePrestador || '';
  if (!lotePrestador && params.guias.length > 0) {
    const esc = (v: string) => `'${v.replace(/'/g, "''")}'`;
    const [lpResult] = await db.execute(sql.raw(`
      SELECT DISTINCT lotePrestador FROM faturamento_unificado 
      WHERE estabelecimentoId = ${params.estabelecimentoId} 
        AND numeroGuia IN (${params.guias.map(g => esc(g)).join(',')})
        AND lotePrestador IS NOT NULL
      LIMIT 1
    `));
    const lp = (lpResult as any[])[0];
    if (lp) lotePrestador = String(lp.lotePrestador);
  }

  // 5. Gerar número do demonstrativo e protocolo
  const numeroDemonstrativo = params.numeroDemonstrativo || `REC-${Date.now()}`;
  const numeroProtocolo = params.numeroProtocolo || lotePrestador || `${Date.now()}`;
  const dataProtocolo = params.dataProtocolo || new Date().toISOString().split('T')[0];

  // 6. Gerar o XML com TODOS os itens
  const xmlContent = gerarXmlDemonstrativo(
    guiasData,
    prestador,
    convenioNome,
    codigoPrestador,
    params.registroANS || '',
    params.cnpjOperadora || '',
    numeroDemonstrativo,
    numeroProtocolo,
    lotePrestador,
    dataProtocolo
  );

  // 7. Calcular totais
  let totalItens = 0;
  let totalItensGlosados = 0;
  let valorTotalFaturado = 0;
  let valorTotalGlosado = 0;
  for (const guia of guiasData) {
    totalItens += guia.itens.length;
    valorTotalFaturado += guia.valorInformadoGuia;
    for (const item of guia.itens) {
      if (item.statusConciliacao === 'glosado' || item.valorGlosa > 0) {
        totalItensGlosados++;
        valorTotalGlosado += item.valorGlosa;
      }
    }
  }

  // 8. Salvar no S3
  const timestamp = Date.now();
  const nomeArquivo = params.guias.length === 1
    ? `recurso_guia_${params.guias[0]}_${timestamp}.xml`
    : `recurso_lote_${guiasData.length}guias_${timestamp}.xml`;
  
  const fileKey = `xml-recursos/${params.estabelecimentoId}/${nomeArquivo}`;
  const { url: xmlUrl, key: xmlKey } = await storagePut(
    fileKey,
    xmlContent,
    'application/xml'
  );

  // 9. Registrar no banco
  const tipo = params.guias.length === 1 ? 'individual' : 'lote';
  const guiasJson = JSON.stringify(params.guias);

  const [insertResult] = await db.execute(sql.raw(`
    INSERT INTO xml_recursos_gerados 
    (estabelecimentoId, convenioId, convenioNome, guiasIncluidas, totalGuias, totalItens, 
     valorTotalGlosado, xmlUrl, xmlKey, nomeArquivo, tipo, userId)
    VALUES 
    (${params.estabelecimentoId}, ${params.convenioId || 'NULL'}, 
     '${(convenioNome || '').replace(/'/g, "''")}',
     '${guiasJson}', ${guiasData.length}, ${totalItens}, 
     ${valorTotalGlosado.toFixed(4)}, 
     '${(xmlUrl || '').replace(/'/g, "''")}', 
     '${(xmlKey || '').replace(/'/g, "''")}', 
     '${nomeArquivo}', '${tipo}', ${params.userId || 'NULL'})
  `));

  const registroId = (insertResult as any)?.insertId || 0;

  // 10. Marcar as guias como XML gerado na conciliados_automatico
  const idsItens: number[] = [];
  for (const guia of guiasData) {
    for (const item of guia.itens) {
      idsItens.push(item.id);
    }
  }

  if (idsItens.length > 0) {
    // Atualizar em lotes de 100
    for (let i = 0; i < idsItens.length; i += 100) {
      const batch = idsItens.slice(i, i + 100);
      await db.execute(sql.raw(`
        UPDATE conciliados_automatico 
        SET xmlRecursoGerado = 1, 
            xmlRecursoData = NOW(),
            xmlRecursoLoteId = ${registroId}
        WHERE id IN (${batch.join(',')})
      `));
    }
  }

  return {
    xmlUrl,
    xmlKey,
    nomeArquivo,
    totalGuias: guiasData.length,
    totalItens,
    totalItensGlosados,
    valorTotalFaturado,
    valorTotalGlosado,
    registroId,
  };
}

/**
 * Lista os XMLs de recurso gerados para um estabelecimento
 */
export async function listarXmlsGerados(params: {
  estabelecimentoId: number;
  convenioId?: number;
  competencia?: string;
  limit?: number;
  offset?: number;
}): Promise<{ registros: any[]; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.convenioId) {
    whereClause += ` AND convenioId = ${params.convenioId}`;
  }
  if (params.competencia) {
    whereClause += ` AND competencia = '${params.competencia.replace(/'/g, "''")}'`;
  }

  const limit = params.limit || 50;
  const offset = params.offset || 0;

  const [countResult] = await db.execute(sql.raw(`
    SELECT COUNT(*) as total FROM xml_recursos_gerados ${whereClause}
  `));
  const total = Number((countResult as any[])[0]?.total || 0);

  const [result] = await db.execute(sql.raw(`
    SELECT * FROM xml_recursos_gerados 
    ${whereClause}
    ORDER BY createdAt DESC
    LIMIT ${limit} OFFSET ${offset}
  `));

  return { registros: result as any[], total };
}

/**
 * Busca guias disponíveis para geração de XML de recurso
 * Mostra guias que TÊM itens glosados (mas o XML incluirá todos os itens)
 */
export async function guiasGlosadasDisponiveis(params: {
  estabelecimentoId: number;
  convenioId?: number;
  competencia?: string;
  apenasNaoGeradas?: boolean;
}): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  // Buscar guias que possuem pelo menos um item glosado
  let whereClause = `WHERE ca.estabelecimentoId = ${params.estabelecimentoId}`;
  
  if (params.convenioId) {
    whereClause += ` AND ca.convenioId = ${params.convenioId}`;
  }
  if (params.competencia && params.competencia !== 'todos') {
    whereClause += ` AND ca.competencia = '${params.competencia.replace(/'/g, "''")}'`;
  }

  // Buscar todas as guias que têm pelo menos um item glosado
  const [result] = await db.execute(sql.raw(`
    SELECT 
      ca.numeroGuia,
      ca.convenio,
      ca.convenioId,
      ca.competencia,
      MAX(ca.pacienteNome) as pacienteNome,
      COUNT(*) as totalItens,
      SUM(CASE WHEN ca.statusConciliacao = 'glosado' THEN 1 ELSE 0 END) as totalItensGlosados,
      SUM(ca.valorFaturado) as valorFaturado,
      SUM(ca.valorPago) as valorPago,
      SUM(CASE WHEN ca.statusConciliacao = 'glosado' THEN ca.valorGlosa ELSE 0 END) as valorGlosa,
      MAX(ca.xmlRecursoGerado) as xmlGerado,
      MAX(ca.xmlRecursoData) as xmlGeradoEm,
      MAX(ca.xmlRecursoLoteId) as xmlLoteId
    FROM conciliados_automatico ca
    ${whereClause}
    GROUP BY ca.numeroGuia, ca.convenio, ca.convenioId, ca.competencia
    HAVING SUM(CASE WHEN ca.statusConciliacao = 'glosado' THEN 1 ELSE 0 END) > 0
    ORDER BY ca.competencia DESC, ca.numeroGuia
  `));

  let guias = result as any[];

  // Filtrar apenas não geradas se solicitado
  if (params.apenasNaoGeradas) {
    guias = guias.filter((g: any) => !g.xmlGerado || g.xmlGerado === 0);
  }

  return guias;
}

/**
 * Busca o conteúdo XML de um registro gerado (para download)
 */
export async function downloadXmlRecurso(id: number): Promise<{ url: string; nomeArquivo: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const [result] = await db.execute(sql.raw(`
    SELECT xmlUrl, nomeArquivo FROM xml_recursos_gerados WHERE id = ${id}
  `));

  const registro = (result as any[])[0];
  if (!registro) throw new Error("Registro de XML não encontrado");

  return {
    url: String(registro.xmlUrl || ''),
    nomeArquivo: String(registro.nomeArquivo || 'recurso.xml'),
  };
}
