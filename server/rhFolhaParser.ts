import * as XLSX from 'xlsx';
import { InsertRHFolhaPagamento } from '../drizzle/schema';

function parseNumber(val: any): string | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') return String(val.toFixed(2));
  const parsed = parseFloat(String(val).replace(/[^0-9,-.]/g, '').replace(',', '.'));
  return isNaN(parsed) ? null : String(parsed.toFixed(2));
}

function parseDateFromExcel(val: any): Date | null {
  if (!val) return null;
  if (typeof val === 'number') {
    // Convert Excel serial date to JS Date (25569 is Jan 1 1970 offset from Dec 30 1899)
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

const MONTH_MAP: Record<string, string> = {
  'janeiro': '01',
  'fevereiro': '02',
  'março': '03',
  'marco': '03',
  'abril': '04',
  'maio': '05',
  'junho': '06',
  'julho': '07',
  'agosto': '08',
  'setembro': '09',
  'outubro': '10',
  'novembro': '11',
  'dezembro': '12'
};

export function parseRhFolhaExcel(buffer: Buffer, arquivoId: number, estabelecimentoId: number, competencia: string): InsertRHFolhaPagamento[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const records: InsertRHFolhaPagamento[] = [];
  const fallbackYear = competencia.substring(0, 4);

  // Find all sheets that contain 'folha' in the name
  const folhaSheets = workbook.SheetNames.filter(n => n.toLowerCase().includes('folha'));
  
  // If none found with 'folha', just parse the first one
  const sheetsToProcess = folhaSheets.length > 0 ? folhaSheets : [workbook.SheetNames[0]];

  for (const sheetName of sheetsToProcess) {
    const sheet = workbook.Sheets[sheetName];
    const lowerName = sheetName.toLowerCase();
    
    let sheetCompetencia = competencia;
    let foundMonth = '';
    for (const [mName, mNum] of Object.entries(MONTH_MAP)) {
      if (lowerName.includes(mName)) {
        foundMonth = mNum;
        break;
      }
    }
    let foundYear = fallbackYear;
    const yearMatch = lowerName.match(/\b(20\d{2})\b/);
    if (yearMatch) foundYear = yearMatch[1];
    
    if (foundMonth) {
      sheetCompetencia = `${foundYear}-${foundMonth}`;
    }

    const rawData = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });
    
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const nome = row[1];
      if (!nome || typeof nome !== 'string' || nome.trim() === '' || nome.toLowerCase() === 'colaboradores') {
        continue;
      }
      
      records.push({
        arquivoId,
        estabelecimentoId,
        competencia: sheetCompetencia,
        colaboradorNome: nome.trim(),
        colaboradorEmail: row[2] ? String(row[2]).trim() : null,
        dataAdmissao: parseDateFromExcel(row[3]),
        sexo: row[4] ? String(row[4]).trim() : null,
        filhos: row[5] ? String(row[5]).trim() : null,
        tipoContrato: row[6] ? String(row[6]).trim() : null,
        empresa: row[7] ? String(row[7]).trim() : null,
        cnpj: row[8] ? String(row[8]).trim() : null,
        unidade: row[9] ? String(row[9]).trim() : null,
        cpf: row[10] ? String(row[10]).trim() : null,
        dataNascimento: parseDateFromExcel(row[11]),
        cargo: row[12] ? String(row[12]).trim() : null,
        salarioBruto: parseNumber(row[13]),
        diasUteis: typeof row[15] === 'number' ? row[15] : parseInt(String(row[15])) || null,
        correcao: parseNumber(row[16]),
        valorPagar: parseNumber(row[17]),
        vt: parseNumber(row[18]),
        combustivel: parseNumber(row[19]),
        alimentacao: parseNumber(row[20]),
        ajudaCusto: parseNumber(row[21]),
        sobreAviso: parseNumber(row[22]),
        academia: parseNumber(row[23]),
        somaBeneficios: parseNumber(row[24]),
        descontoFixo: parseNumber(row[25]),
        descontosVariaveis: parseNumber(row[26]),
        descontoUniforme: parseNumber(row[27]),
        unimed: parseNumber(row[28]),
        coparticipacao: parseNumber(row[29]),
        cargoConfianca: row[30] ? String(row[30]).trim() : null,
        pontualidade: row[31] ? String(row[31]).trim() : null,
      });
    }
  }
  
  return records;
}
