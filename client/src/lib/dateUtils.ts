/**
 * Utilitários de formatação de data para evitar problemas de fuso horário.
 * 
 * PROBLEMA: Quando uma data vem do banco como "2025-12-06" (sem timezone),
 * `new Date("2025-12-06")` interpreta como UTC meia-noite (00:00:00Z).
 * Para o fuso horário do Brasil (UTC-3), isso resulta em 05/12/2025 às 21:00,
 * mostrando um dia a menos.
 * 
 * SOLUÇÃO: Adicionar T12:00:00 para que a conversão de timezone nunca
 * mude o dia, independentemente do fuso horário do usuário.
 */

/**
 * Converte uma string de data para um objeto Date seguro contra fuso horário.
 * Se a string for apenas data (YYYY-MM-DD), adiciona T12:00:00 para evitar
 * que a conversão de timezone mude o dia.
 */
export function safeParseDate(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  if (date instanceof Date) return date;
  
  const str = String(date).trim();
  if (!str) return null;

  // Se for apenas data no formato YYYY-MM-DD (10 caracteres, sem T)
  // Adiciona T12:00:00 para evitar problema de fuso horário
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return new Date(str + "T12:00:00");
  }
  
  // Se for formato DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [day, month, year] = str.split("/");
    return new Date(`${year}-${month}-${day}T12:00:00`);
  }

  // Se for formato YYYY-MM-DD HH:mm:ss ou YYYY-MM-DDTHH:mm:ss (sem timezone explícita)
  // Tratar como horário local para evitar shift de dia
  const matchDateTime = str.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)$/);
  if (matchDateTime) {
    // Sem timezone suffix (Z ou +/-HH:mm) → interpretar como local
    return new Date(`${matchDateTime[1]}T${matchDateTime[2]}`);
  }

  // Para outros formatos (com timezone explícita), usar parse normal
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formata uma data para exibição no formato brasileiro (DD/MM/YYYY).
 * Seguro contra problemas de fuso horário.
 */
export function formatDateBR(date: Date | string | null | undefined): string {
  const d = safeParseDate(date);
  if (!d || isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
}

/**
 * Formata uma data com hora para exibição no formato brasileiro (DD/MM/YYYY HH:mm).
 * Seguro contra problemas de fuso horário.
 */
export function formatDateTimeBR(date: Date | string | null | undefined): string {
  const d = safeParseDate(date);
  if (!d || isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Formata uma data para exibição curta (mês abreviado + ano).
 * Ex: "dez/2025"
 */
export function formatDateShortBR(date: Date | string | null | undefined): string {
  const d = safeParseDate(date);
  if (!d || isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

/**
 * Converte uma data para formato YYYY-MM-DD para uso em inputs HTML type="date".
 * Seguro contra problemas de fuso horário.
 */
export function toInputDateValue(date: Date | string | null | undefined): string {
  const d = safeParseDate(date);
  if (!d || isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
