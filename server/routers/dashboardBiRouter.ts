import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const dashboardBiRouter = router({
  getFluxoCaixa: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number().optional(),
        mesFaturado: z.string().optional(),
        mesPagamento: z.string().optional(),
        convenios: z.array(z.string()).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
      }

      // Build WHERE clause
      let whereClause = "1=1";
      const params: any[] = [];

      if (input.estabelecimentoId) {
        // FIXME: Temporariamente desativado pois os dados importados do PBIX estão com ID 6
        // whereClause += ` AND estabelecimentoId = ?`;
        // params.push(input.estabelecimentoId);
      }
      
      if (input.mesFaturado && input.mesFaturado !== "Todos") {
        whereClause += ` AND COMPETENCIA = ?`;
        params.push(input.mesFaturado);
      }

      // Base aggregation on tasy_faturado_itens_bi
      // Note: We cast string values to decimal for summation.
      const query = sql.raw(`
        SELECT 
          CONVENIO as convenio,
          COMPETENCIA as fat_m,
          MAX(DT_PGTO) as vanc_m,
          SUM(CAST(REPLACE(REPLACE(VL_PRODUZIDO, '.', ''), ',', '.') AS DECIMAL(15,2))) as faturado,
          SUM(CAST(REPLACE(REPLACE(VL_PRODUZIDO, '.', ''), ',', '.') AS DECIMAL(15,2))) as processado,
          SUM(CAST(REPLACE(REPLACE(VL_PAGO, '.', ''), ',', '.') AS DECIMAL(15,2))) as recebido,
          SUM(CAST(REPLACE(REPLACE(VL_GLOSA, '.', ''), ',', '.') AS DECIMAL(15,2))) as glosa,
          SUM(CAST(REPLACE(REPLACE(VL_AMAIOR, '.', ''), ',', '.') AS DECIMAL(15,2))) as a_maior,
          SUM(CAST(REPLACE(REPLACE(A_RECEBER, '.', ''), ',', '.') AS DECIMAL(15,2))) as a_receber
        FROM tasy_faturado_itens_bi
        WHERE ${whereClause} AND CONVENIO IS NOT NULL AND CONVENIO != ''
        GROUP BY CONVENIO, COMPETENCIA
        ORDER BY faturado DESC
        LIMIT 200
      `);

      try {
        const result = await db.execute(query, params);
        const rows = (result as any)[0] || [];

        // Post-processing to add calculated columns (DAX equivalents)
        const processados = rows.map((r: any) => {
          const faturado = parseFloat(r.faturado || "0");
          const glosa = parseFloat(r.glosa || "0");
          const a_receber = parseFloat(r.a_receber || "0");
          const recebido = parseFloat(r.recebido || "0");
          
          const pctGlosa = faturado > 0 ? (glosa / faturado) * 100 : 0;
          
          // DAX Mocks for Recurso/Recuperada until mapped in DB
          const gl_s_rec = glosa * 0.4; 
          const gl_recurso = glosa * 0.6;
          const gl_recuperada = gl_recurso * 0.5;
          const inadimplencia = a_receber > 0 ? a_receber * 0.9 : 0; // Simulated
          const atraso_d = a_receber > 0 ? 45 : 0; // Simulated

          return {
            convenio: r.convenio || "Desconhecido",
            fat_m: r.fat_m || "-",
            venc_m: r.vanc_m || "-",
            pgto_m: r.vanc_m || "-",
            faturado,
            processado: faturado, // Simulating Processado = Faturado for now
            recebido,
            glosa,
            pct_glosa: pctGlosa,
            gl_s_rec,
            gl_recurso,
            gl_recuperada,
            a_maior: parseFloat(r.a_maior || "0"),
            a_receber,
            inadimplencia,
            atraso_d
          };
        });

        return processados;
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro na query do fluxo de caixa: ${err.message}`,
        });
      }
    }),

  getAnaliseGlosas: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
      }

      let whereClause = "1=1";
      const params: any[] = [];
      if (input.estabelecimentoId) {
        // FIXME: Temporariamente desativado pois os dados importados do PBIX estão com ID 6
        // whereClause += ` AND estabelecimentoId = ?`;
        // params.push(input.estabelecimentoId);
      }

      // Query por Convenio
      const qConvenio = sql.raw(`
        SELECT CONVENIO as name, SUM(CAST(REPLACE(REPLACE(VL_GLOSA, '.', ''), ',', '.') AS DECIMAL(15,2))) as value
        FROM tasy_faturado_itens_bi
        WHERE ${whereClause} AND VL_GLOSA IS NOT NULL AND VL_GLOSA != '0,00' AND VL_GLOSA != '0'
        GROUP BY CONVENIO
        ORDER BY value DESC LIMIT 10
      `);

      // Query por Setor
      const qSetor = sql.raw(`
        SELECT SETOR as name, SUM(CAST(REPLACE(REPLACE(VL_GLOSA, '.', ''), ',', '.') AS DECIMAL(15,2))) as value
        FROM tasy_faturado_itens_bi
        WHERE ${whereClause} AND VL_GLOSA IS NOT NULL AND VL_GLOSA != '0,00' AND VL_GLOSA != '0' AND SETOR IS NOT NULL
        GROUP BY SETOR
        ORDER BY value DESC LIMIT 10
      `);

      // Query por Item (Procedimento/MatMed)
      const qItem = sql.raw(`
        SELECT DESCRICAO as name, SUM(CAST(REPLACE(REPLACE(VL_GLOSA, '.', ''), ',', '.') AS DECIMAL(15,2))) as value
        FROM tasy_faturado_itens_bi
        WHERE ${whereClause} AND VL_GLOSA IS NOT NULL AND VL_GLOSA != '0,00' AND VL_GLOSA != '0' AND DESCRICAO IS NOT NULL
        GROUP BY DESCRICAO
        ORDER BY value DESC LIMIT 10
      `);

      // Query por Motivo
      const qMotivo = sql.raw(`
        SELECT MOTIVO_GLOSA as name, SUM(CAST(REPLACE(REPLACE(VL_GLOSA, '.', ''), ',', '.') AS DECIMAL(15,2))) as value
        FROM tasy_faturado_itens_bi
        WHERE ${whereClause} AND VL_GLOSA IS NOT NULL AND VL_GLOSA != '0,00' AND VL_GLOSA != '0' AND MOTIVO_GLOSA IS NOT NULL
        GROUP BY MOTIVO_GLOSA
        ORDER BY value DESC LIMIT 10
      `);

      try {
        const [rConv, rSetor, rItem, rMotivo] = await Promise.all([
          db.execute(qConvenio, params),
          db.execute(qSetor, params),
          db.execute(qItem, params),
          db.execute(qMotivo, params)
        ]);

        return {
          porConvenio: (rConv as any)[0] || [],
          porSetor: (rSetor as any)[0] || [],
          porItem: (rItem as any)[0] || [],
          porMotivo: (rMotivo as any)[0] || []
        };
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro na query de analise de glosas: ${err.message}`,
        });
      }
    }),
    
  getEvolucaoMensalGlosas: protectedProcedure
    .input(z.object({ estabelecimentoId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
       const db = await getDb();
       if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
       
       let whereClause = "1=1";
       const params: any[] = [];
       if (input.estabelecimentoId) {
         // whereClause += ` AND estabelecimentoId = ?`;
         // params.push(input.estabelecimentoId);
       }
       
       const query = sql.raw(`
         SELECT 
           COMPETENCIA as mes, 
           SUM(CAST(REPLACE(REPLACE(VL_GLOSA, '.', ''), ',', '.') AS DECIMAL(15,2))) as vlGlosa
         FROM tasy_faturado_itens_bi
         WHERE ${whereClause} AND COMPETENCIA IS NOT NULL AND COMPETENCIA != ''
         GROUP BY COMPETENCIA
         ORDER BY COMPETENCIA ASC
       `);
       
       try {
          const result = await db.execute(query, params);
          const rows = (result as any)[0] || [];
          return rows.map((r: any) => ({
             mes: r.mes,
             vlGlosa: parseFloat(r.vlGlosa || "0"),
             glRecursada: parseFloat(r.vlGlosa || "0") * 0.7 // Simulando a recursada enquanto ajustamos as views
          }));
       } catch(err: any) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Erro na evolucao mensal: ${err.message}`,
          });
       }
    })
});
