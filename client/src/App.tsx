import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useEstabelecimento } from "./contexts/EstabelecimentoContext";
import Home from "./pages/Home";
import Inicio from "./pages/Inicio";
import SelecionarEstabelecimento from "./pages/SelecionarEstabelecimento";
import Upload from "./pages/Upload";
import Arquivos from "./pages/Arquivos";
import Comparacoes from "./pages/Comparacoes";
import Relatorios from "./pages/Relatorios";
import Configuracoes from "./pages/Configuracoes";
import ContaConvenio from "./pages/ContaConvenio";
import DemonstrativoDetalhes from "./pages/DemonstrativoDetalhes";
import Conciliacao from "./pages/Conciliacao";
import AnaliseGlosa from "./pages/AnaliseGlosa";
import RecursosGlosa from "./pages/RecursosGlosa";
import Tendencias from "./pages/Tendencias";
import Demonstrativo from "./pages/Demonstrativo";
import Repasse from "./pages/Repasse";
import DicionarioGlosas from "./pages/DicionarioGlosas";
import Estabelecimentos from "./pages/Estabelecimentos";
import RegrasConciliacao from "./pages/RegrasConciliacao";
import TabelasPreco from "./pages/TabelasPreco";
import RegrasNegocio from "./pages/RegrasNegocio";
import DashboardConsolidado from "./pages/DashboardConsolidado";
import GerenciarPermissoes from "./pages/GerenciarPermissoes";
import DashboardProdutividade from "./pages/DashboardProdutividade";
import AlterarSenha from "./pages/AlterarSenha";
import ContaDetalhes from "./pages/ContaDetalhes";
import AcompanhamentoRecursos from "./pages/AcompanhamentoRecursos";
import DashboardIA from "./pages/DashboardIA";
import NaoRecebidos from "./pages/NaoRecebidos";
import EnvioRecursosLote from "./pages/EnvioRecursosLote";
import RegrasIA from "./pages/RegrasIA";
import ConciliacaoDetalhes from "./pages/ConciliacaoDetalhes";
import ImportacaoTasy from "./pages/ImportacaoTasy";
import ConciliacaoTasy from "./pages/ConciliacaoTasy";
import ContasTasy from "./pages/ContasTasy";
import RelatoriosTasy from "./pages/RelatoriosTasy";
import DetalheContaTasy from "./pages/DetalheContaTasy";
import RelatoriosBI from "./pages/RelatoriosBI";
import ConciliacaoContasPagas from "./pages/ConciliacaoContasPagas";
import HistoricoConciliacaoTasy from "./pages/HistoricoConciliacaoTasy";
import ConciliacaoContasFaturadas from "./pages/ConciliacaoContasFaturadas";
import DetalhesContaFaturada from "./pages/DetalhesContaFaturada";
import ContaConvenioDetalhes from "./pages/ContaConvenioDetalhes";
import RecebimentosXml from "./pages/RecebimentosXml";
import RecebimentosExcel from "./pages/RecebimentosExcel";
import Atendimentos from "./pages/Atendimentos";
import AtendimentosFaturar from "./pages/AtendimentosFaturar";
import GerenciarAvisos from "./pages/GerenciarAvisos";
import ImportacaoXML from "./pages/ImportacaoXML";

function Router() {
  const { selecionado, isLoading } = useEstabelecimento();
  const [location] = useLocation();

  // Se não selecionou estabelecimento e não está na página de seleção, redireciona
  if (!isLoading && !selecionado && location !== "/selecionar-estabelecimento") {
    window.location.href = "/selecionar-estabelecimento";
    return null;
  }

  return (
    <Switch>
      <Route path={"/selecionar-estabelecimento"} component={SelecionarEstabelecimento} />
      <Route path={"/"} component={Inicio} />
      <Route path={"/dashboard"} component={Home} />
      <Route path={"/upload"} component={Upload} />
      <Route path={"/arquivos"} component={Arquivos} />
      <Route path={"/comparacoes"} component={Comparacoes} />
      <Route path={"/relatorios"} component={Relatorios} />
      <Route path={"/configuracoes"} component={Configuracoes} />
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
      <Route path={"/importacao-tasy"} component={ImportacaoTasy} />
      <Route path={"/conciliacao-tasy"} component={ConciliacaoTasy} />
      <Route path={"/contas-tasy"} component={ContasTasy} />
      <Route path={"/contas-tasy/:atendimento"} component={DetalheContaTasy} />
      <Route path={"/relatorios-tasy"} component={RelatoriosTasy} />
      <Route path={"/relatorios-bi"} component={RelatoriosBI} />
      <Route path={"/conciliacao-contas-pagas"} component={ConciliacaoContasPagas} />
      <Route path={"/historico-conciliacao-tasy"} component={HistoricoConciliacaoTasy} />
      <Route path={"/contas-faturadas"} component={ConciliacaoContasFaturadas} />
      <Route path={"/contas-faturadas/:conta"} component={DetalhesContaFaturada} />
      <Route path={"/recebimentos-xml"} component={RecebimentosXml} />
      <Route path={"/recebimentos-excel"} component={RecebimentosExcel} />
      <Route path={"/atendimentos"} component={Atendimentos} />
      <Route path={"/atendimentos-faturar"} component={AtendimentosFaturar} />
      <Route path={"/gerenciar-avisos"} component={GerenciarAvisos} />
      <Route path={"/importacao-xml"} component={ImportacaoXML} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
