import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { ignoreRecurring } from "@/lib/queries";

export async function POST(req: Request) {
  const { key } = (await req.json().catch(() => ({}))) as { key?: string };
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });
  ignoreRecurring(getDb(), key);
  return NextResponse.json({ ok: true });
}
