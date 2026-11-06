// Strict JSON contract for AI plans + prompt builder. Shared by server routes
// and tests (no server-only imports here).
import { z } from "zod";

const num = z.union([z.number(), z.string().regex(/^\s*\d+(\.\d+)?\s*$/).transform(Number)]);

export const aiNewMealSchema = z.object({
  title: z.string().min(1),
  servings: num.pipe(z.number().positive()).default(4),
  prepMinutes: num.nullable().optional(),
  mainProtein: z.string().nullable().optional(),
  kidFriendly: z.boolean().optional().default(false),
  tags: z.array(z.string()).default([]),
  ingredients: z.array(z.object({ qty: num.nullable().optional(), unit: z.string().nullable().optional(), name: z.string().min(1) })).min(1),
  steps: z.array(z.string()).min(1),
});
export type AiNewMeal = z.infer<typeof aiNewMealSchema>;

export const aiMealSchema = z.union([
  z.object({ favoriteId: z.string().min(1) }),
  z.object({ newMeal: aiNewMealSchema }),
]);

export const aiPlanSchema = z.object({ meals: z.array(aiMealSchema).min(1) });
export const aiSwapSchema = z.object({ meal: aiMealSchema });

export interface AiPlanContext {
  mealCount: number;
  favoritesPct: number;
  mealTypes: string[];
  maxPrep: number | null;
  adults: number;
  kidAges: number[];
  includeTags: string[];
  exclude: string[];
  useUp: string[];
  variety: boolean;
  stores: string[];
  staples: string[];
  favorites: { id: string; title: string; tags: string[]; ingredients: string[]; timesMade: number; lastMade: string | null; kidFriendly: boolean; prepMin: number | null }[];
  recentTitles: string[];
  pinnedIds: string[];
}

/** Only the household food profile goes to the AI — never names or emails. */
export function buildPlanPrompt(c: AiPlanContext, swap?: { keepTitles: string[]; replacing: string }): string {
  const nFav = Math.round((c.mealCount * c.favoritesPct) / 100);
  const head = swap
    ? `Suggest ONE replacement meal for "${swap.replacing}". The rest of the week is: ${swap.keepTitles.join("; ")}. Don't repeat any of them or their main protein.`
    : `Plan ${c.mealCount} ${c.mealTypes.join("/")} meals. About ${nFav} should be from our favorites (by id) and ${c.mealCount - nFav} should be new ideas.`;
  const favs = c.favorites
    .map((f) => `${f.id} | ${f.title} | tags: ${f.tags.join(", ") || "-"} | made ${f.timesMade}x, last ${f.lastMade ?? "never"} | prep ${f.prepMin ?? "?"}m${f.kidFriendly ? " | kids like" : ""} | ${f.ingredients.slice(0, 12).join(", ")}`)
    .join("\n");
  return `You are a family meal planner. ${head}

Household: ${c.adults} adults, kids aged ${c.kidAges.join(", ") || "none"} (kids are picky; prefer kid-friendly).
Max active prep: ${c.maxPrep ? `${c.maxPrep} min` : "any"}.
${c.includeTags.length ? `Must include: ${c.includeTags.join(", ")}.\n` : ""}${c.exclude.length ? `Never use: ${c.exclude.join(", ")}.\n` : ""}${c.useUp.length ? `Use up: ${c.useUp.join(", ")}.\n` : ""}${c.variety ? "Variety: no two meals with the same main protein; at most one soup.\n" : ""}${c.pinnedIds.length ? `Must include these favorite ids: ${c.pinnedIds.join(", ")}.\n` : ""}Stores: ${c.stores.join(", ")}. Pantry staples we always have: ${c.staples.slice(0, 40).join(", ")}.
Avoid repeating these recent meals: ${c.recentTitles.slice(0, 30).join("; ") || "none"}.

Favorites (id | title | tags | history | prep | ingredients):
${favs || "(none)"}

Respond with JSON only, matching:
${swap ? '{ "meal": MEAL }' : '{ "meals": [MEAL, ...] }'}
where MEAL is either { "favoriteId": "<id from the list>" } or
{ "newMeal": { "title": "", "servings": 4, "prepMinutes": 25, "mainProtein": "chicken", "kidFriendly": false, "tags": [""], "ingredients": [{ "qty": 1, "unit": "cup", "name": "rice" }], "steps": [""] } }.
Use US units (cup, tbsp, tsp, lb, oz) or an empty unit for counted items.`;
}
