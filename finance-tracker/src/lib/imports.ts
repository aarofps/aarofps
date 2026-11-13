import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { accounts, balanceSnapshots, transactions } from "@/db/schema";
import type { Kind } from "./money/networth";
import { csvExternalId, type CsvRow } from "./csv";
import { postProcess } from "./simplefin/sync";
import { localDate } from "./money/dates";

export function importCsvRows(db: DB, accountId: string, rows: CsvRow[], now = new Date()): { inserted: number; skipped: number } {
  if (!db.select().from(accounts).where(eq(accounts.id, accountId)).get()) throw new Error("Pick an account to import into.");
  const seen = new Map<string, number>();
  const newIds: string[] = [];
  let skipped = 0;
  for (const row of rows) {
    const base = `${row.date}|${row.amountCents}|${row.description}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const externalId = csvExternalId(accountId, row, n);
    const res = db.insert(transactions).values({
      id: externalId, externalId, accountId, date: row.date, amountCents: row.amountCents,
      merchant: row.description, description: row.description, source: "csv",
    }).onConflictDoNothing().run();
    if (res.changes) newIds.push(externalId); else skipped++;
  }
  postProcess(db, { today: localDate(now), now, newIds, quiet: true });
  return { inserted: newIds.length, skipped };
}

export function upsertManualAccount(
  db: DB, a: { id?: string; name: string; kind: Kind; balanceCents: number }, now = new Date(),
): string {
  const id = a.id ?? `manual:${crypto.randomUUID()}`;
  const nowIso = now.toISOString();
  db.insert(accounts).values({ id, name: a.name, kind: a.kind, kindUserSet: 1, source: "manual", balanceCents: a.balanceCents, updatedAt: nowIso })
    .onConflictDoUpdate({ target: accounts.id, set: { name: a.name, kind: a.kind, balanceCents: a.balanceCents, updatedAt: nowIso } }).run();
  db.insert(balanceSnapshots).values({ accountId: id, date: localDate(now), balanceCents: a.balanceCents })
    .onConflictDoUpdate({ target: [balanceSnapshots.accountId, balanceSnapshots.date], set: { balanceCents: a.balanceCents, estimated: 0 } }).run();
  return id;
}
