// Helpers shared by the phone and the server.
export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}
