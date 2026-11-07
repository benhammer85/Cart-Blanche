import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiError, getAiProvider } from "./provider";
import { aiPlanSchema, aiSwapSchema, buildPlanPrompt, type AiNewMeal, type AiPlanContext } from "./planSchema";
import { normalizeName } from "../normalize";
import { formatAmount, canonicalUnit } from "../units";
import { inferMealTypes } from "../infer";
import { ageOn } from "../list/buildList";
import type { RecipeDraft } from "../types";
import { IDEA_TAG } from "../ideas";
import type { z } from "zod";

export interface AiPlanRequest {
  mealCount: number;
  favoritesPct: number;
  mealTypes: string[];
  maxPrep: number | null;
  includeTags: string[];
  excludeTags: string[];
  excludeIngredients: string[];
  useUp: string[];
  variety: boolean;
  storeIds: string[];
  pinnedIds: string[];
}

export type AiMealOut = { recipeId: string; title: string } | { draft: RecipeDraft; title: string };

export async function bumpUsage(db: SupabaseClient): Promise<number> {
  const { data } = await db.rpc("bump_ai_usage");
  return (data as number) ?? 0;
}

/** Collect the household food profile — no names, no emails. */
export async function buildContext(db: SupabaseClient, req: AiPlanRequest): Promise<{ ctx: AiPlanContext; synonyms: Record<string, string>; favIds: Map<string, string> }> {
  const since = new Date(Date.now() - 28 * 86_400_000).toISOString();
  const [recipes, people, stores, staples, settings, recent, syn] = await Promise.all([
    db.from("recipes").select("id, title, tags, times_made, last_made_at, kid_friendly, prep_min, meal_types, recipe_ingredients(name_norm)").eq("archived", false).eq("is_kid_meal", false),
    db.from("household_people").select("kind, birthdate"),
    db.from("stores").select("*"),
    db.from("ingredients").select("name_norm").eq("is_staple", true).eq("is_out", false),
    db.from("household_settings").select("avoid_terms").maybeSingle(),
    db.from("meal_plan_items").select("title, meal_plans!inner(created_at)").gte("meal_plans.created_at", since),
    db.from("synonyms").select("alias, canonical"),
  ]);
  type R = { id: string; title: string; tags: string[]; times_made: number; last_made_at: string | null; kid_friendly: boolean; prep_min: number | null; meal_types: string[]; recipe_ingredients: { name_norm: string }[] };
  // Never send names: scrub household names out of titles and tags
  // ("Asa and Saul Favorites" → "kids favorites", "Molly Favorites" → "family favorites").
  const { data: names } = await db.from("household_people").select("name, kind");
  const { data: members } = await db.from("household_members").select("display_name");
  const kidNames = ((names ?? []) as { name: string; kind: string }[]).filter((p) => p.kind === "kid").map((p) => p.name);
  const adultNames = [
    ...((names ?? []) as { name: string; kind: string }[]).filter((p) => p.kind === "adult").map((p) => p.name),
    ...((members ?? []) as { display_name: string }[]).map((m) => m.display_name),
  ];
  const scrub = (text: string) => scrubNames(text, kidNames, adultNames);
  // Short ids keep the prompt small; map back after.
  const favIds = new Map<string, string>();
  const favorites = ((recipes.data ?? []) as R[])
    .filter((r) => r.meal_types.some((t) => req.mealTypes.includes(t)))
    .map((r, i) => {
      const short = `f${i + 1}`;
      favIds.set(short, r.id);
      return {
        id: short,
        title: scrub(r.title),
        tags: r.tags.map(scrub),
        ingredients: r.recipe_ingredients.map((x) => x.name_norm),
        timesMade: r.times_made,
        lastMade: r.last_made_at,
        kidFriendly: r.kid_friendly,
        prepMin: r.prep_min,
      };
    });
  const reverse = new Map([...favIds.entries()].map(([s, l]) => [l, s]));
  const ppl = (people.data ?? []) as { kind: string; birthdate: string | null }[];
  return {
    favIds,
    synonyms: Object.fromEntries((syn.data ?? []).map((s: { alias: string; canonical: string }) => [s.alias, s.canonical])),
    ctx: {
      mealCount: req.mealCount,
      favoritesPct: req.favoritesPct,
      mealTypes: req.mealTypes,
      maxPrep: req.maxPrep,
      adults: ppl.filter((p) => p.kind === "adult").length,
      kidAges: ppl.filter((p) => p.kind === "kid").map((p) => (p.birthdate ? ageOn(p.birthdate) : 5)),
      includeTags: req.includeTags,
      exclude: [...req.excludeTags, ...req.excludeIngredients, ...((settings.data?.avoid_terms as string[]) ?? [])],
      useUp: req.useUp,
      variety: req.variety,
      stores: ((stores.data ?? []) as { id: string; name: string }[]).filter((s) => req.storeIds.includes(s.id)).map((s) => s.name),
      storeProducts: await confirmedStoreProducts(db, ((stores.data ?? []) as { id: string; name: string; notes?: string | null }[]).filter((s) => req.storeIds.includes(s.id)), scrub),
      staples: ((staples.data ?? []) as { name_norm: string }[]).map((s) => s.name_norm),
      favorites,
      recentTitles: [...new Set(((recent.data ?? []) as { title: string }[]).map((r) => scrub(r.title)))],
      pinnedIds: req.pinnedIds.map((id) => reverse.get(id)).filter(Boolean) as string[],
    },
  };
}

/** What we've confirmed at each store: our notes, "only sold here" items and receipt-learned items. */
async function confirmedStoreProducts(
  db: SupabaseClient,
  stores: { id: string; name: string; notes?: string | null }[],
  scrub: (t: string) => string,
): Promise<{ store: string; notes: string | null; onlyHere: string[]; buyHere: string[] }[]> {
  if (!stores.length) return [];
  // select("*") so a database without the newer columns still works.
  const { data } = await db.from("ingredients").select("*").in("learned_store_id", stores.map((s) => s.id));
  const rows = (data ?? []) as { name_norm: string; learned_store_id: string; only_at?: boolean; is_staple?: boolean }[];
  return stores.map((s) => ({
    store: s.name,
    notes: s.notes?.trim() ? scrub(s.notes.trim()).slice(0, 400) : null,
    onlyHere: rows.filter((r) => r.learned_store_id === s.id && r.only_at).map((r) => r.name_norm),
    buyHere: rows.filter((r) => r.learned_store_id === s.id && !r.only_at && !r.is_staple).map((r) => r.name_norm),
  }));
}

export function scrubNames(text: string, kidNames: string[], adultNames: string[]): string {
  const esc = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let out = text;
  const kids = kidNames.filter(Boolean).map(esc);
  if (kids.length) out = out.replace(new RegExp(`\\b(${kids.join("|")})('s)?\\b(\\s*(and|&)\\s*\\b(${kids.join("|")})('s)?\\b)*`, "gi"), "kids");
  const adults = adultNames.filter(Boolean).map(esc);
  if (adults.length) out = out.replace(new RegExp(`\\b(${adults.join("|")})('s)?\\b`, "gi"), "family");
  return out;
}

export function newMealToDraft(m: AiNewMeal, synonyms: Record<string, string>): RecipeDraft {
  return {
    title: m.title,
    servings: m.servings,
    prepMin: m.prepMinutes ?? null,
    cookMin: null,
    steps: m.steps.map((text) => ({ text })),
    notes: null,
    sourceUrl: null,
    sourceName: "Gemini",
    tags: [...new Set([...m.tags.filter(Boolean), IDEA_TAG])],
    mealTypes: inferMealTypes(m.title, m.tags),
    mainProtein: m.mainProtein?.toLowerCase() || null,
    kidFriendly: m.kidFriendly,
    isKidMeal: false,
    origin: "ai",
    externalId: null,
    ingredients: m.ingredients.map((i) => {
      const qty = i.qty ?? null;
      const unit = canonicalUnit(i.unit ?? "") ?? ((i.unit ?? "").trim() || (qty != null ? "each" : null));
      return { raw: `${formatAmount(qty, unit)} ${i.name}`.trim(), qty, qtyMax: null, unit, name: i.name, nameNorm: normalizeName(i.name, synonyms), note: null, ok: true };
    }),
  };
}

/** Call the model, parse + validate JSON, retry once on bad output. */
export async function askJson<T>(prompt: string, schema: z.ZodType<T>, db: SupabaseClient): Promise<{ value: T; requestsToday: number }> {
  const ai = getAiProvider();
  if (!ai) throw new AiError("No AI key configured", "not_configured");
  let lastErr = "";
  let requestsToday = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    requestsToday = await bumpUsage(db);
    const text = await ai.generateJson(attempt ? `${prompt}\n\nYour previous answer was invalid (${lastErr}). Reply with valid JSON only.` : prompt);
    try {
      const json = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
      const parsed = schema.safeParse(json);
      if (parsed.success) return { value: parsed.data, requestsToday };
      lastErr = parsed.error.issues[0]?.message ?? "schema mismatch";
    } catch {
      lastErr = "not JSON";
    }
  }
  throw new AiError(`AI answer didn’t match the format (${lastErr})`, "failed");
}

export async function aiPlan(db: SupabaseClient, req: AiPlanRequest) {
  const { ctx, synonyms, favIds } = await buildContext(db, req);
  const { value, requestsToday } = await askJson(buildPlanPrompt(ctx), aiPlanSchema, db);
  const titleOf = new Map(ctx.favorites.map((f) => [f.id, f.title]));
  const meals: AiMealOut[] = [];
  for (const m of value.meals) {
    if ("favoriteId" in m) {
      const id = favIds.get(m.favoriteId);
      if (id && !meals.some((x) => "recipeId" in x && x.recipeId === id)) meals.push({ recipeId: id, title: titleOf.get(m.favoriteId)! });
    } else {
      meals.push({ draft: newMealToDraft(m.newMeal, synonyms), title: m.newMeal.title });
    }
  }
  return { meals: meals.slice(0, req.mealCount), requestsToday };
}

export async function aiSwap(db: SupabaseClient, req: AiPlanRequest & { keepTitles: string[]; replacing: string }) {
  const { ctx, synonyms, favIds } = await buildContext(db, { ...req, mealCount: 1 });
  const { value, requestsToday } = await askJson(buildPlanPrompt(ctx, { keepTitles: req.keepTitles, replacing: req.replacing }), aiSwapSchema, db);
  const m = value.meal;
  if ("favoriteId" in m) {
    const id = favIds.get(m.favoriteId);
    const fav = ctx.favorites.find((f) => f.id === m.favoriteId);
    if (!id || !fav) throw new AiError("AI picked an unknown favorite", "failed");
    return { meal: { recipeId: id, title: fav.title } as AiMealOut, requestsToday };
  }
  return { meal: { draft: newMealToDraft(m.newMeal, synonyms), title: m.newMeal.title } as AiMealOut, requestsToday };
}
