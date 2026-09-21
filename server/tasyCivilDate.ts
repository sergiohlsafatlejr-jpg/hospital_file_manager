export function serializeTasyCivilDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    const datePrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[ T].*)?$/);
    if (datePrefix) return datePrefix[1];
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
