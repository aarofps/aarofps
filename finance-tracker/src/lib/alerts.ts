import type { BudgetRow } from "./money/budget";
import type { Txn } from "./money/categorize";
import type { Kind } from "./money/networth";
import type { Recurring } from "./money/recurring";
import { formatCents } from "./money/cents";

export type AlertInput = {
  budget: BudgetRow[];
  newTxns: Txn[];
  accts: { id: string; name: string; kind: Kind; balanceCents: number }[];
  newRecurring: Recurring[];
  connectionErrors: string[];
  thresholds: { largeTxnCents: number; lowCashCents: number };
  month: string;
  today: string;
  catNames: Record<number, string>;
};

export type NewAlert = { type: string; message: string; dedupeKey: string };

export const DEFAULT_THRESHOLDS = { largeTxnCents: 25000, lowCashCents: 50000 };

function hashText(s: string): string {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

export function generateAlerts(i: AlertInput): NewAlert[] {
  const out: NewAlert[] = [];
  for (const b of i.budget) {
    const name = i.catNames[b.categoryId] ?? "A category";
    if (b.pct >= 1) {
      out.push({ type: "budget_100", message: `${name} is over budget (${Math.round(b.pct * 100)}%)`, dedupeKey: `budget_100:${b.categoryId}:${i.month}` });
    } else if (b.pct >= 0.9) {
      out.push({ type: "budget_90", message: `${name} is at ${Math.round(b.pct * 100)}% of budget`, dedupeKey: `budget_90:${b.categoryId}:${i.month}` });
    }
  }
  for (const t of i.newTxns) {
    if (t.pending || t.isTransfer || t.amountCents < i.thresholds.largeTxnCents) continue;
    out.push({ type: "large_txn", message: `Large charge: ${formatCents(t.amountCents)} at ${t.merchant}`, dedupeKey: `large_txn:${t.id}` });
  }
  for (const a of i.accts) {
    if (a.kind !== "cash" || a.balanceCents >= i.thresholds.lowCashCents) continue;
    out.push({ type: "low_balance", message: `${a.name} is low: ${formatCents(a.balanceCents)}`, dedupeKey: `low_balance:${a.id}:${i.today}` });
  }
  for (const r of i.newRecurring) {
    out.push({ type: "new_recurring", message: `New recurring charge: ${r.merchant} (${formatCents(r.avgCents)} ${r.cadence})`, dedupeKey: `new_recurring:${r.key}` });
  }
  for (const e of i.connectionErrors) {
    out.push({ type: "reauth", message: `${e} — fix it on the SimpleFIN Bridge site.`, dedupeKey: `reauth:${hashText(e)}:${i.today}` });
  }
  return out;
}
