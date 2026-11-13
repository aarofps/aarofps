"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate } from "@/lib/format";

type Score = { id: number; date: string; score: number; source: string };

export function CreditPanel({ scores, today }: { scores: Score[]; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [score, setScore] = useState("");
  const [source, setSource] = useState("CreditWise");
  const [error, setError] = useState("");
  const latest = scores.at(-1);
  const prev = scores.at(-2);

  async function add() {
    const res = await fetch("/api/credit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, score: Number(score), source }) });
    if (!res.ok) { setError((await res.json()).error); return; }
    setScore(""); setError(""); router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        {latest ? (
          <>
            <div className="tabular text-4xl font-semibold">{latest.score}</div>
            <div className="mt-1 text-sm text-muted">
              {latest.source} · {formatDate(latest.date)}
              {prev && <span className={latest.score >= prev.score ? "text-positive" : "text-negative"}> · {latest.score >= prev.score ? "▲" : "▼"} {Math.abs(latest.score - prev.score)} since last</span>}
            </div>
          </>
        ) : <p className="text-sm text-muted">No scores yet. Check CreditWise (Capital One) or Discover's free FICO score and add it below each month.</p>}
        {scores.length >= 2 && (
          <div className="mt-4 h-48" role="img" aria-label="Credit score over time">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scores} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis domain={["dataMin - 10", "dataMax + 10"]} width={36} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ stroke: "var(--border)" }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as Score;
                  return <div className="card px-3 py-2 text-sm"><div className="text-muted">{formatDate(p.date)} · {p.source}</div><div className="tabular font-medium">{p.score}</div></div>;
                }} />
                <Line dataKey="score" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="card flex flex-wrap items-end gap-2 p-4">
        <label className="text-sm text-muted">Date<input type="date" className="input mt-1 block" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="text-sm text-muted">Score<input inputMode="numeric" className="input mt-1 block w-24" value={score} placeholder="720" onChange={(e) => setScore(e.target.value.replace(/\D/g, ""))} /></label>
        <label className="text-sm text-muted">Source<input className="input mt-1 block w-36" value={source} onChange={(e) => setSource(e.target.value)} /></label>
        <button className="btn-primary" onClick={add}>Add score</button>
        {error && <p className="w-full text-sm text-negative">{error}</p>}
      </div>
    </div>
  );
}
