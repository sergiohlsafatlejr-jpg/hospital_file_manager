import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Upload from "./pages/Upload";
import Arquivos from "./pages/Arquivos";
import Comparacoes from "./pages/Comparacoes";
import Divergencias from "./pages/Divergencias";
import Relatorios from "./pages/Relatorios";
import Configuracoes from "./pages/Configuracoes";
import ItensImportados from "./pages/ItensImportados";
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

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/upload"} component={Upload} />
      <Route path={"/arquivos"} component={Arquivos} />
      <Route path={"/comparacoes"} component={Comparacoes} />
      <Route path={"/divergencias"} component={Divergencias} />
      <Route path={"/relatorios"} component={Relatorios} />
      <Route path={"/configuracoes"} component={Configuracoes} />
      <Route path={"/itens-importados"} component={ItensImportados} />
      <Route path={"/conciliacao"} component={Conciliacao} />
      <Route path={"/faturamento"} component={Faturamento} />
      <Route path={"/analise-glosa"} component={AnaliseGlosa} />
      <Route path={"/recursos"} component={RecursosGlosa} />
      <Route path={"/tendencias"} component={Tendencias} />
      <Route path={"/demonstrativo"} component={Demonstrativo} />
      <Route path={"/repasse"} component={Repasse} />
      <Route path={"/dicionario-glosas"} component={DicionarioGlosas} />
      <Route path={"/historico-contestacoes"} component={HistoricoContestacoes} />
      <Route path={"/estabelecimentos"} component={Estabelecimentos} />
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
