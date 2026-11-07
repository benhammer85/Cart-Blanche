import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { fetchPage, fetchRecipePage } from "@/lib/import/fetchRecipe";
import { roundupLinks } from "@/lib/import/pageRecipes";
import { normalizeUrl } from "@/lib/data/recipes.shared";
import { inferMealTypes } from "@/lib/infer";
import { interleave, shuffled, sourcesFor } from "@/lib/newRecipes";
import type { DiscoverCard } from "@/lib/import/searchCards";

export const maxDuration = 60;

// New dinners to try, straight from the trusted recipe sites we browse.
// No AI, so there's no daily limit.
export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  if (!(await getAuthUser(db))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { stores?: string[]; maxMinutes?: number | null; kidFriendly?: boolean };
  const stores = Array.isArray(body.stores) ? body.stores.filter((s): s is string => typeof s === "string").slice(0, 5) : [];
  const maxMinutes = typeof body.maxMinutes === "number" ? body.maxMinutes : null;

  const [{ data: saved }, { data: syn }, { data: settings }] = await Promise.all([
    db.from("recipes").select("source_url, title").eq("archived", false),
    db.from("synonyms").select("alias, canonical"),
    db.from("household_settings").select("avoid_terms").maybeSingle(),
  ]);
  const have = new Set(((saved ?? []) as { source_url: string | null }[]).map((r) => r.source_url && normalizeUrl(r.source_url)).filter(Boolean) as string[]);
  const synonyms = Object.fromEntries(((syn ?? []) as { alias: string; canonical: string }[]).map((s) => [s.alias, s.canonical]));
  const avoid = ((settings?.avoid_terms as string[] | undefined) ?? []).map((t) => t.toLowerCase()).filter(Boolean);

  // Recipe links from a few listing pages.
  const lists = await Promise.all(
    sourcesFor(stores, !!body.kidFriendly).map(async (u) => {
      try {
        const res = await fetchPage(new URL(u), 8000);
        return res.ok ? roundupLinks(await res.text(), res.url || u) : [];
      } catch {
        return [];
      }
    }),
  );
  const seen = new Set<string>();
  const links = interleave(lists.map((l) => shuffled(l))).filter((l) => {
    const k = normalizeUrl(l.url);
    if (seen.has(k) || have.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Open a handful and keep real dinners that fit.
  const pages = await Promise.all(
    links.slice(0, 16).map(async (l) => {
      try {
        const { recipe, finalUrl } = await fetchRecipePage(l.url, synonyms, 9000);
        if (!recipe || recipe.ingredients.length < 4 || recipe.steps.length < 2) return null;
        if (have.has(normalizeUrl(finalUrl))) return null;
        if (!inferMealTypes(recipe.title, recipe.tags).some((t) => t === "dinner" || t === "lunch")) return null;
        if (maxMinutes && recipe.prepMin != null && recipe.prepMin > maxMinutes) return null;
        const text = `${recipe.title} ${recipe.ingredients.map((i) => i.nameNorm).join(" ")}`.toLowerCase();
        if (avoid.some((a) => text.includes(a))) return null;
        const card: DiscoverCard = {
          url: finalUrl,
          title: recipe.title,
          site: recipe.sourceName || new URL(finalUrl).hostname.replace(/^www\./, ""),
          image: recipe.imageUrl ?? null,
          prepMin: recipe.prepMin,
          ingredientCount: recipe.ingredients.length,
          why: "",
        };
        return card;
      } catch {
        return null;
      }
    }),
  );
  const cards = (pages.filter(Boolean) as DiscoverCard[]).slice(0, 8);
  if (!cards.length) return NextResponse.json({ ok: false, error: "Couldn’t open any new recipes just now. Try again." });
  return NextResponse.json({ ok: true, cards });
}
