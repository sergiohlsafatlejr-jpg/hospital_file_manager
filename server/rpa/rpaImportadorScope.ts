import type {
  Arquivo,
  Convenio,
  ConvenioEstabelecimentoPrestador,
  InsertRecebimentoExcel,
} from "../../drizzle/schema";

/** Escopo já autorizado pelo chamador; nunca é inferido a partir da planilha. */
export interface RpaImportadorScope {
  estabelecimentoId: number;
  convenioId: number;
  registroAns?: string | null;
  codigoPrestadorOperadora?: string | null;
}

export type RpaArquivoSnapshot = Pick<Arquivo,
  "id" | "nome" | "tipoArquivo" | "direcao" | "convenioId" |
  "estabelecimentoId" | "userId" | "s3Key" | "s3Url"
>;

type ConvenioScope = Pick<Convenio, "id" | "estabelecimentoId" | "registroAns" | "ativo">;
type PrestadorScope = Pick<ConvenioEstabelecimentoPrestador,
  "estabelecimentoId" | "convenioId" | "codigoPrestador" | "ativo"
>;

export function validarScopeRpa(scope: RpaImportadorScope): void {
  if (!scope || !Number.isSafeInteger(scope.estabelecimentoId) || scope.estabelecimentoId <= 0 ||
      !Number.isSafeInteger(scope.convenioId) || scope.convenioId <= 0) {
    throw new Error("Importação RPA exige hospital e convênio explícitos e válidos");
  }
}

export function validarConvenioRpa(scope: RpaImportadorScope, convenio: ConvenioScope | undefined): void {
  if (!convenio || convenio.id !== scope.convenioId || convenio.ativo !== "sim" ||
      (convenio.estabelecimentoId !== null && convenio.estabelecimentoId !== scope.estabelecimentoId)) {
    throw new Error("Convênio incompatível com o hospital autorizado para a importação RPA");
  }
  if (scope.registroAns !== undefined && scope.registroAns !== null) {
    const esperado = scope.registroAns.replace(/\D/g, "");
    const cadastrado = (convenio.registroAns ?? "").replace(/\D/g, "");
    if (!esperado || !cadastrado || esperado !== cadastrado) {
      throw new Error("Registro ANS conflitante no escopo da importação RPA");
    }
  }
}

export function validarCodigoPrestadorRpa(
  scope: RpaImportadorScope,
  codigo: string | null | undefined,
  vinculos: readonly PrestadorScope[],
): void {
  if (codigo === undefined || codigo === null || codigo === "") return;
  const correspondencias = vinculos.filter(vinculo =>
    vinculo.estabelecimentoId === scope.estabelecimentoId &&
    vinculo.convenioId === scope.convenioId && vinculo.ativo === "sim" &&
    vinculo.codigoPrestador.trim() === codigo.trim(),
  );
  if (!codigo.trim() || correspondencias.length !== 1) {
    throw new Error("Identificação do prestador fora do hospital/convênio autorizado ou ambígua");
  }
}

export function validarRegistrosRpa(
  scope: RpaImportadorScope,
  arquivoId: number,
  records: readonly InsertRecebimentoExcel[],
  vinculos: readonly PrestadorScope[],
): void {
  for (const record of records) {
    if (record.arquivoId !== arquivoId || record.convenioId !== scope.convenioId ||
        record.estabelecimentoId !== scope.estabelecimentoId) {
      throw new Error("Registro de recebimento não pertence ao arquivo/hospital/convênio autorizado");
    }
    // Somente a identificação de pagamento, não o código de um executante terceiro.
    validarCodigoPrestadorRpa(scope, record.codigoPrestadorPagamento, vinculos);
  }
}

export function validarArquivoSnapshotRpa(
  scope: RpaImportadorScope,
  snapshot: RpaArquivoSnapshot,
  arquivo: RpaArquivoSnapshot | undefined,
): void {
  if (snapshot.estabelecimentoId !== scope.estabelecimentoId || snapshot.convenioId !== scope.convenioId ||
      !arquivo || arquivo.id !== snapshot.id || arquivo.nome !== snapshot.nome ||
      arquivo.tipoArquivo !== "excel" || arquivo.direcao !== "retornado" ||
      arquivo.convenioId !== scope.convenioId || arquivo.estabelecimentoId !== scope.estabelecimentoId ||
      arquivo.userId !== snapshot.userId || arquivo.s3Key !== snapshot.s3Key || arquivo.s3Url !== snapshot.s3Url) {
    throw new Error("Snapshot do arquivo ou hospital proprietário divergente na importação RPA");
  }
}
