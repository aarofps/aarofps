import { describe, it, expect } from "vitest";
import { categorize, normalizeMerchant, type Txn } from "@/lib/money/categorize";
import { DEFAULT_CATEGORIES } from "@/db/client";

const ids = Object.fromEntries(DEFAULT_CATEGORIES.map((n, i) => [n, i + 1])) as Record<string, number>;
const t = (merchant: string): Txn => ({ id: "1", accountId: "a", date: "2026-11-01", amountCents: 100, merchant });

describe("normalizeMerchant", () => {
  it("lowercases and strips store numbers", () => {
    const n = normalizeMerchant("STARBUCKS #1234 SEATTLE");
    expect(n).toContain("starbucks");
    expect(n).not.toMatch(/\d/);
  });
});

describe("categorize", () => {
  it("lets a user rule beat the keyword list", () => {
    expect(categorize(t("STARBUCKS #12"), [{ pattern: "starbucks", categoryId: ids.Entertainment }], ids)).toBe(ids.Entertainment);
  });
  it("puts uber eats in Dining, not Transport", () => {
    expect(categorize(t("UBER EATS 123"), [], ids)).toBe(ids.Dining);
    expect(categorize(t("UBER TRIP 8812"), [], ids)).toBe(ids.Transport);
  });
  it("maps groceries and card payments", () => {
    expect(categorize(t("TRADER JOE'S #552"), [], ids)).toBe(ids.Groceries);
    expect(categorize(t("CAPITAL ONE MOBILE PMT"), [], ids)).toBe(ids.Transfer);
  });
  it("falls back to Other", () => {
    expect(categorize(t("ZQXW LLC"), [], ids)).toBe(ids.Other);
  });
});
