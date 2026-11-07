import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { getMembershipFor } from "@/lib/household/ensure";
import { AiError, getAiProvider } from "@/lib/ai/provider";
import { scrubNames } from "@/lib/ai/aiPlanner";
import { buildDiscoverPrompt, buildTasteProfile, isBlockedSite, parseDiscoverAnswer, type DiscoverFilters } from "@/lib/discover";
import { fetchRecipePage } from "@/lib/import/fetchRecipe";
import { normalizeUrl } from "@/lib/data/recipes.shared";
import { ageOn } from "@/lib/list/buildList";

export const maxDuration = 60;

export interface DiscoverCard {
  url: string;
  title: string;
  site: string;
  image: string | null;
  prepMin: number | null;
  ingredientCount: number;
  why: string;
}

// Finds real recipes online that fit our taste (from recipes flagged in
// Crouton) and the filters, then reads each page so every card is a real recipe.
export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  const user = await getAuthUser(db);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const member = await getMembershipFor(user);
  const ai = getAiProvider();
  if (!ai || !member) return NextResponse.json({ ok: false, error: "Discover needs the Gemini key." });
  const filters = (await request.json().catch(() => ({}))) as DiscoverFilters;

  const [{ data: recipes }, { data: people }, { data: settings }, { data: syn }, { data: members }] = await Promise.all([
    db.from("recipes").select("title, tags, main_protein, kid_friendly, times_made, source_url, is_kid_meal").eq("archived", false),
    db.from("household_people").select("name, kind, birthdate"),
    db.from("household_settings").select("avoid_terms, bonus_tags").maybeSingle(),
    db.from("synonyms").select("alias, canonical"),
    db.from("household_members").select("display_name"),
  ]);
  type R = { title: string; tags: string[]; main_protein: string | null; kid_friendly: boolean; times_made: number; source_url: string | null; is_kid_meal: boolean };
  type P = { name: string; kind: string; birthdate: string | null };
  const ppl = (people ?? []) as P[];
  const kidNames = ppl.filter((p) => p.kind === "kid").map((p) => p.name);
  const adultNames = [...ppl.filter((p) => p.kind === "adult").map((p) => p.name), ...((members ?? []) as { display_name: string }[]).map((m) => m.display_name)];
  const scrub = (t: string) => scrubNames(t, kidNames, adultNames);
  const mine = ((recipes ?? []) as R[]).filter((r) => !r.is_kid_meal);

  const profile = buildTasteProfile(
    mine.map((r) => ({ ...r, title: scrub(r.title), tags: r.tags })),
    (settings?.bonus_tags as string[] | undefined) ?? [],
  );
  const prompt = buildDiscoverPrompt(
    profile,
    filters,
    ppl.filter((p) => p.kind === "kid" && p.birthdate).map((p) => ageOn(p.birthdate!)),
    (settings?.avoid_terms as string[] | undefined) ?? [],
    mine.map((r) => scrub(r.title)),
  );

  let answer;
  try {
    await db.rpc("bump_ai_usage");
    answer = await ai.searchWeb(prompt);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof AiError ? e.message : "Recipe search failed." });
  }

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
  const have = new Set(mine.map((r) => r.source_url && normalizeUrl(r.source_url)).filter(Boolean));
  const seen = new Set<string>();
  const candidates: { url: string; why: string; site: string }[] = [];
  for (const c of [...picks, ...grounded.filter(Boolean).map((url) => ({ url: url!, why: "", site: "", title: "" }))]) {
    const key = normalizeUrl(c.url);
    if (seen.has(key) || have.has(key) || isBlockedSite(c.url) || /vertexaisearch/.test(c.url)) continue;
    seen.add(key);
    candidates.push({ url: c.url, why: c.why, site: c.site });
  }

  const synonyms = Object.fromEntries(((syn ?? []) as { alias: string; canonical: string }[]).map((s) => [s.alias, s.canonical]));
  const pages = await Promise.all(
    candidates.slice(0, 14).map(async (c) => {
      try {
        const { recipe, finalUrl } = await fetchRecipePage(c.url, synonyms, 9000);
        if (!recipe || recipe.ingredients.length < 3) return null;
        if (have.has(normalizeUrl(finalUrl))) return null;
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
  const cards = pages.filter(Boolean).slice(0, 10) as DiscoverCard[];
  if (!cards.length) return NextResponse.json({ ok: false, error: "Didn’t find recipes we could open this time. Try again or change the filters." });
  return NextResponse.json({ ok: true, cards, basedOn: profile.favorites.slice(0, 5) });
}
