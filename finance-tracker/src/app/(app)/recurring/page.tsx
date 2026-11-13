import { getDb } from "@/db/client";
import { getRecurring } from "@/lib/queries";
import { todayUtc } from "@/lib/money/dates";
import { accounts } from "@/db/schema";
import { formatCents, formatDate } from "@/lib/format";
import { IgnoreButton } from "@/components/IgnoreButton";

export const dynamic = "force-dynamic";

export default function RecurringPage() {
  const db = getDb();
  const { items, monthlyCents } = getRecurring(db, todayUtc());
  const acctName = Object.fromEntries(db.select().from(accounts).all().map((a) => [a.id, a.name]));
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Recurring</h1>
      <div className="card p-5">
        <div className="tabular text-3xl font-semibold">{formatCents(monthlyCents)}<span className="text-base font-normal text-muted"> / month</span></div>
        <div className="mt-1 text-sm text-muted">{items.length} recurring charges found automatically</div>
      </div>
      <div className="card divide-y divide-border">
        {items.length === 0 && <p className="p-6 text-sm text-muted">Nothing yet. Charges show up here after they repeat 3 times.</p>}
        {items.map((r) => (
          <div key={r.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{r.merchant}</div>
              <div className="text-muted">{r.cadence} · {acctName[r.accountId] ?? ""} · next ~{formatDate(r.nextDate)}</div>
            </div>
            <div className="flex items-center gap-4">
              <span className="tabular">{formatCents(r.avgCents)}</span>
              <IgnoreButton itemKey={r.key} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
