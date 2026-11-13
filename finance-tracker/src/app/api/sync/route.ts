import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { encryptionKey } from "@/lib/crypto";
import { makeFetcher, manualSyncWaitMinutes, syncAll } from "@/lib/simplefin/sync";

export async function POST() {
  const db = getDb();
  const fetcher = makeFetcher(db, encryptionKey());
  if (!fetcher) return NextResponse.json({ error: "Connect SimpleFIN in Settings first." }, { status: 400 });
  const wait = manualSyncWaitMinutes(db, new Date());
  if (wait > 0) {
    return NextResponse.json({ error: `Synced recently. Try again in ${wait} min (SimpleFIN allows ~24 syncs a day).` }, { status: 429 });
  }
  return NextResponse.json(await syncAll(db, fetcher));
}
