import { describe, it, expect } from "vitest";
import { generateAlerts, type AlertInput } from "@/lib/alerts";

const base: AlertInput = {
  budget: [], newTxns: [], accts: [], newRecurring: [], connectionErrors: [],
  thresholds: { largeTxnCents: 25000, lowCashCents: 50000 },
  month: "2026-11", today: "2026-11-13", catNames: { 2: "Dining" },
};

describe("generateAlerts", () => {
  it("warns at 90% of budget", () => {
    const a = generateAlerts({ ...base, budget: [{ categoryId: 2, limitCents: 10000, spentCents: 9200, pct: 0.92 }] });
    expect(a).toEqual([{ type: "budget_90", message: "Dining is at 92% of budget", dedupeKey: "budget_90:2:2026-11" }]);
  });
  it("only sends the over-budget alert past 100%", () => {
    const a = generateAlerts({ ...base, budget: [{ categoryId: 2, limitCents: 10000, spentCents: 10500, pct: 1.05 }] });
    expect(a.map((x) => x.type)).toEqual(["budget_100"]);
  });
  it("flags large posted transactions only", () => {
    const t = { id: "t1", accountId: "a", date: "2026-11-12", amountCents: 30000, merchant: "BEST BUY" };
    const a = generateAlerts({ ...base, newTxns: [t, { ...t, id: "t2", pending: true }, { ...t, id: "t3", isTransfer: true }] });
    expect(a).toEqual([{ type: "large_txn", message: "Large charge: $300.00 at BEST BUY", dedupeKey: "large_txn:t1" }]);
  });
  it("warns about low cash but never about credit accounts", () => {
    const a = generateAlerts({ ...base, accts: [
      { id: "chk", name: "Checking", kind: "cash", balanceCents: 40000 },
      { id: "card", name: "Card", kind: "credit", balanceCents: 0 },
    ] });
    expect(a).toEqual([{ type: "low_balance", message: "Checking is low: $400.00", dedupeKey: "low_balance:chk:2026-11-13" }]);
  });
  it("reports new subscriptions and connection errors", () => {
    const a = generateAlerts({ ...base,
      newRecurring: [{ key: "netflix", merchant: "NETFLIX", avgCents: 1549, cadence: "monthly", lastDate: "2026-11-05", nextDate: "2026-12-05", accountId: "c" }],
      connectionErrors: ["Discover: needs attention"] });
    expect(a.map((x) => x.type)).toEqual(["new_recurring", "reauth"]);
    expect(a[0].message).toBe("New recurring charge: NETFLIX ($15.49 monthly)");
    expect(a[1].message).toBe("Discover: needs attention — fix it on the SimpleFIN Bridge site.");
  });
});
