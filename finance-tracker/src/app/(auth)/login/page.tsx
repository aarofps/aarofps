import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getSetting } from "@/lib/settings";
import { loginAction } from "../actions";
import { PasswordForm } from "../PasswordForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (!getSetting(getDb(), "password_hash")) redirect("/setup");
  return (
    <>
      <h1 className="text-xl font-semibold mb-4">Welcome back</h1>
      <PasswordForm action={loginAction} submitLabel="Unlock" />
    </>
  );
}
