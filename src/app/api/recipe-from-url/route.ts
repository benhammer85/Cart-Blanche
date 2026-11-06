import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { recipeFromHtml } from "@/lib/import/jsonld";

// Fetches a recipe page server-side and extracts schema.org Recipe JSON-LD.
export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
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
    const res = await fetch(target, {
      headers: {
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: `The site answered ${res.status}. Try the Claude bridge or paste the recipe.` }, { status: 422 });
    html = (await res.text()).slice(0, 3_000_000);
  } catch {
    return NextResponse.json({ error: "Couldn’t load that page." }, { status: 422 });
  }

  const { data: syn } = await db.from("synonyms").select("alias, canonical");
  const synonyms = Object.fromEntries((syn ?? []).map((s: { alias: string; canonical: string }) => [s.alias, s.canonical]));
  const recipe = recipeFromHtml(html, target.toString(), synonyms);
  if (!recipe) {
    return NextResponse.json(
      { error: "This page doesn’t include recipe data we can read. Paste the recipe as text, or ask Claude to turn it into JSON with the Claude bridge." },
      { status: 422 },
    );
  }
  return NextResponse.json({ recipe });
}
