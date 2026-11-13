import { describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { accounts, alerts, balanceSnapshots, budgets, transactions } from "@/db/schema";
import { getHomeData } from "@/lib/queries";

const now = "2026-11-13T00:00:00Z";

describe("getHomeData", () => {
  it("works on an empty database", () => {
    const d = getHomeData(getDb(":memory:"), "2026-11-13", "1M");
    expect(d.netWorthCents).toBe(0);
    expect(d.series).toEqual([]);
    expect(d.groups).toEqual({ cash: [], investment: [], credit: [], other: [] });
    expect(d.change).toEqual({ deltaCents: 0, pct: null });
    expect(d.connected).toBe(false);
  });

  it("returns net worth, groups, month change, budget and alerts", () => {
    const db = getDb(":memory:");
    db.insert(accounts).values([
      { id: "chk", name: "Checking", kind: "cash", source: "simplefin", balanceCents: 600000, updatedAt: now },
      { id: "card", name: "Card", kind: "credit", source: "simplefin", balanceCents: 50000, updatedAt: now },
      { id: "hid", name: "Old", kind: "cash", source: "manual", balanceCents: 999999, hidden: 1, updatedAt: now },
    ]).run();
    db.insert(balanceSnapshots).values([
      { accountId: "chk", date: "2026-10-31", balanceCents: 400000 },
      { accountId: "chk", date: "2026-11-13", balanceCents: 600000 },
      { accountId: "card", date: "2026-10-31", balanceCents: 50000 },
    ]).run();
    db.insert(budgets).values({ categoryId: 2, month: "2026-11", limitCents: 30000 }).run();
    db.insert(transactions).values({ id: "t", externalId: "t", accountId: "card", date: "2026-11-05", amountCents: 12000, merchant: "X", categoryId: 2, source: "simplefin" }).run();
    db.insert(alerts).values([
      { type: "large_txn", message: "hi", createdAt: now, dedupeKey: "a" },
      { type: "large_txn", message: "gone", createdAt: now, dedupeKey: "b", dismissed: 1 },
    ]).run();
    const d = getHomeData(db, "2026-11-13", "1M");
    expect(d.netWorthCents).toBe(550000);
    expect(d.groups.cash.map((a) => a.id)).toEqual(["chk"]);
    expect(d.groups.credit.map((a) => a.id)).toEqual(["card"]);
    expect(d.change.deltaCents).toBe(200000);
    expect(d.series.at(-1)?.cents).toBe(550000);
    expect(d.budget).toEqual({ spentCents: 12000, limitCents: 30000 });
    expect(d.alerts.map((a) => a.message)).toEqual(["hi"]);
  });
});
