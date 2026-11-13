import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { prefillMonth } from "@/lib/queries";
import { todayUtc } from "@/lib/money/dates";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { month?: string };
  if (!b.month || !/^\d{4}-\d{2}$/.test(b.month)) return NextResponse.json({ error: "Bad month" }, { status: 400 });
  prefillMonth(getDb(), b.month, todayUtc());
  return NextResponse.json({ ok: true });
}
