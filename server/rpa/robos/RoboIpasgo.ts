import { RoboBase, CredenciaisConvenio } from '../RoboBase';
import { logger } from '../../_core/logger';
import path from 'path';
import fs from 'fs';
import { getDb } from '../../db';
import { like } from 'drizzle-orm';

export class RoboIpasgo extends RoboBase {
  constructor() {
    super('Ipasgo_Bot');
  }

  async executar(credenciais: CredenciaisConvenio, parametros?: { competencia: string }) {
    let arquivosBaixados = 0;

    try {
      const isProducao = process.env.NODE_ENV === 'production';
      await this.iniciarBrowser(!isProducao);
      if (!this.page) throw new Error('Pagina nao iniciada');

      const downloadPath = path.join(process.cwd(), 'uploads', 'demonstrativos', 'ipasgo');
      if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
      }

      const client = await this.page.target().createCDPSession();
      await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadPath
      });

      // ====== PASSO 1: Ir direto para a pagina de login do Prestador ======
      // URL correta: PrestadorLogin.aspx (NAO Common.PrestadorLogin.aspx)
      const urlLogin = 'https://portalos.ipasgo.go.gov.br/Portal_Dominio/PrestadorLogin.aspx';
      logger.info({ message: `[${this.nome}] Acessando login do Prestador IPASGO: ${urlLogin}` });
      await this.page.goto(urlLogin, { waitUntil: 'networkidle2', timeout: 60000 });
      await this.delay(3000);

      // Verificar se caiu na pagina "InvalidTipoUsuario" (precisa clicar em "Prestador")
      const currentUrl = this.page.url();
      if (currentUrl.includes('InvalidTipoUsuario')) {
        logger.info({ message: `[${this.nome}] Pagina de selecao de tipo. Clicando em "Prestador"...` });
        const prestadorClicked = await this.page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a'));
          for (const a of links) {
            const text = (a.textContent || '').trim().toLowerCase();
            if (text === 'prestador') {
              a.click();
              return true;
            }
          }
          return false;
        });
        if (prestadorClicked) {
          logger.info({ message: `[${this.nome}] Link "Prestador" clicado. Aguardando...` });
          await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
          await this.delay(3000);
        }
      }

      // ====== PASSO 2: Preencher usuario e senha ======
      logger.info({ message: `[${this.nome}] Preenchendo credenciais de login...` });

      // IDs OutSystems do portal IPASGO
      const loginSelector = '#SilkUIFramework_wt13_block_wtUsername_wtUserNameInput2';
      const senhaSelector = '#SilkUIFramework_wt13_block_wtPassword_wtPasswordInput';
      const entrarSelector = '#SilkUIFramework_wt13_block_wtAction_wtLoginButton';

      // Tentar seletores exatos, depois fallback
      let loginField = await this.page.$(loginSelector);
      if (!loginField) loginField = await this.page.$('input[placeholder*="suario"]');
      if (!loginField) loginField = await this.page.$('input[type="text"]:not([style*="display:none"])');

      let senhaField = await this.page.$(senhaSelector);
      if (!senhaField) senhaField = await this.page.$('input[type="password"]');

      let entrarBtn = await this.page.$(entrarSelector);
      if (!entrarBtn) entrarBtn = await this.page.$('input[value="Entrar"]');
      if (!entrarBtn) entrarBtn = await this.page.$('input[type="submit"]');

      if (!loginField || !senhaField) {
        const debugPath = path.join(downloadPath, `debug_login_${Date.now()}.png`);
        await this.page.screenshot({ path: debugPath, fullPage: true });
        const html = await this.page.content();
        fs.writeFileSync(path.join(downloadPath, `debug_login_html_${Date.now()}.txt`), html);
        logger.error({ message: `[${this.nome}] Campos de login nao encontrados. URL atual: ${this.page.url()}` });
        throw new Error('Campos de login/senha nao encontrados');
      }

      await loginField.click({ clickCount: 3 });
      await loginField.type(credenciais.login || '', { delay: 50 });
      await this.delay(500);
      await senhaField.click({ clickCount: 3 });
      await senhaField.type(credenciais.senha || '', { delay: 50 });
      await this.delay(500);

      if (entrarBtn) {
        await entrarBtn.click();
        logger.info({ message: `[${this.nome}] Botao Entrar clicado` });
      }

      await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await this.delay(4000);

      // ====== PASSO 3: Tratar modal "Senha Expirada" - Clicar em "Nao" ======
      logger.info({ message: `[${this.nome}] Verificando modal de Senha Expirada...` });
      try {
        const naoClicked = await this.page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('a, button, input, span, div'));
          for (const el of els) {
            const text = (el.textContent || '').trim();
            if (text === 'N\u00e3o' || text === 'Nao' || text === 'n\u00e3o' || text === 'nao') {
              (el as HTMLElement).click();
              return true;
            }
          }
          return false;
        });
        if (naoClicked) {
          logger.info({ message: `[${this.nome}] Modal "Senha Expirada" fechado` });
          await this.delay(3000);
        }
      } catch (e) {
        logger.info({ message: `[${this.nome}] Sem modal de senha expirada` });
      }

      // ====== PASSO 4: Tratar modal "Atualizacao Cadastral" - Clicar em "Sair" ======
      await this.delay(2000);
      try {
        const sairClicked = await this.page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('a, button, input, span'));
          for (const el of els) {
            const text = (el.textContent || '').trim();
            const val = ((el as HTMLInputElement).value || '').trim();
            if (text === 'Sair' || text === 'sair' || val === 'Sair' || val === 'sair') {
              (el as HTMLElement).click();
              return true;
            }
          }
          return false;
        });
        if (sairClicked) {
          logger.info({ message: `[${this.nome}] Modal "Atualizacao Cadastral" fechado` });
          await this.delay(3000);
        }
      } catch (e) {
        logger.info({ message: `[${this.nome}] Sem modal de atualizacao cadastral` });
      }

      // Screenshot do dashboard logado
      await this.page.screenshot({ path: path.join(downloadPath, `dashboard_ipasgo_${Date.now()}.png`), fullPage: true });
      const dashHtml = await this.page.content();
      fs.writeFileSync(path.join(downloadPath, `dashboard_html_${Date.now()}.txt`), dashHtml);
      logger.info({ message: `[${this.nome}] Dashboard logado. URL: ${this.page.url()}` });

      // ====== PASSO 5: Clicar em "Portal WebPlan" na secao Faturas Eletronicas ======
      logger.info({ message: `[${this.nome}] Navegando para Portal WebPlan...` });

      const webplanClicked = await this.page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        for (const a of links) {
          const text = (a.textContent || '').trim();
          if (text.toLowerCase().includes('portal webplan') || text.toLowerCase() === 'webplan') {
            // Pode abrir em nova aba, entao forcar target
            a.setAttribute('target', '_blank');
            a.click();
            return a.href || true;
          }
        }
        return false;
      });

      if (webplanClicked) {
        logger.info({ message: `[${this.nome}] Link "Portal WebPlan" clicado. URL: ${webplanClicked}` });
      } else {
        logger.warn({ message: `[${this.nome}] Link "Portal WebPlan" nao encontrado` });
        await this.page.screenshot({ path: path.join(downloadPath, `debug_nowebplan_${Date.now()}.png`), fullPage: true });
      }

      await this.delay(5000);

      // Verificar se abriu nova aba (WebPlan geralmente abre em nova aba)
      const pages = await this.page.browser().pages();
      let webplanPage = this.page;
      if (pages.length > 1) {
        // Pegar a aba que contem "novowebplanipasgo" ou "facilinformatica"
        for (const p of pages) {
          const pUrl = p.url();
          if (pUrl.includes('webplan') || pUrl.includes('facilinformatica') || pUrl.includes('GuiasTISS')) {
            webplanPage = p;
            break;
          }
        }
        if (webplanPage === this.page) {
          webplanPage = pages[pages.length - 1]; // Fallback: ultima aba
        }
        logger.info({ message: `[${this.nome}] WebPlan em nova aba. URL: ${webplanPage.url()}` });

        const newClient = await webplanPage.target().createCDPSession();
        await newClient.send('Page.setDownloadBehavior', {
          behavior: 'allow',
          downloadPath: downloadPath
        });
      }

      await webplanPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await this.delay(3000);

      // Se nao abriu nova aba e nao navegou, tentar ir direto pro WebPlan
      const wpUrl = webplanPage.url();
      if (!wpUrl.includes('webplan') && !wpUrl.includes('facilinformatica') && !wpUrl.includes('GuiasTISS')) {
        logger.info({ message: `[${this.nome}] WebPlan nao abriu automaticamente. Tentando URL direta...` });
        await webplanPage.goto('https://novowebplanipasgo.facilinformatica.com.br/GuiasTISS/Home', { waitUntil: 'networkidle2', timeout: 30000 });
        await this.delay(3000);
      }

      // Screenshot do WebPlan
      await webplanPage.screenshot({ path: path.join(downloadPath, `webplan_home_${Date.now()}.png`), fullPage: true });
      logger.info({ message: `[${this.nome}] WebPlan carregado. URL: ${webplanPage.url()}` });

      // ====== PASSO 6: Clicar em "Faturas" no menu superior do WebPlan ======
      // Menu superior: Meus Servicos | Guias | Relatorios | ... | Faturas | Sair
      logger.info({ message: `[${this.nome}] Clicando em "Faturas" no menu do WebPlan...` });

      // Procurar o link/elemento "Faturas" no menu superior (pode ser <a> ou <span> dentro de <a>)
      const faturasClicked = await webplanPage.evaluate(() => {
        // Buscar todos os elementos clicaveis
        const els = Array.from(document.querySelectorAll('a, span, li, div'));
        for (const el of els) {
          const text = (el.textContent || '').trim();
          // Precisa ser exatamente "Faturas" (nao "Relatório de Faturas")
          if (text === 'Faturas') {
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (faturasClicked) {
        logger.info({ message: `[${this.nome}] Menu "Faturas" clicado. Aguardando dropdown...` });
      } else {
        logger.warn({ message: `[${this.nome}] Menu "Faturas" nao encontrado` });
        const html = await webplanPage.content();
        fs.writeFileSync(path.join(downloadPath, `debug_faturas_html_${Date.now()}.txt`), html);
        await webplanPage.screenshot({ path: path.join(downloadPath, `debug_faturas_${Date.now()}.png`), fullPage: true });
      }
      await this.delay(2000);

      // ====== PASSO 7: Clicar em "Relatorio de Faturas" no dropdown ======
      // O dropdown mostra: "Relatório de Faturas" e "Dados de Faturamento do Prestador"
      logger.info({ message: `[${this.nome}] Clicando em "Relatorio de Faturas"...` });

      // Screenshot do dropdown aberto
      await webplanPage.screenshot({ path: path.join(downloadPath, `dropdown_faturas_${Date.now()}.png`), fullPage: true });

      let relatorioClicked = await webplanPage.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        for (const a of links) {
          const text = (a.textContent || '').trim().toLowerCase();
          // Buscar "relatório de faturas" (plural) ou "relatório de fatura" (singular)
          if (text.includes('relat') && text.includes('fatura')) {
            a.click();
            return true;
          }
        }
        return false;
      });

      if (relatorioClicked) {
        logger.info({ message: `[${this.nome}] "Relatorio de Faturas" clicado` });
        await webplanPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      } else {
        // Fallback: navegar direto para a URL do relatorio
        logger.info({ message: `[${this.nome}] Dropdown nao encontrado. Navegando direto...` });
        await webplanPage.goto('https://novowebplanipasgo.facilinformatica.com.br/GuiasTISS/Relatorios/ViewRelatorioServicos', {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
      }

      await this.delay(3000);
      await webplanPage.screenshot({ path: path.join(downloadPath, `relatorio_fatura_${Date.now()}.png`), fullPage: true });
      logger.info({ message: `[${this.nome}] Pagina de Relatorio. URL: ${webplanPage.url()}` });

      // ====== PASSO 8: Clicar em "Pesquisar" ======
      logger.info({ message: `[${this.nome}] Clicando em "Pesquisar"...` });

      const pesquisarClicked = await webplanPage.evaluate(() => {
        // Buscar botao "Pesquisar" - pode ser button, input ou link
        const els = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a'));
        for (const el of els) {
          const text = (el.textContent || '').trim().toLowerCase();
          const val = ((el as HTMLInputElement).value || '').trim().toLowerCase();
          if (text.includes('pesquisar') || val.includes('pesquisar')) {
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (pesquisarClicked) {
        logger.info({ message: `[${this.nome}] Botao "Pesquisar" clicado` });
      } else {
        logger.warn({ message: `[${this.nome}] Botao "Pesquisar" nao encontrado` });
      }

      // Aguardar os resultados carregarem no DOM (nao apenas esperar tempo fixo)
      logger.info({ message: `[${this.nome}] Aguardando resultados carregarem...` });
      let resultadosCarregados = false;
      for (let tentativa = 0; tentativa < 10; tentativa++) {
        await this.delay(3000);
        const temResultados = await webplanPage.evaluate(() => {
          // Verificar se existem linhas de resultado (faturas) na pagina
          // Buscar por elementos que contenham "Codigo:" ou elementos de fatura
          const rows = document.querySelectorAll('tr, .row, [class*="fatura"], [class*="resultado"]');
          const textoTotal = document.body.innerText || '';
          // Verificar se tem "Codigo:" ou "Comp:" que sao campos dos resultados
          return textoTotal.includes('Codigo:') || textoTotal.includes('Código:') || 
                 textoTotal.includes('Entrega:') || textoTotal.includes('Pagamento:') ||
                 textoTotal.includes('Valor Bruto:') || rows.length > 20;
        });
        if (temResultados) {
          resultadosCarregados = true;
          logger.info({ message: `[${this.nome}] Resultados carregaram! (tentativa ${tentativa + 1})` });
          break;
        }
        logger.info({ message: `[${this.nome}] Aguardando... tentativa ${tentativa + 1}/10` });
      }

      if (!resultadosCarregados) {
        logger.warn({ message: `[${this.nome}] Resultados nao carregaram apos 30s` });
      }

      // Screenshot apos pesquisa
      await webplanPage.screenshot({ path: path.join(downloadPath, `resultado_pesquisa_${Date.now()}.png`), fullPage: true });

      // ====== PASSO 9: Clicar no icone "X" de download Excel ======
      // O icone usa a classe CSS "x-icon" (Font Awesome customizado pelo WebPlan)
      // Aparece na linha de cada fatura, ao lado de outros icones de acao
      logger.info({ message: `[${this.nome}] Buscando icone X (download Excel) nas faturas...` });

      // Salvar HTML para debug
      const htmlPesquisa = await webplanPage.content();
      fs.writeFileSync(path.join(downloadPath, `pesquisa_html_${Date.now()}.txt`), htmlPesquisa);

      // Buscar TODOS os icones "x-icon" na pagina de resultados (cada fatura tem um)
      const xIconsInfo = await webplanPage.evaluate(() => {
        const icons = Array.from(document.querySelectorAll('i.x-icon, [class*="x-icon"]'));
        return icons.map((el, idx) => {
          const parent = el.parentElement;
          return {
            index: idx,
            class: el.className,
            parentTag: parent?.tagName || 'none',
            parentClass: parent?.className || 'none',
            parentHref: parent?.getAttribute('href') || 'none',
            parentOnclick: (parent?.getAttribute('onclick') || 'none').substring(0, 100),
            parentDataBind: parent?.getAttribute('data-bind') || 'none'
          };
        });
      });

      logger.info({ message: `[${this.nome}] Icones x-icon encontrados: ${xIconsInfo.length}` });
      logger.info({ message: `[${this.nome}] Detalhes: ${JSON.stringify(xIconsInfo)}` });

      if (xIconsInfo.length > 0) {
        // Filtrar: queremos os x-icon que estao dentro de botoes/links de acao das faturas
        // (nao os de "Recusar" ou "Fechar" dos modals)
        const clicked = await webplanPage.evaluate(() => {
          const icons = Array.from(document.querySelectorAll('i.x-icon'));
          for (const icon of icons) {
            const parent = icon.parentElement;
            if (!parent) continue;
            // Pular botoes de modal (Recusar, Fechar)
            const parentText = (parent.textContent || '').trim().toLowerCase();
            if (parentText.includes('recusar') || parentText.includes('fechar')) continue;
            // Pular botoes dentro de modals
            const isInModal = parent.closest('.modal');
            if (isInModal) continue;
            // Este deve ser o icone X da fatura - clicar!
            parent.click();
            return true;
          }
          // Fallback: clicar no primeiro x-icon que nao esta em modal
          for (const icon of icons) {
            const parent = icon.parentElement;
            if (parent && !parent.closest('.modal')) {
              parent.click();
              return true;
            }
          }
          return false;
        });

        if (clicked) {
          logger.info({ message: `[${this.nome}] Icone X clicado! Aguardando download do Excel...` });
          arquivosBaixados++;
          await this.delay(15000);
        } else {
          logger.warn({ message: `[${this.nome}] Nenhum x-icon clicavel encontrado fora de modals` });
        }
      } else {
        logger.warn({ message: `[${this.nome}] Nenhum icone x-icon encontrado na pagina` });
        
        // Debug: listar todos os icones da pagina
        const allIcons = await webplanPage.evaluate(() => {
          const results: string[] = [];
          const allEls = Array.from(document.querySelectorAll('a[href], img[src], i[class], button'));
          for (const el of allEls) {
            const tag = el.tagName;
            const cls = el.className || '';
            const href = el.getAttribute('href') || '';
            const title = el.getAttribute('title') || '';
            if (cls || href || title) {
              results.push(`<${tag} class="${cls}" href="${href}" title="${title}">`);
            }
          }
          return results;
        });
        fs.writeFileSync(path.join(downloadPath, `debug_all_icons_${Date.now()}.txt`), allIcons.join('\n'));
        logger.info({ message: `[${this.nome}] Total elementos interativos: ${allIcons.length}` });
        
        await webplanPage.screenshot({ path: path.join(downloadPath, `debug_excel_${Date.now()}.png`), fullPage: true });
      }

      // ====== IMPORTACAO AUTOMATICA ======
      if (arquivosBaixados > 0) {
        try {
          const arquivosNaPasta = fs.readdirSync(downloadPath);
          const tempoLimite = Date.now() - (20 * 60 * 1000);
          const xlsNovos = arquivosNaPasta.filter(f => {
            if (!f.endsWith('.xls') && !f.endsWith('.xlsx')) return false;
            const stat = fs.statSync(path.join(downloadPath, f));
            return stat.mtimeMs > tempoLimite;
          });

          if (xlsNovos.length > 0) {
            logger.info({ message: `[${this.nome}] ${xlsNovos.length} arquivos novos para importar` });

            let idConvenio = 1;
            const { convenios } = await import('../../../drizzle/schema');
            const drizzleDb = await getDb();
            if (drizzleDb) {
              const conveniosDb = await drizzleDb.select().from(convenios).where(like(convenios.nome, '%IPASGO%'));
              if (conveniosDb.length > 0) {
                idConvenio = conveniosDb[0].id;
              } else {
                const conveniosDb2 = await drizzleDb.select().from(convenios).where(like(convenios.nome, '%Ipasgo%'));
                if (conveniosDb2.length > 0) {
                  idConvenio = conveniosDb2[0].id;
                }
              }
            }

            const { processarArquivoRpa } = await import('../importador');
            for (const f of xlsNovos) {
              await processarArquivoRpa(path.join(downloadPath, f), f, idConvenio, parametros?.competencia, credenciais.estabelecimentoId);
            }
          }
        } catch (errDb: any) {
          logger.error({ message: `[${this.nome}] Erro ao importar: ${errDb.message}` });
        }
      }

      // Screenshot final
      const screenshotPath = path.join(downloadPath, `resultado_ipasgo_${Date.now()}.png`);
      try {
        await webplanPage.screenshot({ path: screenshotPath, fullPage: true });
      } catch (e) {
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
      }

      return {
        status: 'sucesso',
        mensagem: `Robo IPASGO finalizou. ${arquivosBaixados} arquivo(s) processados.`,
        pastaDownload: downloadPath,
        arquivosBaixados,
        screenshotSalva: screenshotPath
      };

    } catch (error: any) {
      logger.error({ message: `[${this.nome}] Erro: ${error.message}` });
      throw error;
    } finally {
      await this.fecharBrowser();
    }
  }
}
