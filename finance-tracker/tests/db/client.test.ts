import { describe, it, expect } from "vitest";
import { getDb, seedCategories, DEFAULT_CATEGORIES } from "@/db/client";
import { categories } from "@/db/schema";

describe("getDb", () => {
  it("creates tables and seeds the 15 default categories in order", () => {
    const db = getDb(":memory:");
    const rows = db.select().from(categories).orderBy(categories.id).all();
    expect(rows.map((r) => r.name)).toEqual([
      "Groceries", "Dining", "Transport", "Shopping", "Subscriptions",
      "Bills & Utilities", "Rent", "Entertainment", "Health", "Travel",
      "Education", "Income", "Transfer", "Fees", "Other",
    ]);
    expect(DEFAULT_CATEGORIES).toHaveLength(15);
  });

  it("does not duplicate categories when seeding twice", () => {
    const db = getDb(":memory:");
    seedCategories(db);
    expect(db.select().from(categories).all()).toHaveLength(15);
  });
});
