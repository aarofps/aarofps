import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { changePassword, saveThresholds } from "@/lib/settingsOps";

export async function PUT(req: Request) {
  const b = (await req.json().catch(() => ({}))) as {
    largeTxnCents?: number; lowCashCents?: number; currentPassword?: string; newPassword?: string;
  };
  const db = getDb();
  try {
    if (b.largeTxnCents !== undefined || b.lowCashCents !== undefined) {
      saveThresholds(db, { largeTxnCents: Number(b.largeTxnCents), lowCashCents: Number(b.lowCashCents) });
    }
    if (b.newPassword !== undefined) await changePassword(db, b.currentPassword ?? "", b.newPassword);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save." }, { status: 400 });
  }
}
