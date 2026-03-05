import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { contasConvenioItens, contasConvenioResumo, integracaoMapeamentos, integracaoConexoes } from "../../drizzle/schema";
import { queryConfiguracoes } from "../../drizzle/schema-integracao";
import { eq, and, sql, desc, like, or, inArray } from "drizzle-orm";
import { WarleineConnector } from "../connectors/WarleineConnector";
import { EasyVisionConnector } from "../connectors/EasyVisionConnector";
import { ENV } from "../_core/env";
import { logger } from "../_core/logger";

/**
 * Router para Contas Convênio - Gestão Operacional
 * 
 * Duas fontes de dados:
 * 1. Busca em tempo real no banco do cliente (Warleine) por número de conta
 * 2. Importação de XML (TISS) - reutiliza parser existente
 * 
 * Dados são salvos na tabela contas_convenio_itens para análise e comparação com padrões.
 */
export const contasConvenioRouter = router({

  // ============================================================
  // BUSCAR CONTA NO BANCO DO CLIENTE (via Integrador de Dados)
  // ============================================================
  buscarConta: protectedProcedure
    .input(z.object({
      numeroConta: z.string().min(1, "Número da conta é obrigatório"),
      estabelecimentoId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });

      logger.info({
        message: "Buscando conta via Integrador de Dados",
        numeroConta: input.numeroConta,
        estabelecimentoId: input.estabelecimentoId,
      });

      // ============================================================
      // 1. Buscar mapeamento "Busca Conta" na tabela integracao_mapeamentos
      //    (cadastrado via Integrador de Dados > Mapeamentos)
      // ============================================================
      const mapeamentos = await db
        .select()
        .from(integracaoMapeamentos)
        .where(
          and(
            eq(integracaoMapeamentos.estabelecimentoId, input.estabelecimentoId),
            eq(integracaoMapeamentos.ativo, "sim"),
            like(integracaoMapeamentos.nome, "%Busca Conta%"),
          )
        )
        .limit(1);

      // Fallback: tentar também na query_configuracoes (compatibilidade)
      let querySql: string;
      let conexaoConfig: { host: string; port: number; database: string; user: string; password: string } | null = null;
      let configSource = "";

      if (mapeamentos.length > 0) {
        // Encontrou no integracao_mapeamentos
        const mapeamento = mapeamentos[0];
        querySql = mapeamento.queryOrigem;
        configSource = `mapeamento #${mapeamento.id}`;

        // Buscar conexão associada
        const [conexao] = await db
          .select()
          .from(integracaoConexoes)
          .where(eq(integracaoConexoes.id, mapeamento.conexaoOrigemId));

        if (conexao) {
          const senha = Buffer.from(conexao.senhaEncriptada, "base64").toString("utf-8");
          conexaoConfig = {
            host: conexao.host,
            port: conexao.porta,
            database: conexao.banco,
            user: conexao.usuario,
            password: senha,
          };
        }
      } else {
        // Fallback: buscar na query_configuracoes (modelo antigo)
        const configs = await db
          .select()
          .from(queryConfiguracoes)
          .where(
            and(
              eq(queryConfiguracoes.estabelecimentoId, input.estabelecimentoId),
              eq(queryConfiguracoes.tipoDados, "busca_conta"),
              eq(queryConfiguracoes.ativo, true),
            )
          )
          .limit(1);

        if (configs.length > 0) {
          const config = configs[0];
          querySql = config.querySql;
          configSource = `query_config #${config.id}`;

          if (config.conexaoConfig) {
            const parsed = typeof config.conexaoConfig === "string"
              ? JSON.parse(config.conexaoConfig)
              : config.conexaoConfig;
            conexaoConfig = parsed;
          }
        } else {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Nenhuma configuração de "Busca Conta" encontrada para este estabelecimento. Acesse o Integrador de Dados > Mapeamentos e cadastre um mapeamento com nome "Busca Conta" vinculado à conexão do banco do hospital.`,
          });
        }
      }

      // Fallback para variáveis de ambiente se a conexão não foi encontrada
      if (!conexaoConfig && ENV.warleineDbHost) {
        conexaoConfig = {
          host: ENV.warleineDbHost,
          port: parseInt(ENV.warleineDbPort),
          database: ENV.warleineDbName,
          user: ENV.warleineDbUser,
          password: ENV.warleineDbPassword,
        };
        configSource += " (fallback ENV)";
      }

      if (!conexaoConfig) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Nenhuma conexão configurada para busca de conta. Configure a conexão no Integrador de Dados.",
        });
      }

      logger.info({
        message: "Usando configuração do Integrador de Dados",
        source: configSource,
        conexao: { ...conexaoConfig, password: "***" },
      });

      // ============================================================
      // 2. Conectar ao banco do hospital (PostgreSQL)
      // ============================================================
      const connector = new EasyVisionConnector(conexaoConfig);

      const conectado = await connector.conectar();
      if (!conectado) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Falha ao conectar ao banco do hospital. Verifique a configuração de conexão no Integrador de Dados.",
        });
      }

      try {
        // ============================================================
        // 3. Executar a query cadastrada no Integrador
        //    A query deve usar $1 como placeholder para o número da conta
        // ============================================================
        logger.info({
          message: "Executando query de busca de conta",
          source: configSource,
          numeroConta: input.numeroConta,
          queryPreview: querySql.substring(0, 200) + "...",
        });

        let dados: any[];
        try {
          dados = await connector.executarQuery(querySql, [input.numeroConta]);
        } catch (queryError) {
          logger.warn({
            message: "Query do Integrador falhou, tentando busca local",
            error: queryError instanceof Error ? queryError.message : String(queryError),
          });

          await connector.desconectar();

          // Fallback: buscar da tabela local integ_faturado (dados já sincronizados)
          const localResult = await db.execute(sql`
            SELECT 
              numconta as numconta,
              guiacobra,
              aihguia,
              protocolo,
              numfatura,
              nomeconv,
              codconv,
              matricula,
              tipoproc,
              procdisco as codigoitem,
              codproprio as codigoitemtuss,
              descricao,
              data as dataexecucao,
              dataint as datainternacao,
              datasai as dataalta,
              mesprod as competencia,
              nomeprest,
              prestexe,
              nomecc as setor,
              vl_unitario as valorunitario,
              quantidade,
              vl_faturado as valortotal,
              codtiss,
              funcaotiss,
              codcc,
              receber,
              '' as pacientenome
            FROM integ_faturado
            WHERE numconta = ${input.numeroConta}
              AND estabelecimento_id = ${input.estabelecimentoId}
            ORDER BY data, tipoproc, descricao
          `);

          dados = (localResult as any)[0] || [];
        }

        await connector.desconectar();

        if (!dados || dados.length === 0) {
          return {
            sucesso: false,
            mensagem: `Conta ${input.numeroConta} não encontrada no banco do cliente.`,
            totalItens: 0,
            conta: null,
          };
        }

        logger.info({
          message: "Conta encontrada no Warleine",
          numeroConta: input.numeroConta,
          totalItens: dados.length,
        });

        // Limpar dados existentes desta conta (se já foi buscada antes)
        await db.delete(contasConvenioItens).where(
          and(
            eq(contasConvenioItens.numeroConta, input.numeroConta),
            eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId),
            eq(contasConvenioItens.origem, "BANCO_CLIENTE"),
          )
        );

        // Limpar resumo existente
        await db.delete(contasConvenioResumo).where(
          and(
            eq(contasConvenioResumo.numeroConta, input.numeroConta),
            eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId),
            eq(contasConvenioResumo.origem, "BANCO_CLIENTE"),
          )
        );

        // Inserir itens na nova tabela
        const BATCH_SIZE = 100;
        let totalInseridos = 0;
        let valorTotalConta = 0;
        const primeiroItem = dados[0];

        for (let i = 0; i < dados.length; i += BATCH_SIZE) {
          const batch = dados.slice(i, i + BATCH_SIZE);
          const values = batch.map((row: any) => {
            const vt = parseFloat(row.valortotal) || 0;
            valorTotalConta += vt;
            
            // Mapear tipo de procedimento
            let tipoItem = row.tipoproc || 'OUTROS';
            if (tipoItem.toLowerCase().includes('proc')) tipoItem = 'PROCEDIMENTO';
            else if (tipoItem.toLowerCase().includes('diar')) tipoItem = 'DIARIA';
            else if (tipoItem.toLowerCase().includes('mat') || tipoItem.toLowerCase().includes('med')) tipoItem = 'MAT_MED';
            else if (tipoItem.toLowerCase().includes('tax')) tipoItem = 'TAXA';
            else if (tipoItem.toLowerCase().includes('gas')) tipoItem = 'GASES';

            return {
              origem: "BANCO_CLIENTE" as const,
              numeroConta: String(row.numconta || input.numeroConta),
              numeroGuia: row.guiacobra || null,
              numeroGuiaOperadora: row.aihguia || null,
              protocolo: row.protocolo || null,
              numeroLote: row.numfatura || null,
              pacienteNome: row.pacientenome || null,
              carteiraBeneficiario: row.matricula || null,
              convenio: row.nomeconv ? String(row.nomeconv).trim() : null,
              estabelecimentoId: input.estabelecimentoId,
              tipoItem,
              codigoItem: row.codigoitem || null,
              codigoItemTuss: row.codigoitemtuss || null,
              descricaoItem: row.descricao || null,
              quantidade: row.quantidade ? String(parseFloat(row.quantidade)) : null,
              valorUnitario: row.valorunitario ? String(parseFloat(row.valorunitario)) : null,
              valorTotal: row.valortotal ? String(parseFloat(row.valortotal)) : null,
              dataExecucao: row.dataexecucao ? new Date(row.dataexecucao) : null,
              competencia: row.competencia ? String(row.competencia).replace('/', '-') : null,
              profissionalExecutante: row.nomeprest || row.prestexe || null,
              setor: row.setor || null,
              statusAnalise: "pendente" as const,
            };
          });

          await db.insert(contasConvenioItens).values(values);
          totalInseridos += batch.length;
        }

        // Criar resumo da conta
        await db.insert(contasConvenioResumo).values({
          numeroConta: input.numeroConta,
          estabelecimentoId: input.estabelecimentoId,
          origem: "BANCO_CLIENTE",
          convenio: primeiroItem.nomeconv ? String(primeiroItem.nomeconv).trim() : null,
          pacienteNome: primeiroItem.pacientenome || null,
          carteiraBeneficiario: primeiroItem.matricula || null,
          totalItens: totalInseridos,
          valorTotal: String(valorTotalConta),
          dataInternacao: primeiroItem.datainternacao ? new Date(primeiroItem.datainternacao) : null,
          dataAlta: primeiroItem.dataalta ? new Date(primeiroItem.dataalta) : null,
          competencia: primeiroItem.competencia ? String(primeiroItem.competencia).replace('/', '-') : null,
          statusAnalise: "pendente",
          buscadoPor: ctx.user?.id || null,
        });

        return {
          sucesso: true,
          mensagem: `Conta ${input.numeroConta} importada com ${totalInseridos} itens. Valor total: R$ ${valorTotalConta.toFixed(2)}`,
          totalItens: totalInseridos,
          valorTotal: valorTotalConta,
          convenio: primeiroItem.nomeconv ? String(primeiroItem.nomeconv).trim() : null,
          paciente: primeiroItem.pacientenome || null,
          conta: {
            numeroConta: input.numeroConta,
            convenio: primeiroItem.nomeconv ? String(primeiroItem.nomeconv).trim() : null,
            paciente: primeiroItem.pacientenome || null,
            totalItens: totalInseridos,
            valorTotal: valorTotalConta,
          },
        };
      } catch (error) {
        await connector.desconectar();
        logger.error({
          message: "Erro ao buscar conta no Warleine",
          error: error instanceof Error ? error.message : String(error),
          numeroConta: input.numeroConta,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao buscar conta: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  // ============================================================
  // LISTAR CONTAS (RESUMO)
  // ============================================================
  listarContas: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number().optional(),
      convenio: z.string().optional(),
      origem: z.enum(["XML", "BANCO_CLIENTE"]).optional(),
      statusAnalise: z.enum(["pendente", "conforme", "divergente", "revisado"]).optional(),
      search: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const estabelecimentoId = input?.estabelecimentoId;
      const convenio = input?.convenio;
      const origem = input?.origem;
      const statusAnalise = input?.statusAnalise;
      const search = input?.search;
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;

      const conditions: any[] = [];

      if (estabelecimentoId) {
        conditions.push(eq(contasConvenioResumo.estabelecimentoId, estabelecimentoId));
      }
      if (convenio) {
        conditions.push(eq(contasConvenioResumo.convenio, convenio));
      }
      if (origem) {
        conditions.push(eq(contasConvenioResumo.origem, origem));
      }
      if (statusAnalise) {
        conditions.push(eq(contasConvenioResumo.statusAnalise, statusAnalise));
      }
      if (search) {
        const searchPattern = `%${search}%`;
        conditions.push(
          or(
            like(contasConvenioResumo.numeroConta, searchPattern),
            like(contasConvenioResumo.pacienteNome, searchPattern),
            like(contasConvenioResumo.convenio, searchPattern),
          )!
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const offset = (page - 1) * pageSize;

      const contas = await db
        .select()
        .from(contasConvenioResumo)
        .where(whereClause)
        .orderBy(desc(contasConvenioResumo.criadoEm))
        .limit(pageSize)
        .offset(offset);

      const countResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(contasConvenioResumo)
        .where(whereClause);

      const total = countResult[0]?.count || 0;

      // Resumo geral
      const resumoResult = await db
        .select({
          totalContas: sql<number>`COUNT(*)`,
          valorTotal: sql<string>`COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0)`,
          totalDivergentes: sql<number>`SUM(CASE WHEN statusAnaliseResumo = 'divergente' THEN 1 ELSE 0 END)`,
          totalConformes: sql<number>`SUM(CASE WHEN statusAnaliseResumo = 'conforme' THEN 1 ELSE 0 END)`,
          totalPendentes: sql<number>`SUM(CASE WHEN statusAnaliseResumo = 'pendente' THEN 1 ELSE 0 END)`,
        })
        .from(contasConvenioResumo)
        .where(whereClause);

      return {
        contas,
        total,
        resumo: resumoResult[0] || { totalContas: 0, valorTotal: "0", totalDivergentes: 0, totalConformes: 0, totalPendentes: 0 },
      };
    }),

  // ============================================================
  // LISTAR ITENS DE UMA CONTA
  // ============================================================
  listarItens: protectedProcedure
    .input(z.object({
      numeroConta: z.string(),
      estabelecimentoId: z.number(),
      tipoItem: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const conditions: any[] = [
        eq(contasConvenioItens.numeroConta, input.numeroConta),
        eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId),
      ];

      if (input.tipoItem) {
        conditions.push(eq(contasConvenioItens.tipoItem, input.tipoItem));
      }

      const items = await db
        .select()
        .from(contasConvenioItens)
        .where(and(...conditions))
        .orderBy(contasConvenioItens.tipoItem, contasConvenioItens.descricaoItem);

      // Resumo por tipo
      const resumoPorTipo = await db
        .select({
          tipoItem: contasConvenioItens.tipoItem,
          totalItens: sql<number>`COUNT(*)`,
          valorTotal: sql<string>`COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0)`,
        })
        .from(contasConvenioItens)
        .where(and(
          eq(contasConvenioItens.numeroConta, input.numeroConta),
          eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId),
        ))
        .groupBy(contasConvenioItens.tipoItem);

      // Total geral
      const totalGeral = await db
        .select({
          totalItens: sql<number>`COUNT(*)`,
          valorTotal: sql<string>`COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0)`,
          totalDivergentes: sql<number>`SUM(CASE WHEN statusAnalise = 'divergente' THEN 1 ELSE 0 END)`,
          totalConformes: sql<number>`SUM(CASE WHEN statusAnalise = 'conforme' THEN 1 ELSE 0 END)`,
          totalPendentes: sql<number>`SUM(CASE WHEN statusAnalise = 'pendente' THEN 1 ELSE 0 END)`,
        })
        .from(contasConvenioItens)
        .where(and(
          eq(contasConvenioItens.numeroConta, input.numeroConta),
          eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId),
        ));

      return {
        items,
        resumoPorTipo,
        resumoGeral: totalGeral[0] || { totalItens: 0, valorTotal: "0", totalDivergentes: 0, totalConformes: 0, totalPendentes: 0 },
      };
    }),

  // ============================================================
  // EXCLUIR CONTA
  // ============================================================
  excluirConta: protectedProcedure
    .input(z.object({
      numeroConta: z.string(),
      estabelecimentoId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      // Excluir itens
      await db.delete(contasConvenioItens).where(
        and(
          eq(contasConvenioItens.numeroConta, input.numeroConta),
          eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId),
        )
      );

      // Excluir resumo
      await db.delete(contasConvenioResumo).where(
        and(
          eq(contasConvenioResumo.numeroConta, input.numeroConta),
          eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId),
        )
      );

      return { sucesso: true, mensagem: `Conta ${input.numeroConta} excluída com sucesso.` };
    }),

  // ============================================================
  // IMPORTAR DE XML (reutiliza dados já parseados do faturamento_tiss)
  // ============================================================
  importarDeXml: protectedProcedure
    .input(z.object({
      arquivoId: z.number(),
      estabelecimentoId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      // Buscar itens do faturamento_tiss para este arquivo
      const itensXml = await db.execute(sql`
        SELECT 
          ft.numero_guia_prestador as numeroGuia,
          ft.numero_guia_operadora as numeroGuiaOperadora,
          ft.numero_lote as numeroLote,
          ft.senha,
          ft.carteira_beneficiario as carteiraBeneficiario,
          ft.tipo_item as tipoItem,
          ft.codigo_item as codigoItem,
          ft.descricao_item as descricaoItem,
          ft.codigo_tabela as codigoTabela,
          ft.quantidade,
          ft.valor_unitario as valorUnitario,
          ft.valor_faturado as valorTotal,
          ft.data_execucao as dataExecucao,
          ft.data_referencia as dataReferencia,
          ft.nome_prof as profissionalExecutante,
          ft.convenioId,
          ft.estabelecimentoId
        FROM faturamento_tiss ft
        WHERE ft.arquivo_id = ${input.arquivoId}
          AND ft.estabelecimentoId = ${input.estabelecimentoId}
        ORDER BY ft.data_execucao, ft.tipo_item, ft.descricao_item
      `);

      const items = (itensXml as any)[0] || [];

      if (items.length === 0) {
        return {
          sucesso: false,
          mensagem: "Nenhum item encontrado para este arquivo.",
          totalItens: 0,
        };
      }

      // Agrupar por guia para determinar numeroConta
      const guias = new Map<string, any[]>();
      for (const item of items) {
        const guia = item.numeroGuia || 'SEM_GUIA';
        if (!guias.has(guia)) guias.set(guia, []);
        guias.get(guia)!.push(item);
      }

      let totalInseridos = 0;

      for (const [guia, guiaItems] of guias) {
        const numeroConta = guia; // Usar número da guia como número da conta
        const primeiroItem = guiaItems[0];

        // Buscar nome do convênio
        let nomeConvenio: string | null = null;
        if (primeiroItem.convenioId) {
          const convResult = await db.execute(sql`
            SELECT nome FROM convenios WHERE id = ${primeiroItem.convenioId} LIMIT 1
          `);
          nomeConvenio = ((convResult as any)[0]?.[0]?.nome) || null;
        }

        // Limpar dados existentes desta conta/arquivo
        await db.delete(contasConvenioItens).where(
          and(
            eq(contasConvenioItens.numeroConta, numeroConta),
            eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId),
            eq(contasConvenioItens.origem, "XML"),
            eq(contasConvenioItens.arquivoId, input.arquivoId),
          )
        );

        // Inserir itens
        let valorTotalConta = 0;
        const values = guiaItems.map((item: any) => {
          const vt = parseFloat(item.valorTotal) || 0;
          valorTotalConta += vt;

          return {
            origem: "XML" as const,
            numeroConta,
            numeroGuia: item.numeroGuia || null,
            numeroGuiaOperadora: item.numeroGuiaOperadora || null,
            numeroLote: item.numeroLote || null,
            senha: item.senha || null,
            convenio: nomeConvenio,
            convenioId: item.convenioId || null,
            estabelecimentoId: input.estabelecimentoId,
            tipoItem: item.tipoItem || null,
            codigoItem: item.codigoItem || null,
            descricaoItem: item.descricaoItem || null,
            codigoTabela: item.codigoTabela || null,
            quantidade: item.quantidade ? String(item.quantidade) : null,
            valorUnitario: item.valorUnitario ? String(item.valorUnitario) : null,
            valorTotal: item.valorTotal ? String(item.valorTotal) : null,
            dataExecucao: item.dataExecucao ? new Date(item.dataExecucao) : null,
            dataReferencia: item.dataReferencia ? new Date(item.dataReferencia) : null,
            profissionalExecutante: item.profissionalExecutante || null,
            arquivoId: input.arquivoId,
            statusAnalise: "pendente" as const,
          };
        });

        if (values.length > 0) {
          await db.insert(contasConvenioItens).values(values);
          totalInseridos += values.length;
        }

        // Criar/atualizar resumo
        await db.delete(contasConvenioResumo).where(
          and(
            eq(contasConvenioResumo.numeroConta, numeroConta),
            eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId),
            eq(contasConvenioResumo.origem, "XML"),
          )
        );

        await db.insert(contasConvenioResumo).values({
          numeroConta,
          estabelecimentoId: input.estabelecimentoId,
          origem: "XML",
          convenio: nomeConvenio,
          convenioId: primeiroItem.convenioId || null,
          pacienteNome: null, // XML TISS pode não ter nome do paciente
          carteiraBeneficiario: primeiroItem.carteiraBeneficiario || null,
          totalItens: values.length,
          valorTotal: String(valorTotalConta),
          statusAnalise: "pendente",
          buscadoPor: ctx.user?.id || null,
        });
      }

      return {
        sucesso: true,
        mensagem: `${totalInseridos} itens importados de ${guias.size} guia(s) do XML.`,
        totalItens: totalInseridos,
        totalGuias: guias.size,
      };
    }),

  // ============================================================
  // LISTAR CONVÊNIOS DISPONÍVEIS NAS CONTAS
  // ============================================================
  listarConvenios: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const conditions: any[] = [];
      if (input?.estabelecimentoId) {
        conditions.push(eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const result = await db
        .select({
          convenio: contasConvenioResumo.convenio,
          totalContas: sql<number>`COUNT(*)`,
          valorTotal: sql<string>`COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0)`,
        })
        .from(contasConvenioResumo)
        .where(whereClause)
        .groupBy(contasConvenioResumo.convenio)
        .orderBy(sql`COUNT(*) DESC`);

      return result;
    }),

  // ============================================================
  // ATUALIZAR STATUS DE ANÁLISE DE UM ITEM
  // ============================================================
  atualizarStatusItem: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      statusAnalise: z.enum(["pendente", "conforme", "divergente", "revisado"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      await db.update(contasConvenioItens)
        .set({ statusAnalise: input.statusAnalise })
        .where(eq(contasConvenioItens.id, input.itemId));

      return { sucesso: true };
    }),

  // ============================================================
  // COMPARAR CONTA COM PADRÕES DE COBRANÇA
  // ============================================================
  compararComPadroes: protectedProcedure
    .input(z.object({
      numeroConta: z.string(),
      estabelecimentoId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const { executarComparacaoESalvar } = await import("../services/comparadorPadroes");
      const resultado = await executarComparacaoESalvar(input.numeroConta, input.estabelecimentoId);
      return resultado;
    }),

  // ============================================================
  // BUSCAR DIVERGÊNCIAS DE UMA CONTA (já salvas)
  // ============================================================
  getDivergencias: protectedProcedure
    .input(z.object({
      numeroConta: z.string(),
      estabelecimentoId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const itens = await db
        .select({
          id: contasConvenioItens.id,
          codigoItem: contasConvenioItens.codigoItem,
          descricaoItem: contasConvenioItens.descricaoItem,
          tipoItem: contasConvenioItens.tipoItem,
          valorTotal: contasConvenioItens.valorTotal,
          quantidade: contasConvenioItens.quantidade,
          statusAnalise: contasConvenioItens.statusAnalise,
          divergencias: contasConvenioItens.divergencias,
        })
        .from(contasConvenioItens)
        .where(and(
          eq(contasConvenioItens.numeroConta, input.numeroConta),
          eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId),
          sql`divergencias IS NOT NULL AND JSON_LENGTH(divergencias) > 0`,
        ));

      // Flatten divergências
      const todasDivergencias: any[] = [];
      for (const item of itens) {
        const divs = item.divergencias as any[];
        if (Array.isArray(divs)) {
          for (const div of divs) {
            todasDivergencias.push({
              ...div,
              itemId: item.id,
              codigoItem: item.codigoItem,
              descricaoItem: item.descricaoItem,
              tipoItem: item.tipoItem,
              valorTotal: item.valorTotal,
              quantidade: item.quantidade,
            });
          }
        }
      }

      // Resumo
      const resumo = {
        total: todasDivergencias.length,
        porTipo: {} as Record<string, number>,
        porSeveridade: {} as Record<string, number>,
      };
      for (const div of todasDivergencias) {
        resumo.porTipo[div.tipo] = (resumo.porTipo[div.tipo] || 0) + 1;
        resumo.porSeveridade[div.severidade] = (resumo.porSeveridade[div.severidade] || 0) + 1;
      }

      return {
        divergencias: todasDivergencias,
        resumo,
      };
    }),
});
