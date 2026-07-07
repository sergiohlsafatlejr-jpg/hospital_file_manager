import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Search, FileSpreadsheet, Users, Calendar, DollarSign } from 'lucide-react';
import { useEstabelecimento } from '@/contexts/EstabelecimentoContext';

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export default function ResumoPacienteOxUti() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id ?? 0;

  const { data: meses } = trpc.resumoPacienteOxUti.mesesDisponiveis.useQuery({ estabelecimentoId });
  const { data: conveniosList } = trpc.resumoPacienteOxUti.convenios.useQuery({ estabelecimentoId });

  const [mesRef, setMesRef] = useState('');
  const [convenio, setConvenio] = useState('');
  const [busca, setBusca] = useState('');

  // Auto-selecionar o primeiro mês disponível
  const mesAtual = mesRef || (meses && meses.length > 0 ? meses[0] : '');

  const { data, isLoading } = trpc.resumoPacienteOxUti.dados.useQuery(
    { estabelecimentoId, mesRef: mesAtual, convenio: convenio || undefined },
    { enabled: !!mesAtual }
  );

  const dadosFiltrados = useMemo(() => {
    if (!data?.dados) return [];
    if (!busca) return data.dados;
    const termo = busca.toLowerCase();
    return data.dados.filter(r =>
      r.paciente.toLowerCase().includes(termo) ||
      r.carteira.toLowerCase().includes(termo) ||
      r.guia.toLowerCase().includes(termo)
    );
  }, [data?.dados, busca]);

  const exportarExcel = () => {
    if (!dadosFiltrados.length) return;
    const headers = [
      'Paciente', 'Carteira', 'Guia', 'Convênio', 'Data Entrada', 'Data Saída', 'Qtd Diárias',
      'Diária Faturada', 'Mat/Med Faturado', 'Gás Medicinal Fat.', 'Taxas/Aluguéis Fat.', 'Total Faturado',
      'Diária Recebida', 'Mat/Med Recebido', 'Gás Medicinal Rec.', 'Taxas/Aluguéis Rec.', 'Total Recebido'
    ];
    const rows = dadosFiltrados.map(r => [
      r.paciente, r.carteira, r.guia, r.convenio,
      formatDate(r.dataEntrada), formatDate(r.dataSaida), r.qtdDiarias,
      r.vlDiariaFat, r.vlMatmedFat, r.vlGasFat, r.vlTaxaFat, r.vlTotalFat,
      r.recDiaria, r.recMatmed, r.recGas, r.recTaxa, r.recTotal
    ]);

    // Adicionar linha de totais
    if (data?.totais) {
      const t = data.totais;
      rows.push([
        'TOTAL', '', '', '', '', '', t.qtdDiarias,
        t.vlDiariaFat, t.vlMatmedFat, t.vlGasFat, t.vlTaxaFat, t.vlTotalFat,
        t.recDiaria, t.recMatmed, t.recGas, t.recTaxa, t.recTotal
      ]);
    }

    const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resumo_paciente_ox_uti_${mesAtual}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const mesFormatado = mesAtual ? (() => {
    const [y, m] = mesAtual.split('-');
    const meses_nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${meses_nomes[parseInt(m) - 1]}/${y}`;
  })() : '';

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">Resumo Paciente Ox UTI</h1>
          <p className="text-sm text-muted-foreground mt-1">Faturado x Recebido por paciente com detalhamento por categoria</p>
        </div>
        <Button onClick={exportarExcel} disabled={!dadosFiltrados.length} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Exportar Excel
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                <Calendar className="h-3 w-3 inline mr-1" />Competência
              </label>
              <Select value={mesAtual} onValueChange={setMesRef}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o mês" />
                </SelectTrigger>
                <SelectContent>
                  {meses?.map(m => {
                    const [y, mo] = m.split('-');
                    const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                    return <SelectItem key={m} value={m}>{nomes[parseInt(mo) - 1]}/{y}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Convênio</label>
              <Select value={convenio || 'todos'} onValueChange={v => setConvenio(v === 'todos' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os convênios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os convênios</SelectItem>
                  {conveniosList?.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                <Search className="h-3 w-3 inline mr-1" />Buscar
              </label>
              <Input placeholder="Paciente, carteira ou guia..." value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {data?.totais && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-600" />
                <span className="text-xs text-muted-foreground">Pacientes</span>
              </div>
              <p className="text-lg font-bold text-blue-700 mt-1">{data.totais.totalPacientes}</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-green-600" />
                <span className="text-xs text-muted-foreground">Guias</span>
              </div>
              <p className="text-lg font-bold text-green-700 mt-1">{dadosFiltrados.length}</p>
            </CardContent>
          </Card>
          <Card className="border-purple-200 bg-purple-50/50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-purple-600" />
                <span className="text-xs text-muted-foreground">Total Diárias</span>
              </div>
              <p className="text-lg font-bold text-purple-700 mt-1">{data.totais.qtdDiarias}</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-emerald-50/50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-600" />
                <span className="text-xs text-muted-foreground">Total Faturado</span>
              </div>
              <p className="text-sm font-bold text-emerald-700 mt-1">{formatCurrency(data.totais.vlTotalFat)}</p>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-orange-50/50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-orange-600" />
                <span className="text-xs text-muted-foreground">Total Recebido</span>
              </div>
              <p className="text-sm font-bold text-orange-700 mt-1">{formatCurrency(data.totais.recTotal)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela estilo planilha */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Detalhamento por Paciente — {mesFormatado}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-3 text-muted-foreground">Carregando...</span>
            </div>
          ) : dadosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum dado encontrado para o período selecionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-semibold sticky left-0 bg-muted/50 min-w-[120px]">Paciente</th>
                    <th className="text-left p-2 font-semibold min-w-[80px]">Guia</th>
                    <th className="text-center p-2 font-semibold min-w-[80px]">Entrada</th>
                    <th className="text-center p-2 font-semibold min-w-[80px]">Saída</th>
                    <th className="text-center p-2 font-semibold min-w-[50px]">Diárias</th>
                    <th className="text-right p-2 font-semibold text-blue-600 min-w-[90px]">Diária Fat.</th>
                    <th className="text-right p-2 font-semibold text-blue-600 min-w-[90px]">Mat/Med Fat.</th>
                    <th className="text-right p-2 font-semibold text-blue-600 min-w-[90px]">Gás Fat.</th>
                    <th className="text-right p-2 font-semibold text-blue-600 min-w-[90px]">Taxas Fat.</th>
                    <th className="text-right p-2 font-semibold text-blue-700 min-w-[100px] bg-blue-50">Total Fat.</th>
                    <th className="text-right p-2 font-semibold text-green-600 min-w-[90px]">Diária Rec.</th>
                    <th className="text-right p-2 font-semibold text-green-600 min-w-[90px]">Mat/Med Rec.</th>
                    <th className="text-right p-2 font-semibold text-green-600 min-w-[90px]">Gás Rec.</th>
                    <th className="text-right p-2 font-semibold text-green-600 min-w-[90px]">Taxas Rec.</th>
                    <th className="text-right p-2 font-semibold text-green-700 min-w-[100px] bg-green-50">Total Rec.</th>
                  </tr>
                </thead>
                <tbody>
                  {dadosFiltrados.map((r, i) => (
                    <tr key={`${r.carteira}-${r.guia}-${i}`} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-2 sticky left-0 bg-background">
                        <div className="font-medium truncate max-w-[150px]" title={r.paciente}>{r.paciente}</div>
                        <div className="text-[10px] text-muted-foreground">{r.convenio}</div>
                      </td>
                      <td className="p-2 font-mono text-[11px]">{r.guia}</td>
                      <td className="p-2 text-center">{formatDate(r.dataEntrada)}</td>
                      <td className="p-2 text-center">{formatDate(r.dataSaida)}</td>
                      <td className="p-2 text-center font-medium">{r.qtdDiarias}</td>
                      <td className="p-2 text-right text-blue-600">{formatCurrency(r.vlDiariaFat)}</td>
                      <td className="p-2 text-right text-blue-600">{formatCurrency(r.vlMatmedFat)}</td>
                      <td className="p-2 text-right text-blue-600">{formatCurrency(r.vlGasFat)}</td>
                      <td className="p-2 text-right text-blue-600">{formatCurrency(r.vlTaxaFat)}</td>
                      <td className="p-2 text-right font-semibold text-blue-700 bg-blue-50/50">{formatCurrency(r.vlTotalFat)}</td>
                      <td className="p-2 text-right text-green-600">{formatCurrency(r.recDiaria)}</td>
                      <td className="p-2 text-right text-green-600">{formatCurrency(r.recMatmed)}</td>
                      <td className="p-2 text-right text-green-600">{formatCurrency(r.recGas)}</td>
                      <td className="p-2 text-right text-green-600">{formatCurrency(r.recTaxa)}</td>
                      <td className="p-2 text-right font-semibold text-green-700 bg-green-50/50">{formatCurrency(r.recTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                {data?.totais && (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/70 font-semibold">
                      <td className="p-2 sticky left-0 bg-muted/70">TOTAL</td>
                      <td className="p-2"></td>
                      <td className="p-2"></td>
                      <td className="p-2"></td>
                      <td className="p-2 text-center">{data.totais.qtdDiarias}</td>
                      <td className="p-2 text-right text-blue-700">{formatCurrency(data.totais.vlDiariaFat)}</td>
                      <td className="p-2 text-right text-blue-700">{formatCurrency(data.totais.vlMatmedFat)}</td>
                      <td className="p-2 text-right text-blue-700">{formatCurrency(data.totais.vlGasFat)}</td>
                      <td className="p-2 text-right text-blue-700">{formatCurrency(data.totais.vlTaxaFat)}</td>
                      <td className="p-2 text-right text-blue-800 bg-blue-100/50">{formatCurrency(data.totais.vlTotalFat)}</td>
                      <td className="p-2 text-right text-green-700">{formatCurrency(data.totais.recDiaria)}</td>
                      <td className="p-2 text-right text-green-700">{formatCurrency(data.totais.recMatmed)}</td>
                      <td className="p-2 text-right text-green-700">{formatCurrency(data.totais.recGas)}</td>
                      <td className="p-2 text-right text-green-700">{formatCurrency(data.totais.recTaxa)}</td>
                      <td className="p-2 text-right text-green-800 bg-green-100/50">{formatCurrency(data.totais.recTotal)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
