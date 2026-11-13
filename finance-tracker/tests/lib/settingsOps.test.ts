import { describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { accounts } from "@/db/schema";
import { updateAccount, saveThresholds, getThresholds, changePassword } from "@/lib/settingsOps";
import { getSetting, setSetting } from "@/lib/settings";
import { hashPassword, verifyPassword } from "@/lib/auth";

describe("settings operations", () => {
  it("updates an account's kind (marking it user-set) and hidden flag", () => {
    const db = getDb(":memory:");
    db.insert(accounts).values({ id: "a", name: "X", kind: "cash", source: "simplefin", balanceCents: 1, updatedAt: "t" }).run();
    updateAccount(db, "a", { kind: "credit", hidden: true });
    expect(db.select().from(accounts).get()).toMatchObject({ kind: "credit", kindUserSet: 1, hidden: 1 });
    expect(() => updateAccount(db, "a", { kind: "bogus" as never })).toThrow();
  });
  it("saves thresholds and falls back to defaults", () => {
    const db = getDb(":memory:");
    expect(getThresholds(db)).toEqual({ largeTxnCents: 25000, lowCashCents: 50000 });
    saveThresholds(db, { largeTxnCents: 10000, lowCashCents: 20000 });
    expect(getThresholds(db)).toEqual({ largeTxnCents: 10000, lowCashCents: 20000 });
    expect(() => saveThresholds(db, { largeTxnCents: -1, lowCashCents: 0 })).toThrow();
  });
  it("changes the password only with the current one", async () => {
    const db = getDb(":memory:");
    setSetting(db, "password_hash", await hashPassword("old-password"));
    await expect(changePassword(db, "wrong", "new-password")).rejects.toThrow(/Current password/);
    await expect(changePassword(db, "old-password", "short")).rejects.toThrow(/8 characters/);
    await changePassword(db, "old-password", "new-password");
    expect(await verifyPassword(getSetting(db, "password_hash")!, "new-password")).toBe(true);
  });
});
