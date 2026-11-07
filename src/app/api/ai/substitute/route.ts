import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { AiError, getAiProvider } from "@/lib/ai/provider";

// Swaps for an ingredient we don't have built in. Only the ingredient and dish go out.
export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  if (!(await getAuthUser(db))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const ai = getAiProvider();
  if (!ai) return NextResponse.json({ ok: false, error: "This needs the Gemini key." });
  const { name, dish } = (await request.json().catch(() => ({}))) as { name?: string; dish?: string };
  const item = String(name ?? "").trim().slice(0, 80);
  if (!item) return NextResponse.json({ ok: false, error: "Nothing to look up." });
  const prompt = `A home cook in the US can't find "${item}" at the grocery store${dish ? ` for "${String(dish).slice(0, 80)}"` : ""}.
Give up to 3 practical substitutes found at a regular US supermarket, best first, each with the amount to use if it differs.
Each under 12 words. If it can simply be left out, say so as one option.
Reply with JSON only: {"options":["",""]}`;
  try {
    await db.rpc("bump_ai_usage");
    const raw = await ai.generateJson(prompt, { temperature: 0.2 });
    const j = JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim()) as { options?: unknown };
    const options = (Array.isArray(j.options) ? j.options : []).filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 3);
    if (!options.length) return NextResponse.json({ ok: false, error: "No good swap found." });
    return NextResponse.json({ ok: true, options });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof AiError ? e.message : "Couldn’t look that up." });
  }
}
