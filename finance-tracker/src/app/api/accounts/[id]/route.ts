import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { updateAccount } from "@/lib/settingsOps";
import type { Kind } from "@/lib/money/networth";

export async function PATCH(req: Request, ctx: RouteContext<"/api/accounts/[id]">) {
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { kind?: Kind; hidden?: boolean };
  try {
    updateAccount(getDb(), decodeURIComponent(id), b);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save." }, { status: 400 });
  }
}
