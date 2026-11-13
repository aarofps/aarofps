"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatCents } from "@/lib/format";

type Row = { categoryId: number; name: string; limitCents: number; spentCents: number; pct: number };
type Props = { month: string; rows: Row[]; unbudgeted: { categoryId: number; name: string; spentCents: number }[]; categories: { id: number; name: string }[] };

const barColor = (pct: number) => (pct > 1 ? "bg-negative" : pct >= 0.9 ? "bg-warning" : "bg-positive");

export function BudgetEditor({ month, rows, unbudgeted, categories }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    const d: Record<number, string> = {};
    for (const c of categories) {
      const r = rows.find((x) => x.categoryId === c.id);
      d[c.id] = r ? String(r.limitCents / 100) : "";
    }
    setDraft(d); setEditing(true);
  };
  async function save() {
    setBusy(true);
    const limits = categories.map((c) => ({ categoryId: c.id, limitCents: Math.round((Number(draft[c.id]) || 0) * 100) }));
    await fetch("/api/budgets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, limits }) });
    setBusy(false); setEditing(false); router.refresh();
  }
  async function prefill() {
    setBusy(true);
    await fetch("/api/budgets/prefill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month }) });
    setBusy(false); router.refresh();
  }

  if (editing) {
    return (
      <div className="card p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {categories.filter((c) => c.name !== "Income" && c.name !== "Transfer").map((c) => (
            <label key={c.id} className="flex items-center justify-between gap-3 text-sm">
              <span>{c.name}</span>
              <span className="flex items-center gap-1 text-muted">$
                <input inputMode="decimal" value={draft[c.id] ?? ""} placeholder="—"
                  onChange={(e) => setDraft({ ...draft, [c.id]: e.target.value.replace(/[^\d.]/g, "") })}
                  className="input w-28 text-right tabular" />
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={save} disabled={busy} className="btn-primary">Save</button>
          <button onClick={() => setEditing(false)} className="btn">Cancel</button>
        </div>
      </div>
    );
  }

  const totalLimit = rows.reduce((s, r) => s + r.limitCents, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spentCents, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <button onClick={startEdit} className="btn">Edit limits</button>
        <button onClick={prefill} disabled={busy} className="btn">Fill from last 3 months</button>
      </div>
      {rows.length === 0 ? (
        <div className="card p-6 text-sm text-muted">No budget for this month yet. Use “Fill from last 3 months” to start from your usual spending.</div>
      ) : (
        <div className="card divide-y divide-border">
          <div className="flex justify-between px-4 py-3 text-sm font-medium">
            <span>Total</span>
            <span className="tabular">{formatCents(totalSpent)} <span className="text-muted">of {formatCents(totalLimit)}</span></span>
          </div>
          {rows.map((r) => (
            <div key={r.categoryId} className="px-4 py-3">
              <div className="flex justify-between text-sm">
                <span>{r.name}</span>
                <span className="tabular">
                  {formatCents(r.spentCents)} <span className="text-muted">of {formatCents(r.limitCents)}</span>
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar"
                aria-valuenow={Math.round(r.pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${r.name} budget used`}>
                <div className={`h-full rounded-full ${barColor(r.pct)}`} style={{ width: `${Math.min(100, Math.max(0, r.pct * 100))}%` }} />
              </div>
              <div className="mt-1 text-xs text-muted">
                {r.pct > 1 ? `${formatCents(r.spentCents - r.limitCents)} over` : `${formatCents(r.limitCents - r.spentCents)} left`}
              </div>
            </div>
          ))}
        </div>
      )}
      {unbudgeted.length > 0 && (
        <div className="card p-4 text-sm">
          <div className="mb-2 text-muted">Spending without a budget</div>
          {unbudgeted.map((u) => (
            <div key={u.categoryId} className="flex justify-between py-1"><span>{u.name}</span><span className="tabular">{formatCents(u.spentCents)}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
