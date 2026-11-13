"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Papa from "papaparse";
import { formatCents } from "@/lib/format";

type Json = Record<string, unknown>;
async function send(url: string, method: string, body?: Json | FormData): Promise<{ ok: boolean; data: Json }> {
  const res = await fetch(url, {
    method,
    headers: body instanceof FormData || !body ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}
const toCents = (s: string) => Math.round((Number(s.replace(/[$,]/g, "")) || 0) * 100);
const KINDS = [["cash", "Cash"], ["credit", "Credit card"], ["investment", "Investment"], ["other", "Other"]] as const;

function Section({ title, children, hint }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-medium">{title}</h2>
      {hint && <div className="mt-1 text-sm text-muted">{hint}</div>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

type Conn = { id: string; institutionName: string; status: string; lastError: string | null };

export function SimplefinPanel({ connected, connections }: { connected: boolean; connections: Conn[] }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [replacing, setReplacing] = useState(false);

  async function connect() {
    setBusy(true); setMsg(null);
    const { ok, data } = await send("/api/simplefin/connect", "POST", { setupToken: token });
    setBusy(false);
    if (ok) {
      const r = data.result as { accounts: number; added: number };
      setMsg({ ok: true, text: `Connected. Found ${r.accounts} accounts and ${r.added} transactions.` });
      setToken(""); setReplacing(false); router.refresh();
    } else setMsg({ ok: false, text: String(data.error) });
  }
  async function disconnect() {
    if (!confirm("Disconnect SimpleFIN? Your existing data stays; syncing stops.")) return;
    await send("/api/simplefin/connect", "DELETE");
    router.refresh();
  }

  return (
    <Section title="Bank connection (SimpleFIN)" hint={connected ? "Syncs automatically when you open the app (at most every 12 hours)." : undefined}>
      {connected && !replacing ? (
        <div className="flex flex-col gap-3">
          <ul className="divide-y divide-border text-sm">
            {connections.length === 0 && <li className="py-2 text-muted">Connected. No banks reported yet.</li>}
            {connections.map((c) => (
              <li key={c.id} className="flex justify-between gap-3 py-2">
                <span>{c.institutionName}</span>
                <span className={c.status === "ok" ? "text-positive" : "text-negative"}>{c.status === "ok" ? "OK" : c.lastError ?? "Needs attention"}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setReplacing(true)}>Replace token</button>
            <button className="btn" onClick={disconnect}>Disconnect</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>Sign up at the SimpleFIN Bridge site (beta-bridge.simplefin.org), about $1.50/month.</li>
            <li>Link Capital One, Discover, Bank of America and Schwab there.</li>
            <li>Create a <b>setup token</b> for a new app and paste it here. It works once.</li>
          </ol>
          <textarea value={token} onChange={(e) => setToken(e.target.value)} rows={3} placeholder="Paste setup token"
            className="input font-mono text-xs" />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy || !token.trim()} onClick={connect}>{busy ? "Connecting… (can take a minute)" : "Connect"}</button>
            {replacing && <button className="btn" onClick={() => setReplacing(false)}>Cancel</button>}
          </div>
        </div>
      )}
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-positive" : "text-negative"}`}>{msg.text}</p>}
    </Section>
  );
}

type Acct = { id: string; name: string; kind: string; source: string; balanceCents: number; hidden: number };

export function AccountsPanel({ accounts }: { accounts: Acct[] }) {
  const router = useRouter();
  const [editBal, setEditBal] = useState<Record<string, string>>({});
  const patch = async (id: string, body: Json) => { await send(`/api/accounts/${encodeURIComponent(id)}`, "PATCH", body); router.refresh(); };
  const saveBalance = async (a: Acct) => {
    await send("/api/accounts/manual", "POST", { id: a.id, name: a.name, kind: a.kind, balanceCents: toCents(editBal[a.id]) });
    setEditBal({ ...editBal, [a.id]: "" }); router.refresh();
  };
  return (
    <Section title="Accounts" hint="Fix an account's type if it was guessed wrong. Hidden accounts are left out of net worth.">
      {accounts.length === 0 ? <p className="text-sm text-muted">No accounts yet.</p> : (
        <ul className="divide-y divide-border text-sm">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className={`min-w-0 ${a.hidden ? "text-muted line-through" : ""}`}>
                <div className="truncate">{a.name}</div>
                <div className="text-xs text-muted">{a.source === "manual" ? "Manual" : a.source === "csv" ? "CSV" : "SimpleFIN"} · {formatCents(a.balanceCents)}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {a.source === "manual" && (
                  <span className="flex items-center gap-1">
                    <input className="input w-28" placeholder="New balance" value={editBal[a.id] ?? ""} inputMode="decimal"
                      onChange={(e) => setEditBal({ ...editBal, [a.id]: e.target.value })} />
                    {editBal[a.id] && <button className="btn" onClick={() => saveBalance(a)}>Save</button>}
                  </span>
                )}
                <select className="input" value={a.kind} aria-label={`${a.name} type`} onChange={(e) => patch(a.id, { kind: e.target.value })}>
                  {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button className="btn" onClick={() => patch(a.id, { hidden: !a.hidden })}>{a.hidden ? "Show" : "Hide"}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function ManualAccountPanel() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("investment");
  const [bal, setBal] = useState("");
  const [err, setErr] = useState("");
  async function add() {
    const { ok, data } = await send("/api/accounts/manual", "POST", { name, kind, balanceCents: toCents(bal) });
    if (!ok) { setErr(String(data.error)); return; }
    setName(""); setBal(""); setErr(""); router.refresh();
  }
  return (
    <Section title="Add a manual account" hint="For anything SimpleFIN can't reach, like a Roth IRA. Update its balance whenever you check it.">
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-0 flex-1 basis-40" placeholder="Name (e.g. Schwab Roth IRA)" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input className="input w-32" placeholder="Balance ($)" inputMode="decimal" value={bal} onChange={(e) => setBal(e.target.value)} />
        <button className="btn-primary" onClick={add}>Add</button>
      </div>
      {err && <p className="mt-2 text-sm text-negative">{err}</p>}
    </Section>
  );
}

export function CsvImportPanel({ accounts }: { accounts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<string[][]>([]);
  const [map, setMap] = useState({ date: "", description: "", amount: "", debit: "", credit: "", invert: false });
  const [accountId, setAccountId] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function pick(f: File | null) {
    setFile(f); setMsg(null);
    if (!f) return;
    Papa.parse<string[]>(f, {
      preview: 6, skipEmptyLines: true,
      complete: (r) => {
        const [h = [], ...rows] = r.data;
        const hs = h.map((x) => x.trim());
        setHeaders(hs); setPreview(rows);
        const find = (re: RegExp) => hs.find((x) => re.test(x.toLowerCase())) ?? "";
        setMap({ date: find(/date/), description: find(/desc|merchant|payee|name/), amount: find(/^amount$/),
          debit: find(/debit/), credit: find(/credit/), invert: false });
      },
    });
  }
  async function run() {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file); fd.set("accountId", accountId);
    const m = map.amount ? { date: map.date, description: map.description, amount: map.amount, invert: map.invert }
      : { date: map.date, description: map.description, debit: map.debit || undefined, credit: map.credit || undefined };
    fd.set("mapping", JSON.stringify(m));
    const { ok, data } = await send("/api/import", "POST", fd);
    setMsg(ok ? { ok: true, text: `Imported ${data.inserted} transactions (${data.skipped} already there).` } : { ok: false, text: String(data.error) });
    if (ok) router.refresh();
  }
  const col = (k: "date" | "description" | "amount" | "debit" | "credit", label: string) => (
    <label className="text-sm text-muted">{label}
      <select className="input mt-1 block w-full" value={map[k]} onChange={(e) => setMap({ ...map, [k]: e.target.value })}>
        <option value="">—</option>
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </label>
  );
  return (
    <Section title="Import a CSV" hint="Download transactions from your bank's website and drop the file here. Importing the same file twice won't duplicate anything.">
      <div className="flex flex-col gap-3">
        <input type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0] ?? null)} className="text-sm" />
        {headers.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead><tr>{headers.map((h) => <th key={h} className="border-b border-border px-2 py-1 text-left font-medium">{h}</th>)}</tr></thead>
                <tbody>{preview.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-2 py-1 text-muted">{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {col("date", "Date column")}{col("description", "Description column")}{col("amount", "Amount column")}
              {!map.amount && <>{col("debit", "Debit column")}{col("credit", "Credit column")}</>}
            </div>
            {map.amount && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={map.invert} onChange={(e) => setMap({ ...map, invert: e.target.checked })} />
                Positive amounts are purchases (common on credit card exports)
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Import into account…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button className="btn-primary" disabled={!accountId} onClick={run}>Import</button>
            </div>
          </>
        )}
        {msg && <p className={`text-sm ${msg.ok ? "text-positive" : "text-negative"}`}>{msg.text}</p>}
      </div>
    </Section>
  );
}

export function PreferencesPanel({ largeTxnCents, lowCashCents }: { largeTxnCents: number; lowCashCents: number }) {
  const [large, setLarge] = useState(String(largeTxnCents / 100));
  const [low, setLow] = useState(String(lowCashCents / 100));
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(body: Json) {
    const { ok, data } = await send("/api/settings", "PUT", body);
    setMsg(ok ? { ok: true, text: "Saved." } : { ok: false, text: String(data.error) });
    if (ok) { setCur(""); setNext(""); }
  }
  return (
    <Section title="Alerts & password">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-muted">Alert on charges over ($)<input className="input mt-1 block w-32" inputMode="decimal" value={large} onChange={(e) => setLarge(e.target.value)} /></label>
        <label className="text-sm text-muted">Alert when cash is under ($)<input className="input mt-1 block w-32" inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} /></label>
        <button className="btn" onClick={() => save({ largeTxnCents: toCents(large), lowCashCents: toCents(low) })}>Save alerts</button>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <input type="password" className="input" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} />
        <input type="password" className="input" placeholder="New password" value={next} onChange={(e) => setNext(e.target.value)} />
        <button className="btn" disabled={!cur || !next} onClick={() => save({ currentPassword: cur, newPassword: next })}>Change password</button>
      </div>
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-positive" : "text-negative"}`}>{msg.text}</p>}
    </Section>
  );
}
