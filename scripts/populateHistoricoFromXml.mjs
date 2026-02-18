import { createClient } from "redis";
import mysql from "mysql2/promise";
import { format } from "date-fns";

/**
 * Script para popular historicoValidacaoXml a partir dos XMLs já importados
 * Lê dados da tabela faturamento_tiss e calcula conformidade
 */

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const DB_CONFIG = {
  host: process.env.PG_ATENDIMENTOS_HOST || "localhost",
  port: process.env.PG_ATENDIMENTOS_PORT || 3306,
  user: process.env.PG_ATENDIMENTOS_USER || "root",
  password: process.env.PG_ATENDIMENTOS_PASSWORD || "",
  database: process.env.PG_ATENDIMENTOS_DATABASE || "safatle",
};

let redisClient = null;
let mysqlConnection = null;

async function initConnections() {
  console.log("🔌 Conectando ao Redis...");
  redisClient = createClient({ url: REDIS_URL });
  redisClient.on("error", (err) => console.error("Redis Error:", err));
  await redisClient.connect();
  console.log("✅ Redis conectado");

  console.log("🔌 Conectando ao MySQL...");
  mysqlConnection = await mysql.createConnection(DB_CONFIG);
  console.log("✅ MySQL conectado");
}

async function closeConnections() {
  if (redisClient) await redisClient.quit();
  if (mysqlConnection) await mysqlConnection.end();
  console.log("✅ Conexões fechadas");
}

/**
 * Agrupa XMLs por arquivo e estabelecimento
 */
async function agruparXmlsPorArquivo() {
  console.log("\n📊 Agrupando XMLs por arquivo...");

  const [rows] = await mysqlConnection.query(`
    SELECT 
      estabelecimentoId,
      nomeArquivo,
      COUNT(*) as totalContas,
      COUNT(CASE WHEN statusValidacao = 'valido' THEN 1 END) as contasValidas,
      COUNT(CASE WHEN statusValidacao != 'valido' THEN 1 END) as contasInvalidas,
      AVG(CAST(scoreConformidade AS DECIMAL(5,2))) as scoreConformidadeMedio,
      MAX(dataImportacao) as dataProcessamento,
      GROUP_CONCAT(DISTINCT usuarioId) as usuarioIds
    FROM faturamento_tiss
    WHERE nomeArquivo IS NOT NULL AND nomeArquivo != ''
    GROUP BY estabelecimentoId, nomeArquivo
    ORDER BY dataImportacao DESC
  `);

  console.log(`✅ ${rows.length} arquivos encontrados`);
  return rows;
}

/**
 * Extrai divergências e erros de um arquivo
 */
async function extrairDivergenciasDoArquivo(nomeArquivo, estabelecimentoId) {
  const [rows] = await mysqlConnection.query(
    `
    SELECT 
      id,
      statusValidacao,
      scoreConformidade,
      motivoRejeicao,
      usuarioId,
      procedimentoCodigo,
      procedimentoDescricao,
      valorConta,
      dataImportacao
    FROM faturamento_tiss
    WHERE nomeArquivo = ? AND estabelecimentoId = ?
    ORDER BY dataImportacao ASC
  `,
    [nomeArquivo, estabelecimentoId]
  );

  // Calcular estatísticas
  const totalContas = rows.length;
  const contasValidas = rows.filter((r) => r.statusValidacao === "valido").length;
  const contasInvalidas = totalContas - contasValidas;

  // Agrupar erros por tipo
  const errosPorTipo = {};
  const errosPorFuncionario = {};

  rows.forEach((row) => {
    if (row.statusValidacao !== "valido") {
      const tipoErro = row.motivoRejeicao || "erro_desconhecido";
      errosPorTipo[tipoErro] = (errosPorTipo[tipoErro] || 0) + 1;

      if (row.usuarioId) {
        errosPorFuncionario[row.usuarioId] = (errosPorFuncionario[row.usuarioId] || 0) + 1;
      }
    }
  });

  // Detectar outliers (valores 2x acima da média)
  const valores = rows.map((r) => parseFloat(r.valorConta) || 0).filter((v) => v > 0);
  const valorMedio = valores.length > 0 ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
  const outliers = rows.filter((r) => {
    const valor = parseFloat(r.valorConta) || 0;
    return valor > valorMedio * 2;
  });

  return {
    totalContas,
    contasValidas,
    contasInvalidas,
    scoreConformidadeMedio: rows.reduce((sum, r) => sum + (parseFloat(r.scoreConformidade) || 0), 0) / totalContas,
    resultadoCompleto: {
      errosPorTipo,
      errosPorFuncionario,
      outliers: outliers.map((o) => ({
        contaId: o.id,
        procedimento: o.procedimentoCodigo,
        descricao: o.procedimentoDescricao,
        valor: o.valorConta,
        mediaEsperada: valorMedio,
        desvio: ((parseFloat(o.valorConta) / valorMedio - 1) * 100).toFixed(2),
      })),
      totalOutliers: outliers.length,
    },
  };
}

/**
 * Popula historicoValidacaoXml
 */
async function populateHistorico() {
  console.log("\n📝 Populando historicoValidacaoXml...");

  const arquivos = await agruparXmlsPorArquivo();

  let totalInseridos = 0;
  let totalErros = 0;

  for (const arquivo of arquivos) {
    try {
      // Extrair divergências
      const divergencias = await extrairDivergenciasDoArquivo(
        arquivo.nomeArquivo,
        arquivo.estabelecimentoId
      );

      // Pegar primeiro usuário (se houver múltiplos)
      const usuarioId = arquivo.usuarioIds ? parseInt(arquivo.usuarioIds.split(",")[0]) : 1;

      // Verificar se já existe
      const [existing] = await mysqlConnection.query(
        `SELECT id FROM historicoValidacaoXml WHERE nomeArquivo = ? AND estabelecimentoId = ?`,
        [arquivo.nomeArquivo, arquivo.estabelecimentoId]
      );

      if (existing.length > 0) {
        console.log(`⏭️  Arquivo já existe: ${arquivo.nomeArquivo}`);
        continue;
      }

      // Inserir
      await mysqlConnection.query(
        `
        INSERT INTO historicoValidacaoXml 
        (estabelecimentoId, nomeArquivo, dataProcessamento, totalContas, contasValidas, contasInvalidas, scoreConformidadeMedio, resultadoCompleto, usuarioId)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          arquivo.estabelecimentoId,
          arquivo.nomeArquivo,
          arquivo.dataProcessamento,
          divergencias.totalContas,
          divergencias.contasValidas,
          divergencias.contasInvalidas,
          divergencias.scoreConformidadeMedio,
          JSON.stringify(divergencias.resultadoCompleto),
          usuarioId,
        ]
      );

      totalInseridos++;
      console.log(`✅ Inserido: ${arquivo.nomeArquivo} (${divergencias.contasValidas}/${divergencias.totalContas} válidas)`);
    } catch (error) {
      totalErros++;
      console.error(`❌ Erro ao processar ${arquivo.nomeArquivo}:`, error.message);
    }
  }

  console.log(`\n📊 Resumo: ${totalInseridos} inseridos, ${totalErros} erros`);
  return { totalInseridos, totalErros };
}

/**
 * Gera regras automáticas baseadas no histórico
 */
async function gerarRegrasAutomaticas() {
  console.log("\n🤖 Gerando regras automáticas...");

  // Buscar estatísticas por estabelecimento
  const [stats] = await mysqlConnection.query(`
    SELECT 
      estabelecimentoId,
      COUNT(*) as totalValidacoes,
      AVG(scoreConformidadeMedio) as scoreMedia,
      MIN(scoreConformidadeMedio) as scoreMinimo,
      MAX(scoreConformidadeMedio) as scoreMaximo,
      STDDEV(scoreConformidadeMedio) as desvioScore
    FROM historicoValidacaoXml
    GROUP BY estabelecimentoId
  `);

  console.log(`📊 Estatísticas calculadas para ${stats.length} estabelecimentos`);

  // Criar tabela de regras se não existir
  await mysqlConnection.query(`
    CREATE TABLE IF NOT EXISTS regrasMotorRegras (
      id INT PRIMARY KEY AUTO_INCREMENT,
      estabelecimentoId INT NOT NULL,
      regraConformidade JSON,
      regraOutliers JSON,
      regraErrosFuncionario JSON,
      dataGeracao TIMESTAMP DEFAULT NOW(),
      ativa ENUM('sim', 'nao') DEFAULT 'sim',
      UNIQUE KEY unique_estabelecimento (estabelecimentoId),
      FOREIGN KEY (estabelecimentoId) REFERENCES estabelecimentos(id)
    )
  `);

  // Inserir regras
  for (const stat of stats) {
    const scoreAlerta = (stat.scoreMedia - stat.desvioScore * 1.5).toFixed(2);
    const scoreAnomaliaAlta = (stat.scoreMedia + stat.desvioScore * 2).toFixed(2);

    const regraConformidade = {
      scoreMediaEsperado: parseFloat(stat.scoreMedia).toFixed(2),
      alertarSeAbaixoDe: Math.max(0, parseFloat(scoreAlerta)),
      alertarSeAcimaDeDesvio: parseFloat(scoreAnomaliaAlta),
      desviosPadrao: parseFloat(stat.desvioScore).toFixed(2),
    };

    try {
      await mysqlConnection.query(
        `
        INSERT INTO regrasMotorRegras (estabelecimentoId, regraConformidade, ativa)
        VALUES (?, ?, 'sim')
        ON DUPLICATE KEY UPDATE
          regraConformidade = VALUES(regraConformidade),
          dataGeracao = NOW()
      `,
        [stat.estabelecimentoId, JSON.stringify(regraConformidade)]
      );

      console.log(`✅ Regra criada para estabelecimento ${stat.estabelecimentoId}:`);
      console.log(`   Score esperado: ${regraConformidade.scoreMediaEsperado}`);
      console.log(`   Alerta se < ${regraConformidade.alertarSeAbaixoDe}`);
      console.log(`   Anomalia se > ${regraConformidade.alertarSeAcimaDeDesvio}`);
    } catch (error) {
      console.error(`❌ Erro ao criar regra para estabelecimento ${stat.estabelecimentoId}:`, error.message);
    }
  }
}

/**
 * Criar tabela de alertas
 */
async function criarTabelaAlertas() {
  console.log("\n📋 Criando tabela de alertas...");

  await mysqlConnection.query(`
    CREATE TABLE IF NOT EXISTS alertasMotorRegras (
      id INT PRIMARY KEY AUTO_INCREMENT,
      estabelecimentoId INT NOT NULL,
      historicoValidacaoXmlId INT,
      tipoAlerta ENUM('conformidade_baixa', 'outlier', 'erro_funcionario') NOT NULL,
      descricao TEXT,
      severidade ENUM('baixa', 'media', 'alta', 'critica') DEFAULT 'media',
      status ENUM('novo', 'revisado', 'resolvido') DEFAULT 'novo',
      dataAlerta TIMESTAMP DEFAULT NOW(),
      dataRevisao TIMESTAMP NULL,
      revisadoPor INT,
      FOREIGN KEY (estabelecimentoId) REFERENCES estabelecimentos(id),
      FOREIGN KEY (historicoValidacaoXmlId) REFERENCES historicoValidacaoXml(id)
    )
  `);

  console.log("✅ Tabela de alertas criada");
}

/**
 * Main
 */
async function main() {
  try {
    console.log("🚀 Iniciando população de histórico XML...");
    console.log("=" + "=".repeat(50));

    await initConnections();

    // Criar tabelas necessárias
    await criarTabelaAlertas();

    // Popular histórico
    const result = await populateHistorico();

    // Gerar regras
    await gerarRegrasAutomaticas();

    console.log("\n" + "=".repeat(50));
    console.log("✅ Processo concluído com sucesso!");
    console.log(`📊 Total de históricos inseridos: ${result.totalInseridos}`);
    console.log(`⚠️  Total de erros: ${result.totalErros}`);

    // Mostrar resumo final
    const [resumo] = await mysqlConnection.query(`
      SELECT 
        COUNT(*) as totalRegistros,
        COUNT(DISTINCT estabelecimentoId) as totalEstabelecimentos,
        AVG(scoreConformidadeMedio) as scoreMediaGeral
      FROM historicoValidacaoXml
    `);

    console.log("\n📈 Resumo Final:");
    console.log(`   Total de registros: ${resumo[0].totalRegistros}`);
    console.log(`   Estabelecimentos: ${resumo[0].totalEstabelecimentos}`);
    console.log(`   Score médio geral: ${parseFloat(resumo[0].scoreMediaGeral).toFixed(2)}`);
  } catch (error) {
    console.error("❌ Erro fatal:", error);
    process.exit(1);
  } finally {
    await closeConnections();
  }
}

main();
