import Link from "next/link";
import { addMonths } from "@/lib/money/dates";

export function monthLabel(m: string) {
  return new Date(m + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function MonthPicker({ month, base }: { month: string; base: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Link className="btn" href={`${base}?month=${addMonths(month, -1)}`} aria-label="Previous month">←</Link>
      <span className="min-w-36 text-center font-medium">{monthLabel(month)}</span>
      <Link className="btn" href={`${base}?month=${addMonths(month, 1)}`} aria-label="Next month">→</Link>
    </div>
  );
}

export function parseMonth(v: unknown, fallback: string) {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : fallback;
}
