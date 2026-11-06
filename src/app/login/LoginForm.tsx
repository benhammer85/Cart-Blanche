"use client";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { Button, TextField } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, { step: "email", email: "" } as LoginState);

  if (state.step === "code") {
    return (
      <form action={action} className="mt-10 space-y-3" key="code">
        <p className="text-[15px] text-muted">
          {state.info} Sent to <span className="font-medium text-ink">{state.email}</span>.
        </p>
        <TextField name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="Code from the email" autoFocus className="text-center text-2xl tracking-[0.3em]" />
        {state.error && <p className="text-[14px] text-[#d23c3c]">{state.error}</p>}
        <Button size="lg" className="w-full" name="intent" value="verify" disabled={pending}>
          {pending ? "Checking…" : "Sign in"}
        </Button>
        <button name="intent" value="reset" className="w-full py-2 text-[15px] text-accent">
          Use a different email
        </button>
      </form>
    );
  }
  return (
    <form action={action} className="mt-10 space-y-3" key="email">
      <TextField name="email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" defaultValue={state.email} autoFocus />
      {state.error && <p className="text-[14px] text-[#d23c3c]">{state.error}</p>}
      <Button size="lg" className="w-full" name="intent" value="send" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in code"}
      </Button>
      <p className="pt-2 text-center text-[13px] text-muted">Only our household’s emails can sign in.</p>
    </form>
  );
}
