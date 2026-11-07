import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { recipeFromHtml } from "@/lib/import/jsonld";
import { fetchPage } from "@/lib/import/fetchRecipe";

// Fetches a recipe page server-side and extracts schema.org Recipe JSON-LD.
export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  const user = await getAuthUser(db);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { url } = (await request.json().catch(() => ({}))) as { url?: string };
  let target: URL;
  try {
    target = new URL(String(url ?? "").trim());
    if (!["http:", "https:"].includes(target.protocol)) throw new Error();
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1)/.test(target.hostname)) throw new Error();
  } catch {
    return NextResponse.json({ error: "That doesn’t look like a web address." }, { status: 400 });
  }

  let html: string;
  try {
    const res = await fetchPage(target);
    if (res.status === 403 || res.status === 401)
      return NextResponse.json({ error: "This site blocks apps from reading its recipes. Open the page, select all, copy, and paste it here instead (or paste a screenshot).", blocked: true }, { status: 422 });
    if (!res.ok) return NextResponse.json({ error: `The site answered ${res.status}. Paste the recipe text instead.` }, { status: 422 });
    html = (await res.text()).slice(0, 3_000_000);
  } catch {
    return NextResponse.json({ error: "Couldn’t load that page." }, { status: 422 });
  }

  const { data: syn } = await db.from("synonyms").select("alias, canonical");
  const synonyms = Object.fromEntries((syn ?? []).map((s: { alias: string; canonical: string }) => [s.alias, s.canonical]));
  const recipe = recipeFromHtml(html, target.toString(), synonyms);
  if (!recipe) {
    return NextResponse.json(
      { error: "We couldn’t pull a recipe from that page. Try pasting the recipe text instead." },
      { status: 422 },
    );
  }
  return NextResponse.json({ recipe });
}
