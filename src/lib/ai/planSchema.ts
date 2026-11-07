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
  /** Products we've confirmed at each store on the trip: our notes, "only sold here" items, receipts. */
  storeProducts?: { store: string; notes: string | null; onlyHere: string[]; buyHere: string[] }[];
  /** cookware and appliances, in a sentence */
  kitchen?: string | null;
}

function confirmedProducts(c: AiPlanContext): string {
  const rows = (c.storeProducts ?? []).filter((s) => s.notes || s.onlyHere.length || s.buyHere.length);
  if (!rows.length) return "Confirmed products: none listed.";
  return (
    "Confirmed products (what we actually buy at each store):\n" +
    rows
      .map((s) => `- ${s.store}: ${[s.notes, s.onlyHere.length && `only sold here: ${s.onlyHere.slice(0, 25).join(", ")}`, s.buyHere.length && `we buy here: ${s.buyHere.slice(0, 40).join(", ")}`].filter(Boolean).join("; ")}`)
      .join("\n")
  );
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
${c.kitchen ? `${c.kitchen} Only suggest dishes this kitchen can make.\n` : ""}${confirmedProducts(c)}
New ideas: quick dinners built mostly from what these stores sell, often a shortcut product plus a few fresh things.
Only name a store-brand or signature product (a specific sauce, frozen item or kit) if it is listed under "Confirmed products". Otherwise use generic ingredients ("teriyaki sauce", "frozen potstickers", "rotisserie chicken"). Never invent or guess product names.

Favorites (id | title | tags | history | prep | ingredients):
${favs || "(none)"}

Respond with JSON only, matching:
${swap ? '{ "meal": MEAL }' : '{ "meals": [MEAL, ...] }'}
where MEAL is either { "favoriteId": "<id from the list>" } or
{ "newMeal": { "title": "", "servings": 4, "prepMinutes": 25, "mainProtein": "chicken", "kidFriendly": false, "tags": [""], "ingredients": [{ "qty": 1, "unit": "cup", "name": "rice" }], "steps": [""] } }.
Use US units (cup, tbsp, tsp, lb, oz) or an empty unit for counted items.`;
}
