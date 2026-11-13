"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncButton({ lastSyncLabel }: { lastSyncLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function sync() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/sync", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setMsg(body.error ?? "Sync failed.");
    router.refresh();
  }
  return (
    <div className="flex items-center gap-3 text-sm text-muted">
      <span>Synced {lastSyncLabel}</span>
      <button onClick={sync} disabled={busy} className="btn">{busy ? "Syncing…" : "Sync now"}</button>
      {msg && <span className="text-warning">{msg}</span>}
    </div>
  );
}
