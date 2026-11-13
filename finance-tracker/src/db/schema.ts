import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const connections = sqliteTable("connections", {
  id: text("id").primaryKey(),
  institutionName: text("institution_name").notNull(),
  status: text("status", { enum: ["ok", "error"] }).notNull().default("ok"),
  lastError: text("last_error"),
  updatedAt: text("updated_at").notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  connectionId: text("connection_id"),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["cash", "credit", "investment", "other"] }).notNull(),
  kindUserSet: integer("kind_user_set").notNull().default(0),
  source: text("source", { enum: ["simplefin", "manual", "csv"] }).notNull(),
  balanceCents: integer("balance_cents").notNull().default(0),
  hidden: integer("hidden").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const balanceSnapshots = sqliteTable(
  "balance_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: text("account_id").notNull(),
    date: text("date").notNull(),
    balanceCents: integer("balance_cents").notNull(),
    estimated: integer("estimated").notNull().default(0),
  },
  (t) => [uniqueIndex("snap_acct_date").on(t.accountId, t.date)],
);

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  date: text("date").notNull(),
  amountCents: integer("amount_cents").notNull(),
  merchant: text("merchant").notNull(),
  description: text("description").notNull().default(""),
  categoryId: integer("category_id"),
  pending: integer("pending").notNull().default(0),
  isTransfer: integer("is_transfer").notNull().default(0),
  source: text("source").notNull(),
  externalId: text("external_id").notNull().unique(),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const categoryRules = sqliteTable("category_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pattern: text("pattern").notNull(),
  categoryId: integer("category_id").notNull(),
});

export const budgets = sqliteTable(
  "budgets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("category_id").notNull(),
    month: text("month").notNull(),
    limitCents: integer("limit_cents").notNull(),
  },
  (t) => [uniqueIndex("budget_cat_month").on(t.categoryId, t.month)],
);

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  targetCents: integer("target_cents").notNull(),
  targetDate: text("target_date"),
  accountId: text("account_id"),
  earmarkedCents: integer("earmarked_cents").notNull().default(0),
  manualCents: integer("manual_cents").notNull().default(0),
});

export const creditScores = sqliteTable("credit_scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  score: integer("score").notNull(),
  source: text("source").notNull(),
});

export const alerts = sqliteTable("alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
  dismissed: integer("dismissed").notNull().default(0),
  dedupeKey: text("dedupe_key").notNull().unique(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
