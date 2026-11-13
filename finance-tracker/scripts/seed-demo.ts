// Fills a separate demo database with fake data so the app can be previewed.
// Usage: npm run demo   (seeds data/demo.db, then starts the app on it)
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../src/db/client";
import { accounts, balanceSnapshots, budgets, creditScores, goals, transactions } from "../src/db/schema";
import { reconstructHistory } from "../src/lib/money/networth";
import { addDays, todayUtc } from "../src/lib/money/dates";
import { postProcess } from "../src/lib/simplefin/sync";
import { setSetting } from "../src/lib/settings";
import { hashPassword } from "../src/lib/auth";

const file = path.join(process.cwd(), "data", "demo.db");
for (const f of [file, file + "-wal", file + "-shm"]) fs.rmSync(f, { force: true });
const db = getDb(file);
const today = todayUtc();
const nowIso = new Date().toISOString();
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const accts = [
  { id: "demo-chk", name: "360 Checking", kind: "cash" as const, balanceCents: 642318 },
  { id: "demo-sav", name: "360 Performance Savings", kind: "cash" as const, balanceCents: 410000 },
  { id: "demo-qs", name: "Quicksilver Card", kind: "credit" as const, balanceCents: 84512 },
  { id: "demo-disc", name: "Discover It Card", kind: "credit" as const, balanceCents: 23077 },
  { id: "demo-boa", name: "BofA Customized Cash Card", kind: "credit" as const, balanceCents: 11240 },
];
for (const a of accts) db.insert(accounts).values({ ...a, source: "manual", updatedAt: nowIso }).run();

type T = { acct: string; date: string; cents: number; merchant: string };
const txns: T[] = [];
const push = (acct: string, date: string, cents: number, merchant: string) => { if (date <= today) txns.push({ acct, date, cents, merchant }); };
for (let i = 180; i >= 0; i--) {
  const d = addDays(today, -i);
  const dom = Number(d.slice(8));
  if (dom === 1 || dom === 15) push("demo-chk", d, -185000, "ACME CORP PAYROLL DIRECT DEP");
  if (dom === 3) push("demo-qs", d, 1549, "NETFLIX.COM");
  if (dom === 9) push("demo-disc", d, 1199, "SPOTIFY USA");
  if (dom === 12) push("demo-boa", d, 3500, "PLANET FITNESS GYM");
  if (dom === 20) push("demo-chk", d, 6500, "VERIZON WIRELESS");
  if (dom === 2) { push("demo-chk", d, 50000, "TRANSFER TO SAVINGS"); push("demo-sav", d, -50000, "TRANSFER FROM CHECKING"); }
  if (dom === 25) { push("demo-chk", d, 60000, "CAPITAL ONE MOBILE PMT"); push("demo-qs", addDays(d, 1), -60000, "PAYMENT THANK YOU"); }
  if (rand() < 0.5) push(["demo-qs", "demo-disc"][Math.floor(rand() * 2)], d, Math.round(800 + rand() * 2600), ["STARBUCKS #1182", "CHIPOTLE 2291", "BOBA GUYS", "DOORDASH*SUSHI"][Math.floor(rand() * 4)]);
  if (rand() < 0.18) push("demo-qs", d, Math.round(4000 + rand() * 9000), ["TRADER JOE'S #552", "COSTCO WHSE #118", "H MART"][Math.floor(rand() * 3)]);
  if (rand() < 0.12) push("demo-boa", d, Math.round(1500 + rand() * 9000), ["AMAZON.COM*MK2", "TARGET 00012", "STEAM GAMES"][Math.floor(rand() * 3)]);
  if (rand() < 0.1) push("demo-disc", d, Math.round(1200 + rand() * 2500), ["UBER TRIP", "CHEVRON 0091", "SHELL OIL"][Math.floor(rand() * 3)]);
}
txns.forEach((t, i) => db.insert(transactions).values({
  id: `demo-${i}`, externalId: `demo-${i}`, accountId: t.acct, date: t.date, amountCents: t.cents,
  merchant: t.merchant, description: t.merchant, source: "manual",
}).run());

const all = txns.map((t, i) => ({ id: `demo-${i}`, accountId: t.acct, date: t.date, amountCents: t.cents, merchant: t.merchant }));
for (const a of accts) {
  db.insert(balanceSnapshots).values({ accountId: a.id, date: today, balanceCents: a.balanceCents }).run();
  for (const s of reconstructHistory(a, all, today)) db.insert(balanceSnapshots).values({ ...s, estimated: 0 }).onConflictDoNothing().run();
}
// Roth IRA: a manual investment account with monthly balance updates.
db.insert(accounts).values({ id: "demo-ira", name: "Schwab Roth IRA", kind: "investment", kindUserSet: 1, source: "manual", balanceCents: 1284055, updatedAt: nowIso }).run();
for (let m = 6; m >= 0; m--) {
  db.insert(balanceSnapshots).values({ accountId: "demo-ira", date: addDays(today, -m * 30), balanceCents: 1284055 - m * 61000 + Math.round((rand() - 0.5) * 40000) }).onConflictDoNothing().run();
}

postProcess(db, { today, now: new Date(), newIds: [], quiet: true });
const month = today.slice(0, 7);
for (const [cat, limit] of [[1, 45000], [2, 30000], [3, 15000], [4, 25000], [5, 4000], [6, 8000], [9, 4000]]) {
  db.insert(budgets).values({ categoryId: cat, month, limitCents: limit }).run();
}
db.insert(goals).values([
  { name: "Emergency fund", targetCents: 1000000, targetDate: `${Number(today.slice(0, 4)) + 1}-06-01`, accountId: "demo-sav", earmarkedCents: 410000 },
  { name: "New laptop", targetCents: 180000, manualCents: 65000 },
]).run();
db.insert(creditScores).values([
  { date: addDays(today, -150), score: 701, source: "CreditWise" }, { date: addDays(today, -120), score: 708, source: "CreditWise" },
  { date: addDays(today, -90), score: 712, source: "CreditWise" }, { date: addDays(today, -60), score: 709, source: "CreditWise" },
  { date: addDays(today, -30), score: 721, source: "CreditWise" }, { date: today, score: 728, source: "CreditWise" },
]).run();
hashPassword("demo-password").then((h) => {
  setSetting(db, "password_hash", h);
  console.log(`Demo data written to ${file} (${txns.length} transactions). Password: demo-password`);
});
