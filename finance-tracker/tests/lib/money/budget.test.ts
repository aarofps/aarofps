import { describe, it, expect } from "vitest";
import { prefillBudgets, budgetStatus } from "@/lib/money/budget";
import type { Txn } from "@/lib/money/categorize";

const DINING = 2, INCOME = 12;
const t = (date: string, amountCents: number, categoryId = DINING): Txn =>
  ({ id: date + amountCents, accountId: "a", date, amountCents, merchant: "m", categoryId });

describe("prefillBudgets", () => {
  it("averages the last 3 full months and rounds up to $10", () => {
    const m = prefillBudgets([
      t("2026-08-05", 12300), t("2026-09-05", 8000), t("2026-10-05", 10000),
      t("2026-11-02", 99999), t("2026-07-01", 50000), t("2026-10-01", -500000, INCOME),
    ], "2026-11-13", INCOME);
    expect(m.get(DINING)).toBe(11000);
    expect(m.has(INCOME)).toBe(false);
  });
  it("skips categories with no net spending", () => {
    expect(prefillBudgets([t("2026-10-05", -100)], "2026-11-13", INCOME).size).toBe(0);
  });
});

describe("budgetStatus", () => {
  it("joins limits with spending", () => {
    expect(budgetStatus(new Map([[DINING, 10000]]), new Map([[DINING, 9200]]))).toEqual([
      { categoryId: DINING, limitCents: 10000, spentCents: 9200, pct: 0.92 },
    ]);
  });
});
