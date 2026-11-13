import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db/client";
import { accounts, alerts, balanceSnapshots, transactions } from "@/db/schema";
import { syncAll, type Fetcher } from "@/lib/simplefin/sync";
import { SimplefinForbidden, type SfAccount, type SfResponse } from "@/lib/simplefin/client";
import { getSetting, setSetting } from "@/lib/settings";

const NOW = new Date("2026-11-13T15:00:00Z");
const day = (d: string) => Date.parse(d + "T12:00:00Z") / 1000;
const checking = (txns: SfAccount["transactions"], balance = "1000.00"): SfAccount => ({
  id: "chk", name: "360 Checking", currency: "USD", balance, "balance-date": day("2026-11-13"),
  org: { domain: "capitalone.com", name: "Capital One" }, transactions: txns,
});
const card = (balance = "-320.10"): SfAccount => ({
  id: "card", name: "Discover It Card", currency: "USD", balance, "balance-date": day("2026-11-13"),
  org: { domain: "discover.com", name: "Discover" }, transactions: [],
});
const fixed = (r: SfResponse): Fetcher => async () => r;
const opts = { now: NOW };
const fresh = () => { const db = getDb(":memory:"); setSetting(db, "last_sync", "2026-11-12T15:00:00.000Z"); return db; };
const txnRows = (db: DB) => db.select().from(transactions).all();

describe("syncAll", () => {
  it("flips SimpleFIN signs into the app convention", async () => {
    const db = fresh();
    await syncAll(db, fixed({ errors: [], accounts: [
      checking([{ id: "t1", posted: day("2026-11-12"), amount: "-45.00", description: "TRADER JOE'S #5" }]), card(),
    ] }), opts);
    expect(txnRows(db)[0]).toMatchObject({ amountCents: 4500, date: "2026-11-12", merchant: "TRADER JOE'S #5" });
    expect(db.select().from(accounts).where(eq(accounts.id, "card")).get()).toMatchObject({ kind: "credit", balanceCents: 32010 });
    expect(txnRows(db)[0].categoryId).not.toBeNull();
  });

  it("pendingReplacedOnPost: a stale pending row is removed when the posted one arrives", async () => {
    const db = fresh();
    await syncAll(db, fixed({ errors: [], accounts: [checking([{ id: "p1", posted: 0, amount: "-9.99", description: "SPOTIFY", pending: true }])] }), opts);
    await syncAll(db, fixed({ errors: [], accounts: [checking([{ id: "t1", posted: day("2026-11-13"), amount: "-9.99", description: "SPOTIFY" }])] }), opts);
    expect(txnRows(db).map((t) => t.externalId)).toEqual(["sf:t1"]);
  });

  it("bankErrorDoesNotBlockOthers: still updates accounts and raises a reauth alert", async () => {
    const db = fresh();
    const r = await syncAll(db, fixed({ errors: ["Connection to Discover may need attention"], accounts: [checking([]), card()] }), opts);
    expect(r.accounts).toBe(2);
    expect(db.select().from(accounts).all()).toHaveLength(2);
    expect(db.select().from(alerts).all().map((a) => a.type)).toContain("reauth");
  });

  it("forbiddenIsReported: a 403 makes a sync_error alert and keeps last_sync", async () => {
    const db = fresh();
    const r = await syncAll(db, async () => { throw new SimplefinForbidden(); }, opts);
    expect(r.errors[0]).toMatch(/disabled or invalid/);
    expect(db.select().from(alerts).all().map((a) => a.type)).toEqual(["sync_error"]);
    expect(getSetting(db, "last_sync")).toBe("2026-11-12T15:00:00.000Z");
  });

  it("updates today's snapshot instead of duplicating it, and keeps a user-set kind", async () => {
    const db = fresh();
    await syncAll(db, fixed({ errors: [], accounts: [checking([], "1000.00")] }), opts);
    db.update(accounts).set({ kind: "other", kindUserSet: 1 }).run();
    await syncAll(db, fixed({ errors: [], accounts: [checking([], "1200.00")] }), opts);
    const snaps = db.select().from(balanceSnapshots).where(eq(balanceSnapshots.date, "2026-11-13")).all();
    expect(snaps).toHaveLength(1);
    expect(snaps[0].balanceCents).toBe(120000);
    expect(db.select().from(accounts).get()?.kind).toBe("other");
  });

  it("first sync backfills older windows and rebuilds estimated history", async () => {
    const db = getDb(":memory:");
    const starts: number[] = [];
    const fetcher: Fetcher = async (start) => {
      starts.push(start);
      if (starts.length === 1) return { errors: [], accounts: [checking([{ id: "t1", posted: day("2026-11-10"), amount: "-20.00", description: "CHIPOTLE" }])] };
      if (starts.length === 2) return { errors: [], accounts: [checking([{ id: "t0", posted: day("2026-08-01"), amount: "-5.00", description: "TEA" }])] };
      return { errors: [], accounts: [checking([])] };
    };
    await syncAll(db, fetcher, opts);
    expect(starts).toHaveLength(3);
    expect(txnRows(db)).toHaveLength(2);
    const est = db.select().from(balanceSnapshots).where(eq(balanceSnapshots.estimated, 1)).all();
    expect(est.length).toBeGreaterThan(90);
    expect(getSetting(db, "last_sync")).toBe(NOW.toISOString());
  });

  it("does not raise large-charge alerts for old backfilled transactions", async () => {
    const db = getDb(":memory:");
    await syncAll(db, fixed({ errors: [], accounts: [checking([
      { id: "old", posted: day("2026-09-01"), amount: "-900.00", description: "BEST BUY" },
      { id: "new", posted: day("2026-11-12"), amount: "-400.00", description: "BEST BUY" },
    ])] }), opts);
    expect(db.select().from(alerts).all().filter((a) => a.type === "large_txn").map((a) => a.dedupeKey)).toEqual(["large_txn:sf:new"]);
  });
});

import { shouldAutoSync } from "@/lib/simplefin/sync";

describe("shouldAutoSync", () => {
  it("syncs when the last success is older than 12h and no attempt in the last hour", async () => {
    const db = getDb(":memory:");
    expect(shouldAutoSync(db, NOW)).toBe(true);
    setSetting(db, "last_sync", "2026-11-13T04:00:00.000Z");
    expect(shouldAutoSync(db, NOW)).toBe(false);
    setSetting(db, "last_sync", "2026-11-12T20:00:00.000Z");
    expect(shouldAutoSync(db, NOW)).toBe(true);
  });
  it("backs off for an hour after a failed attempt", async () => {
    const db = fresh();
    await syncAll(db, async () => { throw new SimplefinForbidden(); }, { now: new Date("2026-11-13T14:30:00Z") });
    expect(shouldAutoSync(db, NOW)).toBe(false);
    expect(shouldAutoSync(db, new Date("2026-11-13T15:31:00Z"))).toBe(true);
  });
});
