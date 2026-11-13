import { describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { accounts, transactions, budgets } from "@/db/schema";
import { chatTools, runTool } from "@/lib/chat/tools";
import { runChat, type ChatClient } from "@/lib/chat/run";

const now = "2026-11-13T00:00:00Z";
function db() {
  const d = getDb(":memory:");
  d.insert(accounts).values({ id: "a", name: "Card", kind: "credit", source: "simplefin", balanceCents: 5000, updatedAt: now }).run();
  for (let i = 0; i < 60; i++) {
    d.insert(transactions).values({ id: `t${i}`, externalId: `t${i}`, accountId: "a", date: "2026-11-02", amountCents: 1000, merchant: i % 2 ? "CHIPOTLE" : "TARGET", categoryId: i % 2 ? 2 : 4, source: "simplefin" }).run();
  }
  d.insert(budgets).values({ categoryId: 2, month: "2026-11", limitCents: 20000 }).run();
  return d;
}

describe("chat tools", () => {
  it("defines strict tools with names", () => {
    expect(chatTools.map((t) => t.name).sort()).toEqual(
      ["account_balances", "budget_status", "goals", "net_worth_history", "search_transactions", "spending_by_category"]);
  });
  it("spending_by_category returns names and dollar strings", () => {
    const r = runTool(db(), "spending_by_category", { from: "2026-11-01", to: "2026-11-30" }, "2026-11-13") as { category: string; spent: string }[];
    expect(r).toContainEqual({ category: "Dining", spent: "$300.00" });
  });
  it("search_transactions caps results at 50", () => {
    const r = runTool(db(), "search_transactions", { limit: 500 }, "2026-11-13") as { results: unknown[]; total: number };
    expect(r.results).toHaveLength(50);
    expect(r.total).toBe(60);
  });
  it("account_balances shows card balances as owed", () => {
    expect(runTool(db(), "account_balances", {}, "2026-11-13")).toEqual({
      netWorth: "-$50.00", accounts: [{ name: "Card", type: "credit", balance: "$50.00 owed" }],
    });
  });
  it("throws on an unknown tool", () => {
    expect(() => runTool(db(), "drop_tables", {}, "2026-11-13")).toThrow(/Unknown tool/);
  });
});

describe("runChat", () => {
  it("runs requested tools and returns the final text", async () => {
    const calls: unknown[] = [];
    const replies = [
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "u1", name: "budget_status", input: { month: "2026-11" } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "You've spent $300 of $200 on Dining." }] },
    ];
    const client: ChatClient = { beta: { messages: { create: async (p: unknown) => { calls.push(p); return replies.shift() as never; } } } };
    const text = await runChat(db(), client, [{ role: "user", content: "How's my dining budget?" }], "2026-11-13");
    expect(text).toBe("You've spent $300 of $200 on Dining.");
    const second = calls[1] as { messages: { role: string; content: { type: string; content?: string }[] }[] };
    const toolResult = second.messages.at(-1)!.content[0];
    expect(toolResult.type).toBe("tool_result");
    expect(toolResult.content).toContain("Dining");
  });
  it("explains a refusal instead of crashing", async () => {
    const client: ChatClient = { beta: { messages: { create: async () => ({ stop_reason: "refusal", content: [] }) as never } } };
    expect(await runChat(db(), client, [{ role: "user", content: "x" }], "2026-11-13")).toMatch(/can't help/);
  });
});
