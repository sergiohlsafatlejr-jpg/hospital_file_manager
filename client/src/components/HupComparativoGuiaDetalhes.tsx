import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatWarleineItemCivilDate } from "@shared/warleineItemPresentation";
import { avaliarComparativoItem } from "@shared/hupComparativoPresentation";
import { formatPilotoMoney } from "@/lib/hupPilotoMoney";

const motivos: Record<string, string> = {
  comparavel: "Guia, TUSS e data coincidentes; pago e glosa informados. Sem vínculo confirmado.",
  medico_direto: "Médico direto: não compõe a pendência hospitalar.",
  ambiguo: "Mais de uma correspondência ou evento compartilhado; revisar candidatos.",
  sem_candidato: "Sem correspondência neste período; não comprova falta de pagamento.",
  dados_incompletos: "Dados insuficientes para comparar este grupo de itens.",
  sem_prova_data: "Data do item ausente ou diferente no retorno; diferença indisponível.",
  valores_nao_informados: "Pago ou glosa não informado; diferença indisponível, não zero.",
};

export default function HupComparativoGuiaDetalhes({ recorte, guiaChave, identificadores }: {
  recorte: { estabelecimentoId: number; competencia: string; convenioId: number; mesPagamento?: string };
  guiaChave: string;
  identificadores: { conta: string; guiaPrestador: string; guiaOperadora: string };
}) {
  const [page, setPage] = useState(1);
  const { data, isFetching, error } = trpc.hupConciliacaoPiloto.itensGuia.useQuery(
    { ...recorte, ...identificadores, guiaChave, page, pageSize: 50 }, { retry: false, staleTime: 0 },
  );
  if (isFetching) return <div role="status" className="p-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Buscando o comparativo dos itens da guia…</div>;
  if (error) return <p role="alert" className="p-4 text-destructive">Não foi possível consultar os itens: {error.message}</p>;
  if (!data || data.status !== "ok" || !data.guia) return <p className="p-4 text-muted-foreground">Não há itens comparáveis neste recorte da guia. Nenhum vínculo foi gravado.</p>;
  const guia = data.guia;
  const totalPages = Math.max(1, Math.ceil(data.total / 50));
  return <div className="space-y-4 min-w-0">
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
      <div><span className="block text-muted-foreground">Faturado via hospital</span><strong>{formatPilotoMoney(guia.valorFaturadoHospital)}</strong></div>
      <div><span className="block text-muted-foreground">Pago candidato</span><strong>{formatPilotoMoney(guia.valorPagoCandidato)}</strong></div>
      <div><span className="block text-muted-foreground">Glosa candidata</span><strong>{formatPilotoMoney(guia.valorGlosaCandidata)}</strong></div>
      <div><span className="block text-muted-foreground">Diferença da guia</span><strong>{formatPilotoMoney(guia.diferencaGuia)}</strong><p className="text-xs text-muted-foreground">{guia.comparacaoCompleta ? "Todos os grupos hospitalares comparáveis" : `${guia.gruposComparaveis}/${guia.gruposHospitalares} grupos hospitalares comparáveis · diferença integral indisponível`}</p></div>
    </div>
    {!guia.comparacaoCompleta && guia.gruposComparaveis > 0 && <p role="note" className="rounded-md border border-amber-200 bg-amber-50/30 p-3 text-sm">Subtotal da diferença apenas dos grupos comparáveis: <strong>{formatPilotoMoney(guia.diferencaComparavel)}</strong>. Não representa a diferença de toda a guia.</p>}
    <p className="text-xs text-muted-foreground">Faturado − pago candidato − glosa informada. O comparativo exige candidato exclusivo, data do item coincidente e valores informados. Médico direto é separado; nenhuma diferença é convertida em glosa automática ou vínculo confirmado.</p>
    <div className="overflow-x-auto border rounded-md"><table className="w-full text-sm min-w-[1250px]" aria-label="Comparativo por item da guia">
      <thead><tr className="border-b bg-muted/40 text-left">{["TUSS", "Data faturado / retorno", "Tipo / setor", "Modalidade", "Itens / qtd.", "Faturado", "Pago candidato", "Glosa candidata", "Diferença", "Resultado"].map(c => <th key={c} className="p-3 font-medium">{c}</th>)}</tr></thead>
      <tbody>{data.items.map(item => {
        const avaliacao = avaliarComparativoItem(item);
        const unico = item.numeroCandidatos === 1 ? item.candidatos[0] : undefined;
        const semDiferenca = avaliacao.diferenca != null && /^-?0(?:\.0+)?$/.test(avaliacao.diferenca);
        return <tr key={item.chave} className="border-b last:border-b-0 align-top">
          <td className="p-3 font-medium">{item.codigoTuss || "—"}</td>
          <td className="p-3 whitespace-nowrap">{formatWarleineItemCivilDate(item.dataItem)}<span className="block text-xs text-muted-foreground">Retorno: {unico ? formatWarleineItemCivilDate(unico.dataItem) : "Sem candidato exclusivo"}</span></td>
          <td className="p-3">{item.tipoItem || "—"}<span className="block text-xs text-muted-foreground">{item.setor || "—"}</span></td>
          <td className="p-3">{item.modalidade === "N" ? "Médico direto" : item.modalidade === "S" ? "Hospital" : "Não informada"}</td>
          <td className="p-3">{item.totalItens} / {item.quantidade}</td>
          <td className="p-3 whitespace-nowrap text-blue-600">{formatPilotoMoney(item.valorFaturado)}</td>
          <td className="p-3 whitespace-nowrap">{formatPilotoMoney(item.valorPagoCandidato)}{unico && <span className="block text-xs text-muted-foreground">Pagamento: {formatWarleineItemCivilDate(unico.dataPagamento)}</span>}</td>
          <td className="p-3 whitespace-nowrap">{formatPilotoMoney(item.valorGlosaCandidata)}</td>
          <td className="p-3 whitespace-nowrap font-semibold">{formatPilotoMoney(avaliacao.diferenca)}</td>
          <td className="p-3 max-w-[280px]"><Badge variant="outline">{avaliacao.comparavel ? (semDiferenca ? "Sem diferença" : "Diferença identificada") : "Revisar"}</Badge><p className="mt-1 text-xs text-muted-foreground">{motivos[avaliacao.motivo] || avaliacao.motivo}</p></td>
        </tr>;
      })}</tbody>
    </table></div>
    <div className="flex flex-wrap justify-between gap-3 items-center"><p className="text-sm text-muted-foreground">{data.total} grupos de itens · página {page} de {totalPages}</p><div className="flex gap-2"><Button variant="outline" disabled={page <= 1 || isFetching} onClick={() => setPage(p => p - 1)}>Itens anteriores</Button><Button variant="outline" disabled={page >= totalPages || isFetching} onClick={() => setPage(p => p + 1)}>Próximos itens</Button></div></div>
    <div className="space-y-2">{data.items.map(item => <details key={item.chave} className="rounded-md border px-3 py-2"><summary className="cursor-pointer text-sm font-medium">TUSS {item.codigoTuss || "—"} · {item.numeroCandidatos} evento(s) candidato(s)</summary><p className="text-sm text-muted-foreground mt-2">{item.motivo}</p>
      {item.candidatos.map((c, i) => <div key={i} className="mt-2 text-xs rounded-md bg-muted/40 p-2">Guia {c.guia || "—"} · TUSS {c.codigoTuss || "—"} · Item {formatWarleineItemCivilDate(c.dataItem)} · Pagamento {formatWarleineItemCivilDate(c.dataPagamento)} · Pago {formatPilotoMoney(c.valorPago)} · Glosa informada {formatPilotoMoney(c.valorGlosa)}</div>)}
      {item.numeroCandidatos > 5 && <p className="text-xs mt-2 text-muted-foreground">Primeiros cinco de {item.numeroCandidatos} eventos para inspeção. Nenhuma alocação automática.</p>}
    </details>)}</div>
    <p className="text-xs text-muted-foreground">Itens idênticos são agrupados com quantidade e faturado preservados. Setores, modalidades e tipos diferentes não são misturados. “—” é desconhecido, não zero. A ausência de candidato não comprova falta de pagamento. Quantidade paga não está disponível neste contrato de demonstrativo.</p>
  </div>;
}
