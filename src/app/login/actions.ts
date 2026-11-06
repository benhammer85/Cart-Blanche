"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { isAllowed, siteUrl } from "@/lib/env";

export type LoginState = { step: "email" | "code"; email: string; error?: string; info?: string };

export async function login(state: LoginState, form: FormData): Promise<LoginState> {
  const intent = form.get("intent");
  if (intent === "reset") return { step: "email", email: state.email };
  if (intent === "verify") return verifyCode(state, form);
  return sendCode(state, form);
}

async function sendCode(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email) return { step: "email", email, error: "Enter your email." };
  if (!isAllowed(email)) return { step: "email", email, error: "This email isn’t on the household list." };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${siteUrl()}/auth/confirm` },
  });
  if (error) return { step: "email", email, error: error.message };
  return { step: "code", email, info: "Check your email. Type the code here, or tap the link." };
}

async function verifyCode(state: LoginState, form: FormData): Promise<LoginState> {
  const token = String(form.get("code") ?? "").replace(/\s/g, "");
  const email = state.email;
  if (!isAllowed(email)) return { step: "email", email, error: "This email isn’t on the household list." };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { ...state, error: "That code didn’t work. Check it or send a new one." };
  redirect("/list");
}
