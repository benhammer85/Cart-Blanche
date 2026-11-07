// Turns a web-search answer into recipe cards we can actually open.
import "server-only";
import { isBlockedSite, parseDiscoverAnswer } from "@/lib/discover";
import { fetchRecipePage } from "@/lib/import/fetchRecipe";
import { normalizeUrl } from "@/lib/data/recipes.shared";
import type { AiSearchResult } from "@/lib/ai/provider";

export interface DiscoverCard {
  url: string;
  title: string;
  site: string;
  image: string | null;
  prepMin: number | null;
  ingredientCount: number;
  why: string;
}

export async function cardsFromSearch(
  answer: AiSearchResult,
  opts: { have: Set<string>; synonyms: Record<string, string>; max?: number; tryPages?: number },
): Promise<DiscoverCard[]> {
  // Candidate pages: the links in the answer, plus the pages Google grounded on.
  const picks = parseDiscoverAnswer(answer.text);
  const grounded = await Promise.all(
    answer.sources.slice(0, 12).map(async (s) => {
      try {
        const r = await fetch(s.uri, { redirect: "manual", signal: AbortSignal.timeout(5000) });
        return r.headers.get("location") ?? s.uri;
      } catch {
        return null;
      }
    }),
  );
  const seen = new Set<string>();
  const candidates: { url: string; why: string; site: string }[] = [];
  for (const c of [...picks, ...grounded.filter(Boolean).map((url) => ({ url: url!, why: "", site: "", title: "" }))]) {
    const key = normalizeUrl(c.url);
    if (seen.has(key) || opts.have.has(key) || isBlockedSite(c.url) || /vertexaisearch/.test(c.url)) continue;
    seen.add(key);
    candidates.push({ url: c.url, why: c.why, site: c.site });
  }

  const pages = await Promise.all(
    candidates.slice(0, opts.tryPages ?? 14).map(async (c) => {
      try {
        const { recipe, finalUrl } = await fetchRecipePage(c.url, opts.synonyms, 9000);
        if (!recipe || recipe.ingredients.length < 3) return null;
        if (opts.have.has(normalizeUrl(finalUrl))) return null;
        const card: DiscoverCard = {
          url: finalUrl,
          title: recipe.title,
          site: c.site || recipe.sourceName || new URL(finalUrl).hostname.replace(/^www\./, ""),
          image: recipe.imageUrl ?? null,
          prepMin: recipe.prepMin,
          ingredientCount: recipe.ingredients.length,
          why: c.why,
        };
        return card;
      } catch {
        return null;
      }
    }),
  );
  return (pages.filter(Boolean) as DiscoverCard[]).slice(0, opts.max ?? 10);
}
