import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useEstabelecimento } from "./contexts/EstabelecimentoContext";
import { lazy, Suspense, useEffect, useRef } from "react";

// Eager load: only the selection page (no DashboardLayout dependency)
import SelecionarEstabelecimento from "./pages/SelecionarEstabelecimento";

// Lazy load: all pages including Home/Inicio (they import DashboardLayout which is heavy)
const Home = lazy(() => import("./pages/Home"));
const Inicio = lazy(() => import("./pages/Inicio"));

// Lazy load: all other pages for code-splitting
const Upload = lazy(() => import("./pages/Upload"));
const Arquivos = lazy(() => import("./pages/Arquivos"));
const Comparacoes = lazy(() => import("./pages/Comparacoes"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const ContaConvenio = lazy(() => import("./pages/ContaConvenio"));
const DemonstrativoDetalhes = lazy(() => import("./pages/DemonstrativoDetalhes"));
const Conciliacao = lazy(() => import("./pages/Conciliacao"));
const AnaliseGlosa = lazy(() => import("./pages/AnaliseGlosa"));
const RecursosGlosa = lazy(() => import("./pages/RecursosGlosa"));
const Tendencias = lazy(() => import("./pages/Tendencias"));
const Demonstrativo = lazy(() => import("./pages/Demonstrativo"));
const Repasse = lazy(() => import("./pages/Repasse"));
const DicionarioGlosas = lazy(() => import("./pages/DicionarioGlosas"));
const Estabelecimentos = lazy(() => import("./pages/Estabelecimentos"));
const Convenios = lazy(() => import("./pages/Convenios"));
const RegrasConciliacao = lazy(() => import("./pages/RegrasConciliacao"));
const TabelasPreco = lazy(() => import("./pages/TabelasPreco"));
const RegrasNegocio = lazy(() => import("./pages/RegrasNegocio"));
const DashboardConsolidado = lazy(() => import("./pages/DashboardConsolidado"));
const GerenciarPermissoes = lazy(() => import("./pages/GerenciarPermissoes"));
const DashboardProdutividade = lazy(() => import("./pages/DashboardProdutividade"));
const AlterarSenha = lazy(() => import("./pages/AlterarSenha"));
const ContaDetalhes = lazy(() => import("./pages/ContaDetalhes"));
const AcompanhamentoRecursos = lazy(() => import("./pages/AcompanhamentoRecursos"));
const DashboardIA = lazy(() => import("./pages/DashboardIA"));
const NaoRecebidos = lazy(() => import("./pages/NaoRecebidos"));
const EnvioRecursosLote = lazy(() => import("./pages/EnvioRecursosLote"));
const RegrasIA = lazy(() => import("./pages/RegrasIA"));
const ConciliacaoDetalhes = lazy(() => import("./pages/ConciliacaoDetalhes"));
const RelatoriosBI = lazy(() => import("./pages/RelatoriosBI"));
const ConciliacaoContasFaturadas = lazy(() => import("./pages/ConciliacaoContasFaturadas"));
const ConciliacaoCruzada = lazy(() => import("./pages/ConciliacaoCruzada"));
const DetalhesContaFaturada = lazy(() => import("./pages/DetalhesContaFaturada"));
const ContaConvenioDetalhes = lazy(() => import("./pages/ContaConvenioDetalhes"));
const RecebimentosXml = lazy(() => import("./pages/RecebimentosXml"));
const RecebimentosExcel = lazy(() => import("./pages/RecebimentosExcel"));
const Atendimentos = lazy(() => import("./pages/Atendimentos"));
const AtendimentosFaturar = lazy(() => import("./pages/AtendimentosFaturar"));
const AtendimentosSemProtocolo = lazy(() => import("./pages/AtendimentosSemProtocolo"));
const GerenciarAvisos = lazy(() => import("./pages/GerenciarAvisos"));
const AuditDashboard = lazy(() => import("./pages/AuditDashboard"));
const PrevisaoGlosa = lazy(() => import("./pages/PrevisaoGlosa").then(m => ({ default: m.PrevisaoGlosa })));
const DashboardMotorRegras = lazy(() => import("./pages/DashboardMotorRegras"));
const CacheDashboard = lazy(() => import("./pages/CacheDashboard"));
const HistoricoValidacaoXml = lazy(() => import("./pages/HistoricoValidacaoXml").then(m => ({ default: m.HistoricoValidacaoXml })));
const PopularHistoricoXml = lazy(() => import("./pages/PopularHistoricoXml").then(m => ({ default: m.PopularHistoricoXml })));
const IntegradorDados = lazy(() => import("./pages/IntegradorDados").then(m => ({ default: m.IntegradorDados })));
const MapeamentoConvenios = lazy(() => import("./pages/MapeamentoConvenios"));
const RelatorioRecebimentoGeral = lazy(() => import("./pages/RelatorioRecebimentoGeral"));
const PadroesCobranca = lazy(() => import("./pages/PadroesCobranca"));
const CriarGabarito = lazy(() => import("./pages/CriarGabarito"));
const EditarPadrao = lazy(() => import("./pages/EditarPadrao"));
const DetalhesPadrao = lazy(() => import("./pages/DetalhesPadrao"));
const TabelasPorte = lazy(() => import("./pages/TabelasPorte"));
const DashboardAuditoria = lazy(() => import("./pages/DashboardAuditoria"));
const ConferenciaCorrecao = lazy(() => import("./pages/ConferenciaCorrecao"));
const ConferenciaCorrecaoDetalhes = lazy(() => import("./pages/ConferenciaCorrecao").then(m => ({ default: m.ConferenciaCorrecaoDetalhes })));
const RelatorioAtendimentos = lazy(() => import("./pages/RelatorioAtendimentos"));
const RelatorioCustos = lazy(() => import("./pages/RelatorioCustos"));
const RelatorioFaturamento = lazy(() => import("./pages/RelatorioFaturamento"));
const FaturamentoExterno = lazy(() => import("./pages/FaturamentoExterno"));
const NfseModule = lazy(() => import("./pages/NfseModule"));
const FinanceiroModule = lazy(() => import("./pages/FinanceiroModule"));
const ContratosModule = lazy(() => import("./pages/ContratosModule"));
const PropostasModule = lazy(() => import("./pages/PropostasModule"));
const PainelExecutivo = lazy(() => import("./pages/PainelExecutivo"));
const PermissoesSafatle = lazy(() => import("./pages/PermissoesSafatle"));
const RecebimentosPdfSaudeCaixa = lazy(() => import("./pages/RecebimentosPdfSaudeCaixa"));
const AtendimentosUnificados = lazy(() => import("./pages/AtendimentosUnificados"));
const ContratosConvenios = lazy(() => import("./pages/ContratosConvenios"));
const LogAuditoriaSistema = lazy(() => import("./pages/LogAuditoriaSistema"));
const UploadFolhaRH = lazy(() => import("./pages/rh/UploadFolha"));
const FolhaPagamento = lazy(() => import("./pages/rh/FolhaPagamento"));
const Colaboradores = lazy(() => import("./pages/rh/Colaboradores"));
const PlanoSalarios = lazy(() => import("./pages/rh/PlanoSalarios"));
const BiFinanceiroTasy = lazy(() => import("./pages/BiFinanceiroTasy"));
const RelatorioProtocolos = lazy(() => import("./pages/RelatorioProtocolos"));
const PrevisaoRecebimentos = lazy(() => import("./pages/PrevisaoRecebimentos"));
const AnaliseFaturamentosBi = lazy(() => import("./pages/AnaliseFaturamentosBi"));
const FluxoCaixaBI = lazy(() => import("./pages/FluxoCaixaBI"));
const RelatorioLaboratorio = lazy(() => import("./pages/RelatorioLaboratorio"));
const RelatorioVisita = lazy(() => import("./pages/RelatorioVisita"));
const RelatorioVisitaXml = lazy(() => import("./pages/RelatorioVisitaXml"));
const RelatorioUltrassom = lazy(() => import("./pages/RelatorioUltrassom"));
const RelatoriosGlosasBi = lazy(() => import("./pages/RelatoriosGlosasBi"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    </div>
  );
}

function Router() {
  const { selecionado, isLoading } = useEstabelecimento();
  const [location] = useLocation();
  const redirectedRef = useRef(false);

  // FIX: Move navigation to useEffect to avoid calling window.location.href during render
  // This was causing NotFoundError: Failed to execute 'removeChild' on 'Node'
  useEffect(() => {
    if (!isLoading && !selecionado && location !== "/selecionar-estabelecimento" && !redirectedRef.current) {
      redirectedRef.current = true;
      window.location.href = "/selecionar-estabelecimento";
    }
  }, [isLoading, selecionado, location]);

  // Show loader while checking or redirecting
  if (!isLoading && !selecionado && location !== "/selecionar-estabelecimento") {
    return <PageLoader />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path={"/selecionar-estabelecimento"} component={SelecionarEstabelecimento} />
        <Route path={"/"} component={Inicio} />
        <Route path={"/dashboard"} component={Home} />
        <Route path={"/upload"} component={Upload} />
        <Route path={"/arquivos"} component={Arquivos} />
        <Route path={"/comparacoes"} component={Comparacoes} />
        <Route path={"/relatorios"} component={Relatorios} />
        <Route path={"/configuracoes/:rest*"} component={Configuracoes} />
        <Route path={"/conta-convenio"} component={ContaConvenio} />
        <Route path={"/conta-convenio-detalhes"} component={ContaConvenioDetalhes} />
        <Route path={"/demonstrativo-detalhes"} component={DemonstrativoDetalhes} />
        <Route path={"/contas/:guiaNumero"} component={ContaDetalhes} />
        <Route path={"/conciliacao"} component={Conciliacao} />
        <Route path={"/conciliacao/:convenioId/:guiaNumero"} component={ConciliacaoDetalhes} />
        <Route path={"/analise-glosa"} component={AnaliseGlosa} />
        <Route path={"/recursos"} component={RecursosGlosa} />
        <Route path={"/regras-conciliacao"} component={RegrasConciliacao} />
        <Route path={"/tendencias"} component={Tendencias} />
        <Route path={"/demonstrativo"} component={Demonstrativo} />
        <Route path={"/repasse"} component={Repasse} />
        <Route path={"/dicionario-glosas"} component={DicionarioGlosas} />
        <Route path={"/estabelecimentos"} component={Estabelecimentos} />
        <Route path={"/convenios"} component={Convenios} />
        <Route path={"/tabelas-preco"} component={TabelasPreco} />
        <Route path={"/regras-negocio"} component={RegrasNegocio} />
        <Route path={"/dashboard-consolidado"} component={DashboardConsolidado} />
        <Route path={"/gerenciar-permissoes"} component={GerenciarPermissoes} />
        <Route path={"/produtividade"} component={DashboardProdutividade} />
        <Route path={"/alterar-senha"} component={AlterarSenha} />
        <Route path={"/acompanhamento-recursos"} component={AcompanhamentoRecursos} />
        <Route path={"/dashboard-ia"} component={DashboardIA} />
        <Route path={"/nao-recebidos"} component={NaoRecebidos} />
        <Route path={"/envio-recursos-lote"} component={EnvioRecursosLote} />
        <Route path={"/regras-ia"} component={RegrasIA} />
        <Route path={"/relatorios-bi"} component={RelatoriosBI} />
        <Route path={"/previsao-glosa"} component={PrevisaoGlosa} />
        <Route path={"/motor-regras"} component={DashboardMotorRegras} />
        <Route path={"/conciliacao-cruzada"} component={ConciliacaoCruzada} />
        <Route path={"/contas-faturadas"} component={ConciliacaoContasFaturadas} />
        <Route path={"/contas-faturadas/:conta"} component={DetalhesContaFaturada} />
        <Route path={"/recebimentos-xml"} component={RecebimentosXml} />
        <Route path={"/recebimentos-excel"} component={RecebimentosExcel} />
        <Route path={"/atendimentos"} component={Atendimentos} />
        <Route path={"/atendimentos-faturar"} component={AtendimentosFaturar} />
        <Route path={"/atendimentos-com-protocolo"} component={AtendimentosSemProtocolo} />
        <Route path={"/gerenciar-avisos"} component={GerenciarAvisos} />
        <Route path={"/auditoria"} component={AuditDashboard} />
        <Route path={"/cache-dashboard"} component={CacheDashboard} />
        <Route path={"/historico-validacao-xml"} component={HistoricoValidacaoXml} />
        <Route path={"/popular-historico-xml"} component={PopularHistoricoXml} />
        <Route path={"/integracao"} component={IntegradorDados} />
        <Route path={"/mapeamento-convenios"} component={MapeamentoConvenios} />
        <Route path={"/relatorio-recebimento-geral"} component={RelatorioRecebimentoGeral} />
        <Route path={"/padroes-cobranca"} component={PadroesCobranca} />
        <Route path={"/criar-gabarito"} component={CriarGabarito} />
        <Route path={"/editar-padrao/:id"} component={EditarPadrao} />
        <Route path={"/detalhes-padrao/:id"} component={DetalhesPadrao} />
        <Route path={"/tabelas-porte"} component={TabelasPorte} />
        <Route path={"/dashboard-auditoria"} component={DashboardAuditoria} />
        <Route path={"/conferencia-correcao"} component={ConferenciaCorrecao} />
        <Route path={"/conferencia-correcao/:snapshotId"} component={ConferenciaCorrecaoDetalhes} />
        <Route path={"/relatorio-faturamento"} component={RelatorioFaturamento} />
        <Route path={"/faturamento-externo"} component={FaturamentoExterno} />
        <Route path={"/relatorio-atendimentos"} component={RelatorioAtendimentos} />
        <Route path={"/relatorio-custos"} component={RelatorioCustos} />
        <Route path={"/nfse"} component={NfseModule} />
        <Route path={"/financeiro"} component={FinanceiroModule} />
        <Route path={"/contratos"} component={ContratosModule} />
        <Route path={"/propostas"} component={PropostasModule} />
        <Route path={"/painel-executivo"} component={PainelExecutivo} />
        <Route path={"/permissoes-safatle"} component={PermissoesSafatle} />
        <Route path={"/recebimentos-pdf-saude-caixa"} component={RecebimentosPdfSaudeCaixa} />
        <Route path={"/atendimentos-unificados"} component={AtendimentosUnificados} />
        <Route path={"/bi-financeiro-tasy"} component={BiFinanceiroTasy} />
        <Route path={"/relatorio-protocolos"} component={RelatorioProtocolos} />
        <Route path={"/previsao-recebimentos"} component={PrevisaoRecebimentos} />
        <Route path={"/analise-faturamento-itens"} component={AnaliseFaturamentosBi} />
        <Route path={"/fluxo-caixa-bi"} component={FluxoCaixaBI} />
        <Route path={"/relatorio-laboratorio"} component={RelatorioLaboratorio} />
        <Route path={"/relatorio-visita"} component={RelatorioVisita} />
        <Route path={"/relatorio-visita-xml"} component={RelatorioVisitaXml} />
        <Route path={"/relatorio-ultrassom"} component={RelatorioUltrassom} />
        <Route path={"/contratos-convenios"} component={ContratosConvenios} />
        <Route path={"/auditoria-sistema"} component={LogAuditoriaSistema} />
        <Route path={"/relatorios-glosas-bi"} component={RelatoriosGlosasBi} />
        <Route path={"/rh/upload"} component={UploadFolhaRH} />
        <Route path={"/rh/folha-pagamento"} component={FolhaPagamento} />
        <Route path={"/rh/colaboradores"} component={Colaboradores} />
        <Route path={"/rh/plano-salarios"} component={PlanoSalarios} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={true}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
