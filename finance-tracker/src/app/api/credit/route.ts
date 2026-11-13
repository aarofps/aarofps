import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { creditScores } from "@/db/schema";
import { validScore } from "@/lib/goals";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { date?: string; score?: number; source?: string };
  if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !validScore(Number(b.score))) {
    return NextResponse.json({ error: "Enter a date and a score between 300 and 850." }, { status: 400 });
  }
  getDb().insert(creditScores).values({ date: b.date, score: Number(b.score), source: b.source?.trim() || "Manual" }).run();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  getDb().delete(creditScores).where(eq(creditScores.id, Number(new URL(req.url).searchParams.get("id")))).run();
  return NextResponse.json({ ok: true });
}
