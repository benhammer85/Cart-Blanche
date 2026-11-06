import "server-only";

export interface AllowedUser {
  email: string;
  name: string;
}

/** ALLOWED_EMAILS="ben@x.com=Ben,molly@y.com=Molly" */
export function allowedUsers(): AllowedUser[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [email, name] = entry.split("=").map((x) => x.trim());
      const local = email.split("@")[0];
      return { email: email.toLowerCase(), name: name || local.charAt(0).toUpperCase() + local.slice(1) };
    });
}

export function isAllowed(email: string | null | undefined): AllowedUser | null {
  if (!email) return null;
  return allowedUsers().find((u) => u.email === email.toLowerCase()) ?? null;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
