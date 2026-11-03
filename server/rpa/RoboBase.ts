import puppeteer, { Browser, Page } from "puppeteer";
import fs from "fs";
import path from "path";
import { logger } from "../_core/logger";

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

  constructor(nome: string) {
    this.nome = nome;
  }

  protected async iniciarBrowser(headless: boolean = true) {
    logger.info({ message: `Iniciando robô RPA: ${this.nome}` });
    this.browser = await puppeteer.launch({
      headless,
      ignoreHTTPSErrors: true, // Ignorar problemas de SSL comuns em portais de saúde antigos
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
