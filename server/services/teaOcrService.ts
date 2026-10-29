/**
 * teaOcrService.ts
 * 
 * Serviço de inteligência artificial visual para extração estruturada de dados
 * a partir de folhas de atendimento/presença escaneadas (TEA e terapias multidisciplinares).
 * Suporta Unimed Goiânia (Form 3046), Unimed Cerrado (Form 092), Seguros Unimed e formulários similares.
 */

import https from "https";

export interface ExtractedSessao {
  dia?: string;
  data?: string;
  horario?: string;
  quantidade: number;
  valorUnitario?: number;
}

export interface ExtractedGuia {
  pagina: number;
  nomePaciente: string;
  cpf?: string | null;
  dataNascimento?: string | null;
  carteirinha?: string | null;
  convenioNome?: string | null;
  numeroGuia?: string | null;
  senha?: string | null;
  especialidade?: string | null;
  codigoProcedimento?: string | null;
  mesAnoReferencia?: string | null;
  nomeProfissional?: string | null;
  conselhoProfissional?: string | null;
  numeroConselhoProfissional?: string | null;
  ufConselhoProfissional?: string | null;
  cbosProfissional?: string | null;
  cid10?: string | null;
  sessoes: ExtractedSessao[];
  totalSessoes: number;
  totalValor?: number | null;
  pacienteId?: number | null;
  statusMatch?: "pronto" | "novo_paciente" | "parcial";
}

async function callGeminiApi(payload: any, apiKey: string, retries = 3): Promise<any> {
  const body = JSON.stringify(payload);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await new Promise<{ status: number; data: string }>((resolve, reject) => {
        const req = https.request(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
            },
          },
          (resStream) => {
            let data = "";
            resStream.on("data", (chunk) => (data += chunk));
            resStream.on("end", () => resolve({ status: resStream.statusCode || 500, data }));
          }
        );
        req.on("error", reject);
        req.write(body);
        req.end();
      });

      if (res.status === 200) {
        return JSON.parse(res.data);
      }

      if ((res.status === 503 || res.status === 429) && attempt < retries) {
        const waitMs = attempt * 2500;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      throw new Error(`Gemini API Error (status ${res.status}): ${res.data}`);
    } catch (err: any) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

export async function extrairFolhasTea(pdfBase64: string): Promise<ExtractedGuia[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não configurada nas variáveis de ambiente (.env).");
  }

  const prompt = `Você é um auditor sênior de faturamento médico e hospitalar, especialista em faturamento de terapias de saúde (TEA - Transtorno do Espectro Autista, Fisioterapia, Fonoaudiologia, Terapia Ocupacional, Psicoterapia, Psicopedagogia).

Analise atentamente o documento fornecido (folha ou lote de folhas de frequência/presença/atendimento escaneadas).
O documento pode conter uma ou várias páginas, onde cada página geralmente representa a folha mensal de um paciente.

Para CADA folha/página de paciente identificada no documento, extraia os seguintes campos:
- pagina: número da página (1, 2, 3...)
- nomePaciente: nome completo do beneficiário/paciente em caixa alta (ex: "MARIA RITA REZENDE DE FREITAS")
- cpf: CPF do paciente se houver (ex: "016.076.901-95")
- dataNascimento: data de nascimento se houver (ex: "16/01/2017")
- carteirinha: número do cartão ou carteirinha do plano de saúde se estiver expresso
- convenioNome: nome do convênio/operadora identificado (ex: "UNIMED GOIANIA", "UNIMED CERRADO", "UNIMED SEGUROS", etc.)
- numeroGuia: número da guia aprovada / autorização (ex: "70406295", "64711890")
- senha: senha de autorização (se presente)
- especialidade: especialidade clínica ou serviço prestado (ex: "FISIOTERAPIA", "PSICOMOTRICIDADE", "FONOAUDIOLOGIA", "TERAPIA OCUPACIONAL", "PSICOLOGIA")
- mesAnoReferencia: mês e ano das sessões (ex: "08/2026", "jun.-26")
- nomeProfissional: nome do terapeuta / profissional executante
- conselhoProfissional: sigla do conselho (ex: "CREFITO", "CRFa", "CRP", "CRM")
- numeroConselhoProfissional: número do registro no conselho profissional
- ufConselhoProfissional: UF do conselho (ex: "GO")
- cid10: código CID se houver (ex: "F84.0", "F84")
- sessoes: lista de cada sessão realizada e assinada:
  - dia: número do dia do mês (ex: "02", "11", "16", "30")
  - data: data estimada completa em formato YYYY-MM-DD ou DD/MM/AAAA conforme o mês de referência
  - horario: horário de início se constar (ex: "08:45", "14:30")
  - quantidade: quantidade de sessões no dia (padrão 1)
- totalSessoes: quantidade total de sessões assinadas
- totalValor: valor total monetário em reais se indicado na folha (ex: 360.00)

Retorne EXCLUSIVAMENTE o JSON estruturado com o formato:
{
  "guias": [
    {
      "pagina": 1,
      "nomePaciente": "...",
      "cpf": "...",
      "carteirinha": "...",
      "numeroGuia": "...",
      "senha": "...",
      "especialidade": "...",
      "nomeProfissional": "...",
      "numeroConselhoProfissional": "...",
      "conselhoProfissional": "...",
      "sessoes": [
        { "dia": "02", "data": "2026-06-02", "horario": "14:30", "quantidade": 1 }
      ],
      "totalSessoes": 1
    }
  ]
}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: pdfBase64,
            },
          },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  };

  const response = await callGeminiApi(payload, apiKey);
  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Não foi possível extrair dados das folhas no documento fornecido.");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (err: any) {
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    parsed = JSON.parse(cleaned);
  }

  const guias: ExtractedGuia[] = (parsed.guias || []).map((g: any, index: number) => ({
    pagina: Number(g.pagina) || index + 1,
    nomePaciente: (g.nomePaciente || "").trim().toUpperCase(),
    cpf: g.cpf ? String(g.cpf).trim() : null,
    dataNascimento: g.dataNascimento ? String(g.dataNascimento).trim() : null,
    carteirinha: g.carteirinha ? String(g.carteirinha).trim() : null,
    convenioNome: g.convenioNome ? String(g.convenioNome).trim() : null,
    numeroGuia: g.numeroGuia ? String(g.numeroGuia).trim() : null,
    senha: g.senha ? String(g.senha).trim() : null,
    especialidade: g.especialidade ? String(g.especialidade).trim().toUpperCase() : null,
    codigoProcedimento: g.codigoProcedimento ? String(g.codigoProcedimento).trim() : null,
    mesAnoReferencia: g.mesAnoReferencia ? String(g.mesAnoReferencia).trim() : null,
    nomeProfissional: g.nomeProfissional ? String(g.nomeProfissional).trim() : null,
    conselhoProfissional: g.conselhoProfissional ? String(g.conselhoProfissional).trim() : "CREFITO",
    numeroConselhoProfissional: g.numeroConselhoProfissional ? String(g.numeroConselhoProfissional).trim() : null,
    ufConselhoProfissional: g.ufConselhoProfissional ? String(g.ufConselhoProfissional).trim() : "GO",
    cbosProfissional: g.cbosProfissional ? String(g.cbosProfissional).trim() : null,
    cid10: g.cid10 ? String(g.cid10).trim() : "F84.0",
    sessoes: Array.isArray(g.sessoes)
      ? g.sessoes.map((s: any) => ({
          dia: s.dia ? String(s.dia).trim() : undefined,
          data: s.data ? String(s.data).trim() : undefined,
          horario: s.horario ? String(s.horario).trim() : undefined,
          quantidade: Number(s.quantidade) || 1,
          valorUnitario: s.valorUnitario ? Number(s.valorUnitario) : undefined,
        }))
      : [],
    totalSessoes: Number(g.totalSessoes) || (Array.isArray(g.sessoes) ? g.sessoes.length : 0),
    totalValor: g.totalValor ? Number(g.totalValor) : null,
  }));

  return guias;
}
