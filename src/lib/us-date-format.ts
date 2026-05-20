/** Calendar day in storage/API: `YYYY-MM-DD`. Display/input for IT Project: `MM/DD/YYYY`. */

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function ymdToUsDisplay(ymd: string | null | undefined): string {
  const s = (ymd ?? "").trim();
  const m = YMD.exec(s);
  if (!m) return "";
  const year = m[1]!;
  const month = String(Number(m[2])).padStart(2, "0");
  const day = String(Number(m[3])).padStart(2, "0");
  return `${month}/${day}/${year}`;
}

export function parseUsDateInput(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const m = US_DATE.exec(t);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const ymd = `${year}-${mm}-${dd}`;
  const check = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(check.getTime())) return null;
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) {
    return null;
  }
  return ymd;
}

export function normalizeOptionalUsDate(v: unknown): string | null {
  if (v == null) return null;
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (YMD.test(s)) return s;
  return parseUsDateInput(s);
}

export function hasValidActualDate(item: { actualDate?: string | null }): boolean {
  return normalizeOptionalUsDate(item.actualDate) != null;
}
