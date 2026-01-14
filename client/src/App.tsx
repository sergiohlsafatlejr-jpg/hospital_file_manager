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
