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

import { listTransactions, recategorize } from "@/lib/queries";
import { categoryRules } from "@/db/schema";

function txnDb() {
  const db = getDb(":memory:");
  db.insert(accounts).values([
    { id: "a", name: "Card", kind: "credit", source: "simplefin", balanceCents: 0, updatedAt: now },
    { id: "b", name: "Checking", kind: "cash", source: "simplefin", balanceCents: 0, updatedAt: now },
  ]).run();
  const rows = [
    ["1", "a", "2026-11-01", "CHIPOTLE 22"], ["2", "a", "2026-11-03", "CHIPOTLE 98"], ["3", "b", "2026-11-05", "chipotle online"],
    ["4", "b", "2026-10-20", "TARGET"], ["5", "a", "2026-11-06", "Starbucks"],
  ];
  for (const [id, accountId, date, merchant] of rows) {
    db.insert(transactions).values({ id, externalId: id, accountId, date, merchant, amountCents: 1000, categoryId: 15, source: "simplefin" }).run();
  }
  return db;
}

describe("listTransactions", () => {
  it("filters by text, account and date, newest first", () => {
    const db = txnDb();
    expect(listTransactions(db, { q: "chipotle" }).rows.map((r) => r.id)).toEqual(["3", "2", "1"]);
    expect(listTransactions(db, { accountId: "b" }).total).toBe(2);
    expect(listTransactions(db, { from: "2026-11-02", to: "2026-11-05" }).rows.map((r) => r.id)).toEqual(["3", "2"]);
    expect(listTransactions(db, { categoryId: 2 }).total).toBe(0);
  });
  it("pages 50 at a time", () => {
    const db = txnDb();
    expect(listTransactions(db, { page: 2 }).rows).toEqual([]);
  });
});

describe("recategorize", () => {
  it("can apply to every transaction from the same merchant and saves a rule", () => {
    const db = txnDb();
    recategorize(db, "1", 2, true);
    expect(db.select().from(categoryRules).all()).toMatchObject([{ pattern: "chipotle", categoryId: 2 }]);
    expect(listTransactions(db, { categoryId: 2 }).rows.map((r) => r.id).sort()).toEqual(["1", "2", "3"]);
  });
  it("changes just one when not applying to the merchant", () => {
    const db = txnDb();
    recategorize(db, "5", 2, false);
    expect(listTransactions(db, { categoryId: 2 }).total).toBe(1);
    expect(db.select().from(categoryRules).all()).toEqual([]);
  });
});

describe("recategorize transfer flag", () => {
  it("marks a transaction as a transfer when moved to Transfer, and unmarks when moved out", () => {
    const db = txnDb();
    recategorize(db, "5", 13, false);
    expect(listTransactions(db, { categoryId: 13 }).rows[0].isTransfer).toBe(1);
    recategorize(db, "5", 2, false);
    expect(listTransactions(db, { categoryId: 2 }).rows[0].isTransfer).toBe(0);
  });
});

import { getBudgetPage, getSpendingPage, saveBudgets, prefillMonth } from "@/lib/queries";

function spendDb() {
  const db = getDb(":memory:");
  db.insert(accounts).values({ id: "a", name: "Card", kind: "credit", source: "simplefin", balanceCents: 0, updatedAt: now }).run();
  const rows: [string, string, number, number][] = [
    ["2026-01-05", "j1", 4000, 2], ["2025-12-10", "d1", 6000, 2], ["2025-12-11", "d2", 1000, 1],
    ["2025-11-10", "n1", 3000, 2], ["2025-10-10", "o1", 3000, 2],
  ];
  for (const [date, id, amountCents, categoryId] of rows) {
    db.insert(transactions).values({ id, externalId: id, accountId: "a", date, amountCents, merchant: id, categoryId, source: "simplefin" }).run();
  }
  return db;
}

describe("spending and budget pages", () => {
  it("compares this month with last month across a year boundary", () => {
    const d = getSpendingPage(spendDb(), "2026-01");
    expect(d.rows.find((r) => r.name === "Dining")).toMatchObject({ thisMonthCents: 4000, lastMonthCents: 6000 });
    expect(d.rows.find((r) => r.name === "Groceries")).toMatchObject({ thisMonthCents: 0, lastMonthCents: 1000 });
    expect(d.rows.some((r) => r.name === "Travel")).toBe(false);
    expect(d.totalThisMonth).toBe(4000);
  });
  it("saves limits and shows status rows", () => {
    const db = spendDb();
    saveBudgets(db, "2026-01", [{ categoryId: 2, limitCents: 5000 }, { categoryId: 1, limitCents: 0 }]);
    const b = getBudgetPage(db, "2026-01");
    expect(b.rows.find((r) => r.categoryId === 2)).toMatchObject({ limitCents: 5000, spentCents: 4000, pct: 0.8 });
    expect(b.rows.find((r) => r.categoryId === 1)).toBeUndefined();
    expect(b.unbudgeted).toEqual([]);
  });
  it("prefills from the last 3 full months without overwriting existing limits", () => {
    const db = spendDb();
    saveBudgets(db, "2026-01", [{ categoryId: 1, limitCents: 77700 }]);
    prefillMonth(db, "2026-01", "2026-01-13");
    const b = getBudgetPage(db, "2026-01");
    expect(b.rows.find((r) => r.categoryId === 2)?.limitCents).toBe(4000);
    expect(b.rows.find((r) => r.categoryId === 1)?.limitCents).toBe(77700);
  });
});
