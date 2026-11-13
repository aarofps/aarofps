import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { goals } from "@/db/schema";

type Body = { id?: number; name?: string; targetCents?: number; targetDate?: string | null; accountId?: string | null; earmarkedCents?: number; manualCents?: number };

function clean(b: Body) {
  if (!b.name?.trim() || !Number.isInteger(b.targetCents) || b.targetCents! <= 0) return null;
  return {
    name: b.name.trim(), targetCents: b.targetCents!,
    targetDate: b.targetDate && /^\d{4}-\d{2}-\d{2}$/.test(b.targetDate) ? b.targetDate : null,
    accountId: b.accountId || null,
    earmarkedCents: Math.max(0, Math.round(b.earmarkedCents ?? 0)),
    manualCents: Math.max(0, Math.round(b.manualCents ?? 0)),
  };
}

export async function POST(req: Request) {
  const v = clean(await req.json().catch(() => ({})));
  if (!v) return NextResponse.json({ error: "Give the goal a name and a target amount." }, { status: 400 });
  getDb().insert(goals).values(v).run();
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Body;
  const v = clean(b);
  if (!v || !Number.isInteger(b.id)) return NextResponse.json({ error: "Give the goal a name and a target amount." }, { status: 400 });
  getDb().update(goals).set(v).where(eq(goals.id, b.id!)).run();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  getDb().delete(goals).where(eq(goals.id, id)).run();
  return NextResponse.json({ ok: true });
}
