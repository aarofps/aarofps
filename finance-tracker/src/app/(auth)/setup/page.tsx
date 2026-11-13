import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getSetting } from "@/lib/settings";
import { setupAction } from "../actions";
import { PasswordForm } from "../PasswordForm";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (getSetting(getDb(), "password_hash")) redirect("/login");
  return (
    <>
      <h1 className="text-xl font-semibold mb-1">Set a password</h1>
      <p className="text-sm text-muted mb-4">Only you will use this app. This password locks it.</p>
      <PasswordForm action={setupAction} confirm submitLabel="Save password" />
    </>
  );
}
