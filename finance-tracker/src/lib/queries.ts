import { and, count, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { accounts, alerts, balanceSnapshots, budgets, categories, categoryRules, connections, transactions } from "@/db/schema";
import { normalizeMerchant, type Txn } from "./money/categorize";
import { addDays, addMonths, monthEnd, monthStart } from "./money/dates";
import { budgetStatus, prefillBudgets } from "./money/budget";
import { changeOverRange, netWorthOf, netWorthSeries, rangeStart, type Kind, type Range } from "./money/networth";
import { spendingByCategory } from "./money/transfers";
import { getSetting } from "./settings";
import { ACCESS_URL_KEY } from "./simplefin/sync";

export type AcctRow = typeof accounts.$inferSelect;
export type TxnRow = typeof transactions.$inferSelect;

export const toTxn = (r: TxnRow): Txn => ({
  id: r.id, accountId: r.accountId, date: r.date, amountCents: r.amountCents, merchant: r.merchant,
  categoryId: r.categoryId, isTransfer: !!r.isTransfer, pending: !!r.pending,
});

export function categoryMaps(db: DB) {
  const cats = db.select().from(categories).orderBy(categories.id).all();
  return {
    list: cats,
    idByName: Object.fromEntries(cats.map((c) => [c.name, c.id])) as Record<string, number>,
    nameById: Object.fromEntries(cats.map((c) => [c.id, c.name])) as Record<number, string>,
  };
}

export function visibleAccounts(db: DB): AcctRow[] {
  return db.select().from(accounts).where(eq(accounts.hidden, 0)).orderBy(accounts.name).all();
}

export function monthSpending(db: DB, month: string): Map<number, number> {
  const { idByName } = categoryMaps(db);
  const from = monthStart(month), to = monthEnd(month);
  const rows = db.select().from(transactions).all().filter((t) => t.date >= from && t.date <= to);
  return spendingByCategory(rows.map(toTxn), from, to, idByName.Income);
}

export function getHomeData(db: DB, today: string, range: Range) {
  const accts = visibleAccounts(db);
  const ids = accts.map((a) => a.id);
  const snaps = ids.length
    ? db.select().from(balanceSnapshots).where(inArray(balanceSnapshots.accountId, ids)).all()
        .map((s) => ({ ...s, estimated: !!s.estimated }))
    : [];
  const earliest = snaps.reduce((m, s) => (s.date < m ? s.date : m), today);
  const series = netWorthSeries(accts, snaps, rangeStart(range, today, earliest), today);
  const month = today.slice(0, 7);
  const monthSeries = netWorthSeries(accts, snaps, addDays(monthStart(month), -1), today);

  const groups: Record<Kind, AcctRow[]> = { cash: [], investment: [], credit: [], other: [] };
  for (const a of accts) groups[a.kind].push(a);

  const limits = db.select().from(budgets).where(eq(budgets.month, month)).all();
  const spent = [...monthSpending(db, month).values()].reduce((s, v) => s + v, 0);

  return {
    netWorthCents: netWorthOf(accts),
    change: changeOverRange(monthSeries),
    series,
    groups,
    budget: { spentCents: spent, limitCents: limits.reduce((s, b) => s + b.limitCents, 0) },
    alerts: db.select().from(alerts).where(eq(alerts.dismissed, 0)).orderBy(desc(alerts.createdAt), desc(alerts.id)).limit(8).all(),
    connectionErrors: db.select().from(connections).where(eq(connections.status, "error")).all(),
    lastSync: getSetting(db, "last_sync"),
    connected: !!getSetting(db, ACCESS_URL_KEY),
  };
}

export function dismissAlert(db: DB, id: number) {
  db.update(alerts).set({ dismissed: 1 }).where(and(eq(alerts.id, id))).run();
}

export const PAGE_SIZE = 50;
export type TxnFilter = { q?: string; accountId?: string; categoryId?: number; from?: string; to?: string; page?: number };

export function listTransactions(db: DB, f: TxnFilter): { rows: TxnRow[]; total: number } {
  const conds = [];
  if (f.q?.trim()) {
    const like = `%${f.q.trim().toLowerCase()}%`;
    conds.push(or(sql`lower(${transactions.merchant}) like ${like}`, sql`lower(${transactions.description}) like ${like}`));
  }
  if (f.accountId) conds.push(eq(transactions.accountId, f.accountId));
  if (f.categoryId) conds.push(eq(transactions.categoryId, f.categoryId));
  if (f.from) conds.push(gte(transactions.date, f.from));
  if (f.to) conds.push(lte(transactions.date, f.to));
  const where = conds.length ? and(...conds) : undefined;
  const total = db.select({ n: count() }).from(transactions).where(where).get()?.n ?? 0;
  const page = Math.max(1, f.page ?? 1);
  const rows = db.select().from(transactions).where(where)
    .orderBy(desc(transactions.date), desc(transactions.id)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).all();
  return { rows, total };
}

export function recategorize(db: DB, txnId: string, categoryId: number, applyToMerchant: boolean): number {
  const t = db.select().from(transactions).where(eq(transactions.id, txnId)).get();
  if (!t) throw new Error("Transaction not found");
  const isTransfer = categoryId === categoryMaps(db).idByName.Transfer ? 1 : 0;
  if (!applyToMerchant) {
    db.update(transactions).set({ categoryId, isTransfer }).where(eq(transactions.id, txnId)).run();
    return 1;
  }
  const pattern = normalizeMerchant(t.merchant);
  db.delete(categoryRules).where(eq(categoryRules.pattern, pattern)).run();
  db.insert(categoryRules).values({ pattern, categoryId }).run();
  let n = 0;
  for (const r of db.select().from(transactions).all()) {
    if (normalizeMerchant(r.merchant).includes(pattern)) {
      db.update(transactions).set({ categoryId, isTransfer }).where(eq(transactions.id, r.id)).run();
      n++;
    }
  }
  return n;
}

export function getSpendingPage(db: DB, month: string) {
  const { nameById } = categoryMaps(db);
  const now = monthSpending(db, month), prev = monthSpending(db, addMonths(month, -1));
  const ids = new Set([...now.keys(), ...prev.keys()]);
  const rows = [...ids]
    .map((id) => ({ categoryId: id, name: nameById[id] ?? "Other", thisMonthCents: now.get(id) ?? 0, lastMonthCents: prev.get(id) ?? 0 }))
    .filter((r) => r.thisMonthCents !== 0 || r.lastMonthCents !== 0)
    .sort((a, b) => b.thisMonthCents - a.thisMonthCents || b.lastMonthCents - a.lastMonthCents);
  return {
    rows,
    totalThisMonth: rows.reduce((s, r) => s + r.thisMonthCents, 0),
    totalLastMonth: rows.reduce((s, r) => s + r.lastMonthCents, 0),
  };
}

export function getBudgetPage(db: DB, month: string) {
  const { nameById } = categoryMaps(db);
  const limits = new Map(db.select().from(budgets).where(eq(budgets.month, month)).all().map((b) => [b.categoryId, b.limitCents]));
  const spent = monthSpending(db, month);
  const rows = budgetStatus(limits, spent)
    .map((r) => ({ ...r, name: nameById[r.categoryId] ?? "Other" }))
    .sort((a, b) => b.pct - a.pct);
  const unbudgeted = [...spent]
    .filter(([id, c]) => !limits.has(id) && c > 0)
    .map(([categoryId, spentCents]) => ({ categoryId, name: nameById[categoryId] ?? "Other", spentCents }))
    .sort((a, b) => b.spentCents - a.spentCents);
  return { rows, unbudgeted };
}

export function saveBudgets(db: DB, month: string, limits: { categoryId: number; limitCents: number }[]) {
  for (const l of limits) {
    if (l.limitCents <= 0) {
      db.delete(budgets).where(and(eq(budgets.month, month), eq(budgets.categoryId, l.categoryId))).run();
    } else {
      db.insert(budgets).values({ month, ...l })
        .onConflictDoUpdate({ target: [budgets.categoryId, budgets.month], set: { limitCents: l.limitCents } }).run();
    }
  }
}

export function prefillMonth(db: DB, month: string, today: string) {
  const { idByName } = categoryMaps(db);
  const anchor = month < today.slice(0, 7) ? monthStart(month) : today;
  const all = db.select().from(transactions).all().map(toTxn);
  for (const [categoryId, limitCents] of prefillBudgets(all, anchor, idByName.Income)) {
    db.insert(budgets).values({ month, categoryId, limitCents }).onConflictDoNothing().run();
  }
}
