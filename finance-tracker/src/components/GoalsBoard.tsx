"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatCents, formatDate } from "@/lib/format";

type Goal = {
  id: number; name: string; targetCents: number; targetDate: string | null; accountId: string | null;
  earmarkedCents: number; manualCents: number; currentCents: number; pct: number; accountName: string | null;
};
type Props = { goals: Goal[]; accounts: { id: string; name: string }[] };
type Draft = { id?: number; name: string; target: string; date: string; accountId: string; amount: string };

const empty: Draft = { name: "", target: "", date: "", accountId: "", amount: "" };
const cents = (s: string) => Math.round((Number(s) || 0) * 100);

export function GoalsBoard({ goals, accounts }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");

  async function save() {
    if (!draft) return;
    const body = {
      id: draft.id, name: draft.name, targetCents: cents(draft.target), targetDate: draft.date || null,
      accountId: draft.accountId || null,
      earmarkedCents: draft.accountId ? cents(draft.amount) : 0, manualCents: draft.accountId ? 0 : cents(draft.amount),
    };
    const res = await fetch("/api/goals", { method: draft.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { setError((await res.json()).error); return; }
    setDraft(null); setError(""); router.refresh();
  }
  async function remove(id: number) {
    if (!confirm("Delete this goal?")) return;
    await fetch(`/api/goals?id=${id}`, { method: "DELETE" });
    router.refresh();
  }
  const edit = (g: Goal) => setDraft({
    id: g.id, name: g.name, target: String(g.targetCents / 100), date: g.targetDate ?? "", accountId: g.accountId ?? "",
    amount: String((g.accountId ? g.earmarkedCents : g.manualCents) / 100),
  });

  return (
    <div className="flex flex-col gap-4">
      {!draft && <button className="btn self-start" onClick={() => setDraft(empty)}>New goal</button>}
      {draft && (
        <div className="card grid gap-3 p-4 sm:grid-cols-2">
          <input className="input" placeholder="Goal name (e.g. Emergency fund)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="input" inputMode="decimal" placeholder="Target amount ($)" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
          <label className="text-sm text-muted">Target date (optional)
            <input type="date" className="input mt-1 w-full" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          </label>
          <label className="text-sm text-muted">Linked account (optional)
            <select className="input mt-1 w-full" value={draft.accountId} onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}>
              <option value="">None — I'll track it myself</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <input className="input sm:col-span-2" inputMode="decimal"
            placeholder={draft.accountId ? "How much of that account is set aside for this goal ($)" : "How much you've saved so far ($)"}
            value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
          {error && <p className="text-sm text-negative sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" onClick={save}>Save</button>
            <button className="btn" onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
          </div>
        </div>
      )}
      {goals.length === 0 && !draft && <div className="card p-6 text-sm text-muted">No goals yet.</div>}
      <div className="grid gap-4 md:grid-cols-2">
        {goals.map((g) => (
          <div key={g.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{g.name}</div>
                <div className="text-xs text-muted">
                  {g.accountName ? `From ${g.accountName}` : "Tracked manually"}{g.targetDate ? ` · by ${formatDate(g.targetDate)}, ${g.targetDate.slice(0, 4)}` : ""}
                </div>
              </div>
              <div className="flex gap-3 text-xs text-muted">
                <button className="hover:text-text" onClick={() => edit(g)}>Edit</button>
                <button className="hover:text-text" onClick={() => remove(g.id)}>Delete</button>
              </div>
            </div>
            <div className="mt-3 tabular text-sm">{formatCents(g.currentCents)} <span className="text-muted">of {formatCents(g.targetCents)}</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(g.pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.name} progress`}>
              <div className="h-full rounded-full bg-accent" style={{ width: `${g.pct * 100}%` }} />
            </div>
            <div className="mt-1 text-xs text-muted">{Math.round(g.pct * 100)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}
