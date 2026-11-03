import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import fs from "fs";
import { RoboSaudeCaixa } from "../rpa/robos/RoboSaudeCaixa";
import { RoboUnimed } from "../rpa/robos/RoboUnimed";
import { RoboIpasgo } from "../rpa/robos/RoboIpasgo";
import { RoboCassi } from "../rpa/robos/RoboCassi";
import { logger } from "../_core/logger";
import { getDb, verificarPermissaoEstabelecimento } from "../db";
import {
  credenciaisPortais,
  convenios,
  convenioEstabelecimentoPrestador,
  estabelecimentos,
  filaEnvioXmlPortal,
} from "../../drizzle/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  cofreRpaKeyAvailable,
  estaCriptografadaNoCofre,
  obterSenhaParaRobo,
  resolverCaminhoSeguroXmlRpa,
  salvarSenhaCofre,
  sanitizarNumeroLoteTiss,
  validarCaminhoContidoXmlRpa,
  validarUrlPortalConvenio,
} from "../rpa/cofreCredenciais";
import { identificarERotearXmlTiss } from "../rpa/identificadorXmlTiss";
import { executarCicloEnvioXmlRpa } from "../rpa/rpaEnvioService";
import { ESTABELECIMENTO_CENTRAL_SAFATLE } from "../hospitalScope";
import { inserirFilaXmlAtomica } from "../rpa/rpaFilaAtomica";
import { validarCodigoPrestadorRpa, validarConvenioRpa } from "../rpa/rpaImportadorScope";

const ESTADOS_ELEGIVEIS_LIBERACAO = [
  "IMPORTADO",
  "SIMULADO_OK",
  "ERRO_PORTAL",
  "ERRO_ROBO",
  "ERRO_CREDENCIAL",
] as const;

const ESTADOS_BLOQUEADOS_EXCLUSAO = [
  "PROCESSANDO_ROBO",
  "PROTOCOLADO",
  "AGUARDANDO_PORTAL",
] as const;

function exigirMutacaoFilaCompleta(resultado: unknown, quantidade: number): void {
  const header: unknown = Array.isArray(resultado) ? resultado[0] : resultado;
  const afetados = header && typeof header === "object" && "affectedRows" in header
    ? Number(header.affectedRows) : 0;
  if (afetados !== quantidade) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A fila mudou durante a operação; atualize antes de tentar novamente.",
    });
  }
}

async function exigirAcessoHospitalRpa(
  userId: number,
  estabelecimentoId: number | null | undefined,
  acao: "visualizar" | "editar" | "excluir" = "visualizar"
): Promise<number> {
  const estabId = Number(estabelecimentoId);
  if (
    !Number.isSafeInteger(estabId) ||
    estabId <= 0 ||
    estabId === ESTABELECIMENTO_CENTRAL_SAFATLE
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Hospital proprietário válido é obrigatório para esta operação RPA.",
    });
  }
  const permitido = await verificarPermissaoEstabelecimento(userId, estabId, acao);
  if (!permitido) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Usuário sem permissão para operar RPA neste estabelecimento hospitalar.",
    });
  }
  return estabId;
}

async function listarHospitaisAutorizadosRpa(
  db: any,
  userId: number,
  acao: "visualizar" | "editar" | "excluir" = "visualizar"
): Promise<Array<{ id: number; nome: string; cnpj: string | null; cnes: string | null }>> {
  const rows = await db
    .select({
      id: estabelecimentos.id,
      nome: estabelecimentos.nome,
      cnpj: estabelecimentos.cnpj,
      cnes: estabelecimentos.cnes,
    })
    .from(estabelecimentos)
    .where(eq(estabelecimentos.ativo, "sim"))
    .orderBy(estabelecimentos.nome);

  const autorizados: Array<{ id: number; nome: string; cnpj: string | null; cnes: string | null }> = [];
  for (const r of rows) {
    const id = Number(r.id);
    if (id === ESTABELECIMENTO_CENTRAL_SAFATLE) continue;
    if (await verificarPermissaoEstabelecimento(userId, id, acao)) {
      autorizados.push({
        id,
        nome: r.nome,
        cnpj: r.cnpj,
        cnes: r.cnes,
      });
    }
  }
  return autorizados;
}

export const rpaRouter = router({
  /**
   * Executa um robô RPA específico para buscar demonstrativos (exigindo hospital proprietário e URL HTTPS aprovada)
   */
  executarRoboBuscaDemonstrativo: protectedProcedure
    .input(
      z.object({
        convenioNome: z.enum(["UNIMED", "SAUDE_CAIXA", "IPASGO", "CASSI"]),
        estabelecimentoId: z.number().int().positive(),
        convenioId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        codigoPrestadorOperadora: z.string().trim().min(1).max(80),
        registroAns: z.string().trim().regex(/^\d{1,20}$/).optional(),
        url: z.string().url("URL inválida"),
        login: z.string().optional(),
        senha: z.string().optional(),
        competencia: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const estabId = await exigirAcessoHospitalRpa(
        ctx.user.id,
        input.estabelecimentoId,
        "editar"
      );

      try {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não disponível");

        // A identidade vem do cadastro por ID, nunca do primeiro nome/credencial.
        const cadastrados = await db.select().from(convenios)
          .where(eq(convenios.id, input.convenioId)).limit(2);
        if (cadastrados.length !== 1) throw new Error("Convênio ausente ou ambíguo");
        const convenioCanonico = cadastrados[0];
        const scope = {
          estabelecimentoId: estabId,
          convenioId: input.convenioId,
          codigoPrestadorOperadora: input.codigoPrestadorOperadora,
          registroAns: input.registroAns,
        };
        validarConvenioRpa(scope, convenioCanonico);
        const nomeCanonico = convenioCanonico.nome.normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "").toUpperCase();
        const operadoras = {
          UNIMED: /\bUNIMED\b/,
          SAUDE_CAIXA: /\bSAUDE[\s_-]+CAIXA\b/,
          IPASGO: /\bIPASGO\b/,
          CASSI: /\bCASSI\b/,
        };
        if (!operadoras[input.convenioNome].test(nomeCanonico)) {
          throw new Error("Operadora incompatível com o convênio cadastrado");
        }
        const vinculos = await db.select().from(convenioEstabelecimentoPrestador)
          .where(and(
            eq(convenioEstabelecimentoPrestador.estabelecimentoId, estabId),
            eq(convenioEstabelecimentoPrestador.convenioId, input.convenioId),
            eq(convenioEstabelecimentoPrestador.ativo, "sim")
          ));
        validarCodigoPrestadorRpa(scope, input.codigoPrestadorOperadora, vinculos);
        const registroAns = convenioCanonico.registroAns?.replace(/\D/g, "") || undefined;
        const operadoraPorAns: Record<string, string> = {
          "382876": "UNIMED", "417548": "IPASGO", "000000": "IPASGO",
          "346659": "CASSI", "312924": "SAUDE_CAIXA",
        };
        if (registroAns && operadoraPorAns[registroAns] && operadoraPorAns[registroAns] !== input.convenioNome) {
          throw new Error("Registro ANS canônico incompatível com a operadora");
        }

        let finalUrl = validarUrlPortalConvenio(input.url, input.convenioNome, registroAns);
        let finalLogin = input.login?.trim();
        let finalSenha = input.senha?.trim();
        let credencialUtilizadaId: number | undefined;

        // Se não forneceu login/senha manualmente, busca exclusivamente da credencial proprietária deste hospital
        if (!finalLogin || !finalSenha) {
          const creds = await db.select().from(credenciaisPortais).where(and(
            eq(credenciaisPortais.convenioId, input.convenioId),
            eq(credenciaisPortais.estabelecimentoId, estabId),
            eq(credenciaisPortais.codigoPrestadorOperadora, input.codigoPrestadorOperadora),
            eq(credenciaisPortais.ativo, "sim"),
            eq(credenciaisPortais.statusCredencial, "ATIVA"),
            finalLogin ? eq(credenciaisPortais.login, finalLogin) : undefined
          )).limit(2);
          if (creds.length !== 1) throw new Error("Credencial ausente ou ambígua");
          const cred = creds[0];
          if (cred.estabelecimentoId !== estabId || cred.convenioId !== input.convenioId ||
              cred.ativo !== "sim" || cred.statusCredencial !== "ATIVA" ||
              cred.codigoPrestadorOperadora?.trim() !== input.codigoPrestadorOperadora ||
              (finalLogin && cred.login !== finalLogin)) {
            throw new Error("Credencial incompatível com o escopo autorizado");
          }
          validarConvenioRpa({ ...scope, registroAns: cred.registroAns }, convenioCanonico);
          if (cred.urlLogin) finalUrl = validarUrlPortalConvenio(cred.urlLogin, input.convenioNome, registroAns);
          if (!finalLogin) finalLogin = cred.login;
          if (!finalSenha) finalSenha = obterSenhaParaRobo(cred.senha);
          credencialUtilizadaId = cred.id;
        }

        if (!finalLogin || !finalSenha) {
          throw new Error(
            "Credenciais proprietárias não encontradas no Cofre de Senhas para este hospital e convênio."
          );
        }

        // Construir apenas depois de todas as verificações, inclusive com login manual.
        const construtores = {
          UNIMED: RoboUnimed, SAUDE_CAIXA: RoboSaudeCaixa,
          IPASGO: RoboIpasgo, CASSI: RoboCassi,
        };
        const robo = new construtores[input.convenioNome]();
        logger.info({
          message: `Iniciando execução manual do robô ${input.convenioNome} (Estab #${estabId})`,
        });

        const resultado = await robo.executar(
          {
            url: finalUrl,
            login: finalLogin,
            senha: finalSenha,
            estabelecimentoId: estabId,
            convenioId: input.convenioId,
            codigoPrestadorOperadora: input.codigoPrestadorOperadora,
            registroAns,
          },
          {
            competencia: input.competencia || "",
          }
        );

        try {
          if (credencialUtilizadaId !== undefined) {
            await db
              .update(credenciaisPortais)
              .set({
                ultimoAcesso: new Date(),
                statusAcesso: "sucesso",
                statusCredencial: "ATIVA",
              })
              .where(
                and(
                  eq(credenciaisPortais.id, credencialUtilizadaId),
                  eq(credenciaisPortais.estabelecimentoId, estabId),
                  eq(credenciaisPortais.convenioId, input.convenioId),
                  eq(credenciaisPortais.codigoPrestadorOperadora, input.codigoPrestadorOperadora)
                )
              );
          }
        } catch {}

        return {
          sucesso: true,
          // Não devolver paths privados, screenshots autenticadas ou DTOs de credenciais.
          resultado: {
            status: "sucesso",
            mensagem: "Execução do robô finalizada.",
            arquivosBaixados: resultado && "arquivosBaixados" in resultado ? Number(resultado.arquivosBaixados) || 0 : 0,
          },
        };
      } catch (error: any) {
        logger.error({
          message: `Falha na execução do robô RPA ${input.convenioNome}`,
        });
        throw new TRPCError({ code: "BAD_REQUEST", message: "Execução RPA recusada; verifique o escopo e as credenciais autorizadas." });
      }
    }),

  /**
   * Lista os estabelecimentos (Hospitais/Clínicas) autorizados para o usuário logado
   */
  listarEstabelecimentos: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    return listarHospitaisAutorizadosRpa(db, ctx.user.id, "visualizar");
  }),

  /**
   * Lista as credenciais de acesso aos portais restritas aos hospitais autorizados do usuário (sem expor a senha)
   */
  listarCredenciais: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");

    const hospitaisAutorizados = await listarHospitaisAutorizadosRpa(
      db,
      ctx.user.id,
      "visualizar"
    );
    const idsAutorizados = hospitaisAutorizados.map((h) => h.id);
    if (idsAutorizados.length === 0) {
      return [];
    }

    const rows = await db
      .select({
        id: credenciaisPortais.id,
        convenioId: credenciaisPortais.convenioId,
        convenioNome: convenios.nome,
        convenioRegistroAns: convenios.registroAns,
        estabelecimentoId: credenciaisPortais.estabelecimentoId,
        estabelecimentoNome: estabelecimentos.nome,
        estabelecimentoCnpj: estabelecimentos.cnpj,
        codigoPrestadorOperadora: credenciaisPortais.codigoPrestadorOperadora,
        registroAns: credenciaisPortais.registroAns,
        login: credenciaisPortais.login,
        senhaArmazenada: credenciaisPortais.senha,
        urlLogin: credenciaisPortais.urlLogin,
        parametrosExtras: credenciaisPortais.parametrosExtras,
        statusCredencial: credenciaisPortais.statusCredencial,
        ativo: credenciaisPortais.ativo,
        ultimoAcesso: credenciaisPortais.ultimoAcesso,
        statusAcesso: credenciaisPortais.statusAcesso,
        mensagemErro: credenciaisPortais.mensagemErro,
      })
      .from(credenciaisPortais)
      .leftJoin(convenios, eq(credenciaisPortais.convenioId, convenios.id))
      .leftJoin(
        estabelecimentos,
        eq(credenciaisPortais.estabelecimentoId, estabelecimentos.id)
      )
      .where(inArray(credenciaisPortais.estabelecimentoId, idsAutorizados));

    return rows.map((r) => ({
      id: r.id,
      convenioId: r.convenioId,
      convenioNome: r.convenioNome,
      estabelecimentoId: r.estabelecimentoId,
      estabelecimentoNome: r.estabelecimentoNome || `Hospital #${r.estabelecimentoId}`,
      estabelecimentoCnpj: r.estabelecimentoCnpj,
      codigoPrestadorOperadora: r.codigoPrestadorOperadora || "",
      registroAns: r.registroAns || r.convenioRegistroAns || "",
      login: r.login,
      urlLogin: r.urlLogin,
      parametrosExtras: (r.parametrosExtras as Record<string, any>) || {},
      statusCredencial: r.statusCredencial || "ATIVA",
      ativo: r.ativo,
      ultimoAcesso: r.ultimoAcesso,
      statusAcesso: r.statusAcesso,
      mensagemErro: r.mensagemErro,
      criptografadaAes256: estaCriptografadaNoCofre(r.senhaArmazenada),
    }));
  }),

  /**
   * Lista todos os convênios disponíveis para o dropdown
   */
  listarConvenios: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");

    const result = await db
      .select({
        id: convenios.id,
        nome: convenios.nome,
        codigo: convenios.codigo,
        registroAns: convenios.registroAns,
        estabelecimentoId: convenios.estabelecimentoId,
      })
      .from(convenios)
      .where(eq(convenios.ativo, "sim"))
      .orderBy(convenios.nome);

    return result;
  }),

  /**
   * Salva ou atualiza uma credencial de acesso no Cofre Criptografado (AES-256-GCM)
   * Exige hospital proprietário explícito, chave dedicada e URL HTTPS aprovada por convênio.
   */
  salvarCredencial: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        estabelecimentoId: z.number().int().positive("Selecione o hospital proprietário da credencial"),
        convenioId: z.number().int().positive(),
        codigoPrestadorOperadora: z.string().optional().nullable(),
        registroAns: z.string().optional().nullable(),
        login: z.string().min(1, "Informe o login do portal"),
        senha: z.string().optional(),
        urlLogin: z.string().optional().nullable(),
        parametrosExtras: z.record(z.string(), z.any()).optional().nullable(),
        ativo: z.enum(["sim", "nao"]).optional().default("sim"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!cofreRpaKeyAvailable()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "A chave exclusiva do Cofre RPA (RPA_COFRE_SECRET_KEY) não está configurada.",
        });
      }

      const estabIdFinal = await exigirAcessoHospitalRpa(
        ctx.user.id,
        input.estabelecimentoId,
        "editar"
      );

      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");

      const [conv] = await db
        .select()
        .from(convenios)
        .where(eq(convenios.id, input.convenioId))
        .limit(1);
      if (!conv) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Convênio não encontrado.",
        });
      }

      const codPrestLimpo = input.codigoPrestadorOperadora?.trim() || null;
      const ansLimpo = input.registroAns?.trim() || conv.registroAns || null;

      let urlValidada: string | null = null;
      if (input.urlLogin && input.urlLogin.trim() !== "") {
        try {
          urlValidada = validarUrlPortalConvenio(
            input.urlLogin.trim(),
            conv.nome,
            ansLimpo
          );
        } catch (errUrl: any) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: errUrl.message || "URL do portal não permitida.",
          });
        }
      }

      if (input.parametrosExtras?.urlEnvioXml) {
        try {
          input.parametrosExtras.urlEnvioXml = validarUrlPortalConvenio(
            String(input.parametrosExtras.urlEnvioXml),
            conv.nome,
            ansLimpo
          );
        } catch (errUrlEnvio: any) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              errUrlEnvio.message || "URL de envio XML não permitida.",
          });
        }
      }

      let credencialId = input.id;

      if (input.id) {
        const [atual] = await db
          .select()
          .from(credenciaisPortais)
          .where(eq(credenciaisPortais.id, input.id))
          .limit(1);
        if (!atual) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Credencial não encontrada.",
          });
        }

        // Comprovar propriedade da credencial existente antes de alterar
        await exigirAcessoHospitalRpa(
          ctx.user.id,
          atual.estabelecimentoId,
          "editar"
        );

        const novaSenhaInformada =
          input.senha &&
          input.senha.trim() !== "" &&
          input.senha.trim() !== "********";

        // Se mudar a URL de destino, exige re-informar a senha explicitamente para não reaproveitar segredo em outro endpoint
        const mudouUrl = (atual.urlLogin || null) !== urlValidada;
        if (mudouUrl && !novaSenhaInformada) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Ao alterar a URL do portal, informe novamente a senha da credencial por segurança.",
          });
        }

        const senhaCifrada = novaSenhaInformada
          ? salvarSenhaCofre(input.senha!.trim())
          : salvarSenhaCofre(obterSenhaParaRobo(atual.senha));

        await db
          .update(credenciaisPortais)
          .set({
            estabelecimentoId: estabIdFinal,
            convenioId: input.convenioId,
            codigoPrestadorOperadora: codPrestLimpo,
            registroAns: ansLimpo,
            login: input.login.trim(),
            senha: senhaCifrada,
            urlLogin: urlValidada,
            parametrosExtras: input.parametrosExtras || null,
            statusCredencial: "ATIVA",
            mensagemErro: null,
            ativo: input.ativo || "sim",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(credenciaisPortais.id, input.id),
              eq(credenciaisPortais.estabelecimentoId, atual.estabelecimentoId!)
            )
          );
      } else {
        if (!input.senha || input.senha.trim() === "") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A senha é obrigatória para cadastrar uma nova credencial.",
          });
        }
        const senhaCifrada = salvarSenhaCofre(input.senha.trim());
        const [result] = await db.insert(credenciaisPortais).values({
          estabelecimentoId: estabIdFinal,
          convenioId: input.convenioId,
          codigoPrestadorOperadora: codPrestLimpo,
          registroAns: ansLimpo,
          login: input.login.trim(),
          senha: senhaCifrada,
          urlLogin: urlValidada,
          parametrosExtras: input.parametrosExtras || null,
          statusCredencial: "ATIVA",
          ativo: input.ativo || "sim",
        });
        credencialId = Number((result as any).insertId);
      }

      // Sincronizar automaticamente com convenioEstabelecimentoPrestador para roteamento de XML
      if (estabIdFinal && codPrestLimpo) {
        try {
          const existentes = await db
            .select()
            .from(convenioEstabelecimentoPrestador)
            .where(
              and(
                eq(
                  convenioEstabelecimentoPrestador.estabelecimentoId,
                  estabIdFinal
                ),
                eq(
                  convenioEstabelecimentoPrestador.convenioId,
                  input.convenioId
                ),
                eq(
                  convenioEstabelecimentoPrestador.codigoPrestador,
                  codPrestLimpo
                )
              )
            );
          if (existentes.length === 0) {
            await db.insert(convenioEstabelecimentoPrestador).values({
              estabelecimentoId: estabIdFinal,
              convenioId: input.convenioId,
              codigoPrestador: codPrestLimpo,
              nomePrestador: `Prestador ${codPrestLimpo}`,
              tipoPrestador: "proprio",
              ativo: "sim",
            });
          }
        } catch {}
      }

      return { sucesso: true, id: credencialId };
    }),

  /**
   * Exclui uma credencial do Cofre comprovando propriedade do hospital
   */
  excluirCredencial: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");

      const [atual] = await db
        .select()
        .from(credenciaisPortais)
        .where(eq(credenciaisPortais.id, input.id))
        .limit(1);
      if (!atual) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Credencial não encontrada.",
        });
      }

      const estabId = await exigirAcessoHospitalRpa(
        ctx.user.id,
        atual.estabelecimentoId,
        "excluir"
      );

      await db
        .delete(credenciaisPortais)
        .where(
          and(
            eq(credenciaisPortais.id, input.id),
            eq(credenciaisPortais.estabelecimentoId, estabId)
          )
        );
      return { sucesso: true };
    }),

  /**
   * Analisa 1 ou mais arquivos XML TISS em memória (Triagem pelo <ans:cabecalho>)
   */
  analisarXmlTriagem: protectedProcedure
    .input(
      z.object({
        arquivos: z
          .array(
            z.object({
              nomeArquivo: z.string(),
              conteudoBase64: z.string(),
            })
          )
          .min(1)
          .max(50),
        estabelecimentoIdContexto: z.number().optional().nullable(),
        convenioIdForcado: z.number().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");

      if (
        input.estabelecimentoIdContexto &&
        Number(input.estabelecimentoIdContexto) !== ESTABELECIMENTO_CENTRAL_SAFATLE
      ) {
        await exigirAcessoHospitalRpa(
          ctx.user.id,
          input.estabelecimentoIdContexto,
          "visualizar"
        );
      }

      const resultados = [];
      for (const arq of input.arquivos) {
        try {
          const xmlBuffer = Buffer.from(arq.conteudoBase64, "base64");
          const ident = await identificarERotearXmlTiss(xmlBuffer, db, {
            estabelecimentoIdContexto: input.estabelecimentoIdContexto,
            convenioIdForcado: input.convenioIdForcado,
          });
          // A detecção pode apontar outro hospital mesmo no Hub Central.
          // Não retornar nomes, credenciais ou resumos antes da autorização final.
          if (ident.estabelecimentoIdDetectado) {
            await exigirAcessoHospitalRpa(
              ctx.user.id, ident.estabelecimentoIdDetectado, "visualizar"
            );
          } else {
            resultados.push({
              nomeArquivo: arq.nomeArquivo,
              valido: false,
              erro: "Hospital proprietário não identificado para autorizar a triagem.",
            });
            continue;
          }
          if (ident.conflitoHospital) {
            resultados.push({
              nomeArquivo: arq.nomeArquivo,
              valido: false,
              erro: "O XML pertence a outro hospital; use o contexto autorizado do proprietário.",
            });
            continue;
          }
          resultados.push({
            nomeArquivo: arq.nomeArquivo,
            valido: true,
            ...ident,
          });
        } catch (err: any) {
          resultados.push({
            nomeArquivo: arq.nomeArquivo,
            valido: false,
            erro: err.message || "Arquivo XML inválido",
          });
        }
      }
      return { resultados };
    }),

  /**
   * Importa 1 ou vários lotes XML para a Fila de Envio do Robô (com Trava Anti-Erro, Autorização por Hospital e Contenção de Caminho)
   */
  importarLotesXmlParaFila: protectedProcedure
    .input(
      z.object({
        arquivos: z
          .array(
            z.object({
              nomeArquivo: z.string(),
              conteudoBase64: z.string(),
              estabelecimentoIdOverride: z.number().optional().nullable(),
              convenioIdOverride: z.number().optional().nullable(),
              fabricaContaId: z.number().optional().nullable(),
            })
          )
          .min(1)
          .max(50),
        estabelecimentoIdContexto: z.number().optional().nullable(),
        liberarImediatamente: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");

      const importados: any[] = [];
      const rejeitados: any[] = [];

      for (const arq of input.arquivos) {
        try {
          const xmlBuffer = Buffer.from(arq.conteudoBase64, "base64");
          const ident = await identificarERotearXmlTiss(xmlBuffer, db, {
            estabelecimentoIdContexto: input.estabelecimentoIdContexto,
            convenioIdForcado: arq.convenioIdOverride,
          });

          // 1. Trava de Segurança Multi-Hospital (incontornável por override quando o XML pertence a outro hospital)
          if (
            ident.conflitoHospital ||
            (ident.estabelecimentoIdDetectado &&
              arq.estabelecimentoIdOverride &&
              Number(arq.estabelecimentoIdOverride) !==
                Number(ident.estabelecimentoIdDetectado))
          ) {
            rejeitados.push({
              nomeArquivo: arq.nomeArquivo,
              motivo:
                ident.mensagemConflito ||
                "Trava Multi-Hospital: O cabeçalho XML pertence a outro hospital e não pode ser redirecionado por override.",
            });
            continue;
          }

          const estabIdCandidato =
            ident.estabelecimentoIdDetectado || arq.estabelecimentoIdOverride;
          const convIdFinal =
            arq.convenioIdOverride || ident.convenioIdDetectado;

          if (!estabIdCandidato) {
            rejeitados.push({
              nomeArquivo: arq.nomeArquivo,
              motivo: `Hospital não identificado automaticamente para o Prestador "${ident.codigoPrestadorXml || ident.cnpjPrestadorXml || "N/A"}" (ANS: ${ident.registroAns || "N/A"}). Selecione o hospital ou cadastre o Código do Prestador no Cofre.`,
            });
            continue;
          }

          const estabIdFinal = await exigirAcessoHospitalRpa(
            ctx.user.id,
            estabIdCandidato,
            "editar"
          );

          if (!convIdFinal || !Number.isSafeInteger(Number(convIdFinal)) || Number(convIdFinal) <= 0) {
            rejeitados.push({
              nomeArquivo: arq.nomeArquivo,
              motivo: `Convênio não identificado para o Registro ANS "${ident.registroAns || "N/A"}". Selecione o convênio ou cadastre o Registro ANS no Cofre.`,
            });
            continue;
          }

          // Preparar bytes fora da transação; identidade não depende do nome/usuário.
          const { pastaDestino, caminhoCompleto } = resolverCaminhoSeguroXmlRpa(
            process.cwd(),
            estabIdFinal,
            Number(convIdFinal),
            ident.hashXml
          );
          if (!fs.existsSync(pastaDestino)) {
            fs.mkdirSync(pastaDestino, { recursive: true });
          }
          validarCaminhoContidoXmlRpa(process.cwd(), caminhoCompleto);
          // Nunca truncar o arquivo já referenciado por uma identidade persistida.
          try {
            fs.writeFileSync(caminhoCompleto, xmlBuffer, { flag: "wx" });
          } catch (errArquivo: unknown) {
            if (!(errArquivo instanceof Error) ||
                !("code" in errArquivo) || errArquivo.code !== "EEXIST") throw errArquivo;
          }

          const numeroLoteSeguro = sanitizarNumeroLoteTiss(
            ident.numeroLote,
            ident.hashXml
          );
          const statusInicial = input.liberarImediatamente
            ? "LIBERADO_ENVIO"
            : "IMPORTADO";

          const insercao = await inserirFilaXmlAtomica(db, {
            estabelecimentoId: estabIdFinal,
            convenioId: Number(convIdFinal),
            fabricaContaId: arq.fabricaContaId || null,
            usuarioUploadId: ctx.user.id,
            usuarioUploadNome:
              ctx.user.name || ctx.user.email || `Usuário #${ctx.user.id}`,
            nomeArquivo: String(arq.nomeArquivo || "lote.xml").slice(0, 255),
            numeroLote: numeroLoteSeguro,
            versaoTiss: ident.versaoTiss,
            registroAns: ident.registroAns,
            codigoPrestadorXml: ident.codigoPrestadorXml,
            cnpjPrestadorXml: ident.cnpjPrestadorXml,
            qtdGuias: ident.qtdGuias,
            qtdItens: ident.qtdItens,
            valorTotal: String(ident.valorTotal.toFixed(2)),
            hashXml: ident.hashXml,
            caminhoArquivoXml: caminhoCompleto,
            resumoGuiasJson: ident.resumoGuias,
            statusEsteira: statusInicial,
          });

          importados.push({
            id: insercao.id,
            reutilizado: insercao.reutilizado,
            nomeArquivo: arq.nomeArquivo,
            numeroLote: insercao.numeroLote,
            estabelecimentoId: estabIdFinal,
            estabelecimentoNome: ident.estabelecimentoNomeDetectado,
            convenioId: Number(convIdFinal),
            convenioNome: ident.convenioNomeDetectado,
            qtdGuias: ident.qtdGuias,
            valorTotal: ident.valorTotal,
            statusEsteira: insercao.statusEsteira,
          });
        } catch (err: any) {
          rejeitados.push({
            nomeArquivo: arq.nomeArquivo,
            motivo: err.message || "Falha ao importar XML para a fila.",
          });
        }
      }

      return {
        sucesso: importados.length > 0,
        totalImportados: importados.length,
        totalRejeitados: rejeitados.length,
        importados,
        rejeitados,
      };
    }),

  /**
   * Lista a Fila de Envio de Lotes XML restrita aos hospitais autorizados para o usuário
   */
  listarFilaEnvioXml: protectedProcedure
    .input(
      z
        .object({
          estabelecimentoId: z.number().optional().nullable(),
          convenioId: z.number().optional().nullable(),
          statusEsteira: z.string().optional().nullable(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");

      const hospitaisAutorizados = await listarHospitaisAutorizadosRpa(
        db,
        ctx.user.id,
        "visualizar"
      );
      const idsAutorizados = hospitaisAutorizados.map((h) => h.id);

      if (
        input?.estabelecimentoId &&
        Number(input.estabelecimentoId) !== ESTABELECIMENTO_CENTRAL_SAFATLE
      ) {
        await exigirAcessoHospitalRpa(
          ctx.user.id,
          input.estabelecimentoId,
          "visualizar"
        );
      }

      if (idsAutorizados.length === 0) {
        return {
          itens: [],
          resumo: {
            totalLotes: 0,
            aguardandoLiberacao: 0,
            naFilaRobo: 0,
            simuladosOk: 0,
            protocolados: 0,
            comErro: 0,
            valorTotalFila: 0,
          },
        };
      }

      const rows = await db
        .select({
          id: filaEnvioXmlPortal.id,
          estabelecimentoId: filaEnvioXmlPortal.estabelecimentoId,
          estabelecimentoNome: estabelecimentos.nome,
          convenioId: filaEnvioXmlPortal.convenioId,
          convenioNome: convenios.nome,
          fabricaContaId: filaEnvioXmlPortal.fabricaContaId,
          usuarioUploadNome: filaEnvioXmlPortal.usuarioUploadNome,
          nomeArquivo: filaEnvioXmlPortal.nomeArquivo,
          numeroLote: filaEnvioXmlPortal.numeroLote,
          versaoTiss: filaEnvioXmlPortal.versaoTiss,
          registroAns: filaEnvioXmlPortal.registroAns,
          codigoPrestadorXml: filaEnvioXmlPortal.codigoPrestadorXml,
          qtdGuias: filaEnvioXmlPortal.qtdGuias,
          qtdItens: filaEnvioXmlPortal.qtdItens,
          valorTotal: filaEnvioXmlPortal.valorTotal,
          statusEsteira: filaEnvioXmlPortal.statusEsteira,
          modoExecucao: filaEnvioXmlPortal.modoExecucao,
          protocoloRetorno: filaEnvioXmlPortal.protocoloRetorno,
          mensagemPortal: filaEnvioXmlPortal.mensagemPortal,
          comprovanteUrl: filaEnvioXmlPortal.comprovanteUrl,
          possuiEvidencia: filaEnvioXmlPortal.screenshotBase64,
          tentativas: filaEnvioXmlPortal.tentativas,
          enviadoEm: filaEnvioXmlPortal.enviadoEm,
          createdAt: filaEnvioXmlPortal.createdAt,
        })
        .from(filaEnvioXmlPortal)
        .leftJoin(
          estabelecimentos,
          eq(filaEnvioXmlPortal.estabelecimentoId, estabelecimentos.id)
        )
        .leftJoin(convenios, eq(filaEnvioXmlPortal.convenioId, convenios.id))
        .where(inArray(filaEnvioXmlPortal.estabelecimentoId, idsAutorizados))
        .orderBy(desc(filaEnvioXmlPortal.id));

      const filtrados = rows.filter((r) => {
        if (
          input?.estabelecimentoId &&
          Number(input.estabelecimentoId) !== ESTABELECIMENTO_CENTRAL_SAFATLE &&
          Number(r.estabelecimentoId) !== Number(input.estabelecimentoId)
        ) {
          return false;
        }
        if (
          input?.convenioId &&
          Number(r.convenioId) !== Number(input.convenioId)
        ) {
          return false;
        }
        if (
          input?.statusEsteira &&
          input.statusEsteira !== "TODOS" &&
          r.statusEsteira !== input.statusEsteira
        ) {
          return false;
        }
        return true;
      });

      const resumo = {
        totalLotes: filtrados.length,
        aguardandoLiberacao: filtrados.filter(
          (r) => r.statusEsteira === "IMPORTADO"
        ).length,
        naFilaRobo: filtrados.filter(
          (r) => r.statusEsteira === "LIBERADO_ENVIO"
        ).length,
        simuladosOk: filtrados.filter((r) => r.statusEsteira === "SIMULADO_OK")
          .length,
        protocolados: filtrados.filter((r) => r.statusEsteira === "PROTOCOLADO")
          .length,
        comErro: filtrados.filter((r) =>
          ["ERRO_PORTAL", "ERRO_ROBO", "ERRO_CREDENCIAL"].includes(
            r.statusEsteira
          )
        ).length,
        valorTotalFila: filtrados.reduce(
          (acc, r) => acc + Number(r.valorTotal || 0),
          0
        ),
      };

      return {
        itens: filtrados.map((r) => ({
          ...r,
          valorTotal: Number(r.valorTotal || 0),
          possuiEvidencia: Boolean(r.possuiEvidencia || r.comprovanteUrl),
        })),
        resumo,
      };
    }),

  /**
   * Obtém detalhes completos de um lote na fila comprovando autorização no hospital proprietário
   */
  obterDetalhesLoteFila: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");

      const [lote] = await db
        .select({
          id: filaEnvioXmlPortal.id,
          estabelecimentoId: filaEnvioXmlPortal.estabelecimentoId,
          estabelecimentoNome: estabelecimentos.nome,
          convenioId: filaEnvioXmlPortal.convenioId,
          convenioNome: convenios.nome,
          nomeArquivo: filaEnvioXmlPortal.nomeArquivo,
          numeroLote: filaEnvioXmlPortal.numeroLote,
          versaoTiss: filaEnvioXmlPortal.versaoTiss,
          registroAns: filaEnvioXmlPortal.registroAns,
          codigoPrestadorXml: filaEnvioXmlPortal.codigoPrestadorXml,
          cnpjPrestadorXml: filaEnvioXmlPortal.cnpjPrestadorXml,
          qtdGuias: filaEnvioXmlPortal.qtdGuias,
          qtdItens: filaEnvioXmlPortal.qtdItens,
          valorTotal: filaEnvioXmlPortal.valorTotal,
          statusEsteira: filaEnvioXmlPortal.statusEsteira,
          modoExecucao: filaEnvioXmlPortal.modoExecucao,
          protocoloRetorno: filaEnvioXmlPortal.protocoloRetorno,
          mensagemPortal: filaEnvioXmlPortal.mensagemPortal,
          comprovanteUrl: filaEnvioXmlPortal.comprovanteUrl,
          screenshotBase64: filaEnvioXmlPortal.screenshotBase64,
          resumoGuiasJson: filaEnvioXmlPortal.resumoGuiasJson,
          tentativas: filaEnvioXmlPortal.tentativas,
          enviadoEm: filaEnvioXmlPortal.enviadoEm,
          createdAt: filaEnvioXmlPortal.createdAt,
        })
        .from(filaEnvioXmlPortal)
        .leftJoin(
          estabelecimentos,
          eq(filaEnvioXmlPortal.estabelecimentoId, estabelecimentos.id)
        )
        .leftJoin(convenios, eq(filaEnvioXmlPortal.convenioId, convenios.id))
        .where(eq(filaEnvioXmlPortal.id, input.id))
        .limit(1);

      if (!lote) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lote não encontrado na fila.",
        });
      }

      await exigirAcessoHospitalRpa(
        ctx.user.id,
        lote.estabelecimentoId,
        "visualizar"
      );

      return {
        ...lote,
        valorTotal: Number(lote.valorTotal || 0),
        resumoGuias: Array.isArray(lote.resumoGuiasJson)
          ? lote.resumoGuiasJson
          : [],
      };
    }),

  /**
   * Coloca lotes elegíveis (IMPORTADO, SIMULADO_OK ou ERRO_*) em LIBERADO_ENVIO.
   * Recusa lotes em PROCESSANDO_ROBO, PROTOCOLADO ou AGUARDANDO_PORTAL e valida permissão por hospital.
   */
  liberarLotesParaRobo: protectedProcedure
    .input(
      z.object({
        loteIds: z.array(z.number().int().positive()).min(1).max(100),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");

      const lotes = await db
        .select()
        .from(filaEnvioXmlPortal)
        .where(inArray(filaEnvioXmlPortal.id, input.loteIds));

      if (lotes.length !== input.loteIds.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Um ou mais lotes selecionados não foram encontrados.",
        });
      }

      for (const lote of lotes) {
        await exigirAcessoHospitalRpa(
          ctx.user.id,
          lote.estabelecimentoId,
          "editar"
        );
        if (
          !(ESTADOS_ELEGIVEIS_LIBERACAO as readonly string[]).includes(
            lote.statusEsteira
          )
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Lote #${lote.id} (${lote.numeroLote}) está em "${lote.statusEsteira}" e não pode ser reliberado sem reconciliação.`,
          });
        }
      }

      const liberacao = await db
        .update(filaEnvioXmlPortal)
        .set({
          statusEsteira: "LIBERADO_ENVIO",
        })
        .where(
          and(
            inArray(filaEnvioXmlPortal.id, input.loteIds),
            inArray(filaEnvioXmlPortal.estabelecimentoId, lotes.map((lote) => lote.estabelecimentoId)),
            inArray(
              filaEnvioXmlPortal.statusEsteira,
              [...ESTADOS_ELEGIVEIS_LIBERACAO]
            )
          )
        );
      exigirMutacaoFilaCompleta(liberacao, input.loteIds.length);

      return {
        sucesso: true,
        mensagem: `${input.loteIds.length} lote(s) liberado(s) para a fila do robô.`,
      };
    }),

  /**
   * Dispara o Ciclo do Robô RPA (Agrupado por Sessão Hospital + Convênio)
   * Valida autorização hospitalar e máquina de estados antes do claim atômico.
   */
  dispararCicloEnvioRpa: protectedProcedure
    .input(
      z.object({
        loteIds: z.array(z.number().int().positive()).optional(),
        modoExecucao: z.enum(["simulacao", "producao"]).default("simulacao"),
        estabelecimentoIdFiltro: z.number().optional().nullable(),
        convenioIdFiltro: z.number().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");

      const hospitaisEditaveis = await listarHospitaisAutorizadosRpa(
        db,
        ctx.user.id,
        "editar"
      );
      const idsAutorizados = hospitaisEditaveis.map((h) => h.id);
      if (idsAutorizados.length === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Usuário sem permissão para disparar ciclo RPA em nenhum hospital.",
        });
      }

      if (
        input.estabelecimentoIdFiltro &&
        Number(input.estabelecimentoIdFiltro) !== ESTABELECIMENTO_CENTRAL_SAFATLE
      ) {
        await exigirAcessoHospitalRpa(
          ctx.user.id,
          input.estabelecimentoIdFiltro,
          "editar"
        );
      }

      if (input.loteIds && input.loteIds.length > 0) {
        const lotesAlvo = await db
          .select()
          .from(filaEnvioXmlPortal)
          .where(inArray(filaEnvioXmlPortal.id, input.loteIds));

        if (lotesAlvo.length !== input.loteIds.length) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Um ou mais lotes selecionados não foram encontrados.",
          });
        }

        for (const lote of lotesAlvo) {
          await exigirAcessoHospitalRpa(
            ctx.user.id,
            lote.estabelecimentoId,
            "editar"
          );
          if (
            ["PROCESSANDO_ROBO", "PROTOCOLADO", "AGUARDANDO_PORTAL"].includes(
              lote.statusEsteira
            )
          ) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `Lote #${lote.id} (${lote.numeroLote}) está em "${lote.statusEsteira}" e não pode ser reenviado.`,
            });
          }
        }

        await db
          .update(filaEnvioXmlPortal)
          .set({ statusEsteira: "LIBERADO_ENVIO" })
          .where(
            and(
              inArray(filaEnvioXmlPortal.id, input.loteIds),
              inArray(
                filaEnvioXmlPortal.statusEsteira,
                [...ESTADOS_ELEGIVEIS_LIBERACAO]
              )
            )
          );
      }

      const resultado = await executarCicloEnvioXmlRpa({
        loteIds: input.loteIds,
        modoExecucao: input.modoExecucao,
        estabelecimentoIdFiltro:
          input.estabelecimentoIdFiltro &&
          Number(input.estabelecimentoIdFiltro) !== ESTABELECIMENTO_CENTRAL_SAFATLE
            ? Number(input.estabelecimentoIdFiltro)
            : null,
        convenioIdFiltro: input.convenioIdFiltro,
        estabelecimentosAutorizadosIds: idsAutorizados,
        usuarioIdExecutor: ctx.user.id,
        usuarioNomeExecutor:
          ctx.user.name || ctx.user.email || `Usuário #${ctx.user.id}`,
      });

      return resultado;
    }),

  /**
   * Exclui um lote da fila de envio comprovando propriedade e impedindo exclusão de lotes em processamento/protocolados
   */
  excluirLoteFila: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");

      const [lote] = await db
        .select()
        .from(filaEnvioXmlPortal)
        .where(eq(filaEnvioXmlPortal.id, input.id))
        .limit(1);

      if (!lote) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lote não encontrado na fila.",
        });
      }

      const estabId = await exigirAcessoHospitalRpa(
        ctx.user.id,
        lote.estabelecimentoId,
        "excluir"
      );

      if (
        (ESTADOS_BLOQUEADOS_EXCLUSAO as readonly string[]).includes(
          lote.statusEsteira
        )
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Não é permitido excluir lote no estado "${lote.statusEsteira}".`,
        });
      }

      const exclusao = await db
        .delete(filaEnvioXmlPortal)
        .where(
          and(
            eq(filaEnvioXmlPortal.id, input.id),
            eq(filaEnvioXmlPortal.estabelecimentoId, estabId),
            inArray(
              filaEnvioXmlPortal.statusEsteira,
              [...ESTADOS_ELEGIVEIS_LIBERACAO, "LIBERADO_ENVIO"]
            )
          )
        );
      exigirMutacaoFilaCompleta(exclusao, 1);
      return { sucesso: true };
    }),
});
