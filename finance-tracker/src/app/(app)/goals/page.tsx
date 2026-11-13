import { getDb } from "@/db/client";
import { accounts, goals } from "@/db/schema";
import { goalProgress } from "@/lib/goals";
import { GoalsBoard } from "@/components/GoalsBoard";

export const dynamic = "force-dynamic";

export default function GoalsPage() {
  const db = getDb();
  const accts = db.select().from(accounts).all();
  const byId = new Map(accts.map((a) => [a.id, a]));
  const rows = db.select().from(goals).all().map((g) => {
    const a = g.accountId ? byId.get(g.accountId) : undefined;
    return { ...g, ...goalProgress(g, a?.balanceCents ?? null), accountName: a?.name ?? null };
  });
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Goals</h1>
      <GoalsBoard goals={rows} accounts={accts.filter((a) => a.kind !== "credit" && !a.hidden).map((a) => ({ id: a.id, name: a.name }))} />
    </div>
  );
}
