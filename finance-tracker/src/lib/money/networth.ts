import type { Txn } from "./categorize";
import { addDays, addMonths } from "./dates";

export type Kind = "cash" | "credit" | "investment" | "other";
export type Acct = { id: string; kind: Kind; balanceCents: number };
export type Snapshot = { accountId: string; date: string; balanceCents: number; estimated?: boolean };
export type Point = { date: string; cents: number; estimated: boolean };
export type Range = "1M" | "3M" | "1Y" | "ALL";
export const RANGES: Range[] = ["1M", "3M", "1Y", "ALL"];

const signed = (kind: Kind, cents: number) => (kind === "credit" ? -cents : cents);

export function netWorthOf(accts: Acct[]): number {
  return accts.reduce((sum, a) => sum + signed(a.kind, a.balanceCents), 0);
}

/** One point per day in [from, to]; each account carries its last snapshot forward. */
export function netWorthSeries(accts: Acct[], snaps: Snapshot[], from: string, to: string): Point[] {
  if (accts.length === 0 || snaps.length === 0) return [];
  const kind = new Map(accts.map((a) => [a.id, a.kind]));
  const sorted = snaps.filter((s) => kind.has(s.accountId)).sort((a, b) => a.date.localeCompare(b.date));
  const last = new Map<string, Snapshot>();
  let i = 0;
  while (i < sorted.length && sorted[i].date < from) last.set(sorted[i].accountId, sorted[i++]);
  const out: Point[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    while (i < sorted.length && sorted[i].date <= d) last.set(sorted[i].accountId, sorted[i++]);
    if (last.size === 0) continue;
    let cents = 0, estimated = false;
    for (const s of last.values()) {
      cents += signed(kind.get(s.accountId)!, s.balanceCents);
      if (s.estimated && s.date === d) estimated = true;
    }
    out.push({ date: d, cents, estimated });
  }
  return out;
}

export function changeOverRange(series: Point[]): { deltaCents: number; pct: number | null } {
  if (series.length === 0) return { deltaCents: 0, pct: null };
  const start = series[0].cents, end = series[series.length - 1].cents;
  return { deltaCents: end - start, pct: start === 0 ? null : (end - start) / Math.abs(start) };
}

export function rangeStart(range: Range, today: string, earliest: string): string {
  if (range === "ALL") return earliest;
  const months = range === "1M" ? 1 : range === "3M" ? 3 : 12;
  const start = addMonths(today.slice(0, 7), -months) + today.slice(7);
  return start < earliest ? earliest : start;
}

/** Estimate end-of-day balances before today by undoing each day's transactions. */
export function reconstructHistory(acct: Acct, txns: Txn[], today: string): Snapshot[] {
  if (acct.kind !== "cash" && acct.kind !== "credit") return [];
  const posted = txns.filter((t) => t.accountId === acct.id && !t.pending && t.date <= today);
  if (posted.length === 0) return [];
  const byDay = new Map<string, number>();
  for (const t of posted) byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amountCents);
  const earliest = posted.reduce((m, t) => (t.date < m ? t.date : m), today);
  const out: Snapshot[] = [];
  let bal = acct.balanceCents;
  for (let d = today; d >= earliest; d = addDays(d, -1)) {
    const net = byDay.get(d) ?? 0;
    bal = acct.kind === "cash" ? bal + net : bal - net;
    out.push({ accountId: acct.id, date: addDays(d, -1), balanceCents: bal, estimated: true });
  }
  return out.reverse();
}
