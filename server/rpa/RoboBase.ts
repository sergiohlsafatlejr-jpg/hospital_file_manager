import puppeteer, { Browser, Page } from "puppeteer";
import fs from "fs";
import path from "path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { logger } from "../_core/logger";
import { validarScopeRpa, type RpaImportadorScope } from "./rpaImportadorScope";
import type { Frame } from "puppeteer";
import {
  assegurarPoliticaPortalSemBloqueios,
  configurarPoliticaPortal,
  validarContextoPortalAntesDeCredenciais,
  type DependenciasPoliticaPortal,
} from "./rpaPortalPolicy";

export interface ParametrosExtrasCredencial {
  cnpj?: string;
  cpf?: string;
  codigoReferenciado?: string;
  operadora?: string;
  selecionarUnidade?: string;
  urlEnvioXml?: string;
  [chave: string]: any;
}

export interface CredenciaisConvenio {
  login?: string;
  senha?: string;
  url: string;
  estabelecimentoId?: number | null;
  convenioId?: number | null;
  codigoPrestadorOperadora?: string | null;
  registroAns?: string | null;
  parametrosExtras?: ParametrosExtrasCredencial | null;
}

export interface LoteParaEnvioRpa {
  filaId: number;
  numeroLote: string;
  nomeArquivo: string;
  caminhoXml: string;
  qtdGuias?: number;
  valorTotal?: number;
  fabricaContaId?: number | null;
}

export interface ResultadoEnvioLoteRpa {
  filaId: number;
  numeroLote: string;
  sucesso: boolean;
  status:
    | "SIMULADO_OK"
    | "PROTOCOLADO"
    | "AGUARDANDO_PORTAL"
    | "ERRO_PORTAL"
    | "ERRO_CREDENCIAL"
    | "ERRO_ROBO";
  protocolo?: string | null;
  idRecebimento?: string | null;
  mensagem: string;
  evidenciaPath?: string | null;
  screenshotBase64?: string | null;
  /** false apenas com prova pré-upload; upload pode transmitir automaticamente. */
  envioIniciado?: boolean;
}

export interface ResultadoCicloGrupoRpa {
  estabelecimentoId: number;
  convenioId: number;
  loginSucesso: boolean;
  credencialInvalida?: boolean;
  mensagemLogin?: string;
  screenshotLoginBase64?: string | null;
  resultadosLotes: ResultadoEnvioLoteRpa[];
}

export abstract class RoboBase {
  protected browser: Browser | null = null;
  protected page: Page | null = null;
  public nome: string;
  private namespaceDownloadRpa: string;
  private diretorioDownloadRpa?: string;

  constructor(nome: string) {
    this.nome = nome;
    this.namespaceDownloadRpa = randomUUID();
  }

  /** Uma pasta 0700 por execução; nunca usar uploads públicos/compartilhados. */
  protected criarDiretorioDownloadRpa(scope: RpaImportadorScope): string {
    validarScopeRpa(scope);
    if (this.diretorioDownloadRpa) this.namespaceDownloadRpa = randomUUID();
    const raiz = path.resolve(os.tmpdir());
    const diretorio = path.resolve(raiz,
      `rpa_estab_${scope.estabelecimentoId}_conv_${scope.convenioId}_${this.namespaceDownloadRpa}`);
    if (path.dirname(diretorio) !== raiz) throw new Error("Diretório RPA fora do namespace privado");
    fs.mkdirSync(diretorio, { mode: 0o700 });
    this.diretorioDownloadRpa = diretorio;
    return diretorio;
  }

  /** Bloqueia traversal, subdiretórios e symlinks antes de listar/importar. */
  protected resolverArquivoDownloadRpa(diretorio: string, nome: string): string {
    if (diretorio !== this.diretorioDownloadRpa || !nome || path.basename(nome) !== nome) {
      throw new Error("Arquivo fora do namespace privado RPA");
    }
    const arquivo = path.resolve(diretorio, nome);
    if (path.dirname(arquivo) !== diretorio ||
        fs.realpathSync(diretorio) !== diretorio ||
        fs.realpathSync(arquivo) !== arquivo || !fs.lstatSync(arquivo).isFile()) {
      throw new Error("Arquivo fora do namespace privado RPA");
    }
    return arquivo;
  }

  /** Snapshot exato da entrada: jamais inferir IDs pelo nome da operadora. */
  protected criarScopeImportacaoRpa(credenciais: CredenciaisConvenio): Readonly<RpaImportadorScope> {
    const scope = {
      estabelecimentoId: credenciais.estabelecimentoId as number,
      convenioId: credenciais.convenioId as number,
      registroAns: credenciais.registroAns,
      codigoPrestadorOperadora: credenciais.codigoPrestadorOperadora,
    };
    try {
      validarScopeRpa(scope);
    } catch {
      throw new Error("Importação RPA exige hospital e convênio explícitos e válidos; revisão necessária.");
    }
    return Object.freeze(scope);
  }

  /** Configurar por operação, depois de iniciarBrowser e antes de qualquer goto. */
  protected async definirContextoPortal(
    convenio: string,
    credenciais: CredenciaisConvenio,
    dependencias?: DependenciasPoliticaPortal
  ): Promise<void> {
    if (!this.page) throw new Error("Página não iniciada");
    await configurarPoliticaPortal(this.page, { convenio, registroAns: credenciais.registroAns }, dependencias);
  }

  protected async validarAntesDeCredenciais(alvo: Page | Frame | null = this.page): Promise<void> {
    if (!alvo) throw new Error("Página não iniciada");
    await validarContextoPortalAntesDeCredenciais(alvo);
  }

  protected async assegurarPortalSemBloqueios(alvo: Page | null = this.page): Promise<void> {
    if (!alvo) throw new Error("Página não iniciada");
    await assegurarPoliticaPortalSemBloqueios(alvo);
  }

  protected async iniciarBrowser(headless: boolean = true) {
    logger.info({ message: `Iniciando robô RPA: ${this.nome}` });
    this.browser = await puppeteer.launch({
      headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--window-size=1366,800",
      ],
      defaultViewport: { width: 1366, height: 800 },
    });
    this.page = await this.browser.newPage();

    // Evitar detecção básica
    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
  }

  protected async fecharBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      logger.info({ message: `Robô ${this.nome} finalizado.` });
    }
  }

  protected async capturarEvidenciaTela(
    pastaDestino: string,
    prefixoArquivo: string,
    paginaAlvo?: Page | null
  ): Promise<{ path: string; base64: string }> {
    const pg = paginaAlvo || this.page;
    if (!pg) {
      return { path: "", base64: "" };
    }
    try {
      if (!fs.existsSync(pastaDestino)) {
        fs.mkdirSync(pastaDestino, { recursive: true });
      }
      const nomeArq = `${prefixoArquivo}_${Date.now()}.png`;
      const caminhoCompleto = path.join(pastaDestino, nomeArq);
      await pg.screenshot({ path: caminhoCompleto, fullPage: true });
      const buffer = fs.readFileSync(caminhoCompleto);
      const base64 = `data:image/png;base64,${buffer.toString("base64")}`;
      return { path: caminhoCompleto, base64 };
    } catch (e: any) {
      logger.warn({
        message: `[${this.nome}] Aviso ao capturar screenshot: ${e.message}`,
      });
      return { path: "", base64: "" };
    }
  }

  protected async capturarErro(erro: Error, passo: string) {
    if (this.page) {
      try {
        const screenshot = await this.page.screenshot({ encoding: "base64" });
        logger.error({
          message: `Erro no robô ${this.nome} durante o passo: ${passo}`,
          error: erro.message,
          screenshot: screenshot ? "Base64 capturado" : "indisponível",
        });
      } catch (e) {
        logger.error({
          message: `Erro no robô ${this.nome} durante o passo: ${passo}`,
          error: erro.message,
        });
      }
    }
    throw new Error(
      `[${this.nome}] Falha no passo '${passo}': ${erro.message}`
    );
  }

  /** Aguarda um tempo em milissegundos (substitui page.waitForTimeout que foi removido do Puppeteer) */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  abstract executar(
    credenciais: CredenciaisConvenio,
    parametros?: any
  ): Promise<any>;

  /**
   * Envia múltiplos lotes XML TISS na mesma sessão autenticada para um (estabelecimentoId, convenioId)
   */
  async enviarLotesXml(
    _credenciais: CredenciaisConvenio,
    _lotes: LoteParaEnvioRpa[],
    _opcoes?: { modoExecucao?: "simulacao" | "producao" }
  ): Promise<ResultadoCicloGrupoRpa> {
    throw new Error(
      `O robô ${this.nome} ainda não possui o adaptador enviarLotesXml configurado.`
    );
  }
}
