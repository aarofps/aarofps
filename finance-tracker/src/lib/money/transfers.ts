import type { Txn } from "./categorize";
import { daysBetween } from "./dates";

const WINDOW_DAYS = 3;

/** Ids of transactions that are moves between own accounts (incl. card payments). */
export function detectTransfers(txns: Txn[], transferCategoryId: number): Set<string> {
  const out = new Set<string>();
  for (const t of txns) if (t.categoryId === transferCategoryId) out.add(t.id);
  const used = new Set<string>();
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
  for (const a of sorted) {
    if (used.has(a.id) || a.amountCents <= 0) continue;
    const b = sorted.find((c) =>
      !used.has(c.id) && c.id !== a.id && c.accountId !== a.accountId &&
      c.amountCents === -a.amountCents && Math.abs(daysBetween(a.date, c.date)) <= WINDOW_DAYS);
    if (b) {
      used.add(a.id); used.add(b.id);
      out.add(a.id); out.add(b.id);
    }
  }
  return out;
}

/** Net spending per category in [from, to]. Refunds subtract; transfers, pending, income excluded. */
export function spendingByCategory(txns: Txn[], from: string, to: string, incomeCategoryId: number): Map<number, number> {
  const m = new Map<number, number>();
  for (const t of txns) {
    if (t.isTransfer || t.pending || t.date < from || t.date > to) continue;
    if (t.categoryId == null || t.categoryId === incomeCategoryId) continue;
    m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amountCents);
  }
  return m;
}
