import "server-only";
import { recipeFromHtml } from "./jsonld";
import type { RecipeDraft } from "../types";

// The app says who it is. If a site turns it away, we tell the user and they
// can paste the recipe or use the share-sheet shortcut instead.
export const UA = "Mozilla/5.0 (compatible; CartBlanche/1.0; personal recipe import)";

/** GET a page as HTML. Returns the response even when it isn't OK. */
export function fetchPage(target: URL, timeoutMs = 12_000): Promise<Response> {
  return fetch(target, {
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
}

export function isPrivateHost(host: string): boolean {
  return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1)/.test(host);
}

/** Fetch a recipe page and read its schema.org Recipe data. */
export async function fetchRecipePage(url: string, synonyms: Record<string, string>, timeoutMs = 12_000): Promise<{ recipe: RecipeDraft | null; status: number; finalUrl: string }> {
  const target = new URL(url);
  if (!["http:", "https:"].includes(target.protocol) || isPrivateHost(target.hostname)) return { recipe: null, status: 400, finalUrl: url };
  const res = await fetchPage(target, timeoutMs);
  if (!res.ok) return { recipe: null, status: res.status, finalUrl: res.url || url };
  const html = (await res.text()).slice(0, 3_000_000);
  return { recipe: recipeFromHtml(html, res.url || url, synonyms), status: res.status, finalUrl: res.url || url };
}
