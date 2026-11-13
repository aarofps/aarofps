import { describe, it, expect } from "vitest";
import { netWorthOf, netWorthSeries, changeOverRange, rangeStart, reconstructHistory } from "@/lib/money/networth";
import type { Txn } from "@/lib/money/categorize";

describe("net worth", () => {
  it("emptyNetWorthSeries: empty input gives empty series and zero change", () => {
    expect(netWorthSeries([], [], "2026-11-01", "2026-11-13")).toEqual([]);
    expect(changeOverRange([])).toEqual({ deltaCents: 0, pct: null });
  });
  it("adds assets and subtracts credit owed", () => {
    expect(netWorthOf([
      { id: "c", kind: "cash", balanceCents: 100000 },
      { id: "i", kind: "investment", balanceCents: 200000 },
      { id: "k", kind: "credit", balanceCents: 30000 },
    ])).toBe(270000);
  });
  it("carries the last known balance forward and counts accounts only after their first snapshot", () => {
    const accts = [{ id: "a", kind: "cash" as const, balanceCents: 3000 }, { id: "k", kind: "credit" as const, balanceCents: 500 }];
    const s = netWorthSeries(accts, [
      { accountId: "a", date: "2026-11-01", balanceCents: 1000 },
      { accountId: "a", date: "2026-11-03", balanceCents: 3000 },
      { accountId: "k", date: "2026-11-02", balanceCents: 500, estimated: true },
    ], "2026-11-01", "2026-11-03");
    expect(s.map((p) => p.cents)).toEqual([1000, 500, 2500]);
    expect(s[1].estimated).toBe(true);
    expect(changeOverRange(s)).toEqual({ deltaCents: 1500, pct: 1.5 });
  });
  it("gives null pct when starting from zero", () => {
    expect(changeOverRange([{ date: "a", cents: 0, estimated: false }, { date: "b", cents: 50, estimated: false }]))
      .toEqual({ deltaCents: 50, pct: null });
  });
  it("computes range starts", () => {
    expect(rangeStart("1M", "2026-11-13", "2025-01-01")).toBe("2026-10-13");
    expect(rangeStart("3M", "2026-11-13", "2025-01-01")).toBe("2026-08-13");
    expect(rangeStart("1Y", "2026-11-13", "2025-01-01")).toBe("2025-11-13");
    expect(rangeStart("ALL", "2026-11-13", "2025-01-01")).toBe("2025-01-01");
    expect(rangeStart("1Y", "2026-11-13", "2026-10-01")).toBe("2026-10-01");
  });
});

describe("reconstructHistory", () => {
  const t = (date: string, amountCents: number): Txn => ({ id: date + amountCents, accountId: "a", date, amountCents, merchant: "m" });
  it("walks cash balances backwards", () => {
    const snaps = reconstructHistory({ id: "a", kind: "cash", balanceCents: 10000 }, [t("2026-11-13", 2000)], "2026-11-13");
    expect(snaps.find((s) => s.date === "2026-11-12")).toEqual({ accountId: "a", date: "2026-11-12", balanceCents: 12000, estimated: true });
  });
  it("walks credit balances backwards", () => {
    const snaps = reconstructHistory({ id: "a", kind: "credit", balanceCents: 5000 }, [t("2026-11-13", 2000)], "2026-11-13");
    expect(snaps.find((s) => s.date === "2026-11-12")?.balanceCents).toBe(3000);
  });
  it("goes back to the earliest transaction and skips pending", () => {
    const snaps = reconstructHistory({ id: "a", kind: "cash", balanceCents: 0 },
      [t("2026-11-10", 100), { ...t("2026-11-12", 999), pending: true }], "2026-11-13");
    expect(snaps.map((s) => s.date)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(snaps[0].balanceCents).toBe(100);
  });
  it("returns nothing for investments", () => {
    expect(reconstructHistory({ id: "a", kind: "investment", balanceCents: 1 }, [t("2026-11-13", 5)], "2026-11-13")).toEqual([]);
  });
});
