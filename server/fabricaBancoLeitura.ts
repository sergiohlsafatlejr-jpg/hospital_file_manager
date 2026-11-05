import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { fabricaContas, contasConvenioResumo, contasConvenioItens } from "../drizzle/schema";
import { exigirHospitalProprietario } from "./hospitalScope";
import { exigirSetoresLoteColaborador } from "./fabricaPerfilColaborador";
import { exigirConvenioDoEstabelecimento } from "./recursoGlosaPermissions";
import { filtrosSnapshotBanco } from "./fabricaBancoSnapshot";
export async function resolverSnapshotLeituraBanco(db: any, usuario: any, input: {
  estabelecimentoId: number; numeroConta: string; fabricaContaId?: number; resumoId?: number; origem?: string;
}) {
  let id = input.resumoId;
  if (input.fabricaContaId) {
    const rows = await db.select().from(fabricaContas).where(and(eq(fabricaContas.id, input.fabricaContaId), eq(fabricaContas.hospitalEstabelecimentoId, input.estabelecimentoId)));
    if (rows.length !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada no hospital proprietário." });
    const conta = rows[0];
    await exigirHospitalProprietario(usuario, input.estabelecimentoId, "visualizar", db);
    await exigirSetoresLoteColaborador(db, usuario, [conta]);
    if (conta.numeroContaHospital !== input.numeroConta || conta.arquivoXmlFinalId || conta.arquivoXmlFaturamentoId
      || (id && Number(id) !== Number(conta.contaConvenioResumoId))) throw new TRPCError({ code: "CONFLICT", message: "O snapshot solicitado não é o bancário vigente desta conta." });
    id = Number(conta.contaConvenioResumoId);
    if (!id) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Conta sem snapshot bancário. Sincronize antes de abrir os detalhes." });
  }
  if (!id) {
    const summaries = await db.select().from(contasConvenioResumo).where(and(eq(contasConvenioResumo.numeroConta, input.numeroConta),
      eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId), eq(contasConvenioResumo.origem, "BANCO_CLIENTE")));
    if (!summaries.length && input.origem !== "BANCO_CLIENTE") return null;
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Informe fabricaContaId e/ou resumoId para ler exatamente uma versão bancária; busca somente por número não é segura." });
  }
  const summaries = await db.select().from(contasConvenioResumo).where(and(eq(contasConvenioResumo.id, id), eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId),
    eq(contasConvenioResumo.numeroConta, input.numeroConta), eq(contasConvenioResumo.origem, "BANCO_CLIENTE")));
  if (summaries.length !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Snapshot bancário não encontrado nesta identidade." });
  const snapshot = summaries[0];
  await exigirHospitalProprietario(usuario, input.estabelecimentoId, "visualizar", db);
  // resumoId não é capability: a autorização é sempre a da conta canônica,
  // inclusive quando o cliente omite fabricaContaId. Históricos não são ativos.
  const owners = await db.select().from(fabricaContas).where(and(
    eq(fabricaContas.hospitalEstabelecimentoId, input.estabelecimentoId),
    eq(fabricaContas.numeroContaHospital, input.numeroConta),
  ));
  if (owners.length !== 1) throw new TRPCError({ code: "CONFLICT", message: "Snapshot sem proprietário canônico único na esteira." });
  const owner = owners[0];
  await exigirSetoresLoteColaborador(db, usuario, [owner]);
  if ((input.fabricaContaId && Number(owner.id) !== input.fabricaContaId)
    || Number(owner.contaConvenioResumoId) !== Number(snapshot.id)
    || Number(owner.convenioId) !== Number(snapshot.convenioId)
    || owner.arquivoXmlFinalId || owner.arquivoXmlFaturamentoId) {
    throw new TRPCError({ code: "CONFLICT", message: "O snapshot solicitado não é o bancário vigente desta conta." });
  }
  await exigirConvenioDoEstabelecimento(usuario.id, snapshot.convenioId, input.estabelecimentoId, "visualizar", db);
  return { snapshot, itemConditions: filtrosSnapshotBanco(snapshot), resumoConditions: [eq(contasConvenioResumo.id, snapshot.id), eq(contasConvenioResumo.origem, "BANCO_CLIENTE")] };
}

/** Históricos BANCO versionados não entram em overview: apenas referências ativas da esteira. */
export function filtroResumoBancoAtivo() {
  return sql`(${contasConvenioResumo.origem} <> 'BANCO_CLIENTE' OR (${contasConvenioResumo.numeroLote} LIKE 'BANCO:v1:%' AND EXISTS (
    SELECT 1 FROM fabrica_contas f168 WHERE f168.conta_convenio_resumo_id = ${contasConvenioResumo.id}
      AND f168.hospital_estabelecimento_id = ${contasConvenioResumo.estabelecimentoId}
      AND f168.numero_conta_hospital = ${contasConvenioResumo.numeroConta}
      AND f168.convenio_id = ${contasConvenioResumo.convenioId})))`;
}
export function filtroItemBancoAtivo() {
  return sql`(${contasConvenioItens.origem} <> 'BANCO_CLIENTE' OR (${contasConvenioItens.numeroLote} LIKE 'BANCO:v1:%' AND EXISTS (
    SELECT 1 FROM fabrica_contas f168 JOIN contas_convenio_resumo r168 ON r168.id = f168.conta_convenio_resumo_id
    WHERE r168.origem = 'BANCO_CLIENTE' AND r168.numeroLote = ${contasConvenioItens.numeroLote}
      AND r168.estabelecimentoId = ${contasConvenioItens.estabelecimentoId} AND r168.numeroConta = ${contasConvenioItens.numeroConta}
      AND f168.hospital_estabelecimento_id = r168.estabelecimentoId AND f168.numero_conta_hospital = r168.numeroConta
      AND f168.convenio_id = r168.convenioId AND r168.convenioId = ${contasConvenioItens.convenioId} AND r168.competencia <=> ${contasConvenioItens.competencia})))`;
}
export async function negarMutacaoBancoSemEscopo(db: any, numeroConta: string, hospitalId: number) {
  const bank = await db.select({ id: contasConvenioResumo.id }).from(contasConvenioResumo).where(and(eq(contasConvenioResumo.numeroConta, numeroConta),
    eq(contasConvenioResumo.estabelecimentoId, hospitalId), eq(contasConvenioResumo.origem, "BANCO_CLIENTE")));
  if (bank.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Snapshots bancários são versionados. Faça a sincronização/auditoria pela esteira; operação sem escopo recusada." });
}
