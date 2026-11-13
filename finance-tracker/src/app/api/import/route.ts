import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { parseCsv, type CsvMapping } from "@/lib/csv";
import { importCsvRows } from "@/lib/imports";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const accountId = String(form.get("accountId") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a CSV file." }, { status: 400 });
  let mapping: CsvMapping;
  try { mapping = JSON.parse(String(form.get("mapping"))); } catch {
    return NextResponse.json({ error: "Pick which columns hold the date, description and amount." }, { status: 400 });
  }
  if (!mapping.date || !mapping.description || (!mapping.amount && !mapping.debit && !mapping.credit)) {
    return NextResponse.json({ error: "Pick which columns hold the date, description and amount." }, { status: 400 });
  }
  try {
    const rows = parseCsv(await file.text(), mapping);
    if (rows.length === 0) return NextResponse.json({ error: "No rows could be read with those columns." }, { status: 400 });
    return NextResponse.json(importCsvRows(getDb(), accountId, rows));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Import failed." }, { status: 400 });
  }
}
