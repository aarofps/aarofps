import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { runChat, type ChatTurn } from "@/lib/chat/run";
import { todayUtc } from "@/lib/money/dates";

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Add ANTHROPIC_API_KEY to .env.local and restart the app to use chat." }, { status: 400 });
  }
  const { messages } = (await req.json().catch(() => ({}))) as { messages?: ChatTurn[] };
  const history = (messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20);
  if (history.at(-1)?.role !== "user") return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  try {
    const reply = await runChat(getDb(), new Anthropic(), history, todayUtc());
    return NextResponse.json({ reply });
  } catch (e) {
    let msg = "Something went wrong talking to Claude.";
    if (e instanceof Anthropic.AuthenticationError) msg = "Your ANTHROPIC_API_KEY was rejected. Check it in .env.local.";
    else if (e instanceof Anthropic.RateLimitError) msg = "Rate limited by the API. Wait a minute and try again.";
    else if (e instanceof Anthropic.APIConnectionError) msg = "Couldn't reach the Claude API. Check your internet connection.";
    else if (e instanceof Anthropic.APIError) msg = `Claude API error ${e.status}: ${e.message}`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
