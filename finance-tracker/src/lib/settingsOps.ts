import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { accounts } from "@/db/schema";
import type { Kind } from "./money/networth";
import { DEFAULT_THRESHOLDS } from "./alerts";
import { getSetting, setSetting } from "./settings";
import { hashPassword, verifyPassword } from "./auth";

const KINDS: Kind[] = ["cash", "credit", "investment", "other"];

export function updateAccount(db: DB, id: string, p: { kind?: Kind; hidden?: boolean }) {
  const set: Partial<typeof accounts.$inferInsert> = {};
  if (p.kind !== undefined) {
    if (!KINDS.includes(p.kind)) throw new Error("Unknown account type");
    set.kind = p.kind; set.kindUserSet = 1;
  }
  if (p.hidden !== undefined) set.hidden = p.hidden ? 1 : 0;
  if (Object.keys(set).length) db.update(accounts).set(set).where(eq(accounts.id, id)).run();
}

export type Thresholds = { largeTxnCents: number; lowCashCents: number };

export function getThresholds(db: DB): Thresholds {
  const raw = getSetting(db, "alert_thresholds");
  return raw ? { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) } : { ...DEFAULT_THRESHOLDS };
}

export function saveThresholds(db: DB, t: Thresholds) {
  if (![t.largeTxnCents, t.lowCashCents].every((v) => Number.isInteger(v) && v >= 0)) throw new Error("Thresholds must be zero or more.");
  setSetting(db, "alert_thresholds", JSON.stringify(t));
}

export async function changePassword(db: DB, current: string, next: string) {
  const stored = getSetting(db, "password_hash");
  if (!stored || !(await verifyPassword(stored, current))) throw new Error("Current password is wrong.");
  if (next.length < 8) throw new Error("Use at least 8 characters.");
  setSetting(db, "password_hash", await hashPassword(next));
}
