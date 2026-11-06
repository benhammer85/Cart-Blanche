"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { isAllowed } from "@/lib/env";

export type LoginState = { email: string; error?: string };

// Email + password sign-in. The two accounts are created once in the Supabase
// dashboard (Authentication → Users → Add user), so no emails are ever sent —
// which also works from the iPhone home-screen app.
export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { email, error: "Enter your email and password." };
  if (!isAllowed(email)) return { email, error: "This email isn’t on the household list." };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { email, error: "That email and password don’t match." };
  redirect("/list");
}
