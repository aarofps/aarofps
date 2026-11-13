import { getDb } from "@/db/client";
import { getSpendingPage } from "@/lib/queries";
import { addMonths, todayUtc } from "@/lib/money/dates";
import { formatCents } from "@/lib/format";
import { MonthPicker, monthLabel, parseMonth } from "@/components/MonthPicker";

export const dynamic = "force-dynamic";

export default async function SpendingPage({ searchParams }: PageProps<"/spending">) {
  const month = parseMonth((await searchParams).month, todayUtc().slice(0, 7));
  const d = getSpendingPage(getDb(), month);
  const max = Math.max(1, ...d.rows.flatMap((r) => [r.thisMonthCents, r.lastMonthCents]));
  const diff = d.totalThisMonth - d.totalLastMonth;
  const last = monthLabel(addMonths(month, -1)).split(" ")[0];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Spending</h1>
        <MonthPicker month={month} base="/spending" />
      </div>
      <div className="card p-5">
        <div className="tabular text-3xl font-semibold">{formatCents(d.totalThisMonth)}</div>
        <div className="mt-1 text-sm text-muted">
          {diff === 0 ? "Same as" : <span className={diff > 0 ? "text-negative" : "text-positive"}>{formatCents(Math.abs(diff))} {diff > 0 ? "more" : "less"}</span>}
          {diff === 0 ? " " : " than "}{last} ({formatCents(d.totalLastMonth)})
        </div>
      </div>
      <div className="card p-5">
        <div className="mb-4 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent" />This month</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted/40" />{last}</span>
        </div>
        {d.rows.length === 0 && <p className="text-sm text-muted">No spending this month yet.</p>}
        <ul className="flex flex-col gap-4">
          {d.rows.map((r) => (
            <li key={r.categoryId} className="text-sm">
              <div className="mb-1 flex justify-between">
                <span>{r.name}</span>
                <span className="tabular">{formatCents(r.thisMonthCents)} <span className="text-muted">/ {formatCents(r.lastMonthCents)}</span></span>
              </div>
              <div className="flex flex-col gap-0.5" title={`${r.name}: ${formatCents(r.thisMonthCents)} this month, ${formatCents(r.lastMonthCents)} in ${last}`}>
                <div className="h-2 rounded-r bg-accent" style={{ width: `${Math.max(0, (r.thisMonthCents / max) * 100)}%` }} />
                <div className="h-2 rounded-r bg-muted/40" style={{ width: `${Math.max(0, (r.lastMonthCents / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
