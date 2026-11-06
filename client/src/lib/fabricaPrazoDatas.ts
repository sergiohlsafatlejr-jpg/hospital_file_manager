type DataRaw = string | Date | null | undefined;

function calendarioValido(ano: number, mes: number, dia: number): boolean {
  if (ano < 1 || ano > 9999 || mes < 1 || mes > 12 || dia < 1) return false;
  const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
  return dia <= [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
}

function localEstrito(ano: number, mes: number, dia: number, hora: number, minuto = 0, segundo = 0, ms = 0): Date | null {
  if (!calendarioValido(ano, mes, dia) || hora > 23 || minuto > 59 || segundo > 59) return null;
  // setFullYear evita a regra especial do construtor JS para anos 00–99.
  const data = new Date(0);
  data.setFullYear(ano, mes - 1, dia);
  data.setHours(hora, minuto, segundo, ms);
  // Recusa normalização, inclusive horários locais inexistentes por transição de fuso.
  return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia &&
    data.getHours() === hora && data.getMinutes() === minuto && data.getSeconds() === segundo && data.getMilliseconds() === ms
    ? data : null;
}

/** Data sem horário é civil; timestamp com zona é um instante, inclusive meia-noite. */
export function parseDataPrazoEstrita(raw: DataRaw, horaDataCivil = 12): Date | null {
  if (raw instanceof Date) return Number.isFinite(raw.getTime()) ? new Date(raw.getTime()) : null;
  if (typeof raw !== "string") return null;
  const str = raw.trim();
  const civil = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  const civilBR = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
  if (civil) return localEstrito(Number(civil[1]), Number(civil[2]), Number(civil[3]), horaDataCivil);
  if (civilBR) return localEstrito(Number(civilBR[3]), Number(civilBR[2]), Number(civilBR[1]), horaDataCivil);

  const timestamp = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(str);
  if (!timestamp) return null;
  const [, y, m, d, hh, mm, ss = "0", frac = "0", zona] = timestamp;
  const [ano, mes, dia, hora, minuto, segundo, ms] = [Number(y), Number(m), Number(d), Number(hh), Number(mm), Number(ss), Number(frac.padEnd(3, "0"))];
  if (!calendarioValido(ano, mes, dia) || hora > 23 || minuto > 59 || segundo > 59) return null;
  if (!zona) return localEstrito(ano, mes, dia, hora, minuto, segundo, ms);

  let offset = 0;
  if (zona.toUpperCase() !== "Z") {
    const partesZona = /^([+-])(\d{2}):?(\d{2})$/.exec(zona)!;
    const horasZona = Number(partesZona[2]);
    const minutosZona = Number(partesZona[3]);
    if (horasZona > 14 || minutosZona > 59 || (horasZona === 14 && minutosZona !== 0)) return null;
    offset = (horasZona * 60 + minutosZona) * (partesZona[1] === "+" ? 1 : -1);
  }
  const utc = new Date(0);
  utc.setUTCFullYear(ano, mes - 1, dia);
  utc.setUTCHours(hora, minuto, segundo, ms);
  const data = new Date(utc.getTime() - offset * 60000);
  return Number.isFinite(data.getTime()) ? data : null;
}

/** Data Alta é civil, inclusive sua serialização legada Date/ISO à meia-noite UTC. */
export function parseDataAltaPrazo(raw: DataRaw): Date | null {
  const data = parseDataPrazoEstrita(raw);
  if (!data) return null;
  if ((raw instanceof Date || (typeof raw === "string" && /[T ]00:00(?::00(?:\.0+)?)?(?:Z|[+]00:?00|[-]00:?00)$/i.test(raw.trim()))) &&
      data.getUTCHours() === 0 && data.getUTCMinutes() === 0 && data.getUTCSeconds() === 0 && data.getUTCMilliseconds() === 0) {
    return localEstrito(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate(), 12);
  }
  return data;
}
