import type { Txn } from "./categorize";
import { spendingByCategory } from "./transfers";
import { addMonths, monthEnd, monthStart } from "./dates";

/** Average of the last 3 full months per category, rounded up to $10. */
export function prefillBudgets(txns: Txn[], today: string, incomeCategoryId: number): Map<number, number> {
  const thisMonth = today.slice(0, 7);
  const from = monthStart(addMonths(thisMonth, -3));
  const to = monthEnd(addMonths(thisMonth, -1));
  const totals = spendingByCategory(txns, from, to, incomeCategoryId);
  const out = new Map<number, number>();
  for (const [cat, total] of totals) {
    if (total <= 0) continue;
    out.set(cat, Math.ceil(total / 3 / 1000) * 1000);
  }
  return out;
}

export type BudgetRow = { categoryId: number; limitCents: number; spentCents: number; pct: number };

export function budgetStatus(limits: Map<number, number>, spent: Map<number, number>): BudgetRow[] {
  return [...limits].map(([categoryId, limitCents]) => {
    const spentCents = spent.get(categoryId) ?? 0;
    return { categoryId, limitCents, spentCents, pct: limitCents > 0 ? spentCents / limitCents : 0 };
  });
}
