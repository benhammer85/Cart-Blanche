import { describe, expect, test } from "vitest";
import { planMeals, swapMeal, scoreRecipe, rng, violatesVariety, type PlannerRecipe, type PlanParams } from "@/lib/planner/planner";

const today = new Date("2026-11-06T12:00:00");
const r = (id: string, extra: Partial<PlannerRecipe> = {}): PlannerRecipe => ({
  id, title: id, tags: [], meal_types: ["dinner"], prep_min: 20, main_protein: null, kid_friendly: false,
  is_kid_meal: false, times_made: 0, last_made_at: null, ingredientNames: [], ...extra,
});
const params = (extra: Partial<PlanParams> = {}): PlanParams => ({
  mealCount: 3, mealTypes: ["dinner"], maxPrep: 30, includeTags: [], excludeTags: [], excludeIngredients: [],
  avoidTerms: [], bonusTags: ["Molly Favorites"], variety: true, useUp: [], pinnedIds: [], kidMeals: true, seed: 42, today, ...extra,
});

describe("scoring", () => {
  test("made in the last 21 days is penalized; long-rested gets a bonus", () => {
    const rand = () => 0;
    const recent = scoreRecipe(r("a", { last_made_at: "2026-10-30" }), params(), rand).score;
    const rested = scoreRecipe(r("b", { last_made_at: "2026-08-01" }), params(), rand).score;
    expect(recent).toBeLessThan(0);
    expect(rested).toBeGreaterThan(1);
  });
  test("kid-friendly, bonus tag and use-up add points", () => {
    const rand = () => 0;
    const base = scoreRecipe(r("a"), params(), rand).score;
    expect(scoreRecipe(r("a", { kid_friendly: true }), params(), rand).score).toBe(base + 1.5);
    expect(scoreRecipe(r("a", { tags: ["Molly Favorites"] }), params(), rand).score).toBe(base + 1);
    expect(scoreRecipe(r("a", { ingredientNames: ["spinach"] }), params({ useUp: ["spinach"] }), rand).score).toBe(base + 1.5);
  });
  test("seeded rng is reproducible", () => {
    expect(rng(1)()).toBe(rng(1)());
  });
});

describe("planMeals", () => {
  const library = [
    r("chicken tacos", { main_protein: "chicken", kid_friendly: true }),
    r("chicken curry", { main_protein: "chicken" }),
    r("beef stew", { main_protein: "beef", tags: ["soup"] }),
    r("lentil soup", { main_protein: "beans", tags: ["soup", "vegetarian"] }),
    r("salmon bowls", { main_protein: "seafood" }),
    r("veggie pasta"),
    r("slow lasagna", { main_protein: "beef", prep_min: 90 }),
    r("oats", { meal_types: ["breakfast"] }),
    r("hot dogs", { is_kid_meal: true, kid_friendly: true }),
    r("nuggets", { is_kid_meal: true, kid_friendly: true, last_made_at: "2026-11-01" }),
  ];

  test("respects filters and variety (no repeated protein, ≤1 soup)", () => {
    const res = planMeals(library, params({ mealCount: 4 }));
    const ids = res.meals.map((m) => m.recipeId);
    expect(ids).not.toContain("slow lasagna"); // prep 90 > 30
    expect(ids).not.toContain("oats"); // breakfast
    expect(ids).not.toContain("hot dogs"); // kid-only meal
    expect(ids.filter((i) => i.startsWith("chicken"))).toHaveLength(1);
    expect(ids.filter((i) => i.includes("soup") || i.includes("stew"))).toHaveLength(1);
    expect(res.meals).toHaveLength(4);
    expect(res.shortBy).toBe(0);
  });

  test("pinned meals come first even if they break filters", () => {
    const res = planMeals(library, params({ pinnedIds: ["slow lasagna"] }));
    expect(res.meals[0]).toMatchObject({ recipeId: "slow lasagna", pinned: true });
    expect(res.meals.map((m) => m.recipeId)).not.toContain("beef stew"); // beef already used
  });

  test("must-include tag guarantees one matching meal", () => {
    const res = planMeals(library, params({ mealCount: 2, includeTags: ["vegetarian"] }));
    expect(res.meals.map((m) => m.recipeId)).toContain("lentil soup");
  });

  test("exclusions by tag and ingredient", () => {
    const lib = [r("a", { tags: ["spicy"] }), r("b", { ingredientNames: ["cilantro"] }), r("c")];
    const res = planMeals(lib, params({ excludeTags: ["spicy"], avoidTerms: ["cilantro"] }));
    expect(res.meals.map((m) => m.recipeId)).toEqual(["c"]);
  });

  test("short plans explain which filter to relax", () => {
    const res = planMeals(library, params({ mealCount: 10 }));
    expect(res.shortBy).toBeGreaterThan(0);
    expect(res.suggestions.join(" ")).toMatch(/Relax (prep time|meal type)/);
  });

  test("kid meals accompany non-kid-friendly dinners, least recently made first", () => {
    const res = planMeals(library, params({ mealCount: 4 }));
    const nonKid = res.meals.filter((m) => !library.find((x) => x.id === m.recipeId)!.kid_friendly).length;
    expect(res.kidMeals).toHaveLength(nonKid);
    expect(res.kidMeals[0].title).toBe("hot dogs"); // nuggets were made 5 days ago
    if (res.kidMeals.length > 1) expect(res.kidMeals[1].title).toBe("nuggets");
  });

  test("different seeds can vary the plan; same seed is stable", () => {
    const a = planMeals(library, params({ seed: 1 })).meals.map((m) => m.recipeId);
    const b = planMeals(library, params({ seed: 1 })).meals.map((m) => m.recipeId);
    expect(a).toEqual(b);
  });

  test("swap returns a different eligible meal respecting variety", () => {
    const current = ["chicken tacos", "beef stew", "salmon bowls"];
    const s = swapMeal(library, current, 2, params());
    expect(s).not.toBeNull();
    expect(current).not.toContain(s!.recipeId);
    expect(s!.recipeId).not.toBe("chicken curry"); // would repeat chicken
  });

  test("variety helper", () => {
    expect(violatesVariety(r("x", { main_protein: "beans" }), [r("y", { main_protein: "beans" })])).toBe(false);
    expect(violatesVariety(r("x", { title: "tomato soup" }), [r("y", { tags: ["soup"] })])).toBe(true);
  });
});
