import { asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { creditScores } from "@/db/schema";
import { todayUtc } from "@/lib/money/dates";
import { CreditPanel } from "@/components/CreditPanel";

export const dynamic = "force-dynamic";

export default function CreditPage() {
  const scores = getDb().select().from(creditScores).orderBy(asc(creditScores.date), asc(creditScores.id)).all();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Credit score</h1>
      <CreditPanel scores={scores} today={todayUtc()} />
    </div>
  );
}
