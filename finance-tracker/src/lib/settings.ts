import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { settings } from "@/db/schema";

export function getSetting(db: DB, key: string): string | null {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
}

export function setSetting(db: DB, key: string, value: string): void {
  db.insert(settings).values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}

export function deleteSetting(db: DB, key: string): void {
  db.delete(settings).where(eq(settings.key, key)).run();
}
