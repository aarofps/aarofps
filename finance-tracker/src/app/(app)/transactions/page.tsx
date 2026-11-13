import Link from "next/link";
import { getDb } from "@/db/client";
import { categoryMaps, listTransactions, PAGE_SIZE } from "@/lib/queries";
import { accounts } from "@/db/schema";
import { formatCents, formatDate } from "@/lib/format";
import { CategorySelect } from "@/components/CategorySelect";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const db = getDb();
  const filter = {
    q: one("q"), accountId: one("account"), categoryId: one("category") ? Number(one("category")) : undefined,
    from: one("from"), to: one("to"), page: Number(one("page") ?? 1),
  };
  const { rows, total } = listTransactions(db, filter);
  const cats = categoryMaps(db);
  const accts = db.select().from(accounts).orderBy(accounts.name).all();
  const acctName = Object.fromEntries(accts.map((a) => [a.id, a.name]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLink = (p: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    q.set("page", String(p));
    return `/transactions?${q}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Transactions</h1>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={filter.q} placeholder="Search merchant" className="input min-w-0 flex-1 basis-48" />
        <select name="account" defaultValue={filter.accountId ?? ""} className="input">
          <option value="">All accounts</option>
          {accts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select name="category" defaultValue={filter.categoryId ?? ""} className="input">
          <option value="">All categories</option>
          {cats.list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" name="from" defaultValue={filter.from} className="input" aria-label="From" />
        <input type="date" name="to" defaultValue={filter.to} className="input" aria-label="To" />
        <button className="btn">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-border">
              <th className="px-4 py-2 font-normal">Date</th><th className="px-4 py-2 font-normal">Merchant</th>
              <th className="px-4 py-2 font-normal">Account</th><th className="px-4 py-2 font-normal w-44">Category</th>
              <th className="px-4 py-2 text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">No transactions match.</td></tr>
            )}
            {rows.map((t) => (
              <tr key={t.id} className={`border-b border-border last:border-0 ${t.isTransfer ? "text-muted" : ""}`}>
                <td className="whitespace-nowrap px-4 py-2 text-muted">{formatDate(t.date)}</td>
                <td className="px-4 py-2">
                  {t.merchant}
                  {t.pending ? <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">pending</span> : null}
                  {t.isTransfer ? <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">transfer</span> : null}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-muted">{acctName[t.accountId] ?? "—"}</td>
                <td className="px-4 py-1"><CategorySelect txnId={t.id} merchant={t.merchant} value={t.categoryId} options={cats.list} /></td>
                <td className={`tabular whitespace-nowrap px-4 py-2 text-right ${t.amountCents < 0 ? "text-positive" : ""}`}>
                  {t.amountCents < 0 ? "+" : ""}{formatCents(Math.abs(t.amountCents))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{total} transactions</span>
        <div className="flex gap-2">
          {filter.page > 1 && <Link className="btn" href={pageLink(filter.page - 1)}>Newer</Link>}
          {filter.page < pages && <Link className="btn" href={pageLink(filter.page + 1)}>Older</Link>}
        </div>
      </div>
    </div>
  );
}
