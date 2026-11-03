import {
  RoboBase,
  CredenciaisConvenio,
  LoteParaEnvioRpa,
  ResultadoCicloGrupoRpa,
  ResultadoEnvioLoteRpa,
} from "../RoboBase";
import { logger } from "../../_core/logger";
import path from "path";
import fs from "fs";
import { createHash } from "node:crypto";
import type { Frame, Page } from "puppeteer";
import { getDb } from "../../db";
import { arquivos } from "../../../drizzle/schema";
import { like } from "drizzle-orm";
import { ErroPoliticaPortal } from "../rpaPortalPolicy";
import {
  sanitizarNumeroLoteTiss,
  validarCaminhoContidoXmlRpa,
  validarUrlPortalConvenio,
} from "../cofreCredenciais";
import {
  aguardarConfirmacaoPortalRpa,
  avaliarConfirmacaoRpa,
  type EstadoConfirmacaoRpa,
} from "../rpaConfirmacao";

export class RoboUnimed extends RoboBase {
  constructor() {
    super("Unimed_Bot");
  }

  /**
   * Os seletores legados só observam referências, não provam vínculo com um lote.
   * Sem fixtures reais para validar a linha/confirmação do portal, fail-closed.
   * Um adaptador validado deve extrair lote, arquivo/hash e protocolo na MESMA linha.
   */
  protected async capturarEstadoConfirmacaoRpa(
    contexto: Page | Frame
  ): Promise<EstadoConfirmacaoRpa> {
    const protocolosVisiveis = await contexto.evaluate(() => {
      const elementos = Array.from(document.querySelectorAll(
        "#box-protocolo-sucesso, #numero-protocolo, .protocolo-sucesso"
      ));
      return elementos.flatMap((elemento) => {
        const texto = elemento.textContent?.trim() || "";
        const referencias = Array.from(texto.matchAll(
          /(?:protocolo|recibo)\s*(?:de\s*envio|gerado|n[º°o.])?\s*[:#-]?\s*([0-9]{6,25})(?![0-9])/gi
        ), (match) => match[1]);
        if (/^[0-9]{6,25}$/.test(texto)) referencias.push(texto);
        return referencias;
      });
    });
    return {
      adaptadorValidado: false,
      leituraCompleta: false,
      protocolosVisiveis,
      confirmacoes: [],
    };
  }

  /**
   * Realiza o login único na sessão do Portal Unimed (com detecção de senha inválida na 1ª tentativa)
   */
  private async realizarLoginUnimed(
    credenciais: CredenciaisConvenio,
    pastaEvidencias: string
  ): Promise<{
    sucesso: boolean;
    credencialInvalida?: boolean;
    mensagem: string;
    screenshotBase64?: string;
  }> {
    if (!this.page) {
      return { sucesso: false, mensagem: "Página do navegador não inicializada." };
    }

    const urlAlvo = validarUrlPortalConvenio(
      credenciais.url ||
        "https://www.unimedgoiania.coop.br/wps/portal/usuariosunimed",
      "UNIMED",
      credenciais.registroAns
    );
    logger.info({
      message: `[${this.nome}] Acessando portal da Unimed: ${urlAlvo} (Estab #${credenciais.estabelecimentoId || "N/A"})`,
    });

    await this.page.goto(urlAlvo, {
      waitUntil: "networkidle2",
      timeout: 45000,
    });
    await this.delay(2000);

    // Validar que a URL final pós-redirecionamento permanece no domínio aprovado da operadora
    await this.validarAntesDeCredenciais(this.page);

    // Clicar em "Credenciado" ou "Prestador" caso o portal exiba seleção de perfil inicial
    await this.validarAntesDeCredenciais(this.page);
    try {
      await this.page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll("a, button, span, div.box, div.icone")
        );
        const btn = els.find((el) => {
          const txt = el.textContent?.trim().toLowerCase() || "";
          return txt === "credenciado" || txt === "prestador" || txt === "área do prestador";
        });
        if (btn && (btn as HTMLElement).click) {
          (btn as HTMLElement).click();
        }
      });
      await this.delay(3500);
    } catch (erro) {
      if (erro instanceof ErroPoliticaPortal) throw erro;
      //Segue fluxo normal se não houver botão de perfil
    }

    // Caso tenha aberto uma nova aba após clicar em Credenciado, focar na última aba
    const abas = await this.page.browser().pages();
    if (abas.length > 1) {
      this.page = abas[abas.length - 1];
      await this.delay(1500);
    }
    await this.validarAntesDeCredenciais(this.page);

    const seletorLogin =
      "input[name*='login' i], input[name*='usuario' i], input[name*='user' i], input[id*='usuario' i], input[id*='login' i], input[placeholder*='usuário' i], input[placeholder*='login' i], input[placeholder*='código' i], input[type='text']";
    const seletorSenha =
      "input[type='password'], input[name*='senha' i], input[id*='senha' i], input[name*='pass' i]";

    let preencheuLogin = false;

    // Tenta preencher apenas na página principal ou em iframes do domínio HTTPS aprovado da Unimed
    const contextos = [this.page, ...this.page.frames()];
    for (const ctx of contextos) {
      try {
        const ctxUrl = ctx.url();
        if (!ctxUrl || ctxUrl === "about:blank") continue;
        await this.validarAntesDeCredenciais(ctx);

        const campoUsuario = await ctx.$(seletorLogin);
        const campoSenha = await ctx.$(seletorSenha);
        if (campoUsuario && campoSenha) {
          if (credenciais.login) {
            await this.validarAntesDeCredenciais(ctx);
            await campoUsuario.click({ count: 3 }).catch(erro => {
              if (erro instanceof ErroPoliticaPortal) throw erro;
            });
            await this.validarAntesDeCredenciais(ctx);
            await campoUsuario.type(credenciais.login, { delay: 40 });
          }
          if (credenciais.senha) {
            await this.validarAntesDeCredenciais(ctx);
            await campoSenha.click({ count: 3 }).catch(erro => {
              if (erro instanceof ErroPoliticaPortal) throw erro;
            });
            await this.validarAntesDeCredenciais(ctx);
            await campoSenha.type(credenciais.senha, { delay: 40 });
          }

          await this.validarAntesDeCredenciais(ctx);
          await Promise.all([
            this.page
              .waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 })
              .catch(() => {}),
            ctx.evaluate(() => {
              const btns = Array.from(
                document.querySelectorAll(
                  "button, input[type='submit'], input[type='button'], a"
                )
              );
              const enterBtn = btns.find((b) => {
                const text = b.textContent?.trim().toLowerCase() || "";
                const val = b.getAttribute("value")?.toLowerCase() || "";
                const id = b.id?.toLowerCase() || "";
                return (
                  text === "entrar" ||
                  text === "acessar" ||
                  text === "login" ||
                  text.includes("efetuar login") ||
                  val === "entrar" ||
                  val === "acessar" ||
                  val.includes("efetuar login") ||
                  id.includes("login") ||
                  id.includes("entrar")
                );
              });
              if (enterBtn && (enterBtn as HTMLElement).click) {
                (enterBtn as HTMLElement).click();
              }
            }),
          ]);

          preencheuLogin = true;
          break;
        }
      } catch (erro) {
        if (erro instanceof ErroPoliticaPortal) throw erro;
        // Ignora frames cross-origin inacessíveis
      }
    }

    await this.delay(3500);
    await this.assegurarPortalSemBloqueios(this.page);

    // Verificar imediatamente se o portal retornou erro de Usuário ou Senha Inválidos (Trava Anti-Bloqueio)
    let textoPagina = "";
    try {
      await this.validarAntesDeCredenciais(this.page);
      textoPagina = await this.page.evaluate(() => document.body?.innerText || "");
      for (const frame of this.page.frames()) {
        try {
          await this.validarAntesDeCredenciais(frame);
          textoPagina += "\n" + (await frame.evaluate(() => document.body?.innerText || ""));
        } catch (erro) {
          if (erro instanceof ErroPoliticaPortal) throw erro;
        }
      }
    } catch (erro) {
      if (erro instanceof ErroPoliticaPortal) throw erro;
    }

    const regexSenhaInvalida =
      /(?:usu[aá]rio\s*(?:e\/ou|ou)\s*senha\s*inv[aá]lid|senha\s*incorreta|credenciais?\s*inv[aá]lid|acesso\s*negado|login\s*inv[aá]lido|usu[aá]rio\s*bloqueado|senha\s*expirada)/i;
    if (regexSenhaInvalida.test(textoPagina)) {
      const ev = await this.capturarEvidenciaTela(
        pastaEvidencias,
        `erro_credencial_unimed_estab_${credenciais.estabelecimentoId || 0}`
      );
      return {
        sucesso: false,
        credencialInvalida: true,
        mensagem:
          "Portal Unimed recusou o login (Usuário ou senha inválidos / expirada). Credencial pausada na 1ª tentativa para evitar bloqueio no convênio.",
        screenshotBase64: ev.base64,
      };
    }

    if (!preencheuLogin) {
      const ev = await this.capturarEvidenciaTela(
        pastaEvidencias,
        `aviso_campos_login_unimed_estab_${credenciais.estabelecimentoId || 0}`
      );
      return {
        sucesso: false,
        credencialInvalida: false,
        mensagem:
          "Campos de usuário/senha não foram localizados na URL informada do portal Unimed. Verifique o print da tela.",
        screenshotBase64: ev.base64,
      };
    }

    const evOk = await this.capturarEvidenciaTela(
      pastaEvidencias,
      `login_ok_unimed_estab_${credenciais.estabelecimentoId || 0}`
    );
    await this.assegurarPortalSemBloqueios(this.page);
    return {
      sucesso: true,
      mensagem: "Login efetuado com sucesso no portal Unimed.",
      screenshotBase64: evOk.base64,
    };
  }

  /**
   * Navega até a tela de Envio/Importação de Lote XML TISS dentro do portal Unimed
   */
  private async navegarParaTelaEnvioXml(credenciais: CredenciaisConvenio): Promise<{
    encontrouMenuOuInput: boolean;
    detalheNavegacao: string;
  }> {
    if (!this.page) {
      return { encontrouMenuOuInput: false, detalheNavegacao: "Página inativa" };
    }

    // 1. Se houver URL direta de envio de XML configurada nos parâmetros extras da credencial, validar domínio HTTPS
    const urlDiretaXml = credenciais.parametrosExtras?.urlEnvioXml;
    if (urlDiretaXml && typeof urlDiretaXml === "string" && urlDiretaXml.trim() !== "") {
      const urlSeguraXml = validarUrlPortalConvenio(
        urlDiretaXml,
        "UNIMED",
        credenciais.registroAns
      );
      await this.page
        .goto(urlSeguraXml, { waitUntil: "networkidle2", timeout: 30000 })
        .catch(erro => {
          if (erro instanceof ErroPoliticaPortal) throw erro;
        });
      await this.delay(2500);
      await this.validarAntesDeCredenciais(this.page);
      return {
        encontrouMenuOuInput: true,
        detalheNavegacao: `Navegou para URL direta de envio XML: ${urlSeguraXml}`,
      };
    }

    // 2. Procurar menu pai ("Faturamento", "TISS", "Troca de Arquivos", "Contas Médicas") e clicar
    const termosMenuPai = [
      "faturamento",
      "troca de arquivos",
      "tiss",
      "contas médicas",
      "contas medicas",
      "transmissão",
      "envio de arquivos",
    ];
    const termosSubmenuEnvio = [
      "envio de lote xml",
      "enviar lote xml",
      "importação de xml",
      "importacao de xml",
      "enviar arquivo xml",
      "envio de arquivo",
      "enviar xml",
      "envio xml",
      "importar xml",
      "transmissão de arquivo",
      "faturamento eletrônico",
    ];

    let clicouAlgumMenu = false;
    let menuClicadoNome = "";

    const todosContextos = [this.page, ...this.page.frames()];

    // Tenta clicar direto no submenu de Envio de XML se já estiver visível
    for (const ctx of todosContextos) {
      try {
        await this.validarAntesDeCredenciais(ctx);
        const resSub = await ctx.evaluate((termos: string[]) => {
          const links = Array.from(
            document.querySelectorAll("a, button, span, li, div[role='menuitem']")
          );
          for (const termo of termos) {
            const achou = links.find((el) => {
              const t = (el.textContent || "").trim().toLowerCase();
              return t === termo || (t.length <= 45 && t.includes(termo));
            });
            if (achou && (achou as HTMLElement).click) {
              (achou as HTMLElement).click();
              return (achou.textContent || "").trim();
            }
          }
          return null;
        }, termosSubmenuEnvio);

        if (resSub) {
          clicouAlgumMenu = true;
          menuClicadoNome = resSub;
          await this.delay(3000);
          break;
        }
      } catch (erro) {
        if (erro instanceof ErroPoliticaPortal) throw erro;
      }
    }

    // Se não achou direto o submenu, clica no menu pai (ex: Faturamento / TISS) e depois no submenu
    if (!clicouAlgumMenu) {
      for (const ctx of todosContextos) {
        try {
          await this.validarAntesDeCredenciais(ctx);
          const resPai = await ctx.evaluate((termos: string[]) => {
            const links = Array.from(
              document.querySelectorAll("a, button, span, li, div[role='menuitem']")
            );
            for (const termo of termos) {
              const achou = links.find((el) => {
                const t = (el.textContent || "").trim().toLowerCase();
                return t === termo || (t.length <= 35 && t.includes(termo));
              });
              if (achou && (achou as HTMLElement).click) {
                (achou as HTMLElement).click();
                return (achou.textContent || "").trim();
              }
            }
            return null;
          }, termosMenuPai);

          if (resPai) {
            clicouAlgumMenu = true;
            menuClicadoNome = resPai;
            await this.delay(2500);
            break;
          }
        } catch (erro) {
          if (erro instanceof ErroPoliticaPortal) throw erro;
        }
      }

      // Segunda passagem após expandir o menu pai
      if (clicouAlgumMenu) {
        for (const ctx of [this.page, ...this.page.frames()]) {
          try {
            await this.validarAntesDeCredenciais(ctx);
            const resSub2 = await ctx.evaluate((termos: string[]) => {
              const links = Array.from(
                document.querySelectorAll("a, button, span, li, div[role='menuitem']")
              );
              for (const termo of termos) {
                const achou = links.find((el) => {
                  const t = (el.textContent || "").trim().toLowerCase();
                  return t === termo || (t.length <= 45 && t.includes(termo));
                });
                if (achou && (achou as HTMLElement).click) {
                  (achou as HTMLElement).click();
                  return (achou.textContent || "").trim();
                }
              }
              return null;
            }, termosSubmenuEnvio);

            if (resSub2) {
              menuClicadoNome += ` -> ${resSub2}`;
              await this.delay(3000);
              break;
            }
          } catch (erro) {
            if (erro instanceof ErroPoliticaPortal) throw erro;
          }
        }
      }
    }

    return {
      encontrouMenuOuInput: clicouAlgumMenu,
      detalheNavegacao: clicouAlgumMenu
        ? `Menu acessado: ${menuClicadoNome}`
        : "Permaneceu na tela principal pós-login (buscando input[type='file'] nos frames).",
    };
  }

  /**
   * Envia múltiplos lotes XML TISS em sequência usando uma ÚNICA sessão de login para o Hospital + Unimed
   */
  async enviarLotesXml(
    credenciais: CredenciaisConvenio,
    lotes: LoteParaEnvioRpa[],
    opcoes?: { modoExecucao?: "simulacao" | "producao" }
  ): Promise<ResultadoCicloGrupoRpa> {
    const modoExecucao = opcoes?.modoExecucao || "producao";
    const estabId = Number(credenciais.estabelecimentoId || 0);
    const convId = Number(credenciais.convenioId || 0);

    const pastaEvidencias = path.join(
      process.cwd(),
      "uploads",
      "evidencias_rpa",
      `estab_${estabId}`,
      "unimed"
    );
    if (!fs.existsSync(pastaEvidencias)) {
      fs.mkdirSync(pastaEvidencias, { recursive: true });
    }

    const resultadosLotes: ResultadoEnvioLoteRpa[] = [];

    // MODO SIMULAÇÃO (DRY-RUN SEGURO):
    // Valida URL aprovada, credencial presente e contenção/existência física do XML localmente,
    // SEM abrir sessão externa, SEM digitar credenciais em portal remoto e SEM anexar o XML em input[type='file'].
    if (modoExecucao === "simulacao") {
      try {
        validarUrlPortalConvenio(
          credenciais.url ||
            "https://www.unimedgoiania.coop.br/wps/portal/usuariosunimed",
          "UNIMED",
          credenciais.registroAns
        );
        if (credenciais.parametrosExtras?.urlEnvioXml) {
          validarUrlPortalConvenio(
            credenciais.parametrosExtras.urlEnvioXml,
            "UNIMED",
            credenciais.registroAns
          );
        }
      } catch (errUrl: any) {
        for (const lote of lotes) {
          resultadosLotes.push({
            filaId: lote.filaId,
            numeroLote: lote.numeroLote,
            sucesso: false,
            status: "ERRO_CREDENCIAL",
            mensagem: errUrl.message || "URL do portal recusada na validação HTTPS.",
            envioIniciado: false,
          });
        }
        return {
          estabelecimentoId: estabId,
          convenioId: convId,
          loginSucesso: false,
          credencialInvalida: false,
          mensagemLogin: errUrl.message || "URL do portal recusada.",
          resultadosLotes,
        };
      }

      for (const lote of lotes) {
        try {
          const caminhoSeguro = validarCaminhoContidoXmlRpa(
            process.cwd(),
            lote.caminhoXml
          );
          if (!fs.existsSync(caminhoSeguro)) {
            resultadosLotes.push({
              filaId: lote.filaId,
              numeroLote: lote.numeroLote,
              sucesso: false,
              status: "ERRO_ROBO",
              mensagem: "Arquivo XML não localizado no diretório privado.",
              envioIniciado: false,
            });
            continue;
          }
          const loteSanitizado = sanitizarNumeroLoteTiss(lote.numeroLote);
          resultadosLotes.push({
            filaId: lote.filaId,
            numeroLote: loteSanitizado,
            sucesso: true,
            status: "SIMULADO_OK",
            protocolo: null,
            mensagem: `Simulação local (Dry-Run) aprovada sem transmissão externa para "${lote.nomeArquivo}".`,
            envioIniciado: false,
          });
        } catch (errSim: any) {
          resultadosLotes.push({
            filaId: lote.filaId,
            numeroLote: lote.numeroLote,
            sucesso: false,
            status: "ERRO_ROBO",
            mensagem: errSim.message || "Falha na validação local do XML.",
            envioIniciado: false,
          });
        }
      }

      return {
        estabelecimentoId: estabId,
        convenioId: convId,
        loginSucesso: true,
        mensagemLogin: "Simulação local (Dry-Run) concluída sem contato com portal externo.",
        resultadosLotes,
      };
    }

    const lotesComTransmissaoPossivel = new Set<number>();
    try {
      const isProducaoNode = process.env.NODE_ENV === "production";
      await this.iniciarBrowser(isProducaoNode);
      if (!this.page) throw new Error("Página não iniciada");
      await this.definirContextoPortal("UNIMED", credenciais);

      // 1. Login ÚNICO para o Hospital neste Convênio
      const statusLogin = await this.realizarLoginUnimed(
        credenciais,
        pastaEvidencias
      );

      if (!statusLogin.sucesso) {
        for (const lote of lotes) {
          resultadosLotes.push({
            filaId: lote.filaId,
            numeroLote: lote.numeroLote,
            sucesso: false,
            status: statusLogin.credencialInvalida
              ? "ERRO_CREDENCIAL"
              : "ERRO_ROBO",
            mensagem: statusLogin.mensagem,
            screenshotBase64: statusLogin.screenshotBase64 || null,
            envioIniciado: false,
          });
        }
        return {
          estabelecimentoId: estabId,
          convenioId: convId,
          loginSucesso: false,
          credencialInvalida: statusLogin.credencialInvalida,
          mensagemLogin: statusLogin.mensagem,
          screenshotLoginBase64: statusLogin.screenshotBase64 || null,
          resultadosLotes,
        };
      }

      // 2. Navegar até a tela de importação/envio de XML TISS
      const navInfo = await this.navegarParaTelaEnvioXml(credenciais);
      logger.info({
        message: `[${this.nome}] ${navInfo.detalheNavegacao}`,
      });

      // 3. Loop enviando TODOS os XMLs daquele hospital na mesma sessão aberta
      for (const lote of lotes) {
        const loteSeguro = sanitizarNumeroLoteTiss(lote.numeroLote);
        let transmissaoPossivel = false;
        try {
          const caminhoXmlSeguro = validarCaminhoContidoXmlRpa(
            process.cwd(),
            lote.caminhoXml
          );
          if (!fs.existsSync(caminhoXmlSeguro)) {
            resultadosLotes.push({
              filaId: lote.filaId,
              numeroLote: loteSeguro,
              sucesso: false,
              status: "ERRO_ROBO",
              mensagem: "Arquivo XML não encontrado no diretório privado do servidor.",
              envioIniciado: false,
            });
            continue;
          }

          // Localizar input[type='file'] exclusivamente em frames com origem HTTPS aprovada da Unimed
          let inputFileHandle: any = null;
          let contextoAlvo: any = this.page;

          for (const ctx of [this.page, ...this.page.frames()]) {
            try {
              const ctxUrl = ctx.url();
              if (!ctxUrl || ctxUrl === "about:blank") continue;
              await this.validarAntesDeCredenciais(ctx);

              const handle = await ctx.$("input[type='file']");
              if (handle) {
                inputFileHandle = handle;
                contextoAlvo = ctx;
                break;
              }
            } catch (erro) {
              if (erro instanceof ErroPoliticaPortal) throw erro;
            }
          }

          // MODO PRODUÇÃO: Exige o input[type='file'] e clica no botão de Enviar/Transmitir
          if (!inputFileHandle) {
            const evNoInput = await this.capturarEvidenciaTela(
              pastaEvidencias,
              `sem_input_file_lote_${loteSeguro}`
            );
            resultadosLotes.push({
              filaId: lote.filaId,
              numeroLote: loteSeguro,
              sucesso: false,
              status: "ERRO_PORTAL",
              mensagem:
                "Campo de anexo XML (input[type='file']) não foi localizado na tela atual do portal Unimed. Confira o print da tela.",
              evidenciaPath: evNoInput.path,
              screenshotBase64: evNoInput.base64,
              envioIniciado: false,
            });
            continue;
          }

          const identidadeSubmissao = {
            numeroLote: lote.numeroLote,
            nomeArquivo: path.basename(caminhoXmlSeguro),
            hashXmlSha256: createHash("sha256").update(fs.readFileSync(caminhoXmlSeguro)).digest("hex"),
          };
          // Único baseline ANTES de upload e click: upload pode autoenviar.
          await this.validarAntesDeCredenciais(contextoAlvo);
          const estadoAntes = await this.capturarEstadoConfirmacaoRpa(contextoAlvo);
          await this.validarAntesDeCredenciais(contextoAlvo);
          transmissaoPossivel = true;
          lotesComTransmissaoPossivel.add(lote.filaId);
          await inputFileHandle.uploadFile(caminhoXmlSeguro);
          await this.delay(1500);

          // Clicar no botão de Enviar / Transmitir XML e comprovar que o botão foi efetivamente acionado
          let retornoIncerto = false;
          await this.validarAntesDeCredenciais(contextoAlvo);
          const [, clicouBotaoEnviar] = await Promise.all([
            this.page
              .waitForNavigation({ waitUntil: "networkidle2", timeout: 25000 })
              .catch(() => { retornoIncerto = true; }),
            contextoAlvo.evaluate(() => {
              const botoes = Array.from(
                document.querySelectorAll(
                  "#btn-enviar-xml, button, input[type='submit'], input[type='button'], a.btn"
                )
              );
              const btnEnviar = botoes.find((b) => {
                const txt = (b.textContent || "").trim().toLowerCase();
                const val = (b.getAttribute("value") || "").trim().toLowerCase();
                const id = (b.id || "").toLowerCase();
                return (
                  id.includes("enviar") ||
                  txt.includes("enviar") ||
                  txt.includes("transmitir") ||
                  txt.includes("importar") ||
                  txt.includes("processar") ||
                  val.includes("enviar") ||
                  val.includes("transmitir") ||
                  val.includes("importar")
                );
              });
              if (btnEnviar && (btnEnviar as HTMLElement).click) {
                (btnEnviar as HTMLElement).click();
                return true;
              }
              return false;
            }),
          ]);

          if (!clicouBotaoEnviar) {
            const evSemBotao = await this.capturarEvidenciaTela(
              pastaEvidencias,
              `sem_botao_enviar_lote_${loteSeguro}_fila_${lote.filaId}`
            );
            resultadosLotes.push({
              filaId: lote.filaId,
              numeroLote: loteSeguro,
              ...aguardarConfirmacaoPortalRpa(),
              evidenciaPath: evSemBotao.path,
              screenshotBase64: evSemBotao.base64,
              envioIniciado: true,
            });
            continue;
          }

          await this.delay(5000);

          await this.validarAntesDeCredenciais(contextoAlvo);
          const estadoDepois = await this.capturarEstadoConfirmacaoRpa(contextoAlvo);
          const decisao = avaliarConfirmacaoRpa(
            identidadeSubmissao, estadoAntes, estadoDepois, retornoIncerto
          );
          // Capturar evidência pós-envio
          const evEnvio = await this.capturarEvidenciaTela(
            pastaEvidencias,
            `comprovante_lote_${loteSeguro}_fila_${lote.filaId}`
          );
          await this.assegurarPortalSemBloqueios(this.page);

          resultadosLotes.push({
            filaId: lote.filaId,
            numeroLote: loteSeguro,
            ...decisao,
            evidenciaPath: evEnvio.path,
            screenshotBase64: evEnvio.base64,
            envioIniciado: true,
          });
        } catch {
          const evErro = await this.capturarEvidenciaTela(
            pastaEvidencias,
            `erro_lote_${loteSeguro}`
          ).catch(() => ({ path: "", base64: "" }));
          resultadosLotes.push({
            filaId: lote.filaId,
            numeroLote: loteSeguro,
            ...(transmissaoPossivel
              ? aguardarConfirmacaoPortalRpa()
              : {
                  sucesso: false,
                  status: "ERRO_ROBO" as const,
                  mensagem: "Falha técnica antes de anexar ou transmitir o XML.",
                }),
            evidenciaPath: evErro.path,
            screenshotBase64: evErro.base64,
            envioIniciado: transmissaoPossivel,
          });
        }
      }

      await this.assegurarPortalSemBloqueios(this.page);
      return {
        estabelecimentoId: estabId,
        convenioId: convId,
        loginSucesso: true,
        mensagemLogin: statusLogin.mensagem,
        screenshotLoginBase64: statusLogin.screenshotBase64 || null,
        resultadosLotes,
      };
    } catch {
      // Falha antes de upload é comprovada; após upload nunca autoriza retry.
      for (const resultado of resultadosLotes) {
        if (lotesComTransmissaoPossivel.has(resultado.filaId)) {
          Object.assign(resultado, aguardarConfirmacaoPortalRpa(), { envioIniciado: true });
          delete resultado.protocolo;
        }
      }
      for (const lote of lotes) {
        if (resultadosLotes.some(resultado => resultado.filaId === lote.filaId)) continue;
        const envioIniciado = lotesComTransmissaoPossivel.has(lote.filaId);
        resultadosLotes.push({
          filaId: lote.filaId,
          numeroLote: lote.numeroLote,
          ...(envioIniciado ? aguardarConfirmacaoPortalRpa() : {
            sucesso: false, status: "ERRO_ROBO" as const,
            mensagem: "Operação RPA interrompida antes de anexar ou transmitir o XML; revisão necessária.",
          }),
          envioIniciado,
        });
      }
      return {
        estabelecimentoId: estabId, convenioId: convId,
        loginSucesso: false, credencialInvalida: false,
        mensagemLogin: "Operação RPA interrompida; revisão necessária.", resultadosLotes,
      };
    } finally {
      // Fecha o navegador limpando 100% dos cookies antes de logar no próximo Hospital
      try {
        await this.fecharBrowser();
      } catch (erroEncerramento) {
        if (lotesComTransmissaoPossivel.size === 0) throw erroEncerramento;
        for (const resultado of resultadosLotes) {
          if (lotesComTransmissaoPossivel.has(resultado.filaId)) {
            Object.assign(resultado, aguardarConfirmacaoPortalRpa());
            delete resultado.protocolo;
          }
        }
        logger.warn({ message: `[${this.nome}] Encerramento incerto após possível transmissão; lotes aguardam reconciliação.` });
      }
    }
  }

  async executar(
    credenciais: CredenciaisConvenio,
    parametros?: { competencia: string }
  ) {
    const scope = this.criarScopeImportacaoRpa(credenciais);
    try {
      // 1. Iniciar navegador (Headless = false para você ver o robô agir na tela durante o dev)
      const isProducao = process.env.NODE_ENV === "production";
      await this.iniciarBrowser(!isProducao);
      if (!this.page) throw new Error("Página não iniciada");
      await this.definirContextoPortal("UNIMED", credenciais);

      // Configurar pasta de download automático
      const downloadPath = this.criarDiretorioDownloadRpa(scope);

      const client = await this.page.target().createCDPSession();
      await client.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: downloadPath,
      });

      // 2/3. Mesmo login protegido usado pelo envio: sem fallback após bloqueio.
      const login = await this.realizarLoginUnimed(credenciais, downloadPath);
      if (!login.sucesso) throw new Error("Login Unimed não concluído; revisão necessária.");

      // 4. Navegar até Demonstrativo de Pagamento
      try {
        logger.info({
          message: `[${this.nome}] Navegando para Demonstrativo de Pagamento...`,
        });
        await this.page.waitForSelector("body", { timeout: 10000 });

        await this.validarAntesDeCredenciais(this.page);
        const clicouDem = await this.page.evaluate(() => {
          const links = Array.from(document.querySelectorAll("a"));
          const linkDem = links.find((el) =>
            el.textContent?.includes("Demonstrativo de Pagamento")
          );
          if (linkDem) {
            linkDem.click();
            return true;
          }
          return false;
        });

        if (clicouDem) {
          await this.page
            .waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 })
            .catch(() => {});
        } else {
          throw new Error(
            "Link 'Demonstrativo de Pagamento' não encontrado no menu."
          );
        }
      } catch (navErr: any) {
        if (navErr instanceof ErroPoliticaPortal) throw navErr;
        logger.warn({
          message: `[${this.nome}] Erro ao buscar menu de demonstrativo: ${navErr.message}`,
        });
      }

      // 5. Pesquisar e Clicar nos ícones XLS para baixar os extratos
      let arquivosBaixados = 0;
      try {
        logger.info({
          message: `[${this.nome}] Tentando clicar no botão 'Pesquisar' (se houver)...`,
        });

        for (const frame of this.page.frames()) {
          try {
            await this.validarAntesDeCredenciais(frame);
            await frame.evaluate(() => {
              const botoes = Array.from(
                document.querySelectorAll(
                  'button, input[type="submit"], input[type="button"], a.btn'
                )
              );
              const btnPesquisar = botoes.find(
                (b) =>
                  b.textContent?.trim().toLowerCase() === "pesquisar" ||
                  b.getAttribute("value")?.toLowerCase() === "pesquisar" ||
                  b.textContent?.trim().toLowerCase() === "buscar"
              );
              if (btnPesquisar && (btnPesquisar as HTMLElement).click) {
                (btnPesquisar as HTMLElement).click();
              }
            });
          } catch (e) {
            if (e instanceof ErroPoliticaPortal) throw e;
          }
        }

        logger.info({
          message: `[${this.nome}] Aguardando resultados da tabela...`,
        });
        await this.delay(6000);

        logger.info({
          message: `[${this.nome}] Buscando botões de Extrato XLSX na tabela (em todos os frames)...`,
        });

        let arquivosBaixadosDaVez = 0;
        const db = await getDb();

        for (const frame of this.page.frames()) {
          try {
            await this.validarAntesDeCredenciais(frame);
            const linhasExtraidas = await frame.evaluate(() => {
              const rowsData: {
                rowIndex: number;
                numero: string;
                mesAno: string;
              }[] = [];
              const ths = Array.from(document.querySelectorAll("th"));
              const indexXlsx = ths.findIndex(
                (th) =>
                  th.textContent?.toUpperCase().includes("XLSX") ||
                  th.textContent?.toUpperCase().includes("XLS")
              );

              if (indexXlsx > -1) {
                const trs = Array.from(document.querySelectorAll("tbody tr"));
                trs.forEach((tr, idx) => {
                  const tds = tr.querySelectorAll("td");
                  if (tds.length >= 3) {
                    rowsData.push({
                      rowIndex: idx,
                      mesAno: tds[0].textContent?.trim() || "",
                      numero: tds[2].textContent?.trim() || "",
                    });
                  }
                });
              }
              return { indexXlsx, rowsData };
            });

            if (
              linhasExtraidas.indexXlsx > -1 &&
              linhasExtraidas.rowsData.length > 0
            ) {
              for (const row of linhasExtraidas.rowsData) {
                if (!row.numero) continue;

                let jaExiste = false;
                if (db) {
                  const count = await db
                    .select()
                    .from(arquivos)
                    .where(like(arquivos.nome, `%${row.numero}%`));
                  if (count && count.length > 0) {
                    jaExiste = true;
                  }
                }

                if (jaExiste) {
                  logger.info({
                    message: `[${this.nome}] Demonstrativo Nº ${row.numero} (${row.mesAno}) já consta no sistema. Pulando...`,
                  });
                  continue;
                }

                logger.info({
                  message: `[${this.nome}] Novo demonstrativo encontrado: Nº ${row.numero} (${row.mesAno}). Iniciando download...`,
                });

                await this.validarAntesDeCredenciais(frame);
                const clicou = await frame.evaluate(
                  (idxRow, idxCol) => {
                    const trs = Array.from(
                      document.querySelectorAll("tbody tr")
                    );
                    if (trs[idxRow]) {
                      const tds = trs[idxRow].querySelectorAll("td");
                      if (tds[idxCol]) {
                        const btn = tds[idxCol].querySelector(
                          "span, svg, a, img"
                        );
                        if (btn) {
                          const target = (btn.closest("span") ||
                            btn.closest("a") ||
                            btn) as HTMLElement;
                          target.click();
                          return true;
                        }
                      }
                    }
                    return false;
                  },
                  row.rowIndex,
                  linhasExtraidas.indexXlsx
                );

                if (clicou) {
                  arquivosBaixadosDaVez++;
                  await this.delay(2000);
                }
              }
            }
          } catch (e) {
            if (e instanceof ErroPoliticaPortal) throw e;
          }
        }

        arquivosBaixados = arquivosBaixadosDaVez;
        logger.info({
          message: `[${this.nome}] Clicou em ${arquivosBaixados} links de Extrato XLSX inéditos.`,
        });

        if (arquivosBaixados > 0) {
          logger.info({
            message: `[${this.nome}] Aguardando o download de arquivos pesados (timeout de 15 minutos)...`,
          });

          let downloadTerminou = false;
          let tentativas = 0;
          const maxTentativas = 90;

          while (!downloadTerminou && tentativas < maxTentativas) {
            await this.delay(10000);
            await this.assegurarPortalSemBloqueios(this.page);
            const arquivosNaPasta = fs.readdirSync(downloadPath);
            const baixando = arquivosNaPasta.some(
              (f) => f.endsWith(".crdownload") || f.endsWith(".tmp")
            );
            if (!baixando && arquivosNaPasta.length > 0) {
              downloadTerminou = true;
            }
            tentativas++;
          }

          if (downloadTerminou) {
            logger.info({
              message: `[${this.nome}] Downloads finalizados com sucesso!`,
            });

            try {
              await this.validarAntesDeCredenciais(this.page);
              const arquivosNaPastaFinal = fs.readdirSync(downloadPath);
              const tempoLimite = Date.now() - 16 * 60 * 1000;
              const xlsNovos = arquivosNaPastaFinal.filter((f) => {
                if (!f.endsWith(".xls") && !f.endsWith(".xlsx")) return false;
                const stat = fs.statSync(this.resolverArquivoDownloadRpa(downloadPath, f));
                return stat.mtimeMs > tempoLimite;
              });

              if (xlsNovos.length > 0) {
                logger.info({
                  message: `[${this.nome}] Encontrados ${xlsNovos.length} arquivos XLS/XLSX recentes. Iniciando injeção no banco...`,
                });

                const { processarArquivoRpa } = await import("../importador");

                for (const f of xlsNovos) {
                  await this.validarAntesDeCredenciais(this.page);
                  const filePath = this.resolverArquivoDownloadRpa(downloadPath, f);
                  const importacao = await processarArquivoRpa(
                    filePath,
                    f,
                    scope,
                    parametros?.competencia
                  );
                  if (!importacao.success) throw new Error("Importação RPA recusada; revisão necessária.");
                }
              }
            } catch (errDb: any) {
              if (errDb instanceof ErroPoliticaPortal) throw errDb;
              throw new Error("Importação RPA recusada; revisão necessária.");
            }
          } else {
            logger.warn({
              message: `[${this.nome}] Timeout de 15 minutos atingido e o download parece não ter terminado.`,
            });
          }
        }
      } catch (err: any) {
        if (err instanceof ErroPoliticaPortal) throw err;
        throw new Error("Download ou importação RPA não concluído; revisão necessária.");
      }

      try {
        await this.validarAntesDeCredenciais(this.page);
        let fullHtml = await this.page.content();
        for (const frame of this.page.frames()) {
          try {
            await this.validarAntesDeCredenciais(frame);
            fullHtml += `\n\n--- FRAME HTML ---\n` + (await frame.content());
          } catch (e) {
            if (e instanceof ErroPoliticaPortal) throw e;
          }
        }
        fs.writeFileSync(
          path.join(downloadPath, `debug_html_${Date.now()}.txt`),
          fullHtml
        );
      } catch (e) {
        if (e instanceof ErroPoliticaPortal) throw e;
      }

      // 6. Capturar uma Screenshot Final
      const evFinal = await this.capturarEvidenciaTela(
        downloadPath,
        "resultado_unimed"
      );

      const resultado = {
        status: "sucesso",
        mensagem: `Robô Unimed navegou até os Demonstrativos e acionou o download de ${arquivosBaixados} arquivo(s) Excel.`,
        pastaDownload: downloadPath,
        arquivosBaixados: arquivosBaixados,
        screenshotSalva: evFinal.path,
        screenshotBase64: evFinal.base64,
      };

      if (!isProducao) {
        await this.delay(3000);
      }

      await this.assegurarPortalSemBloqueios(this.page);
      return resultado;
    } catch (error: any) {
      throw error;
    } finally {
      await this.fecharBrowser();
    }
  }
}
