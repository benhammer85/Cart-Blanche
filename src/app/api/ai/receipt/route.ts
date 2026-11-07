import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { AiError, getAiProvider } from "@/lib/ai/provider";
import { RECEIPT_PROMPT, buildReceiptPrompt } from "@/lib/receipts";

// Reads a store receipt (Costco PDF, a photo of a paper receipt, or an
// Instacart order screenshot) and returns the grocery items on it.

export const maxDuration = 60;

const schema = z.object({
  store: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        size: z.string().optional().nullable(),
        category: z.string().optional().nullable(),
        signature: z.boolean().optional().nullable(),
      }),
    )
    .max(250),
});

const TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"]);

export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  const user = await getAuthUser(db);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const ai = getAiProvider();
  if (!ai) return NextResponse.json({ ok: false, error: "Reading receipts needs the Gemini key." });

  const { file, mimeType, categories } = (await request.json()) as { file?: string; mimeType?: string; categories?: unknown };
  const names = Array.isArray(categories) ? categories.filter((c): c is string => typeof c === "string").map((c) => c.slice(0, 40)).slice(0, 40) : [];
  const type = mimeType && TYPES.has(mimeType) ? mimeType : "image/jpeg";
  if (!file) return NextResponse.json({ ok: false, error: "No file." });
  if (file.length > 4_300_000) return NextResponse.json({ ok: false, error: "That file is too large. Try a screenshot of the item list instead." });

  try {
    await db.rpc("bump_ai_usage");
    const text = await ai.generateJson(names.length ? buildReceiptPrompt(names) : RECEIPT_PROMPT, { temperature: 0.1, images: [{ mimeType: type, data: file }] });
    const parsed = schema.safeParse(JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim()));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Couldn’t find items on that receipt." });
    return NextResponse.json({ ok: true, store: parsed.data.store ?? null, items: parsed.data.items });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof AiError ? e.message : "Couldn’t read that receipt." });
  }
}
