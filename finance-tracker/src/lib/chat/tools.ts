import type Anthropic from "@anthropic-ai/sdk";
import type { DB } from "@/db/client";
import { goals } from "@/db/schema";
import { formatCents } from "../money/cents";
import { netWorthOf, RANGES, type Range } from "../money/networth";
import { spendingByCategory } from "../money/transfers";
import { goalProgress } from "../goals";
import { categoryMaps, getBudgetPage, getHomeData, listTransactions, toTxn, visibleAccounts } from "../queries";
import { transactions } from "@/db/schema";
import { and, gte, lte } from "drizzle-orm";

const date = { type: "string", description: "Date as YYYY-MM-DD" } as const;

export const chatTools: Anthropic.Beta.BetaTool[] = [
  {
    name: "spending_by_category",
    description: "Net spending per category between two dates (inclusive). Excludes transfers, card payments, pending and income. Refunds reduce totals.",
    input_schema: { type: "object", properties: { from: date, to: date }, required: ["from", "to"], additionalProperties: false },
  },
  {
    name: "search_transactions",
    description: "Find individual transactions. All filters optional. Positive amounts are money spent, negative are money received. Returns at most 50, newest first, plus the total match count.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to match in the merchant name" },
        from: date, to: date,
        categoryName: { type: "string", description: "Exact category name, e.g. Dining" },
        limit: { type: "integer", description: "Max results (1-50)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "account_balances",
    description: "Current balance of every visible account and the current net worth.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "net_worth_history",
    description: "Net worth over time for a range, sampled weekly, with the change over the range.",
    input_schema: { type: "object", properties: { range: { type: "string", enum: [...RANGES] } }, required: ["range"], additionalProperties: false },
  },
  {
    name: "budget_status",
    description: "Budget limits and spending per category for a month.",
    input_schema: { type: "object", properties: { month: { type: "string", description: "YYYY-MM" } }, required: ["month"], additionalProperties: false },
  },
  {
    name: "goals",
    description: "Savings goals with target, progress and target date.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function runTool(db: DB, name: string, input: Record<string, unknown>, today: string): unknown {
  const cats = categoryMaps(db);
  switch (name) {
    case "spending_by_category": {
      const from = isDate(input.from) ? input.from : today.slice(0, 8) + "01";
      const to = isDate(input.to) ? input.to : today;
      const rows = db.select().from(transactions).where(and(gte(transactions.date, from), lte(transactions.date, to))).all();
      const m = spendingByCategory(rows.map(toTxn), from, to, cats.idByName.Income);
      return [...m].sort((a, b) => b[1] - a[1]).map(([id, c]) => ({ category: cats.nameById[id] ?? "Other", spent: formatCents(c) }));
    }
    case "search_transactions": {
      const limit = Math.min(50, Math.max(1, Number(input.limit) || 50));
      const categoryId = typeof input.categoryName === "string" ? cats.idByName[input.categoryName] : undefined;
      const { rows, total } = listTransactions(db, {
        q: typeof input.query === "string" ? input.query : undefined,
        from: isDate(input.from) ? input.from : undefined, to: isDate(input.to) ? input.to : undefined, categoryId,
      });
      return {
        total,
        results: rows.slice(0, limit).map((t) => ({
          date: t.date, merchant: t.merchant, amount: formatCents(t.amountCents),
          category: t.categoryId ? cats.nameById[t.categoryId] : null, pending: !!t.pending, transfer: !!t.isTransfer,
        })),
      };
    }
    case "account_balances": {
      const accts = visibleAccounts(db);
      return {
        netWorth: formatCents(netWorthOf(accts)),
        accounts: accts.map((a) => ({
          name: a.name, type: a.kind,
          balance: a.kind === "credit" ? `${formatCents(a.balanceCents)} owed` : formatCents(a.balanceCents),
        })),
      };
    }
    case "net_worth_history": {
      const range: Range = RANGES.includes(input.range as Range) ? (input.range as Range) : "3M";
      const d = getHomeData(db, today, range);
      const points = d.series.filter((_, i, arr) => i % 7 === 0 || i === arr.length - 1);
      const first = d.series[0]?.cents ?? 0, last = d.series.at(-1)?.cents ?? 0;
      return { change: formatCents(last - first), points: points.map((p) => ({ date: p.date, netWorth: formatCents(p.cents) })) };
    }
    case "budget_status": {
      const month = typeof input.month === "string" && /^\d{4}-\d{2}$/.test(input.month) ? input.month : today.slice(0, 7);
      const b = getBudgetPage(db, month);
      return {
        budgeted: b.rows.map((r) => ({ category: r.name, limit: formatCents(r.limitCents), spent: formatCents(r.spentCents), percentUsed: Math.round(r.pct * 100) })),
        unbudgetedSpending: b.unbudgeted.map((u) => ({ category: u.name, spent: formatCents(u.spentCents) })),
      };
    }
    case "goals": {
      const accts = new Map(visibleAccounts(db).map((a) => [a.id, a]));
      return db.select().from(goals).all().map((g) => {
        const p = goalProgress(g, g.accountId ? accts.get(g.accountId)?.balanceCents ?? null : null);
        return { name: g.name, target: formatCents(g.targetCents), saved: formatCents(p.currentCents), percent: Math.round(p.pct * 100), targetDate: g.targetDate };
      });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
