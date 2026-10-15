import { z } from "zod";

export const easyLocalIdentifier = z
  .string()
  .min(1)
  .max(48)
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "Use letras minúsculas, números e underscore; comece por letra."
  );
export const easyLocalEstabelecimento = z.number().int().positive();
export const easyLocalColuna = z
  .object({
    nome: easyLocalIdentifier,
    tipo: z.enum([
      "varchar",
      "int",
      "bigint",
      "decimal",
      "text",
      "date",
      "datetime",
      "boolean",
    ]),
    tamanho: z.number().int().min(1).max(4096).optional(),
    escala: z.number().int().min(0).max(30).optional(),
    obrigatorio: z.boolean().default(false),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (
      c.tipo === "decimal" &&
      ((c.tamanho ?? 18) > 65 || (c.escala ?? 2) > (c.tamanho ?? 18))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Precisão/escala decimal inválida.",
      });
    }
    if (
      c.nome.startsWith("el_") ||
      ["estabelecimento_id", "sincronizado_em"].includes(c.nome)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Nome reservado para coluna técnica.",
      });
    }
  });
export const easyLocalCriarTabela = z
  .object({
    estabelecimentoId: easyLocalEstabelecimento,
    nome: easyLocalIdentifier.max(28),
    nomeExibicao: z.string().trim().min(1).max(120),
    colunas: z.array(easyLocalColuna).min(1).max(64),
    confirmarCriacao: z.literal(true),
  })
  .strict()
  .superRefine((t, ctx) => {
    if (new Set(t.colunas.map(c => c.nome)).size !== t.colunas.length)
      ctx.addIssue({ code: "custom", message: "Colunas duplicadas." });
  });
export const easyLocalOrigem = z
  .object({ schema: easyLocalIdentifier, tabela: easyLocalIdentifier })
  .strict();
export const easyLocalLeitura = z
  .object({
    estabelecimentoId: easyLocalEstabelecimento,
    tabelaId: z.number().int().positive(),
    origem: easyLocalOrigem,
    colunaEstabelecimento: easyLocalIdentifier,
    valorEstabelecimento: z.string().trim().min(1).max(100),
    campoChave: easyLocalIdentifier,
    dominio: z.enum(["atendimentos", "faturamento", "relatorio"]),
    frequenciaDesejada: z.enum(["manual", "15min", "1hora", "diario"]),
  })
  .strict();
export type EasyLocalColuna = z.infer<typeof easyLocalColuna>;
export type EasyLocalTabelaInput = z.infer<typeof easyLocalCriarTabela>;
export type EasyLocalLeituraInput = z.infer<typeof easyLocalLeitura>;
export type EasyLocalCampoOrigem = {
  nome: string;
  tipoPostgres: string;
  tipoSugerido: EasyLocalColuna["tipo"] | null;
  tamanho?: number;
  escala?: number;
  obrigatorio: boolean;
};
export type EasyLocalTabelaResumo = {
  id: number;
  nomeFisico: string;
  nomeExibicao: string;
  estado: "criada" | "pendente_conferencia";
  colunas: EasyLocalColuna[];
  criadoEm: string | null;
};
export type EasyLocalLeituraResumo = {
  id: number;
  tabelaId: number;
  nomeTabela: string;
  origem: z.infer<typeof easyLocalOrigem>;
  colunaEstabelecimento: string;
  valorEstabelecimento: string;
  campoChave: string;
  dominio: EasyLocalLeituraInput["dominio"];
  frequenciaDesejada: EasyLocalLeituraInput["frequenciaDesejada"];
  estado: "preparada_sem_execucao";
  /** Ausente em registros diretos legados para preservar o contrato anterior. */
  tipoDestino?: "nova" | "staging_existente";
  /** Stagings existentes são sempre catalogadas sem autorização de execução. */
  execucaoLiberada?: boolean;
  /** Motivos operacionais que continuam impedindo qualquer carga. */
  bloqueios?: string[];
};

export function easyLocalNomeFisico(
  estabelecimentoId: number,
  nome: string
): string {
  return `integ_el_${easyLocalEstabelecimento.parse(estabelecimentoId)}_${easyLocalIdentifier.max(28).parse(nome)}`;
}
export function easyLocalTabelaGerenciada(nome: string): boolean {
  return /^(?:integ_)?el_[1-9][0-9]*_[a-z][a-z0-9_]{0,27}$/.test(
    nome.toLowerCase()
  );
}
