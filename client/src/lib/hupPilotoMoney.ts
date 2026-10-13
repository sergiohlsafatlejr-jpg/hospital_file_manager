import Decimal from "decimal.js";

export function formatPilotoMoney(value: string | null | undefined) {
  if (value == null) return "—";
  try {
    const d = new Decimal(value);
    if (!d.isFinite()) return "—";
    const [integer, fraction] = d.abs().toFixed(2).split(".");
    return `${d.isNegative() ? "−" : ""}R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction}`;
  } catch { return "—"; }
}
