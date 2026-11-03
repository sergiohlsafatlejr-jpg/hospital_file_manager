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
import { getDb } from "../../db";
import { arquivos } from "../../../drizzle/schema";
import { like } from "drizzle-orm";

export class RoboUnimed extends RoboBase {
  constructor() {
    super("Unimed_Bot");
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

    const urlAlvo =
      credenciais.url ||
      "https://www.unimedgoiania.coop.br/wps/portal/usuariosunimed";
    logger.info({
      message: `[${this.nome}] Acessando portal da Unimed: ${urlAlvo} (Estab #${credenciais.estabelecimentoId || "N/A"})`,
    });

    await this.page.goto(urlAlvo, {
      waitUntil: "networkidle2",
      timeout: 45000,
    });
    await this.delay(2000);

    // Clicar em "Credenciado" ou "Prestador" caso o portal exiba seleção de perfil inicial
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
    } catch {
      //Segue fluxo normal se não houver botão de perfil
    }

    // Caso tenha aberto uma nova aba após clicar em Credenciado, focar na última aba
    const abas = await this.page.browser().pages();
    if (abas.length > 1) {
      this.page = abas[abas.length - 1];
      await this.delay(1500);
    }

    const seletorLogin =
      "input[name*='login' i], input[name*='usuario' i], input[name*='user' i], input[id*='usuario' i], input[id*='login' i], input[placeholder*='usuário' i], input[placeholder*='login' i], input[placeholder*='código' i], input[type='text']";
    const seletorSenha =
      "input[type='password'], input[name*='senha' i], input[id*='senha' i], input[name*='pass' i]";

    let preencheuLogin = false;

    // Tenta preencher na página principal ou em qualquer iframe do portal
    const contextos = [this.page, ...this.page.frames()];
    for (const ctx of contextos) {
      try {
        const campoUsuario = await ctx.$(seletorLogin);
        const campoSenha = await ctx.$(seletorSenha);
        if (campoUsuario && campoSenha) {
          if (credenciais.login) {
            await campoUsuario.click({ count: 3 }).catch(() => {});
            await campoUsuario.type(credenciais.login, { delay: 40 });
          }
          if (credenciais.senha) {
            await campoSenha.click({ count: 3 }).catch(() => {});
            await campoSenha.type(credenciais.senha, { delay: 40 });
          }

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
      } catch {
        // Ignora frames cross-origin inacessíveis
      }
    }

    await this.delay(3500);

    // Verificar imediatamente se o portal retornou erro de Usuário ou Senha Inválidos (Trava Anti-Bloqueio)
    let textoPagina = "";
    try {
      textoPagina = await this.page.evaluate(() => document.body?.innerText || "");
      for (const frame of this.page.frames()) {
        try {
          textoPagina += "\n" + (await frame.evaluate(() => document.body?.innerText || ""));
        } catch {}
      }
    } catch {}

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

    // 1. Se houver URL direta de envio de XML configurada nos parâmetros extras da credencial
    const urlDiretaXml = credenciais.parametrosExtras?.urlEnvioXml;
    if (urlDiretaXml && typeof urlDiretaXml === "string" && urlDiretaXml.startsWith("http")) {
      await this.page
        .goto(urlDiretaXml, { waitUntil: "networkidle2", timeout: 30000 })
        .catch(() => {});
      await this.delay(2500);
      return {
        encontrouMenuOuInput: true,
        detalheNavegacao: `Navegou para URL direta de envio XML: ${urlDiretaXml}`,
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
      } catch {}
    }

    // Se não achou direto o submenu, clica no menu pai (ex: Faturamento / TISS) e depois no submenu
    if (!clicouAlgumMenu) {
      for (const ctx of todosContextos) {
        try {
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
        } catch {}
      }

      // Segunda passagem após expandir o menu pai
      if (clicouAlgumMenu) {
        for (const ctx of [this.page, ...this.page.frames()]) {
          try {
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
          } catch {}
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

    try {
      const isProducaoNode = process.env.NODE_ENV === "production";
      await this.iniciarBrowser(isProducaoNode);
      if (!this.page) throw new Error("Página não iniciada");

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
        try {
          if (!fs.existsSync(lote.caminhoXml)) {
            resultadosLotes.push({
              filaId: lote.filaId,
              numeroLote: lote.numeroLote,
              sucesso: false,
              status: "ERRO_ROBO",
              mensagem: `Arquivo XML não encontrado no servidor: ${lote.caminhoXml}`,
            });
            continue;
          }

          // Localizar input[type='file'] na página ou em qualquer iframe do portal Unimed
          let inputFileHandle: any = null;
          let contextoAlvo: any = this.page;

          for (const ctx of [this.page, ...this.page.frames()]) {
            try {
              const handle = await ctx.$("input[type='file']");
              if (handle) {
                inputFileHandle = handle;
                contextoAlvo = ctx;
                break;
              }
            } catch {}
          }

          if (inputFileHandle) {
            await inputFileHandle.uploadFile(lote.caminhoXml);
            await this.delay(1500);
          }

          // MODO SIMULAÇÃO (DRY-RUN): Valida login, navegação e anexo sem clicar no botão final de transmissão!
          if (modoExecucao === "simulacao") {
            const evSim = await this.capturarEvidenciaTela(
              pastaEvidencias,
              `simulacao_lote_${lote.numeroLote}_fila_${lote.filaId}`
            );
            resultadosLotes.push({
              filaId: lote.filaId,
              numeroLote: lote.numeroLote,
              sucesso: true,
              status: "SIMULADO_OK",
              protocolo: `SIMULACAO-OK-${lote.numeroLote}`,
              mensagem: inputFileHandle
                ? `Simulação concluída com sucesso! Login validado e arquivo "${lote.nomeArquivo}" anexado no campo de upload do portal Unimed (sem disparar transmissão final).`
                : `Simulação de sessão concluída! Login realizado no portal Unimed (${navInfo.detalheNavegacao}). Verifique o print da tela para mapear o seletor de upload se necessário.`,
              evidenciaPath: evSim.path,
              screenshotBase64: evSim.base64,
            });
            continue;
          }

          // MODO PRODUÇÃO: Exige o input[type='file'] e clica no botão de Enviar/Transmitir
          if (!inputFileHandle) {
            const evNoInput = await this.capturarEvidenciaTela(
              pastaEvidencias,
              `sem_input_file_lote_${lote.numeroLote}`
            );
            resultadosLotes.push({
              filaId: lote.filaId,
              numeroLote: lote.numeroLote,
              sucesso: false,
              status: "ERRO_PORTAL",
              mensagem:
                "Campo de anexo XML (input[type='file']) não foi localizado na tela atual do portal Unimed. Confira o print da tela.",
              evidenciaPath: evNoInput.path,
              screenshotBase64: evNoInput.base64,
            });
            continue;
          }

          // Clicar no botão de Enviar / Transmitir XML
          await Promise.all([
            this.page
              .waitForNavigation({ waitUntil: "networkidle2", timeout: 25000 })
              .catch(() => {}),
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
              }
            }),
          ]);

          await this.delay(5000);

          // Capturar evidência pós-envio
          const evEnvio = await this.capturarEvidenciaTela(
            pastaEvidencias,
            `comprovante_lote_${lote.numeroLote}_fila_${lote.filaId}`
          );

          // Ler texto de retorno na página e nos iframes para extrair protocolo ou crítica TISS
          const analiseRetorno = await contextoAlvo.evaluate(() => {
            const elSucesso = document.querySelector(
              "#box-protocolo-sucesso, #numero-protocolo, .protocolo-sucesso, .alert-success"
            );
            const elErro = document.querySelector(
              ".alerta-erro-xml, .alert-danger, .erro-validacao, .msg-erro, .error"
            );
            const bodyText = document.body?.innerText || "";
            return {
              textoSucesso: elSucesso?.textContent?.trim() || "",
              textoErro: elErro?.textContent?.trim() || "",
              bodyText: bodyText.slice(0, 6000),
            };
          });

          const regexProtocolo =
            /(?:protocolo|n[º°o]\s*do\s*lote|recibo|transa[cç][aã]o)\s*(?:de\s*envio|gerado|n[º°o.])?\s*[:#-]?\s*([0-9]{4,25})/i;
          const matchProt =
            regexProtocolo.exec(analiseRetorno.textoSucesso) ||
            regexProtocolo.exec(analiseRetorno.bodyText);

          if (analiseRetorno.textoErro && !matchProt) {
            resultadosLotes.push({
              filaId: lote.filaId,
              numeroLote: lote.numeroLote,
              sucesso: false,
              status: "ERRO_PORTAL",
              mensagem: `Crítica do Portal Unimed: ${analiseRetorno.textoErro}`,
              evidenciaPath: evEnvio.path,
              screenshotBase64: evEnvio.base64,
            });
          } else if (matchProt) {
            const protocoloExtraido = matchProt[1];
            resultadosLotes.push({
              filaId: lote.filaId,
              numeroLote: lote.numeroLote,
              sucesso: true,
              status: "PROTOCOLADO",
              protocolo: protocoloExtraido,
              mensagem: `Lote XML enviado e protocolado com sucesso na Unimed! Protocolo: ${protocoloExtraido}`,
              evidenciaPath: evEnvio.path,
              screenshotBase64: evEnvio.base64,
            });
          } else if (
            /(?:em\s*processamento|aguardando\s*processamento|recebido\s*para\s*validador)/i.test(
              analiseRetorno.bodyText
            )
          ) {
            resultadosLotes.push({
              filaId: lote.filaId,
              numeroLote: lote.numeroLote,
              sucesso: true,
              status: "AGUARDANDO_PORTAL",
              mensagem:
                "Arquivo XML recebido pelo portal Unimed e colocado na fila interna da operadora ('Em processamento').",
              evidenciaPath: evEnvio.path,
              screenshotBase64: evEnvio.base64,
            });
          } else {
            resultadosLotes.push({
              filaId: lote.filaId,
              numeroLote: lote.numeroLote,
              sucesso: false,
              status: "ERRO_PORTAL",
              mensagem:
                "O arquivo foi submetido, mas não foi possível identificar o número de protocolo automaticamente na resposta. Verifique o print da tela.",
              evidenciaPath: evEnvio.path,
              screenshotBase64: evEnvio.base64,
            });
          }
        } catch (erroLote: any) {
          const evErro = await this.capturarEvidenciaTela(
            pastaEvidencias,
            `erro_lote_${lote.numeroLote}`
          );
          resultadosLotes.push({
            filaId: lote.filaId,
            numeroLote: lote.numeroLote,
            sucesso: false,
            status: "ERRO_ROBO",
            mensagem: `Falha técnica ao processar lote ${lote.numeroLote}: ${erroLote.message}`,
            evidenciaPath: evErro.path,
            screenshotBase64: evErro.base64,
          });
        }
      }

      return {
        estabelecimentoId: estabId,
        convenioId: convId,
        loginSucesso: true,
        mensagemLogin: statusLogin.mensagem,
        screenshotLoginBase64: statusLogin.screenshotBase64 || null,
        resultadosLotes,
      };
    } finally {
      // Fecha o navegador limpando 100% dos cookies antes de logar no próximo Hospital
      await this.fecharBrowser();
    }
  }

  async executar(
    credenciais: CredenciaisConvenio,
    parametros?: { competencia: string }
  ) {
    try {
      // 1. Iniciar navegador (Headless = false para você ver o robô agir na tela durante o dev)
      const isProducao = process.env.NODE_ENV === "production";
      await this.iniciarBrowser(!isProducao);
      if (!this.page) throw new Error("Página não iniciada");

      // Configurar pasta de download automático
      const downloadPath = path.join(
        process.cwd(),
        "uploads",
        "demonstrativos",
        "unimed"
      );
      if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
      }

      const client = await this.page.target().createCDPSession();
      await client.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: downloadPath,
      });

      // 2. Acessar o Portal da Unimed Goiânia
      const urlAlvo =
        credenciais.url ||
        "https://www.unimedgoiania.coop.br/wps/portal/usuariosunimed";
      logger.info({
        message: `[${this.nome}] Acessando portal da Unimed: ${urlAlvo}`,
      });

      await this.page.goto(urlAlvo, { waitUntil: "networkidle2" });

      // 3. Clicar em "Credenciado" e Fazer Login
      try {
        logger.info({
          message: `[${this.nome}] Buscando botão de Credenciado...`,
        });

        await this.page.evaluate(() => {
          const els = Array.from(
            document.querySelectorAll("a, button, span, div.box, div.icone")
          );
          const btn = els.find(
            (el) => el.textContent?.trim().toLowerCase() === "credenciado"
          );
          if (btn && (btn as HTMLElement).click) {
            (btn as HTMLElement).click();
          }
        });

        await new Promise((r) => setTimeout(r, 4000));

        await this.page.waitForSelector(
          "input[type='text'], input[name*='login'], input[name*='usuario'], input[id*='usuario'], input[id*='login']",
          { timeout: 10000, visible: true }
        );

        if (credenciais.login) {
          await this.page.type(
            "input[type='text'], input[name*='login'], input[name*='usuario'], input[id*='usuario'], input[id*='login']",
            credenciais.login,
            { delay: 50 }
          );
        }
        if (credenciais.senha) {
          await this.page.type(
            "input[type='password'], input[name*='senha'], input[id*='senha']",
            credenciais.senha,
            { delay: 50 }
          );
        }

        await Promise.all([
          this.page
            .waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 })
            .catch(() => {}),
          this.page.evaluate(() => {
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
                text.includes("efetuar login") ||
                val === "entrar" ||
                val.includes("efetuar login") ||
                id.includes("login.button")
              );
            });
            if (enterBtn && (enterBtn as HTMLElement).click)
              (enterBtn as HTMLElement).click();
          }),
        ]);

        logger.info({
          message: `[${this.nome}] Login efetuado com sucesso no portal da Unimed.`,
        });
      } catch (loginErr: any) {
        logger.warn({
          message: `[${this.nome}] Falha ao logar. Erro: ${loginErr.message}`,
        });
        const errPath = path.join(downloadPath, `erro_login_${Date.now()}.png`);
        await this.page.screenshot({ path: errPath, fullPage: true });
        throw new Error(
          "Não foi possível encontrar os campos de login na Unimed Goiânia. Verifique o print."
        );
      }

      // 4. Navegar até Demonstrativo de Pagamento
      try {
        logger.info({
          message: `[${this.nome}] Navegando para Demonstrativo de Pagamento...`,
        });
        await this.page.waitForSelector("body", { timeout: 10000 });

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
          } catch (e) {}
        }

        logger.info({
          message: `[${this.nome}] Aguardando resultados da tabela...`,
        });
        await new Promise((r) => setTimeout(r, 6000));

        logger.info({
          message: `[${this.nome}] Buscando botões de Extrato XLSX na tabela (em todos os frames)...`,
        });

        let arquivosBaixadosDaVez = 0;
        const db = await getDb();

        for (const frame of this.page.frames()) {
          try {
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
                  await new Promise((r) => setTimeout(r, 2000));
                }
              }
            }
          } catch (e) {}
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
            await new Promise((r) => setTimeout(r, 10000));
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
              const arquivosNaPastaFinal = fs.readdirSync(downloadPath);
              const tempoLimite = Date.now() - 16 * 60 * 1000;
              const xlsNovos = arquivosNaPastaFinal.filter((f) => {
                if (!f.endsWith(".xls") && !f.endsWith(".xlsx")) return false;
                const stat = fs.statSync(path.join(downloadPath, f));
                return stat.mtimeMs > tempoLimite;
              });

              if (xlsNovos.length > 0) {
                logger.info({
                  message: `[${this.nome}] Encontrados ${xlsNovos.length} arquivos XLS/XLSX recentes. Iniciando injeção no banco...`,
                });

                let idConvenio = 1;
                const { convenios } = await import("../../../drizzle/schema");
                const drizzleDb = await getDb();
                if (drizzleDb) {
                  const conveniosDb = await drizzleDb
                    .select()
                    .from(convenios)
                    .where(like(convenios.nome, "%Unimed%Goiânia%"));
                  if (conveniosDb.length > 0) {
                    idConvenio = conveniosDb[0].id;
                  } else {
                    const conveniosDb2 = await drizzleDb
                      .select()
                      .from(convenios)
                      .where(like(convenios.nome, "%Unimed%"));
                    if (conveniosDb2.length > 0) {
                      idConvenio = conveniosDb2[0].id;
                    }
                  }
                }

                const { processarArquivoRpa } = await import("../importador");

                for (const f of xlsNovos) {
                  const filePath = path.join(downloadPath, f);
                  await processarArquivoRpa(
                    filePath,
                    f,
                    idConvenio,
                    parametros?.competencia,
                    credenciais.estabelecimentoId
                  );
                }
              }
            } catch (errDb: any) {
              logger.error({
                message: `[${this.nome}] Erro ao injetar arquivos no banco: ${errDb.message}`,
              });
            }
          } else {
            logger.warn({
              message: `[${this.nome}] Timeout de 15 minutos atingido e o download parece não ter terminado.`,
            });
          }
        }
      } catch (err: any) {
        logger.warn({
          message: `[${this.nome}] Erro ao tentar baixar XLS: ${err.message}`,
        });
      }

      try {
        let fullHtml = await this.page.content();
        for (const frame of this.page.frames()) {
          try {
            fullHtml += `\n\n--- FRAME HTML ---\n` + (await frame.content());
          } catch (e) {}
        }
        fs.writeFileSync(
          path.join(downloadPath, `debug_html_${Date.now()}.txt`),
          fullHtml
        );
      } catch (e) {}

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
        await new Promise((r) => setTimeout(r, 3000));
      }

      await this.fecharBrowser();
      return resultado;
    } catch (error: any) {
      await this.capturarErro(error, "Execução Principal - Unimed");
      await this.fecharBrowser();
      throw error;
    }
  }
}
