import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes cookies instead.
        }
      },
    },
  });
}

/**
 * The signed-in user from the session's JWT. With Supabase's signing keys this
 * is verified locally (no round trip to the auth server), which keeps every
 * tab switch fast.
 */
export async function getAuthUser(db?: Awaited<ReturnType<typeof supabaseServer>>): Promise<{ id: string; email: string | null } | null> {
  const client = db ?? (await supabaseServer());
  const { data } = await client.auth.getClaims();
  const c = data?.claims;
  return c?.sub ? { id: c.sub, email: (c.email as string | undefined) ?? null } : null;
}
