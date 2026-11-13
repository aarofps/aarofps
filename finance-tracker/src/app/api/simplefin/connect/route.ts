import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { encrypt, encryptionKey } from "@/lib/crypto";
import { claimSetupToken } from "@/lib/simplefin/client";
import { ACCESS_URL_KEY, makeFetcher, syncAll } from "@/lib/simplefin/sync";
import { deleteSetting, setSetting } from "@/lib/settings";

export async function POST(req: Request) {
  const { setupToken } = (await req.json().catch(() => ({}))) as { setupToken?: string };
  if (!setupToken?.trim()) return NextResponse.json({ error: "Paste your setup token first." }, { status: 400 });
  const db = getDb();
  try {
    const accessUrl = await claimSetupToken(setupToken);
    setSetting(db, ACCESS_URL_KEY, encrypt(accessUrl, encryptionKey()));
    deleteSetting(db, "last_sync_attempt");
    const result = await syncAll(db, makeFetcher(db, encryptionKey())!);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't connect." }, { status: 400 });
  }
}

export async function DELETE() {
  const db = getDb();
  deleteSetting(db, ACCESS_URL_KEY);
  return NextResponse.json({ ok: true });
}
