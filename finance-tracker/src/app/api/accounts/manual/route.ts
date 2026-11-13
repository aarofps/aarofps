import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { upsertManualAccount } from "@/lib/imports";

const KINDS = ["cash", "credit", "investment", "other"] as const;

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { id?: string; name?: string; kind?: string; balanceCents?: number };
  if (!b.name?.trim() || !KINDS.includes(b.kind as (typeof KINDS)[number]) || !Number.isInteger(b.balanceCents)) {
    return NextResponse.json({ error: "Give the account a name, a type and a balance." }, { status: 400 });
  }
  const id = upsertManualAccount(getDb(), {
    id: b.id, name: b.name.trim(), kind: b.kind as (typeof KINDS)[number], balanceCents: b.balanceCents!,
  });
  return NextResponse.json({ id });
}
