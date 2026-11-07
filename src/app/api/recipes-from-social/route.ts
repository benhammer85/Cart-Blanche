import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { AiError, getAiProvider } from "@/lib/ai/provider";
import { UA } from "@/lib/import/fetchRecipe";
import { normalizeUrl } from "@/lib/data/recipes.shared";
import { cardsFromSearch } from "@/lib/import/searchCards";
import { buildFindPrompt, captionHasRecipe, captionPrompt, instagramCaption, parseCaptionAnswer, socialSite, tiktokOembed } from "@/lib/import/social";

export const maxDuration = 60;

/** The caption and account of a public TikTok or Instagram post, when the site shares them. */
async function readCaption(url: string): Promise<{ caption: string; creator: string | null } | null> {
  const site = socialSite(url);
  try {
    if (site === "tiktok") {
      const r = await fetch(tiktokOembed(url), { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      const j = (await r.json()) as { title?: string; author_name?: string; author_unique_id?: string };
      if (!j.title?.trim()) return null;
      return { caption: j.title.trim(), creator: j.author_name || j.author_unique_id || null };
    }
    if (site === "instagram") {
      const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      return instagramCaption(await r.text());
    }
  } catch {
    /* fall through */
  }
  return null;
}

// A TikTok/Instagram link, or a screenshot of one, → the full written recipe online.
export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  if (!(await getAuthUser(db))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const ai = getAiProvider();
  if (!ai) return NextResponse.json({ ok: false, error: "This needs the Gemini key." });

  const { url, image, mimeType } = (await request.json().catch(() => ({}))) as { url?: string; image?: string; mimeType?: string };
  if ((image?.length ?? 0) > 8_000_000) return NextResponse.json({ ok: false, error: "That image is too large." });

  let found: { caption: string; creator: string | null } | null = null;
  try {
    if (image) {
      await db.rpc("bump_ai_usage");
      found = parseCaptionAnswer(await ai.generateJson(captionPrompt(), { temperature: 0.1, images: [{ mimeType: mimeType || "image/jpeg", data: image }] }));
    } else if (url && socialSite(url)) {
      found = await readCaption(url);
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof AiError ? e.message : "Couldn’t read that." });
  }
  if (!found) return NextResponse.json({ ok: false, needScreenshot: true, error: "Couldn’t see the caption. Add a screenshot of the video or its caption." });

  const [{ data: recipes }, { data: syn }] = await Promise.all([
    db.from("recipes").select("source_url").eq("archived", false),
    db.from("synonyms").select("alias, canonical"),
  ]);
  const have = new Set(((recipes ?? []) as { source_url: string | null }[]).map((r) => r.source_url && normalizeUrl(r.source_url)).filter(Boolean) as string[]);
  const synonyms = Object.fromEntries(((syn ?? []) as { alias: string; canonical: string }[]).map((s) => [s.alias, s.canonical]));

  let cards: Awaited<ReturnType<typeof cardsFromSearch>> = [];
  try {
    await db.rpc("bump_ai_usage");
    const answer = await ai.searchWeb(buildFindPrompt({ ...found, site: image ? "screenshot" : socialSite(url!)! }));
    cards = await cardsFromSearch(answer, { have, synonyms, max: 5, tryPages: 8 });
  } catch (e) {
    if (!captionHasRecipe(found.caption)) return NextResponse.json({ ok: false, error: e instanceof AiError ? e.message : "Recipe search failed." });
  }
  return NextResponse.json({ ok: true, cards, caption: found.caption, creator: found.creator, captionIsRecipe: captionHasRecipe(found.caption) });
}
