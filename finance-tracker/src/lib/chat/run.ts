import type Anthropic from "@anthropic-ai/sdk";
import type { DB } from "@/db/client";
import { chatTools, runTool } from "./tools";

export const CHAT_MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 8;

export type ChatTurn = { role: "user" | "assistant"; content: string };
type CreateFn = (p: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.BetaMessage>;
export type ChatClient = { beta: { messages: { create: CreateFn } } };

function system(today: string) {
  return [
    "You answer questions about the user's own personal finances inside their private finance tracker.",
    "Use the tools to look up data and answer only from tool results; never guess numbers.",
    "Amounts are USD. Be brief and concrete. If the data can't answer the question, say so.",
    `Today is ${today}.`,
  ].join(" ");
}

/** Runs the tool loop and returns the assistant's final text. */
export async function runChat(db: DB, client: ChatClient, history: ChatTurn[], today: string): Promise<string> {
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await client.beta.messages.create({
      model: CHAT_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: system(today),
      tools: chatTools,
      messages,
    });
    if (res.stop_reason === "refusal") return "Sorry, I can't help with that one.";
    if (res.stop_reason !== "tool_use") {
      return res.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join("\n").trim()
        || "I couldn't come up with an answer.";
    }
    // Append the full content (keeps thinking blocks intact), then all tool results in one user message.
    messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const b of res.content) {
      if (b.type !== "tool_use") continue;
      try {
        const out = runTool(db, b.name, (b.input ?? {}) as Record<string, unknown>, today);
        results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out) });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: b.id, content: e instanceof Error ? e.message : "Tool failed", is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return "That question needed too many lookups. Try asking something narrower.";
}
