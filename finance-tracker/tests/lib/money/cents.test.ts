import { describe, it, expect } from "vitest";
import { formatCents, parseMoney } from "@/lib/money/cents";

describe("cents", () => {
  it("parses money strings to cents", () => {
    expect(parseMoney("$1,234.56")).toBe(123456);
    expect(parseMoney("(45.00)")).toBe(-4500);
    expect(parseMoney("-3")).toBe(-300);
    expect(parseMoney("0.1")).toBe(10);
    expect(parseMoney(" 19.999 ")).toBe(2000);
  });
  it("throws on non-numbers", () => {
    expect(() => parseMoney("abc")).toThrow();
  });
  it("formats cents", () => {
    expect(formatCents(-500)).toBe("-$5.00");
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(0)).toBe("$0.00");
  });
});
