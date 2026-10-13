import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { formatWarleineItemCivilDate } from "@shared/warleineItemPresentation";
import { avaliarComparativoItem } from "@shared/hupComparativoPresentation";
import { formatPilotoMoney } from "@/lib/hupPilotoMoney";

const motivos: Record<string, string> = {
  comparavel: "Candidato exclusivo, data coincidente e valores informados.",
  medico_direto: "Médico direto: não compõe a pendência hospitalar.",
  ambiguo:
    "Mais de uma correspondência ou evento compartilhado; revisar candidatos.",
  sem_candidato:
    "Sem correspondência neste período; não comprova falta de pagamento.",
  dados_incompletos: "Dados insuficientes para comparar este grupo de itens.",
  sem_prova_data:
    "Data do item ausente ou diferente no retorno; diferença indisponível.",
  valores_nao_informados:
    "Pago ou glosa não informado; diferença indisponível, não zero.",
};

function ResultadoItem({
  comparavel,
  diferenca,
  motivo,
}: {
  comparavel: boolean;
  diferenca: string | null;
  motivo: string;
}) {
  const semDiferenca = diferenca != null && /^-?0(?:\.0+)?$/.test(diferenca);
  const texto = comparavel
    ? semDiferenca
      ? "Sem diferença"
      : "Diferença identificada"
    : "Revisar";
  return (
    <div className="max-w-[230px]">
      <Badge
        variant="outline"
        className={
          comparavel
            ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
            : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        }
      >
        {texto}
      </Badge>
      <p className="mt-1 text-xs text-muted-foreground">
        {motivos[motivo] || motivo}
      </p>
    </div>
  );
}

export default function HupComparativoGuiaDetalhes({
  recorte,
  guiaChave,
  identificadores,
}: {
  recorte: {
    estabelecimentoId: number;
    competencia: string;
    convenioId: number;
    mesPagamento?: string;
  };
  guiaChave: string;
  identificadores: {
    conta: string;
    guiaPrestador: string;
    guiaOperadora: string;
  };
}) {
  const [page, setPage] = useState(1);
  const [itemAberto, setItemAberto] = useState<string | null>(null);
  const { data, isFetching, error } =
    trpc.hupConciliacaoPiloto.itensGuia.useQuery(
      { ...recorte, ...identificadores, guiaChave, page, pageSize: 50 },
      { retry: false, staleTime: 0 }
    );

  if (isFetching)
    return (
      <p role="status" className="py-5 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
        Consultando os itens da guia…
      </p>
    );
  if (error)
    return (
      <p role="alert" className="py-4 text-sm text-destructive">
        Não foi possível consultar os itens: {error.message}
      </p>
    );
  if (!data || data.status !== "ok" || !data.guia)
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Não há itens comparáveis neste recorte da guia. Nenhum vínculo foi
        gravado.
      </p>
    );

  const guia = data.guia;
  const totalPages = Math.max(1, Math.ceil(data.total / 50));
  return (
    <div className="space-y-3 min-w-0">
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-b pb-3 text-sm tabular-nums">
        <span>
          <span className="mr-1 text-muted-foreground">Faturado</span>
          <strong className="text-blue-600">
            {formatPilotoMoney(guia.valorFaturadoHospital)}
          </strong>
        </span>
        <span title="Valor candidato à revisão, não recebido confirmado">
          <span className="mr-1 text-muted-foreground">Recebido</span>
          <strong className="text-green-600">
            {formatPilotoMoney(guia.valorPagoCandidato)}
          </strong>
        </span>
        <span title="Valor candidato à revisão, não glosado confirmado">
          <span className="mr-1 text-muted-foreground">Glosado</span>
          <strong className="text-red-600">
            {formatPilotoMoney(guia.valorGlosaCandidata)}
          </strong>
        </span>
        <span>
          <span className="mr-1 text-muted-foreground">Diferença</span>
          <strong>{formatPilotoMoney(guia.diferencaGuia)}</strong>
        </span>
        <span className="basis-full text-xs text-muted-foreground">
          Valores candidatos; vínculos não gravados. “—” é desconhecido, não
          zero.
        </span>
      </div>

      <div className="overflow-x-auto">
        <table
          className="w-full text-sm"
          aria-label="Comparativo por item da guia"
        >
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left font-medium">TUSS</th>
              <th className="p-3 text-left font-medium">Data</th>
              <th className="p-3 text-left font-medium">Tipo</th>
              <th className="p-3 text-left font-medium">Setor</th>
              <th className="p-3 text-left font-medium">Modalidade</th>
              <th className="p-3 text-center font-medium">Qtd.</th>
              <th className="p-3 text-right font-medium">Faturado</th>
              <th
                className="p-3 text-right font-medium"
                title="Valor candidato à revisão, não recebido confirmado"
              >
                Recebido
              </th>
              <th
                className="p-3 text-right font-medium"
                title="Valor candidato à revisão, não glosado confirmado"
              >
                Glosado
              </th>
              <th className="p-3 text-right font-medium">Diferença</th>
              <th className="p-3 text-left font-medium">Status</th>
              <th className="p-3 text-center font-medium">Eventos</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(item => {
              const avaliacao = avaliarComparativoItem(item);
              const unico =
                item.numeroCandidatos === 1 ? item.candidatos[0] : undefined;
              const aberto = itemAberto === item.chave;
              return (
                <Fragment key={item.chave}>
                  <tr className="border-b align-top hover:bg-muted/50">
                    <td className="p-3 font-medium">
                      {item.codigoTuss || "—"}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {formatWarleineItemCivilDate(item.dataItem)}
                      <span className="block text-xs text-muted-foreground">
                        Retorno:{" "}
                        {unico
                          ? formatWarleineItemCivilDate(unico.dataItem)
                          : "—"}
                      </span>
                    </td>
                    <td className="p-3">{item.tipoItem || "—"}</td>
                    <td className="p-3">{item.setor || "—"}</td>
                    <td className="p-3">
                      {item.modalidade === "N"
                        ? "Médico direto"
                        : item.modalidade === "S"
                          ? "Hospital"
                          : "—"}
                    </td>
                    <td className="p-3 text-center">
                      {item.quantidade || "—"}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap text-blue-600 tabular-nums">
                      {formatPilotoMoney(item.valorFaturado)}
                    </td>
                    <td
                      className="p-3 text-right whitespace-nowrap text-green-600 tabular-nums"
                      title="Valor candidato à revisão, não recebido confirmado"
                    >
                      {formatPilotoMoney(item.valorPagoCandidato)}
                    </td>
                    <td
                      className="p-3 text-right whitespace-nowrap text-red-600 tabular-nums"
                      title="Valor candidato à revisão, não glosado confirmado"
                    >
                      {formatPilotoMoney(item.valorGlosaCandidata)}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap font-medium tabular-nums">
                      {formatPilotoMoney(avaliacao.diferenca)}
                    </td>
                    <td className="p-3">
                      <ResultadoItem {...avaliacao} />
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={item.numeroCandidatos === 0}
                        aria-expanded={aberto}
                        aria-label={`Ver ${item.numeroCandidatos} evento(s) candidato(s) do item ${item.codigoTuss || "sem TUSS"}`}
                        onClick={() =>
                          setItemAberto(atual =>
                            atual === item.chave ? null : item.chave
                          )
                        }
                      >
                        {aberto ? (
                          <ChevronDown className="mr-1 h-4 w-4" />
                        ) : (
                          <ChevronRight className="mr-1 h-4 w-4" />
                        )}
                        {item.numeroCandidatos}
                      </Button>
                    </td>
                  </tr>
                  {aberto ? (
                    <tr className="border-b bg-muted/20">
                      <td colSpan={12} className="p-3">
                        <p className="mb-2 text-xs text-muted-foreground">
                          {item.motivo ||
                            motivos[avaliacao.motivo] ||
                            "Candidatos para revisão."}
                        </p>
                        <div className="space-y-1 text-xs">
                          {item.candidatos.map((candidato, index) => (
                            <div
                              key={`${candidato.guia}-${candidato.codigoTuss}-${index}`}
                              className="flex flex-wrap gap-x-3 gap-y-1 rounded bg-background px-2 py-1.5"
                            >
                              <span>Guia {candidato.guia || "—"}</span>
                              <span>TUSS {candidato.codigoTuss || "—"}</span>
                              <span>
                                Item{" "}
                                {formatWarleineItemCivilDate(
                                  candidato.dataItem
                                )}
                              </span>
                              <span>
                                Pagamento{" "}
                                {formatWarleineItemCivilDate(
                                  candidato.dataPagamento
                                )}
                              </span>
                              <span>
                                Pago {formatPilotoMoney(candidato.valorPago)}
                              </span>
                              <span>
                                Glosa {formatPilotoMoney(candidato.valorGlosa)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {data.total.toLocaleString("pt-BR")} grupos de itens · página {page}{" "}
          de {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              setItemAberto(null);
              setPage(value => value - 1);
            }}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => {
              setItemAberto(null);
              setPage(value => value + 1);
            }}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}
