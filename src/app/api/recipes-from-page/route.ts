import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { AiError, getAiProvider } from "@/lib/ai/provider";
import { fetchPage, isPrivateHost } from "@/lib/import/fetchRecipe";
import { recipeFromHtml } from "@/lib/import/jsonld";
import { allJsonLdRecipes, buildPagePrompt, draftFromAi, inlineRecipeCount, mainText, photoAfterHeading, roundupLinks, siteName } from "@/lib/import/pageRecipes";

// Reads any recipe page: one recipe, several written out on the page, or a
// roundup of links. Returns { kind: "one" | "several" | "links" }.
//
// Either we load the page ({ url }), or the phone sends the page it already
// has open in Safari ({ html, url? }) via the share-sheet shortcut. The second
// way works for sites that turn apps away, because it's the user's own visit.

export const maxDuration = 60;

const aiSchema = z.object({
  recipes: z
    .array(
      z.object({
        title: z.string().min(1),
        servings: z.number().positive().nullable().optional(),
        prepMinutes: z.number().nonnegative().nullable().optional(),
        cookMinutes: z.number().nonnegative().nullable().optional(),
        ingredients: z.array(z.string().min(1)).min(1),
        steps: z.array(z.string().min(1)).default([]),
        notes: z.string().nullable().optional(),
      }),
    )
    .max(20),
});

export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  if (!(await getAuthUser(db))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { url?: string; html?: string };
  let html: string;
  let finalUrl: string;

  if (body.html) {
    if (body.html.length > 4_000_000) return NextResponse.json({ error: "That page is too large." }, { status: 413 });
    html = body.html;
    const fromPage =
      html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1];
    try {
      finalUrl = new URL(String(body.url || fromPage || "")).toString();
    } catch {
      finalUrl = "https://unknown.page/";
    }
    return read(html, finalUrl, db);
  }

  let target: URL;
  try {
    target = new URL(String(body.url ?? "").trim());
    if (!["http:", "https:"].includes(target.protocol) || isPrivateHost(target.hostname)) throw new Error();
  } catch {
    return NextResponse.json({ error: "That doesn’t look like a web address." }, { status: 400 });
  }
  finalUrl = target.toString();
  try {
    const res = await fetchPage(target);
    if (res.status === 403 || res.status === 401)
      return NextResponse.json({ error: "This site doesn’t let apps read it. Open the page in Safari and tap Share, then Send page to Cart Blanche (see Share button setup), or paste the recipe here.", blocked: true }, { status: 422 });
    if (!res.ok) return NextResponse.json({ error: `The site answered ${res.status}. Paste the recipe text instead.` }, { status: 422 });
    finalUrl = res.url || finalUrl;
    html = (await res.text()).slice(0, 3_000_000);
  } catch {
    return NextResponse.json({ error: "Couldn’t load that page." }, { status: 422 });
  }
  return read(html, finalUrl, db);
}

async function read(html: string, finalUrl: string, db: Awaited<ReturnType<typeof supabaseServer>>) {
  const { data: syn } = await db.from("synonyms").select("alias, canonical");
  const synonyms = Object.fromEntries((syn ?? []).map((s: { alias: string; canonical: string }) => [s.alias, s.canonical]));
  const site = siteName(html, finalUrl);

  // 1. Recipe data on the page (the usual case).
  const structured = allJsonLdRecipes(html, finalUrl, synonyms);
  if (structured.length > 1) return NextResponse.json({ kind: "several", site, recipes: structured });
  const one = structured[0] ?? recipeFromHtml(html, finalUrl, synonyms);
  if (one) return NextResponse.json({ kind: "one", recipe: one });

  // 2. Recipes written out on the page without recipe data.
  const text = mainText(html);
  // Discussion threads (Reddit) have recipes in posts and comments, not in headings.
  const discussion = /(^|\.)reddit\.com$/i.test(new URL(finalUrl).hostname);
  if (inlineRecipeCount(text) >= 1 || discussion) {
    const ai = getAiProvider();
    if (ai) {
      try {
        await db.rpc("bump_ai_usage");
        const raw = await ai.generateJson(buildPagePrompt(text, site, discussion), { temperature: 0.1 });
        const parsed = aiSchema.safeParse(JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim()));
        if (parsed.success && parsed.data.recipes.length) {
          const recipes = parsed.data.recipes.map((r) => draftFromAi(r, finalUrl, site, photoAfterHeading(html, r.title, finalUrl), synonyms));
          return recipes.length === 1 ? NextResponse.json({ kind: "one", recipe: recipes[0] }) : NextResponse.json({ kind: "several", site, recipes });
        }
      } catch (e) {
        if (e instanceof AiError && e.kind === "rate_limited") return NextResponse.json({ error: e.message }, { status: 422 });
        /* fall through to links */
      }
    }
  }

  if (discussion) return NextResponse.json({ error: "No complete recipe in that thread. Look for a post or comment that lists ingredients." }, { status: 422 });

  // 3. A roundup of links to recipes.
  const links = roundupLinks(html, finalUrl);
  if (links.length) return NextResponse.json({ kind: "links", site, links });

  return NextResponse.json({ error: "We couldn’t find a recipe on that page. Try pasting the recipe text instead." }, { status: 422 });
}
