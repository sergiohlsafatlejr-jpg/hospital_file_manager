import { getRawPool } from "../server/db";
import { parseXML } from "../server/parsers";
import { storageGet } from "../server/storage";

type Visita = {
  id: number;
  guia: string;
  paciente: string;
  dataExecucao: string | null;
};

type Arquivo = {
  id: number;
  nome: string;
  s3Key: string;
  s3Url: string | null;
  dataReferencia: string | null;
};

const estabelecimentoId = Number(process.argv[2] || 1);
const anoPagamento = Number(process.argv[3] || 2026);
const mesPagamento = Number(process.argv[4] || 7);

const texto = (valor: unknown) => String(valor ?? "").trim();
const guiaNormalizada = (valor: unknown) => texto(valor).replace(/^0+/, "");
const codigoNormalizado = (valor: unknown) => texto(valor).replace(/\D/g, "");
const pessoaNormalizada = (valor: unknown) => texto(valor)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^A-Z0-9]/gi, "")
  .toUpperCase();
const dataIso = (valor: unknown) => {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(String(valor));
  return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
};

const pool = await getRawPool();
if (!pool) throw new Error("Banco de dados indisponível");

const [visitasRows] = await pool.execute(
  `SELECT id, numero_guia AS guia, nome_beneficiario AS paciente, data_execucao AS dataExecucao
   FROM demonstrativo
   WHERE estabelecimentoId = ?
     AND REPLACE(COALESCE(codigo_item, ''), '.', '') = '10102019'
     AND YEAR(COALESCE(data_referencia, data_pagamento)) = ?
     AND MONTH(COALESCE(data_referencia, data_pagamento)) = ?
   ORDER BY id`,
  [estabelecimentoId, anoPagamento, mesPagamento]
);
const visitas = (visitasRows as any[]).map((row): Visita => ({
  id: Number(row.id),
  guia: guiaNormalizada(row.guia),
  paciente: pessoaNormalizada(row.paciente),
  dataExecucao: dataIso(row.dataExecucao),
}));
if (!visitas.length) throw new Error("Nenhuma visita encontrada no recorte solicitado");

const datasExecucao = visitas.map((item) => item.dataExecucao).filter(Boolean).sort() as string[];
const dataInicial = new Date(`${datasExecucao[0]}T00:00:00Z`);
dataInicial.setUTCMonth(dataInicial.getUTCMonth() - 2);
const dataFinal = new Date(`${datasExecucao.at(-1)}T00:00:00Z`);
dataFinal.setUTCMonth(dataFinal.getUTCMonth() + 2);

const [arquivosRows] = await pool.execute(
  `SELECT id, nome, s3Key, s3Url, dataReferencia
   FROM arquivos
   WHERE estabelecimentoId = ?
     AND tipoArquivo = 'xml'
     AND direcao = 'enviado'
     AND NULLIF(s3Key, '') IS NOT NULL
     AND COALESCE(dataReferencia, createdAt) BETWEEN ? AND ?
   ORDER BY COALESCE(dataReferencia, createdAt), id`,
  [estabelecimentoId, dataInicial, dataFinal]
);
const arquivos = arquivosRows as Arquivo[];

const visitasPorGuia = new Map<string, Visita[]>();
const visitasPorPacienteData = new Map<string, Visita[]>();
for (const visita of visitas) {
  if (visita.guia) visitasPorGuia.set(visita.guia, [...(visitasPorGuia.get(visita.guia) || []), visita]);
  if (visita.paciente && visita.dataExecucao) {
    const chave = `${visita.paciente}|${visita.dataExecucao}`;
    visitasPorPacienteData.set(chave, [...(visitasPorPacienteData.get(chave) || []), visita]);
  }
}

const encontrados = new Map<number, {
  visitaId: number;
  guia: string;
  medico: string;
  crm: string;
  arquivoId: number;
  arquivo: string;
  criterio: "guia" | "paciente_data";
}>();
const ambiguos = new Set<number>();
const falhas: Array<{ arquivoId: number; erro: string }> = [];
let arquivosBaixados = 0;
let arquivosComVisita = 0;

let proximo = 0;
const concorrencia = Math.min(8, arquivos.length);
await Promise.all(Array.from({ length: concorrencia }, async () => {
  while (true) {
    const indice = proximo++;
    if (indice >= arquivos.length) return;
    const arquivo = arquivos[indice]!;
    try {
      let resposta: Response | null = null;
      let erroStorage = "";
      try {
        const { url } = await storageGet(arquivo.s3Key);
        resposta = await fetch(url);
        if (!resposta.ok) erroStorage = `storageGet HTTP ${resposta.status}`;
      } catch (error) {
        erroStorage = error instanceof Error ? error.message : String(error);
      }
      if ((!resposta || !resposta.ok) && arquivo.s3Url) {
        resposta = await fetch(arquivo.s3Url);
      }
      if (!resposta?.ok) throw new Error(`${erroStorage || "storageGet indisponível"}; URL histórica HTTP ${resposta?.status || "sem resposta"}`);
      const xml = await resposta.text();
      arquivosBaixados++;
      if (!xml.includes("10102019")) continue;

      const parsed = await parseXML(xml);
      if (!parsed.success) throw new Error(parsed.error || "XML inválido");
      const procedimentos = parsed.procedimentos.filter((proc) =>
        codigoNormalizado(proc.codigo) === "10102019" && (texto(proc.nomeMedico) || texto(proc.crmMedico))
      );
      if (!procedimentos.length) continue;
      arquivosComVisita++;

      for (const procedimento of procedimentos) {
        const guias = [procedimento.guiaNumero, procedimento.numeroGuiaOperadora]
          .map(guiaNormalizada)
          .filter(Boolean);
        let candidatos = guias.flatMap((guia) => visitasPorGuia.get(guia) || []);
        let criterio: "guia" | "paciente_data" = "guia";

        if (!candidatos.length) {
          const paciente = pessoaNormalizada(procedimento.pacienteNome);
          const data = dataIso(procedimento.dataExecucao);
          candidatos = paciente && data ? (visitasPorPacienteData.get(`${paciente}|${data}`) || []) : [];
          criterio = "paciente_data";
        }

        const medico = texto(procedimento.nomeMedico);
        const crm = texto(procedimento.crmMedico);
        for (const visita of candidatos) {
          const anterior = encontrados.get(visita.id);
          if (anterior && (anterior.medico !== medico || anterior.crm !== crm)) {
            ambiguos.add(visita.id);
            encontrados.delete(visita.id);
            continue;
          }
          if (!ambiguos.has(visita.id)) {
            encontrados.set(visita.id, {
              visitaId: visita.id,
              guia: visita.guia,
              medico,
              crm,
              arquivoId: arquivo.id,
              arquivo: arquivo.nome,
              criterio,
            });
          }
        }
      }
    } catch (error) {
      falhas.push({ arquivoId: arquivo.id, erro: error instanceof Error ? error.message : String(error) });
    }
  }
}));

const porCriterio = [...encontrados.values()].reduce<Record<string, number>>((acc, item) => {
  acc[item.criterio] = (acc[item.criterio] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  estabelecimentoId,
  pagamento: `${String(mesPagamento).padStart(2, "0")}/${anoPagamento}`,
  periodoXmlPesquisado: { de: dataInicial.toISOString().slice(0, 10), ate: dataFinal.toISOString().slice(0, 10) },
  visitas: visitas.length,
  guias: new Set(visitas.map((item) => item.guia)).size,
  arquivosCandidatos: arquivos.length,
  arquivosBaixados,
  arquivosComVisita,
  visitasComProfissional: encontrados.size,
  visitasAmbiguas: ambiguos.size,
  porCriterio,
  falhas: falhas.length,
  amostraFalhas: falhas.slice(0, 12),
  amostra: [...encontrados.values()].slice(0, 15),
}, null, 2));

await pool.end();
process.exit(0);
