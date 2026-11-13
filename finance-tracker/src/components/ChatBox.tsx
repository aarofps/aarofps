"use client";
import { useRef, useState } from "react";

type Turn = { role: "user" | "assistant"; content: string };
const EXAMPLES = ["How much did I spend on dining this month?", "What are my biggest subscriptions?", "Am I on track with my budget?", "How has my net worth changed this year?"];

export function ChatBox() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...turns, { role: "user" as const, content: q }];
    setTurns(next); setInput(""); setBusy(true); setError("");
    const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(body.error ?? "Something went wrong."); return; }
    setTurns([...next, { role: "assistant", content: body.reply }]);
    setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  return (
    <div className="flex flex-col gap-4">
      {turns.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((e) => <button key={e} className="btn text-left" onClick={() => ask(e)}>{e}</button>)}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {turns.map((t, i) => (
          <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm ${t.role === "user" ? "self-end bg-accent text-white" : "card self-start"}`}>
            {t.content}
          </div>
        ))}
        {busy && <div className="card self-start px-4 py-2.5 text-sm text-muted">Looking that up…</div>}
        {error && <p className="text-sm text-negative">{error}</p>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2">
        <input className="input flex-1" placeholder="Ask about your money…" value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} />
        <button className="btn-primary" disabled={busy || !input.trim()}>Ask</button>
      </form>
      <p className="text-xs text-muted">Answers come from Claude. Your question and the specific numbers it looks up are sent to Anthropic.</p>
    </div>
  );
}
