import { getDb } from "@/db/client";
import { categoryMaps, getBudgetPage } from "@/lib/queries";
import { todayUtc } from "@/lib/money/dates";
import { BudgetEditor } from "@/components/BudgetEditor";
import { MonthPicker, parseMonth } from "@/components/MonthPicker";

export const dynamic = "force-dynamic";

export default async function BudgetPage({ searchParams }: PageProps<"/budget">) {
  const month = parseMonth((await searchParams).month, todayUtc().slice(0, 7));
  const db = getDb();
  const { rows, unbudgeted } = getBudgetPage(db, month);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Budget</h1>
        <MonthPicker month={month} base="/budget" />
      </div>
      <BudgetEditor key={month} month={month} rows={rows} unbudgeted={unbudgeted} categories={categoryMaps(db).list} />
    </div>
  );
}
