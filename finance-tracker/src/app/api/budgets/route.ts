import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { saveBudgets } from "@/lib/queries";

export async function PUT(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { month?: string; limits?: { categoryId: number; limitCents: number }[] };
  if (!b.month || !/^\d{4}-\d{2}$/.test(b.month) || !Array.isArray(b.limits)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const limits = b.limits.filter((l) => Number.isInteger(l.categoryId) && Number.isInteger(l.limitCents));
  saveBudgets(getDb(), b.month, limits);
  return NextResponse.json({ ok: true });
}
