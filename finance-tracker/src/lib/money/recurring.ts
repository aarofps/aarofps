import { normalizeMerchant, type Txn } from "./categorize";
import { addDays, addMonths, daysBetween } from "./dates";

export type Cadence = "weekly" | "monthly" | "yearly";
export type Recurring = {
  key: string; merchant: string; avgCents: number; cadence: Cadence;
  lastDate: string; nextDate: string; accountId: string;
};

const CADENCES: { cadence: Cadence; days: number; tol: number }[] = [
  { cadence: "weekly", days: 7, tol: 2 },
  { cadence: "monthly", days: 30, tol: 4 },
  { cadence: "yearly", days: 365, tol: 10 },
];

function next(date: string, c: Cadence): string {
  if (c === "weekly") return addDays(date, 7);
  const months = c === "monthly" ? 1 : 12;
  return addMonths(date.slice(0, 7), months) + date.slice(7);
}

export type RecurringOpts = { excludeCategoryIds?: number[]; today?: string };

export function detectRecurring(txns: Txn[], ignored: Set<string> = new Set(), opts: RecurringOpts = {}): Recurring[] {
  const exclude = new Set(opts.excludeCategoryIds ?? []);
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.amountCents <= 0 || t.isTransfer || t.pending) continue;
    if (t.categoryId != null && exclude.has(t.categoryId)) continue;
    const key = normalizeMerchant(t.merchant);
    if (!key || ignored.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    if (list.length < 3) continue;
    list.sort((a, b) => a.date.localeCompare(b.date));
    const avg = list.reduce((s, t) => s + t.amountCents, 0) / list.length;
    if (list.some((t) => Math.abs(t.amountCents - avg) > avg * 0.1)) continue;
    const gaps = list.slice(1).map((t, i) => daysBetween(list[i].date, t.date));
    const match = CADENCES.find((c) => gaps.every((g) => Math.abs(g - c.days) <= c.tol));
    if (!match) continue;
    const last = list[list.length - 1];
    const nextDate = next(last.date, match.cadence);
    // Stopped: more than half a cycle past when the next charge was due.
    if (opts.today && daysBetween(nextDate, opts.today) > match.days / 2 + match.tol) continue;
    out.push({
      key, merchant: last.merchant, avgCents: Math.round(avg), cadence: match.cadence,
      lastDate: last.date, nextDate, accountId: last.accountId,
    });
  }
  return out.sort((a, b) => b.avgCents - a.avgCents);
}
