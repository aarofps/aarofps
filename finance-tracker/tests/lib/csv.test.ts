import { describe, it, expect } from "vitest";
import { parseCsv, csvExternalId, csvHeaders } from "@/lib/csv";

describe("parseCsv", () => {
  it("reads a single amount column with $, commas and parentheses (bank sign: negative = spent)", () => {
    const text = "Date,Description,Amount\n11/02/2026,PAYCHECK,\"$1,234.56\"\n11/03/2026,COFFEE,(45.00)\n";
    expect(parseCsv(text, { date: "Date", description: "Description", amount: "Amount" })).toEqual([
      { date: "2026-11-02", description: "PAYCHECK", amountCents: -123456 },
      { date: "2026-11-03", description: "COFFEE", amountCents: 4500 },
    ]);
  });
  it("invert flips a column where positive means spent (card statements)", () => {
    const text = "Date,Description,Amount\n2026-11-03,COFFEE,4.50\n";
    expect(parseCsv(text, { date: "Date", description: "Description", amount: "Amount", invert: true })[0].amountCents).toBe(450);
  });
  it("reads separate Debit and Credit columns", () => {
    const text = "Transaction Date,Description,Debit,Credit\n11/1/26,TARGET,20.00,\n11/2/26,REFUND,,100.00\n";
    expect(parseCsv(text, { date: "Transaction Date", description: "Description", debit: "Debit", credit: "Credit" })).toEqual([
      { date: "2026-11-01", description: "TARGET", amountCents: 2000 },
      { date: "2026-11-02", description: "REFUND", amountCents: -10000 },
    ]);
  });
  it("skips blank and unparseable rows", () => {
    const text = "Date,Description,Amount\n\n11/02/2026,A,-1.00\nTotal,,\n";
    expect(parseCsv(text, { date: "Date", description: "Description", amount: "Amount" })).toHaveLength(1);
  });
  it("lists headers", () => {
    expect(csvHeaders("A,B,C\n1,2,3\n")).toEqual(["A", "B", "C"]);
  });
});

describe("csvExternalId", () => {
  it("is stable for the same row and differs by account and occurrence", () => {
    const row = { date: "2026-11-02", description: "A", amountCents: 100 };
    expect(csvExternalId("x", row)).toBe(csvExternalId("x", { ...row }));
    expect(csvExternalId("x", row)).not.toBe(csvExternalId("y", row));
    expect(csvExternalId("x", row)).toMatch(/^csv:/);
    expect(csvExternalId("x", row, 1)).not.toBe(csvExternalId("x", row, 0));
  });
});
