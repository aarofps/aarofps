import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accounts, balanceSnapshots, transactions } from "@/db/schema";
import { importCsvRows, upsertManualAccount } from "@/lib/imports";

const NOW = new Date("2026-11-13T15:00:00Z");

describe("importCsvRows", () => {
  it("keeps same-day duplicates within a file and skips everything on re-import", () => {
    const db = getDb(":memory:");
    const id = upsertManualAccount(db, { name: "Schwab Roth IRA", kind: "investment", balanceCents: 2140000 }, NOW);
    const rows = [
      { date: "2026-11-02", description: "COFFEE", amountCents: 450 },
      { date: "2026-11-02", description: "COFFEE", amountCents: 450 },
    ];
    expect(importCsvRows(db, id, rows, NOW)).toEqual({ inserted: 2, skipped: 0 });
    expect(importCsvRows(db, id, rows, NOW)).toEqual({ inserted: 0, skipped: 2 });
    const t = db.select().from(transactions).all();
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ source: "csv", accountId: id });
    expect(t[0].categoryId).not.toBeNull();
  });
  it("rejects an unknown account", () => {
    expect(() => importCsvRows(getDb(":memory:"), "nope", [], NOW)).toThrow(/account/);
  });
});

describe("upsertManualAccount", () => {
  it("creates then updates a manual account and writes today's snapshot", () => {
    const db = getDb(":memory:");
    const id = upsertManualAccount(db, { name: "Roth", kind: "investment", balanceCents: 100 }, NOW);
    upsertManualAccount(db, { id, name: "Roth IRA", kind: "investment", balanceCents: 250 }, NOW);
    expect(db.select().from(accounts).all()).toMatchObject([{ id, name: "Roth IRA", balanceCents: 250, source: "manual" }]);
    expect(db.select().from(balanceSnapshots).where(eq(balanceSnapshots.accountId, id)).all()).toMatchObject([{ date: "2026-11-13", balanceCents: 250 }]);
  });
});
