import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { recategorize } from "@/lib/queries";

export async function PATCH(req: Request, ctx: RouteContext<"/api/transactions/[id]">) {
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { categoryId?: number; applyToMerchant?: boolean };
  if (!Number.isInteger(b.categoryId)) return NextResponse.json({ error: "Pick a category." }, { status: 400 });
  try {
    return NextResponse.json({ updated: recategorize(getDb(), id, b.categoryId!, !!b.applyToMerchant) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed." }, { status: 404 });
  }
}
