import { getDb } from "./db";
import { guiasFaturamento, itensGuiaFaturamento, lotesFaturamento } from "../drizzle/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { storagePut } from "./storage";

// ========== XML TISS 3.05 - Geração de Lote de Guias ==========

export async function gerarXmlTissLote(loteId: number): Promise<{ url: string; xml: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Buscar lote
  const [lote] = await db.select().from(lotesFaturamento).where(eq(lotesFaturamento.id, loteId));
  if (!lote) throw new Error("Lote não encontrado");

  // Buscar guias do lote
  const guias = await db.select().from(guiasFaturamento).where(eq(guiasFaturamento.loteId, loteId));
  if (guias.length === 0) throw new Error("Lote não possui guias");

  // Buscar itens de todas as guias
  const guiaIds = guias.map(g => g.id);
  const todosItens = await db.select().from(itensGuiaFaturamento)
    .where(inArray(itensGuiaFaturamento.guiaId, guiaIds));

  // Buscar dados do prestador (convenio + estabelecimento + código prestador)
  const estabelecimentoId = guias[0].estabelecimentoId;
  const convenioId = guias[0].convenioId;
  
  const [convenioData] = await db.execute(sql`
    SELECT c.nome as nome_convenio, c.codigo as codigo_convenio, c.registro_ans,
           e.nome as nome_estabelecimento, e.cnpj, e.cnes,
           cep.codigoPrestador as codigo_prestador
    FROM convenios c
    LEFT JOIN estabelecimentos e ON e.id = ${estabelecimentoId}
    LEFT JOIN convenioEstabelecimentoPrestador cep 
      ON cep.convenioId = ${convenioId} AND cep.estabelecimentoId = ${estabelecimentoId}
    WHERE c.id = ${convenioId}
    LIMIT 1
  `);
  const prestadorRow = (convenioData as any)?.[0] || {};
  // Montar objeto prestador com campos esperados pelo template XML
  const prestador = {
    nome: prestadorRow.nome_convenio || "",
    codigo_operadora: prestadorRow.codigo_convenio || "",
    registro_ans: prestadorRow.registro_ans || prestadorRow.codigo_convenio || "",
    nome_estabelecimento: prestadorRow.nome_estabelecimento || "",
    cnpj: prestadorRow.cnpj || "",
    cnes: prestadorRow.cnes || "",
    codigo_prestador: prestadorRow.codigo_prestador || "",
  };

  const now = new Date();
  const dataGeracao = now.toISOString().split("T")[0];
  const horaGeracao = now.toTimeString().split(" ")[0];
  const hashLote = `${lote.id}${Date.now()}`.slice(-12);

  let xmlGuias = "";
  let sequencialTransacao = 1;

  for (const guia of guias) {
    const itensGuia = todosItens.filter(i => i.guiaId === guia.id);
    
    if (guia.tipoGuia === "sadt") {
      xmlGuias += gerarGuiaSadt(guia, itensGuia, prestador, sequencialTransacao);
    } else {
      xmlGuias += gerarGuiaInternacao(guia, itensGuia, prestador, sequencialTransacao);
    }
    sequencialTransacao++;
  }

  // Calcular valor total do lote
  const valorTotalLote = guias.reduce((acc, g) => acc + Number(g.valorTotal || 0), 0).toFixed(2);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.ans.gov.br/padroes/tiss/schemas http://www.ans.gov.br/padroes/tiss/schemas/tissV3_05_00.xsd">
  <ans:cabecalho>
    <ans:identificacaoTransacao>
      <ans:tipoTransacao>ENVIO_LOTE_GUIAS</ans:tipoTransacao>
      <ans:sequencialTransacao>${hashLote}</ans:sequencialTransacao>
      <ans:dataRegistroTransacao>${dataGeracao}</ans:dataRegistroTransacao>
      <ans:horaRegistroTransacao>${horaGeracao}</ans:horaRegistroTransacao>
    </ans:identificacaoTransacao>
    <ans:origem>
      <ans:identificacaoPrestador>
        <ans:CNPJ>${prestador.cnpj || ""}</ans:CNPJ>
      </ans:identificacaoPrestador>
    </ans:origem>
    <ans:destino>
      <ans:registroANS>${prestador.registro_ans || ""}</ans:registroANS>
    </ans:destino>
    <ans:Padrao>3.05.00</ans:Padrao>
  </ans:cabecalho>
  <ans:prestadorParaOperadora>
    <ans:loteGuias>
      <ans:numeroLote>${lote.numeroLote}</ans:numeroLote>
      <ans:guiasTISS>
${xmlGuias}
      </ans:guiasTISS>
    </ans:loteGuias>
  </ans:prestadorParaOperadora>
  <ans:epilogo>
    <ans:hash>${hashLote}</ans:hash>
  </ans:epilogo>
</ans:mensagemTISS>`;

  // Salvar no S3
  const fileName = `faturamento/xml/${lote.numeroLote}.xml`;
  const { url } = await storagePut(fileName, Buffer.from(xml, "utf-8"), "application/xml");

  // Atualizar lote com URL do XML
  await db.update(lotesFaturamento).set({
    xmlUrl: url,
    status: "fechado",
  }).where(eq(lotesFaturamento.id, loteId));

  return { url, xml };
}

function gerarGuiaSadt(guia: any, itens: any[], prestador: any, seq: number): string {
  // Separar itens em procedimentos e despesas
  const procedimentos = itens.filter(i => i.tipoLancamento === "procedimento" || i.tipoItem === "procedimento");
  const despesas = itens.filter(i => i.tipoLancamento === "despesa" || (i.tipoItem !== "procedimento" && !i.tipoLancamento));

  // Gerar XML de procedimentos executados
  const itensXml = procedimentos.map((item, idx) => `
            <ans:procedimentoExecutado>
              <ans:sequencialItem>${idx + 1}</ans:sequencialItem>
              <ans:dataExecucao>${item.dataExecucao || guia.dataAtendimento || ""}</ans:dataExecucao>
              <ans:horaInicial>${item.horaInicio || "00:00:00"}</ans:horaInicial>
              <ans:horaFinal>${item.horaFim || "00:00:00"}</ans:horaFinal>
              <ans:procedimento>
                <ans:codigoTabela>${item.codigoTabela || "22"}</ans:codigoTabela>
                <ans:codigoProcedimento>${item.codigoProcedimento}</ans:codigoProcedimento>
                <ans:descricaoProcedimento>${escapeXml(item.descricao)}</ans:descricaoProcedimento>
              </ans:procedimento>
              <ans:quantidadeExecutada>${item.quantidade || "1"}</ans:quantidadeExecutada>
              <ans:viaAcesso>${item.viaAcesso || "U"}</ans:viaAcesso>
              <ans:tecnicaUtilizada>${item.tecnica || "C"}</ans:tecnicaUtilizada>
              <ans:reducaoAcrescimo>${item.fatorReducao || "1.00"}</ans:reducaoAcrescimo>
              <ans:valorUnitario>${Number(item.valorUnitario || 0).toFixed(2)}</ans:valorUnitario>
              <ans:valorTotal>${Number(item.valorTotal || 0).toFixed(2)}</ans:valorTotal>${item.grauParticipacao ? `
              <ans:equipeSadt>
                <ans:grauPart>${item.grauParticipacao}</ans:grauPart>
                <ans:codigoProfissional>${item.codigoProfissionalOperadora || prestador.codigo_prestador || ""}</ans:codigoProfissional>
                <ans:nomeProf>${escapeXml(item.nomeProfissional || guia.nomeExecutante || "")}</ans:nomeProf>
                <ans:conselho>${item.conselhoProfissional || guia.conselhoProfExecutante || "6"}</ans:conselho>
                <ans:numeroConselhoProfissional>${item.numeroConselhoProfissional || guia.numeroConselhoProfExecutante || ""}</ans:numeroConselhoProfissional>
                <ans:UF>${item.ufProfissional || guia.ufConselhoProfExecutante || "GO"}</ans:UF>
                <ans:CBOS>${item.cbosProfissional || guia.cbosConselhoProfExecutante || ""}</ans:CBOS>
              </ans:equipeSadt>` : ""}
            </ans:procedimentoExecutado>`).join("\n");

  // Gerar XML de outras despesas (materiais, medicamentos, diárias, taxas, gases)
  const despesasXml = despesas.map((item, idx) => {
    const codigoDespesa = item.codigoDespesa || mapTipoItemToCodigoDespesa(item.tipoItem);
    return `
            <ans:despesa>
              <ans:sequencialItem>${idx + 1}</ans:sequencialItem>
              <ans:codigoDespesa>${codigoDespesa}</ans:codigoDespesa>
              <ans:servicosExecutados>
                <ans:dataExecucao>${item.dataExecucao || guia.dataAtendimento || ""}</ans:dataExecucao>
                <ans:horaInicial>${item.horaInicio || "00:00:00"}</ans:horaInicial>
                <ans:horaFinal>${item.horaFim || "00:00:00"}</ans:horaFinal>
                <ans:codigoTabela>${item.codigoTabela || "22"}</ans:codigoTabela>
                <ans:codigoProcedimento>${item.codigoProcedimento}</ans:codigoProcedimento>
                <ans:descricaoProcedimento>${escapeXml(item.descricao)}</ans:descricaoProcedimento>
                <ans:quantidadeExecutada>${item.quantidade || "1"}</ans:quantidadeExecutada>
                <ans:unidadeMedida>${item.unidadeMedida || "001"}</ans:unidadeMedida>
                <ans:reducaoAcrescimo>${item.fatorReducao || "1.00"}</ans:reducaoAcrescimo>
                <ans:valorUnitario>${Number(item.valorUnitario || 0).toFixed(2)}</ans:valorUnitario>
                <ans:valorTotal>${Number(item.valorTotal || 0).toFixed(2)}</ans:valorTotal>${item.registroAnvisa ? `
                <ans:registroANVISA>${item.registroAnvisa}</ans:registroANVISA>` : ""}${item.codigoRefFabricante ? `
                <ans:codigoRefFabricante>${item.codigoRefFabricante}</ans:codigoRefFabricante>` : ""}${item.autorizacaoFuncionamento ? `
                <ans:autorizacaoFuncionamento>${item.autorizacaoFuncionamento}</ans:autorizacaoFuncionamento>` : ""}
              </ans:servicosExecutados>
            </ans:despesa>`;
  }).join("\n");

  // Calcular valores por categoria
  const valorProcedimentos = procedimentos.reduce((acc, i) => acc + Number(i.valorTotal || 0), 0).toFixed(2);
  const valorDespesas = despesas.reduce((acc, i) => acc + Number(i.valorTotal || 0), 0);
  const valorDiarias = despesas.filter(i => (i.codigoDespesa === "5" || i.tipoItem === "diaria")).reduce((acc, i) => acc + Number(i.valorTotal || 0), 0).toFixed(2);
  const valorTaxas = despesas.filter(i => (i.codigoDespesa === "7" || i.tipoItem === "taxa")).reduce((acc, i) => acc + Number(i.valorTotal || 0), 0).toFixed(2);
  const valorMateriais = despesas.filter(i => (i.codigoDespesa === "3" || i.tipoItem === "material")).reduce((acc, i) => acc + Number(i.valorTotal || 0), 0).toFixed(2);
  const valorMedicamentos = despesas.filter(i => (i.codigoDespesa === "2" || i.tipoItem === "medicamento")).reduce((acc, i) => acc + Number(i.valorTotal || 0), 0).toFixed(2);
  const valorOpme = despesas.filter(i => (i.codigoDespesa === "8" || i.tipoItem === "opme")).reduce((acc, i) => acc + Number(i.valorTotal || 0), 0).toFixed(2);
  const valorGases = despesas.filter(i => (i.codigoDespesa === "1" || i.tipoItem === "gases")).reduce((acc, i) => acc + Number(i.valorTotal || 0), 0).toFixed(2);
  const valorTotal = itens.reduce((acc, i) => acc + Number(i.valorTotal || 0), 0).toFixed(2);

  return `        <ans:guiaSP-SADT>
          <ans:cabecalhoGuia>
            <ans:registroANS>${prestador.registro_ans || ""}</ans:registroANS>
            <ans:numeroGuiaPrestador>${guia.numeroGuiaPrestador || guia.id}</ans:numeroGuiaPrestador>
            ${guia.numeroGuiaOperadora ? `<ans:guiaPrincipal>${guia.numeroGuiaOperadora}</ans:guiaPrincipal>` : ""}
          </ans:cabecalhoGuia>
          <ans:dadosAutorizacao>
            ${guia.senha ? `<ans:senha>${guia.senha}</ans:senha>` : ""}
            <ans:dataAutorizacao>${guia.dataAtendimento || ""}</ans:dataAutorizacao>
          </ans:dadosAutorizacao>
          <ans:dadosBeneficiario>
            <ans:numeroCarteira>${guia.carteirinha || ""}</ans:numeroCarteira>
            <ans:nomeBeneficiario>${escapeXml(guia.nomePaciente)}</ans:nomeBeneficiario>
          </ans:dadosBeneficiario>
          <ans:dadosSolicitante>
            <ans:contratadoSolicitante>
              <ans:codigoPrestadorNaOperadora>${prestador.codigo_prestador || ""}</ans:codigoPrestadorNaOperadora>
              <ans:nomeContratado>${escapeXml(prestador.nome_estabelecimento || "")}</ans:nomeContratado>
            </ans:contratadoSolicitante>
            <ans:profissionalSolicitante>
              <ans:nomeProfissional>${escapeXml(guia.nomeSolicitante || "")}</ans:nomeProfissional>
              <ans:conselhoProfissional>${guia.conselhoProfSolicitante || "6"}</ans:conselhoProfissional>
              <ans:numeroConselhoProfissional>${guia.numeroConselhoProfSolicitante || ""}</ans:numeroConselhoProfissional>
              <ans:UF>${guia.ufConselhoProfSolicitante || "GO"}</ans:UF>
              <ans:CBOS>${guia.cbosConselhoProfSolicitante || ""}</ans:CBOS>
            </ans:profissionalSolicitante>
          </ans:dadosSolicitante>
          <ans:dadosExecutante>
            <ans:contratadoExecutante>
              <ans:codigoPrestadorNaOperadora>${prestador.codigo_prestador || ""}</ans:codigoPrestadorNaOperadora>
              <ans:nomeContratado>${escapeXml(prestador.nome_estabelecimento || "")}</ans:nomeContratado>
              <ans:CNES>${prestador.cnes || ""}</ans:CNES>
            </ans:contratadoExecutante>
            <ans:profissionalExecutante>
              <ans:nomeProfissional>${escapeXml(guia.nomeExecutante || guia.nomeSolicitante || "")}</ans:nomeProfissional>
              <ans:conselhoProfissional>${guia.conselhoProfExecutante || guia.conselhoProfSolicitante || "6"}</ans:conselhoProfissional>
              <ans:numeroConselhoProfissional>${guia.numeroConselhoProfExecutante || guia.numeroConselhoProfSolicitante || ""}</ans:numeroConselhoProfissional>
              <ans:UF>${guia.ufConselhoProfExecutante || guia.ufConselhoProfSolicitante || "GO"}</ans:UF>
              <ans:CBOS>${guia.cbosConselhoProfExecutante || guia.cbosConselhoProfSolicitante || ""}</ans:CBOS>
            </ans:profissionalExecutante>
          </ans:dadosExecutante>
          <ans:dadosAtendimento>
            <ans:tipoAtendimento>${guia.caraterAtendimento === "urgencia" ? "2" : "1"}</ans:tipoAtendimento>
            ${guia.indicacaoClinica ? `<ans:indicacaoClinica>${escapeXml(guia.indicacaoClinica)}</ans:indicacaoClinica>` : ""}
          </ans:dadosAtendimento>${procedimentos.length > 0 ? `
          <ans:procedimentosExecutados>
${itensXml}
          </ans:procedimentosExecutados>` : ""}${despesas.length > 0 ? `
          <ans:outrasDespesas>
${despesasXml}
          </ans:outrasDespesas>` : ""}
          <ans:valorTotal>
            <ans:valorProcedimentos>${valorProcedimentos}</ans:valorProcedimentos>${Number(valorDiarias) > 0 ? `
            <ans:valorDiarias>${valorDiarias}</ans:valorDiarias>` : ""}${Number(valorTaxas) > 0 ? `
            <ans:valorTaxasAlugueis>${valorTaxas}</ans:valorTaxasAlugueis>` : ""}${Number(valorMateriais) > 0 ? `
            <ans:valorMateriais>${valorMateriais}</ans:valorMateriais>` : ""}${Number(valorMedicamentos) > 0 ? `
            <ans:valorMedicamentos>${valorMedicamentos}</ans:valorMedicamentos>` : ""}${Number(valorOpme) > 0 ? `
            <ans:valorOPME>${valorOpme}</ans:valorOPME>` : ""}${Number(valorGases) > 0 ? `
            <ans:valorGasesMedicinais>${valorGases}</ans:valorGasesMedicinais>` : ""}
            <ans:valorTotal>${valorTotal}</ans:valorTotal>
          </ans:valorTotal>
        </ans:guiaSP-SADT>
`;
}

function gerarGuiaInternacao(guia: any, itens: any[], prestador: any, seq: number): string {
  // Separar itens em procedimentos e despesas
  const procedimentos = itens.filter(i => i.tipoLancamento === "procedimento" || i.tipoItem === "procedimento");
  const despesas = itens.filter(i => i.tipoLancamento === "despesa" || (i.tipoItem !== "procedimento" && !i.tipoLancamento));

  // Gerar XML de procedimentos executados
  const itensXml = procedimentos.map((item, idx) => `
            <ans:procedimentoExecutado>
              <ans:sequencialItem>${idx + 1}</ans:sequencialItem>
              <ans:dataExecucao>${item.dataExecucao || guia.dataInicio || ""}</ans:dataExecucao>
              <ans:horaInicial>${item.horaInicio || "00:00:00"}</ans:horaInicial>
              <ans:horaFinal>${item.horaFim || "00:00:00"}</ans:horaFinal>
              <ans:procedimento>
                <ans:codigoTabela>${item.codigoTabela || "22"}</ans:codigoTabela>
                <ans:codigoProcedimento>${item.codigoProcedimento}</ans:codigoProcedimento>
                <ans:descricaoProcedimento>${escapeXml(item.descricao)}</ans:descricaoProcedimento>
              </ans:procedimento>
              <ans:quantidadeExecutada>${item.quantidade || "1"}</ans:quantidadeExecutada>
              <ans:viaAcesso>${item.viaAcesso || "U"}</ans:viaAcesso>
              <ans:tecnicaUtilizada>${item.tecnica || "C"}</ans:tecnicaUtilizada>
              <ans:reducaoAcrescimo>${item.fatorReducao || "1.00"}</ans:reducaoAcrescimo>
              <ans:valorUnitario>${Number(item.valorUnitario || 0).toFixed(2)}</ans:valorUnitario>
              <ans:valorTotal>${Number(item.valorTotal || 0).toFixed(2)}</ans:valorTotal>${item.grauParticipacao ? `
              <ans:equipeSadt>
                <ans:grauPart>${item.grauParticipacao}</ans:grauPart>
                <ans:codigoProfissional>${item.codigoProfissionalOperadora || prestador.codigo_prestador || ""}</ans:codigoProfissional>
                <ans:nomeProf>${escapeXml(item.nomeProfissional || guia.nomeExecutante || "")}</ans:nomeProf>
                <ans:conselho>${item.conselhoProfissional || guia.conselhoProfExecutante || "6"}</ans:conselho>
                <ans:numeroConselhoProfissional>${item.numeroConselhoProfissional || guia.numeroConselhoProfExecutante || ""}</ans:numeroConselhoProfissional>
                <ans:UF>${item.ufProfissional || guia.ufConselhoProfExecutante || "GO"}</ans:UF>
                <ans:CBOS>${item.cbosProfissional || guia.cbosConselhoProfExecutante || ""}</ans:CBOS>
              </ans:equipeSadt>` : ""}
            </ans:procedimentoExecutado>`).join("\n");

  // Gerar XML de outras despesas
  const despesasXml = despesas.map((item, idx) => {
    const codigoDespesa = item.codigoDespesa || mapTipoItemToCodigoDespesa(item.tipoItem);
    return `
            <ans:despesa>
              <ans:sequencialItem>${idx + 1}</ans:sequencialItem>
              <ans:codigoDespesa>${codigoDespesa}</ans:codigoDespesa>
              <ans:servicosExecutados>
                <ans:dataExecucao>${item.dataExecucao || guia.dataInicio || ""}</ans:dataExecucao>
                <ans:horaInicial>${item.horaInicio || "00:00:00"}</ans:horaInicial>
                <ans:horaFinal>${item.horaFim || "00:00:00"}</ans:horaFinal>
                <ans:codigoTabela>${item.codigoTabela || "22"}</ans:codigoTabela>
                <ans:codigoProcedimento>${item.codigoProcedimento}</ans:codigoProcedimento>
                <ans:descricaoProcedimento>${escapeXml(item.descricao)}</ans:descricaoProcedimento>
                <ans:quantidadeExecutada>${item.quantidade || "1"}</ans:quantidadeExecutada>
                <ans:unidadeMedida>${item.unidadeMedida || "001"}</ans:unidadeMedida>
                <ans:reducaoAcrescimo>${item.fatorReducao || "1.00"}</ans:reducaoAcrescimo>
                <ans:valorUnitario>${Number(item.valorUnitario || 0).toFixed(2)}</ans:valorUnitario>
                <ans:valorTotal>${Number(item.valorTotal || 0).toFixed(2)}</ans:valorTotal>${item.registroAnvisa ? `
                <ans:registroANVISA>${item.registroAnvisa}</ans:registroANVISA>` : ""}${item.codigoRefFabricante ? `
                <ans:codigoRefFabricante>${item.codigoRefFabricante}</ans:codigoRefFabricante>` : ""}${item.autorizacaoFuncionamento ? `
                <ans:autorizacaoFuncionamento>${item.autorizacaoFuncionamento}</ans:autorizacaoFuncionamento>` : ""}
              </ans:servicosExecutados>
            </ans:despesa>`;
  }).join("\n");

  // Calcular valores por categoria
  const valorProcedimentos = procedimentos.reduce((acc, i) => acc + Number(i.valorTotal || 0), 0).toFixed(2);
  const valorDiarias = despesas.filter(i => (i.codigoDespesa === "5" || i.tipoItem === "diaria")).reduce((acc, i) => acc + Number(i.valorTotal || 0), 0).toFixed(2);
  const valorTaxas = despesas.filter(i => (i.codigoDespesa === "7" || i.tipoItem === "taxa")).reduce((acc, i) => acc + Number(i.valorTotal || 0), 0).toFixed(2);
  const valorMateriais = despesas.filter(i => (i.codigoDespesa === "3" || i.tipoItem === "material")).reduce((acc, i) => acc + Number(i.valorTotal || 0), 0).toFixed(2);
  const valorMedicamentos = despesas.filter(i => (i.codigoDespesa === "2" || i.tipoItem === "medicamento")).reduce((acc, i) => acc + Number(i.valorTotal || 0), 0).toFixed(2);
  const valorOpme = despesas.filter(i => (i.codigoDespesa === "8" || i.tipoItem === "opme")).reduce((acc, i) => acc + Number(i.valorTotal || 0), 0).toFixed(2);
  const valorGases = despesas.filter(i => (i.codigoDespesa === "1" || i.tipoItem === "gases")).reduce((acc, i) => acc + Number(i.valorTotal || 0), 0).toFixed(2);
  const valorTotal = itens.reduce((acc, i) => acc + Number(i.valorTotal || 0), 0).toFixed(2);

  return `        <ans:guiaResumoInternacao>
          <ans:cabecalhoGuia>
            <ans:registroANS>${prestador.registro_ans || ""}</ans:registroANS>
            <ans:numeroGuiaPrestador>${guia.numeroGuiaPrestador || guia.id}</ans:numeroGuiaPrestador>
            ${guia.numeroGuiaOperadora ? `<ans:guiaPrincipal>${guia.numeroGuiaOperadora}</ans:guiaPrincipal>` : ""}${guia.numeroGuiaSolicitacaoInternacao ? `
            <ans:numeroGuiaSolicitacaoInternacao>${guia.numeroGuiaSolicitacaoInternacao}</ans:numeroGuiaSolicitacaoInternacao>` : ""}
          </ans:cabecalhoGuia>
          <ans:dadosAutorizacao>
            ${guia.senha ? `<ans:senha>${guia.senha}</ans:senha>` : ""}
            <ans:dataAutorizacao>${guia.dataInicio || guia.dataAtendimento || ""}</ans:dataAutorizacao>
          </ans:dadosAutorizacao>
          <ans:dadosBeneficiario>
            <ans:numeroCarteira>${guia.carteirinha || ""}</ans:numeroCarteira>
            <ans:atendimentoRN>${guia.atendimentoRN || "N"}</ans:atendimentoRN>
            <ans:nomeBeneficiario>${escapeXml(guia.nomePaciente)}</ans:nomeBeneficiario>
          </ans:dadosBeneficiario>
          <ans:dadosInternacao>
            <ans:caraterAtendimento>${guia.caraterAtendimento === "urgencia" ? "2" : "1"}</ans:caraterAtendimento>
            ${guia.tipoFaturamento ? `<ans:tipoFaturamento>${guia.tipoFaturamento}</ans:tipoFaturamento>` : ""}
            ${guia.tipoInternacao ? `<ans:tipoInternacao>${guia.tipoInternacao}</ans:tipoInternacao>` : ""}
            ${guia.regimeInternacao ? `<ans:regimeInternacao>${guia.regimeInternacao}</ans:regimeInternacao>` : ""}
            <ans:dataInicioFaturamento>${guia.dataInicio || ""}</ans:dataInicioFaturamento>${guia.horaInicioFaturamento ? `
            <ans:horaInicioFaturamento>${guia.horaInicioFaturamento}</ans:horaInicioFaturamento>` : ""}
            <ans:dataFinalFaturamento>${guia.dataFim || ""}</ans:dataFinalFaturamento>${guia.horaFinalFaturamento ? `
            <ans:horaFinalFaturamento>${guia.horaFinalFaturamento}</ans:horaFinalFaturamento>` : ""}
            ${guia.cid10Principal ? `<ans:CID>${guia.cid10Principal}</ans:CID>` : ""}
            ${guia.indicacaoClinica ? `<ans:indicacaoClinica>${escapeXml(guia.indicacaoClinica)}</ans:indicacaoClinica>` : ""}
            ${guia.indicadorAcidente ? `<ans:indicadorAcidente>${guia.indicadorAcidente}</ans:indicadorAcidente>` : ""}
            ${guia.motivoEncerramento ? `<ans:motivoEncerramento>${guia.motivoEncerramento}</ans:motivoEncerramento>` : ""}
          </ans:dadosInternacao>
          <ans:dadosSaida>
            ${guia.motivoEncerramento ? `<ans:motivoEncerramento>${guia.motivoEncerramento}</ans:motivoEncerramento>` : ""}
            ${guia.dataFim ? `<ans:dataSaida>${guia.dataFim}</ans:dataSaida>` : ""}
          </ans:dadosSaida>
          <ans:dadosExecutante>
            <ans:contratadoExecutante>
              <ans:codigoPrestadorNaOperadora>${prestador.codigo_prestador || ""}</ans:codigoPrestadorNaOperadora>
              <ans:nomeContratado>${escapeXml(prestador.nome_estabelecimento || "")}</ans:nomeContratado>
              <ans:CNES>${prestador.cnes || ""}</ans:CNES>
            </ans:contratadoExecutante>
          </ans:dadosExecutante>${procedimentos.length > 0 ? `
          <ans:procedimentosExecutados>
${itensXml}
          </ans:procedimentosExecutados>` : ""}${despesas.length > 0 ? `
          <ans:outrasDespesas>
${despesasXml}
          </ans:outrasDespesas>` : ""}
          <ans:valorTotal>
            <ans:valorProcedimentos>${valorProcedimentos}</ans:valorProcedimentos>${Number(valorDiarias) > 0 ? `
            <ans:valorDiarias>${valorDiarias}</ans:valorDiarias>` : ""}${Number(valorTaxas) > 0 ? `
            <ans:valorTaxasAlugueis>${valorTaxas}</ans:valorTaxasAlugueis>` : ""}${Number(valorMateriais) > 0 ? `
            <ans:valorMateriais>${valorMateriais}</ans:valorMateriais>` : ""}${Number(valorMedicamentos) > 0 ? `
            <ans:valorMedicamentos>${valorMedicamentos}</ans:valorMedicamentos>` : ""}${Number(valorOpme) > 0 ? `
            <ans:valorOPME>${valorOpme}</ans:valorOPME>` : ""}${Number(valorGases) > 0 ? `
            <ans:valorGasesMedicinais>${valorGases}</ans:valorGasesMedicinais>` : ""}
            <ans:valorTotal>${valorTotal}</ans:valorTotal>
          </ans:valorTotal>
        </ans:guiaResumoInternacao>
`;
}

// ========== EXCEL UNIMED FORM 3061 ==========

export async function gerarExcelUnimedForm3061(loteId: number): Promise<{ url: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Buscar lote
  const [lote] = await db.select().from(lotesFaturamento).where(eq(lotesFaturamento.id, loteId));
  if (!lote) throw new Error("Lote não encontrado");

  // Buscar guias do lote
  const guias = await db.select().from(guiasFaturamento).where(eq(guiasFaturamento.loteId, loteId));
  if (guias.length === 0) throw new Error("Lote não possui guias");

  // Buscar itens de todas as guias
  const guiaIds = guias.map(g => g.id);
  const todosItens = await db.select().from(itensGuiaFaturamento)
    .where(inArray(itensGuiaFaturamento.guiaId, guiaIds));

  // Buscar dados do prestador
  const [prestadorData] = await db.execute(sql`
    SELECT e.nome, e.cnpj
    FROM estabelecimentos e
    WHERE e.id = ${guias[0].estabelecimentoId}
    LIMIT 1
  `);
  const prestador = (prestadorData as any)?.[0] || {};

  // Importar ExcelJS dinamicamente
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  
  // Aba "Tipo de Serviço"
  const sheetTipos = workbook.addWorksheet("Planilha1");
  sheetTipos.addRow(["", "Tipo de Serviço*"]);
  sheetTipos.addRow(["", "CONSULTA"]);
  sheetTipos.addRow(["", "TERAPIA"]);
  sheetTipos.addRow(["", "EXAME"]);
  sheetTipos.addRow(["", "HM"]);

  // Aba principal "FORM 3061"
  const sheet = workbook.addWorksheet("FORM 3061");

  // Cabeçalho do formulário (linhas 1-12)
  sheet.addRow([]);
  sheet.addRow([]);
  sheet.addRow([]);
  sheet.addRow([]);
  sheet.addRow([]);
  sheet.addRow([]);
  sheet.addRow(["", "", "", "CÓDIGO - FORM 3061", "", "", "", "", "", "", "", "", "", "", "REVISÃO - Nº 00"]);
  sheet.addRow([]);
  sheet.addRow(["", "", "", "ORIENTAÇÕES IMPORTANTES:"]);
  sheet.addRow([]);
  sheet.addRow([]);
  
  const now = new Date();
  const dataEnvio = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getFullYear()).slice(-2)}`;
  
  sheet.addRow([
    "", "", "",
    `RAZÃO SOCIAL DO PRESTADOR:  `, "",
    prestador.nome || "",
    "", "",
    `CNPJ:     `, prestador.cnpj || "",
    "", "", "", "",
    "Data de Envio:", dataEnvio,
    "RESPONSÁVEL:", ""
  ]);

  // Cabeçalho da tabela
  sheet.addRow([
    "", "", "",
    "Seq.",
    "Código do Cartão Beneficiário *",
    "Nome Completo do Beneficiário*",
    "",
    "Nº Guia de\nAutorização*",
    "Código do Serviço",
    "Tipo de Serviço*",
    "Serviço Prestado*",
    "",
    "Data ou\nPeríodo de Atendimento*",
    "",
    "Quantidade do Serviço Prestado*",
    "",
    "Valor Unitário*",
    "Valor Total\n(Qtde × Vlr. Unit.)*"
  ]);

  // Dados
  let seq = 1;
  for (const guia of guias) {
    const itensGuia = todosItens.filter(i => i.guiaId === guia.id);
    for (const item of itensGuia) {
      const valorUnit = Number(item.valorUnitario || 0);
      const valorTotal = Number(item.valorTotal || 0);
      
      // Determinar tipo de serviço baseado no tipo do item
      let tipoServico = guia.tipoServico || "TERAPIA";
      if (item.tipoItem === "procedimento") tipoServico = guia.tipoServico || "CONSULTA";
      
      // Formatar período de atendimento
      const dataAtend = item.dataExecucao || guia.dataAtendimento || guia.dataInicio || "";
      
      sheet.addRow([
        "", "", "",
        seq,
        guia.carteirinha || "",
        guia.nomePaciente || "",
        "",
        guia.senha || guia.numeroGuiaOperadora || "",
        item.codigoProcedimento || "",
        tipoServico,
        item.descricao || "",
        "",
        dataAtend,
        "",
        item.quantidade || "1",
        "",
        formatCurrency(valorUnit),
        formatCurrency(valorTotal)
      ]);
      seq++;
    }
  }

  // Preencher linhas vazias até 25
  while (seq <= 25) {
    sheet.addRow(["", "", "", seq, "", "", "", "", "", "", "", "", "", "", "", "", "", "R$ 0.00"]);
    seq++;
  }

  // Gerar buffer
  const buffer = await workbook.xlsx.writeBuffer();
  
  // Salvar no S3
  const fileName = `faturamento/excel/${lote.numeroLote}-FORM3061.xlsx`;
  const { url } = await storagePut(fileName, Buffer.from(buffer as ArrayBuffer), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  // Atualizar lote
  await db.update(lotesFaturamento).set({
    excelUrl: url,
  }).where(eq(lotesFaturamento.id, loteId));

  return { url };
}

function mapTipoItemToCodigoDespesa(tipoItem: string): string {
  switch (tipoItem) {
    case "gases": return "1";
    case "medicamento": return "2";
    case "material": return "3";
    case "diaria": return "5";
    case "taxa": return "7";
    case "opme": return "8";
    default: return "3"; // material como fallback
  }
}

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function escapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
