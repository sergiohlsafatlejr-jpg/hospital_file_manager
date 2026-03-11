import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { contasConvenioItens, contasConvenioResumo, integracaoMapeamentos, integracaoConexoes, feedbackDivergencias, padroesCobranca, logAnaliseComparacao, ajustesAuditoria } from "../../drizzle/schema";
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
      forceRemote: z.boolean().optional().default(false),
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

      let conectado = false;
      try {
        conectado = await connector.conectar();
      } catch (connError) {
        const errMsg = connError instanceof Error ? connError.message : String(connError);
        logger.error({
          message: "Erro ao conectar ao banco do hospital",
          error: errMsg,
          host: conexaoConfig.host,
          port: conexaoConfig.port,
          database: conexaoConfig.database,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao conectar ao banco do hospital (${conexaoConfig.host}:${conexaoConfig.port}/${conexaoConfig.database}): ${errMsg}`,
        });
      }

      if (!conectado) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao conectar ao banco do hospital (${conexaoConfig.host}:${conexaoConfig.port}/${conexaoConfig.database}). Verifique se o servidor está acessível e as credenciais estão corretas no Integrador de Dados.`,
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
        let fonteDados: "BANCO_REMOTO" | "CACHE_LOCAL" = "BANCO_REMOTO";
        try {
          dados = await connector.executarQuery(querySql, [input.numeroConta]);
          fonteDados = "BANCO_REMOTO";
        } catch (queryError) {
          const errMsg = queryError instanceof Error ? queryError.message : String(queryError);
          logger.warn({
            message: "Query do Integrador falhou",
            error: errMsg,
            forceRemote: input.forceRemote,
          });

          await connector.desconectar();

          // Se forceRemote=true, NÃO usar fallback - retornar erro direto
          if (input.forceRemote) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Falha ao buscar conta diretamente do banco do hospital: ${errMsg}. Verifique se a conexão está ativa e a query está correta no Integrador de Dados.`,
            });
          }

          // Fallback: buscar da tabela local integ_faturado (dados já sincronizados)
          // AVISO: esses dados podem estar desatualizados!
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
          fonteDados = "CACHE_LOCAL";

          if (dados.length > 0) {
            logger.warn({
              message: "ATENÇÃO: Dados carregados do CACHE LOCAL (integ_faturado) - podem estar DESATUALIZADOS!",
              numeroConta: input.numeroConta,
              totalItens: dados.length,
              motivoFallback: errMsg,
            });
          }
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

        // Log dos campos retornados para debug
        if (dados.length > 0) {
          logger.info({
            message: "Conta encontrada - campos retornados",
            numeroConta: input.numeroConta,
            totalItens: dados.length,
            camposDisponiveis: Object.keys(dados[0]),
            amostra: Object.fromEntries(
              Object.entries(dados[0]).map(([k, v]) => [k, v === null ? 'NULL' : String(v).substring(0, 50)])
            ),
          });
        } else {
          logger.info({
            message: "Conta encontrada no Warleine (sem itens)",
            numeroConta: input.numeroConta,
            totalItens: dados.length,
          });
        }

        // ============================================================
        // CAPTURAR DADOS ANTIGOS ANTES DO DELETE (para comparativo)
        // ============================================================
        const dadosAntigos = await db.select({
          id: contasConvenioItens.id,
          codigoItem: contasConvenioItens.codigoItem,
          descricaoItem: contasConvenioItens.descricaoItem,
          quantidade: contasConvenioItens.quantidade,
          valorUnitario: contasConvenioItens.valorUnitario,
          valorTotal: contasConvenioItens.valorTotal,
          tipoItem: contasConvenioItens.tipoItem,
          dataExecucao: contasConvenioItens.dataExecucao,
          setor: contasConvenioItens.setor,
        }).from(contasConvenioItens).where(
          and(
            eq(contasConvenioItens.numeroConta, input.numeroConta),
            eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId),
            eq(contasConvenioItens.origem, "BANCO_CLIENTE"),
          )
        );

        const resumoAntigo = await db.select({
          totalItens: contasConvenioResumo.totalItens,
          valorTotal: contasConvenioResumo.valorTotal,
        }).from(contasConvenioResumo).where(
          and(
            eq(contasConvenioResumo.numeroConta, input.numeroConta),
            eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId),
            eq(contasConvenioResumo.origem, "BANCO_CLIENTE"),
          )
        ).limit(1);

        const hadPreviousData = dadosAntigos.length > 0;
        const valorTotalAnterior = resumoAntigo[0] ? parseFloat(String(resumoAntigo[0].valorTotal || "0")) : 0;
        const totalItensAnterior = resumoAntigo[0]?.totalItens || 0;

        // Criar mapa dos itens antigos por chave (codigo + data + setor)
        const mapaAntigos = new Map<string, { quantidade: string | null; valorUnitario: string | null; valorTotal: string | null; descricaoItem: string | null }>();
        for (const item of dadosAntigos) {
          const chave = `${item.codigoItem || ''}_${item.dataExecucao ? new Date(item.dataExecucao).toISOString().split('T')[0] : ''}_${item.setor || ''}`;
          mapaAntigos.set(chave, {
            quantidade: item.quantidade,
            valorUnitario: item.valorUnitario,
            valorTotal: item.valorTotal,
            descricaoItem: item.descricaoItem,
          });
        }

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

        // Helper: busca campo flexível (aceita múltiplos nomes possíveis)
        const getField = (row: any, ...names: string[]): any => {
          for (const name of names) {
            if (row[name] !== undefined && row[name] !== null) return row[name];
            // Tentar lowercase
            if (row[name.toLowerCase()] !== undefined && row[name.toLowerCase()] !== null) return row[name.toLowerCase()];
          }
          return null;
        };

        const parseNum = (val: any): number => {
          if (val === null || val === undefined) return 0;
          const n = parseFloat(String(val).replace(',', '.'));
          return isNaN(n) ? 0 : n;
        };

        for (let i = 0; i < dados.length; i += BATCH_SIZE) {
          const batch = dados.slice(i, i + BATCH_SIZE);
          const values = batch.map((row: any) => {
            // Flexibilizar nomes de campos - aceita tanto aliases quanto nomes originais do banco
            const vlUnitario = getField(row, 'valorunitario', 'vl_unitario', 'valor_unitario', 'vlunitario');
            const vlTotal = getField(row, 'valortotal', 'vl_faturado', 'valor_total', 'vlfaturado', 'valor_faturado');
            const qtd = getField(row, 'quantidade', 'qtd', 'qtde');
            const numConta = getField(row, 'numconta', 'numero_conta', 'conta');
            const guia = getField(row, 'guiacobra', 'guia_cobra', 'guia');
            const aihGuia = getField(row, 'aihguia', 'aih_guia', 'aih');
            const nomeConv = getField(row, 'nomeconv', 'nome_conv', 'convenio', 'nomeconvenio');
            const codConv = getField(row, 'codconv', 'cod_conv', 'codigo_convenio');
            const codItem = getField(row, 'codigoitem', 'procdisco', 'cod_item', 'cd_item', 'codigo_item');
            const codTuss = getField(row, 'codigoitemtuss', 'codproprio', 'cod_tuss', 'codigo_tuss', 'cd_item_tuss');
            const desc = getField(row, 'descricao', 'desc_item', 'ds_item');
            const dataExec = getField(row, 'dataexecucao', 'data', 'dt_item', 'data_execucao');
            const dataInt = getField(row, 'datainternacao', 'dataint', 'data_internacao');
            const dataAlta = getField(row, 'dataalta', 'datasai', 'data_alta', 'data_saida');
            const comp = getField(row, 'competencia', 'mesprod', 'mes_prod', 'comp');
            const prest = getField(row, 'nomeprest', 'prestexe', 'nome_prest', 'prof_exec');
            const setor = getField(row, 'setor', 'nomecc', 'nome_cc', 'centro_custo');
            const paciente = getField(row, 'pacientenome', 'nomepaciente', 'nomepac', 'nome_paciente', 'paciente');
            const tipoProc = getField(row, 'tipoproc', 'tipo_proc', 'tipo_item');
            const codRecur = getField(row, 'codrecur', 'cod_recur', 'codigo_recurso');
            const complRecur = getField(row, 'complrecur', 'compl_recur', 'complemento_recurso');
            const codTissGlosa = getField(row, 'codtiss', 'cod_tiss', 'codigo_tiss_glosa');
            const descMotivoGlosa = getField(row, 'descmotivo', 'desc_motivo', 'motivo_glosa');
            const tipoAtend = getField(row, 'tipoatend', 'tipo_atend', 'tipo_atendimento');
            const dataBaixa = getField(row, 'databaixa', 'data_baixa');
            const codPlaco = getField(row, 'codplaco', 'cod_placo');
            const nomePlaco = getField(row, 'nomeplaco', 'nome_placo', 'plano');
            const medSolic = getField(row, 'medsolic', 'med_solic', 'medico_solicitante');
            const nomeMedSolic = getField(row, 'nomemedsolic', 'nome_med_solic', 'nome_medico_solicitante');
            const codGrufi = getField(row, 'codgrufi', 'cod_grufi', 'grupo_financeiro');
            const funcaoTiss = getField(row, 'funcaotiss', 'funcao_tiss');
            const receber = getField(row, 'receber', 'a_receber');
            const codConvVal = getField(row, 'codconv', 'cod_conv', 'codigo_convenio');
            const protocolo = getField(row, 'protocolo', 'num_protocolo');
            const numFatura = getField(row, 'numfatura', 'num_fatura');
            const matricula = getField(row, 'matricula', 'carteirinha');
            const prestExe = getField(row, 'prestexe', 'prest_exe', 'cod_prestador');

            const vt = parseNum(vlTotal);
            valorTotalConta += vt;
            
            // Mapear tipo de procedimento
            let tipoItem = tipoProc || 'OUTROS';
            if (typeof tipoItem === 'string') {
              const ti = tipoItem.toLowerCase();
              if (ti.includes('proc')) tipoItem = 'PROCEDIMENTO';
              else if (ti.includes('diar')) tipoItem = 'DIARIA';
              else if (ti.includes('mat') || ti.includes('med')) tipoItem = 'MAT_MED';
              else if (ti.includes('tax')) tipoItem = 'TAXA';
              else if (ti.includes('gas')) tipoItem = 'GASES';
            }

            return {
              origem: "BANCO_CLIENTE" as const,
              numeroConta: String(numConta || input.numeroConta),
              numeroGuia: guia ? String(guia) : null,
              numeroGuiaOperadora: aihGuia ? String(aihGuia) : null,
              protocolo: protocolo ? String(protocolo) : null,
              numeroLote: numFatura ? String(numFatura) : null,
              pacienteNome: paciente ? String(paciente) : null,
              carteiraBeneficiario: matricula ? String(matricula) : null,
              convenio: nomeConv ? String(nomeConv).trim() : null,
              estabelecimentoId: input.estabelecimentoId,
              tipoItem,
              codigoItem: codItem ? String(codItem) : null,
              codigoItemTuss: codTuss ? String(codTuss) : null,
              descricaoItem: desc ? String(desc) : null,
              quantidade: qtd ? String(parseNum(qtd)) : null,
              valorUnitario: vlUnitario ? String(parseNum(vlUnitario)) : null,
              valorTotal: vt ? String(vt) : null,
              dataExecucao: dataExec ? new Date(dataExec) : null,
              competencia: comp ? String(comp).replace('/', '-') : null,
              profissionalExecutante: prest ? String(prest) : (nomeMedSolic ? String(nomeMedSolic) : null),
              setor: setor ? String(setor) : null,
              statusAnalise: "pendente" as const,
            };
          });

          await db.insert(contasConvenioItens).values(values);
          totalInseridos += batch.length;
        }

        // Criar resumo da conta (usando getField para flexibilidade)
        const resumoConvenio = getField(primeiroItem, 'nomeconv', 'nome_conv', 'convenio', 'nomeconvenio');
        const resumoPaciente = getField(primeiroItem, 'pacientenome', 'nomepaciente', 'nomepac', 'nome_paciente', 'paciente');
        const resumoMatricula = getField(primeiroItem, 'matricula', 'carteirinha', 'carteira');
        const resumoDataInt = getField(primeiroItem, 'datainternacao', 'dataint', 'data_internacao');
        const resumoDataAlta = getField(primeiroItem, 'dataalta', 'datasai', 'data_alta', 'data_saida');
        const resumoComp = getField(primeiroItem, 'competencia', 'mesprod', 'mes_prod', 'comp');

        await db.insert(contasConvenioResumo).values({
          numeroConta: input.numeroConta,
          estabelecimentoId: input.estabelecimentoId,
          origem: "BANCO_CLIENTE",
          convenio: resumoConvenio ? String(resumoConvenio).trim() : null,
          pacienteNome: resumoPaciente ? String(resumoPaciente) : null,
          carteiraBeneficiario: resumoMatricula ? String(resumoMatricula) : null,
          totalItens: totalInseridos,
          valorTotal: String(valorTotalConta),
          dataInternacao: resumoDataInt ? new Date(resumoDataInt) : null,
          dataAlta: resumoDataAlta ? new Date(resumoDataAlta) : null,
          competencia: resumoComp ? String(resumoComp).replace('/', '-') : null,
          statusAnalise: "pendente",
          buscadoPor: ctx.user?.id || null,
        });

        const avisoFallback = fonteDados === "CACHE_LOCAL"
          ? " ⚠️ ATENÇÃO: Dados carregados do cache local (podem estar desatualizados). Use 'Reimportar do Banco' para buscar dados atualizados diretamente do sistema do hospital."
          : "";

        // ============================================================
        // COMPARATIVO: Gerar diff entre dados antigos e novos
        // ============================================================
        let comparativo: {
          hadPreviousData: boolean;
          valorAnterior: number;
          valorNovo: number;
          diferencaValor: number;
          totalItensAnterior: number;
          totalItensNovo: number;
          itensAlterados: Array<{
            codigoItem: string;
            descricaoItem: string;
            campo: string;
            valorAntigo: string;
            valorNovo: string;
          }>;
          itensAdicionados: number;
          itensRemovidos: number;
          valorItensAdicionados: number;
          valorItensRemovidos: number;
          diferencaAlteracoes: number;
          listaItensAdicionados: Array<{ codigoItem: string; descricaoItem: string; valorTotal: string; quantidade: string }>;
          listaItensRemovidos: Array<{ codigoItem: string; descricaoItem: string; valorTotal: string; quantidade: string }>;
          statusAjustesAuditoria: Array<{
            tipoAjuste: string;
            codigoItem: string;
            descricaoItem: string;
            quantidadeOriginal: string | null;
            quantidadeAjustada: string | null;
            valorOriginal: string | null;
            valorAjustado: string | null;
            quantidadeAtual: string | null;
            valorAtual: string | null;
            status: string;
            observacao: string;
          }>;
          totalAjustesCorrigidos: number;
          totalAjustesParciais: number;
          totalAjustesNaoCorrigidos: number;
        } | null = null;

        if (hadPreviousData) {
          // Buscar os novos itens recém inseridos para comparar
          const dadosNovos = await db.select({
            codigoItem: contasConvenioItens.codigoItem,
            descricaoItem: contasConvenioItens.descricaoItem,
            quantidade: contasConvenioItens.quantidade,
            valorUnitario: contasConvenioItens.valorUnitario,
            valorTotal: contasConvenioItens.valorTotal,
            tipoItem: contasConvenioItens.tipoItem,
            dataExecucao: contasConvenioItens.dataExecucao,
            setor: contasConvenioItens.setor,
          }).from(contasConvenioItens).where(
            and(
              eq(contasConvenioItens.numeroConta, input.numeroConta),
              eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId),
              eq(contasConvenioItens.origem, "BANCO_CLIENTE"),
            )
          );

          const itensAlterados: Array<{
            codigoItem: string;
            descricaoItem: string;
            campo: string;
            valorAntigo: string;
            valorNovo: string;
          }> = [];

          // Criar mapa dos novos
          const mapaNovos = new Set<string>();
          for (const item of dadosNovos) {
            const chave = `${item.codigoItem || ''}_${item.dataExecucao ? new Date(item.dataExecucao).toISOString().split('T')[0] : ''}_${item.setor || ''}`;
            mapaNovos.add(chave);

            const antigo = mapaAntigos.get(chave);
            if (antigo) {
              // Comparar campos
              if (antigo.valorTotal !== item.valorTotal) {
                itensAlterados.push({
                  codigoItem: item.codigoItem || '-',
                  descricaoItem: item.descricaoItem || '-',
                  campo: 'Valor Total',
                  valorAntigo: `R$ ${parseFloat(antigo.valorTotal || '0').toFixed(2)}`,
                  valorNovo: `R$ ${parseFloat(item.valorTotal || '0').toFixed(2)}`,
                });
              }
              if (antigo.quantidade !== item.quantidade) {
                itensAlterados.push({
                  codigoItem: item.codigoItem || '-',
                  descricaoItem: item.descricaoItem || '-',
                  campo: 'Quantidade',
                  valorAntigo: antigo.quantidade || '0',
                  valorNovo: item.quantidade || '0',
                });
              }
              if (antigo.valorUnitario !== item.valorUnitario) {
                itensAlterados.push({
                  codigoItem: item.codigoItem || '-',
                  descricaoItem: item.descricaoItem || '-',
                  campo: 'Valor Unitário',
                  valorAntigo: `R$ ${parseFloat(antigo.valorUnitario || '0').toFixed(2)}`,
                  valorNovo: `R$ ${parseFloat(item.valorUnitario || '0').toFixed(2)}`,
                });
              }
            }
          }

          // Contar e somar valor dos itens adicionados (estão nos novos mas não nos antigos)
          let itensAdicionados = 0;
          let valorItensAdicionados = 0;
          const listaItensAdicionados: Array<{ codigoItem: string; descricaoItem: string; valorTotal: string; quantidade: string }> = [];
          for (const item of dadosNovos) {
            const chave = `${item.codigoItem || ''}_${item.dataExecucao ? new Date(item.dataExecucao).toISOString().split('T')[0] : ''}_${item.setor || ''}`;
            if (!mapaAntigos.has(chave)) {
              itensAdicionados++;
              valorItensAdicionados += parseFloat(item.valorTotal || '0');
              listaItensAdicionados.push({
                codigoItem: item.codigoItem || '-',
                descricaoItem: item.descricaoItem || '-',
                valorTotal: `R$ ${parseFloat(item.valorTotal || '0').toFixed(2)}`,
                quantidade: item.quantidade || '1',
              });
            }
          }

          // Contar e somar valor dos itens removidos (estão nos antigos mas não nos novos)
          let itensRemovidos = 0;
          let valorItensRemovidos = 0;
          const listaItensRemovidos: Array<{ codigoItem: string; descricaoItem: string; valorTotal: string; quantidade: string }> = [];
          for (const [chave, itemAntigo] of mapaAntigos) {
            if (!mapaNovos.has(chave)) {
              itensRemovidos++;
              valorItensRemovidos += parseFloat(itemAntigo.valorTotal || '0');
              // Extrair codigoItem da chave
              const codigoItem = chave.split('_')[0] || '-';
              listaItensRemovidos.push({
                codigoItem,
                descricaoItem: itemAntigo.descricaoItem || '-',
                valorTotal: `R$ ${parseFloat(itemAntigo.valorTotal || '0').toFixed(2)}`,
                quantidade: itemAntigo.quantidade || '1',
              });
            }
          }

          // Calcular diferença líquida das alterações de valor (apenas itens que existiam antes e depois)
          let diferencaAlteracoes = 0;
          for (const item of dadosNovos) {
            const chave = `${item.codigoItem || ''}_${item.dataExecucao ? new Date(item.dataExecucao).toISOString().split('T')[0] : ''}_${item.setor || ''}`;
            const antigo = mapaAntigos.get(chave);
            if (antigo) {
              const valNovo = parseFloat(item.valorTotal || '0');
              const valAntigo = parseFloat(antigo.valorTotal || '0');
              if (valNovo !== valAntigo) {
                diferencaAlteracoes += (valNovo - valAntigo);
              }
            }
          }

          // ============================================================
          // CRUZAR COM AJUSTES DA AUDITORIA
          // ============================================================
          const ajustesAudit = await db.select().from(ajustesAuditoria).where(
            and(
              eq(ajustesAuditoria.numeroConta, input.numeroConta),
              eq(ajustesAuditoria.estabelecimentoId, input.estabelecimentoId),
              eq(ajustesAuditoria.status, "aplicado"),
            )
          );

          // Criar mapa dos novos itens por código para cruzamento
          const mapaNovosPorCodigo = new Map<string, Array<{ quantidade: string | null; valorUnitario: string | null; valorTotal: string | null; descricaoItem: string | null; dataExecucao: Date | null }>>();
          for (const item of dadosNovos) {
            const cod = item.codigoItem || '';
            if (!mapaNovosPorCodigo.has(cod)) mapaNovosPorCodigo.set(cod, []);
            mapaNovosPorCodigo.get(cod)!.push(item);
          }

          // Criar mapa de itemId -> dataExecucao dos itens antigos (para cruzar com ajustes)
          const mapaItemIdData = new Map<number, string>();
          for (const item of dadosAntigos) {
            if (item.id && item.dataExecucao) {
              mapaItemIdData.set(item.id, new Date(item.dataExecucao).toLocaleDateString('pt-BR'));
            }
          }

          const statusAjustes: Array<{
            tipoAjuste: string;
            codigoItem: string;
            descricaoItem: string;
            dataExecucao: string | null;
            quantidadeOriginal: string | null;
            quantidadeAjustada: string | null;
            valorOriginal: string | null;
            valorAjustado: string | null;
            quantidadeAtual: string | null;
            valorAtual: string | null;
            status: 'corrigido' | 'parcialmente_corrigido' | 'nao_corrigido' | 'item_nao_encontrado';
            observacao: string;
          }> = [];

          for (const aj of ajustesAudit) {
            const cod = aj.codigoItem || '';
            const itensNovos = mapaNovosPorCodigo.get(cod) || [];
            const itemNovo = itensNovos[0];
            // Obter data de execução do item (do ajuste via itemId, ou do item novo)
            const dataExecItem = aj.itemId ? (mapaItemIdData.get(aj.itemId) || null) : (itemNovo?.dataExecucao ? new Date(itemNovo.dataExecucao).toLocaleDateString('pt-BR') : null);

            if (aj.tipoAjuste === 'ADICIONAR_ITEM') {
              // Verificar se o item foi adicionado
              if (itensNovos.length > 0) {
                statusAjustes.push({
                  tipoAjuste: aj.tipoAjuste,
                  codigoItem: cod,
                  descricaoItem: aj.descricaoItem || '-',
                  dataExecucao: dataExecItem,
                  quantidadeOriginal: null,
                  quantidadeAjustada: aj.quantidadeAjustada,
                  valorOriginal: null,
                  valorAjustado: aj.valorAjustado,
                  quantidadeAtual: itemNovo?.quantidade || null,
                  valorAtual: itemNovo?.valorTotal || null,
                  status: 'corrigido',
                  observacao: `Item adicionado conforme auditoria`,
                });
              } else {
                statusAjustes.push({
                  tipoAjuste: aj.tipoAjuste,
                  codigoItem: cod,
                  descricaoItem: aj.descricaoItem || '-',
                  dataExecucao: dataExecItem,
                  quantidadeOriginal: null,
                  quantidadeAjustada: aj.quantidadeAjustada,
                  valorOriginal: null,
                  valorAjustado: aj.valorAjustado,
                  quantidadeAtual: null,
                  valorAtual: null,
                  status: 'nao_corrigido',
                  observacao: `Item NÃO encontrado na reimportação`,
                });
              }
            } else if (aj.tipoAjuste === 'REMOVER_ITEM') {
              if (itensNovos.length === 0) {
                statusAjustes.push({
                  tipoAjuste: aj.tipoAjuste,
                  codigoItem: cod,
                  descricaoItem: aj.descricaoItem || '-',
                  dataExecucao: dataExecItem,
                  quantidadeOriginal: aj.quantidadeOriginal,
                  quantidadeAjustada: '0',
                  valorOriginal: aj.valorOriginal,
                  valorAjustado: '0',
                  quantidadeAtual: null,
                  valorAtual: null,
                  status: 'corrigido',
                  observacao: `Item removido conforme auditoria`,
                });
              } else {
                statusAjustes.push({
                  tipoAjuste: aj.tipoAjuste,
                  codigoItem: cod,
                  descricaoItem: aj.descricaoItem || '-',
                  dataExecucao: dataExecItem,
                  quantidadeOriginal: aj.quantidadeOriginal,
                  quantidadeAjustada: '0',
                  valorOriginal: aj.valorOriginal,
                  valorAjustado: '0',
                  quantidadeAtual: itemNovo?.quantidade || null,
                  valorAtual: itemNovo?.valorTotal || null,
                  status: 'nao_corrigido',
                  observacao: `Item ainda presente na conta`,
                });
              }
            } else if (aj.tipoAjuste === 'ALTERAR_QUANTIDADE') {
              if (!itemNovo) {
                statusAjustes.push({
                  tipoAjuste: aj.tipoAjuste,
                  codigoItem: cod,
                  descricaoItem: aj.descricaoItem || '-',
                  dataExecucao: dataExecItem,
                  quantidadeOriginal: aj.quantidadeOriginal,
                  quantidadeAjustada: aj.quantidadeAjustada,
                  valorOriginal: aj.valorOriginal,
                  valorAjustado: aj.valorAjustado,
                  quantidadeAtual: null,
                  valorAtual: null,
                  status: 'item_nao_encontrado',
                  observacao: `Item não encontrado na reimportação`,
                });
              } else {
                const qtdAtual = parseFloat(itemNovo.quantidade || '0');
                const qtdAjustada = parseFloat(aj.quantidadeAjustada || '0');
                const qtdOriginal = parseFloat(aj.quantidadeOriginal || '0');
                if (Math.abs(qtdAtual - qtdAjustada) < 0.001) {
                  statusAjustes.push({
                    tipoAjuste: aj.tipoAjuste,
                    codigoItem: cod,
                    descricaoItem: aj.descricaoItem || '-',
                    dataExecucao: dataExecItem,
                    quantidadeOriginal: aj.quantidadeOriginal,
                    quantidadeAjustada: aj.quantidadeAjustada,
                    valorOriginal: aj.valorOriginal,
                    valorAjustado: aj.valorAjustado,
                    quantidadeAtual: itemNovo.quantidade,
                    valorAtual: itemNovo.valorTotal,
                    status: 'corrigido',
                    observacao: `Quantidade corrigida: ${qtdOriginal} → ${qtdAtual}`,
                  });
                } else if (Math.abs(qtdAtual - qtdOriginal) > 0.001) {
                  statusAjustes.push({
                    tipoAjuste: aj.tipoAjuste,
                    codigoItem: cod,
                    descricaoItem: aj.descricaoItem || '-',
                    dataExecucao: dataExecItem,
                    quantidadeOriginal: aj.quantidadeOriginal,
                    quantidadeAjustada: aj.quantidadeAjustada,
                    valorOriginal: aj.valorOriginal,
                    valorAjustado: aj.valorAjustado,
                    quantidadeAtual: itemNovo.quantidade,
                    valorAtual: itemNovo.valorTotal,
                    status: 'parcialmente_corrigido',
                    observacao: `Quantidade alterada para ${qtdAtual}, mas auditoria esperava ${qtdAjustada}`,
                  });
                } else {
                  statusAjustes.push({
                    tipoAjuste: aj.tipoAjuste,
                    codigoItem: cod,
                    descricaoItem: aj.descricaoItem || '-',
                    dataExecucao: dataExecItem,
                    quantidadeOriginal: aj.quantidadeOriginal,
                    quantidadeAjustada: aj.quantidadeAjustada,
                    valorOriginal: aj.valorOriginal,
                    valorAjustado: aj.valorAjustado,
                    quantidadeAtual: itemNovo.quantidade,
                    valorAtual: itemNovo.valorTotal,
                    status: 'nao_corrigido',
                    observacao: `Quantidade permanece ${qtdAtual}, auditoria ajustou para ${qtdAjustada}`,
                  });
                }
              }
            } else if (aj.tipoAjuste === 'ALTERAR_VALOR') {
              if (!itemNovo) {
                statusAjustes.push({
                  tipoAjuste: aj.tipoAjuste,
                  codigoItem: cod,
                  descricaoItem: aj.descricaoItem || '-',
                  dataExecucao: dataExecItem,
                  quantidadeOriginal: aj.quantidadeOriginal,
                  quantidadeAjustada: aj.quantidadeAjustada,
                  valorOriginal: aj.valorOriginal,
                  valorAjustado: aj.valorAjustado,
                  quantidadeAtual: null,
                  valorAtual: null,
                  status: 'item_nao_encontrado',
                  observacao: `Item não encontrado na reimportação`,
                });
              } else {
                const valAtual = parseFloat(itemNovo.valorTotal || '0');
                const valAjustado = parseFloat(aj.valorAjustado || '0');
                const valOriginal = parseFloat(aj.valorOriginal || '0');
                if (Math.abs(valAtual - valAjustado) < 0.01) {
                  statusAjustes.push({
                    tipoAjuste: aj.tipoAjuste,
                    codigoItem: cod,
                    descricaoItem: aj.descricaoItem || '-',
                    dataExecucao: dataExecItem,
                    quantidadeOriginal: aj.quantidadeOriginal,
                    quantidadeAjustada: aj.quantidadeAjustada,
                    valorOriginal: aj.valorOriginal,
                    valorAjustado: aj.valorAjustado,
                    quantidadeAtual: itemNovo.quantidade,
                    valorAtual: itemNovo.valorTotal,
                    status: 'corrigido',
                    observacao: `Valor corrigido: R$ ${valOriginal.toFixed(2)} → R$ ${valAtual.toFixed(2)}`,
                  });
                } else if (Math.abs(valAtual - valOriginal) > 0.01) {
                  statusAjustes.push({
                    tipoAjuste: aj.tipoAjuste,
                    codigoItem: cod,
                    descricaoItem: aj.descricaoItem || '-',
                    dataExecucao: dataExecItem,
                    quantidadeOriginal: aj.quantidadeOriginal,
                    quantidadeAjustada: aj.quantidadeAjustada,
                    valorOriginal: aj.valorOriginal,
                    valorAjustado: aj.valorAjustado,
                    quantidadeAtual: itemNovo.quantidade,
                    valorAtual: itemNovo.valorTotal,
                    status: 'parcialmente_corrigido',
                    observacao: `Valor alterado para R$ ${valAtual.toFixed(2)}, mas auditoria esperava R$ ${valAjustado.toFixed(2)}`,
                  });
                } else {
                  statusAjustes.push({
                    tipoAjuste: aj.tipoAjuste,
                    codigoItem: cod,
                    descricaoItem: aj.descricaoItem || '-',
                    dataExecucao: dataExecItem,
                    quantidadeOriginal: aj.quantidadeOriginal,
                    quantidadeAjustada: aj.quantidadeAjustada,
                    valorOriginal: aj.valorOriginal,
                    valorAjustado: aj.valorAjustado,
                    quantidadeAtual: itemNovo.quantidade,
                    valorAtual: itemNovo.valorTotal,
                    status: 'nao_corrigido',
                    observacao: `Valor permanece R$ ${valOriginal.toFixed(2)}, auditoria ajustou para R$ ${valAjustado.toFixed(2)}`,
                  });
                }
              }
            }
          }

          const totalAjustesCorrigidos = statusAjustes.filter(a => a.status === 'corrigido').length;
          const totalAjustesParciais = statusAjustes.filter(a => a.status === 'parcialmente_corrigido').length;
          const totalAjustesNaoCorrigidos = statusAjustes.filter(a => a.status === 'nao_corrigido' || a.status === 'item_nao_encontrado').length;

          comparativo = {
            hadPreviousData: true,
            valorAnterior: valorTotalAnterior,
            valorNovo: valorTotalConta,
            diferencaValor: valorTotalConta - valorTotalAnterior,
            totalItensAnterior,
            totalItensNovo: totalInseridos,
            itensAlterados: itensAlterados.slice(0, 50),
            itensAdicionados,
            itensRemovidos,
            valorItensAdicionados,
            valorItensRemovidos,
            diferencaAlteracoes,
            listaItensAdicionados: listaItensAdicionados.slice(0, 30),
            listaItensRemovidos: listaItensRemovidos.slice(0, 30),
            statusAjustesAuditoria: statusAjustes,
            totalAjustesCorrigidos,
            totalAjustesParciais,
            totalAjustesNaoCorrigidos,
          };

          logger.info({
            message: "Comparativo de reimportação gerado",
            numeroConta: input.numeroConta,
            valorAnterior: valorTotalAnterior,
            valorNovo: valorTotalConta,
            itensAlterados: itensAlterados.length,
            itensAdicionados,
            itensRemovidos,
          });
        }

        return {
          sucesso: true,
          mensagem: `Conta ${input.numeroConta} importada com ${totalInseridos} itens. Valor total: R$ ${valorTotalConta.toFixed(2)}${avisoFallback}`,
          totalItens: totalInseridos,
          valorTotal: valorTotalConta,
          fonteDados,
          comparativo,
          convenio: resumoConvenio ? String(resumoConvenio).trim() : null,
          paciente: resumoPaciente ? String(resumoPaciente) : null,
          conta: {
            numeroConta: input.numeroConta,
            convenio: resumoConvenio ? String(resumoConvenio).trim() : null,
            paciente: resumoPaciente ? String(resumoPaciente) : null,
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
      competenciaAno: z.number().optional(),
      competenciaMes: z.number().optional(),
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
      const competenciaAno = input?.competenciaAno;
      const competenciaMes = input?.competenciaMes;
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
      // Filtro de competência (Ano/Mês)
      if (competenciaAno && competenciaMes) {
        const mesStr = String(competenciaMes).padStart(2, '0');
        const competenciaPattern = `${competenciaAno}/${mesStr}%`;
        conditions.push(like(contasConvenioResumo.competencia, competenciaPattern));
      } else if (competenciaAno) {
        const competenciaPattern = `${competenciaAno}/%`;
        conditions.push(like(contasConvenioResumo.competencia, competenciaPattern));
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

      // Identificar contas com múltiplos lotes (Altas Administrativas)
      // Busca quais numeroConta da página atual têm mais de 1 lote distinto nos itens
      const contasNumerosNaPagina = contas.map(c => c.numeroConta);
      let contasComAltaAdm = new Map<string, number>(); // numeroConta -> totalLotes
      
      if (contasNumerosNaPagina.length > 0) {
        const altaAdmResult = await db.execute(
          sql`SELECT numeroConta, COUNT(DISTINCT numeroLote) as totalLotes
              FROM contas_convenio_itens
              WHERE numeroConta IN (${sql.join(contasNumerosNaPagina.map(n => sql`${n}`), sql`, `)})
                AND estabelecimentoId = ${estabelecimentoId || 0}
                AND numeroLote IS NOT NULL AND numeroLote != '' AND numeroLote != 'null'
              GROUP BY numeroConta
              HAVING COUNT(DISTINCT numeroLote) > 1`
        );
        const rows = (altaAdmResult as any)[0] as any[];
        if (rows && Array.isArray(rows)) {
          for (const row of rows) {
            contasComAltaAdm.set(row.numeroConta, Number(row.totalLotes));
          }
        }
      }

      // Adicionar flag de alta administrativa a cada conta
      // Detectar outliers de valor total por convênio
      // Calcular média e desvio padrão do valor total por convênio
      const conveniosNaPagina = [...new Set(contas.map(c => c.convenio).filter(Boolean))];
      const statsConvenio = new Map<string, { media: number; desvio: number }>();
      
      if (conveniosNaPagina.length > 0) {
        for (const conv of conveniosNaPagina) {
          if (!conv) continue;
          const statsResult = await db.execute(
            sql`SELECT 
                  AVG(CAST(valorTotal AS DECIMAL(14,2))) as media,
                  STDDEV(CAST(valorTotal AS DECIMAL(14,2))) as desvio
                FROM contas_convenio_resumo
                WHERE convenio = ${conv}
                  AND valorTotal IS NOT NULL AND CAST(valorTotal AS DECIMAL(14,2)) > 0`
          );
          const row = (statsResult as any)[0]?.[0];
          if (row && row.media) {
            statsConvenio.set(conv, {
              media: parseFloat(row.media),
              desvio: parseFloat(row.desvio || "0"),
            });
          }
        }
      }

      const contasComFlag = contas.map(conta => {
        const valorConta = parseFloat(conta.valorTotal || "0");
        const stats = conta.convenio ? statsConvenio.get(conta.convenio) : undefined;
        let isOutlier = false;
        let outlierTipo: "acima" | "abaixo" | null = null;
        let outlierPercent = 0;
        
        if (stats && stats.desvio > 0 && valorConta > 0) {
          const limSup = stats.media + 2 * stats.desvio;
          const limInf = Math.max(0, stats.media - 2 * stats.desvio);
          if (valorConta > limSup) {
            isOutlier = true;
            outlierTipo = "acima";
            outlierPercent = Math.round(((valorConta - stats.media) / stats.media) * 100);
          } else if (valorConta < limInf && limInf > 0) {
            isOutlier = true;
            outlierTipo = "abaixo";
            outlierPercent = Math.round(((stats.media - valorConta) / stats.media) * 100);
          }
        }
        
        return {
          ...conta,
          isAltaAdministrativa: contasComAltaAdm.has(conta.numeroConta),
          totalLotes: contasComAltaAdm.get(conta.numeroConta) || 1,
          isOutlier,
          outlierTipo,
          outlierPercent,
          mediaConvenio: stats?.media || null,
        };
      });

      return {
        contas: contasComFlag,
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
  // LISTAR COMPETÊNCIAS (MESES) DISPONÍVEIS
  // ============================================================
  listarCompetencias: protectedProcedure
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
          competencia: contasConvenioResumo.competencia,
          totalContas: sql<number>`COUNT(*)`,
          valorTotal: sql<string>`COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0)`,
        })
        .from(contasConvenioResumo)
        .where(and(
          whereClause,
          sql`${contasConvenioResumo.competencia} IS NOT NULL AND ${contasConvenioResumo.competencia} != ''`
        ))
        .groupBy(contasConvenioResumo.competencia)
        .orderBy(desc(contasConvenioResumo.competencia));

      // Extrair anos e meses únicos
      const anos = new Set<number>();
      const meses = new Map<string, { ano: number; mes: number; totalContas: number; valorTotal: string }>(); 

      for (const r of result) {
        if (r.competencia) {
          // Formato esperado: YYYY/MM ou MM/YYYY
          const parts = r.competencia.split('/');
          let ano: number, mesNum: number;
          if (parts[0].length === 4) {
            // YYYY/MM
            ano = parseInt(parts[0]);
            mesNum = parseInt(parts[1]);
          } else {
            // MM/YYYY
            mesNum = parseInt(parts[0]);
            ano = parseInt(parts[1]);
          }
          if (!isNaN(ano) && !isNaN(mesNum)) {
            anos.add(ano);
            const key = `${ano}-${String(mesNum).padStart(2, '0')}`;
            meses.set(key, { ano, mes: mesNum, totalContas: r.totalContas, valorTotal: r.valorTotal });
          }
        }
      }

      return {
        anos: Array.from(anos).sort((a, b) => b - a),
        meses: Array.from(meses.entries()).map(([key, v]) => ({
          key,
          ano: v.ano,
          mes: v.mes,
          label: `${String(v.mes).padStart(2, '0')}/${v.ano}`,
          totalContas: v.totalContas,
          valorTotal: v.valorTotal,
        })).sort((a, b) => b.key.localeCompare(a.key)),
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

      // Buscar score de risco e divergências gerais (ITEM_FALTANTE) do resumo da conta
      const resumoConta = await db
        .select({ 
          scoreRisco: contasConvenioResumo.scoreRisco, 
          detalhesRisco: contasConvenioResumo.detalhesRisco,
          divergenciasGerais: contasConvenioResumo.divergenciasGerais,
        })
        .from(contasConvenioResumo)
        .where(and(
          eq(contasConvenioResumo.numeroConta, input.numeroConta),
          eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId),
        ))
        .limit(1);

      // Incluir divergências gerais (ITEM_FALTANTE, etc.) que não estão vinculadas a itens
      const divergenciasGerais = resumoConta[0]?.divergenciasGerais as any[] | null;
      if (Array.isArray(divergenciasGerais)) {
        for (const div of divergenciasGerais) {
          todasDivergencias.push({
            ...div,
            itemId: null,
            // codigoItem e descricaoItem já vem do próprio objeto div
          });
        }
      }

      // Recalcular resumo com divergências gerais incluídas
      const resumoFinal = {
        total: todasDivergencias.length,
        porTipo: {} as Record<string, number>,
        porSeveridade: {} as Record<string, number>,
      };
      for (const div of todasDivergencias) {
        resumoFinal.porTipo[div.tipo] = (resumoFinal.porTipo[div.tipo] || 0) + 1;
        resumoFinal.porSeveridade[div.severidade] = (resumoFinal.porSeveridade[div.severidade] || 0) + 1;
      }

      return {
        divergencias: todasDivergencias,
        resumo: resumoFinal,
        scoreRisco: resumoConta[0]?.scoreRisco ?? null,
        detalhesRisco: resumoConta[0]?.detalhesRisco ?? null,
      };
    }),

  // ============================================================
  // FEEDBACK DE DIVERGÊNCIAS (Passo 4 - Feedback Loop)
  // ============================================================
  registrarFeedback: protectedProcedure
    .input(z.object({
      numeroConta: z.string(),
      estabelecimentoId: z.number(),
      padraoId: z.number().optional(),
      codigoItem: z.string().optional(),
      tipoDivergencia: z.string(),
      acao: z.enum(["aceitar", "rejeitar", "ajustar"]),
      observacao: z.string().optional(),
      valorSugerido: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      // 1. Registrar o feedback
      // Mapear "ajustar" para "aceitar" no banco (schema só aceita aceitar/rejeitar/ignorar)
      const decisaoDb = input.acao === "ajustar" ? "aceitar" as const : input.acao === "aceitar" ? "aceitar" as const : "rejeitar" as const;
      await db.insert(feedbackDivergencias).values({
        estabelecimentoId: input.estabelecimentoId,
        numeroConta: input.numeroConta,
        padraoId: input.padraoId || null,
        codigoItem: input.codigoItem || null,
        tipoDivergencia: input.tipoDivergencia,
        decisao: decisaoDb,
        justificativa: input.observacao || null,
        dadosDivergencia: input.valorSugerido ? { valorSugerido: input.valorSugerido, acaoOriginal: input.acao } : { acaoOriginal: input.acao },
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || "Desconhecido",
        createdAt: new Date(),
      });

      // 2. Se a ação é "rejeitar" uma divergência, significa que o padrão está incorreto
      // Incrementar um contador de rejeições no padrão para futuro refinamento
      if (input.padraoId && input.acao === "rejeitar") {
        // Buscar o padrão
        const [padrao] = await db
          .select()
          .from(padroesCobranca)
          .where(eq(padroesCobranca.id, input.padraoId));

        if (padrao) {
          // Contar quantas rejeições esse padrão tem
          const [countResult] = await db.execute(sql`
            SELECT COUNT(*) as total FROM feedback_divergencias 
            WHERE padrao_id = ${input.padraoId} AND decisao = 'rejeitar'
          `) as any;
          const totalRejeicoes = Number((countResult as any)?.total || 0);

          // Se muitas rejeições (>5), sugerir revisão do padrão
          if (totalRejeicoes >= 5 && padrao.status === "ativo" && padrao.isGabarito !== 1) {
            await db.update(padroesCobranca)
              .set({ status: "revisao" })
              .where(eq(padroesCobranca.id, input.padraoId));

            logger.info({
              message: "Padrão movido para revisão por excesso de rejeições",
              padraoId: input.padraoId,
              totalRejeicoes,
            });
          }
        }
      }

      // 3. Se a ação é "aceitar" uma divergência de item faltante,
      // significa que o item realmente deveria estar lá - reforça o padrão
      if (input.padraoId && input.acao === "aceitar" && input.tipoDivergencia === "ITEM_FALTANTE") {
        logger.info({
          message: "Divergência de item faltante aceita - padrão reforçado",
          padraoId: input.padraoId,
          codigoItem: input.codigoItem,
        });
      }

      // 4. Se a ação é "ajustar", registrar o valor sugerido para futuro refinamento
      if (input.acao === "ajustar" && input.valorSugerido) {
        logger.info({
          message: "Valor ajustado pelo auditor",
          padraoId: input.padraoId,
          codigoItem: input.codigoItem,
          valorSugerido: input.valorSugerido,
        });
      }

      return { success: true };
    }),

  // Listar feedbacks de uma conta
  listarFeedbacks: protectedProcedure
    .input(z.object({
      numeroConta: z.string(),
      estabelecimentoId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const feedbacks = await db
        .select()
        .from(feedbackDivergencias)
        .where(and(
          eq(feedbackDivergencias.numeroConta, input.numeroConta),
          eq(feedbackDivergencias.estabelecimentoId, input.estabelecimentoId),
        ))
        .orderBy(desc(feedbackDivergencias.createdAt));

      return feedbacks;
    }),

  // Estatísticas de feedback por padrão
  estatisticasFeedback: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const stats = await db.execute(sql`
        SELECT 
          padrao_id as padraoId,
          tipo_divergencia as tipoDivergencia,
          decisao,
          COUNT(*) as total
        FROM feedback_divergencias
        WHERE estabelecimento_id = ${input.estabelecimentoId}
        GROUP BY padrao_id, tipo_divergencia, decisao
        ORDER BY total DESC
      `);

      return (stats as any)[0] || [];
    }),

  // ============================================================
  // MIGRAR DADOS XML (faturamento_tiss) PARA contas_convenio_itens
  // ============================================================
  migrarDadosXml: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      // Buscar dados do faturamento_tiss para o estabelecimento
      // Usando SQL direto para JOIN com convênios
      const rows = await db.execute(sql`
        SELECT 
          ft.id,
          ft.numero_lote,
          ft.numero_guia_prestador,
          ft.numero_guia_operadora,
          ft.senha,
          ft.carteira_beneficiario,
          ft.tipo_item,
          ft.sequencial_item,
          ft.data_execucao,
          ft.codigo_tabela,
          ft.codigo_item,
          ft.descricao_item,
          ft.quantidade,
          ft.valor_unitario,
          ft.valor_faturado,
          ft.nome_prof,
          ft.valor_total_geral_guia,
          ft.estabelecimentoId,
          ft.arquivo_id,
          ft.convenioId,
          ft.data_referencia,
          ft.data_importacao,
          c.nome as convenio_nome,
          a.dataReferencia as arquivo_data_referencia
        FROM faturamento_tiss ft
        LEFT JOIN convenios c ON c.id = ft.convenioId
        LEFT JOIN arquivos a ON a.id = ft.arquivo_id
        WHERE ft.estabelecimentoId = ${input.estabelecimentoId}
        ORDER BY ft.numero_guia_prestador, ft.data_execucao
      `);

      const data = (rows as any)[0] || rows;
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Nenhum dado XML encontrado para este estabelecimento.",
        });
      }

      logger.info({ message: `Migrando ${data.length} itens XML para contas_convenio_itens`, estabelecimentoId: input.estabelecimentoId });

      // Limpar dados XML anteriores deste estabelecimento na tabela destino
      await db.delete(contasConvenioItens).where(
        and(
          eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId),
          eq(contasConvenioItens.origem, "XML")
        )
      );
      await db.delete(contasConvenioResumo).where(
        and(
          eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId),
          eq(contasConvenioResumo.origem, "XML")
        )
      );

      // Inserir itens em batches
      let totalInseridos = 0;
      const BATCH_SIZE = 500;

      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        const values = batch.map((row: any) => {
          const guia = row.numero_guia_prestador || row.numero_guia_operadora || 'SEM_GUIA';
          const vlUnit = row.valor_unitario ? parseFloat(String(row.valor_unitario)) : 0;
          const vlFat = row.valor_faturado ? parseFloat(String(row.valor_faturado)) : 0;
          const qtd = row.quantidade ? parseFloat(String(row.quantidade)) : 0;
          const vlTotal = vlFat || (vlUnit * qtd);

          return {
            origem: "XML" as const,
            numeroConta: String(guia),
            numeroGuia: row.numero_guia_prestador ? String(row.numero_guia_prestador) : null,
            numeroGuiaOperadora: row.numero_guia_operadora ? String(row.numero_guia_operadora) : null,
            numeroLote: row.numero_lote ? String(row.numero_lote) : null,
            senha: row.senha ? String(row.senha) : null,
            pacienteNome: null, // XML não tem nome do paciente
            carteiraBeneficiario: row.carteira_beneficiario ? String(row.carteira_beneficiario) : null,
            convenio: row.convenio_nome ? String(row.convenio_nome) : null,
            convenioId: row.convenioId || null,
            estabelecimentoId: input.estabelecimentoId,
            tipoItem: row.tipo_item ? String(row.tipo_item) : 'OUTROS',
            codigoItem: row.codigo_item ? String(row.codigo_item) : null,
            codigoItemTuss: null,
            descricaoItem: row.descricao_item ? String(row.descricao_item) : null,
            codigoTabela: row.codigo_tabela ? String(row.codigo_tabela) : null,
            quantidade: qtd ? String(qtd) : null,
            valorUnitario: vlUnit ? String(vlUnit) : null,
            valorTotal: vlTotal ? String(vlTotal) : null,
            dataExecucao: row.data_execucao ? new Date(row.data_execucao) : null,
            dataReferencia: row.data_referencia ? new Date(row.data_referencia) : null,
            competencia: null,
            profissionalExecutante: row.nome_prof ? String(row.nome_prof) : null,
            setor: null,
            arquivoId: row.arquivo_id || null,
            statusAnalise: "pendente" as const,
          };
        });

        await db.insert(contasConvenioItens).values(values);
        totalInseridos += batch.length;
      }

      // Criar resumos agrupados por guia
      const resumosPorGuia = new Map<string, {
        convenio: string | null;
        convenioId: number | null;
        carteira: string | null;
        totalItens: number;
        valorTotal: number;
        dataExecucao: Date | null;
        arquivoDataReferencia: Date | null;
      }>();

      for (const row of data) {
        const guia = String(row.numero_guia_prestador || row.numero_guia_operadora || 'SEM_GUIA');
        const existing = resumosPorGuia.get(guia) || {
          convenio: null,
          convenioId: null,
          carteira: null,
          totalItens: 0,
          valorTotal: 0,
          dataExecucao: null,
          arquivoDataReferencia: null,
        };

        existing.convenio = existing.convenio || (row.convenio_nome ? String(row.convenio_nome) : null);
        existing.convenioId = existing.convenioId || row.convenioId || null;
        existing.carteira = existing.carteira || (row.carteira_beneficiario ? String(row.carteira_beneficiario) : null);
        existing.totalItens += 1;
        const vlFat = row.valor_faturado ? parseFloat(String(row.valor_faturado)) : 0;
        const vlUnit = row.valor_unitario ? parseFloat(String(row.valor_unitario)) : 0;
        const qtd = row.quantidade ? parseFloat(String(row.quantidade)) : 0;
        existing.valorTotal += vlFat || (vlUnit * qtd);
        if (row.data_execucao && !existing.dataExecucao) {
          existing.dataExecucao = new Date(row.data_execucao);
        }
        // Usar data de referência do arquivo de upload como competência
        if (row.arquivo_data_referencia && !existing.arquivoDataReferencia) {
          existing.arquivoDataReferencia = new Date(row.arquivo_data_referencia);
        }

        resumosPorGuia.set(guia, existing);
      }

      // Inserir resumos em batches
      const resumoEntries = Array.from(resumosPorGuia.entries());
      let totalResumos = 0;

      for (let i = 0; i < resumoEntries.length; i += BATCH_SIZE) {
        const batch = resumoEntries.slice(i, i + BATCH_SIZE);
        const resumoValues = batch.map(([guia, r]) => ({
          numeroConta: guia,
          estabelecimentoId: input.estabelecimentoId,
          origem: "XML" as const,
          convenio: r.convenio,
          convenioId: r.convenioId,
          pacienteNome: null,
          carteiraBeneficiario: r.carteira,
          totalItens: r.totalItens,
          valorTotal: String(r.valorTotal.toFixed(2)),
          dataInternacao: r.dataExecucao,
          statusAnalise: "pendente" as const,
          buscadoPor: ctx.user?.id || null,
          competencia: (() => {
            // Prioridade: usar data de referência do arquivo de upload
            if (r.arquivoDataReferencia) {
              const d = r.arquivoDataReferencia;
              return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
            }
            // Fallback: usar dataExecucao se não houver data de referência
            if (r.dataExecucao) {
              const d = r.dataExecucao;
              return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
            }
            return null;
          })(),
        }));

        await db.insert(contasConvenioResumo).values(resumoValues);
        totalResumos += batch.length;
      }

      logger.info({
        message: `Migração concluída: ${totalInseridos} itens, ${totalResumos} contas`,
        estabelecimentoId: input.estabelecimentoId,
      });

      return {
        sucesso: true,
        mensagem: `Migração concluída: ${totalInseridos} itens importados em ${totalResumos} contas.`,
        totalItens: totalInseridos,
        totalContas: totalResumos,
      };
    }),

  // Log de análise - rastreabilidade de gabaritos/padrões usados
  getLogsAnalise: protectedProcedure
    .input(z.object({
      numeroConta: z.string(),
      estabelecimentoId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database não disponível" });

      const logs = await db
        .select()
        .from(logAnaliseComparacao)
        .where(and(
          eq(logAnaliseComparacao.numeroConta, input.numeroConta),
          eq(logAnaliseComparacao.estabelecimentoId, input.estabelecimentoId),
        ))
        .orderBy(desc(logAnaliseComparacao.criadoEm))
        .limit(50);

      return { logs };
    }),
});
