import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { dismissAlert } from "@/lib/queries";

export async function DELETE(_: Request, ctx: RouteContext<"/api/alerts/[id]">) {
  const { id } = await ctx.params;
  dismissAlert(getDb(), Number(id));
  return NextResponse.json({ ok: true });
}
