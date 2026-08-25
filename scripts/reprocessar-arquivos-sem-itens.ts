import { getRawPool } from "../server/db";

type ArquivoPendente = {
  id: number;
  nome: string;
  direcao: "enviado" | "retornado";
  tipoArquivo: "xml" | "excel" | "csv" | "txt" | "pdf";
};

const estabelecimentoId = Number(process.argv[2]);

if (!Number.isInteger(estabelecimentoId) || estabelecimentoId <= 0) {
  throw new Error("Informe um estabelecimentoId válido. Ex.: pnpm tsx scripts/reprocessar-arquivos-sem-itens.ts 3");
}

const pool = await getRawPool();
if (!pool) throw new Error("Banco de dados indisponível");

const [rows] = await pool.execute(
  `SELECT a.id, a.nome, a.direcao, a.tipoArquivo
   FROM arquivos a
   WHERE a.status = 'processado'
     AND a.estabelecimentoId = ?
     AND (
       (a.direcao = 'enviado' AND a.tipoArquivo = 'xml'
         AND NOT EXISTS (SELECT 1 FROM faturamento_tiss f WHERE f.arquivo_id = a.id))
       OR
       (a.direcao = 'retornado' AND a.tipoArquivo IN ('excel', 'csv')
         AND NOT EXISTS (SELECT 1 FROM recebimentos_excel x WHERE x.arquivo_id = a.id))
       OR
       (a.direcao = 'retornado' AND a.tipoArquivo IN ('xml', 'txt')
         AND NOT EXISTS (SELECT 1 FROM demonstrativo d WHERE d.arquivo_id = a.id))
     )
   ORDER BY
     CASE WHEN a.direcao = 'retornado' THEN 0 ELSE 1 END,
     a.id`,
  [estabelecimentoId]
);

const arquivos = rows as ArquivoPendente[];
console.log(`[Recuperação] ${arquivos.length} arquivo(s) sem itens no estabelecimento ${estabelecimentoId}`);

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET indisponível");

let sucesso = 0;
let falha = 0;

for (let index = 0; index < arquivos.length; index++) {
  const arquivo = arquivos[index]!;
  const prefixo = `[${index + 1}/${arquivos.length}] ${arquivo.id} ${arquivo.nome}`;

  try {
    console.log(`${prefixo}: iniciando`);
    const response = await fetch("http://127.0.0.1:3000/api/internal/process-file", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ arquivoId: arquivo.id, secret, skipContaConvenioSync: true }),
    });

    const body = await response.text();
    if (!response.ok) {
      falha++;
      console.error(`${prefixo}: falhou HTTP ${response.status} - ${body.slice(0, 300)}`);
      continue;
    }

    sucesso++;
    console.log(`${prefixo}: concluído`);
  } catch (error) {
    falha++;
    console.error(`${prefixo}: erro`, error);
  }
}

console.log(`[Recuperação] concluída. Sucesso=${sucesso}, falha=${falha}, total=${arquivos.length}`);

await pool.end();
