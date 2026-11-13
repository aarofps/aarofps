import Link from "next/link";
import { getDb } from "@/db/client";
import { getHomeData, type AcctRow } from "@/lib/queries";
import { maybeAutoSync } from "@/lib/simplefin/sync";
import { RANGES, type Range } from "@/lib/money/networth";
import { todayUtc } from "@/lib/money/dates";
import { formatCents, formatPct, timeAgo } from "@/lib/format";
import { NetWorthChart } from "@/components/NetWorthChart";
import { SyncButton } from "@/components/SyncButton";
import { AlertsList } from "@/components/AlertsList";

export const dynamic = "force-dynamic";

const GROUPS = [
  ["cash", "Cash"], ["investment", "Investments"], ["credit", "Credit cards"], ["other", "Other"],
] as const;

function Group({ label, rows, negative }: { label: string; rows: AcctRow[]; negative?: boolean }) {
  if (rows.length === 0) return null;
  const total = rows.reduce((s, a) => s + a.balanceCents, 0);
  return (
    <div>
      <div className="flex justify-between py-2 text-sm font-medium">
        <span>{label}</span>
        <span className="tabular">{formatCents(negative ? -total : total)}</span>
      </div>
      <ul>
        {rows.map((a) => (
          <li key={a.id} className="flex justify-between py-1 text-sm text-muted">
            <span className="truncate pr-3">{a.name}</span>
            <span className="tabular">{formatCents(negative ? -a.balanceCents : a.balanceCents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const range: Range = RANGES.includes(sp.range as Range) ? (sp.range as Range) : "3M";
  const db = getDb();
  let syncError = "";
  try {
    if (process.env.ENCRYPTION_KEY) await maybeAutoSync(db, process.env.ENCRYPTION_KEY);
  } catch (e) {
    syncError = e instanceof Error ? e.message : String(e);
  }
  const d = getHomeData(db, todayUtc(), range);
  const up = d.change.deltaCents >= 0;
  const hasAccounts = Object.values(d.groups).some((g) => g.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-sm font-medium text-muted">Net worth</h1>
        {d.connected && <SyncButton lastSyncLabel={timeAgo(d.lastSync)} />}
      </div>

      {d.connectionErrors.map((c) => (
        <div key={c.id} className="rounded-lg border border-negative/40 bg-negative/10 px-4 py-3 text-sm">
          {c.institutionName} needs attention: {c.lastError}. Fix it on the SimpleFIN Bridge site, then sync.
        </div>
      ))}
      {syncError && <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">{syncError}</div>}

      <section className="card p-5">
        <div className="tabular text-4xl font-semibold tracking-tight">{formatCents(d.netWorthCents)}</div>
        {hasAccounts && d.series.length > 0 && (
          <div className={`mt-1 text-sm ${up ? "text-positive" : "text-negative"}`}>
            {up ? "▲" : "▼"} {formatCents(Math.abs(d.change.deltaCents))} {d.change.pct !== null && `(${formatPct(d.change.pct)})`}
            <span className="text-muted"> this month</span>
          </div>
        )}
        {!hasAccounts && (
          <p className="mt-2 text-sm text-muted">
            No accounts yet. <Link href="/settings" className="text-accent underline">Connect an account</Link> to get started.
          </p>
        )}
        {hasAccounts && <>
        <div className="mt-4 flex justify-end gap-1">
          {RANGES.map((r) => (
            <Link key={r} href={`/?range=${r}`}
              className={`rounded-md px-2.5 py-1 text-xs ${r === range ? "bg-surface-2 font-medium" : "text-muted hover:text-text"}`}>{r}</Link>
          ))}
        </div>
        <NetWorthChart series={d.series} />
        </>}
      </section>

      {d.budget.limitCents > 0 && (
        <Link href="/budget" className="card block p-4 text-sm hover:bg-surface-2">
          This month: <span className="tabular font-medium">{formatCents(d.budget.spentCents)}</span> of{" "}
          <span className="tabular">{formatCents(d.budget.limitCents)}</span> budget spent
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className={`h-full rounded-full ${d.budget.spentCents > d.budget.limitCents ? "bg-negative" : "bg-accent"}`}
              style={{ width: `${Math.min(100, (d.budget.spentCents / d.budget.limitCents) * 100)}%` }} />
          </div>
        </Link>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {hasAccounts && (
          <section className="card divide-y divide-border px-4 py-2">
            {GROUPS.map(([k, label]) => <Group key={k} label={label} rows={d.groups[k]} negative={k === "credit"} />)}
          </section>
        )}
        <AlertsList alerts={d.alerts} />
      </div>
    </div>
  );
}
