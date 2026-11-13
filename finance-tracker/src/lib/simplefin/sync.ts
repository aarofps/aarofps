import { and, eq, gte, inArray, isNull, notInArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  accounts, alerts, balanceSnapshots, budgets, categories, categoryRules, connections, transactions,
} from "@/db/schema";
import { categorize, type Txn } from "../money/categorize";
import { detectTransfers, spendingByCategory } from "../money/transfers";
import { detectRecurring } from "../money/recurring";
import { budgetStatus } from "../money/budget";
import { reconstructHistory } from "../money/networth";
import { addDays, dateToUnix, monthEnd, monthStart, unixToDate } from "../money/dates";
import { DEFAULT_THRESHOLDS, generateAlerts, type NewAlert } from "../alerts";
import { getSetting, setSetting } from "../settings";
import { decrypt } from "../crypto";
import { fetchAccounts, guessKind, toCents, SimplefinForbidden, type SfResponse } from "./client";

export type Fetcher = (startUnix: number, endUnix?: number) => Promise<SfResponse>;
export type SyncResult = { accounts: number; added: number; errors: string[] };

export const ACCESS_URL_KEY = "simplefin_access_url_enc";
const WINDOW_DAYS = 90;
const BACKFILL_WINDOWS = 3;
const AUTO_SYNC_HOURS = 12;
export const MANUAL_SYNC_COOLDOWN_MIN = 60;

function insertAlerts(db: DB, list: NewAlert[], now: Date) {
  for (const a of list) {
    db.insert(alerts).values({ ...a, createdAt: now.toISOString() }).onConflictDoNothing().run();
  }
}

/** Write one SimpleFIN response into the DB. Returns ids of newly inserted transactions. */
function applyResponse(db: DB, r: SfResponse, windowStart: string, today: string, nowIso: string, pruneStale: boolean): string[] {
  const added: string[] = [];
  for (const a of r.accounts) {
    const connId = a.org?.domain ?? a.org?.name ?? "unknown";
    db.insert(connections)
      .values({ id: connId, institutionName: a.org?.name ?? connId, status: "ok", lastError: null, updatedAt: nowIso })
      .onConflictDoUpdate({ target: connections.id, set: { status: "ok", lastError: null, updatedAt: nowIso } }).run();

    const existing = db.select().from(accounts).where(eq(accounts.id, a.id)).get();
    const kind = existing?.kindUserSet ? existing.kind : (existing?.kind ?? guessKind(a.name));
    const raw = toCents(a.balance);
    const balanceCents = kind === "credit" ? -raw : raw;
    db.insert(accounts)
      .values({ id: a.id, connectionId: connId, name: a.name, kind, source: "simplefin", balanceCents, updatedAt: nowIso })
      .onConflictDoUpdate({ target: accounts.id, set: { name: a.name, kind, balanceCents, connectionId: connId, updatedAt: nowIso } }).run();
    const snapDate = unixToDate(a["balance-date"]) > today ? today : unixToDate(a["balance-date"]);
    db.insert(balanceSnapshots).values({ accountId: a.id, date: snapDate, balanceCents, estimated: 0 })
      .onConflictDoUpdate({ target: [balanceSnapshots.accountId, balanceSnapshots.date], set: { balanceCents, estimated: 0 } }).run();

    const seen: string[] = [];
    for (const t of a.transactions ?? []) {
      const externalId = "sf:" + t.id;
      seen.push(externalId);
      const pending = t.pending ? 1 : 0;
      const when = t.transacted_at ?? t.posted;
      const date = when ? unixToDate(when) : today;
      const merchant = (t.payee || t.description || "Unknown").trim();
      const values = {
        accountId: a.id, date, amountCents: -toCents(t.amount), merchant,
        description: t.description ?? "", pending, source: "simplefin",
      };
      const before = db.select({ id: transactions.id }).from(transactions).where(eq(transactions.externalId, externalId)).get();
      if (before) {
        db.update(transactions).set(values).where(eq(transactions.id, before.id)).run();
      } else {
        db.insert(transactions).values({ id: externalId, externalId, ...values }).run();
        added.push(externalId);
      }
    }
    if (pruneStale) {
      const conds = [eq(transactions.accountId, a.id), eq(transactions.pending, 1), gte(transactions.date, windowStart), eq(transactions.source, "simplefin")];
      if (seen.length) conds.push(notInArray(transactions.externalId, seen));
      db.delete(transactions).where(and(...conds)).run();
    }
  }
  return added;
}

const toTxn = (r: typeof transactions.$inferSelect): Txn => ({
  id: r.id, accountId: r.accountId, date: r.date, amountCents: r.amountCents, merchant: r.merchant,
  categoryId: r.categoryId, isTransfer: !!r.isTransfer, pending: !!r.pending,
});

/** Categorize, flag transfers, detect subscriptions and raise alerts. Shared with CSV import. */
export function postProcess(db: DB, opts: { today: string; now: Date; newIds: string[]; quiet: boolean; connectionErrors?: string[] }) {
  const cats = db.select().from(categories).all();
  const catId = Object.fromEntries(cats.map((c) => [c.name, c.id])) as Record<string, number>;
  const catNames = Object.fromEntries(cats.map((c) => [c.id, c.name])) as Record<number, string>;
  const rules = db.select().from(categoryRules).all();

  for (const r of db.select().from(transactions).where(isNull(transactions.categoryId)).all()) {
    db.update(transactions).set({ categoryId: categorize(toTxn(r), rules, catId) }).where(eq(transactions.id, r.id)).run();
  }

  const since = addDays(opts.today, -WINDOW_DAYS);
  const recent = db.select().from(transactions).where(gte(transactions.date, since)).all().map(toTxn);
  const transferIds = detectTransfers(recent, catId.Transfer);
  for (const t of recent) {
    const flag = transferIds.has(t.id) ? 1 : 0;
    if (flag !== (t.isTransfer ? 1 : 0)) db.update(transactions).set({ isTransfer: flag }).where(eq(transactions.id, t.id)).run();
  }

  const all = db.select().from(transactions).all().map(toTxn);
  const ignored = new Set<string>(JSON.parse(getSetting(db, "recurring_ignored") ?? "[]"));
  const recurring = detectRecurring(all, ignored, { excludeCategoryIds: [catId.Transfer, catId.Income], today: opts.today });
  const known = new Set<string>(JSON.parse(getSetting(db, "recurring_known") ?? "[]"));
  const newRecurring = opts.quiet ? [] : recurring.filter((r) => !known.has(r.key));
  setSetting(db, "recurring_known", JSON.stringify([...new Set([...known, ...recurring.map((r) => r.key)])]));

  const month = opts.today.slice(0, 7);
  const limits = new Map(db.select().from(budgets).where(eq(budgets.month, month)).all().map((b) => [b.categoryId, b.limitCents]));
  const spent = spendingByCategory(all, monthStart(month), monthEnd(month), catId.Income);
  const recentCutoff = addDays(opts.today, -7);
  const newTxns = opts.newIds.length
    ? db.select().from(transactions).where(inArray(transactions.id, opts.newIds)).all().map(toTxn).filter((t) => t.date >= recentCutoff)
    : [];
  const thresholds = JSON.parse(getSetting(db, "alert_thresholds") ?? "null") ?? DEFAULT_THRESHOLDS;

  insertAlerts(db, generateAlerts({
    budget: budgetStatus(limits, spent),
    newTxns: newTxns.map((t) => ({ ...t, isTransfer: transferIds.has(t.id) })),
    accts: db.select().from(accounts).where(eq(accounts.hidden, 0)).all(),
    newRecurring, connectionErrors: opts.connectionErrors ?? [],
    thresholds, month, today: opts.today, catNames,
  }), opts.now);
}

export async function syncAll(db: DB, fetcher: Fetcher, opts: { now?: Date } = {}): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  setSetting(db, "last_sync_attempt", nowIso);
  const last = getSetting(db, "last_sync");
  const first = !last;
  const floor = addDays(today, -WINDOW_DAYS);
  let windowStart = first ? floor : addDays(last!.slice(0, 10), -7);
  if (windowStart < floor) windowStart = floor;

  let main: SfResponse;
  try {
    main = await fetcher(dateToUnix(windowStart));
  } catch (e) {
    const msg = e instanceof SimplefinForbidden ? e.message : `Sync failed: ${e instanceof Error ? e.message : String(e)}`;
    insertAlerts(db, [{ type: "sync_error", message: msg, dedupeKey: `sync_error:${today}` }], now);
    return { accounts: 0, added: 0, errors: [msg] };
  }

  const added = applyResponse(db, main, windowStart, today, nowIso, true);
  if (first) {
    for (let k = 1; k <= BACKFILL_WINDOWS; k++) {
      const end = addDays(windowStart, -(k - 1) * WINDOW_DAYS);
      const start = addDays(end, -WINDOW_DAYS);
      let older: SfResponse;
      try { older = await fetcher(dateToUnix(start), dateToUnix(end)); } catch { break; }
      const got = applyResponse(db, older, start, today, nowIso, false);
      added.push(...got);
      if (got.length === 0) break;
    }
  }

  for (const err of main.errors) {
    for (const c of db.select().from(connections).all()) {
      if (err.toLowerCase().includes(c.institutionName.toLowerCase())) {
        db.update(connections).set({ status: "error", lastError: err }).where(eq(connections.id, c.id)).run();
      }
    }
  }

  if (first) {
    const all = db.select().from(transactions).all().map(toTxn);
    for (const a of db.select().from(accounts).where(eq(accounts.source, "simplefin")).all()) {
      for (const s of reconstructHistory(a, all, today)) {
        db.insert(balanceSnapshots).values({ ...s, estimated: 1 }).onConflictDoNothing().run();
      }
    }
  }

  postProcess(db, { today, now, newIds: added, quiet: first, connectionErrors: main.errors });
  setSetting(db, "last_sync", nowIso);
  return { accounts: main.accounts.length, added: added.length, errors: main.errors };
}

export function makeFetcher(db: DB, keyHex: string): Fetcher | null {
  const enc = getSetting(db, ACCESS_URL_KEY);
  if (!enc) return null;
  const url = decrypt(enc, keyHex);
  return (start, end) => fetchAccounts(url, start, end);
}

const hoursSince = (iso: string | null, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / 3600_000 : Infinity);

/** Auto-sync at most every 12h, and never within an hour of any attempt (protects the ~24/day quota). */
export function shouldAutoSync(db: DB, now: Date): boolean {
  return hoursSince(getSetting(db, "last_sync"), now) >= AUTO_SYNC_HOURS
    && hoursSince(getSetting(db, "last_sync_attempt"), now) >= MANUAL_SYNC_COOLDOWN_MIN / 60;
}

/** Minutes until a manual sync is allowed again (0 = now). */
export function manualSyncWaitMinutes(db: DB, now: Date): number {
  const h = hoursSince(getSetting(db, "last_sync_attempt"), now);
  return h >= MANUAL_SYNC_COOLDOWN_MIN / 60 ? 0 : Math.ceil(MANUAL_SYNC_COOLDOWN_MIN - h * 60);
}

export async function maybeAutoSync(db: DB, keyHex: string, now = new Date()): Promise<SyncResult | null> {
  const fetcher = makeFetcher(db, keyHex);
  if (!fetcher || !shouldAutoSync(db, now)) return null;
  return syncAll(db, fetcher, { now });
}
