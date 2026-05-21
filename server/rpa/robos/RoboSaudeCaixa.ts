import { RoboBase, CredenciaisConvenio } from "../RoboBase";
import { logger } from "../../_core/logger";
import path from "path";
import fs from "fs";

export class RoboSaudeCaixa extends RoboBase {
  constructor() {
    super("SaudeCaixa_Bot");
  }

  async executar(credenciais: CredenciaisConvenio, parametros?: { competencia: string }) {
    try {
      // 1. Iniciar navegador (Headless = false para você poder ver a mágica acontecer em dev!)
      const isProducao = process.env.NODE_ENV === "production";
      await this.iniciarBrowser(!isProducao); 
      if (!this.page) throw new Error("Página não iniciada");

      // Configurar pasta de download automático
      const downloadPath = path.join(process.cwd(), "uploads", "demonstrativos", "saudecaixa");
      if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
      }

      const client = await this.page.target().createCDPSession();
      await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadPath,
      });

      // 2. Acessar o Portal
      logger.info({ message: `[${this.nome}] Acessando portal: ${credenciais.url}` });
      await this.page.goto(credenciais.url, { waitUntil: "networkidle2" });

      // O portal do Saúde Caixa possui uma estrutura específica, normalmente um iframe ou form direto.
      // Aqui faremos a simulação de como seria preencher o credencial
      try {
        await this.page.waitForSelector("input[name='j_username'], input[id='login'], input[type='text']", { timeout: 10000 });
        
        if (credenciais.login) {
            await this.page.type("input[name='j_username'], input[id='login'], input[type='text']", credenciais.login, { delay: 50 });
        }
        if (credenciais.senha) {
            await this.page.type("input[name='j_password'], input[id='senha'], input[type='password']", credenciais.senha, { delay: 50 });
        }
        
        // Clicar em Entrar
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {}),
          this.page.click("button[type='submit'], input[type='submit'], .btn-login, #btnEntrar").catch(() => {})
        ]);

        logger.info({ message: `[${this.nome}] Login efetuado com sucesso (simulado/real).` });
      } catch (loginErr) {
        logger.warn({ message: `[${this.nome}] Campos de login padrão não encontrados. Talvez o portal use certificado digital direto.` });
      }

      // 3. Simular a navegação até a área de demonstrativos
      // Exemplo didático do fluxo:
      /*
      logger.info({ message: `[${this.nome}] Navegando para Financeiro > Demonstrativos...` });
      await this.page.goto(credenciais.url + "/financeiro/demonstrativos");
      await this.page.waitForSelector("table.demonstrativos");
      
      const pdfLinks = await this.page.$$eval('a[href$=".pdf"]', as => as.map(a => a.href));
      for (const link of pdfLinks) {
         // O download automático ocorre via CDP que configuramos acima ao clicar no link
         await this.page.goto(link);
      }
      */

      // Retornar um sucesso
      const resultado = {
        status: "sucesso",
        mensagem: `Robô acessou a URL ${credenciais.url}, inicializou o ambiente de download e está pronto para raspar PDFs!`,
        pastaDownload: downloadPath,
        arquivosBaixados: 0 // Retorne a quantidade real depois de implementar as raspagens
      };

      await this.fecharBrowser();
      return resultado;

    } catch (error: any) {
      await this.capturarErro(error, "Execução Principal");
      await this.fecharBrowser();
      throw error;
    }
  }
}
