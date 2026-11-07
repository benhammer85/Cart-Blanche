import { describe, expect, test } from "vitest";
import { fitShare, makeFitContext, storeFit, tripFit } from "@/lib/trip";
import type { IngredientInfo } from "@/lib/types";

const info = (name_norm: string, category_id: string | null, extra: Partial<IngredientInfo> = {}): [string, IngredientInfo] => [
  name_norm,
  { name_norm, category_id, is_staple: false, is_out: false, pack_size: null, learned_store_id: null, learned_section_id: null, ...extra },
];

const ctx = makeFitContext({
  categories: [
    { id: "produce", name: "Produce", default_section: "Produce", sort_order: 0 },
    { id: "cond", name: "Sauces & Condiments", default_section: "Condiments", sort_order: 1 },
    { id: "bulk", name: "Paper & Household", default_section: "Household", sort_order: 2 },
    { id: "other", name: "Other", default_section: "Other", sort_order: 3 },
  ],
  rules: [
    { category_id: "produce", store_id: "mb", priority: 0 },
    { category_id: "produce", store_id: "tj", priority: 1 },
    { category_id: "produce", store_id: "costco", priority: 3 },
    { category_id: "cond", store_id: "mb", priority: 0 },
    { category_id: "cond", store_id: "shaws", priority: 1 },
    { category_id: "cond", store_id: "tj", priority: 2 },
    { category_id: "bulk", store_id: "costco", priority: 0 },
    { category_id: "other", store_id: "mb", priority: 0 },
    { category_id: "other", store_id: "shaws", priority: 1 },
    { category_id: "other", store_id: "tj", priority: 2 },
  ],
  ingredients: new Map([info("onion", "produce"), info("harissa", "cond"), info("paper towel", "bulk"), info("salt", null, { is_staple: true }), info("pepper", null, { is_staple: true })]),
  synonyms: { "kosher salt": "salt" },
});

describe("quick trip store fit", () => {
  test("counts what the store carries and lists what it doesn't", () => {
    const f = storeFit(["onion", "harissa", "salt", "salt and pepper"], "tj", ctx);
    expect(f).toEqual({ total: 2, carried: 1, missing: ["harissa"] });
    expect(fitShare(f)).toBe(0.5);
  });

  test("only 1st or 2nd choice counts for a specialty store", () => {
    expect(storeFit(["onion"], "tj", ctx).carried).toBe(1); // TJ is 2nd for produce
    expect(storeFit(["onion"], "costco", ctx).missing).toEqual(["onion"]); // Costco is 4th
  });

  test("full grocery stores have everything", () => {
    expect(storeFit(["onion", "harissa", "paper towel", "dragonfruit"], "shaws", ctx).missing).toEqual([]);
    expect(storeFit(["paper towel"], "mb", ctx).missing).toEqual([]);
  });

  test("a trip to two stores: missing only if neither has it", () => {
    expect(tripFit(["onion", "harissa"], ["tj", "costco"], ctx).missing).toEqual(["harissa"]);
    expect(tripFit(["onion", "harissa"], ["tj", "shaws"], ctx).missing).toEqual([]);
  });

  test("unknown items follow the Other category", () => {
    expect(storeFit(["dragonfruit"], "costco", ctx).missing).toEqual(["dragonfruit"]);
  });

  test("learned store counts as carried", () => {
    const c = makeFitContext({ ...ctx, ingredients: new Map([info("harissa", "cond", { learned_store_id: "tj" })]) });
    expect(storeFit(["harissa"], "tj", c).carried).toBe(1);
  });

  test("a recipe of only staples fits anywhere", () => {
    expect(fitShare(storeFit(["kosher salt"], "costco", ctx))).toBe(1);
  });
});

import { cookingStyles } from "@/lib/infer";
describe("cooking styles", () => {
  test("from title, tags and steps", () => {
    expect(cookingStyles("Instant Pot Chipotle Chicken", [])).toEqual(["Instant Pot"]);
    expect(cookingStyles("Chicken Chile Verde Pressure Cooker", [])).toEqual(["Instant Pot"]);
    expect(cookingStyles("Herby Skillet Chicken With Greens", [])).toEqual(["One pot"]);
    expect(cookingStyles("Sheet-Pan Bibimbap", [])).toEqual(["Sheet pan"]);
    expect(cookingStyles("Beef Kebabs", [], [{ text: "Grill the skewers" }])).toEqual([]);
    expect(cookingStyles("Carnitas", [], [{ text: "Add to the slow cooker on low" }])).toEqual(["Instant Pot"]); // IP slow-cooks
    expect(cookingStyles("Beef Kebabs", ["Grilling"])).toEqual(["Grill"]);
  });
});
