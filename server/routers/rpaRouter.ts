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

        let robo;
        switch (input.convenioNome) {
          case "SAUDE_CAIXA":
            robo = new RoboSaudeCaixa();
            break;
          case "UNIMED":
            robo = new RoboUnimed();
            break;
          case "IPASGO":
            robo = new RoboIpasgo();
            break;
          case "CASSI":
            robo = new RoboCassi();
            break;
          default:
            throw new Error(
              `Robô para o convênio ${input.convenioNome} não implementado.`
            );
        }

        let finalUrl = validarUrlPortalConvenio(input.url, input.convenioNome);
        let finalLogin = input.login?.trim();
        let finalSenha = input.senha?.trim();

        // Se não forneceu login/senha manualmente, busca exclusivamente da credencial proprietária deste hospital
        if (!finalLogin || !finalSenha) {
          let searchNome: string = input.convenioNome;
          if (input.convenioNome === "UNIMED") searchNome = "Unimed Goiânia";
          else if (input.convenioNome === "SAUDE_CAIXA") searchNome = "Saúde Caixa";
          else if (input.convenioNome === "IPASGO") searchNome = "IPASGO";
          else if (input.convenioNome === "CASSI") searchNome = "CASSI";

          const conveniosDb = await db
            .select()
            .from(convenios)
            .where(eq(convenios.nome, searchNome));

          if (conveniosDb.length === 0 && input.convenioNome === "UNIMED") {
            const conveniosDb2 = await db
              .select()
              .from(convenios)
              .where(eq(convenios.nome, "Unimed"));
            if (conveniosDb2.length > 0) conveniosDb.push(conveniosDb2[0]);
          }

          if (conveniosDb.length > 0) {
            const creds = await db
              .select()
              .from(credenciaisPortais)
              .where(
                and(
                  eq(credenciaisPortais.convenioId, conveniosDb[0].id),
                  eq(credenciaisPortais.estabelecimentoId, estabId)
                )
              );

            const credEscolhida = creds[0];
            if (credEscolhida) {
              if (!finalLogin) finalLogin = credEscolhida.login;
              if (!finalSenha) finalSenha = obterSenhaParaRobo(credEscolhida.senha);
              if (credEscolhida.urlLogin) {
                finalUrl = validarUrlPortalConvenio(
                  credEscolhida.urlLogin,
                  input.convenioNome,
                  credEscolhida.registroAns
                );
              }
            }
          }
        }

        if (!finalLogin || !finalSenha) {
          throw new Error(
            "Credenciais proprietárias não encontradas no Cofre de Senhas para este hospital e convênio."
          );
        }

        logger.info({
          message: `Iniciando execução manual do robô ${input.convenioNome} (Estab #${estabId})`,
        });

        const resultado = await robo.executar(
          {
            url: finalUrl,
            login: finalLogin,
            senha: finalSenha,
            estabelecimentoId: estabId,
          },
          {
            competencia: input.competencia || "",
          }
        );

        try {
          if (finalLogin) {
            await db
              .update(credenciaisPortais)
              .set({
                ultimoAcesso: new Date(),
                statusAcesso: "sucesso",
                statusCredencial: "ATIVA",
              })
              .where(
                and(
                  eq(credenciaisPortais.login, finalLogin),
                  eq(credenciaisPortais.estabelecimentoId, estabId)
                )
              );
          }
        } catch {}

        return {
          sucesso: true,
          resultado,
        };
      } catch (error: any) {
        logger.error({
          message: `Falha na execução do robô RPA ${input.convenioNome}`,
          error: error.message,
        });
        throw error;
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

          // 2. Verificar duplicidade pelo Hash SHA-256 no mesmo Hospital + Convênio
          const duplicados = await db
            .select()
            .from(filaEnvioXmlPortal)
            .where(
              and(
                eq(filaEnvioXmlPortal.estabelecimentoId, estabIdFinal),
                eq(filaEnvioXmlPortal.convenioId, Number(convIdFinal)),
                eq(filaEnvioXmlPortal.hashXml, ident.hashXml)
              )
            );

          const dupAtivo = duplicados.find(
            (d) =>
              !["ERRO_PORTAL", "ERRO_ROBO", "ERRO_CREDENCIAL"].includes(
                d.statusEsteira
              )
          );
          if (dupAtivo) {
            rejeitados.push({
              nomeArquivo: arq.nomeArquivo,
              motivo: `Arquivo XML idêntico (Lote ${ident.numeroLote}) já consta na fila com status "${dupAtivo.statusEsteira}".`,
            });
            continue;
          }

          // 3. Salvar XML em diretório privado contido usando identificador interno seguro
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
          fs.writeFileSync(caminhoCompleto, xmlBuffer);

          const numeroLoteSeguro = sanitizarNumeroLoteTiss(
            ident.numeroLote,
            ident.hashXml
          );
          const statusInicial = input.liberarImediatamente
            ? "LIBERADO_ENVIO"
            : "IMPORTADO";

          const [ins] = await db.insert(filaEnvioXmlPortal).values({
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
            id: Number((ins as any).insertId),
            nomeArquivo: arq.nomeArquivo,
            numeroLote: numeroLoteSeguro,
            estabelecimentoId: estabIdFinal,
            estabelecimentoNome: ident.estabelecimentoNomeDetectado,
            convenioId: Number(convIdFinal),
            convenioNome: ident.convenioNomeDetectado,
            qtdGuias: ident.qtdGuias,
            valorTotal: ident.valorTotal,
            statusEsteira: statusInicial,
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

      await db
        .update(filaEnvioXmlPortal)
        .set({
          statusEsteira: "LIBERADO_ENVIO",
        })
        .where(
          and(
            inArray(filaEnvioXmlPortal.id, input.loteIds),
            inArray(
              filaEnvioXmlPortal.statusEsteira,
              [...ESTADOS_ELEGIVEIS_LIBERACAO]
            )
          )
        );

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

      await db
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
      return { sucesso: true };
    }),
});
