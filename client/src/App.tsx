import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useEstabelecimento } from "./contexts/EstabelecimentoContext";
import Home from "./pages/Home";
import SelecionarEstabelecimento from "./pages/SelecionarEstabelecimento";
import Upload from "./pages/Upload";
import Arquivos from "./pages/Arquivos";
import Comparacoes from "./pages/Comparacoes";
import Divergencias from "./pages/Divergencias";
import Relatorios from "./pages/Relatorios";
import Configuracoes from "./pages/Configuracoes";
import Contas from "./pages/Contas";
import Conciliacao from "./pages/Conciliacao";
import Faturamento from "./pages/Faturamento";
import AnaliseGlosa from "./pages/AnaliseGlosa";
import RecursosGlosa from "./pages/RecursosGlosa";
import Tendencias from "./pages/Tendencias";
import Demonstrativo from "./pages/Demonstrativo";
import Repasse from "./pages/Repasse";
import DicionarioGlosas from "./pages/DicionarioGlosas";
import HistoricoContestacoes from "./pages/HistoricoContestacoes";
import Estabelecimentos from "./pages/Estabelecimentos";
import RegrasConciliacao from "./pages/RegrasConciliacao";
import TabelasPreco from "./pages/TabelasPreco";
import RegrasNegocio from "./pages/RegrasNegocio";
import DashboardConsolidado from "./pages/DashboardConsolidado";
import GerenciarPermissoes from "./pages/GerenciarPermissoes";
import DashboardProdutividade from "./pages/DashboardProdutividade";
import AlterarSenha from "./pages/AlterarSenha";
import ContaDetalhes from "./pages/ContaDetalhes";
import RelatorioContas from "./pages/RelatorioContas";
import AcompanhamentoRecursos from "./pages/AcompanhamentoRecursos";
import DashboardIA from "./pages/DashboardIA";
import NaoRecebidos from "./pages/NaoRecebidos";

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
      <Route path={"/"} component={Home} />
      <Route path={"/upload"} component={Upload} />
      <Route path={"/arquivos"} component={Arquivos} />
      <Route path={"/comparacoes"} component={Comparacoes} />
      <Route path={"/divergencias"} component={Divergencias} />
      <Route path={"/relatorios"} component={Relatorios} />
      <Route path={"/configuracoes"} component={Configuracoes} />
      <Route path={"/contas"} component={Contas} />
      <Route path={"/contas/:guiaNumero"} component={ContaDetalhes} />
      <Route path={"/conciliacao"} component={Conciliacao} />
      <Route path={"/faturamento"} component={Faturamento} />
      <Route path={"/analise-glosa"} component={AnaliseGlosa} />
      <Route path={"/recursos"} component={RecursosGlosa} />
      <Route path={"/regras-conciliacao"} component={RegrasConciliacao} />
      <Route path={"/tendencias"} component={Tendencias} />
      <Route path={"/demonstrativo"} component={Demonstrativo} />
      <Route path={"/repasse"} component={Repasse} />
      <Route path={"/dicionario-glosas"} component={DicionarioGlosas} />
      <Route path={"/historico-contestacoes"} component={HistoricoContestacoes} />
      <Route path={"/estabelecimentos"} component={Estabelecimentos} />
      <Route path={"/tabelas-preco"} component={TabelasPreco} />
      <Route path={"/regras-negocio"} component={RegrasNegocio} />
      <Route path={"/dashboard-consolidado"} component={DashboardConsolidado} />
      <Route path={"/gerenciar-permissoes"} component={GerenciarPermissoes} />
      <Route path={"/produtividade"} component={DashboardProdutividade} />
      <Route path={"/alterar-senha"} component={AlterarSenha} />
      <Route path={"/relatorio-contas"} component={RelatorioContas} />
      <Route path={"/acompanhamento-recursos"} component={AcompanhamentoRecursos} />
      <Route path={"/dashboard-ia"} component={DashboardIA} />
      <Route path={"/nao-recebidos"} component={NaoRecebidos} />
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
