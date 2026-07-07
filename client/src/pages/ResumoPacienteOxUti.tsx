import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Search, Users, Calendar, DollarSign } from 'lucide-react';
import { useEstabelecimento } from '@/contexts/EstabelecimentoContext';

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function mesLabel(mesRef: string) {
  const [y, m] = mesRef.split('-');
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${nomes[parseInt(m) - 1]}/${y}`;
}

export default function ResumoPacienteOxUti() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id ?? 0;

  const { data: mesesFat } = trpc.resumoPacienteOxUti.mesesDisponiveis.useQuery(
    { estabelecimentoId }, { enabled: estabelecimentoId > 0 }
  );
  const { data: mesesRec } = trpc.resumoPacienteOxUti.mesesPagamento.useQuery(
    { estabelecimentoId }, { enabled: estabelecimentoId > 0 }
  );
  const { data: conveniosList } = trpc.resumoPacienteOxUti.convenios.useQuery(
    { estabelecimentoId }, { enabled: estabelecimentoId > 0 }
  );

  const [mesRefFat, setMesRefFat] = useState('');
  const [mesRefRec, setMesRefRec] = useState('');
  const [convenio, setConvenio] = useState('');
  const [buscaFat, setBuscaFat] = useState('');
  const [buscaRec, setBuscaRec] = useState('');

  const mesAtualFat = mesRefFat || (mesesFat && mesesFat.length > 0 ? mesesFat[0] : '');
  const mesAtualRec = mesRefRec || (mesesRec && mesesRec.length > 0 ? mesesRec[0] : '');

  const { data: dataFat, isLoading: loadingFat } = trpc.resumoPacienteOxUti.faturado.useQuery(
    { estabelecimentoId, mesRef: mesAtualFat, convenio: convenio || undefined },
    { enabled: estabelecimentoId > 0 && !!mesAtualFat }
  );

  const { data: dataRec, isLoading: loadingRec } = trpc.resumoPacienteOxUti.recebido.useQuery(
    { estabelecimentoId, mesRef: mesAtualRec, convenio: convenio || undefined },
    { enabled: estabelecimentoId > 0 && !!mesAtualRec }
  );

  const dadosFatFiltrados = useMemo(() => {
    if (!dataFat?.dados) return [];
    if (!buscaFat) return dataFat.dados;
    const termo = buscaFat.toLowerCase();
    return dataFat.dados.filter(r =>
      r.paciente.toLowerCase().includes(termo) ||
      r.carteira.toLowerCase().includes(termo) ||
      r.guia.toLowerCase().includes(termo) ||
      r.lote.toLowerCase().includes(termo)
    );
  }, [dataFat?.dados, buscaFat]);

  const dadosRecFiltrados = useMemo(() => {
    if (!dataRec?.dados) return [];
    if (!buscaRec) return dataRec.dados;
    const termo = buscaRec.toLowerCase();
    return dataRec.dados.filter(r =>
      r.paciente.toLowerCase().includes(termo) ||
      r.carteira.toLowerCase().includes(termo) ||
      r.guia.toLowerCase().includes(termo) ||
      r.protocolo.toLowerCase().includes(termo)
    );
  }, [dataRec?.dados, buscaRec]);

  const exportarFaturado = () => {
    if (!dadosFatFiltrados.length) return;
    const headers = ['Paciente', 'Carteira', 'Guia', 'Lote', 'Convênio', 'Data Entrada', 'Data Saída', 'Qtd Diárias', 'Vl. Diária', 'Vl. Mat/Med', 'Vl. Gás', 'Vl. Taxas', 'Total Faturado'];
    const rows = dadosFatFiltrados.map(r => [
      r.paciente, r.carteira, r.guia, r.lote, r.convenio,
      formatDate(r.dataEntrada), formatDate(r.dataSaida), r.qtdDiarias,
      r.vlDiaria, r.vlMatmed, r.vlGas, r.vlTaxa, r.vlTotal
    ]);
    if (dataFat?.totais) {
      const t = dataFat.totais;
      rows.push(['TOTAL', '', '', '', '', '', '', t.qtdDiarias, t.vlDiaria, t.vlMatmed, t.vlGas, t.vlTaxa, t.vlTotal]);
    }
    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `faturado_ox_uti_${mesAtualFat}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportarRecebido = () => {
    if (!dadosRecFiltrados.length) return;
    const headers = ['Paciente', 'Carteira', 'Guia', 'Protocolo TISS', 'Lote Prestador', 'Convênio', 'Data Pagamento', 'Vl. Diária (HOS)', 'Vl. Mat/Med', 'Vl. Outros', 'Total Recebido', 'Vl. Glosa'];
    const rows = dadosRecFiltrados.map(r => [
      r.paciente, r.carteira, r.guia, r.protocolo, r.lote, r.convenio,
      formatDate(r.dataPagamento),
      r.vlDiaria, r.vlMatmed, r.vlOutros, r.vlTotal, r.vlGlosa
    ]);
    if (dataRec?.totais) {
      const t = dataRec.totais;
      rows.push(['TOTAL', '', '', '', '', '', '', t.vlDiaria, t.vlMatmed, t.vlOutros, t.vlTotal, t.vlGlosa]);
    }
    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `recebido_ox_uti_${mesAtualRec}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">Resumo Paciente Ox UTI</h1>
          <p className="text-sm text-muted-foreground mt-1">Faturado e Recebido por paciente — separados por Guia, Lote e Protocolo</p>
        </div>
      </div>

      {/* Filtro de Convênio (compartilhado) */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="faturado" className="w-full">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="faturado" className="gap-2">
            <DollarSign className="h-4 w-4" /> Faturado
          </TabsTrigger>
          <TabsTrigger value="recebido" className="gap-2">
            <DollarSign className="h-4 w-4" /> Recebido
          </TabsTrigger>
        </TabsList>

        {/* ABA FATURADO */}
        <TabsContent value="faturado" className="space-y-4 mt-4">
          {/* Filtros Faturado */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="w-full sm:w-48">
              <Select value={mesAtualFat} onValueChange={setMesRefFat}>
                <SelectTrigger>
                  <SelectValue placeholder="Competência" />
                </SelectTrigger>
                <SelectContent>
                  {mesesFat?.map(m => <SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Input placeholder="Buscar paciente, carteira, guia ou lote..." value={buscaFat} onChange={e => setBuscaFat(e.target.value)} />
            </div>
            <Button onClick={exportarFaturado} disabled={!dadosFatFiltrados.length} variant="outline" className="gap-2">
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>

          {/* KPIs Faturado */}
          {dataFat?.totais && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="p-3">
                  <span className="text-xs text-muted-foreground">Pacientes</span>
                  <p className="text-lg font-bold text-blue-700">{dataFat.totais.totalPacientes}</p>
                </CardContent>
              </Card>
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="p-3">
                  <span className="text-xs text-muted-foreground">Guias</span>
                  <p className="text-lg font-bold text-blue-700">{dataFat.totais.totalGuias}</p>
                </CardContent>
              </Card>
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="p-3">
                  <span className="text-xs text-muted-foreground">Total Diárias</span>
                  <p className="text-lg font-bold text-blue-700">{dataFat.totais.qtdDiarias}</p>
                </CardContent>
              </Card>
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="p-3">
                  <span className="text-xs text-muted-foreground">Total Faturado</span>
                  <p className="text-sm font-bold text-blue-700">{formatCurrency(dataFat.totais.vlTotal)}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tabela Faturado */}
          <Card>
            <CardContent className="p-0">
              {loadingFat ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <span className="ml-3 text-muted-foreground">Carregando...</span>
                </div>
              ) : dadosFatFiltrados.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">Nenhum dado encontrado.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-semibold min-w-[120px]">Paciente</th>
                        <th className="text-left p-2 font-semibold min-w-[80px]">Guia</th>
                        <th className="text-left p-2 font-semibold min-w-[70px]">Lote</th>
                        <th className="text-center p-2 font-semibold min-w-[75px]">Entrada</th>
                        <th className="text-center p-2 font-semibold min-w-[75px]">Saída</th>
                        <th className="text-center p-2 font-semibold min-w-[50px]">Diárias</th>
                        <th className="text-right p-2 font-semibold text-blue-600 min-w-[90px]">Vl. Diária</th>
                        <th className="text-right p-2 font-semibold text-blue-600 min-w-[90px]">Mat/Med</th>
                        <th className="text-right p-2 font-semibold text-blue-600 min-w-[90px]">Gás</th>
                        <th className="text-right p-2 font-semibold text-blue-600 min-w-[90px]">Taxas</th>
                        <th className="text-right p-2 font-semibold text-blue-700 min-w-[100px] bg-blue-50">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dadosFatFiltrados.map((r, i) => (
                        <tr key={`${r.guia}-${r.lote}-${i}`} className="border-b hover:bg-muted/30">
                          <td className="p-2">
                            <div className="font-medium truncate max-w-[150px]" title={r.paciente}>{r.paciente}</div>
                            <div className="text-[10px] text-muted-foreground">{r.convenio}</div>
                          </td>
                          <td className="p-2 font-mono text-[11px]">{r.guia}</td>
                          <td className="p-2 font-mono text-[11px]">{r.lote}</td>
                          <td className="p-2 text-center">{formatDate(r.dataEntrada)}</td>
                          <td className="p-2 text-center">{formatDate(r.dataSaida)}</td>
                          <td className="p-2 text-center font-medium">{r.qtdDiarias}</td>
                          <td className="p-2 text-right text-blue-600">{formatCurrency(r.vlDiaria)}</td>
                          <td className="p-2 text-right text-blue-600">{formatCurrency(r.vlMatmed)}</td>
                          <td className="p-2 text-right text-blue-600">{formatCurrency(r.vlGas)}</td>
                          <td className="p-2 text-right text-blue-600">{formatCurrency(r.vlTaxa)}</td>
                          <td className="p-2 text-right font-semibold text-blue-700 bg-blue-50/50">{formatCurrency(r.vlTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {dataFat?.totais && (
                      <tfoot>
                        <tr className="border-t-2 bg-muted/70 font-semibold">
                          <td className="p-2">TOTAL</td>
                          <td className="p-2"></td>
                          <td className="p-2"></td>
                          <td className="p-2"></td>
                          <td className="p-2"></td>
                          <td className="p-2 text-center">{dataFat.totais.qtdDiarias}</td>
                          <td className="p-2 text-right text-blue-700">{formatCurrency(dataFat.totais.vlDiaria)}</td>
                          <td className="p-2 text-right text-blue-700">{formatCurrency(dataFat.totais.vlMatmed)}</td>
                          <td className="p-2 text-right text-blue-700">{formatCurrency(dataFat.totais.vlGas)}</td>
                          <td className="p-2 text-right text-blue-700">{formatCurrency(dataFat.totais.vlTaxa)}</td>
                          <td className="p-2 text-right text-blue-800 bg-blue-100/50">{formatCurrency(dataFat.totais.vlTotal)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA RECEBIDO */}
        <TabsContent value="recebido" className="space-y-4 mt-4">
          {/* Filtros Recebido */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="w-full sm:w-48">
              <Select value={mesAtualRec} onValueChange={setMesRefRec}>
                <SelectTrigger>
                  <SelectValue placeholder="Mês Pagamento" />
                </SelectTrigger>
                <SelectContent>
                  {mesesRec?.map(m => <SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Input placeholder="Buscar paciente, carteira, guia ou protocolo..." value={buscaRec} onChange={e => setBuscaRec(e.target.value)} />
            </div>
            <Button onClick={exportarRecebido} disabled={!dadosRecFiltrados.length} variant="outline" className="gap-2">
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>

          {/* KPIs Recebido */}
          {dataRec?.totais && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="border-green-200 bg-green-50/50">
                <CardContent className="p-3">
                  <span className="text-xs text-muted-foreground">Pacientes</span>
                  <p className="text-lg font-bold text-green-700">{dataRec.totais.totalPacientes}</p>
                </CardContent>
              </Card>
              <Card className="border-green-200 bg-green-50/50">
                <CardContent className="p-3">
                  <span className="text-xs text-muted-foreground">Guias</span>
                  <p className="text-lg font-bold text-green-700">{dataRec.totais.totalGuias}</p>
                </CardContent>
              </Card>
              <Card className="border-green-200 bg-green-50/50">
                <CardContent className="p-3">
                  <span className="text-xs text-muted-foreground">Total Recebido</span>
                  <p className="text-sm font-bold text-green-700">{formatCurrency(dataRec.totais.vlTotal)}</p>
                </CardContent>
              </Card>
              <Card className="border-red-200 bg-red-50/50">
                <CardContent className="p-3">
                  <span className="text-xs text-muted-foreground">Total Glosa</span>
                  <p className="text-sm font-bold text-red-700">{formatCurrency(dataRec.totais.vlGlosa)}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tabela Recebido */}
          <Card>
            <CardContent className="p-0">
              {loadingRec ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <span className="ml-3 text-muted-foreground">Carregando...</span>
                </div>
              ) : dadosRecFiltrados.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">Nenhum dado encontrado.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-semibold min-w-[120px]">Paciente</th>
                        <th className="text-left p-2 font-semibold min-w-[80px]">Guia</th>
                        <th className="text-left p-2 font-semibold min-w-[90px]">Protocolo TISS</th>
                        <th className="text-left p-2 font-semibold min-w-[80px]">Lote Prest.</th>
                        <th className="text-center p-2 font-semibold min-w-[80px]">Dt. Pagto</th>
                        <th className="text-right p-2 font-semibold text-green-600 min-w-[90px]">Diária (HOS)</th>
                        <th className="text-right p-2 font-semibold text-green-600 min-w-[90px]">Mat/Med</th>
                        <th className="text-right p-2 font-semibold text-green-600 min-w-[90px]">Outros</th>
                        <th className="text-right p-2 font-semibold text-green-700 min-w-[100px] bg-green-50">Total Rec.</th>
                        <th className="text-right p-2 font-semibold text-red-600 min-w-[90px]">Glosa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dadosRecFiltrados.map((r, i) => (
                        <tr key={`${r.guia}-${r.protocolo}-${i}`} className="border-b hover:bg-muted/30">
                          <td className="p-2">
                            <div className="font-medium truncate max-w-[150px]" title={r.paciente}>{r.paciente}</div>
                            <div className="text-[10px] text-muted-foreground">{r.convenio}</div>
                          </td>
                          <td className="p-2 font-mono text-[11px]">{r.guia}</td>
                          <td className="p-2 font-mono text-[11px]">{r.protocolo}</td>
                          <td className="p-2 font-mono text-[11px]">{r.lote}</td>
                          <td className="p-2 text-center">{formatDate(r.dataPagamento)}</td>
                          <td className="p-2 text-right text-green-600">{formatCurrency(r.vlDiaria)}</td>
                          <td className="p-2 text-right text-green-600">{formatCurrency(r.vlMatmed)}</td>
                          <td className="p-2 text-right text-green-600">{formatCurrency(r.vlOutros)}</td>
                          <td className="p-2 text-right font-semibold text-green-700 bg-green-50/50">{formatCurrency(r.vlTotal)}</td>
                          <td className="p-2 text-right text-red-600">{formatCurrency(r.vlGlosa)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {dataRec?.totais && (
                      <tfoot>
                        <tr className="border-t-2 bg-muted/70 font-semibold">
                          <td className="p-2">TOTAL</td>
                          <td className="p-2"></td>
                          <td className="p-2"></td>
                          <td className="p-2"></td>
                          <td className="p-2"></td>
                          <td className="p-2 text-right text-green-700">{formatCurrency(dataRec.totais.vlDiaria)}</td>
                          <td className="p-2 text-right text-green-700">{formatCurrency(dataRec.totais.vlMatmed)}</td>
                          <td className="p-2 text-right text-green-700">{formatCurrency(dataRec.totais.vlOutros)}</td>
                          <td className="p-2 text-right text-green-800 bg-green-100/50">{formatCurrency(dataRec.totais.vlTotal)}</td>
                          <td className="p-2 text-right text-red-700">{formatCurrency(dataRec.totais.vlGlosa)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
