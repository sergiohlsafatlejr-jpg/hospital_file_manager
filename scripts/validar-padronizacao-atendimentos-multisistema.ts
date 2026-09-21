import { appRouter } from "../server/routers";
import { getDb, getRawPool } from "../server/db";
import { sql } from "drizzle-orm";
import { buildAtendimentoNormalizationSql } from "../server/atendimentoNormalization";

const INSTITUTO_DO_RIM = 4;
const HEMOLABOR = 6;
const CATEGORIAS_CANONICAS = new Set(["INTERNACAO", "EXAME", "AMBULATORIO", "PRONTO SOCORRO", "OUTROS"]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function countOf(items: { value: string; count: number }[], value: string): number {
  return items.find((item) => item.value === value)?.count || 0;
}

async function main() {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  try {
    const db = await getDb();
    assert(db, "Drizzle indisponível para validar as expressões SQL");
    const conflictingTasy = buildAtendimentoNormalizationSql({
      origemSistema: sql`' tasy '`,
      tipoAtendimento: sql`'I'`,
      descricaoAtendimento: sql`'Internacao auxiliar'`,
      dsCategoria: sql`'Ambulatório'`,
      codigoServico: sql`'123'`,
      dsSetorEntrada: sql`'Recepção Matriz'`,
    });
    const conflictingResult = await db.execute(sql`SELECT
      ${conflictingTasy.normalizedCategorySql} categoria,
      ${conflictingTasy.normalizedServiceSql} tipoServico
    `);
    const conflictingRow = (conflictingResult as any)?.[0]?.[0] || (conflictingResult as any)?.[0];
    assert(conflictingRow?.categoria === "AMBULATORIO", "SQL deixou o código I sobrescrever a Categoria Tasy Ambulatório");
    assert(conflictingRow?.tipoServico === "Recepção Matriz", "SQL não priorizou dsSetorEntrada como Tipo de Serviço Tasy");

    const [admins] = await pool.query<any[]>("SELECT * FROM users WHERE role='admin' ORDER BY id LIMIT 1");
    assert(admins[0], "Nenhum administrador disponível para validar o router");
    const caller = appRouter.createCaller({
      user: admins[0],
      req: { ip: "127.0.0.1", protocol: "https", secure: true, headers: {}, socket: { remoteAddress: "127.0.0.1" } },
      res: {},
    } as any);

    const instituto = await caller.atendimentos.listarPaginado({
      estabelecimentoId: INSTITUTO_DO_RIM,
      page: 1,
      pageSize: 50,
      situacao: "todos",
      sortColumn: "data_entrada",
      sortOrder: "desc",
    });
    assert(instituto.total === 667, "Total do Instituto do Rim diverge do banco");
    assert(countOf(instituto.aggregations.tipos, "INTERNACAO") === 58, "KPI Internação do Instituto do Rim deveria ser 58");
    assert(countOf(instituto.aggregations.tipos, "EXAME") === 417, "KPI Exame do Instituto do Rim deveria ser 417");
    assert(countOf(instituto.aggregations.tipos, "AMBULATORIO") === 192, "KPI Ambulatório do Instituto do Rim deveria ser 192");
    assert(instituto.aggregations.tipos.reduce((sum, item) => sum + item.count, 0) === instituto.total, "Categorias do Instituto do Rim não fecham com o total");
    assert(instituto.aggregations.servicos.length === 19, "Tipos de Serviço do Instituto do Rim deveriam conter 19 valores");
    assert(instituto.aggregations.servicos.reduce((sum, item) => sum + item.count, 0) === instituto.total, "Tipos de Serviço do Instituto do Rim não fecham com o total");
    assert(countOf(instituto.aggregations.servicos, "TOMOGRAFIA") === 178, "Tomografia deveria conter 178 atendimentos");
    assert(instituto.items.every((item) => CATEGORIAS_CANONICAS.has(item.categoriaAtendimento)), "A API retornou categoria não padronizada no EasyVision");
    assert(instituto.items.every((item) => ["A", "E", "I"].includes(item.tipoAtendimentoOrigem)), "O código bruto do EasyVision não foi preservado");
    assert(instituto.items.every((item) => Boolean(item.tipoServico)), "A API deixou Tipo de Serviço vazio no EasyVision");

    const exame = await caller.atendimentos.listarPaginado({ estabelecimentoId: INSTITUTO_DO_RIM, page: 1, pageSize: 10, situacao: "todos", tipo: "EXAME" });
    const internacao = await caller.atendimentos.listarPaginado({ estabelecimentoId: INSTITUTO_DO_RIM, page: 1, pageSize: 10, situacao: "todos", tipo: "INTERNACAO" });
    const ambulatorio = await caller.atendimentos.listarPaginado({ estabelecimentoId: INSTITUTO_DO_RIM, page: 1, pageSize: 10, situacao: "todos", tipo: "AMBULAT" });
    const tomografia = await caller.atendimentos.listarPaginado({ estabelecimentoId: INSTITUTO_DO_RIM, page: 1, pageSize: 10, situacao: "todos", descricao: "TOMOGRAFIA" });
    assert(exame.total === 417, "Filtro Exame do Instituto do Rim falhou");
    assert(internacao.total === 58, "Filtro Internação do Instituto do Rim falhou");
    assert(ambulatorio.total === 192, "Filtro Ambulatório do Instituto do Rim falhou");
    assert(tomografia.total === 178, "Filtro Tipo de Serviço Tomografia falhou");

    const tasy = await caller.atendimentos.listarPaginado({
      estabelecimentoId: HEMOLABOR,
      page: 1,
      pageSize: 10,
      situacao: "todos",
    });
    assert(tasy.total === 112_984, "Total Tasy sem particulares diverge do validado");
    assert(tasy.items.every((item) => CATEGORIAS_CANONICAS.has(item.categoriaAtendimento)), "A API retornou categoria não padronizada no Tasy");
    assert(tasy.items.every((item) => Boolean(item.tipoServico)), "A API deixou Tipo de Serviço vazio no Tasy");
    assert(tasy.aggregations.servicos.length > 0, "Tasy não retornou agregação de Tipo de Serviço");

    console.log(JSON.stringify({
      validado: true,
      institutoDoRim: {
        total: instituto.total,
        internacao: countOf(instituto.aggregations.tipos, "INTERNACAO"),
        exame: countOf(instituto.aggregations.tipos, "EXAME"),
        ambulatorio: countOf(instituto.aggregations.tipos, "AMBULATORIO"),
        tiposServico: instituto.aggregations.servicos.length,
        tomografia: countOf(instituto.aggregations.servicos, "TOMOGRAFIA"),
      },
      hemolabor: {
        totalSemParticulares: tasy.total,
        categoriasPadronizadas: true,
        tiposServicoDisponiveis: tasy.aggregations.servicos.length,
      },
      precedenciaTasyConflitanteValidada: true,
      dadosPessoaisExibidos: false,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
