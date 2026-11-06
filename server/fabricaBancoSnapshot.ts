import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, or, getTableColumns } from "drizzle-orm";
import { contasConvenioItens, contasConvenioResumo, convenios, fabricaContas } from "../drizzle/schema";
import { normalizarDataExecucao } from "./contratosPrecoAplicavel";
import { compararItensComPadroes } from "./services/comparadorPadroes";

export function hashBanco(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
// Derivado do schema existente, sem DDL: nenhuma coluna persistida fica fora
// da versão mesmo quando updated_at tem precisão de apenas um segundo.
const versionFields = Object.entries(getTableColumns(fabricaContas)).map(([key, column]) => [key, column.name]);
function instanteVersaoBanco(val: any) {
  if (val instanceof Date) return val.toISOString();
  const civil = String(val).replace(" ", "T");
  // O driver Drizzle interpreta timestamps SQL como UTC. Reproduzir isso no
  // SELECT cru, sem depender de TZ do processo ou remover segundos do token.
  return new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(civil) ? `${civil}Z` : civil).toISOString();
}
export function versaoContaBanco(row: any): string {
  return hashBanco(versionFields.map(([camel, snake]) => {
    const val = row[camel] ?? row[snake] ?? null;
    if (["updatedAt", "createdAt", "entradaSetorAtualEm", "dataEnvioConvenio", "dataRecebimentoSafatle"].includes(camel)) return val ? instanteVersaoBanco(val) : null;
    if (["dataEntrada", "dataAlta"].includes(camel)) return normalizarDataExecucao(val) || null;
    if (["valorFaturadoInicial", "valorFaturadoFinal"].includes(camel)) return val == null ? null : new Decimal(val).toFixed(2);
    return val instanceof Date ? val.toISOString() : val;
  }));
}
export function campoBanco(row: any, ...names: string[]): any {
  for (const name of names) for (const key of [name, name.toLowerCase(), name.toUpperCase()]) if (row[key] != null) return row[key];
  return null;
}
const text = (value: unknown): string | null => value == null || String(value).trim() === "" ? null : String(value).trim();
const norm = (value: unknown) => (text(value) || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
function decimal(value: unknown, fallback = "0") {
  try { const n = new Decimal(value == null ? fallback : String(value).replace(",", ".")); if (!n.isFinite() || n.isNegative()) throw new Error(); return n; }
  catch { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Valor ou quantidade inválidos na coleção do hospital." }); }
}
export function dataBanco(value: unknown): Date | null {
  const day = normalizarDataExecucao(value);
  return day ? new Date(`${day}T12:00:00.000Z`) : null;
}
function conflitoIdentidadeBanco(): never {
  throw new TRPCError({ code: "CONFLICT", message: "A consulta retornou identidades diferentes. Nenhum snapshot foi aplicado." });
}
/** Ausência é opcional; aliases ou valores presentes incompatíveis não são fallback. */
function campoIdentidadeBanco(row: any, keys: string[], normalize = (value: unknown) => text(value), preserveText = false) {
  const present = [...new Set(keys.flatMap(key => [key, key.toLowerCase(), key.toUpperCase()]))]
    .map(key => row[key]).filter(value => text(value) != null);
  const values = present.map(normalize);
  if (new Set(values).size > 1) conflitoIdentidadeBanco();
  return preserveText ? text(present[0]) : values[0] ?? null;
}
function dataIdentidadeBanco(value: unknown): string {
  const day = normalizarDataExecucao(value instanceof Date ? value : text(value));
  if (!day) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Data de identidade inválida na origem." });
  return day;
}
function headerRow(row: any) {
  const get = (...keys: string[]) => campoIdentidadeBanco(row, keys);
  const getName = (...keys: string[]) => campoIdentidadeBanco(row, keys, norm, true);
  return {
    numeroContaHospital: get("numconta", "numero_conta", "conta", "nr_interno_conta", "cd_reg_fat"),
    numeroAtendimento: get("numatend", "numero_atendimento", "atendimento", "atend", "nr_atendimento", "cd_atendimento"),
    numeroGuia: get("guiacobra", "guia_cobra", "guia", "nr_guia", "aihguia", "aih_guia", "autorizacao", "doc_convenio", "senha"),
    nomePaciente: getName("pacientenome", "nomepaciente", "nomepac", "nome_paciente", "paciente", "nm_pessoa_fisica", "nm_paciente"),
    carteiraBeneficiario: get("matricula", "carteirinha", "carteira", "numero_carteirinha"),
    convenioNome: getName("nomeconv", "nome_conv", "convenio", "nomeconvenio", "ds_convenio", "nm_convenio"),
    convenioCodigo: get("codconv", "cod_conv", "codigo_convenio", "cd_convenio"),
    convenioRegistroAns: get("registroAns", "registro_ans", "registroans", "registro_ans_convenio", "ans_convenio"),
    competencia: campoIdentidadeBanco(row, ["competencia", "mesprod", "mes_prod", "comp", "encerramento"], value => text(value)!.replace("-", "/")),
    dataEntrada: campoIdentidadeBanco(row, ["datainternacao", "dataint", "data_internacao", "dt_inicio", "data_entrada", "dt_entrada", "dt_atendimento"], dataIdentidadeBanco),
    dataAlta: campoIdentidadeBanco(row, ["dataalta", "datasai", "data_alta", "data_saida", "dt_fim", "dt_alta"], dataIdentidadeBanco),
    tipoAtendimento: getName("tipoatend", "tipo_atend", "tipo_atendimento", "tipo"),
  };
}
export type ColecaoBanco = Awaited<ReturnType<typeof prepararColecaoBanco>>;
export async function prepararColecaoBanco(db: any, hospitalId: number, numeroConta: string, rows: any[]) {
  numeroConta = numeroConta.trim();
  if (!rows.length) return { encontrada: false as const, hospitalId, numeroConta, hash: hashBanco([hospitalId, numeroConta, "AUSENTE"]), cabecalho: null, itens: [], valorTotal: "0.00" };
  const headers = rows.map(headerRow);
  // Uma busca por atendimento só resolve UMA conta real. Não escolher MAX, a
  // primeira conta ou um subconjunto de um resultado ambíguo, nem renumerá-la.
  const unique = <K extends keyof ReturnType<typeof headerRow>>(key: K) => {
    const values = headers.map(h => h[key]).filter(value => value != null);
    const compared = ["nomePaciente", "convenioNome", "tipoAtendimento"].includes(key) ? values.map(norm) : values;
    if (new Set(compared).size > 1) conflitoIdentidadeBanco();
    return values[0] ?? null;
  };
  const header = Object.fromEntries(Object.keys(headers[0]).map(key => [key, unique(key as keyof typeof headers[0])])) as ReturnType<typeof headerRow>;
  if (headers.some(h => !h.numeroContaHospital || !h.nomePaciente || (!h.convenioNome && !h.convenioCodigo && !h.convenioRegistroAns))
    || (!header.numeroAtendimento && !header.numeroGuia)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O hospital não retornou uma identidade completa da conta (conta, atendimento/guia, paciente e convênio)." });
  }
  if (!numeroConta || (header.numeroContaHospital !== numeroConta && header.numeroAtendimento !== numeroConta)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A conta real ou o atendimento retornado deve corresponder ao identificador solicitado." });
  }
  if (header.competencia && !/^\d{4}[-/](0[1-9]|1[0-2])$/.test(header.competencia)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Competência inválida na origem." });
  const conveniosHospital = await db.select().from(convenios).where(and(or(eq(convenios.estabelecimentoId, hospitalId), isNull(convenios.estabelecimentoId)), eq(convenios.ativo, "sim")));
  const activeConvs = conveniosHospital.filter((c: any) => (c.estabelecimentoId === null || Number(c.estabelecimentoId) === hospitalId) && c.ativo === "sim");
  // Código/ANS presentes são autoritativos e devem concordar; nunca fazer
  // fallback por nome quando não resolvem. Sem código, somente nome canônico
  // exato (caixa/acentos/trim). Equivalências de ERP devem ser explícitas na
  // query configurada, não inferidas por substring/pontuação nesta camada.
  const resolve = (h: ReturnType<typeof headerRow>) => activeConvs.filter((c: any) => {
    if (h.convenioCodigo && text(c.codigo) !== h.convenioCodigo && text(c.registroAns) !== h.convenioCodigo) return false;
    if (h.convenioRegistroAns && text(c.registroAns) !== h.convenioRegistroAns) return false;
    return h.convenioCodigo || h.convenioRegistroAns ? true : norm(c.nome) === norm(h.convenioNome);
  });
  const candidates = resolve(header);
  if (candidates.length !== 1 || !Number.isSafeInteger(Number(candidates[0].id)) || Number(candidates[0].id) <= 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O convênio da origem deve resolver exatamente um cadastro canônico ativo, global ou do hospital." });
  const convenio = candidates[0];
  for (const h of headers) {
    const rowCandidates = resolve(h);
    if (rowCandidates.length !== 1) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cada linha deve identificar um convênio canônico sem herdar código de outra linha." });
    if (Number(rowCandidates[0].id) !== Number(convenio.id)) conflitoIdentidadeBanco();
  }
  const cabecalho = { ...header, convenioId: Number(convenio.id), convenioNome: String(convenio.nome) };
  let total = new Decimal(0);
  const itens: any[] = [];
  for (const row of rows) {
    const get = (...keys: string[]) => campoBanco(row, ...keys);
    const codigoItem = text(get("codigoitem", "procdisco", "cod_item", "cd_item", "codigo_item", "codproc", "cd_procedimento", "cd_pro_fat"));
    const codigoItemTuss = text(get("codigoitemtuss", "codproprio", "cod_tuss", "codigo_tuss", "cd_item_tuss", "cd_procedimento_tuss"));
    const descricaoItem = text(get("descricao", "desc_item", "ds_item", "ds_procedimento", "ds_pro_fat", "descricao_procedimento"));
    const vt = decimal(get("valortotal", "vl_faturado", "valor_total", "vlfaturado", "valor_faturado", "vl_produzido", "vl_procedimento", "vl_total_conta", "valor_cobrado"));
    if (!codigoItem && !codigoItemTuss && !descricaoItem && vt.isZero()) continue;
    const qtdRaw = get("quantidade", "qtd", "qtde", "qt_procedimento", "qt_lancamento");
    const quantidade = qtdRaw == null ? null : decimal(qtdRaw).toFixed(4);
    const unit = get("valorunitario", "vl_unitario", "valor_unitario", "vlunitario", "vl_medico");
    const valorUnitario = unit == null ? null : decimal(unit).toFixed(4);
    if (vt.greaterThan("999999999999.99")) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Valor da origem excede a precisão suportada." });
    total = total.plus(vt);
    itens.push({ origem: "BANCO_CLIENTE", numeroConta: cabecalho.numeroContaHospital, numeroGuia: cabecalho.numeroGuia,
      pacienteNome: cabecalho.nomePaciente, carteiraBeneficiario: cabecalho.carteiraBeneficiario,
      convenio: cabecalho.convenioNome, convenioId: cabecalho.convenioId, estabelecimentoId: hospitalId,
      competencia: cabecalho.competencia, tipoItem: text(get("tipoproc", "tipo_proc", "tipo_item", "tipo")) || "OUTROS",
      codigoItem, codigoItemTuss, descricaoItem, quantidade, valorUnitario, valorTotal: vt.toFixed(2),
      dataExecucao: dataBanco(get("dataexecucao", "data", "dt_item", "data_execucao", "dt_procedimento", "dt_lancamento", "dt_conta")),
      profissionalExecutante: text(get("nomeprest", "prestexe", "nome_prest", "prof_exec")),
      setor: text(get("setor", "nomecc", "nome_cc", "centro_custo", "ds_setor_atendimento", "ds_unid_int")), statusAnalise: "pendente" });
  }
  itens.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { encontrada: true as const, hospitalId, numeroConta: cabecalho.numeroContaHospital!, cabecalho, itens, valorTotal: total.toFixed(2), hash: hashBanco([hospitalId, cabecalho, itens]) };
}

export function exigirEstadoBanco(conta: any, snapshot?: any) {
  if (!["recepcao", "faturamento", "auditoria_interna"].includes(conta.setorAtual)
    || !["fila", "em_andamento", "devolvido_erro"].includes(conta.statusSetor)
    || conta.arquivoXmlFaturamentoId || conta.arquivoXmlFinalId || conta.dataEnvioConvenio || conta.protocoloEnvioConvenio
    || (snapshot && snapshot.origem !== "BANCO_CLIENTE")) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Sincronização bancária permitida somente antes do envio, em Recepção, Faturamento ou Auditoria Interna, sem XML ativo." });
  }
}
export function exigirIdentidadeContaBanco(conta: any, colecao: ColecaoBanco) {
  if (Number(conta.hospitalEstabelecimentoId) !== colecao.hospitalId || conta.numeroContaHospital !== colecao.numeroConta) throw new TRPCError({ code: "CONFLICT", message: "A origem não pertence à conta persistida." });
  if (!colecao.encontrada) return;
  const h = colecao.cabecalho;
  if (Number(conta.convenioId) !== h.convenioId || (conta.numeroGuia || null) !== h.numeroGuia
    || (conta.numeroAtendimento || null) !== h.numeroAtendimento || norm(conta.nomePaciente) !== norm(h.nomePaciente)) {
    throw new TRPCError({ code: "CONFLICT", message: "Conta, atendimento/guia, paciente ou convênio diferem da identidade persistida. Use revisão cadastral; sincronização não revincula identidades." });
  }
}

/** numeroLote é um ESCOPO TÉCNICO BANCO, NÃO o lote financeiro do hospital.
 * O ID é o insertId real do resumo, sem fake arquivo/importbatch e sem DDL. */
export function loteSnapshotBanco(resumoId: number) { if (!Number.isSafeInteger(resumoId) || resumoId <= 0) throw new Error("INVALID_SUMMARY_ID"); return `BANCO:v1:${resumoId}`; }
export function filtrosSnapshotBanco(snapshot: any) {
  if (snapshot.origem !== "BANCO_CLIENTE" || snapshot.numeroLote !== loteSnapshotBanco(Number(snapshot.id)) || !snapshot.convenioId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Snapshot bancário legado sem escopo seguro. É necessária uma nova sincronização na esteira." });
  return [eq(contasConvenioItens.origem, "BANCO_CLIENTE"), eq(contasConvenioItens.estabelecimentoId, snapshot.estabelecimentoId),
    eq(contasConvenioItens.numeroConta, snapshot.numeroConta), eq(contasConvenioItens.convenioId, snapshot.convenioId),
    eq(contasConvenioItens.numeroLote, snapshot.numeroLote), snapshot.competencia == null ? isNull(contasConvenioItens.competencia) : eq(contasConvenioItens.competencia, snapshot.competencia)];
}
const headerResult = (r: any) => Array.isArray(r) ? r[0] : r;
export function exigirUmaLinhaBanco(result: any) { if (Number(headerResult(result)?.affectedRows) !== 1) throw new TRPCError({ code: "CONFLICT", message: "A conta ou snapshot foi alterado. Atualize a esteira." }); }
export async function inserirSnapshotBanco(tx: any, colecao: ColecaoBanco, usuarioId: number, conta: any) {
  const h = colecao.cabecalho;
  const result = await tx.insert(contasConvenioResumo).values({ origem: "BANCO_CLIENTE", numeroConta: colecao.numeroConta,
    estabelecimentoId: colecao.hospitalId, convenioId: h?.convenioId ?? conta.convenioId, convenio: h?.convenioNome ?? conta.convenioNome,
    pacienteNome: h?.nomePaciente ?? conta.nomePaciente, carteiraBeneficiario: h?.carteiraBeneficiario ?? null,
    competencia: h?.competencia ?? null, dataInternacao: dataBanco(h?.dataEntrada), dataAlta: dataBanco(h?.dataAlta),
    totalItens: colecao.itens.length, valorTotal: colecao.valorTotal, statusAnalise: "pendente", buscadoPor: usuarioId });
  const resumoId = Number(headerResult(result)?.insertId);
  const numeroLote = loteSnapshotBanco(resumoId);
  exigirUmaLinhaBanco(await tx.update(contasConvenioResumo).set({ numeroLote }).where(and(eq(contasConvenioResumo.id, resumoId), eq(contasConvenioResumo.estabelecimentoId, colecao.hospitalId), eq(contasConvenioResumo.origem, "BANCO_CLIENTE"))));
  for (let i = 0; i < colecao.itens.length; i += 100) await tx.insert(contasConvenioItens).values(colecao.itens.slice(i, i + 100).map(item => ({ ...item, numeroLote })));
  const snapshot = { id: resumoId, numeroLote, origem: "BANCO_CLIENTE", estabelecimentoId: colecao.hospitalId, numeroConta: colecao.numeroConta, convenioId: h?.convenioId ?? conta.convenioId, competencia: h?.competencia ?? null };
  const itens = await tx.select().from(contasConvenioItens).where(and(...filtrosSnapshotBanco(snapshot)));
  if (itens.length !== colecao.itens.length) throw new Error("SNAPSHOT_COLLECTION_MISMATCH");
  let statusAuditoriaRegras: "pendente" | "conforme" | "divergente" = "pendente", totalDivergenciasRegras = 0, scoreRiscoAuditoria = 0;
  let motivoAuditoriaPendente: string | null = "Origem sem itens ou ausente; auditoria pendente.";
  if (itens.length) {
    let comparison: Awaited<ReturnType<typeof compararItensComPadroes>> | null = null;
    try { comparison = await compararItensComPadroes({ numeroConta: colecao.numeroConta, estabelecimentoId: colecao.hospitalId, convenio: h?.convenioNome, itens, banco: tx }); }
    catch { motivoAuditoriaPendente = "Motor de regras não concluiu a comparação da coleção exata BANCO_CLIENTE."; }
    if (comparison && comparison.totalItensAnalisados === itens.length && ["conforme", "divergente"].includes(comparison.statusGeral)) {
      const ids = new Set(itens.map((item: any) => item.id));
      const unsafe = comparison.divergencias.some((d: any) => (d.itemId != null && !ids.has(d.itemId)) || (d.codigoItem && d.itemId == null && d.tipo !== "ITEM_FALTANTE"));
      if (!unsafe && itens.every((i: any) => i.dataExecucao != null && i.quantidade != null && i.valorUnitario != null)) {
        statusAuditoriaRegras = comparison.statusGeral as "conforme" | "divergente";
        totalDivergenciasRegras = comparison.divergencias.length; scoreRiscoAuditoria = Number(comparison.scoreRisco?.score || 0); motivoAuditoriaPendente = null;
        for (const item of itens) {
          const divs = comparison.divergencias.filter((d: any) => d.itemId === item.id);
          exigirUmaLinhaBanco(await tx.update(contasConvenioItens).set({ statusAnalise: divs.length ? "divergente" : "conforme", divergencias: divs.length ? divs : null })
            .where(and(eq(contasConvenioItens.id, item.id), ...filtrosSnapshotBanco(snapshot))));
        }
        exigirUmaLinhaBanco(await tx.update(contasConvenioResumo).set({ statusAnalise: statusAuditoriaRegras, totalDivergencias: totalDivergenciasRegras,
          scoreRisco: scoreRiscoAuditoria, detalhesRisco: comparison.scoreRisco, divergenciasGerais: comparison.divergencias.filter((d: any) => d.itemId == null) })
          .where(and(eq(contasConvenioResumo.id, resumoId), eq(contasConvenioResumo.estabelecimentoId, colecao.hospitalId))));
      } else motivoAuditoriaPendente = "Comparação sem associação exata por item ou dados de execução/quantidade/preço ausentes; auditoria pendente.";
    } else if (comparison) motivoAuditoriaPendente = "Comparação incompleta; não confirma conformidade do snapshot.";
  }
  return { possuiItensBaixados: itens.length > 0, totalItens: itens.length, valorTotal: Number(colecao.valorTotal), contaConvenioResumoId: resumoId,
    numeroLote, statusAuditoriaRegras, totalDivergenciasRegras, scoreRiscoAuditoria, motivoAuditoriaPendente, comparativo: null };
}
