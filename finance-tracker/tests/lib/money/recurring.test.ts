import { describe, it, expect } from "vitest";
import { detectRecurring } from "@/lib/money/recurring";
import type { Txn } from "@/lib/money/categorize";

const t = (date: string, amountCents: number, merchant = "NETFLIX.COM 866"): Txn =>
  ({ id: date + merchant, accountId: "card", date, amountCents, merchant });

describe("detectRecurring", () => {
  it("finds a monthly charge and predicts the next date", () => {
    const r = detectRecurring([t("2026-08-05", 1549), t("2026-09-05", 1549), t("2026-10-05", 1549)]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ key: "netflix.com", cadence: "monthly", avgCents: 1549, lastDate: "2026-10-05", nextDate: "2026-11-05", accountId: "card" });
  });
  it("needs at least 3 occurrences", () => {
    expect(detectRecurring([t("2026-09-05", 1549), t("2026-10-05", 1549)])).toEqual([]);
  });
  it("rejects amounts that vary more than 10%", () => {
    expect(detectRecurring([t("2026-08-05", 1000), t("2026-09-05", 1500), t("2026-10-05", 1000)])).toEqual([]);
  });
  it("finds weekly charges and ignores refunds", () => {
    const r = detectRecurring([t("2026-10-01", 500, "GYM"), t("2026-10-08", 500, "GYM"), t("2026-10-15", 520, "GYM"), t("2026-10-16", -500, "GYM")]);
    expect(r[0]?.cadence).toBe("weekly");
  });
  it("skips ignored merchants", () => {
    expect(detectRecurring([t("2026-08-05", 1549), t("2026-09-05", 1549), t("2026-10-05", 1549)], new Set(["netflix.com"]))).toEqual([]);
  });
});

describe("detectRecurring filters", () => {
  it("skips excluded categories like Transfer", () => {
    const pay = (d: string) => ({ ...t(d, 60000, "CAPITAL ONE MOBILE PMT"), categoryId: 13 });
    expect(detectRecurring([pay("2026-08-25"), pay("2026-09-25"), pay("2026-10-25")], new Set(), { excludeCategoryIds: [13] })).toEqual([]);
  });
  it("drops charges that stopped (well past their next date)", () => {
    const old = [t("2026-03-05", 1549), t("2026-04-05", 1549), t("2026-05-05", 1549)];
    expect(detectRecurring(old, new Set(), { today: "2026-11-13" })).toEqual([]);
    expect(detectRecurring(old, new Set(), { today: "2026-06-12" })).toHaveLength(1);
  });
});
