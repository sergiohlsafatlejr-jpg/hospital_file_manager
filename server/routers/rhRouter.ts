import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb, verificarAcessoModulo, verificarPermissaoEstabelecimento } from "../db";
import { rhFolhaPagamento, rhCargosSalarios } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { exigirUnidadeFinanceira } from "../financeiroEscopo";

export async function exigirAcessoRh(
  userId: number,
  estabelecimentoId: number | undefined | null,
  acao: "visualizar" | "editar" | "excluir" | "gerenciar" = "visualizar"
): Promise<number> {
  if (!estabelecimentoId || !Number.isSafeInteger(estabelecimentoId) || estabelecimentoId <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Estabelecimento obrigatório para acessar Recursos Humanos",
    });
  }

  const temPermissaoUnidade = await verificarPermissaoEstabelecimento(
    userId,
    estabelecimentoId,
    acao
  );
  if (!temPermissaoUnidade) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sem permissão para esta operação no estabelecimento",
    });
  }

  const temAcessoModuloRh = await verificarAcessoModulo(
    userId,
    estabelecimentoId,
    "recursosHumanos"
  );
  if (!temAcessoModuloRh) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sem acesso ao módulo de Recursos Humanos neste estabelecimento",
    });
  }

  return estabelecimentoId;
}

export const rhRouter = router({
  listFolha: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number().int().positive(),
        competencia: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const estabelecimentoId = await exigirAcessoRh(
        ctx.user.id,
        input.estabelecimentoId,
        "visualizar"
      );
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [eq(rhFolhaPagamento.estabelecimentoId, estabelecimentoId)];
      if (input.competencia) {
        conditions.push(eq(rhFolhaPagamento.competencia, input.competencia));
      }

      return await db
        .select()
        .from(rhFolhaPagamento)
        .where(and(...conditions))
        .orderBy(desc(rhFolhaPagamento.colaboradorNome));
    }),

  competencias: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number().int().positive(),
      })
    )
    .query(async ({ input, ctx }) => {
      const estabelecimentoId = await exigirAcessoRh(
        ctx.user.id,
        input.estabelecimentoId,
        "visualizar"
      );
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return await db
        .selectDistinct({ competencia: rhFolhaPagamento.competencia })
        .from(rhFolhaPagamento)
        .where(eq(rhFolhaPagamento.estabelecimentoId, estabelecimentoId))
        .orderBy(desc(rhFolhaPagamento.competencia));
    }),

  listColaboradores: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number().int().positive(),
      })
    )
    .query(async ({ input, ctx }) => {
      const estabelecimentoId = await exigirAcessoRh(
        ctx.user.id,
        input.estabelecimentoId,
        "visualizar"
      );
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const allRecords = await db
        .select()
        .from(rhFolhaPagamento)
        .where(eq(rhFolhaPagamento.estabelecimentoId, estabelecimentoId))
        .orderBy(desc(rhFolhaPagamento.competencia), desc(rhFolhaPagamento.createdAt));

      const colaboradoresMap = new Map();
      for (const record of allRecords) {
        const key = record.cpf || record.colaboradorNome;
        if (key && !colaboradoresMap.has(key)) {
          colaboradoresMap.set(key, record);
        }
      }
      return Array.from(colaboradoresMap.values());
    }),

  updateColaborador: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number().int().positive().optional(),
        id: z.number().int().positive().optional(),
        originalCpf: z.string().nullable().optional(),
        originalNome: z.string(),
        nome: z.string(),
        cpf: z.string().nullable().optional(),
        unidade: z.string().nullable().optional(),
        cargo: z.string().nullable().optional(),
        empresa: z.string().nullable().optional(),
        dataAdmissao: z.string().nullable().optional(),
        dataDemissao: z.string().nullable().optional(),
        dataNascimento: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let estabelecimentoProprietario = input.estabelecimentoId;

      if (input.id !== undefined) {
        const [registroPorId] = await db
          .select({
            id: rhFolhaPagamento.id,
            estabelecimentoId: rhFolhaPagamento.estabelecimentoId,
          })
          .from(rhFolhaPagamento)
          .where(eq(rhFolhaPagamento.id, input.id))
          .limit(1);

        if (!registroPorId || !registroPorId.estabelecimentoId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Colaborador não encontrado",
          });
        }

        if (
          estabelecimentoProprietario !== undefined &&
          estabelecimentoProprietario !== registroPorId.estabelecimentoId
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Colaborador não pertence ao estabelecimento informado",
          });
        }

        estabelecimentoProprietario = registroPorId.estabelecimentoId;
      }

      const estabelecimentoId = await exigirAcessoRh(
        ctx.user.id,
        estabelecimentoProprietario,
        "editar"
      );

      const identityCondition = input.originalCpf
        ? eq(rhFolhaPagamento.cpf, input.originalCpf)
        : eq(rhFolhaPagamento.colaboradorNome, input.originalNome);

      const scopedCondition = and(
        eq(rhFolhaPagamento.estabelecimentoId, estabelecimentoId),
        identityCondition
      );

      const existentes = await db
        .select({ id: rhFolhaPagamento.id })
        .from(rhFolhaPagamento)
        .where(scopedCondition)
        .limit(1);

      if (existentes.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Colaborador não encontrado neste estabelecimento",
        });
      }

      await db
        .update(rhFolhaPagamento)
        .set({
          colaboradorNome: input.nome,
          cpf: input.cpf,
          unidade: input.unidade,
          cargo: input.cargo,
          empresa: input.empresa,
          dataAdmissao: input.dataAdmissao ? new Date(input.dataAdmissao) : null,
          dataDemissao: input.dataDemissao ? new Date(input.dataDemissao) : null,
          dataNascimento: input.dataNascimento ? new Date(input.dataNascimento) : null,
        })
        .where(scopedCondition);
      return true;
    }),

  createColaborador: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number().int().positive(),
        nome: z.string(),
        cpf: z.string().nullable().optional(),
        unidade: z.string().nullable().optional(),
        cargo: z.string().nullable().optional(),
        empresa: z.string().nullable().optional(),
        dataAdmissao: z.string().nullable().optional(),
        dataDemissao: z.string().nullable().optional(),
        dataNascimento: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const estabelecimentoId = await exigirAcessoRh(
        ctx.user.id,
        input.estabelecimentoId,
        "editar"
      );
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const currentMonth = new Date().toISOString().substring(0, 7);

      await db.insert(rhFolhaPagamento).values({
        arquivoId: 0,
        estabelecimentoId,
        competencia: currentMonth,
        colaboradorNome: input.nome,
        cpf: input.cpf,
        unidade: input.unidade,
        cargo: input.cargo,
        empresa: input.empresa,
        dataAdmissao: input.dataAdmissao ? new Date(input.dataAdmissao) : null,
        dataDemissao: input.dataDemissao ? new Date(input.dataDemissao) : null,
        dataNascimento: input.dataNascimento ? new Date(input.dataNascimento) : null,
      });
      return true;
    }),

  listCargosSalarios: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number().int().positive(),
      })
    )
    .query(async ({ input, ctx }) => {
      const estabelecimentoId = await exigirAcessoRh(
        ctx.user.id,
        input.estabelecimentoId,
        "visualizar"
      );
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return await db
        .select()
        .from(rhCargosSalarios)
        .where(eq(rhCargosSalarios.estabelecimentoId, estabelecimentoId));
    }),

  sincronizarCargosSalarios: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const estabelecimentoId = await exigirAcessoRh(
        ctx.user.id,
        input.estabelecimentoId,
        "editar"
      );
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const cargos = await db
        .select()
        .from(rhCargosSalarios)
        .where(eq(rhCargosSalarios.estabelecimentoId, estabelecimentoId));

      const existingCargos = new Set(cargos.map((c) => c.cargo));
      const folhaCargos = await db
        .selectDistinct({ cargo: rhFolhaPagamento.cargo })
        .from(rhFolhaPagamento)
        .where(eq(rhFolhaPagamento.estabelecimentoId, estabelecimentoId));

      const novosCargos = folhaCargos
        .map((c) => c.cargo)
        .filter((c): c is string => !!c && !existingCargos.has(c));

      if (novosCargos.length > 0) {
        const insertData = novosCargos.map((c) => ({
          estabelecimentoId,
          cargo: c,
          salarioBase: null,
          tetoSalarial: null,
        }));
        await db.insert(rhCargosSalarios).values(insertData);
        return await db
          .select()
          .from(rhCargosSalarios)
          .where(eq(rhCargosSalarios.estabelecimentoId, estabelecimentoId));
      }

      return cargos;
    }),

  updateCargoSalario: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        estabelecimentoId: z.number().int().positive().optional(),
        salarioBase: z.number().nullable(),
        tetoSalarial: z.number().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [cargoAlvo] = await db
        .select({
          id: rhCargosSalarios.id,
          estabelecimentoId: rhCargosSalarios.estabelecimentoId,
        })
        .from(rhCargosSalarios)
        .where(eq(rhCargosSalarios.id, input.id))
        .limit(1);

      if (!cargoAlvo || !cargoAlvo.estabelecimentoId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Cargo não encontrado",
        });
      }

      if (
        input.estabelecimentoId !== undefined &&
        input.estabelecimentoId !== cargoAlvo.estabelecimentoId
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cargo não pertence ao estabelecimento informado",
        });
      }

      await exigirAcessoRh(ctx.user.id, cargoAlvo.estabelecimentoId, "editar");

      await db
        .update(rhCargosSalarios)
        .set({
          salarioBase: input.salarioBase !== null ? String(input.salarioBase) : null,
          tetoSalarial: input.tetoSalarial !== null ? String(input.tetoSalarial) : null,
        })
        .where(
          and(
            eq(rhCargosSalarios.id, input.id),
            eq(rhCargosSalarios.estabelecimentoId, cargoAlvo.estabelecimentoId)
          )
        );
      return true;
    }),

  custoReceitaUnidade: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number().int().positive(),
        mes: z.string(), // Format 'YYYY-MM'
      })
    )
    .query(async ({ input, ctx }) => {
      await exigirUnidadeFinanceira(ctx.user.id, input.estabelecimentoId);
      const [temFinanceiro, temRh] = await Promise.all([
        verificarAcessoModulo(ctx.user.id, input.estabelecimentoId, "financeiro"),
        verificarAcessoModulo(ctx.user.id, input.estabelecimentoId, "recursosHumanos"),
      ]);
      if (!temFinanceiro && !temRh) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Sem acesso ao módulo Financeiro ou Recursos Humanos neste estabelecimento",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // 1. Puxa os custos do RH do mês
      const folha = await db
        .select()
        .from(rhFolhaPagamento)
        .where(
          and(
            eq(rhFolhaPagamento.estabelecimentoId, input.estabelecimentoId),
            eq(rhFolhaPagamento.competencia, input.mes)
          )
        );

      const mapUnidades = new Map<
        string,
        {
          unidade: string;
          custoBruto: number;
          beneficios: number;
          receita: number;
          funcionarios: number;
        }
      >();

      folha.forEach((row) => {
        const u = row.unidade || "Não Informada";
        if (!mapUnidades.has(u)) {
          mapUnidades.set(u, {
            unidade: u,
            custoBruto: 0,
            beneficios: 0,
            receita: 0,
            funcionarios: 0,
          });
        }
        const data = mapUnidades.get(u)!;
        data.custoBruto += parseFloat(row.salarioBruto || "0") || 0;
        data.beneficios += parseFloat(row.somaBeneficios || "0") || 0;
        data.funcionarios += 1;
      });

      // 2. Puxa a receita do Contas a Receber (fin_recebiveis) do mesmo mês
      const connection = (db as any).session.client;
      const [receitasRows] = await connection.query(
        `
        SELECT c.nome as unidade, SUM(r.valor) as receita 
        FROM fin_recebiveis r 
        JOIN fin_clientes c ON r.clienteId = c.id 
        JOIN fin_empresas e ON e.id = r.empresaId AND c.empresaId = e.id
        WHERE DATE_FORMAT(r.dataVencimento, '%Y-%m') = ? AND e.estabelecimentoId = ?
        GROUP BY c.nome
      `,
        [input.mes, input.estabelecimentoId]
      );

      // Associa a receita à unidade (com fuzzy match simples se necessário)
      if (Array.isArray(receitasRows)) {
        for (const r of receitasRows) {
          const nomeCliente = r.unidade || "Não Informada";

          let unidadeEncontrada = nomeCliente;
          for (const [u] of mapUnidades.entries()) {
            const uLower = u.toLowerCase().trim();
            const cLower = nomeCliente.toLowerCase().trim();
            if (uLower === cLower || cLower.includes(uLower) || uLower.includes(cLower)) {
              unidadeEncontrada = u;
              break;
            }
          }

          if (!mapUnidades.has(unidadeEncontrada)) {
            mapUnidades.set(unidadeEncontrada, {
              unidade: unidadeEncontrada,
              custoBruto: 0,
              beneficios: 0,
              receita: 0,
              funcionarios: 0,
            });
          }
          const data = mapUnidades.get(unidadeEncontrada)!;
          data.receita += parseFloat(r.receita || "0");
        }
      }

      const resultado = Array.from(mapUnidades.values());
      resultado.sort((a, b) => b.custoBruto + b.beneficios - (a.custoBruto + a.beneficios));

      return resultado;
    }),
});
