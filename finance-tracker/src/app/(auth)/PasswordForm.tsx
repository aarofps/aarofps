"use client";
import { useActionState } from "react";
import type { FormState } from "./actions";

type Props = {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  confirm?: boolean;
  submitLabel: string;
};

export function PasswordForm({ action, confirm, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input name="password" type="password" placeholder="Password" required autoFocus className="input" />
      {confirm && <input name="confirm" type="password" placeholder="Confirm password" required className="input" />}
      {state.error && <p className="text-sm text-negative">{state.error}</p>}
      <button disabled={pending} className="btn-primary">{pending ? "…" : submitLabel}</button>
    </form>
  );
}
