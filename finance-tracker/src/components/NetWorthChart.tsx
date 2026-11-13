"use client";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCents, formatDate } from "@/lib/format";

type Point = { date: string; cents: number; estimated: boolean };

export function NetWorthChart({ series }: { series: Point[] }) {
  if (series.length < 2) {
    return <div className="grid h-56 place-items-center text-sm text-muted">The chart fills in after a couple of days of data.</div>;
  }
  const data = series.map((p) => ({ ...p, dollars: p.cents / 100 }));
  return (
    <div className="h-56" role="img" aria-label="Net worth over time">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "var(--muted)", fontSize: 12 }}
            axisLine={false} tickLine={false} minTickGap={48} />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Point;
              return (
                <div className="card px-3 py-2 text-sm shadow-sm">
                  <div className="text-muted">{formatDate(p.date)}{p.estimated ? " · estimated" : ""}</div>
                  <div className="tabular font-medium">{formatCents(p.cents)}</div>
                </div>
              );
            }}
          />
          <Area type="monotone" dataKey="dollars" stroke="var(--accent)" strokeWidth={2} fill="url(#nw)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
