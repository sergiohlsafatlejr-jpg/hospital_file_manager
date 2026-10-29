import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb, verificarPermissaoEstabelecimento } from "../db";
import { exigirConvenioDoEstabelecimento } from "../recursoGlosaPermissions";
import {
  autorizarLoteHospitalar,
  exigirAcessoFabrica,
  exigirHospitalProprietario,
  resolverHospitaisAutorizados,
  ESTABELECIMENTO_CENTRAL_SAFATLE,
  type HospitalAcao,
  type UsuarioHospital,
} from "../hospitalScope";
import {
  fabricaContas,
  fabricaHistoricoFluxo,
  fabricaErrosConta,
  fabricaMetas,
  fabricaSetorEnum,
  fabricaStatusSetorEnum,
  fabricaTipoAtendimentoEnum,
  estabelecimentos,
  convenios,
  users,
  arquivos,
  faturamentoTiss,
  contasConvenioItens,
  contasConvenioResumo,
} from "../../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { parseXML } from "../parsers";
import { compararContaComPadroes } from "../services/comparadorPadroes";
import { logger } from "../_core/logger";


function toMysqlDateTime(date: Date = new Date()): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function usuarioFabrica(ctx: { user: UsuarioHospital | null }): UsuarioHospital {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário autenticado obrigatório." });
  }
  return { id: ctx.user.id, role: ctx.user.role };
}

async function obterDbFabrica() {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Configuração da Fábrica de Faturamento indisponível.",
    });
  }
  return db;
}

function erroDeEstruturaFabrica(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; cause?: unknown } | undefined;
  const code = candidate?.code || "";
  const message = String(candidate?.message || "");
  return ["ER_NO_SUCH_TABLE", "ER_BAD_TABLE_ERROR", "ER_NO_SUCH_COLUMN", "ER_BAD_FIELD_ERROR"].includes(code)
    || /(?:table|column).*(?:doesn't exist|not found|unknown)/i.test(message)
    || (candidate?.cause ? erroDeEstruturaFabrica(candidate.cause) : false);
}

const fabricaProcedure = protectedProcedure.use(async ({ next }) => {
  try {
    const result = await next();
    if (!result.ok && erroDeEstruturaFabrica(result.error)) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Configuração da Fábrica de Faturamento ausente ou incompatível.",
      });
    }
    return result;
  } catch (error) {
    if (!erroDeEstruturaFabrica(error)) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Configuração da Fábrica de Faturamento ausente ou incompatível.",
    });
  }
});

async function resolverEscopoFabrica(
  usuario: UsuarioHospital,
  hospitalId?: number | null,
  acao: HospitalAcao = "visualizar",
): Promise<number[]> {
  await exigirAcessoFabrica(usuario);
  return resolverHospitaisAutorizados(usuario, hospitalId, acao);
}

function filtroHospitaisSql(coluna: string, hospitalIds: readonly number[]) {
  if (!hospitalIds.length) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Nenhum hospital autorizado para esta operação." });
  }
  return sql`${sql.raw(coluna)} IN (${sql.join(hospitalIds.map((id) => sql`${id}`), sql`, `)})`;
}

async function exigirColaboradorNoEscopo(
  colaboradorId: number,
  hospitalIds: readonly number[],
): Promise<void> {
  for (const hospitalId of [...new Set(hospitalIds)]) {
    const autorizado = await verificarPermissaoEstabelecimento(colaboradorId, hospitalId, "visualizar");
    if (!autorizado) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "O colaborador informado não está autorizado no hospital de origem.",
      });
    }
  }
}

async function podeGerenciarMetaGlobal(usuario: UsuarioHospital): Promise<boolean> {
  return verificarPermissaoEstabelecimento(usuario.id, ESTABELECIMENTO_CENTRAL_SAFATLE, "gerenciar");
}

export const fabricaFaturamentoRouter = router({
  // ============================================================
  // 1. LISTAR DADOS AUXILIARES (HOSPITAIS, CONVÊNIOS, COLABORADORES)
  // ============================================================
  dadosAuxiliares: fabricaProcedure.query(async ({ ctx }) => {
    const usuario = usuarioFabrica(ctx);
    const hospitalIds = await resolverEscopoFabrica(usuario, null, "visualizar");
    const db = await obterDbFabrica();
    const hospitaisScope = filtroHospitaisSql("e.id", hospitalIds);
    const conveniosScope = filtroHospitaisSql("c.estabelecimentoId", hospitalIds);
    const colaboradoresScope = filtroHospitaisSql("pe.estabelecimentoId", hospitalIds);
    const [hospitaisResult, conveniosResult, colaboradoresResult] = await Promise.all([
      db.execute(sql`SELECT e.id, e.nome, e.cnpj, e.cnes FROM estabelecimentos e
        WHERE e.ativo = 'sim' AND ${hospitaisScope} ORDER BY e.nome`),
      db.execute(sql`SELECT c.id, c.nome, c.codigo, c.registro_ans as registroAns,
          c.estabelecimentoId FROM convenios c
        WHERE c.ativo = 'sim' AND (c.estabelecimentoId IS NULL OR ${conveniosScope}) ORDER BY c.nome`),
      db.execute(sql`SELECT DISTINCT u.id, u.name, u.role FROM users u
        INNER JOIN permissoesEstabelecimento pe ON pe.userId = u.id
        WHERE pe.podeVisualizar = 'sim' AND ${colaboradoresScope} ORDER BY u.name, u.id`),
    ]);
    const hospitais = (hospitaisResult as any)[0] || [];
    const conveniosAutorizados = (conveniosResult as any)[0] || [];
    const colaboradores = (colaboradoresResult as any)[0] || [];
    return {
      hospitais,
      convenios: conveniosAutorizados,
      colaboradores: colaboradores.map((u: any) => ({ id: Number(u.id), nome: u.name || `Usuário #${u.id}`, role: u.role })),
    };
  }),

  // ============================================================
  // 2. RECEPÇÃO DE CONTAS: CADASTRAR NOVA CONTA
  // ============================================================
  cadastrarContaRecepcao: fabricaProcedure
    .input(
      z.object({
        hospitalEstabelecimentoId: z.number().positive("Selecione o hospital"),
        convenioId: z.number().optional().nullable(),
        convenioNome: z.string().optional().nullable(),
        numeroAtendimento: z.string().optional().nullable(),
        numeroContaHospital: z.string().optional().nullable(),
        numeroGuia: z.string().optional().nullable(),
        nomePaciente: z.string().min(2, "Informe o nome do paciente"),
        tipoAtendimento: z.enum(fabricaTipoAtendimentoEnum).default("internacao"),
        dataEntrada: z.string().min(8, "Informe a data de entrada"),
        dataAlta: z.string().optional().nullable(),
        dataRecebimentoSafatle: z.string().min(8, "Informe a data de recebimento na Safatle"),
        observacoes: z.string().optional().nullable(),
        encaminharDiretoFaturamento: z.boolean().default(false),
        faturistaId: z.number().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const usuario = usuarioFabrica(ctx);
      await resolverEscopoFabrica(usuario, input.hospitalEstabelecimentoId, "editar");
      const db = await obterDbFabrica();
      let nomeConv = input.convenioNome || null;
      if (input.convenioId) {
        const convenio = await exigirConvenioDoEstabelecimento(usuario.id, input.convenioId, input.hospitalEstabelecimentoId, "editar");
        nomeConv = convenio.nome || nomeConv;
      }
      let faturistaNome: string | null = null;
      if (input.faturistaId) {
        await exigirColaboradorNoEscopo(input.faturistaId, [input.hospitalEstabelecimentoId]);
        const [fat] = await db.select({ name: users.name }).from(users).where(eq(users.id, input.faturistaId)).limit(1);
        if (!fat) throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
        faturistaNome = fat.name || `Usuário #${input.faturistaId}`;
      }
      const dataRecebNorm =
        input.dataRecebimentoSafatle.length === 10
          ? `${input.dataRecebimentoSafatle} 08:00:00`
          : input.dataRecebimentoSafatle.replace("T", " ").slice(0, 19);

      const setorInicial = input.encaminharDiretoFaturamento ? "faturamento" : "recepcao";
      const statusInicial =
        input.encaminharDiretoFaturamento && input.faturistaId ? "em_andamento" : "fila";

      const nowStr = toMysqlDateTime();
      const usuarioNome = ctx.user.name || ctx.user.email || `Usuário #${ctx.user.id}`;

      const [insertRes] = await db.insert(fabricaContas).values({
        hospitalEstabelecimentoId: input.hospitalEstabelecimentoId,
        convenioId: input.convenioId || null,
        convenioNome: nomeConv,
        numeroAtendimento: input.numeroAtendimento?.trim() || null,
        numeroContaHospital: input.numeroContaHospital?.trim() || null,
        numeroGuia: input.numeroGuia?.trim() || null,
        nomePaciente: input.nomePaciente.trim(),
        tipoAtendimento: input.tipoAtendimento,
        dataEntrada: input.dataEntrada.slice(0, 10),
        dataAlta: input.dataAlta ? input.dataAlta.slice(0, 10) : null,
        dataRecebimentoSafatle: dataRecebNorm,
        setorAtual: setorInicial,
        statusSetor: statusInicial,
        recepcionadoPorId: ctx.user.id,
        recepcionadoPorNome: usuarioNome,
        responsavelAtualId: input.faturistaId || ctx.user.id,
        responsavelAtualNome: faturistaNome || usuarioNome,
        faturistaId: input.faturistaId || null,
        faturistaNome: faturistaNome,
        observacoes: input.observacoes?.trim() || null,
      });

      const contaId = Number((insertRes as any).insertId);

      // Registrar histórico de entrada na Recepção
      await db.insert(fabricaHistoricoFluxo).values({
        fabricaContaId: contaId,
        hospitalEstabelecimentoId: input.hospitalEstabelecimentoId,
        setorOrigem: null,
        setorDestino: "recepcao",
        acao: "recepcionado",
        usuarioId: ctx.user.id,
        usuarioNome,
        dataEntradaSetor: dataRecebNorm,
        dataSaidaSetor: nowStr,
        duracaoSegundos: 0,
        observacao: input.observacoes || "Cadastro inicial na Recepção de Contas Safatle",
      });

      if (input.encaminharDiretoFaturamento) {
        await db.insert(fabricaHistoricoFluxo).values({
          fabricaContaId: contaId,
          hospitalEstabelecimentoId: input.hospitalEstabelecimentoId,
          setorOrigem: "recepcao",
          setorDestino: "faturamento",
          acao: "encaminhado",
          usuarioId: ctx.user.id,
          usuarioNome,
          dataEntradaSetor: nowStr,
          dataSaidaSetor: nowStr,
          duracaoSegundos: 0,
          observacao: faturistaNome
            ? `Encaminhado ao faturamento para ${faturistaNome}`
            : "Encaminhado direto para a fila do Setor de Faturamento",
        });
      }

      return {
        sucesso: true,
        id: contaId,
        mensagem: input.encaminharDiretoFaturamento
          ? "Conta cadastrada na Recepção e já encaminhada ao Setor de Faturamento!"
          : "Conta recepcionada com sucesso!",
      };
    }),

  // ============================================================
  // EDITAR / EXCLUIR CONTA DA FÁBRICA
  // ============================================================
  editarConta: fabricaProcedure
    .input(z.object({
      id: z.number().positive(), hospitalEstabelecimentoId: z.number().positive().optional(), convenioId: z.number().optional().nullable(),
      numeroAtendimento: z.string().optional().nullable(), numeroContaHospital: z.string().optional().nullable(), numeroGuia: z.string().optional().nullable(),
      nomePaciente: z.string().optional(), tipoAtendimento: z.enum(fabricaTipoAtendimentoEnum).optional(), dataEntrada: z.string().optional(),
      dataAlta: z.string().optional().nullable(), dataRecebimentoSafatle: z.string().optional(), observacoes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const usuario = usuarioFabrica(ctx);
      await exigirAcessoFabrica(usuario);
      const db = await obterDbFabrica();
      const [conta] = await db.select({ id: fabricaContas.id, hospitalEstabelecimentoId: fabricaContas.hospitalEstabelecimentoId })
        .from(fabricaContas).where(eq(fabricaContas.id, input.id)).limit(1);
      if (!conta) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada." });
      await exigirHospitalProprietario(usuario, conta.hospitalEstabelecimentoId, "editar");
      const hospitalDestino = input.hospitalEstabelecimentoId ?? conta.hospitalEstabelecimentoId;
      if (hospitalDestino !== conta.hospitalEstabelecimentoId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O hospital proprietário da conta não pode ser alterado por edição." });
      }
      const updates: Record<string, any> = {};
      if (input.hospitalEstabelecimentoId !== undefined) updates.hospitalEstabelecimentoId = hospitalDestino;
      if (input.convenioId !== undefined) {
        updates.convenioId = input.convenioId;
        if (input.convenioId) {
          const convenio = await exigirConvenioDoEstabelecimento(usuario.id, input.convenioId, hospitalDestino, "editar");
          updates.convenioNome = convenio.nome || null;
        } else updates.convenioNome = null;
      }
      if (input.numeroAtendimento !== undefined) updates.numeroAtendimento = input.numeroAtendimento?.trim() || null;
      if (input.numeroContaHospital !== undefined) updates.numeroContaHospital = input.numeroContaHospital?.trim() || null;
      if (input.numeroGuia !== undefined) updates.numeroGuia = input.numeroGuia?.trim() || null;
      if (input.nomePaciente !== undefined) updates.nomePaciente = input.nomePaciente.trim();
      if (input.tipoAtendimento !== undefined) updates.tipoAtendimento = input.tipoAtendimento;
      if (input.dataEntrada !== undefined) updates.dataEntrada = input.dataEntrada.slice(0, 10);
      if (input.dataAlta !== undefined) updates.dataAlta = input.dataAlta ? input.dataAlta.slice(0, 10) : null;
      if (input.dataRecebimentoSafatle !== undefined) updates.dataRecebimentoSafatle = input.dataRecebimentoSafatle.length === 10 ? `${input.dataRecebimentoSafatle} 08:00:00` : input.dataRecebimentoSafatle.replace("T", " ").slice(0, 19);
      if (input.observacoes !== undefined) updates.observacoes = input.observacoes?.trim() || null;
      if (!Object.keys(updates).length) return { sucesso: true };
      await db.update(fabricaContas).set(updates).where(and(eq(fabricaContas.id, conta.id), eq(fabricaContas.hospitalEstabelecimentoId, conta.hospitalEstabelecimentoId)));
      return { sucesso: true };
    }),

  excluirConta: fabricaProcedure
    .input(z.object({ id: z.number().positive() }))
    .mutation(async ({ input, ctx }) => {
      const usuario = usuarioFabrica(ctx);
      await exigirAcessoFabrica(usuario);
      const db = await obterDbFabrica();
      const [conta] = await db.select({ id: fabricaContas.id, hospitalEstabelecimentoId: fabricaContas.hospitalEstabelecimentoId })
        .from(fabricaContas).where(eq(fabricaContas.id, input.id)).limit(1);
      if (!conta) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada." });
      await exigirHospitalProprietario(usuario, conta.hospitalEstabelecimentoId, "excluir");
      await db.delete(fabricaHistoricoFluxo).where(and(eq(fabricaHistoricoFluxo.fabricaContaId, conta.id), eq(fabricaHistoricoFluxo.hospitalEstabelecimentoId, conta.hospitalEstabelecimentoId)));
      await db.delete(fabricaErrosConta).where(and(eq(fabricaErrosConta.fabricaContaId, conta.id), eq(fabricaErrosConta.hospitalEstabelecimentoId, conta.hospitalEstabelecimentoId)));
      await db.delete(fabricaContas).where(and(eq(fabricaContas.id, conta.id), eq(fabricaContas.hospitalEstabelecimentoId, conta.hospitalEstabelecimentoId)));
      return { sucesso: true };
    }),

  // ============================================================
  // 3. RESUMO DOS 6 SETORES DA ESTEIRA (KPIs em Tempo Real)
  // ============================================================
  resumoSetores: fabricaProcedure
    .input(
      z
        .object({
          hospitalEstabelecimentoId: z.number().optional(),
          convenioId: z.number().optional(),
          dataInicio: z.string().optional(),
          dataFim: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const usuario = usuarioFabrica(ctx);
      const hospitalIds = await resolverEscopoFabrica(usuario, input?.hospitalEstabelecimentoId, "visualizar");
      const db = await obterDbFabrica();
      let whereSql = filtroHospitaisSql("hospital_estabelecimento_id", hospitalIds);
      if (input?.convenioId) {
        whereSql = sql`${whereSql} AND convenio_id = ${input.convenioId}`;
      }
      if (input?.dataInicio) {
        whereSql = sql`${whereSql} AND DATE(data_recebimento_safatle) >= ${input.dataInicio}`;
      }
      if (input?.dataFim) {
        whereSql = sql`${whereSql} AND DATE(data_recebimento_safatle) <= ${input.dataFim}`;
      }

      const [rowsResult] = await db.execute(sql`
        SELECT 
          setor_atual as setor,
          COUNT(*) as totalContas,
          SUM(CASE WHEN status_setor = 'devolvido_erro' THEN 1 ELSE 0 END) as devolvidasErro,
          SUM(CASE WHEN status_setor = 'em_andamento' THEN 1 ELSE 0 END) as emAndamento,
          SUM(CASE WHEN status_setor = 'fila' THEN 1 ELSE 0 END) as emFila,
          COALESCE(SUM(CASE WHEN valor_faturado_final > 0 THEN valor_faturado_final ELSE valor_faturado_inicial END), 0) as valorTotal,
          AVG(TIMESTAMPDIFF(HOUR, entrada_setor_atual_em, NOW())) as mediaHorasNoSetor
        FROM fabrica_contas
        WHERE ${whereSql}
        GROUP BY setor_atual
      `);

      const rows = (rowsResult as any) || [];
      const mapa: Record<
        string,
        {
          totalContas: number;
          devolvidasErro: number;
          emAndamento: number;
          emFila: number;
          valorTotal: number;
          mediaHorasNoSetor: number;
        }
      > = {};

      for (const s of fabricaSetorEnum) {
        mapa[s] = {
          totalContas: 0,
          devolvidasErro: 0,
          emAndamento: 0,
          emFila: 0,
          valorTotal: 0,
          mediaHorasNoSetor: 0,
        };
      }

      let totalGeralContas = 0;
      let totalGeralValor = 0;
      let totalRetrabalhosAtivos = 0;

      for (const r of rows) {
        const setor = String(r.setor);
        const tc = Number(r.totalContas) || 0;
        const dev = Number(r.devolvidasErro) || 0;
        const vt = Number(r.valorTotal) || 0;
        mapa[setor] = {
          totalContas: tc,
          devolvidasErro: dev,
          emAndamento: Number(r.emAndamento) || 0,
          emFila: Number(r.emFila) || 0,
          valorTotal: vt,
          mediaHorasNoSetor: Math.round(Number(r.mediaHorasNoSetor) || 0),
        };
        totalGeralContas += tc;
        totalGeralValor += vt;
        totalRetrabalhosAtivos += dev;
      }

      return {
        porSetor: mapa,
        totalGeralContas,
        totalGeralValor,
        totalRetrabalhosAtivos,
      };
    }),

  // ============================================================
  // 4. LISTAR CONTAS NA ESTEIRA (COM FILTROS POR SETOR, HOSPITAL, ETC.)
  // ============================================================
  listarContas: fabricaProcedure
    .input(
      z
        .object({
          setorAtual: z.enum(fabricaSetorEnum).optional(),
          statusSetor: z.enum(fabricaStatusSetorEnum).optional(),
          hospitalEstabelecimentoId: z.number().optional(),
          convenioId: z.number().optional(),
          faturistaId: z.number().optional(),
          responsavelAtualId: z.number().optional(),
          dataInicio: z.string().optional(),
          dataFim: z.string().optional(),
          search: z.string().optional(),
          page: z.number().default(1),
          pageSize: z.number().default(30),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const usuario = usuarioFabrica(ctx);
      const hospitalIds = await resolverEscopoFabrica(usuario, input?.hospitalEstabelecimentoId, "visualizar");
      const db = await obterDbFabrica();
      const page = input?.page ?? 1;
      const pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 30));
      const offset = (page - 1) * pageSize;
      let whereSql = filtroHospitaisSql("fc.hospital_estabelecimento_id", hospitalIds);
      if (input?.setorAtual) {
        whereSql = sql`${whereSql} AND fc.setor_atual = ${input.setorAtual}`;
      }
      if (input?.statusSetor) {
        whereSql = sql`${whereSql} AND fc.status_setor = ${input.statusSetor}`;
      }
      if (input?.convenioId) {
        whereSql = sql`${whereSql} AND fc.convenio_id = ${input.convenioId}`;
      }
      if (input?.faturistaId) {
        whereSql = sql`${whereSql} AND fc.faturista_id = ${input.faturistaId}`;
      }
      if (input?.responsavelAtualId) {
        whereSql = sql`${whereSql} AND fc.responsavel_atual_id = ${input.responsavelAtualId}`;
      }
      if (input?.dataInicio) {
        whereSql = sql`${whereSql} AND DATE(fc.data_recebimento_safatle) >= ${input.dataInicio}`;
      }
      if (input?.dataFim) {
        whereSql = sql`${whereSql} AND DATE(fc.data_recebimento_safatle) <= ${input.dataFim}`;
      }
      if (input?.search && input.search.trim()) {
        const pattern = `%${input.search.trim()}%`;
        whereSql = sql`${whereSql} AND (
          fc.nome_paciente LIKE ${pattern}
          OR fc.numero_atendimento LIKE ${pattern}
          OR fc.numero_conta_hospital LIKE ${pattern}
          OR fc.numero_guia LIKE ${pattern}
          OR fc.convenio_nome LIKE ${pattern}
        )`;
      }

      const [rowsResult, countResult] = await Promise.all([
        db.execute(sql`
          SELECT 
            fc.*,
            e.nome as hospitalNome,
            COALESCE(fc.convenio_nome, c.nome) as convenioExibicao,
            TIMESTAMPDIFF(HOUR, fc.entrada_setor_atual_em, NOW()) as horasNoSetorAtual,
            DATEDIFF(DATE(fc.data_recebimento_safatle), fc.data_alta) as diasEntreAltaERecebimento,
            DATEDIFF(NOW(), DATE(fc.data_recebimento_safatle)) as diasNaSafatle
          FROM fabrica_contas fc
          LEFT JOIN estabelecimentos e ON e.id = fc.hospital_estabelecimento_id
          LEFT JOIN convenios c ON c.id = fc.convenio_id
          WHERE ${whereSql}
          ORDER BY 
            CASE WHEN fc.status_setor = 'devolvido_erro' THEN 0 ELSE 1 END ASC,
            fc.data_recebimento_safatle DESC,
            fc.id DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `),
        db.execute(sql`
          SELECT COUNT(*) as total
          FROM fabrica_contas fc
          WHERE ${whereSql}
        `),
      ]);

      const contas = ((rowsResult as any)[0] || []).map((r: any) => ({
        id: Number(r.id),
        hospitalEstabelecimentoId: Number(r.hospital_estabelecimento_id),
        hospitalNome: r.hospitalNome || `Hospital #${r.hospital_estabelecimento_id}`,
        convenioId: r.convenio_id ? Number(r.convenio_id) : null,
        convenioNome: r.convenioExibicao || "Não informado",
        numeroAtendimento: r.numero_atendimento,
        numeroContaHospital: r.numero_conta_hospital,
        numeroGuia: r.numero_guia,
        numeroLote: r.numero_lote,
        senhaAutorizacao: r.senha_autorizacao,
        nomePaciente: r.nome_paciente,
        tipoAtendimento: r.tipo_atendimento,
        dataEntrada: r.data_entrada,
        dataAlta: r.data_alta,
        dataRecebimentoSafatle: r.data_recebimento_safatle,
        setorAtual: r.setor_atual,
        statusSetor: r.status_setor,
        entradaSetorAtualEm: r.entrada_setor_atual_em,
        recepcionadoPorId: r.recepcionado_por_id,
        recepcionadoPorNome: r.recepcionado_por_nome,
        responsavelAtualId: r.responsavel_atual_id,
        responsavelAtualNome: r.responsavel_atual_nome,
        faturistaId: r.faturista_id,
        faturistaNome: r.faturista_nome,
        auditorInternoId: r.auditor_interno_id,
        auditorInternoNome: r.auditor_interno_nome,
        auditorExternoNome: r.auditor_externo_nome,
        limpezaPorId: r.limpeza_por_id,
        limpezaPorNome: r.limpeza_por_nome,
        valorFaturadoInicial: Number(r.valor_faturado_inicial) || 0,
        valorFaturadoFinal: Number(r.valor_faturado_final) || 0,
        totalItensXml: Number(r.total_itens_xml) || 0,
        arquivoXmlFaturamentoId: r.arquivo_xml_faturamento_id,
        arquivoXmlFinalId: r.arquivo_xml_final_id,
        contaConvenioResumoId: r.conta_convenio_resumo_id,
        statusAuditoriaRegras: r.status_auditoria_regras || "pendente",
        totalDivergenciasRegras: Number(r.total_divergencias_regras) || 0,
        scoreRiscoAuditoria: Number(r.score_risco_auditoria) || 0,
        protocoloEnvioConvenio: r.protocolo_envio_convenio,
        metodoEnvioConvenio: r.metodo_envio_convenio,
        dataEnvioConvenio: r.data_envio_convenio,
        qtdRetrabalhos: Number(r.qtd_retrabalhos) || 0,
        observacoes: r.observacoes,
        ultimoMotivoRetorno: r.ultimo_motivo_retorno,
        horasNoSetorAtual: Number(r.horasNoSetorAtual) || 0,
        diasEntreAltaERecebimento:
          r.diasEntreAltaERecebimento !== null ? Number(r.diasEntreAltaERecebimento) : null,
        diasNaSafatle: Number(r.diasNaSafatle) || 0,
        createdAt: r.created_at,
      }));

      const total = Number(((countResult as any)[0] || [])[0]?.total || 0);

      return {
        contas,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }),

  // ============================================================
  // 5. OBTER CONTA DA FÁBRICA VINCULADA AO CONTA CONVÊNIO (por numeroConta + estabelecimentoId)
  // ============================================================
  obterPorNumeroConta: fabricaProcedure
    .input(z.object({ numeroConta: z.string().min(1), estabelecimentoId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const usuario = usuarioFabrica(ctx);
      const hospitalIds = await resolverEscopoFabrica(usuario, input.estabelecimentoId, "visualizar");
      const db = await obterDbFabrica();
      const whereSql = sql`(fc.numero_guia = ${input.numeroConta} OR fc.numero_conta_hospital = ${input.numeroConta} OR fc.numero_atendimento = ${input.numeroConta})
        AND ${filtroHospitaisSql("fc.hospital_estabelecimento_id", hospitalIds)}`;
      const [rowsResult] = await db.execute(sql`SELECT fc.*, e.nome as hospitalNome FROM fabrica_contas fc
        LEFT JOIN estabelecimentos e ON e.id = fc.hospital_estabelecimento_id WHERE ${whereSql} ORDER BY fc.id DESC LIMIT 1`);
      const row = ((rowsResult as any) || [])[0];
      if (!row) return null;
      const hospitalId = Number(row.hospital_estabelecimento_id);
      const [historico, erros] = await Promise.all([
        db.select().from(fabricaHistoricoFluxo).where(and(eq(fabricaHistoricoFluxo.fabricaContaId, Number(row.id)), eq(fabricaHistoricoFluxo.hospitalEstabelecimentoId, hospitalId))).orderBy(desc(fabricaHistoricoFluxo.id)),
        db.select().from(fabricaErrosConta).where(and(eq(fabricaErrosConta.fabricaContaId, Number(row.id)), eq(fabricaErrosConta.hospitalEstabelecimentoId, hospitalId))).orderBy(desc(fabricaErrosConta.id)),
      ]);
      return { id: Number(row.id), hospitalEstabelecimentoId: hospitalId, hospitalNome: row.hospitalNome, convenioId: row.convenio_id,
        convenioNome: row.convenio_nome, numeroAtendimento: row.numero_atendimento, numeroContaHospital: row.numero_conta_hospital,
        numeroGuia: row.numero_guia, nomePaciente: row.nome_paciente, setorAtual: row.setor_atual, statusSetor: row.status_setor,
        faturistaId: row.faturista_id, faturistaNome: row.faturista_nome, auditorInternoNome: row.auditor_interno_nome,
        qtdRetrabalhos: Number(row.qtd_retrabalhos) || 0, ultimoMotivoRetorno: row.ultimo_motivo_retorno,
        protocoloEnvioConvenio: row.protocolo_envio_convenio, historico, erros };
    }),

  // ============================================================
  // 6. ASSUMIR CONTA NO SETOR ATUAL (INICIAR TRABALHO)
  // ============================================================
  assumirConta: fabricaProcedure
    .input(z.object({ contaIds: z.array(z.number().positive()).min(1), responsavelId: z.number().positive().optional() }))
    .mutation(async ({ input, ctx }) => {
      const usuario = usuarioFabrica(ctx);
      await exigirAcessoFabrica(usuario);
      const db = await obterDbFabrica();
      const contaIds = [...new Set(input.contaIds)];
      const contas = await db.select().from(fabricaContas).where(inArray(fabricaContas.id, contaIds));
      if (contas.length !== contaIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "Uma ou mais contas não foram encontradas." });
      await autorizarLoteHospitalar(usuario, contas, "editar");

      const targetUserId = input.responsavelId || usuario.id;
      await exigirColaboradorNoEscopo(targetUserId, contas.map((conta) => conta.hospitalEstabelecimentoId));
      let targetUserName = ctx.user.name || `Usuário #${usuario.id}`;
      if (targetUserId !== usuario.id) {
        const [responsavel] = await db.select({ name: users.name }).from(users).where(eq(users.id, targetUserId)).limit(1);
        if (!responsavel) throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
        targetUserName = responsavel.name || `Usuário #${targetUserId}`;
      }

      const nowStr = toMysqlDateTime();
      for (const conta of contas) {
        const updates: Record<string, any> = { statusSetor: "em_andamento", responsavelAtualId: targetUserId, responsavelAtualNome: targetUserName };
        if (conta.setorAtual === "faturamento") { updates.faturistaId = targetUserId; updates.faturistaNome = targetUserName; }
        else if (conta.setorAtual === "auditoria_interna") { updates.auditorInternoId = targetUserId; updates.auditorInternoNome = targetUserName; }
        else if (conta.setorAtual === "limpeza_prontuario") { updates.limpezaPorId = targetUserId; updates.limpezaPorNome = targetUserName; }
        await db.update(fabricaContas).set(updates).where(and(eq(fabricaContas.id, conta.id), eq(fabricaContas.hospitalEstabelecimentoId, conta.hospitalEstabelecimentoId)));
        await db.insert(fabricaHistoricoFluxo).values({ fabricaContaId: conta.id, hospitalEstabelecimentoId: conta.hospitalEstabelecimentoId,
          setorOrigem: conta.setorAtual, setorDestino: conta.setorAtual, acao: "assumido", usuarioId: targetUserId, usuarioNome: targetUserName,
          dataEntradaSetor: nowStr, dataSaidaSetor: nowStr, duracaoSegundos: 0, observacao: `Conta assumida no setor ${conta.setorAtual}.` });
      }
      return { sucesso: true, mensagem: `${contas.length} conta(s) assumida(s).` };
    }),

  // ============================================================
  // 7. TRANSICIONAR CONTA DE SETOR (PASSAGEM DE BASTÃO + REGISTRO DE ERRO/SLA)
  // ============================================================
  transicionarSetor: fabricaProcedure
    .input(z.object({
      contaIds: z.array(z.number().positive()).min(1), setorDestino: z.enum(fabricaSetorEnum), statusDestino: z.enum(fabricaStatusSetorEnum).default("fila"),
      responsavelDestinoId: z.number().positive().optional().nullable(), auditorExternoNome: z.string().max(255).optional().nullable(), observacao: z.string().max(4000).optional().nullable(),
      registrarErro: z.object({ tipoErro: z.enum(["regra_gabarito", "item_faltante", "quantidade_divergente", "preco_divergente", "falha_prontuario", "dados_cadastrais", "autorizacao_senha", "outro"]), codigoItem: z.string().max(64).optional().nullable(), descricaoErro: z.string().min(2).max(4000), impactoFinanceiro: z.number().optional().default(0) }).optional().nullable(),
      dadosEnvioConvenio: z.object({ protocoloEnvio: z.string().max(120).optional().nullable(), metodoEnvio: z.enum(["manual", "rpa_portal", "webservice_tiss"]).default("manual") }).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const usuario = usuarioFabrica(ctx);
      await exigirAcessoFabrica(usuario);
      const db = await obterDbFabrica();
      const contaIds = [...new Set(input.contaIds)];
      const contas = await db.select().from(fabricaContas).where(inArray(fabricaContas.id, contaIds));
      if (contas.length !== contaIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "Uma ou mais contas não foram encontradas." });
      await autorizarLoteHospitalar(usuario, contas, "editar");
      if (input.responsavelDestinoId) await exigirColaboradorNoEscopo(input.responsavelDestinoId, contas.map((conta) => conta.hospitalEstabelecimentoId));

      const usuarioNome = ctx.user.name || `Usuário #${usuario.id}`;
      let respDestinoNome: string | null = null;
      if (input.responsavelDestinoId) {
        const [responsavel] = await db.select({ name: users.name }).from(users).where(eq(users.id, input.responsavelDestinoId)).limit(1);
        if (!responsavel) throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
        respDestinoNome = responsavel.name || `Usuário #${input.responsavelDestinoId}`;
      }

      const now = new Date(); const nowStr = toMysqlDateTime(now);
      for (const conta of contas) {
        const entradaAnterior = conta.entradaSetorAtualEm ? new Date(conta.entradaSetorAtualEm) : now;
        const duracaoSegundos = Math.max(0, Math.floor((now.getTime() - entradaAnterior.getTime()) / 1000));
        const isDevolucaoErro = input.setorDestino === "faturamento" && ["auditoria_interna", "auditoria_externa", "limpeza_prontuario"].includes(conta.setorAtual);
        const updates: Record<string, any> = {
          setorAtual: input.setorDestino,
          statusSetor: isDevolucaoErro ? "devolvido_erro" : input.responsavelDestinoId ? "em_andamento" : input.statusDestino,
          entradaSetorAtualEm: now,
          responsavelAtualId: input.responsavelDestinoId || (isDevolucaoErro ? conta.faturistaId : null),
          responsavelAtualNome: respDestinoNome || (isDevolucaoErro ? conta.faturistaNome : null),
        };
        if (input.setorDestino === "faturamento" && input.responsavelDestinoId) { updates.faturistaId = input.responsavelDestinoId; updates.faturistaNome = respDestinoNome; }
        if (input.auditorExternoNome) updates.auditorExternoNome = input.auditorExternoNome;
        if (conta.setorAtual === "auditoria_interna") { updates.auditorInternoId = usuario.id; updates.auditorInternoNome = usuarioNome; }
        if (conta.setorAtual === "limpeza_prontuario") { updates.limpezaPorId = usuario.id; updates.limpezaPorNome = usuarioNome; }
        if (isDevolucaoErro) { updates.qtdRetrabalhos = (conta.qtdRetrabalhos || 0) + 1; updates.ultimoMotivoRetorno = input.registrarErro?.descricaoErro || input.observacao || "Devolvido pela auditoria para correção"; }
        if (input.setorDestino === "enviado_convenio") {
          updates.protocoloEnvioConvenio = input.dadosEnvioConvenio?.protocoloEnvio?.trim() || `PROT-SAF-${conta.hospitalEstabelecimentoId}-${Date.now().toString().slice(-6)}`;
          updates.metodoEnvioConvenio = input.dadosEnvioConvenio?.metodoEnvio || "manual"; updates.dataEnvioConvenio = nowStr; updates.statusSetor = "concluido";
        }
        if (conta.setorAtual === "faturamento" && input.setorDestino === "auditoria_interna") {
          await db.update(fabricaErrosConta).set({ corrigido: "sim", dataCorrecao: nowStr }).where(and(eq(fabricaErrosConta.fabricaContaId, conta.id), eq(fabricaErrosConta.hospitalEstabelecimentoId, conta.hospitalEstabelecimentoId), eq(fabricaErrosConta.corrigido, "nao")));
        }
        await db.update(fabricaContas).set(updates).where(and(eq(fabricaContas.id, conta.id), eq(fabricaContas.hospitalEstabelecimentoId, conta.hospitalEstabelecimentoId)));
        const valorMov = Number(conta.valorFaturadoFinal) > 0 ? String(conta.valorFaturadoFinal) : String(conta.valorFaturadoInicial || "0.00");
        await db.insert(fabricaHistoricoFluxo).values({ fabricaContaId: conta.id, hospitalEstabelecimentoId: conta.hospitalEstabelecimentoId,
          setorOrigem: conta.setorAtual, setorDestino: input.setorDestino, acao: isDevolucaoErro ? "devolvido_erro" : input.setorDestino === "enviado_convenio" ? "enviado_convenio" : "encaminhado",
          usuarioId: usuario.id, usuarioNome, dataEntradaSetor: toMysqlDateTime(entradaAnterior), dataSaidaSetor: nowStr, duracaoSegundos, valorMovimentado: valorMov,
          observacao: input.registrarErro?.descricaoErro || input.observacao || `Movido de ${conta.setorAtual} para ${input.setorDestino}` });
        if (isDevolucaoErro) {
          const setorErro = conta.setorAtual === "auditoria_externa" ? "auditoria_externa" : conta.setorAtual === "limpeza_prontuario" ? "limpeza_prontuario" : "auditoria_interna";
          await db.insert(fabricaErrosConta).values({ fabricaContaId: conta.id, hospitalEstabelecimentoId: conta.hospitalEstabelecimentoId, convenioId: conta.convenioId,
            faturistaId: conta.faturistaId, faturistaNome: conta.faturistaNome || "Não atribuído", auditorId: usuario.id, auditorNome: usuarioNome,
            setorOrigemErro: setorErro, tipoErro: input.registrarErro?.tipoErro || "regra_gabarito", codigoItem: input.registrarErro?.codigoItem || null,
            descricaoErro: input.registrarErro?.descricaoErro || input.observacao || "Divergência apontada na auditoria", impactoFinanceiro: String(input.registrarErro?.impactoFinanceiro || 0), corrigido: "nao" });
        }
      }
      return { sucesso: true, mensagem: `${contas.length} conta(s) movimentada(s) com sucesso.` };
    }),

  // ============================================================
  // 8. IMPORTAR XML DIRETO NA CONTA DA FÁBRICA
  //    - Salva automaticamente no estabelecimentoId do HOSPITAL
  //    - Popula faturamento_tiss + contas_convenio_itens + contas_convenio_resumo
  //    - Executa Motor de Regras (compararContaComPadroes)
  //    - Encaminha para Auditoria Interna (se estiver no Faturamento)
  // ============================================================
  importarXmlNaConta: fabricaProcedure
    .input(
      z.object({
        fabricaContaId: z.number(),
        nomeArquivo: z.string(),
        conteudoBase64: z.string(),
        etapaXml: z.enum(["faturamento", "limpeza_final"]).default("faturamento"),
        avancarSetorAutomatico: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const usuario = usuarioFabrica(ctx);
      await exigirAcessoFabrica(usuario);
      const db = await obterDbFabrica();
      const [conta] = await db
        .select()
        .from(fabricaContas)
        .where(eq(fabricaContas.id, input.fabricaContaId))
        .limit(1);
      if (!conta) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada." });
      await exigirHospitalProprietario(usuario, conta.hospitalEstabelecimentoId, "editar");
      const xmlBuffer = Buffer.from(input.conteudoBase64, "base64");
      const parseResult = await parseXML(xmlBuffer);

      if (!parseResult.success || parseResult.procedimentos.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não foi possível extrair procedimentos deste XML TISS. Verifique se é um XML de guias válido.",
        });
      }

      // Filtrar procedimentos da guia se o XML for um lote com múltiplas guias e a conta já tiver guia/paciente
      let procsConta = parseResult.procedimentos;
      const guiasNoXml = Array.from(
        new Set(procsConta.map((p) => p.guiaNumero).filter(Boolean))
      );

      if (guiasNoXml.length > 1) {
        // Tentar localizar a guia específica desta conta pelo numeroGuia, numeroContaHospital, numeroAtendimento ou nomePaciente
        const matchGuia = procsConta.filter(
          (p) =>
            (conta.numeroGuia && p.guiaNumero === conta.numeroGuia) ||
            (conta.numeroContaHospital && p.guiaNumero === conta.numeroContaHospital) ||
            (conta.numeroAtendimento && p.guiaNumero === conta.numeroAtendimento) ||
            (p.pacienteNome &&
              conta.nomePaciente &&
              p.pacienteNome.toUpperCase().includes(conta.nomePaciente.toUpperCase().split(" ")[0]))
        );
        const guiasCorrespondentes = new Set(matchGuia.map((procedimento) => procedimento.guiaNumero).filter(Boolean));
        if (!matchGuia.length || guiasCorrespondentes.size !== 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O XML possui correspondência ambígua para esta conta." });
        }
        procsConta = matchGuia;
      }

      const primeiroProc = procsConta[0];
      const numeroGuiaExtraido =
        primeiroProc.guiaNumero ||
        conta.numeroGuia ||
        conta.numeroContaHospital ||
        conta.numeroAtendimento ||
        `CONTA-${conta.id}`;
      const numeroLoteExtraido = primeiroProc.numeroLote || conta.numeroLote || "LOTE-FAB";
      const senhaExtraida = primeiroProc.senha || conta.senhaAutorizacao || null;
      const carteiraExtraida = primeiroProc.pacienteCarteirinha || null;

      // Resolver convênio pelo registroANS do XML se a conta ainda não tiver convenioId
      let convenioIdFinal = conta.convenioId;
      let convenioNomeFinal = conta.convenioNome;
      if (!convenioIdFinal && primeiroProc.registroANS) {
        const [convAns] = await db
          .select()
          .from(convenios)
          .where(eq(convenios.registroAns, primeiroProc.registroANS))
          .limit(1);
        if (convAns) {
          convenioIdFinal = convAns.id;
          convenioNomeFinal = convAns.nome;
        }
      }
      if (convenioIdFinal && !convenioNomeFinal) {
        const [conv] = await db
          .select()
          .from(convenios)
          .where(eq(convenios.id, convenioIdFinal))
          .limit(1);
        convenioNomeFinal = conv?.nome || null;
      }

      const hospitalEstabId = conta.hospitalEstabelecimentoId;
      if (!convenioIdFinal) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não foi possível identificar um convênio autorizado para esta conta.",
        });
      }
      const convenio = await exigirConvenioDoEstabelecimento(usuario.id, convenioIdFinal, hospitalEstabId, "editar");
      convenioNomeFinal = convenio.nome || convenioNomeFinal;

      // 1. Criar registro em `arquivos` vinculado ao estabelecimento do HOSPITAL
      const [arqRes] = await db.insert(arquivos).values({
        nome: input.nomeArquivo,
        tipoArquivo: "xml",
        direcao: "enviado",
        convenioId: convenioIdFinal,
        estabelecimentoId: hospitalEstabId,
        userId: ctx.user.id,
        s3Key: `fabrica/${hospitalEstabId}/${Date.now()}-${input.nomeArquivo}`,
        s3Url: `local://fabrica/${hospitalEstabId}/${input.nomeArquivo}`,
        tamanho: xmlBuffer.length,
        status: "processado",
        progresso: 100,
        totalItens: procsConta.length,
        itensProcessados: procsConta.length,
        dataReferencia: new Date(conta.dataAlta || conta.dataEntrada),
      });
      const arquivoId = Number((arqRes as any).insertId);

      // 2. Inserir itens em `faturamento_tiss` vinculado ao HOSPITAL
      let valorTotalXml = 0;
      const competenciaStr = (conta.dataAlta || conta.dataEntrada || new Date().toISOString())
        .slice(0, 7)
        .replace("-", "/");

      const tissValues = procsConta.map((p) => {
        const qtd = Number(p.quantidade) || 1;
        const vu = Number(p.valorUnitario) || 0;
        const vt = Number(p.valorTotal) || qtd * vu;
        valorTotalXml += vt;

        return {
          arquivoId,
          convenioId: convenioIdFinal,
          estabelecimentoId: hospitalEstabId,
          numeroLote: numeroLoteExtraido,
          numeroGuiaPrestador: numeroGuiaExtraido,
          numeroGuiaOperadora: p.numeroGuiaOperadora || null,
          senha: p.senha || senhaExtraida,
          carteiraBeneficiario: p.pacienteCarteirinha || null,
          dataExecucao: p.dataExecucao || new Date(conta.dataEntrada),
          tipoItem: p.tipoDespesa === "procedimento" ? ("procedimento" as const) : ("despesa" as const),
          codigoDespesa: p.codigoDespesa || null,
          codigoTabela: "22",
          codigoItem: p.codigo || "00000000",
          descricaoItem: p.descricao || "Item XML",
          quantidade: String(qtd),
          valorUnitario: String(vu.toFixed(2)),
          valorFaturado: String(vt.toFixed(2)),
          nomeProf: p.nomeMedico || null,
          conselhoProf: p.crmMedico ? "CRM" : null,
          numeroConselhoProf: p.crmMedico || null,
          dataReferencia: new Date(conta.dataAlta || conta.dataEntrada),
        };
      });

      if (tissValues.length > 0) {
        await db.insert(faturamentoTiss).values(tissValues as any);
      }

      // 3. Popular `contas_convenio_itens` e `contas_convenio_resumo` no estabelecimento do HOSPITAL
      //    para que apareça imediatamente na tela de Conta Convênio e rode o Motor de Regras!
      // Cada upload materializa uma versão própria; não apagar versões anteriores.

      const ccItensValues = procsConta.map((p) => {
        const qtd = Number(p.quantidade) || 1;
        const vu = Number(p.valorUnitario) || 0;
        const vt = Number(p.valorTotal) || qtd * vu;
        return {
          origem: "XML" as const,
          numeroConta: numeroGuiaExtraido,
          numeroGuia: numeroGuiaExtraido,
          numeroGuiaOperadora: p.numeroGuiaOperadora || null,
          numeroLote: numeroLoteExtraido,
          senha: p.senha || senhaExtraida,
          convenio: convenioNomeFinal,
          convenioId: convenioIdFinal || null,
          estabelecimentoId: hospitalEstabId,
          pacienteNome: conta.nomePaciente,
          carteiraBeneficiario: carteiraExtraida,
          dataInternacao: new Date(conta.dataEntrada),
          dataAlta: conta.dataAlta ? new Date(conta.dataAlta) : null,
          competencia: competenciaStr,
          tipoItem: p.tipoDespesa || "procedimento",
          codigoItem: p.codigo || "00000000",
          descricaoItem: p.descricao || "Item XML",
          quantidade: String(qtd),
          valorUnitario: String(vu.toFixed(2)),
          valorTotal: String(vt.toFixed(2)),
          dataExecucao: p.dataExecucao || new Date(conta.dataEntrada),
          profissionalExecutante: p.nomeMedico || null,
          arquivoId,
          statusAnalise: "pendente" as const,
        };
      });

      if (ccItensValues.length > 0) {
        await db.insert(contasConvenioItens).values(ccItensValues as any);
      }

      const [resumoInsert] = await db.insert(contasConvenioResumo).values({
        numeroConta: numeroGuiaExtraido,
        numeroLote: numeroLoteExtraido,
        estabelecimentoId: hospitalEstabId,
        origem: "XML",
        arquivoHospitalId: arquivoId,
        convenio: convenioNomeFinal,
        convenioId: convenioIdFinal || null,
        pacienteNome: conta.nomePaciente,
        carteiraBeneficiario: carteiraExtraida,
        dataInternacao: new Date(conta.dataEntrada),
        dataAlta: conta.dataAlta ? new Date(conta.dataAlta) : null,
        competencia: competenciaStr,
        totalItens: ccItensValues.length,
        valorTotal: String(valorTotalXml.toFixed(2)),
        statusAnalise: "pendente",
        buscadoPor: ctx.user.id,
      });

      const contaConvenioResumoId = Number((resumoInsert as any).insertId);

      // 4. Executar o Motor de Regras e Padrões (Gabaritos do Hospital + Safatle) automaticamente!
      let statusAuditoriaRegras: "pendente" | "conforme" | "divergente" | "revisado" = "pendente";
      let totalDivergencias = 0;
      let scoreRisco = 0;

      try {
        const resultadoComparacao = await compararContaComPadroes(
          numeroGuiaExtraido,
          hospitalEstabId,
          { escopoContextoMedico: {
            estabelecimentoId: hospitalEstabId, numeroConta: numeroGuiaExtraido,
            arquivoHospitalId: arquivoId, convenioId: convenioIdFinal,
            numeroLote: numeroLoteExtraido, competencia: competenciaStr,
          } },
        );
        totalDivergencias = resultadoComparacao.totalDivergencias || 0;
        scoreRisco = resultadoComparacao.scoreRisco?.score || 0;
        statusAuditoriaRegras =
          resultadoComparacao.statusGeral === "divergente" ? "divergente"
            : resultadoComparacao.statusGeral === "conforme" ? "conforme" : "pendente";

        // Atualizar statusAnalise em contasConvenioResumo
        await db
          .update(contasConvenioResumo)
          .set({
            statusAnalise: statusAuditoriaRegras,
            scoreRisco,
            detalhesRisco: resultadoComparacao.scoreRisco,
            divergenciasGerais:
              resultadoComparacao.divergencias.length > 0
                ? resultadoComparacao.divergencias
                : null,
          })
          .where(and(eq(contasConvenioResumo.id, contaConvenioResumoId), eq(contasConvenioResumo.estabelecimentoId, hospitalEstabId)));
      } catch (err) {
        logger.warn({
          message: "Aviso na comparação automática de padrões ao importar XML na Fábrica",
          error: "comparacao_indisponivel",
        });
      }

      // 5. Atualizar a conta na Fábrica e avançar para Auditoria Interna (se aplicável)
      const now = new Date();
      const nowStr = toMysqlDateTime(now);
      const usuarioNome = ctx.user.name || ctx.user.email || `Usuário #${ctx.user.id}`;
      const entradaAnterior = conta.entradaSetorAtualEm
        ? new Date(conta.entradaSetorAtualEm)
        : new Date();
      const duracaoSegundos = Math.max(
        0,
        Math.floor((now.getTime() - entradaAnterior.getTime()) / 1000)
      );

      const novoSetor =
        input.avancarSetorAutomatico && conta.setorAtual === "faturamento"
          ? "auditoria_interna"
          : conta.setorAtual;

      const updatesConta: Record<string, any> = {
        convenioId: convenioIdFinal,
        convenioNome: convenioNomeFinal,
        numeroGuia: numeroGuiaExtraido,
        numeroLote: numeroLoteExtraido,
        senhaAutorizacao: senhaExtraida,
        totalItensXml: procsConta.length,
        contaConvenioResumoId,
        statusAuditoriaRegras,
        totalDivergenciasRegras: totalDivergencias,
        scoreRiscoAuditoria: scoreRisco,
        setorAtual: novoSetor,
        statusSetor: novoSetor !== conta.setorAtual ? "fila" : conta.statusSetor,
        entradaSetorAtualEm: novoSetor !== conta.setorAtual ? now : conta.entradaSetorAtualEm,
      };

      if (input.etapaXml === "limpeza_final" || conta.setorAtual === "limpeza_prontuario") {
        updatesConta.arquivoXmlFinalId = arquivoId;
        updatesConta.valorFaturadoFinal = String(valorTotalXml.toFixed(2));
        if (Number(conta.valorFaturadoInicial) === 0) {
          updatesConta.valorFaturadoInicial = String(valorTotalXml.toFixed(2));
        }
      } else {
        updatesConta.arquivoXmlFaturamentoId = arquivoId;
        updatesConta.valorFaturadoInicial = String(valorTotalXml.toFixed(2));
        updatesConta.valorFaturadoFinal = String(valorTotalXml.toFixed(2));
        updatesConta.faturistaId = conta.faturistaId || ctx.user.id;
        updatesConta.faturistaNome = conta.faturistaNome || usuarioNome;
      }

      await db
        .update(fabricaContas)
        .set(updatesConta)
        .where(and(eq(fabricaContas.id, conta.id), eq(fabricaContas.hospitalEstabelecimentoId, hospitalEstabId)));

      await db.insert(fabricaHistoricoFluxo).values({
        fabricaContaId: conta.id,
        hospitalEstabelecimentoId: hospitalEstabId,
        setorOrigem: conta.setorAtual,
        setorDestino: novoSetor,
        acao: "xml_importado",
        usuarioId: ctx.user.id,
        usuarioNome,
        dataEntradaSetor: toMysqlDateTime(entradaAnterior),
        dataSaidaSetor: nowStr,
        duracaoSegundos,
        valorMovimentado: String(valorTotalXml.toFixed(2)),
        observacao: `XML "${input.nomeArquivo}" importado (${procsConta.length} itens, R$ ${valorTotalXml.toFixed(2)}). Roteado ao hospital #${hospitalEstabId}. Regras: ${statusAuditoriaRegras.toUpperCase()} (${totalDivergencias} divergências).`,
      });

      return {
        sucesso: true,
        arquivoId,
        numeroGuia: numeroGuiaExtraido,
        totalItens: procsConta.length,
        valorTotal: valorTotalXml,
        statusAuditoriaRegras,
        totalDivergencias,
        scoreRisco,
        novoSetor,
        mensagem: `XML importado e enviado automaticamente ao estabelecimento do hospital! ${procsConta.length} itens (R$ ${valorTotalXml.toFixed(2)}) — Auditoria de Regras: ${totalDivergencias} divergência(s).`,
      };
    }),

  // ============================================================
  // 9. VINCULAR AUTOMATICAMENTE CONTAS EM FILA COM XMLs DE LOTE JÁ IMPORTADOS
  // ============================================================
  vincularAutomaticoComContaConvenio: fabricaProcedure
    .input(z.object({ hospitalEstabelecimentoId: z.number().optional() }).optional())
    .mutation(async ({ input, ctx }) => {
      const usuario = usuarioFabrica(ctx);
      const hospitalIds = await resolverEscopoFabrica(usuario, input?.hospitalEstabelecimentoId, "editar");
      const db = await obterDbFabrica();
      const whereSql = sql`fc.setor_atual IN ('recepcao', 'faturamento') AND fc.conta_convenio_resumo_id IS NULL
        AND ${filtroHospitaisSql("fc.hospital_estabelecimento_id", hospitalIds)}`;
      const [contasPendentesRes] = await db.execute(sql`SELECT * FROM fabrica_contas fc WHERE ${whereSql}`);
      const pendentes = (contasPendentesRes as any) || [];
      if (!pendentes.length) return { sucesso: true, totalVinculadas: 0, mensagem: "Nenhuma correspondência inequívoca encontrada." };
      await autorizarLoteHospitalar(usuario, pendentes.map((conta: any) => ({ hospitalEstabelecimentoId: Number(conta.hospital_estabelecimento_id) })), "editar");
      let totalVinculadas = 0;
      const nowStr = toMysqlDateTime(); const usuarioNome = ctx.user.name || `Usuário #${usuario.id}`;
      for (const conta of pendentes) {
        const hospId = Number(conta.hospital_estabelecimento_id);
        const guia = conta.numero_guia || conta.numero_conta_hospital || conta.numero_atendimento;
        const paciente = String(conta.nome_paciente || "").trim();
        if (!guia && !paciente) continue;
        let matchQuery = sql`estabelecimentoId = ${hospId}`;
        if (guia && paciente) matchQuery = sql`${matchQuery} AND (numeroConta = ${guia} OR pacienteNome LIKE ${`%${paciente}%`})`;
        else if (guia) matchQuery = sql`${matchQuery} AND numeroConta = ${guia}`;
        else matchQuery = sql`${matchQuery} AND pacienteNome LIKE ${`%${paciente}%`}`;
        const [resumoMatchRes] = await db.execute(sql`SELECT * FROM contas_convenio_resumo WHERE ${matchQuery} ORDER BY criadoEm DESC LIMIT 2`);
        const matches = (resumoMatchRes as any) || [];
        if (matches.length !== 1) continue;
        const resumo = matches[0];
        if (Number(resumo.estabelecimentoId) !== hospId) continue;
        if (resumo.convenioId) await exigirConvenioDoEstabelecimento(usuario.id, Number(resumo.convenioId), hospId, "editar");
        await db.update(fabricaContas).set({ contaConvenioResumoId: Number(resumo.id), numeroGuia: resumo.numeroConta || conta.numero_guia,
          convenioId: resumo.convenioId || conta.convenio_id, convenioNome: resumo.convenio || conta.convenio_nome,
          valorFaturadoInicial: String(resumo.valorTotal || "0.00"), valorFaturadoFinal: String(resumo.valorTotal || "0.00"),
          totalItensXml: Number(resumo.totalItens) || 0, statusAuditoriaRegras: resumo.statusAnalise || "pendente",
          scoreRiscoAuditoria: Number(resumo.scoreRisco) || 0, setorAtual: "auditoria_interna", statusSetor: "fila", entradaSetorAtualEm: new Date() })
          .where(and(eq(fabricaContas.id, Number(conta.id)), eq(fabricaContas.hospitalEstabelecimentoId, hospId)));
        await db.insert(fabricaHistoricoFluxo).values({ fabricaContaId: Number(conta.id), hospitalEstabelecimentoId: hospId,
          setorOrigem: conta.setor_atual, setorDestino: "auditoria_interna", acao: "xml_importado", usuarioId: usuario.id, usuarioNome,
          dataEntradaSetor: nowStr, dataSaidaSetor: nowStr, duracaoSegundos: 0, valorMovimentado: String(resumo.valorTotal || "0.00"),
          observacao: "Vinculado automaticamente a uma Conta Convênio do mesmo hospital." });
        totalVinculadas++;
      }
      return { sucesso: true, totalVinculadas, mensagem: totalVinculadas ? `${totalVinculadas} conta(s) vinculada(s).` : "Nenhuma correspondência inequívoca encontrada." };
    }),

  // ============================================================
  // 10. RELATÓRIOS GERENCIAIS SAFATLE:
  //     A) PRODUÇÃO POR FUNCIONÁRIO
  //     B) METAS DE FATURAMENTO
  //     C) ERROS DE CONTAS (QUALIDADE / RETRABALHO)
  //     D) TEMPO DE ENTREGA DE CONTAS (SLA / LEAD TIME)
  // ============================================================
  relatoriosGerenciais: fabricaProcedure
    .input(
      z.object({
        competencia: z.string().optional(), // YYYY-MM
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        hospitalEstabelecimentoId: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const usuario = usuarioFabrica(ctx);
      const hospitalIds = await resolverEscopoFabrica(usuario, input.hospitalEstabelecimentoId, "visualizar");
      const db = await obterDbFabrica();
      const comp = input.competencia || new Date().toISOString().slice(0, 7);
      const dataIni = input.dataInicio || `${comp}-01`;
      const dataFim = input.dataFim || `${comp}-31`;
      const filtroHosp = filtroHospitaisSql("hospital_estabelecimento_id", hospitalIds);
      const filtroHospFc = filtroHospitaisSql("fc.hospital_estabelecimento_id", hospitalIds);
      const filtroHospMeta = filtroHospitaisSql("m.hospital_estabelecimento_id", hospitalIds);
      const metasScope = await podeGerenciarMetaGlobal(usuario)
        ? sql`(${filtroHospMeta} OR m.hospital_estabelecimento_id IS NULL)`
        : filtroHospMeta;
      // A) Produção por Funcionário
      const [producaoRows] = await db.execute(sql`
        SELECT 
          usuario_id as usuarioId,
          COALESCE(usuario_nome, 'Sistema / Não identificado') as usuarioNome,
          SUM(CASE WHEN acao = 'recepcionado' THEN 1 ELSE 0 END) as contasRecepcionadas,
          SUM(CASE WHEN (setor_origem = 'faturamento' AND setor_destino = 'auditoria_interna') OR acao = 'xml_importado' THEN 1 ELSE 0 END) as contasFaturadas,
          SUM(CASE WHEN (setor_origem = 'faturamento' AND setor_destino = 'auditoria_interna') OR acao = 'xml_importado' THEN valor_movimentado ELSE 0 END) as valorFaturado,
          SUM(CASE WHEN setor_origem = 'auditoria_interna' AND setor_destino IN ('auditoria_externa', 'faturamento') THEN 1 ELSE 0 END) as contasAuditadasInterna,
          SUM(CASE WHEN setor_origem = 'auditoria_externa' AND setor_destino = 'limpeza_prontuario' THEN 1 ELSE 0 END) as contasAuditadasExterna,
          SUM(CASE WHEN acao = 'enviado_convenio' THEN 1 ELSE 0 END) as contasLimpasEnviadas,
          COUNT(DISTINCT fabrica_conta_id) as totalContasMovimentadas,
          AVG(CASE WHEN duracao_segundos > 0 THEN duracao_segundos ELSE NULL END) as tempoMedioSegundos
        FROM fabrica_historico_fluxo
        WHERE DATE(created_at) >= ${dataIni}
          AND DATE(created_at) <= ${dataFim}
          AND ${filtroHosp}
        GROUP BY usuario_id, usuario_nome
        ORDER BY contasFaturadas DESC, totalContasMovimentadas DESC
      `);

      // B) Metas de Faturamento x Realizado
      const [metasRows] = await db.execute(sql`
        SELECT 
          m.*,
          e.nome as hospitalNome
        FROM fabrica_metas m
        LEFT JOIN estabelecimentos e ON e.id = m.hospital_estabelecimento_id
        WHERE m.competencia = ${comp} AND ${metasScope}
        ORDER BY m.setor, m.usuario_nome
      `);

      // Totais realizados no período para cruzar com metas
      const [realizadoGeralRows] = await db.execute(sql`
        SELECT 
          COUNT(*) as totalRecebidas,
          SUM(CASE WHEN setor_atual NOT IN ('recepcao', 'faturamento') THEN 1 ELSE 0 END) as totalFaturadas,
          SUM(CASE WHEN setor_atual IN ('enviado_convenio', 'recursos', 'finalizado') THEN 1 ELSE 0 END) as totalEnviadasConvenio,
          COALESCE(SUM(CASE WHEN valor_faturado_final > 0 THEN valor_faturado_final ELSE valor_faturado_inicial END), 0) as valorTotalFaturado
        FROM fabrica_contas fc
        WHERE DATE(fc.data_recebimento_safatle) >= ${dataIni}
          AND DATE(fc.data_recebimento_safatle) <= ${dataFim}
          AND ${filtroHospFc}
      `);

      // C) Relatório de Erros de Contas (por Faturista e por Tipo de Erro)
      const [errosPorFaturistaRows, errosPorTipoRows, listaErrosRecentesRows] = await Promise.all([
        db.execute(sql`
          SELECT 
            COALESCE(faturista_id, 0) as faturistaId,
            COALESCE(faturista_nome, 'Não atribuído') as faturistaNome,
            COUNT(*) as totalErros,
            COUNT(DISTINCT fabrica_conta_id) as contasComErro,
            COALESCE(SUM(impacto_financeiro), 0) as impactoFinanceiroTotal,
            SUM(CASE WHEN corrigido = 'sim' THEN 1 ELSE 0 END) as errosCorrigidos
          FROM fabrica_erros_conta
          WHERE DATE(created_at) >= ${dataIni}
            AND DATE(created_at) <= ${dataFim}
            AND ${filtroHosp}
          GROUP BY faturista_id, faturista_nome
          ORDER BY totalErros DESC
        `),
        db.execute(sql`
          SELECT 
            tipo_erro as tipoErro,
            setor_origem_erro as setorOrigem,
            COUNT(*) as quantidade,
            COALESCE(SUM(impacto_financeiro), 0) as impactoFinanceiro
          FROM fabrica_erros_conta
          WHERE DATE(created_at) >= ${dataIni}
            AND DATE(created_at) <= ${dataFim}
            AND ${filtroHosp}
          GROUP BY tipo_erro, setor_origem_erro
          ORDER BY quantidade DESC
        `),
        db.execute(sql`
          SELECT 
            fe.*,
            fc.nome_paciente as nomePaciente,
            fc.numero_guia as numeroGuia,
            fc.numero_atendimento as numeroAtendimento,
            e.nome as hospitalNome
          FROM fabrica_erros_conta fe
          INNER JOIN fabrica_contas fc ON fc.id = fe.fabrica_conta_id
          LEFT JOIN estabelecimentos e ON e.id = fe.hospital_estabelecimento_id
          WHERE DATE(fe.created_at) >= ${dataIni}
            AND DATE(fe.created_at) <= ${dataFim}
            AND ${filtroHospFc}
          ORDER BY fe.created_at DESC
          LIMIT 50
        `),
      ]);

      // D) Tempo de Entrega de Contas (SLA por Hospital e por Setor)
      const [slaPorHospitalRows, slaPorSetorRows] = await Promise.all([
        db.execute(sql`
          SELECT 
            fc.hospital_estabelecimento_id as hospitalId,
            COALESCE(e.nome, CONCAT('Hospital #', fc.hospital_estabelecimento_id)) as hospitalNome,
            COUNT(*) as totalContas,
            ROUND(AVG(DATEDIFF(DATE(fc.data_recebimento_safatle), fc.data_alta)), 1) as mediaDiasAltaParaRecebimento,
            ROUND(AVG(CASE WHEN fc.data_envio_convenio IS NOT NULL THEN TIMESTAMPDIFF(HOUR, fc.data_recebimento_safatle, fc.data_envio_convenio) / 24.0 ELSE NULL END), 1) as mediaDiasRecebimentoParaEnvio,
            SUM(CASE WHEN fc.setor_atual IN ('enviado_convenio', 'recursos', 'finalizado') THEN 1 ELSE 0 END) as contasEntregues,
            SUM(CASE WHEN fc.setor_atual NOT IN ('enviado_convenio', 'recursos', 'finalizado') THEN 1 ELSE 0 END) as contasEmAberto
          FROM fabrica_contas fc
          LEFT JOIN estabelecimentos e ON e.id = fc.hospital_estabelecimento_id
          WHERE DATE(fc.data_recebimento_safatle) >= ${dataIni}
            AND DATE(fc.data_recebimento_safatle) <= ${dataFim}
            AND ${filtroHospFc}
          GROUP BY fc.hospital_estabelecimento_id, e.nome
          ORDER BY totalContas DESC
        `),
        db.execute(sql`
          SELECT 
            setor_origem as setor,
            COUNT(*) as transicoes,
            ROUND(AVG(duracao_segundos) / 3600.0, 2) as mediaHoras
          FROM fabrica_historico_fluxo
          WHERE setor_origem IS NOT NULL
            AND duracao_segundos > 0
            AND DATE(created_at) >= ${dataIni}
            AND DATE(created_at) <= ${dataFim}
            AND ${filtroHosp}
          GROUP BY setor_origem
        `),
      ]);

      const resumoGeral = ((realizadoGeralRows as any)[0] || [])[0] || {};

      return {
        competencia: comp,
        resumoPeriodo: {
          totalRecebidas: Number(resumoGeral.totalRecebidas) || 0,
          totalFaturadas: Number(resumoGeral.totalFaturadas) || 0,
          totalEnviadasConvenio: Number(resumoGeral.totalEnviadasConvenio) || 0,
          valorTotalFaturado: Number(resumoGeral.valorTotalFaturado) || 0,
        },
        producaoPorFuncionario: ((producaoRows as any)[0] || []).map((r: any) => ({
          usuarioId: Number(r.usuarioId) || 0,
          usuarioNome: r.usuarioNome,
          contasRecepcionadas: Number(r.contasRecepcionadas) || 0,
          contasFaturadas: Number(r.contasFaturadas) || 0,
          valorFaturado: Number(r.valorFaturado) || 0,
          contasAuditadasInterna: Number(r.contasAuditadasInterna) || 0,
          contasAuditadasExterna: Number(r.contasAuditadasExterna) || 0,
          contasLimpasEnviadas: Number(r.contasLimpasEnviadas) || 0,
          totalContasMovimentadas: Number(r.totalContasMovimentadas) || 0,
          tempoMedioMinutos: Math.round((Number(r.tempoMedioSegundos) || 0) / 60),
        })),
        metas: ((metasRows as any)[0] || []).map((m: any) => ({
          id: Number(m.id),
          competencia: m.competencia,
          setor: m.setor,
          usuarioId: m.usuario_id ? Number(m.usuario_id) : null,
          usuarioNome: m.usuario_nome || "Equipe Geral do Setor",
          hospitalEstabelecimentoId: m.hospital_estabelecimento_id
            ? Number(m.hospital_estabelecimento_id)
            : null,
          hospitalNome: m.hospitalNome || "Todos os Hospitais",
          metaQuantidadeContas: Number(m.meta_quantidade_contas) || 0,
          metaValorFaturado: Number(m.meta_valor_faturado) || 0,
          metaSlaHoras: Number(m.meta_sla_horas) || 48,
          observacao: m.observacao,
        })),
        errosPorFaturista: ((errosPorFaturistaRows as any)[0] || []).map((e: any) => ({
          faturistaId: Number(e.faturistaId),
          faturistaNome: e.faturistaNome,
          totalErros: Number(e.totalErros) || 0,
          contasComErro: Number(e.contasComErro) || 0,
          impactoFinanceiroTotal: Number(e.impactoFinanceiroTotal) || 0,
          errosCorrigidos: Number(e.errosCorrigidos) || 0,
        })),
        errosPorTipo: ((errosPorTipoRows as any)[0] || []).map((e: any) => ({
          tipoErro: e.tipoErro,
          setorOrigem: e.setorOrigem,
          quantidade: Number(e.quantidade) || 0,
          impactoFinanceiro: Number(e.impactoFinanceiro) || 0,
        })),
        listaErrosRecentes: ((listaErrosRecentesRows as any)[0] || []).map((e: any) => ({
          id: Number(e.id),
          fabricaContaId: Number(e.fabrica_conta_id),
          hospitalNome: e.hospitalNome,
          nomePaciente: e.nomePaciente,
          numeroGuia: e.numeroGuia || e.numeroAtendimento,
          faturistaNome: e.faturista_nome,
          auditorNome: e.auditor_nome,
          setorOrigemErro: e.setor_origem_erro,
          tipoErro: e.tipo_erro,
          codigoItem: e.codigo_item,
          descricaoErro: e.descricao_erro,
          impactoFinanceiro: Number(e.impacto_financeiro) || 0,
          corrigido: e.corrigido,
          createdAt: e.created_at,
        })),
        slaPorHospital: ((slaPorHospitalRows as any)[0] || []).map((s: any) => ({
          hospitalId: Number(s.hospitalId),
          hospitalNome: s.hospitalNome,
          totalContas: Number(s.totalContas) || 0,
          mediaDiasAltaParaRecebimento: Number(s.mediaDiasAltaParaRecebimento) || 0,
          mediaDiasRecebimentoParaEnvio: Number(s.mediaDiasRecebimentoParaEnvio) || 0,
          contasEntregues: Number(s.contasEntregues) || 0,
          contasEmAberto: Number(s.contasEmAberto) || 0,
        })),
        slaPorSetor: ((slaPorSetorRows as any)[0] || []).map((s: any) => ({
          setor: s.setor,
          transicoes: Number(s.transicoes) || 0,
          mediaHoras: Number(s.mediaHoras) || 0,
        })),
      };
    }),

  // ============================================================
  // 11. SALVAR / EXCLUIR META DE FATURAMENTO
  // ============================================================
  salvarMeta: fabricaProcedure
    .input(z.object({ competencia: z.string().regex(/^\d{4}-\d{2}$/), setor: z.enum(fabricaSetorEnum).default("faturamento"), usuarioId: z.number().positive().optional().nullable(),
      hospitalEstabelecimentoId: z.number().positive().optional().nullable(), metaQuantidadeContas: z.number().min(0), metaValorFaturado: z.number().min(0).default(0), metaSlaHoras: z.number().min(1).default(48), observacao: z.string().max(4000).optional().nullable() }))
    .mutation(async ({ input, ctx }) => {
      const usuario = usuarioFabrica(ctx); await exigirAcessoFabrica(usuario);
      if (!input.hospitalEstabelecimentoId && !(await podeGerenciarMetaGlobal(usuario))) throw new TRPCError({ code: "FORBIDDEN", message: "Meta global exige gestor central autorizado." });
      if (input.hospitalEstabelecimentoId) await exigirHospitalProprietario(usuario, input.hospitalEstabelecimentoId, "gerenciar");
      const db = await obterDbFabrica();
      let usuarioNome: string | null = null;
      if (input.usuarioId) {
        if (input.hospitalEstabelecimentoId) await exigirColaboradorNoEscopo(input.usuarioId, [input.hospitalEstabelecimentoId]);
        const [colaborador] = await db.select({ name: users.name }).from(users).where(eq(users.id, input.usuarioId)).limit(1);
        if (!colaborador) throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
        usuarioNome = colaborador.name || `Usuário #${input.usuarioId}`;
      }
      await db.insert(fabricaMetas).values({ competencia: input.competencia, setor: input.setor, usuarioId: input.usuarioId || null, usuarioNome,
        hospitalEstabelecimentoId: input.hospitalEstabelecimentoId || null, metaQuantidadeContas: input.metaQuantidadeContas,
        metaValorFaturado: String(input.metaValorFaturado.toFixed(2)), metaSlaHoras: input.metaSlaHoras, observacao: input.observacao || null });
      return { sucesso: true };
    }),

  excluirMeta: fabricaProcedure
    .input(z.object({ id: z.number().positive() }))
    .mutation(async ({ input, ctx }) => {
      const usuario = usuarioFabrica(ctx); await exigirAcessoFabrica(usuario);
      const db = await obterDbFabrica();
      const [meta] = await db.select({ id: fabricaMetas.id, hospitalEstabelecimentoId: fabricaMetas.hospitalEstabelecimentoId }).from(fabricaMetas).where(eq(fabricaMetas.id, input.id)).limit(1);
      if (!meta) throw new TRPCError({ code: "NOT_FOUND", message: "Meta não encontrada." });
      if (!meta.hospitalEstabelecimentoId) {
        if (!(await podeGerenciarMetaGlobal(usuario))) throw new TRPCError({ code: "FORBIDDEN", message: "Meta global exige gestor central autorizado." });
      } else {
        await exigirHospitalProprietario(usuario, meta.hospitalEstabelecimentoId, "gerenciar");
        await exigirHospitalProprietario(usuario, meta.hospitalEstabelecimentoId, "excluir");
      }
      await db.delete(fabricaMetas).where(and(eq(fabricaMetas.id, meta.id), meta.hospitalEstabelecimentoId ? eq(fabricaMetas.hospitalEstabelecimentoId, meta.hospitalEstabelecimentoId) : sql`hospital_estabelecimento_id IS NULL`));
      return { sucesso: true };
    }),

});
