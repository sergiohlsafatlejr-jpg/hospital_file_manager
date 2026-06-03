/**
 * Router tRPC para funcionalidades inspiradas no med-compara:
 * - Score de compatibilidade e sugestões de vinculação
 * - Aprendizado nas regras de vinculação
 * - Templates de justificativa
 * - Exportação multi-formato
 * - Parser Factory info
 * - Auditoria com diff
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { 
  gerarSugestoesVinculacao, 
  aceitarSugestaoVinculacao, 
  rejeitarSugestaoVinculacao,
  aplicarVinculacoesAutomaticas,
  calcularScore,
  type ItemParaMatch
} from "../scoreCompatibilidadeService";
import { 
  confirmarVinculacao, 
  rejeitarVinculacao, 
  listarCandidatasPromocao,
  promoverRegra,
  despromoverRegra,
  listarRegrasComEstatisticas,
  obterEstatisticasAprendizado
} from "../aprendizadoVinculacaoService";
import { 
  criarTemplate, 
  atualizarTemplate, 
  buscarTemplatesPorGlosa,
  listarTemplates,
  registrarUsoTemplate,
  atualizarTaxaSucesso,
  sugerirTemplates,
  excluirTemplate,
  obterEstatisticasTemplates
} from "../justificativaTemplateService";
import { 
  exportarConciliacaoExcel, 
  exportarConciliacaoCSV, 
  exportarConciliacaoJSON 
} from "../exportacaoConciliacaoService";
import { obterInfoParsers } from "../parserFactory";
import { buscarAuditoria, obterEstatisticasAuditoria } from "../auditoriaService";

export const medComparaRouter = router({
  // ============================================================
  // SCORE DE COMPATIBILIDADE E SUGESTÕES
  // ============================================================
  
  sugestoes: router({
    gerar: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        arquivoDemoId: z.number(),
        guia: z.string().optional(),
        scoreMinimo: z.number().min(0).max(100).optional(),
      }))
      .mutation(async ({ input }) => {
        return await gerarSugestoesVinculacao(input);
      }),
    
    aceitar: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        convenioId: z.number().optional(),
        itemFaturadoId: z.number(),
        itemDemoId: z.number(),
        codigoHospital: z.string(),
        codigoConvenio: z.string(),
        descricaoHospital: z.string().optional().default(""),
        descricaoConvenio: z.string().optional().default(""),
      }))
      .mutation(async ({ input, ctx }) => {
        return await aceitarSugestaoVinculacao({
          ...input,
          userId: ctx.user.id,
        });
      }),
    
    rejeitar: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        codigoHospital: z.string(),
        codigoConvenio: z.string(),
      }))
      .mutation(async ({ input }) => {
        return await rejeitarSugestaoVinculacao(input);
      }),
    
    aplicarAutomaticas: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        arquivoDemoId: z.number(),
        convenioId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        return await aplicarVinculacoesAutomaticas(input);
      }),
    
    calcularScore: protectedProcedure
      .input(z.object({
        itemFaturado: z.object({
          guia: z.string(),
          codigo: z.string(),
          descricao: z.string(),
          quantidade: z.number(),
          valor: z.number(),
        }),
        itemDemo: z.object({
          guia: z.string(),
          codigo: z.string(),
          descricao: z.string(),
          quantidade: z.number(),
          valor: z.number(),
        }),
      }))
      .query(({ input }) => {
        return calcularScore(input.itemFaturado, input.itemDemo);
      }),
  }),
  
  // ============================================================
  // APRENDIZADO DE VINCULAÇÃO
  // ============================================================
  
  aprendizado: router({
    confirmar: protectedProcedure
      .input(z.object({ vinculacaoId: z.number() }))
      .mutation(async ({ input }) => {
        await confirmarVinculacao(input.vinculacaoId);
        return { sucesso: true };
      }),
    
    rejeitar: protectedProcedure
      .input(z.object({ vinculacaoId: z.number() }))
      .mutation(async ({ input }) => {
        await rejeitarVinculacao(input.vinculacaoId);
        return { sucesso: true };
      }),
    
    candidatasPromocao: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number() }))
      .query(async ({ input }) => {
        return await listarCandidatasPromocao(input.estabelecimentoId);
      }),
    
    promover: protectedProcedure
      .input(z.object({ vinculacaoId: z.number() }))
      .mutation(async ({ input }) => {
        await promoverRegra(input.vinculacaoId);
        return { sucesso: true };
      }),
    
    despromover: protectedProcedure
      .input(z.object({ vinculacaoId: z.number() }))
      .mutation(async ({ input }) => {
        await despromoverRegra(input.vinculacaoId);
        return { sucesso: true };
      }),
    
    listarRegras: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        convenioId: z.number().optional(),
        apenasAtivas: z.boolean().optional(),
        apenasAutoPromovidas: z.boolean().optional(),
      }))
      .query(async ({ input }) => {
        return await listarRegrasComEstatisticas(input);
      }),
    
    estatisticas: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number() }))
      .query(async ({ input }) => {
        return await obterEstatisticasAprendizado(input.estabelecimentoId);
      }),
  }),
  
  // ============================================================
  // TEMPLATES DE JUSTIFICATIVA
  // ============================================================
  
  templates: router({
    criar: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        codigoGlosa: z.string(),
        titulo: z.string().min(3),
        texto: z.string().min(10),
        fundamentacaoLegal: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await criarTemplate({ ...input, criadoPor: ctx.user.id });
        return { id };
      }),
    
    atualizar: protectedProcedure
      .input(z.object({
        id: z.number(),
        titulo: z.string().optional(),
        texto: z.string().optional(),
        fundamentacaoLegal: z.string().nullable().optional(),
        ativo: z.enum(["sim", "nao"]).optional(),
      }))
      .mutation(async ({ input }) => {
        await atualizarTemplate(input);
        return { sucesso: true };
      }),
    
    listar: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        apenasAtivos: z.boolean().optional(),
        codigoGlosa: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return await listarTemplates(input);
      }),
    
    buscarPorGlosa: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        codigoGlosa: z.string(),
      }))
      .query(async ({ input }) => {
        return await buscarTemplatesPorGlosa(input);
      }),
    
    sugerir: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        codigoGlosa: z.string(),
        limite: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await sugerirTemplates(input);
      }),
    
    registrarUso: protectedProcedure
      .input(z.object({ templateId: z.number() }))
      .mutation(async ({ input }) => {
        await registrarUsoTemplate(input.templateId);
        return { sucesso: true };
      }),
    
    registrarResultado: protectedProcedure
      .input(z.object({ templateId: z.number(), sucesso: z.boolean() }))
      .mutation(async ({ input }) => {
        await atualizarTaxaSucesso(input.templateId, input.sucesso);
        return { sucesso: true };
      }),
    
    excluir: protectedProcedure
      .input(z.object({ templateId: z.number() }))
      .mutation(async ({ input }) => {
        await excluirTemplate(input.templateId);
        return { sucesso: true };
      }),
    
    estatisticas: protectedProcedure
      .input(z.object({ estabelecimentoId: z.number() }))
      .query(async ({ input }) => {
        return await obterEstatisticasTemplates(input.estabelecimentoId);
      }),
  }),
  
  // ============================================================
  // EXPORTAÇÃO MULTI-FORMATO
  // ============================================================
  
  exportacao: router({
    excel: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        arquivoDemoId: z.number().optional(),
        convenioId: z.number().optional(),
        competencia: z.string().optional(),
        guia: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await exportarConciliacaoExcel(input);
      }),
    
    csv: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        arquivoDemoId: z.number().optional(),
        convenioId: z.number().optional(),
        competencia: z.string().optional(),
        status: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        return await exportarConciliacaoCSV(input);
      }),
    
    json: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        arquivoDemoId: z.number().optional(),
        convenioId: z.number().optional(),
        competencia: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await exportarConciliacaoJSON(input);
      }),
  }),
  
  // ============================================================
  // PARSER FACTORY
  // ============================================================
  
  parsers: router({
    listar: protectedProcedure
      .query(() => {
        return obterInfoParsers();
      }),
  }),
  
  // ============================================================
  // AUDITORIA
  // ============================================================
  
  auditoria: router({
    buscar: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        tabela: z.string().optional(),
        tipoAcao: z.string().optional(),
        usuarioId: z.number().optional(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        registroId: z.number().optional(),
        limite: z.number().optional(),
        offset: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await buscarAuditoria(input);
      }),
    
    estatisticas: protectedProcedure
      .input(z.object({
        estabelecimentoId: z.number(),
        dias: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await obterEstatisticasAuditoria(input);
      }),
  }),
});
