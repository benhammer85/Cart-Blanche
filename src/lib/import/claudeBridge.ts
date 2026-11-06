// Copy-paste bridge to the Claude app (no API). We build a prompt; the user
// pastes Claude's JSON reply back and we validate it here.
import { z } from "zod";
import { formatAmount } from "../units";
import { normalizeName } from "../normalize";
import type { RecipeDraft } from "../types";
import { inferMainProtein, inferMealTypes } from "../infer";

const num = z.union([z.number(), z.string().regex(/^\s*\d+(\.\d+)?\s*$/).transform(Number)]);

export const claudeRecipeSchema = z.object({
  title: z.string().trim().min(1, "Every recipe needs a title"),
  servings: num.pipe(z.number().positive()).default(4),
  prepMinutes: num.pipe(z.number().nonnegative()).nullable().optional(),
  tags: z.array(z.string()).default([]),
  ingredients: z
    .array(
      z.object({
        qty: num.nullable().optional(),
        unit: z.string().nullable().optional().default(""),
        name: z.string().trim().min(1, "Ingredient without a name"),
      }),
    )
    .min(1, "Recipe has no ingredients"),
  steps: z.array(z.string()).default([]),
  kidNote: z.string().optional().default(""),
});

export const claudeReplySchema = z.object({
  recipes: z.array(claudeRecipeSchema).min(1, "No recipes in the reply"),
});

export type ClaudeReply = z.infer<typeof claudeReplySchema>;

/** Pull the JSON object out of a reply that may include ```json fences or chatter. */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Couldn’t find any JSON in what you pasted.");
  return body
    .slice(start, end + 1)
    .replace(/[“”]/g, '"')
    .replace(/,\s*([}\]])/g, "$1"); // tolerate trailing commas
}

export type BridgeResult = { ok: true; recipes: RecipeDraft[] } | { ok: false; errors: string[] };

export function parseClaudeReply(text: string, synonyms: Record<string, string> = {}): BridgeResult {
  let data: unknown;
  try {
    data = JSON.parse(extractJson(text));
  } catch (e) {
    return { ok: false, errors: [e instanceof Error && e.message.startsWith("Couldn") ? e.message : "That isn’t valid JSON. Copy Claude’s whole reply and try again."] };
  }
  const parsed = claudeReplySchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.slice(0, 6).map((i) => {
        const where = i.path.length ? ` (at ${i.path.join(" › ")})` : "";
        return `${i.message}${where}`;
      }),
    };
  }
  return {
    ok: true,
    recipes: parsed.data.recipes.map((r) => {
      const ingredients = r.ingredients.map((i) => {
        const qty = i.qty ?? null;
        const unit = (i.unit ?? "").trim() || (qty != null ? "each" : null);
        const nameNorm = normalizeName(i.name, synonyms);
        return {
          raw: `${formatAmount(qty, unit)} ${i.name}`.trim(),
          qty,
          qtyMax: null,
          unit,
          name: i.name,
          nameNorm,
          note: null,
          ok: true,
        };
      });
      const tags = Array.from(new Set([...r.tags.map((t) => t.trim()).filter(Boolean), "from Claude"]));
      return {
        title: r.title,
        servings: r.servings,
        prepMin: r.prepMinutes ?? null,
        cookMin: null,
        steps: r.steps.filter((s) => s.trim()).map((text) => ({ text: text.trim() })),
        notes: r.kidNote ? `Kids: ${r.kidNote}` : null,
        sourceUrl: null,
        sourceName: "Claude",
        tags,
        mealTypes: inferMealTypes(r.title, tags),
        mainProtein: inferMainProtein(r.title, ingredients.map((i) => i.nameNorm)),
        kidFriendly: /kid/i.test(tags.join(" ")),
        isKidMeal: false,
        origin: "claude" as const,
        externalId: null,
        ingredients,
      };
    }),
  };
}

export interface BridgeProfile {
  adults: number;
  kidAges: number[];
  count: number;
  maxPrep: number | null;
  stores: string[];
  avoid: string[];
  mustInclude: string[];
  favoriteTitles: string[];
  kidFavorites: string[];
  notes?: string;
}

export function buildClaudePrompt(p: BridgeProfile): string {
  const kids = p.kidAges.length ? `${p.kidAges.length} kids (ages ${p.kidAges.join(" and ")})` : "no kids";
  return `I'm planning dinners for my household and want ${p.count} new recipe ideas.

Household: ${p.adults} adults and ${kids}. The kids are picky — their go-to meals are ${p.kidFavorites.join(", ") || "simple plain food"}. Add a short kidNote on how to make each dish work for them (e.g. set aside plain pasta).
Max active prep time: ${p.maxPrep ? `${p.maxPrep} minutes` : "no limit"}.
We shop at: ${p.stores.join(", ")}.
${p.avoid.length ? `Never use: ${p.avoid.join(", ")}.\n` : ""}${p.mustInclude.length ? `Please include: ${p.mustInclude.join(", ")}.\n` : ""}${p.notes ? `${p.notes}\n` : ""}
We already make these, so suggest different but similar-in-spirit dishes:
${p.favoriteTitles.slice(0, 60).map((t) => `- ${t}`).join("\n") || "- (none yet)"}

Reply ONLY with JSON in exactly this schema — no prose, no markdown:
{ "recipes": [{ "title": "", "servings": 4, "prepMinutes": 25, "tags": [""],
                "ingredients": [{ "qty": 1, "unit": "", "name": "" }],
                "steps": [""], "kidNote": "" }] }
Use US units (cup, tbsp, tsp, lb, oz) or leave unit empty for counted items. Keep ingredient names plain (e.g. "yellow onion", not "1 onion, diced").`;
}
