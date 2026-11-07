import { redirect } from "next/navigation";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { ensureMembership } from "@/lib/household/ensure";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/login");
  const membership = await ensureMembership(user);
  if (!membership) {
    await supabase.auth.signOut();
    redirect("/login");
  }
  return <AppShell membership={membership}>{children}</AppShell>;
}
