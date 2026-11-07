import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { AiError, getAiProvider } from "@/lib/ai/provider";

// Reads a screenshot of a shopping list (e.g. an Instacart cart) and returns
// the grocery items as plain lines like "2 lb chicken thighs".

const schema = z.object({
  items: z.array(z.object({ name: z.string().min(1), quantity: z.string().optional().nullable() })).max(150),
});

const PROMPT = `This is a screenshot of a grocery cart or shopping list (often from Instacart).
List every grocery item you can see. For each, give a short plain name a shopper would write
(drop brand names unless they matter, e.g. "Greek yogurt" not "Fage Total 0% Greek Yogurt 32 oz"),
and the quantity/size if shown (e.g. "2", "1 lb", "32 oz").
Ignore prices, buttons, ads, "frequently bought together", substitutions and totals.
Reply with JSON only: {"items":[{"name":"","quantity":""}]}`;

export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const ai = getAiProvider();
  if (!ai) return NextResponse.json({ ok: false, error: "Screenshot reading isn’t set up yet (needs the Gemini key)." });

  const { image, mimeType } = (await request.json()) as { image?: string; mimeType?: string };
  if (!image || image.length > 6_000_000) return NextResponse.json({ ok: false, error: "That image is too large." });

  try {
    await db.rpc("bump_ai_usage");
    const text = await ai.generateJson(PROMPT, { temperature: 0.1, images: [{ mimeType: mimeType || "image/jpeg", data: image }] });
    const parsed = schema.safeParse(JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim()));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Couldn’t read a list from that picture." });
    const lines = parsed.data.items.map((i) => `${i.quantity && /\d/.test(i.quantity) ? `${i.quantity} ` : ""}${i.name}`.trim());
    return NextResponse.json({ ok: true, lines });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof AiError ? e.message : "Couldn’t read that picture." });
  }
}
