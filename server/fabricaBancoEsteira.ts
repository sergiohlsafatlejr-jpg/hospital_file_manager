import { TRPCError } from "@trpc/server";
import { and, eq, sql, desc } from "drizzle-orm";
import { fabricaContas, fabricaHistoricoFluxo, contasConvenioResumo, estabelecimentos } from "../drizzle/schema";
import { exigirHospitalProprietario, type UsuarioHospital } from "./hospitalScope";
import { exigirSetoresLoteColaborador, exigirSetorColaborador } from "./fabricaPerfilColaborador";
import { exigirConvenioDoEstabelecimento } from "./recursoGlosaPermissions";
import { exigirEstadoBanco, exigirIdentidadeContaBanco, exigirUmaLinhaBanco, hashBanco, inserirSnapshotBanco, versaoContaBanco, type ColecaoBanco } from "./fabricaBancoSnapshot";
const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
function exigirConvenioCanonicoAtivoBanco(convenio: any, hospitalId: number) {
  if (convenio.estabelecimentoId !== null && Number(convenio.estabelecimentoId) !== Number(hospitalId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Convênio sem proprietário canônico autorizado." });
  }
  if (convenio.ativo !== "sim") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Convênio canônico inativo; operação bancária recusada." });
}
export async function autorizarContaBanco(tx: any, usuario: UsuarioHospital, conta: any) {
  await exigirHospitalProprietario(usuario, Number(conta.hospitalEstabelecimentoId), "editar", tx);
  await exigirSetoresLoteColaborador(tx, usuario, [conta]);
  if (!conta.convenioId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Defina o convênio canônico do hospital antes de sincronizar." });
  const convenio = await exigirConvenioDoEstabelecimento(usuario.id, Number(conta.convenioId), Number(conta.hospitalEstabelecimentoId), "editar", tx);
  exigirConvenioCanonicoAtivoBanco(convenio, conta.hospitalEstabelecimentoId);
  const summaries = conta.contaConvenioResumoId ? await tx.select().from(contasConvenioResumo).where(eq(contasConvenioResumo.id, conta.contaConvenioResumoId)).for("update") : [];
  if (conta.contaConvenioResumoId && (summaries.length !== 1 || Number(summaries[0].estabelecimentoId) !== Number(conta.hospitalEstabelecimentoId)
    || summaries[0].numeroConta !== conta.numeroContaHospital || Number(summaries[0].convenioId) !== Number(conta.convenioId))) {
    throw new TRPCError({ code: "CONFLICT", message: "O snapshot vigente não corresponde à identidade da conta." });
  }
  exigirEstadoBanco(conta, summaries[0]);
  return summaries[0] || null;
}
export async function atualizarContaBanco(tx: any, conta: any, updates: any) {
  // Além do lock, CAS em estado, versão e referência ativa. Nunca trocar identidade.
  exigirUmaLinhaBanco(await tx.update(fabricaContas).set(updates).where(and(
    eq(fabricaContas.id, conta.id), eq(fabricaContas.hospitalEstabelecimentoId, conta.hospitalEstabelecimentoId),
    eq(fabricaContas.setorAtual, conta.setorAtual), eq(fabricaContas.statusSetor, conta.statusSetor),
    sql`${fabricaContas.contaConvenioResumoId} <=> ${conta.contaConvenioResumoId ?? null}`,
    sql`${fabricaContas.arquivoXmlFinalId} <=> ${conta.arquivoXmlFinalId ?? null}`,
    sql`${fabricaContas.arquivoXmlFaturamentoId} <=> ${conta.arquivoXmlFaturamentoId ?? null}`,
    eq(fabricaContas.updatedAt, conta.updatedAt),
  )));
}
function marker(row: any): any { try { const v = JSON.parse(row.observacao); return v.issue168Banco === 1 ? v : null; } catch { return null; } }
type PedidoReplayBanco = {
  usuario: UsuarioHospital; contaId: number; expectedVersion: string; idempotencyKey?: string; avancar: boolean;
};
const pedidoHash = (p: PedidoReplayBanco) => hashBanco([p.contaId, p.usuario.id, p.expectedVersion, p.avancar]);
async function reconciliarTentativaBanco(tx: any, conta: any, params: PedidoReplayBanco, key: string, operation?: string) {
  // Mantém hospital e convênio atuais. O marker só pode provar uma tentativa
  // confirmada do mesmo operador, nunca autoriza uma nova operação no destino.
  await exigirHospitalProprietario(params.usuario, Number(conta.hospitalEstabelecimentoId), "editar", tx);
  const history = await tx.select().from(fabricaHistoricoFluxo).where(and(
    eq(fabricaHistoricoFluxo.fabricaContaId, conta.id), eq(fabricaHistoricoFluxo.hospitalEstabelecimentoId, conta.hospitalEstabelecimentoId),
    eq(fabricaHistoricoFluxo.usuarioId, params.usuario.id), eq(fabricaHistoricoFluxo.acao, "conta_sincronizada_banco"),
  )).orderBy(desc(fabricaHistoricoFluxo.id));
  const confirmed = history.find((h: any) => marker(h)?.key === key);
  if (!confirmed) return null;
  const replay = marker(confirmed);
  if (replay.requestHash !== pedidoHash(params) || (operation && replay.operation !== operation)
    || replay.result.expectedVersion !== versaoContaBanco(conta)) {
    throw new TRPCError({ code: "CONFLICT", message: "Chave já utilizada com pedido distinto ou conta alterada após a sincronização." });
  }
  const convenio = await exigirConvenioDoEstabelecimento(params.usuario.id, Number(conta.convenioId), Number(conta.hospitalEstabelecimentoId), "editar", tx);
  exigirConvenioCanonicoAtivoBanco(convenio, conta.hospitalEstabelecimentoId);
  const snapshots = await tx.select().from(contasConvenioResumo).where(eq(contasConvenioResumo.id, conta.contaConvenioResumoId)).for("update");
  if (snapshots.length !== 1 || replay.snapshotHash !== hashBanco(snapshots[0])) {
    throw new TRPCError({ code: "CONFLICT", message: "O snapshot confirmado foi alterado após a sincronização." });
  }
  try {
    await exigirSetoresLoteColaborador(tx, params.usuario, [conta]);
    return { ...replay.result, replay: true, reconciliacaoRestrita: false };
  } catch (error) {
    if (!(error instanceof TRPCError) || error.code !== "FORBIDDEN") throw error;
    await exigirSetorColaborador(tx, params.usuario, [confirmed.setorOrigem], [conta.hospitalEstabelecimentoId]);
    // Sem valores, itens, versão utilizável ou dados do novo setor.
    return { sucesso: true, fabricaContaId: conta.id, replay: true, reconciliacaoRestrita: true,
      avancouParaAuditoriaInterna: Boolean(replay.result.avancouParaAuditoriaInterna),
      mensagem: "Sua tentativa já foi confirmada; conta encaminhada. Nenhuma nova sincronização foi executada." };
  }
}
/** Retry com chave explícita não depende de disponibilidade/conteúdo remoto. */
export async function tentarReplayEsteiraBanco(params: PedidoReplayBanco & { db: any; hospitalId: number }) {
  if (!params.idempotencyKey) return null;
  if (typeof params.db.transaction !== "function") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Transação local obrigatória indisponível." });
  return params.db.transaction(async (tx: any) => {
    const hospitals = await tx.select().from(estabelecimentos).where(eq(estabelecimentos.id, params.hospitalId)).for("update");
    if (hospitals.length !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Hospital proprietário não encontrado." });
    const rows = await tx.select().from(fabricaContas).where(eq(fabricaContas.id, params.contaId)).for("update");
    if (rows.length !== 1 || Number(rows[0].hospitalEstabelecimentoId) !== params.hospitalId) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada no hospital proprietário." });
    return reconciliarTentativaBanco(tx, rows[0], params, hashBanco([params.usuario.id, params.idempotencyKey]));
  });
}
export async function sincronizarEsteiraBanco(params: {
  db: any; usuario: UsuarioHospital; usuarioNome: string; contaId: number; expectedVersion: string; expectedSnapshotHash?: string; idempotencyKey?: string;
  avancar: boolean; colecao: ColecaoBanco;
}) {
  const { db, usuario, colecao } = params;
  if (typeof db.transaction !== "function") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Transação local obrigatória indisponível." });
  const operation = hashBanco([params.contaId, usuario.id, params.expectedVersion, colecao.hash, params.avancar]);
  const key = hashBanco([usuario.id, params.idempotencyKey || operation]);
  return db.transaction(async (tx: any) => {
    const hospitals = await tx.select().from(estabelecimentos).where(eq(estabelecimentos.id, colecao.hospitalId)).for("update");
    if (hospitals.length !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Hospital proprietário não encontrado." });
    const rows = await tx.select().from(fabricaContas).where(eq(fabricaContas.id, params.contaId)).for("update");
    if (rows.length !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada." });
    const conta = rows[0];
    const mesmaConta = await tx.select().from(fabricaContas).where(and(eq(fabricaContas.hospitalEstabelecimentoId, colecao.hospitalId), eq(fabricaContas.numeroContaHospital, colecao.numeroConta))).for("update");
    if (mesmaConta.length !== 1 || Number(mesmaConta[0].id) !== Number(conta.id)) throw new TRPCError({ code: "CONFLICT", message: "Há mais de um cadastro para a conta hospitalar. Revise a identidade antes de sincronizar." });
    const replay = await reconciliarTentativaBanco(tx, conta, params, key, operation);
    if (replay) return replay;
    const anterior = await autorizarContaBanco(tx, usuario, conta);
    if (params.expectedSnapshotHash && params.expectedSnapshotHash !== hashBanco(anterior)) throw new TRPCError({ code: "CONFLICT", message: "O snapshot ativo foi alterado durante a leitura hospitalar." });
    exigirIdentidadeContaBanco(conta, colecao);
    if (params.expectedVersion !== versaoContaBanco(conta)) throw new TRPCError({ code: "CONFLICT", message: "A conta mudou desde a visualização. Atualize a esteira antes de sincronizar." });
    const info = await inserirSnapshotBanco(tx, colecao, usuario.id, conta);
    const avancou = params.avancar && info.possuiItensBaixados && ["recepcao", "faturamento"].includes(conta.setorAtual);
    const updates: any = { contaConvenioResumoId: info.contaConvenioResumoId, valorFaturadoFinal: colecao.valorTotal,
      valorFaturadoInicial: conta.contaConvenioResumoId ? conta.valorFaturadoInicial : colecao.valorTotal,
      totalItensXml: info.totalItens, statusAuditoriaRegras: info.statusAuditoriaRegras,
      totalDivergenciasRegras: info.totalDivergenciasRegras, scoreRiscoAuditoria: info.scoreRiscoAuditoria };
    if (avancou) Object.assign(updates, { setorAtual: "auditoria_interna", statusSetor: "fila", entradaSetorAtualEm: now(), responsavelAtualId: null, responsavelAtualNome: null,
      faturistaId: conta.faturistaId || usuario.id, faturistaNome: conta.faturistaNome || params.usuarioNome });
    await atualizarContaBanco(tx, conta, updates);
    const [persistida] = await tx.select().from(fabricaContas).where(eq(fabricaContas.id, conta.id));
    if (!persistida) throw new Error("MISSING_ACCOUNT_AFTER_UPDATE");
    const comparativo = anterior ? { hadPreviousData: true, valorAnterior: Number(anterior.valorTotal), valorNovo: info.valorTotal,
      diferencaValor: info.valorTotal - Number(anterior.valorTotal), totalItensAnterior: Number(anterior.totalItens), totalItensNovo: info.totalItens,
      itensAdicionados: Math.max(0, info.totalItens - Number(anterior.totalItens)), itensRemovidos: Math.max(0, Number(anterior.totalItens) - info.totalItens) } : null;
    const result = { sucesso: true, fabricaContaId: conta.id, numeroConta: conta.numeroContaHospital, fonteDados: "BANCO_REMOTO" as const,
      ...info, comparativo, expectedVersion: versaoContaBanco(persistida), avancouParaAuditoriaInterna: avancou, encontradaNaOrigem: colecao.encontrada,
      mensagem: colecao.encontrada ? "Snapshot bancário sincronizado atomicamente." : "Ausência confirmada na origem: valor ativo zerado e auditoria pendente; histórico preservado." };
    const [snapshotConfirmado] = await tx.select().from(contasConvenioResumo).where(eq(contasConvenioResumo.id, info.contaConvenioResumoId));
    if (!snapshotConfirmado) throw new Error("MISSING_COMMITTED_SNAPSHOT");
    await tx.insert(fabricaHistoricoFluxo).values({ fabricaContaId: conta.id, hospitalEstabelecimentoId: conta.hospitalEstabelecimentoId,
      setorOrigem: conta.setorAtual, setorDestino: updates.setorAtual || conta.setorAtual, acao: "conta_sincronizada_banco", usuarioId: usuario.id, usuarioNome: params.usuarioNome,
      dataEntradaSetor: now(), dataSaidaSetor: now(), duracaoSegundos: 0, valorMovimentado: colecao.valorTotal,
      // Metadados operacionais sem paciente/guia/binds. A resposta guardada não inclui cabeçalho.
      observacao: JSON.stringify({ issue168Banco: 1, key, operation, requestHash: pedidoHash(params), snapshotHash: hashBanco(snapshotConfirmado), collectionHash: colecao.hash, expectedVersion: params.expectedVersion, result }) });
    return { ...result, replay: false };
  });
}

/** Cadastro e snapshot/históricos na mesma transação; falha nunca retorna cadastro bem-sucedido. */
export async function cadastrarRecepcaoBanco(params: {
  db: any; usuario: UsuarioHospital; usuarioNome: string; values: any; colecao: ColecaoBanco | null; idempotencyKey?: string;
  encaminhar: boolean; observacao: string;
}) {
  const { db, usuario, values, colecao } = params;
  if (typeof db.transaction !== "function") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Transação local obrigatória indisponível." });
  const operation = hashBanco([usuario.id, values, colecao?.hash ?? null, params.encaminhar]);
  const key = hashBanco([usuario.id, params.idempotencyKey || operation]);
  return db.transaction(async (tx: any) => {
    // Serializa recepções do mesmo hospital para unicidade canônica sem criar constraint/DDL.
    const hospitals = await tx.select().from(estabelecimentos).where(eq(estabelecimentos.id, values.hospitalEstabelecimentoId)).for("update");
    if (hospitals.length !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Hospital não encontrado." });
    await exigirHospitalProprietario(usuario, values.hospitalEstabelecimentoId, "editar", tx);
    await exigirSetorColaborador(tx, usuario, ["recepcao"], [values.hospitalEstabelecimentoId]);
    if (values.convenioId) {
      const convenio = await exigirConvenioDoEstabelecimento(usuario.id, values.convenioId, values.hospitalEstabelecimentoId, "editar", tx);
      exigirConvenioCanonicoAtivoBanco(convenio, values.hospitalEstabelecimentoId);
    }
    const historicoChave = await tx.select().from(fabricaHistoricoFluxo).where(and(eq(fabricaHistoricoFluxo.hospitalEstabelecimentoId, values.hospitalEstabelecimentoId),
      eq(fabricaHistoricoFluxo.usuarioId, usuario.id), eq(fabricaHistoricoFluxo.acao, "recepcionado_banco")));
    const chaveUsada = historicoChave.map(marker).find((h: any) => h?.key === key);
    if (chaveUsada && chaveUsada.operation !== operation) throw new TRPCError({ code: "CONFLICT", message: "Chave de cadastro já utilizada com identidade ou conteúdo distinto." });
    const candidates = await tx.select().from(fabricaContas).where(and(eq(fabricaContas.hospitalEstabelecimentoId, values.hospitalEstabelecimentoId),
      sql`${fabricaContas.numeroContaHospital} <=> ${values.numeroContaHospital}`)).for("update");
    if (candidates.length) {
      const history = await tx.select().from(fabricaHistoricoFluxo).where(and(eq(fabricaHistoricoFluxo.hospitalEstabelecimentoId, values.hospitalEstabelecimentoId),
        eq(fabricaHistoricoFluxo.usuarioId, usuario.id), eq(fabricaHistoricoFluxo.acao, "recepcionado_banco")));
      const replay = history.map(marker).find((h: any) => h?.key === key);
      if (replay && replay.operation === operation && candidates.some((c: any) => c.id === replay.result.id && versaoContaBanco(c) === replay.result.expectedVersion)) return { ...replay.result, replay: true };
      throw new TRPCError({ code: "CONFLICT", message: "Conta hospitalar já recepcionada ou chave de cadastro reutilizada." });
    }
    if (colecao) { if (!colecao.encontrada) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada na origem; nenhum cadastro foi gravado." }); exigirIdentidadeContaBanco(values, colecao); }
    const inserted = await tx.insert(fabricaContas).values(values);
    const id = Number((Array.isArray(inserted) ? inserted[0] : inserted)?.insertId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("INVALID_ACCOUNT_ID");
    const [conta] = await tx.select().from(fabricaContas).where(eq(fabricaContas.id, id)).for("update");
    if (!conta) throw new Error("MISSING_INSERTED_ACCOUNT");
    const info = colecao ? await inserirSnapshotBanco(tx, colecao, usuario.id, conta) : null;
    if (info) await atualizarContaBanco(tx, conta, { contaConvenioResumoId: info.contaConvenioResumoId, valorFaturadoInicial: colecao!.valorTotal, valorFaturadoFinal: colecao!.valorTotal,
      totalItensXml: info.totalItens, statusAuditoriaRegras: info.statusAuditoriaRegras, totalDivergenciasRegras: info.totalDivergenciasRegras, scoreRiscoAuditoria: info.scoreRiscoAuditoria });
    const [persistida] = await tx.select().from(fabricaContas).where(eq(fabricaContas.id, id));
    const result = { sucesso: true, id, itensSincronizados: info, expectedVersion: versaoContaBanco(persistida), mensagem: "Conta recepcionada atomicamente." };
    await tx.insert(fabricaHistoricoFluxo).values({ fabricaContaId: id, hospitalEstabelecimentoId: values.hospitalEstabelecimentoId,
      setorOrigem: null, setorDestino: values.setorAtual, acao: "recepcionado_banco", usuarioId: usuario.id, usuarioNome: params.usuarioNome,
      dataEntradaSetor: values.dataRecebimentoSafatle, dataSaidaSetor: now(), duracaoSegundos: 0,
      observacao: JSON.stringify({ issue168Banco: 1, key, operation, result }) });
    if (params.observacao) await tx.insert(fabricaHistoricoFluxo).values({ fabricaContaId: id, hospitalEstabelecimentoId: values.hospitalEstabelecimentoId,
      setorOrigem: "recepcao", setorDestino: "recepcao", acao: "observacao_recepcao", usuarioId: usuario.id, usuarioNome: params.usuarioNome, dataSaidaSetor: now(), observacao: params.observacao });
    if (params.encaminhar) await tx.insert(fabricaHistoricoFluxo).values({ fabricaContaId: id, hospitalEstabelecimentoId: values.hospitalEstabelecimentoId,
      setorOrigem: "recepcao", setorDestino: "faturamento", acao: "encaminhado", usuarioId: usuario.id, usuarioNome: params.usuarioNome, dataSaidaSetor: now(), observacao: "Encaminhado pela Recepção." });
    return { ...result, replay: false };
  });
}
