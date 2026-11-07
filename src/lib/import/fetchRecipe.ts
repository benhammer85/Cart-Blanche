import "server-only";
import { recipeFromHtml } from "./jsonld";
import type { RecipeDraft } from "../types";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export function isPrivateHost(host: string): boolean {
  return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1)/.test(host);
}

/** Fetch a recipe page and read its schema.org Recipe data. */
export async function fetchRecipePage(url: string, synonyms: Record<string, string>, timeoutMs = 12_000): Promise<{ recipe: RecipeDraft | null; status: number; finalUrl: string }> {
  const target = new URL(url);
  if (!["http:", "https:"].includes(target.protocol) || isPrivateHost(target.hostname)) return { recipe: null, status: 400, finalUrl: url };
  const res = await fetch(target, {
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) return { recipe: null, status: res.status, finalUrl: res.url || url };
  const html = (await res.text()).slice(0, 3_000_000);
  return { recipe: recipeFromHtml(html, res.url || url, synonyms), status: res.status, finalUrl: res.url || url };
}
