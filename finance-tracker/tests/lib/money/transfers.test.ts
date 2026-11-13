import { describe, it, expect } from "vitest";
import { detectTransfers, spendingByCategory } from "@/lib/money/transfers";
import type { Txn } from "@/lib/money/categorize";

const TRANSFER = 13, INCOME = 12, DINING = 2;
const tx = (id: string, accountId: string, date: string, amountCents: number, extra: Partial<Txn> = {}): Txn =>
  ({ id, accountId, date, amountCents, merchant: id, categoryId: DINING, ...extra });

describe("detectTransfers", () => {
  it("cardPaymentNotSpending: pairs a checking outflow with the card inflow", () => {
    const txns = [
      tx("chk", "checking", "2026-11-01", 50000, { categoryId: 15 }),
      tx("card", "card", "2026-11-02", -50000, { categoryId: 15 }),
      tx("food", "card", "2026-11-03", 1200),
    ];
    const ids = detectTransfers(txns, TRANSFER);
    expect([...ids].sort()).toEqual(["card", "chk"]);
    const flagged = txns.map((t) => ({ ...t, isTransfer: ids.has(t.id) }));
    expect(spendingByCategory(flagged, "2026-11-01", "2026-11-30", INCOME).get(15)).toBeUndefined();
    expect(spendingByCategory(flagged, "2026-11-01", "2026-11-30", INCOME).get(DINING)).toBe(1200);
  });
  it("does not pair amounts more than 3 days apart", () => {
    const ids = detectTransfers([tx("a", "x", "2026-11-01", 2000), tx("b", "y", "2026-11-06", -2000)], TRANSFER);
    expect(ids.size).toBe(0);
  });
  it("does not pair within the same account", () => {
    const ids = detectTransfers([tx("a", "x", "2026-11-01", 2000), tx("b", "x", "2026-11-01", -2000)], TRANSFER);
    expect(ids.size).toBe(0);
  });
  it("pairs each transaction at most once", () => {
    const ids = detectTransfers([
      tx("a", "x", "2026-11-01", 2000), tx("b", "y", "2026-11-01", -2000), tx("c", "z", "2026-11-01", 2000),
    ], TRANSFER);
    expect(ids.size).toBe(2);
  });
  it("flags anything categorized Transfer", () => {
    expect(detectTransfers([tx("a", "x", "2026-11-01", 900, { categoryId: TRANSFER })], TRANSFER).has("a")).toBe(true);
  });
});

describe("spendingByCategory", () => {
  it("refunds reduce the category; pending, income and out-of-range are excluded", () => {
    const m = spendingByCategory([
      tx("a", "x", "2026-11-02", 5000),
      tx("r", "x", "2026-11-03", -1500),
      tx("p", "x", "2026-11-04", 999, { pending: true }),
      tx("i", "x", "2026-11-05", -300000, { categoryId: INCOME }),
      tx("old", "x", "2026-10-31", 7000),
    ], "2026-11-01", "2026-11-30", INCOME);
    expect(m.get(DINING)).toBe(3500);
    expect(m.has(INCOME)).toBe(false);
  });
});
