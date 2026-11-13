import { describe, it, expect, afterEach } from "vitest";
import { unixToDate, localDate } from "@/lib/money/dates";

const original = process.env.TZ;
afterEach(() => { process.env.TZ = original; });

describe("local dates", () => {
  it("dates an evening purchase in Pacific time on the local day, not the UTC day", () => {
    process.env.TZ = "America/Los_Angeles";
    const evening = Date.parse("2026-11-14T03:00:00Z") / 1000; // Nov 13, 7pm PST
    expect(unixToDate(evening)).toBe("2026-11-13");
    expect(localDate(new Date("2026-11-01T06:30:00Z"))).toBe("2026-10-31");
  });
});
