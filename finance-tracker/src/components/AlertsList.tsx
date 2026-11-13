"use client";
import { useRouter } from "next/navigation";

type Alert = { id: number; type: string; message: string };

export function AlertsList({ alerts }: { alerts: Alert[] }) {
  const router = useRouter();
  if (alerts.length === 0) return null;
  async function dismiss(id: number) {
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    router.refresh();
  }
  return (
    <section className="card p-4">
      <h2 className="mb-2 text-sm font-medium text-muted">Alerts</h2>
      <ul className="divide-y divide-border">
        {alerts.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 py-2 text-sm">
            <span>
              <span className={`mr-2 inline-block h-2 w-2 rounded-full ${a.type.startsWith("budget_100") || a.type === "sync_error" || a.type === "reauth" ? "bg-negative" : "bg-warning"}`} aria-hidden />
              {a.message}
            </span>
            <button onClick={() => dismiss(a.id)} className="text-muted hover:text-text" aria-label="Dismiss">✕</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
