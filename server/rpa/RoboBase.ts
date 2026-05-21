import puppeteer, { Browser, Page } from "puppeteer";
import { logger } from "../_core/logger";

export interface CredenciaisConvenio {
  login?: string;
  senha?: string;
  url: string;
  estabelecimentoId?: number | null;
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
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
      defaultViewport: { width: 1280, height: 800 }
    });
    this.page = await this.browser.newPage();
    
    // Evitar detecção básica
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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

  protected async capturarErro(erro: Error, passo: string) {
    if (this.page) {
      try {
        const screenshot = await this.page.screenshot({ encoding: "base64" });
        logger.error({
          message: `Erro no robô ${this.nome} durante o passo: ${passo}`,
          error: erro.message,
          screenshot: "Base64 (disponível no log)",
        });
      } catch(e) {
        // Se a página já fechou, apenas logue
        logger.error({
          message: `Erro no robô ${this.nome} durante o passo: ${passo}`,
          error: erro.message,
        });
      }
    }
    throw new Error(`[${this.nome}] Falha no passo '${passo}': ${erro.message}`);
  }

  /** Aguarda um tempo em milissegundos (substitui page.waitForTimeout que foi removido do Puppeteer) */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  abstract executar(credenciais: CredenciaisConvenio, parametros?: any): Promise<any>;
}
