import { z } from "zod";

const semControle = (v: string) => !/[\x00-\x1f\x7f]/.test(v);
export const easyLocalCadastroInput = z
  .object({
    nome: z.string().trim().min(1).max(100).refine(semControle),
    descricao: z.string().trim().max(500),
    tipo: z.literal("postgresql"),
    host: z
      .string()
      .trim()
      .max(253)
      .refine(
        v =>
          !/^\d+(?:\.\d+){3}$/.test(v) &&
          v.includes(".") &&
          v
            .split(".")
            .every(
              label =>
                label.length <= 63 &&
                /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
            )
      ),
    porta: z.number().int().min(1).max(65535),
    banco: z.string().trim().min(1).max(255).refine(semControle),
    usuario: z.string().trim().min(1).max(255).refine(semControle),
    senha: z.string().max(4096).optional(),
    tls: z.enum(["system", "custom"]),
    certificado: z.string().max(32768).optional(),
    revisao: z.string().uuid().nullable(),
    confirmarConexaoCentral: z.literal(true),
  })
  .strict();
export type EasyLocalCadastroInput = z.infer<typeof easyLocalCadastroInput>;
export type EasyLocalCadastroPublico = {
  origem: "banco" | "servidor" | "ausente";
  chaveDisponivel: boolean;
  revisao: string | null;
  configuracao: null | {
    nome: string;
    descricao: string;
    tipo: "postgresql";
    host: string;
    porta: number;
    banco: string;
    usuario: string;
    tls: "system" | "custom";
    senhaConfigurada: boolean;
    certificadoConfigurado: boolean;
  };
};
