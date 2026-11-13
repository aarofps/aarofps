import { and, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import { accounts, alerts, balanceSnapshots, budgets, categories, connections, transactions } from "@/db/schema";
import type { Txn } from "./money/categorize";
import { addDays, monthEnd, monthStart } from "./money/dates";
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
