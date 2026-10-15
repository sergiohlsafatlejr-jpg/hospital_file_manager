import { z } from "zod";

const easyLocalIdentifier = z
  .string()
  .min(1)
  .max(48)
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "Use letras minúsculas, números e underscore; comece por letra."
  );
const easyLocalEstabelecimento = z.number().int().positive();
const easyLocalOrigem = z
  .object({ schema: easyLocalIdentifier, tabela: easyLocalIdentifier })
  .strict();

/** Marcador separado do fluxo que cria destinos novos. */
export const EASYLOCAL_STAGING_MARKER = "easylocal-staging-v1";
/** Versão do contrato físico auditado; não é um marcador de execução. */
export const EASYLOCAL_STAGING_CONTRACT_VERSION =
  "easylocal-staging-physical-v1";
export const EASYLOCAL_CONNECTION_MARKER = "easylocal-direto-v1";

export const easyLocalNomesStaging = [
  "stagion_atendimentos_parados_urologico",
  "stagion_faturado_recebido_urologico",
  "stagion_atendimentos_parados_iad",
  "stagion_faturado_recebido_iad",
] as const;

export const easyLocalNomeStaging = z.enum(easyLocalNomesStaging);
export type EasyLocalNomeStaging = z.infer<typeof easyLocalNomeStaging>;
export type EasyLocalDominioStaging = "atendimentos" | "faturamento";

type PhysicalColumn = {
  nome: string;
  dataType: string;
  columnType: string;
  nullable: "YES";
  charset: string | null;
  collation: string | null;
};

const utf8 = {
  charset: "utf8mb4",
  collation: "utf8mb4_unicode_ci",
} as const;

function coluna(
  nome: string,
  dataType: string,
  columnType: string,
  textual = false
): PhysicalColumn {
  return {
    nome,
    dataType,
    columnType,
    nullable: "YES",
    charset: textual ? utf8.charset : null,
    collation: textual ? utf8.collation : null,
  };
}

const atendimentosHup: readonly PhysicalColumn[] = [
  coluna("numatend", "int", "int"),
  coluna("codtipsai", "varchar", "varchar(2)", true),
  coluna("nomeplaco", "varchar", "varchar(30)", true),
  coluna("nomepac", "varchar", "varchar(50)", true),
  coluna("carater", "varchar", "varchar(2)", true),
  coluna("datatend", "datetime", "datetime"),
  coluna("datasai", "datetime", "datetime"),
  coluna("tipoatend", "char", "char(1)", true),
  coluna("codserv", "varchar", "varchar(30)", true),
  coluna("procprin", "varchar", "varchar(10)", true),
  coluna("codcc_destino", "varchar", "varchar(6)", true),
  coluna("tipoatendimentodescricao", "longtext", "longtext", true),
  // A capitalização é física e intencional no destino; a origem permanece lowercase.
  coluna("Estabelecimentos_id", "tinytext", "tinytext", true),
];

const atendimentosIad: readonly PhysicalColumn[] = [
  coluna("numatend", "int", "int"),
  coluna("codpac", "int", "int"),
  coluna("nomepac", "varchar", "varchar(50)", true),
  coluna("codtipsai", "varchar", "varchar(2)", true),
  coluna("nomeplaco", "varchar", "varchar(30)", true),
  coluna("carater", "varchar", "varchar(2)", true),
  coluna("datatend", "datetime", "datetime"),
  coluna("datasai", "datetime", "datetime"),
  coluna("tipoatend", "char", "char(1)", true),
  coluna("codserv", "varchar", "varchar(30)", true),
  coluna("procprin", "varchar", "varchar(10)", true),
  coluna("codcc_destino", "varchar", "varchar(6)", true),
  coluna("tipoatendimentodescricao", "longtext", "longtext", true),
  coluna("Estabelecimentos_id", "tinytext", "tinytext", true),
];

const faturamento: readonly PhysicalColumn[] = [
  coluna("nomeconv", "varchar", "varchar(30)", true),
  coluna("codconv", "varchar", "varchar(4)", true),
  coluna("mesprod", "varchar", "varchar(7)", true),
  coluna("numfatura", "int", "int"),
  coluna("codrecur", "varchar", "varchar(3)", true),
  coluna("tipoproc", "char", "char(1)", true),
  coluna("protocolo", "varchar", "varchar(20)", true),
  coluna("numconta", "bigint", "bigint"),
  coluna("guiacobra", "varchar", "varchar(20)", true),
  coluna("aihguia", "varchar", "varchar(50)", true),
  coluna("descricao", "varchar", "varchar(60)", true),
  coluna("matricula", "varchar", "varchar(35)", true),
  coluna("data", "datetime", "datetime"),
  coluna("dataint", "datetime", "datetime"),
  coluna("datasai", "datetime", "datetime"),
  coluna("procdisco", "varchar", "varchar(10)", true),
  coluna("codproprio", "varchar", "varchar(10)", true),
  coluna("codgrufi", "varchar", "varchar(3)", true),
  coluna("descricao_1", "varchar", "varchar(65)", true),
  coluna("funcaotiss", "varchar", "varchar(2)", true),
  coluna("receber", "char", "char(1)", true),
  coluna("codcc", "varchar", "varchar(6)", true),
  coluna("nomecc", "varchar", "varchar(45)", true),
  coluna("prestexe", "varchar", "varchar(6)", true),
  coluna("nomeprest", "varchar", "varchar(250)", true),
  coluna("quantidade", "decimal", "decimal(15,4)"),
  coluna("vl_faturado", "decimal", "decimal(15,2)"),
  coluna("vl_recebido", "decimal", "decimal(15,2)"),
  coluna("vl_receb_a_maior", "decimal", "decimal(15,2)"),
  coluna("vl_total_recebido", "decimal", "decimal(15,2)"),
  coluna("vl_aberto", "decimal", "decimal(15,2)"),
  coluna("vl_glosas", "decimal", "decimal(15,2)"),
  coluna("gl_recurso", "decimal", "decimal(15,2)"),
  coluna("gl_aceita", "decimal", "decimal(15,2)"),
  coluna("gl_analise", "decimal", "decimal(15,2)"),
  coluna("gl_recuperada", "decimal", "decimal(15,2)"),
  coluna("codtiss", "varchar", "varchar(4)", true),
  coluna("descmotivo", "varchar", "varchar(100)", true),
  coluna("codrecur_1", "varchar", "varchar(3)", true),
  coluna("complrecur", "text", "text", true),
  coluna("tipoatend", "char", "char(1)", true),
  coluna("vl_unitario", "decimal", "decimal(15,4)"),
  coluna("estabelecimentos_id", "varchar", "varchar(100)", true),
];

export type EasyLocalStagingContract = {
  nomeStaging: EasyLocalNomeStaging;
  nomeExibicao: string;
  estabelecimentoId: number;
  dominio: EasyLocalDominioStaging;
  origem: { schema: "raw_geral"; tabela: string };
  colunaEstabelecimento: "estabelecimentos_id";
  campoChave: "numatend" | "pendente_contrato";
  versaoContrato: typeof EASYLOCAL_STAGING_CONTRACT_VERSION;
  colunas: readonly PhysicalColumn[];
};

/**
 * Contrato de destino auditado. Não é derivado do schema Drizzle: as stagings
 * legadas não possuem PK/unique e a ordem física faz parte do contrato.
 */
export const easyLocalStagingContracts: readonly EasyLocalStagingContract[] = [
  {
    nomeStaging: "stagion_atendimentos_parados_urologico",
    nomeExibicao: "Atendimentos parados — HUP",
    estabelecimentoId: 1260036,
    dominio: "atendimentos",
    origem: { schema: "raw_geral", tabela: "hup_atendimentos_parados" },
    colunaEstabelecimento: "estabelecimentos_id",
    campoChave: "numatend",
    versaoContrato: EASYLOCAL_STAGING_CONTRACT_VERSION,
    colunas: atendimentosHup,
  },
  {
    nomeStaging: "stagion_faturado_recebido_urologico",
    nomeExibicao: "Faturado/recebido — HUP",
    estabelecimentoId: 1260036,
    dominio: "faturamento",
    origem: { schema: "raw_geral", tabela: "hup_faturado_recebido" },
    colunaEstabelecimento: "estabelecimentos_id",
    campoChave: "pendente_contrato",
    versaoContrato: EASYLOCAL_STAGING_CONTRACT_VERSION,
    colunas: faturamento,
  },
  {
    nomeStaging: "stagion_atendimentos_parados_iad",
    nomeExibicao: "Atendimentos parados — IAD",
    estabelecimentoId: 2550002,
    dominio: "atendimentos",
    origem: { schema: "raw_geral", tabela: "iad_atendimento_parados" },
    colunaEstabelecimento: "estabelecimentos_id",
    campoChave: "numatend",
    versaoContrato: EASYLOCAL_STAGING_CONTRACT_VERSION,
    colunas: atendimentosIad,
  },
  {
    nomeStaging: "stagion_faturado_recebido_iad",
    nomeExibicao: "Faturado/recebido — IAD",
    estabelecimentoId: 2550002,
    dominio: "faturamento",
    origem: { schema: "raw_geral", tabela: "iad_faturado_recebido" },
    colunaEstabelecimento: "estabelecimentos_id",
    campoChave: "pendente_contrato",
    versaoContrato: EASYLOCAL_STAGING_CONTRACT_VERSION,
    colunas: faturamento,
  },
] as const;

export const easyLocalLeituraStaging = z
  .object({
    estabelecimentoId: easyLocalEstabelecimento,
    nomeStaging: easyLocalNomeStaging,
    origem: easyLocalOrigem,
    colunaEstabelecimento: easyLocalIdentifier,
    valorEstabelecimento: z.string().trim().min(1).max(100),
    dominio: z.enum(["atendimentos", "faturamento"]),
    frequenciaDesejada: z.enum(["manual", "15min", "1hora", "diario"]),
    confirmarVinculo: z.literal(true),
  })
  .strict();
export type EasyLocalLeituraStagingInput = z.infer<
  typeof easyLocalLeituraStaging
>;

export type EasyLocalStagingResumo = {
  nomeFisico: string;
  nomeExibicao: string;
  dominio: EasyLocalDominioStaging;
  origem: { schema: string; tabela: string };
  estado: "disponivel" | "incompativel" | "ausente";
  totalColunas: number;
  escritorAtual: "nao_confirmado";
  execucaoLiberada: false;
  bloqueios: string[];
  tabelaId: number | null;
};

export type EasyLocalStagingTableDescriptor = {
  marker: typeof EASYLOCAL_STAGING_MARKER;
  versaoContrato: typeof EASYLOCAL_STAGING_CONTRACT_VERSION;
  nomeStaging: EasyLocalNomeStaging;
  estabelecimentoId: number;
  dominio: EasyLocalDominioStaging;
  origem: { schema: string; tabela: string };
  escritorAtual: "nao_confirmado";
  execucaoLiberada: false;
};

export type EasyLocalStagingMappingDescriptor =
  EasyLocalStagingTableDescriptor & {
    tipoDestino: "staging_existente";
    estado: "preparada_sem_execucao";
    usuarioId: number;
  };

const descritorTabelaSchema = z
  .object({
    marker: z.literal(EASYLOCAL_STAGING_MARKER),
    versaoContrato: z.literal(EASYLOCAL_STAGING_CONTRACT_VERSION),
    nomeStaging: easyLocalNomeStaging,
    estabelecimentoId: easyLocalEstabelecimento,
    dominio: z.enum(["atendimentos", "faturamento"]),
    origem: easyLocalOrigem,
    escritorAtual: z.literal("nao_confirmado"),
    execucaoLiberada: z.literal(false),
  })
  .strict();

const descritorMapeamentoSchema = descritorTabelaSchema
  .extend({
    tipoDestino: z.literal("staging_existente"),
    estado: z.literal("preparada_sem_execucao"),
    usuarioId: z.number().int().positive(),
  })
  .strict();

function isContractDescriptor(
  descriptor: EasyLocalStagingTableDescriptor,
  contract: EasyLocalStagingContract
): boolean {
  return (
    descriptor.nomeStaging === contract.nomeStaging &&
    descriptor.estabelecimentoId === contract.estabelecimentoId &&
    descriptor.dominio === contract.dominio &&
    descriptor.origem.schema === contract.origem.schema &&
    descriptor.origem.tabela === contract.origem.tabela &&
    descriptor.versaoContrato === contract.versaoContrato
  );
}

export function obterEasyLocalStagingContract(
  estabelecimentoId: number,
  nomeStaging: EasyLocalNomeStaging
): EasyLocalStagingContract | null {
  return (
    easyLocalStagingContracts.find(
      contract =>
        contract.estabelecimentoId === estabelecimentoId &&
        contract.nomeStaging === nomeStaging
    ) ?? null
  );
}

export function validarEasyLocalLeituraStaging(
  raw: EasyLocalLeituraStagingInput
): EasyLocalStagingContract | null {
  const contract = obterEasyLocalStagingContract(
    raw.estabelecimentoId,
    raw.nomeStaging
  );
  if (!contract) return null;
  return contract.origem.schema === raw.origem.schema &&
    contract.origem.tabela === raw.origem.tabela &&
    contract.dominio === raw.dominio &&
    contract.colunaEstabelecimento === raw.colunaEstabelecimento
    ? contract
    : null;
}

export function criarDescritorTabelaStaging(
  contract: EasyLocalStagingContract
): EasyLocalStagingTableDescriptor {
  return {
    marker: EASYLOCAL_STAGING_MARKER,
    versaoContrato: contract.versaoContrato,
    nomeStaging: contract.nomeStaging,
    estabelecimentoId: contract.estabelecimentoId,
    dominio: contract.dominio,
    origem: contract.origem,
    escritorAtual: "nao_confirmado",
    execucaoLiberada: false,
  };
}

export function criarDescritorMapeamentoStaging(
  contract: EasyLocalStagingContract,
  usuarioId: number
): EasyLocalStagingMappingDescriptor {
  return {
    ...criarDescritorTabelaStaging(contract),
    tipoDestino: "staging_existente",
    estado: "preparada_sem_execucao",
    usuarioId,
  };
}

export function lerDescritorTabelaStaging(
  raw: unknown,
  contract: EasyLocalStagingContract
): EasyLocalStagingTableDescriptor | null {
  try {
    const descriptor = descritorTabelaSchema.parse(
      typeof raw === "string" ? JSON.parse(raw) : raw
    );
    return isContractDescriptor(descriptor, contract) ? descriptor : null;
  } catch {
    return null;
  }
}

export function lerDescritorMapeamentoStaging(
  raw: unknown,
  contract: EasyLocalStagingContract
): EasyLocalStagingMappingDescriptor | null {
  try {
    const descriptor = descritorMapeamentoSchema.parse(
      typeof raw === "string" ? JSON.parse(raw) : raw
    );
    return isContractDescriptor(descriptor, contract) ? descriptor : null;
  } catch {
    return null;
  }
}

/** Exposta para o serviço conferir exatamente as colunas de information_schema. */
export function colunasFisicasStaging(
  contract: EasyLocalStagingContract
): readonly PhysicalColumn[] {
  return contract.colunas;
}

export function bloqueiosBaseStaging(
  contract: EasyLocalStagingContract,
  temIndiceUnico: boolean
): string[] {
  const bloqueios = [
    "Escritor atual não confirmado.",
    "Execução de importação não liberada para staging existente.",
  ];
  if (!temIndiceUnico)
    bloqueios.push(
      "Staging sem chave primária ou índice único; o vínculo é permitido, mas a carga permanece bloqueada."
    );
  if (contract.dominio === "faturamento")
    bloqueios.push(
      "Origem financeira auditada com double precision; a carga permanece bloqueada."
    );
  return bloqueios;
}
