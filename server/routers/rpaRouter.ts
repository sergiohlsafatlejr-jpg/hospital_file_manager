import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import fs from "fs";
import path from "path";
import { RoboSaudeCaixa } from "../rpa/robos/RoboSaudeCaixa";
import { RoboUnimed } from "../rpa/robos/RoboUnimed";
import { RoboIpasgo } from "../rpa/robos/RoboIpasgo";
import { RoboCassi } from "../rpa/robos/RoboCassi";
import { logger } from "../_core/logger";
import { getDb } from "../db";
import {
  credenciaisPortais,
  convenios,
  convenioEstabelecimentoPrestador,
  estabelecimentos,
  filaEnvioXmlPortal,
} from "../../drizzle/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  estaCriptografadaNoCofre,
  obterSenhaParaRobo,
  salvarSenhaCofre,
} from "../rpa/cofreCredenciais";
import { identificarERotearXmlTiss } from "../rpa/identificadorXmlTiss";
import {
  executarCicloEnvioXmlRpa,
  garantirTabelasRpaEnvio,
} from "../rpa/rpaEnvioService";
import { ESTABELECIMENTO_CENTRAL_SAFATLE } from "../hospitalScope";

export const rpaRouter = router({
  /**
   * Executa um robô RPA específico para buscar demonstrativos
   */
  executarRoboBuscaDemonstrativo: protectedProcedure
    .input(
      z.object({
        convenioNome: z.enum(["UNIMED", "SAUDE_CAIXA", "IPASGO", "CASSI"]),
        estabelecimentoId: z.number().optional().nullable(),
        url: z.string().url("URL inválida"),
        login: z.string().optional(),
        senha: z.string().optional(),
        competencia: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const db = await getDb();
        if (db) await garantirTabelasRpaEnvio(db);

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

        let finalUrl = input.url;
        let finalLogin = input.login;
        let finalSenha = input.senha;
        let finalEstabelecimentoId: number | null =
          input.estabelecimentoId || null;

        // Se não forneceu login/senha manualmente, busca do Cofre de Senhas (respeitando estabelecimentoId se informado)
        if (!finalLogin || !finalSenha) {
          if (db) {
            let searchNome = input.convenioNome;
            if (input.convenioNome === "UNIMED") searchNome = "Unimed Goiânia";
            else if (input.convenioNome === "SAUDE_CAIXA")
              searchNome = "Saúde Caixa";
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
                .where(eq(credenciaisPortais.convenioId, conveniosDb[0].id));

              const credEscolhida =
                (finalEstabelecimentoId
                  ? creds.find(
                      (c) =>
                        Number(c.estabelecimentoId) ===
                        Number(finalEstabelecimentoId)
                    )
                  : null) || creds[0];

              if (credEscolhida) {
                if (!finalLogin) finalLogin = credEscolhida.login;
                if (!finalSenha)
                  finalSenha = obterSenhaParaRobo(credEscolhida.senha);
                finalEstabelecimentoId = credEscolhida.estabelecimentoId;
                if (credEscolhida.urlLogin) {
                  finalUrl = credEscolhida.urlLogin;
                }
              }
            }
          }
        }

        if (!finalLogin || !finalSenha) {
          throw new Error(
            "Credenciais não fornecidas e não encontradas no Cofre de Senhas para este convênio/hospital."
          );
        }

        logger.info({
          message: `Iniciando execução manual do robô ${input.convenioNome}`,
        });

        const resultado = await robo.executar(
          {
            url: finalUrl,
            login: finalLogin,
            senha: finalSenha,
            estabelecimentoId: finalEstabelecimentoId,
          },
          {
            competencia: input.competencia || "",
          }
        );

        try {
          if (db && finalLogin) {
            await db
              .update(credenciaisPortais)
              .set({
                ultimoAcesso: new Date(),
                statusAcesso: "sucesso",
                statusCredencial: "ATIVA",
              })
              .where(eq(credenciaisPortais.login, finalLogin));
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
   * Lista os estabelecimentos (Hospitais/Clínicas) ativos para vincular credenciais e filtrar lotes
   */
  listarEstabelecimentos: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    await garantirTabelasRpaEnvio(db);

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

    return rows.filter(
      (r) => Number(r.id) !== ESTABELECIMENTO_CENTRAL_SAFATLE
    );
  }),

  /**
   * Lista as credenciais de acesso aos portais dos convênios (sem expor a senha)
   */
  listarCredenciais: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    await garantirTabelasRpaEnvio(db);

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
      );

    return rows.map((r) => ({
      id: r.id,
      convenioId: r.convenioId,
      convenioNome: r.convenioNome,
      estabelecimentoId: r.estabelecimentoId,
      estabelecimentoNome: r.estabelecimentoNome || "Global (Todos os Hospitais)",
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
   */
  salvarCredencial: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        estabelecimentoId: z.number().optional().nullable(),
        convenioId: z.number(),
        codigoPrestadorOperadora: z.string().optional().nullable(),
        registroAns: z.string().optional().nullable(),
        login: z.string().min(1, "Informe o login do portal"),
        senha: z.string().optional(),
        urlLogin: z.string().optional().nullable(),
        parametrosExtras: z.record(z.string(), z.any()).optional().nullable(),
        ativo: z.enum(["sim", "nao"]).optional().default("sim"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");
      await garantirTabelasRpaEnvio(db);

      const codPrestLimpo = input.codigoPrestadorOperadora?.trim() || null;
      const ansLimpo = input.registroAns?.trim() || null;
      const estabIdFinal = input.estabelecimentoId
        ? Number(input.estabelecimentoId)
        : null;

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

        const novaSenhaInformada =
          input.senha &&
          input.senha.trim() !== "" &&
          input.senha.trim() !== "********";
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
            urlLogin: input.urlLogin?.trim() || null,
            parametrosExtras: input.parametrosExtras || null,
            statusCredencial: "ATIVA",
            mensagemErro: null,
            ativo: input.ativo || "sim",
            updatedAt: new Date(),
          })
          .where(eq(credenciaisPortais.id, input.id));
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
          urlLogin: input.urlLogin?.trim() || null,
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
   * Exclui uma credencial do Cofre
   */
  excluirCredencial: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");
      await garantirTabelasRpaEnvio(db);
      await db
        .delete(credenciaisPortais)
        .where(eq(credenciaisPortais.id, input.id));
      return { sucesso: true };
    }),

  /**
   * Analisa 1 ou mais arquivos XML TISS em memória (Triagem pelo <ans:cabecalho>)
   * Descobre automaticamente o Hospital (estabelecimentoId), o Convênio (convenioId),
   * a quantidade de guias, o valor total e valida a Trava Multi-Hospital antes de enfileirar.
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");
      await garantirTabelasRpaEnvio(db);

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
   * Importa 1 ou vários lotes XML para a Fila de Envio do Robô (com Trava Anti-Erro e Anti-Duplicidade SHA-256)
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
      await garantirTabelasRpaEnvio(db);

      const importados: any[] = [];
      const rejeitados: any[] = [];

      for (const arq of input.arquivos) {
        try {
          const xmlBuffer = Buffer.from(arq.conteudoBase64, "base64");
          const ident = await identificarERotearXmlTiss(xmlBuffer, db, {
            estabelecimentoIdContexto: input.estabelecimentoIdContexto,
            convenioIdForcado: arq.convenioIdOverride,
          });

          // 1. Trava de Segurança Multi-Hospital
          if (ident.conflitoHospital && !arq.estabelecimentoIdOverride) {
            rejeitados.push({
              nomeArquivo: arq.nomeArquivo,
              motivo:
                ident.mensagemConflito ||
                "Conflito de hospital no cabeçalho XML.",
            });
            continue;
          }

          const estabIdFinal =
            arq.estabelecimentoIdOverride || ident.estabelecimentoIdDetectado;
          const convIdFinal =
            arq.convenioIdOverride || ident.convenioIdDetectado;

          if (!estabIdFinal) {
            rejeitados.push({
              nomeArquivo: arq.nomeArquivo,
              motivo: `Hospital não identificado automaticamente para o Prestador "${ident.codigoPrestadorXml || ident.cnpjPrestadorXml || "N/A"}" (ANS: ${ident.registroAns || "N/A"}). Selecione o hospital ou cadastre o Código do Prestador no Cofre.`,
            });
            continue;
          }

          if (!convIdFinal) {
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
                eq(filaEnvioXmlPortal.estabelecimentoId, Number(estabIdFinal)),
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

          // 3. Salvar XML em diretório estruturado por Estabelecimento e Competência
          const anoMes = new Date().toISOString().slice(0, 7);
          const pastaXml = path.join(
            process.cwd(),
            "uploads",
            "storage_rpa_xml",
            `estab_${estabIdFinal}`,
            anoMes,
            `conv_${convIdFinal}`,
            "xml_envio"
          );
          if (!fs.existsSync(pastaXml)) {
            fs.mkdirSync(pastaXml, { recursive: true });
          }

          const nomeLimpo = arq.nomeArquivo.replace(/[^a-zA-Z0-9._-]/g, "_");
          const caminhoCompleto = path.join(
            pastaXml,
            `lote_${ident.numeroLote}_${ident.hashXml.slice(0, 8)}_${nomeLimpo}`
          );
          fs.writeFileSync(caminhoCompleto, xmlBuffer);

          const statusInicial = input.liberarImediatamente
            ? "LIBERADO_ENVIO"
            : "IMPORTADO";

          const [ins] = await db.insert(filaEnvioXmlPortal).values({
            estabelecimentoId: Number(estabIdFinal),
            convenioId: Number(convIdFinal),
            fabricaContaId: arq.fabricaContaId || null,
            usuarioUploadId: ctx.user.id,
            usuarioUploadNome:
              ctx.user.name || ctx.user.email || `Usuário #${ctx.user.id}`,
            nomeArquivo: arq.nomeArquivo,
            numeroLote: ident.numeroLote,
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
            numeroLote: ident.numeroLote,
            estabelecimentoId: estabIdFinal,
            estabelecimentoNome: ident.estabelecimentoNomeDetectado,
            convenioId: convIdFinal,
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
   * Lista a Fila de Envio de Lotes XML com agrupamento e indicadores
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
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");
      await garantirTabelasRpaEnvio(db);

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
        .orderBy(desc(filaEnvioXmlPortal.id));

      const filtrados = rows.filter((r) => {
        if (
          input?.estabelecimentoId &&
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
   * Obtém detalhes completos de um lote na fila (incluindo o Screenshot Base64 e a lista de guias do XML)
   */
  obterDetalhesLoteFila: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");
      await garantirTabelasRpaEnvio(db);

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

      return {
        ...lote,
        valorTotal: Number(lote.valorTotal || 0),
        resumoGuias: Array.isArray(lote.resumoGuiasJson)
          ? lote.resumoGuiasJson
          : [],
      };
    }),

  /**
   * Coloca lotes com status IMPORTADO ou ERRO_* de volta em LIBERADO_ENVIO para o Robô
   */
  liberarLotesParaRobo: protectedProcedure
    .input(
      z.object({
        loteIds: z.array(z.number()).min(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");
      await garantirTabelasRpaEnvio(db);

      await db
        .update(filaEnvioXmlPortal)
        .set({
          statusEsteira: "LIBERADO_ENVIO",
        })
        .where(inArray(filaEnvioXmlPortal.id, input.loteIds));

      return {
        sucesso: true,
        mensagem: `${input.loteIds.length} lote(s) liberado(s) para a fila do robô.`,
      };
    }),

  /**
   * Dispara o Ciclo do Robô RPA (Agrupado por Sessão Hospital + Convênio)
   * Suporta modo "simulacao" (Dry-Run seguro) e modo "producao" (Envio real com protocolo)
   */
  dispararCicloEnvioRpa: protectedProcedure
    .input(
      z.object({
        loteIds: z.array(z.number()).optional(),
        modoExecucao: z.enum(["simulacao", "producao"]).default("simulacao"),
        estabelecimentoIdFiltro: z.number().optional().nullable(),
        convenioIdFiltro: z.number().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");
      await garantirTabelasRpaEnvio(db);

      // Se o usuário selecionou lotes específicos que estavam em IMPORTADO, SIMULADO_OK ou ERRO_*, libera-os antes do ciclo
      if (input.loteIds && input.loteIds.length > 0) {
        await db
          .update(filaEnvioXmlPortal)
          .set({ statusEsteira: "LIBERADO_ENVIO" })
          .where(inArray(filaEnvioXmlPortal.id, input.loteIds));
      }

      const resultado = await executarCicloEnvioXmlRpa({
        loteIds: input.loteIds,
        modoExecucao: input.modoExecucao,
        estabelecimentoIdFiltro: input.estabelecimentoIdFiltro,
        convenioIdFiltro: input.convenioIdFiltro,
        usuarioIdExecutor: ctx.user.id,
        usuarioNomeExecutor:
          ctx.user.name || ctx.user.email || `Usuário #${ctx.user.id}`,
      });

      return resultado;
    }),

  /**
   * Exclui um lote da fila de envio
   */
  excluirLoteFila: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");
      await garantirTabelasRpaEnvio(db);

      await db
        .delete(filaEnvioXmlPortal)
        .where(eq(filaEnvioXmlPortal.id, input.id));
      return { sucesso: true };
    }),
});
