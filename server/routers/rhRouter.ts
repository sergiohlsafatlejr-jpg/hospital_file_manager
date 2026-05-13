import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { rhFolhaPagamento, rhCargosSalarios } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";

export const rhRouter = router({
  listFolha: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number().optional(),
      competencia: z.string().optional()
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      let conditions = [];
      if (input.estabelecimentoId) {
        conditions.push(eq(rhFolhaPagamento.estabelecimentoId, input.estabelecimentoId));
      }
      if (input.competencia) {
        conditions.push(eq(rhFolhaPagamento.competencia, input.competencia));
      }
      
      const query = db.select().from(rhFolhaPagamento).orderBy(desc(rhFolhaPagamento.colaboradorNome));
      if (conditions.length > 0) {
        query.where(and(...conditions));
      }
      return await query;
    }),
    
  competencias: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number().optional()
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const query = db
        .selectDistinct({ competencia: rhFolhaPagamento.competencia })
        .from(rhFolhaPagamento)
        .where(input.estabelecimentoId ? eq(rhFolhaPagamento.estabelecimentoId, input.estabelecimentoId) : undefined)
        .orderBy(desc(rhFolhaPagamento.competencia));
      return await query;
    }),

  listColaboradores: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number().optional()
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const allRecords = await db.select().from(rhFolhaPagamento)
        .where(input.estabelecimentoId ? eq(rhFolhaPagamento.estabelecimentoId, input.estabelecimentoId) : undefined)
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
    .input(z.object({
      originalCpf: z.string().nullable().optional(),
      originalNome: z.string(),
      nome: z.string(),
      cpf: z.string().nullable().optional(),
      unidade: z.string().nullable().optional(),
      cargo: z.string().nullable().optional(),
      empresa: z.string().nullable().optional(),
      dataAdmissao: z.string().nullable().optional(),
      dataDemissao: z.string().nullable().optional(),
      dataNascimento: z.string().nullable().optional()
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      let condition;
      if (input.originalCpf) {
        condition = eq(rhFolhaPagamento.cpf, input.originalCpf);
      } else {
        condition = eq(rhFolhaPagamento.colaboradorNome, input.originalNome);
      }
      
      await db.update(rhFolhaPagamento).set({
        colaboradorNome: input.nome,
        cpf: input.cpf,
        unidade: input.unidade,
        cargo: input.cargo,
        empresa: input.empresa,
        dataAdmissao: input.dataAdmissao ? new Date(input.dataAdmissao) : null,
        dataDemissao: input.dataDemissao ? new Date(input.dataDemissao) : null,
        dataNascimento: input.dataNascimento ? new Date(input.dataNascimento) : null,
      }).where(condition);
      return true;
    }),

  createColaborador: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
      nome: z.string(),
      cpf: z.string().nullable().optional(),
      unidade: z.string().nullable().optional(),
      cargo: z.string().nullable().optional(),
      empresa: z.string().nullable().optional(),
      dataAdmissao: z.string().nullable().optional(),
      dataNascimento: z.string().nullable().optional()
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const currentMonth = new Date().toISOString().substring(0, 7);
      
      await db.insert(rhFolhaPagamento).values({
        arquivoId: 0,
        estabelecimentoId: input.estabelecimentoId,
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
    .input(z.object({
      estabelecimentoId: z.number().optional()
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      // Returns from the specific table, or if we want to auto-extract cargos from folha to seed it
      const cargos = await db.select().from(rhCargosSalarios)
        .where(input.estabelecimentoId ? eq(rhCargosSalarios.estabelecimentoId, input.estabelecimentoId) : undefined);
      
      // Auto seed cargos that exist in rhFolhaPagamento but not in rhCargosSalarios
      if (input.estabelecimentoId) {
        const existingCargos = new Set(cargos.map(c => c.cargo));
        const folhaCargos = await db.selectDistinct({ cargo: rhFolhaPagamento.cargo })
          .from(rhFolhaPagamento)
          .where(eq(rhFolhaPagamento.estabelecimentoId, input.estabelecimentoId));
        
        const novosCargos = folhaCargos
          .map(c => c.cargo)
          .filter((c): c is string => !!c && !existingCargos.has(c));
          
        if (novosCargos.length > 0) {
          const insertData = novosCargos.map(c => ({
            estabelecimentoId: input.estabelecimentoId!,
            cargo: c,
            salarioBase: null,
            tetoSalarial: null
          }));
          await db.insert(rhCargosSalarios).values(insertData);
          // Re-fetch
          return await db.select().from(rhCargosSalarios)
            .where(eq(rhCargosSalarios.estabelecimentoId, input.estabelecimentoId));
        }
      }
      return cargos;
    }),

  updateCargoSalario: protectedProcedure
    .input(z.object({
      id: z.number(),
      salarioBase: z.number().nullable(),
      tetoSalarial: z.number().nullable()
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(rhCargosSalarios)
        .set({
          salarioBase: input.salarioBase !== null ? String(input.salarioBase) : null,
          tetoSalarial: input.tetoSalarial !== null ? String(input.tetoSalarial) : null
        })
        .where(eq(rhCargosSalarios.id, input.id));
      return true;
    }),

  custoReceitaUnidade: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number().optional(),
      mes: z.string() // Format 'YYYY-MM'
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      // 1. Puxa os custos do RH do mês
      const folha = await db.select().from(rhFolhaPagamento)
        .where(
          and(
            input.estabelecimentoId ? eq(rhFolhaPagamento.estabelecimentoId, input.estabelecimentoId) : undefined,
            eq(rhFolhaPagamento.competencia, input.mes)
          )
        );

      const mapUnidades = new Map<string, { unidade: string, custoBruto: number, beneficios: number, receita: number, funcionarios: number }>();

      folha.forEach(row => {
        const u = row.unidade || "Não Informada";
        if (!mapUnidades.has(u)) {
          mapUnidades.set(u, { unidade: u, custoBruto: 0, beneficios: 0, receita: 0, funcionarios: 0 });
        }
        const data = mapUnidades.get(u)!;
        data.custoBruto += parseFloat(row.salarioBruto || "0") || 0;
        data.beneficios += parseFloat(row.somaBeneficios || "0") || 0;
        data.funcionarios += 1;
      });

      // 2. Puxa a receita do Contas a Receber (fin_recebiveis) do mesmo mês
      const connection = (db as any).session.client; 
      const [receitasRows] = await connection.query(`
        SELECT c.nome as unidade, SUM(r.valor) as receita 
        FROM fin_recebiveis r 
        JOIN fin_clientes c ON r.clienteId = c.id 
        WHERE DATE_FORMAT(r.dataVencimento, '%Y-%m') = ?
        GROUP BY c.nome
      `, [input.mes]);

      // Associa a receita à unidade (com fuzzy match simples se necessário)
      if (Array.isArray(receitasRows)) {
        for (const r of receitasRows) {
          const nomeCliente = r.unidade || "Não Informada";
          
          // Tenta encontrar uma unidade correspondente no RH que contenha o nome do cliente ou vice-versa
          let unidadeEncontrada = nomeCliente;
          for (const [u, data] of mapUnidades.entries()) {
             const uLower = u.toLowerCase().trim();
             const cLower = nomeCliente.toLowerCase().trim();
             if (uLower === cLower || cLower.includes(uLower) || uLower.includes(cLower)) {
                unidadeEncontrada = u;
                break;
             }
          }

          if (!mapUnidades.has(unidadeEncontrada)) {
            mapUnidades.set(unidadeEncontrada, { unidade: unidadeEncontrada, custoBruto: 0, beneficios: 0, receita: 0, funcionarios: 0 });
          }
          const data = mapUnidades.get(unidadeEncontrada)!;
          data.receita += parseFloat(r.receita || "0");
        }
      }

      // Ordenar por custo total (maior para menor)
      const resultado = Array.from(mapUnidades.values());
      resultado.sort((a, b) => (b.custoBruto + b.beneficios) - (a.custoBruto + a.beneficios));

      return resultado;
    }),
});
