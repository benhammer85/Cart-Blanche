"use client";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { Button, TextField } from "@/components/ui";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, { email: "" } as LoginState);
  return (
    <form action={action} className="mt-10 space-y-3">
      {next && <input type="hidden" name="next" value={next} />}
      <TextField name="email" type="email" inputMode="email" autoComplete="username" placeholder="Email" defaultValue={state.email} autoFocus={!state.email} />
      <TextField name="password" type="password" autoComplete="current-password" placeholder="Password" autoFocus={!!state.email} />
      {state.error && <p className="text-[14px] text-[#d23c3c]">{state.error}</p>}
      <Button size="lg" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      
    </form>
  );
}
