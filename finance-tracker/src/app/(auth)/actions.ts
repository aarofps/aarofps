"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getSetting, setSetting } from "@/lib/settings";
import {
  SESSION_COOKIE, SESSION_DAYS, createSession, hashPassword, sessionSecret, verifyPassword,
} from "@/lib/auth";

export type FormState = { error?: string };

async function startSession() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSession(sessionSecret()), {
    httpOnly: true, sameSite: "strict", path: "/", maxAge: SESSION_DAYS * 86400,
  });
}

export async function setupAction(_: FormState, form: FormData): Promise<FormState> {
  const db = getDb();
  if (getSetting(db, "password_hash")) return { error: "A password is already set. Log in instead." };
  const pw = String(form.get("password") ?? "");
  if (pw.length < 8) return { error: "Use at least 8 characters." };
  if (pw !== String(form.get("confirm") ?? "")) return { error: "Passwords don't match." };
  setSetting(db, "password_hash", await hashPassword(pw));
  await startSession();
  redirect("/");
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const stored = getSetting(getDb(), "password_hash");
  if (!stored) redirect("/setup");
  if (!(await verifyPassword(stored, String(form.get("password") ?? "")))) {
    return { error: "Wrong password." };
  }
  await startSession();
  redirect("/");
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
