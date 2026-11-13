import Papa from "papaparse";
import crypto from "node:crypto";
import { parseMoney } from "./money/cents";

export type CsvMapping = {
  date: string; description: string;
  amount?: string; debit?: string; credit?: string;
  /** Single amount column where positive means money spent (e.g. card statements). */
  invert?: boolean;
};
export type CsvRow = { date: string; description: string; amountCents: number };

function parseDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

const money = (s: string | undefined): number | null => {
  if (!s || !s.trim()) return null;
  try { return parseMoney(s); } catch { return null; }
};

export function csvHeaders(text: string): string[] {
  return (Papa.parse<string[]>(text.trim(), { preview: 1 }).data[0] ?? []).map((h) => h.trim());
}

/** Rows in app sign convention: positive = money out. */
export function parseCsv(text: string, m: CsvMapping): CsvRow[] {
  const { data } = Papa.parse<Record<string, string>>(text.trim(), {
    header: true, skipEmptyLines: true, transformHeader: (h) => h.trim(),
  });
  const out: CsvRow[] = [];
  for (const r of data) {
    const date = parseDate(r[m.date] ?? "");
    if (!date) continue;
    let amountCents: number | null;
    if (m.amount) {
      const v = money(r[m.amount]);
      amountCents = v === null ? null : m.invert ? v : -v;
    } else {
      const d = money(m.debit ? r[m.debit] : undefined);
      const c = money(m.credit ? r[m.credit] : undefined);
      amountCents = d === null && c === null ? null : Math.abs(d ?? 0) - Math.abs(c ?? 0);
    }
    if (amountCents === null) continue;
    out.push({ date, description: (r[m.description] ?? "").trim() || "Unknown", amountCents });
  }
  return out;
}

/** occurrence = how many identical rows came before this one in the same file. */
export function csvExternalId(accountId: string, row: CsvRow, occurrence = 0): string {
  const h = crypto.createHash("sha1").update(`${accountId}|${row.date}|${row.amountCents}|${row.description}|${occurrence}`).digest("hex");
  return `csv:${h}`;
}
