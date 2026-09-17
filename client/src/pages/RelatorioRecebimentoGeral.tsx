import DashboardLayout from "@/components/DashboardLayout";
import { RecebimentoGeralReport } from "@/components/bi/RecebimentoGeralReport";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { useLocation } from "wouter";

export default function RelatorioRecebimentoGeral() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;
  const [, setLocation] = useLocation();

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <RecebimentoGeralReport
          estabelecimentoId={estabelecimentoId}
          onBack={() => setLocation("/faturado-recebido-unificado")}
        />
      </div>
    </DashboardLayout>
  );
}
