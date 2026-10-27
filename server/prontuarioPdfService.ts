import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import {
  contasConvenioItens,
  prontuarioPdfAnexos,
  prontuarioPdfAnexoEventos,
} from "../drizzle/schema";
import {
  PRONTUARIO_PDF_MAX_BYTES,
  type ProntuarioPdfAnexoPublico,
  type ProntuarioPdfEscopo,
  type ProntuarioPdfUploadMultipart,
  type ProntuarioPdfUploadPublico,
} from "../shared/prontuarioPdf";
import { getDb, verificarAcessoModulo } from "./db";
import {
  exigirAcessoEstabelecimento,
  exigirConvenioDoEstabelecimento,
} from "./recursoGlosaPermissions";
import {
  armazenamentoProntuarioPdfPronto,
  criarChaveStoragePdfProntuario,
  lerPdfProntuario,
  salvarPdfProntuario,
} from "./prontuarioPdfStorage";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Permissao = "visualizar" | "editar";
type TipoEventoAnexo = "upload" | "download" | "inativacao";
type ResultadoEvento = "sucesso" | "falha";

type AnexoInterno = {
  id: number;
  estabelecimentoId: number;
  convenioId: number;
  arquivoHospitalId: number;
  numeroConta: string;
  numeroLote: string;
  competencia: string;
  nomeArquivo: string;
  tamanhoBytes: number;
  storageKey: string;
  ativo: "sim" | "nao";
  criadoEm: Date;
};

type UploadInterno = ProntuarioPdfUploadMultipart & { arquivo: Buffer };

function erro(code: TRPCError["code"], message: string): never {
  throw new TRPCError({ code, message });
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function schemaPendente(error: unknown): boolean {
  const pendentes: unknown[] = [error];
  const vistos = new Set<unknown>();
  while (pendentes.length) {
    const current = pendentes.pop();
    if (!current || typeof current !== "object" || vistos.has(current))
      continue;
    vistos.add(current);
    const code = String((current as any).code ?? "");
    const message = String((current as any).message ?? "");
    if (
      ["ER_NO_SUCH_TABLE", "ER_BAD_TABLE_ERROR", "42P01"].includes(code) ||
      /doesn't exist|no such table|unknown table/i.test(message)
    )
      return true;
    pendentes.push(
      (current as any).cause,
      (current as any).driverError,
      (current as any).originalError
    );
  }
  return false;
}

function tratarErro(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  if (schemaPendente(error)) {
    erro(
      "PRECONDITION_FAILED",
      "O anexo seguro de prontuário aguarda a migração de metadados e auditoria."
    );
  }
  erro(
    "INTERNAL_SERVER_ERROR",
    "Não foi possível concluir a operação de prontuário."
  );
}

/** Validação de bytes aplicada somente no servidor após o multer. */
export function validarPdfProntuario(buffer: Buffer): void {
  if (
    !Buffer.isBuffer(buffer) ||
    !buffer.length ||
    buffer.length > PRONTUARIO_PDF_MAX_BYTES
  ) {
    erro("BAD_REQUEST", "O PDF deve ter entre 1 byte e 5 MB.");
  }
  if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))) {
    erro("BAD_REQUEST", "O arquivo enviado não é um PDF válido.");
  }
}

function publicar(row: AnexoInterno): ProntuarioPdfAnexoPublico {
  return {
    id: Number(row.id),
    nomeArquivo: row.nomeArquivo,
    tamanhoBytes: Number(row.tamanhoBytes),
    criadoEm: row.criadoEm,
  };
}

function condicaoEscopo(escopo: ProntuarioPdfEscopo) {
  return and(
    eq(prontuarioPdfAnexos.estabelecimentoId, escopo.estabelecimentoId),
    eq(prontuarioPdfAnexos.convenioId, escopo.convenioId),
    eq(prontuarioPdfAnexos.arquivoHospitalId, escopo.arquivoHospitalId),
    eq(prontuarioPdfAnexos.numeroConta, escopo.numeroConta),
    eq(prontuarioPdfAnexos.numeroLote, escopo.numeroLote),
    eq(prontuarioPdfAnexos.competencia, escopo.competencia)
  );
}

/** Insere somente o contexto mínimo permitido na trilha append-only. */
async function registrarEventoAnexo(
  db: Pick<Db, "insert">,
  input: {
    anexoId: number;
    escopo: ProntuarioPdfEscopo;
    tipo: TipoEventoAnexo;
    usuarioId: number;
    resultado: ResultadoEvento;
  }
): Promise<void> {
  await db.insert(prontuarioPdfAnexoEventos).values({
    anexoId: input.anexoId,
    estabelecimentoId: input.escopo.estabelecimentoId,
    convenioId: input.escopo.convenioId,
    arquivoHospitalId: input.escopo.arquivoHospitalId,
    numeroConta: input.escopo.numeroConta,
    numeroLote: input.escopo.numeroLote,
    competencia: input.escopo.competencia,
    tipo: input.tipo,
    usuarioId: input.usuarioId,
    resultado: input.resultado,
  });
}

function linhasAfetadas(result: unknown): number {
  return Number(
    (result as any)?.rowsAffected ??
      (result as any)?.affectedRows ??
      (result as any)?.[0]?.affectedRows ??
      0
  );
}

async function dbOuErro(): Promise<Db> {
  const db = await getDb();
  if (!db)
    erro(
      "PRECONDITION_FAILED",
      "O banco de metadados de prontuário não está disponível."
    );
  return db;
}

/**
 * Revalida no servidor a mesma chave que a UI constrói apenas de itens XML. A
 * consulta deliberadamente não lê valores, totais, beneficiário nem outros dados
 * financeiros: basta garantir a origem hospitalar e os identificadores canônicos.
 */
async function exigirEscopoXmlCanonico(
  db: Db,
  escopo: ProntuarioPdfEscopo
): Promise<void> {
  const itens = await db
    .select({
      origem: contasConvenioItens.origem,
      arquivoId: contasConvenioItens.arquivoId,
      convenioId: contasConvenioItens.convenioId,
      numeroLote: contasConvenioItens.numeroLote,
      competencia: contasConvenioItens.competencia,
    })
    .from(contasConvenioItens)
    .where(
      and(
        eq(contasConvenioItens.numeroConta, escopo.numeroConta),
        eq(contasConvenioItens.estabelecimentoId, escopo.estabelecimentoId)
      )
    );

  if (!itens.length)
    erro("NOT_FOUND", "Conta XML não encontrada para o escopo informado.");
  const canonico = itens.every(
    item =>
      item.origem === "XML" &&
      Number(item.arquivoId) === escopo.arquivoHospitalId &&
      Number(item.convenioId) === escopo.convenioId &&
      String(item.numeroLote ?? "").trim() === escopo.numeroLote &&
      String(item.competencia ?? "").trim() === escopo.competencia
  );
  if (!canonico) {
    erro(
      "FORBIDDEN",
      "A conta não possui um escopo XML hospitalar canônico para anexar prontuário."
    );
  }
}

export async function autorizarProntuarioPdf(
  userId: number,
  escopo: ProntuarioPdfEscopo,
  permissao: Permissao
): Promise<void> {
  await exigirAcessoEstabelecimento(
    userId,
    escopo.estabelecimentoId,
    permissao
  );
  await exigirConvenioDoEstabelecimento(
    userId,
    escopo.convenioId,
    escopo.estabelecimentoId,
    permissao
  );
  const modulo = await verificarAcessoModulo(
    userId,
    escopo.estabelecimentoId,
    "contaConvenio"
  );
  if (!modulo)
    erro("FORBIDDEN", "Sem acesso à Conta Convênio neste estabelecimento.");
}

export async function prontuarioPdfListar(
  escopo: ProntuarioPdfEscopo,
  userId: number
) {
  try {
    await autorizarProntuarioPdf(userId, escopo, "visualizar");
    const db = await dbOuErro();
    await exigirEscopoXmlCanonico(db, escopo);
    const rows = await db
      .select({
        id: prontuarioPdfAnexos.id,
        nomeArquivo: prontuarioPdfAnexos.nomeArquivo,
        tamanhoBytes: prontuarioPdfAnexos.tamanhoBytes,
        criadoEm: prontuarioPdfAnexos.criadoEm,
      })
      .from(prontuarioPdfAnexos)
      .where(and(condicaoEscopo(escopo), eq(prontuarioPdfAnexos.ativo, "sim")))
      .orderBy(asc(prontuarioPdfAnexos.criadoEm), asc(prontuarioPdfAnexos.id));
    return rows.map(row => publicar(row as AnexoInterno));
  } catch (error) {
    return tratarErro(error);
  }
}

/**
 * Reserva uma quarentena referenciada antes de gravar o objeto. A primeira
 * transação registra upload/falha e deixa o anexo inativo; assim, falha de
 * storage ou da ativação jamais cria objeto sem metadado referenciável. Não há
 * remoção de storage: reservas que não chegam ao sucesso permanecem inativas.
 */
export async function prontuarioPdfUpload(
  input: UploadInterno,
  userId: number
): Promise<ProntuarioPdfUploadPublico> {
  const { nomeArquivo, confirmar: _confirmar, arquivo, ...escopo } = input;
  try {
    await autorizarProntuarioPdf(userId, escopo, "editar");
    const db = await dbOuErro();
    await exigirEscopoXmlCanonico(db, escopo);
    if (!armazenamentoProntuarioPdfPronto()) {
      erro(
        "PRECONDITION_FAILED",
        "O armazenamento protegido de PDFs de prontuário precisa ser configurado pelo administrador."
      );
    }
    validarPdfProntuario(arquivo);

    // Ambos são definidos antes da reserva e do I/O. A chave nunca é publicada.
    const storageKey = criarChaveStoragePdfProntuario(escopo);
    const hashPdf = sha256(arquivo);
    const anexoId = await db.transaction(async tx => {
      const [inserted] = await tx
        .insert(prontuarioPdfAnexos)
        .values({
          estabelecimentoId: escopo.estabelecimentoId,
          convenioId: escopo.convenioId,
          arquivoHospitalId: escopo.arquivoHospitalId,
          numeroConta: escopo.numeroConta,
          numeroLote: escopo.numeroLote,
          competencia: escopo.competencia,
          tipo: "prontuario_pdf",
          nomeArquivo,
          tamanhoBytes: arquivo.length,
          sha256: hashPdf,
          storageKey,
          ativo: "nao",
          criadoPor: userId,
        })
        .$returningId();
      const id = Number(inserted?.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        erro(
          "INTERNAL_SERVER_ERROR",
          "Não foi possível confirmar a reserva do PDF de prontuário."
        );
      }
      await registrarEventoAnexo(tx, {
        anexoId: id,
        escopo,
        tipo: "upload",
        usuarioId: userId,
        resultado: "falha",
      });
      return id;
    });

    // Se esta etapa falhar, a reserva inativa e seu evento de falha permanecem.
    await salvarPdfProntuario(arquivo, escopo, storageKey);

    // O objeto só passa a ser listável/baixável se esta segunda transação concluir.
    return await db.transaction(async tx => {
      const result = await tx
        .update(prontuarioPdfAnexos)
        .set({ ativo: "sim" })
        .where(
          and(
            condicaoEscopo(escopo),
            eq(prontuarioPdfAnexos.id, anexoId),
            eq(prontuarioPdfAnexos.ativo, "nao")
          )
        );
      if (linhasAfetadas(result) !== 1) {
        erro("NOT_FOUND", "Reserva de anexo não encontrada para este escopo.");
      }
      await registrarEventoAnexo(tx, {
        anexoId,
        escopo,
        tipo: "upload",
        usuarioId: userId,
        resultado: "sucesso",
      });
      return { id: anexoId, nomeArquivo, tamanhoBytes: arquivo.length };
    });
  } catch (error) {
    return tratarErro(error);
  }
}

export async function prontuarioPdfInativar(
  input: ProntuarioPdfEscopo & { anexoId: number; confirmar: true },
  userId: number
) {
  const { anexoId, confirmar: _confirmar, ...escopo } = input;
  try {
    await autorizarProntuarioPdf(userId, escopo, "editar");
    const db = await dbOuErro();
    await exigirEscopoXmlCanonico(db, escopo);
    return await db.transaction(async tx => {
      const result = await tx
        .update(prontuarioPdfAnexos)
        .set({
          ativo: "nao",
          inativadoPor: userId,
          inativadoEm: new Date(),
        })
        .where(
          and(
            condicaoEscopo(escopo),
            eq(prontuarioPdfAnexos.id, anexoId),
            eq(prontuarioPdfAnexos.ativo, "sim")
          )
        );
      if (linhasAfetadas(result) !== 1) {
        erro("NOT_FOUND", "Anexo ativo não encontrado para este escopo.");
      }
      await registrarEventoAnexo(tx, {
        anexoId,
        escopo,
        tipo: "inativacao",
        usuarioId: userId,
        resultado: "sucesso",
      });
      return { id: anexoId, inativado: true };
    });
  } catch (error) {
    return tratarErro(error);
  }
}

export async function prontuarioPdfBaixar(
  input: ProntuarioPdfEscopo & { anexoId: number },
  userId: number
): Promise<{ nomeArquivo: string; conteudo: Buffer }> {
  const { anexoId, ...escopo } = input;
  try {
    await autorizarProntuarioPdf(userId, escopo, "visualizar");
    const db = await dbOuErro();
    await exigirEscopoXmlCanonico(db, escopo);
    const [anexo] = await db
      .select({
        id: prontuarioPdfAnexos.id,
        estabelecimentoId: prontuarioPdfAnexos.estabelecimentoId,
        convenioId: prontuarioPdfAnexos.convenioId,
        arquivoHospitalId: prontuarioPdfAnexos.arquivoHospitalId,
        numeroConta: prontuarioPdfAnexos.numeroConta,
        numeroLote: prontuarioPdfAnexos.numeroLote,
        competencia: prontuarioPdfAnexos.competencia,
        nomeArquivo: prontuarioPdfAnexos.nomeArquivo,
        tamanhoBytes: prontuarioPdfAnexos.tamanhoBytes,
        sha256: prontuarioPdfAnexos.sha256,
        storageKey: prontuarioPdfAnexos.storageKey,
        ativo: prontuarioPdfAnexos.ativo,
        criadoEm: prontuarioPdfAnexos.criadoEm,
      })
      .from(prontuarioPdfAnexos)
      .where(
        and(
          condicaoEscopo(escopo),
          eq(prontuarioPdfAnexos.id, anexoId),
          eq(prontuarioPdfAnexos.ativo, "sim")
        )
      )
      .limit(1);
    if (!anexo)
      erro("NOT_FOUND", "Anexo ativo não encontrado para este escopo.");

    // A resolução do anexo pelo escopo e a autorização acontecem antes do storage.
    const conteudo = await lerPdfProntuario(anexo.storageKey, escopo);
    if (
      !conteudo.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii")) ||
      sha256(conteudo) !== anexo.sha256
    ) {
      erro(
        "PRECONDITION_FAILED",
        "O PDF protegido não passou na validação de integridade."
      );
    }

    await db.transaction(async tx => {
      // Revalida o anexo ativo no momento de registrar o download. Isso impede
      // auditar uma leitura concorrente já inativada e mantém o escopo completo.
      const [ativo] = await tx
        .select({ id: prontuarioPdfAnexos.id })
        .from(prontuarioPdfAnexos)
        .where(
          and(
            condicaoEscopo(escopo),
            eq(prontuarioPdfAnexos.id, anexoId),
            eq(prontuarioPdfAnexos.ativo, "sim")
          )
        )
        .limit(1);
      if (!ativo)
        erro("NOT_FOUND", "Anexo ativo não encontrado para este escopo.");
      await registrarEventoAnexo(tx, {
        anexoId,
        escopo,
        tipo: "download",
        usuarioId: userId,
        resultado: "sucesso",
      });
    });
    return { nomeArquivo: anexo.nomeArquivo, conteudo };
  } catch (error) {
    return tratarErro(error);
  }
}
