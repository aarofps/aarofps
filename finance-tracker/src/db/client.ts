import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema>;

export const DEFAULT_CATEGORIES = [
  "Groceries", "Dining", "Transport", "Shopping", "Subscriptions",
  "Bills & Utilities", "Rent", "Entertainment", "Health", "Travel",
  "Education", "Income", "Transfer", "Fees", "Other",
] as const;

const MIGRATIONS = path.join(process.cwd(), "drizzle");
let shared: DB | null = null;

export function seedCategories(db: DB): void {
  for (const name of DEFAULT_CATEGORIES) {
    db.insert(schema.categories).values({ name }).onConflictDoNothing().run();
  }
}

/** Open (and migrate + seed) a database. ":memory:" gives a fresh DB each call. */
export function getDb(file?: string): DB {
  if (!file && shared) return shared;
  const target = file ?? path.join(process.cwd(), "data", "finance.db");
  if (target !== ":memory:") fs.mkdirSync(path.dirname(target), { recursive: true });
  const sqlite = new Database(target);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  seedCategories(db);
  if (!file) shared = db;
  return db;
}
