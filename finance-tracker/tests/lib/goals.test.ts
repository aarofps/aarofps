import { describe, it, expect } from "vitest";
import { goalProgress, validScore } from "@/lib/goals";

describe("goalProgress", () => {
  it("caps a linked goal at the account balance", () => {
    expect(goalProgress({ targetCents: 1000, accountId: "a", earmarkedCents: 800, manualCents: 0 }, 500)).toEqual({ currentCents: 500, pct: 0.5 });
  });
  it("uses the earmarked amount when the balance covers it", () => {
    expect(goalProgress({ targetCents: 1000, accountId: "a", earmarkedCents: 300, manualCents: 0 }, 5000)).toEqual({ currentCents: 300, pct: 0.3 });
  });
  it("uses manual contributions when not linked and caps pct at 1", () => {
    expect(goalProgress({ targetCents: 1000, accountId: null, earmarkedCents: 0, manualCents: 1500 }, null)).toEqual({ currentCents: 1500, pct: 1 });
  });
  it("never goes negative", () => {
    expect(goalProgress({ targetCents: 1000, accountId: "a", earmarkedCents: 300, manualCents: 0 }, -50).currentCents).toBe(0);
  });
});

describe("validScore", () => {
  it("accepts 300-850 integers only", () => {
    expect(validScore(300)).toBe(true);
    expect(validScore(850)).toBe(true);
    expect(validScore(900)).toBe(false);
    expect(validScore(299)).toBe(false);
    expect(validScore(700.5)).toBe(false);
  });
});
