// Rule-based meal planner (no AI). Deterministic given the same seed.
//
// HOW IT WORKS
// 1. FILTER favorites (non kid-only, not archived) by:
//      meal type ∩ requested meal types,
//      prep time ≤ max (recipes with unknown prep time are allowed — most
//        Crouton imports have none),
//      no excluded tag, no ingredient containing an excluded term or avoid term.
// 2. SCORE each eligible recipe (higher = better):
//      + rest bonus: 0 if made in the last 21 days, then +1 per 30 days
//        beyond that (max +2); never-made recipes get +1
//      + popularity: 0.5 × log2(1 + times made)
//      + kid-friendly: +1.5 (saves cooking a separate kids' dinner)
//      + bonus tags (e.g. "Molly Favorites"): +1
//      + use-up: +1.5 per ingredient on the "use up" list (max +3)
//      + jitter: random 0–0.75 (seeded) so plans vary week to week
//      − made in the last 21 days: −3 (still possible, just unlikely)
// 3. PICK: pinned meals first, then for each "must include" tag the best
//      eligible recipe with that tag, then the highest scores. With variety on,
//      no two meals share a main protein and at most one soup.
// 4. If we run short, report which filter removed the most recipes so the UI
//      can suggest relaxing it.
// 5. KIDS: for every adult meal that isn't kid-friendly, add a kids' favorite
//      (hot dogs, nuggets…) rotating least-recently-made first, no repeats
//      until all have been used.

import { lastMadeShort } from "../history";
import { isSoup } from "../infer";
import type { MealType } from "../types";

export interface PlannerRecipe {
  id: string;
  title: string;
  tags: string[];
  meal_types: MealType[];
  prep_min: number | null;
  main_protein: string | null;
  kid_friendly: boolean;
  is_kid_meal: boolean;
  times_made: number;
  last_made_at: string | null;
  archived?: boolean;
  /** normalized ingredient names */
  ingredientNames: string[];
}

export interface PlanParams {
  mealCount: number;
  mealTypes: MealType[];
  maxPrep: number | null; // null = no limit (60+)
  includeTags: string[];
  excludeTags: string[];
  excludeIngredients: string[];
  avoidTerms: string[];
  bonusTags: string[];
  variety: boolean;
  useUp: string[];
  pinnedIds: string[];
  /** recipes already in the plan that must stay (locked), by id */
  lockedIds?: string[];
  kidMeals: boolean;
  seed?: number;
  today?: Date;
}

export interface PlannedMeal {
  recipeId: string;
  title: string;
  score: number;
  pinned: boolean;
  reason: string;
}

export interface KidMeal {
  recipeId: string;
  title: string;
  /** index into meals[] this kid meal accompanies */
  forMealIndex: number;
}

export interface PlanResult {
  meals: PlannedMeal[];
  kidMeals: KidMeal[];
  shortBy: number;
  suggestions: string[];
}

// --- seeded RNG (mulberry32) so tests are reproducible -----------------------
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const lc = (s: string) => s.toLowerCase().trim();

export function daysSince(date: string | null, today: Date): number | null {
  if (!date) return null;
  return Math.floor((today.getTime() - new Date(date + "T00:00:00").getTime()) / DAY);
}

type FilterName = "meal type" | "prep time" | "excluded tags" | "excluded ingredients";

function filterReason(r: PlannerRecipe, p: PlanParams): FilterName | null {
  if (!r.meal_types.some((t) => p.mealTypes.includes(t))) return "meal type";
  if (p.maxPrep != null && r.prep_min != null && r.prep_min > p.maxPrep) return "prep time";
  const tags = r.tags.map(lc);
  if (p.excludeTags.some((t) => tags.includes(lc(t)))) return "excluded tags";
  const terms = [...p.excludeIngredients, ...p.avoidTerms].map(lc).filter(Boolean);
  if (terms.some((t) => r.ingredientNames.some((n) => n.includes(t)) || lc(r.title).includes(t))) {
    return "excluded ingredients";
  }
  return null;
}

export function scoreRecipe(r: PlannerRecipe, p: PlanParams, rand: () => number): { score: number; reason: string } {
  const today = p.today ?? new Date();
  const reasons: string[] = [];
  let score = 0;

  const days = daysSince(r.last_made_at, today);
  if (days == null) {
    score += 1;
    reasons.push(r.times_made ? "not made recently" : "new to us");
  } else if (days < 21) {
    score -= 3;
    reasons.push(lastMadeShort(r.times_made || 1, r.last_made_at, today));
  } else {
    score += Math.min((days - 21) / 30 + 0.5, 2);
    reasons.push(lastMadeShort(r.times_made || 1, r.last_made_at, today));
  }

  if (r.times_made > 0) score += 0.5 * Math.log2(1 + r.times_made);
  if (r.kid_friendly) {
    score += 1.5;
    reasons.push("kid-friendly");
  }
  const tags = r.tags.map(lc);
  if (tags.includes("loved")) {
    score += 1.5;
    reasons.push("loved");
  } else if (p.bonusTags.some((t) => tags.includes(lc(t)))) {
    score += 1;
    reasons.push("favorite");
  }
  const useUp = p.useUp.map(lc).filter(Boolean);
  const hits = useUp.filter((u) => r.ingredientNames.some((n) => n.includes(u)));
  if (hits.length) {
    score += Math.min(hits.length * 1.5, 3);
    reasons.push(`uses ${hits.join(", ")}`);
  }
  score += rand() * 0.75;
  return { score: Math.round(score * 100) / 100, reason: reasons.join(" · ") };
}

/** Would adding `r` break the variety rules given meals already chosen? */
export function violatesVariety(r: PlannerRecipe, chosen: PlannerRecipe[]): boolean {
  if (r.main_protein && !["beans", "eggs"].includes(r.main_protein)) {
    if (chosen.some((c) => c.main_protein === r.main_protein)) return true;
  }
  if (isSoup(r.title, r.tags) && chosen.some((c) => isSoup(c.title, c.tags))) return true;
  return false;
}

export function planMeals(all: PlannerRecipe[], p: PlanParams): PlanResult {
  const rand = rng(p.seed ?? Date.now());
  const adultPool = all.filter((r) => !r.is_kid_meal && !r.archived);
  const byId = new Map(all.map((r) => [r.id, r]));

  const removedBy = new Map<FilterName, number>();
  const eligible: (PlannerRecipe & { score: number; reason: string })[] = [];
  for (const r of adultPool) {
    const why = filterReason(r, p);
    if (why) {
      removedBy.set(why, (removedBy.get(why) ?? 0) + 1);
      continue;
    }
    eligible.push({ ...r, ...scoreRecipe(r, p, rand) });
  }
  eligible.sort((a, b) => b.score - a.score);

  const chosen: PlannerRecipe[] = [];
  const meals: PlannedMeal[] = [];
  const add = (r: PlannerRecipe, score: number, pinned: boolean, reason: string) => {
    chosen.push(r);
    meals.push({ recipeId: r.id, title: r.title, score, pinned, reason });
  };

  // Pinned and locked meals always go in (even if they break filters or variety).
  for (const id of [...(p.lockedIds ?? []), ...p.pinnedIds]) {
    const r = byId.get(id);
    if (r && !chosen.some((c) => c.id === id) && meals.length < p.mealCount) add(r, 99, true, "pinned");
  }

  const canAdd = (r: PlannerRecipe) => !chosen.some((c) => c.id === r.id) && (!p.variety || !violatesVariety(r, chosen));

  // One meal per "must include" tag that isn't already covered.
  for (const tag of p.includeTags) {
    if (meals.length >= p.mealCount) break;
    if (chosen.some((c) => c.tags.map(lc).includes(lc(tag)))) continue;
    const best = eligible.find((r) => r.tags.map(lc).includes(lc(tag)) && canAdd(r));
    if (best) add(best, best.score, false, best.reason);
  }

  for (const r of eligible) {
    if (meals.length >= p.mealCount) break;
    if (canAdd(r)) add(r, r.score, false, r.reason);
  }

  const shortBy = Math.max(0, p.mealCount - meals.length);
  const suggestions: string[] = [];
  if (shortBy > 0) {
    const ranked = [...removedBy.entries()].sort((a, b) => b[1] - a[1]);
    for (const [name, n] of ranked) suggestions.push(`Relax ${name} (${n} favorite${n === 1 ? "" : "s"} filtered out)`);
    if (p.variety) suggestions.push("Turn off variety rules");
    if (!ranked.length && !adultPool.length) suggestions.push("Add some favorites first");
  }
  const missingTags = p.includeTags.filter((t) => !chosen.some((c) => c.tags.map(lc).includes(lc(t))));
  for (const t of missingTags) suggestions.push(`No eligible favorite tagged “${t}”`);

  const kidMeals = p.kidMeals ? pickKidMeals(all, meals.map((m) => byId.get(m.recipeId)!), p, rand) : [];
  return { meals, kidMeals, shortBy, suggestions };
}

/** Rotate kids' favorites: least recently made first, no repeats until exhausted. */
export function pickKidMeals(all: PlannerRecipe[], adultMeals: PlannerRecipe[], p: PlanParams, rand: () => number): KidMeal[] {
  const today = p.today ?? new Date();
  const kidPool = all
    .filter((r) => r.is_kid_meal && !r.archived)
    .map((r) => ({ r, d: daysSince(r.last_made_at, today) ?? 9999, j: rand() }))
    .sort((a, b) => b.d - a.d || a.j - b.j)
    .map((x) => x.r);
  if (!kidPool.length) return [];
  const out: KidMeal[] = [];
  let i = 0;
  adultMeals.forEach((m, idx) => {
    if (m.kid_friendly) return;
    const k = kidPool[i % kidPool.length];
    i++;
    out.push({ recipeId: k.id, title: k.title, forMealIndex: idx });
  });
  return out;
}

/**
 * Swap: the best eligible favorite not already in the plan that keeps the
 * variety rules with respect to the other (kept) meals.
 */
export function swapMeal(all: PlannerRecipe[], currentIds: string[], index: number, p: PlanParams, skipIds: string[] = []): PlannedMeal | null {
  const rand = rng((p.seed ?? Date.now()) + index + skipIds.length);
  const byId = new Map(all.map((r) => [r.id, r]));
  const others = currentIds.filter((_, i) => i !== index).map((id) => byId.get(id)).filter(Boolean) as PlannerRecipe[];
  const exclude = new Set([...currentIds, ...skipIds]);
  const candidates = all
    .filter((r) => !r.is_kid_meal && !r.archived && !exclude.has(r.id) && !filterReason(r, p))
    .map((r) => ({ r, ...scoreRecipe(r, p, rand) }))
    .sort((a, b) => b.score - a.score);
  const pick = candidates.find((c) => !p.variety || !violatesVariety(c.r, others)) ?? candidates[0];
  return pick ? { recipeId: pick.r.id, title: pick.r.title, score: pick.score, pinned: false, reason: pick.reason } : null;
}
