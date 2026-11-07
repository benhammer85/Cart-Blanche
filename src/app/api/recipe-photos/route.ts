import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { AiError, getAiProvider } from "@/lib/ai/provider";
import { scrubNames } from "@/lib/ai/aiPlanner";
import { fetchPage, isPrivateHost } from "@/lib/import/fetchRecipe";
import { pageImages, siteName } from "@/lib/import/pageRecipes";
import { isBlockedSite } from "@/lib/discover";

// Photo choices for a recipe: { source: true } reads the recipe's own page
// (free); { web: true } also searches recipe sites for the dish (one AI search).

export const maxDuration = 60;

interface Photo {
  image: string;
  site: string;
  page: string;
}

async function photosFrom(url: string): Promise<Photo[]> {
  try {
    const target = new URL(url);
    if (isPrivateHost(target.hostname)) return [];
    const res = await fetchPage(target, 9000);
    if (!res.ok) return [];
    const html = (await res.text()).slice(0, 2_000_000);
    const site = siteName(html, res.url || url);
    return pageImages(html, res.url || url).map((image) => ({ image, site, page: res.url || url }));
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  if (!(await getAuthUser(db))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { title, sourceUrl, web } = (await request.json().catch(() => ({}))) as { title?: string; sourceUrl?: string | null; web?: boolean };
  if (!title?.trim()) return NextResponse.json({ ok: false, error: "No recipe title." });

  const photos: Photo[] = sourceUrl ? await photosFrom(sourceUrl) : [];
  if (!web) return NextResponse.json({ ok: true, photos });

  const ai = getAiProvider();
  if (!ai) return NextResponse.json({ ok: true, photos, note: "Searching the web needs the Gemini key." });

  // Never send household names: "Molly's chili" → "family chili".
  const [{ data: people }, { data: members }] = await Promise.all([db.from("household_people").select("name, kind"), db.from("household_members").select("display_name")]);
  const ppl = (people ?? []) as { name: string; kind: string }[];
  const dish = scrubNames(title, ppl.filter((p) => p.kind === "kid").map((p) => p.name), [...ppl.filter((p) => p.kind === "adult").map((p) => p.name), ...((members ?? []) as { display_name: string }[]).map((m) => m.display_name)]);

  let pages: string[] = [];
  try {
    await db.rpc("bump_ai_usage");
    const answer = await ai.searchWeb(`Find 8 different recipe pages for "${dish}" on well-known recipe sites, each with a good photo of the finished dish. Reply with only the URLs, one per line.`);
    const listed = answer.text.match(/https?:\/\/[^\s"'<>)\]]+/g) ?? [];
    const grounded = await Promise.all(
      answer.sources.slice(0, 10).map(async (s) => {
        try {
          const r = await fetch(s.uri, { redirect: "manual", signal: AbortSignal.timeout(5000) });
          return r.headers.get("location") ?? s.uri;
        } catch {
          return null;
        }
      }),
    );
    pages = [...new Set([...listed, ...grounded.filter((u): u is string => !!u)])].filter((u) => !isBlockedSite(u) && !/vertexaisearch|google\./.test(u)).slice(0, 10);
  } catch (e) {
    return NextResponse.json({ ok: true, photos, note: e instanceof AiError ? e.message : "Couldn’t search right now." });
  }
  const found = (await Promise.all(pages.map(photosFrom))).map((p) => p[0]).filter(Boolean) as Photo[];
  const seen = new Set(photos.map((p) => p.image));
  for (const p of found) if (!seen.has(p.image)) (seen.add(p.image), photos.push(p));
  return NextResponse.json({ ok: true, photos: photos.slice(0, 12) });
}
