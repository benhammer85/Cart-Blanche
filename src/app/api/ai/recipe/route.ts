import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { AiError, getAiProvider } from "@/lib/ai/provider";

// Turns pasted page text or a screenshot of a recipe (e.g. from traderjoes.com,
// which blocks apps from reading its pages) into a clean recipe.

const schema = z.object({
  title: z.string().min(1),
  servings: z.number().positive().nullable().optional(),
  prepMinutes: z.number().nonnegative().nullable().optional(),
  cookMinutes: z.number().nonnegative().nullable().optional(),
  ingredients: z.array(z.string().min(1)).min(1),
  steps: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string()).default([]),
  source: z.string().nullable().optional(),
});

const PROMPT = `Extract the recipe from this content (pasted web page text or a screenshot).
Ignore navigation, ads, product promos, comments and anything that isn't the recipe.
Keep ingredient lines as a shopper would read them, with amounts (e.g. "1 cup Trader Joe's Harvest Grains Blend").
Steps: one string per step, without numbering.
Reply with JSON only:
{"title":"","servings":4,"prepMinutes":15,"cookMinutes":20,"ingredients":[""],"steps":[""],"tags":[""],"source":"site or brand name if shown"}`;

export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  if (!(await getAuthUser(db))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const ai = getAiProvider();
  if (!ai) return NextResponse.json({ ok: false, error: "Recipe reading isn’t set up yet (needs the Gemini key)." });

  const { text, image, mimeType } = (await request.json()) as { text?: string; image?: string; mimeType?: string };
  if (!text?.trim() && !image) return NextResponse.json({ ok: false, error: "Nothing to read." });
  if ((text?.length ?? 0) > 60_000 || (image?.length ?? 0) > 8_000_000) return NextResponse.json({ ok: false, error: "That’s too long to read." });

  try {
    await db.rpc("bump_ai_usage");
    const raw = await ai.generateJson(text ? `${PROMPT}\n\nCONTENT:\n${text}` : PROMPT, {
      temperature: 0.1,
      images: image ? [{ mimeType: mimeType || "image/jpeg", data: image }] : undefined,
    });
    const parsed = schema.safeParse(JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim()));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Couldn’t find a recipe in that." });
    return NextResponse.json({ ok: true, recipe: parsed.data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof AiError ? e.message : "Couldn’t read that." });
  }
}
