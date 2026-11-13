"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { txnId: string; merchant: string; value: number | null; options: { id: number; name: string }[] };

export function CategorySelect({ txnId, merchant, value, options }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(categoryId: number, applyToMerchant: boolean) {
    setBusy(true);
    await fetch(`/api/transactions/${encodeURIComponent(txnId)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, applyToMerchant }),
    });
    setBusy(false); setPending(null);
    router.refresh();
  }

  return (
    <div className="relative">
      <select aria-label="Category" value={pending ?? value ?? ""} disabled={busy}
        onChange={(e) => setPending(Number(e.target.value))}
        className="w-full rounded-md border border-transparent bg-transparent py-1 text-sm hover:border-border focus:border-accent">
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {pending !== null && pending !== value && (
        <div className="card absolute right-0 z-10 mt-1 w-64 p-3 text-sm shadow-lg">
          <p className="mb-2">Change to <b>{options.find((o) => o.id === pending)?.name}</b>?</p>
          <div className="flex flex-col gap-1.5">
            <button className="btn-primary" onClick={() => save(pending, true)}>Always for “{merchant}”</button>
            <button className="btn" onClick={() => save(pending, false)}>Just this one</button>
            <button className="text-muted hover:text-text" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
