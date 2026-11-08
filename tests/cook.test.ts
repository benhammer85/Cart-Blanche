import { describe, expect, test } from "vitest";
import { ingredientsForStep } from "@/lib/cook";
import { usEquivalent } from "@/lib/units";

const ing = (name_norm: string) => ({ name: name_norm, name_norm });
const list = ["chicken thigh", "olive oil", "sesame oil", "garlic", "soy sauce", "fish sauce", "green onion", "rice", "salt"].map(ing);
const names = (step: string) => ingredientsForStep(step, list).map((i) => i.name_norm);

describe("ingredients for each step", () => {
  test("full names and their main word, in the order the step uses them", () => {
    expect(names("Heat the olive oil, then add the chicken thighs and garlic.")).toEqual(["olive oil", "chicken thigh", "garlic"]);
    expect(names("Season the chicken with salt.")).toEqual(["chicken thigh", "salt"]);
    expect(names("Stir in the soy sauce and scatter over the green onions.")).toEqual(["soy sauce", "green onion"]);
  });
  test("vague words alone don't match, and an exact match beats a loose one", () => {
    expect(names("Pour the sauce over the rice.")).toEqual(["rice"]);
    expect(names("Drizzle with sesame oil.")).toEqual(["sesame oil"]);
    expect(names("Bring a pot of water to a boil.")).toEqual([]);
  });
});

describe("metric amounts in US terms", () => {
  test("weight and volume convert; counts and small pinches don't", () => {
    expect(usEquivalent(200, "g")).toBe("7 oz");
    expect(usEquivalent(1, "kg")).toBe("2¼ lb");
    expect(usEquivalent(500, "ml")).toBe("2 cups");
    expect(usEquivalent(2, "g")).toBeNull();
    expect(usEquivalent(2, "cup")).toBeNull();
  });
});

import { isIngredientHeading, isProseLine } from "@/lib/ingredientParser";
describe("headings saved as ingredients", () => {
  test("recognized", () => {
    for (const t of ["Japchae Sauce", "Vegetables", "For the dressing:", "Peanut Lime Dressing", "Toppings"]) expect(isIngredientHeading(t, null, null), t).toBe(true);
    for (const t of ["Salt", "Kosher salt and black pepper", "Good olive oil", "Fresh basil, for serving", "Lemon zest"]) expect(isIngredientHeading(t, null, null), t).toBe(false);
    expect(isIngredientHeading("Japchae Sauce", 1, "cup")).toBe(false);
  });
  test("stray sentences", () => {
    expect(isProseLine("Blend and freeze!", null)).toBe(true);
    expect(isProseLine("To that I add the flavors..", null)).toBe(true);
    expect(isProseLine("Freshly ground black pepper", null)).toBe(false);
  });
});

import { kitchenSummary, kitchenTips, OUR_KITCHEN } from "@/lib/kitchen";
describe("our kitchen", () => {
  test("tips only where they help", () => {
    expect(kitchenTips("Cook on low in a slow cooker for 8 hours.", OUR_KITCHEN)[0]).toContain("Instant Pot");
    expect(kitchenTips("Air fry at 400°F for 12 minutes.", OUR_KITCHEN)[0]).toContain("Air Fry mode");
    expect(kitchenTips("Heat a cast-iron skillet over high heat.", OUR_KITCHEN)).toEqual(["Carbon steel works the same as cast iron here."]);
    expect(kitchenTips("Roast at 425°F for 25 minutes.", OUR_KITCHEN)[0]).toContain("25°F lower");
    expect(kitchenTips("Stir in the garlic.", OUR_KITCHEN)).toEqual([]);
    expect(kitchenTips("Grill the chicken.", OUR_KITCHEN)).toEqual([]);
  });
  test("summary for ideas and search", () => {
    const s = kitchenSummary(OUR_KITCHEN)!;
    expect(s).toContain("induction cooktop");
    expect(s).toContain("no slow cooker");
    expect(s).toContain("oven's air-fry mode");
  });
});

import { stepSegments } from "@/lib/cook";
describe("ingredient mentions in a step", () => {
  const ings = [
    { name: "ripe bananas, mashed", name_norm: "banana" },
    { name: "white sugar", name_norm: "white sugar" },
    { name: "melted butter", name_norm: "melted butter" },
    { name: "all-purpose flour", name_norm: "all-purpose flour" },
    { name: "baking soda", name_norm: "baking soda" },
    { name: "salt", name_norm: "salt" },
  ];
  test("marks each mention, longest name first", () => {
    const seg = stepSegments("Combine bananas, sugar, egg, and butter. Mix flour and baking soda; stir into banana mixture. Stir salt into batter.", ings);
    const hits = seg.filter((s) => s.ingredients).map((s) => `${s.text}=${s.ingredients!.map((i) => i.name_norm).join("+")}`);
    expect(hits).toEqual(["bananas=banana", "sugar=white sugar", "butter=melted butter", "flour=all-purpose flour", "baking soda=baking soda", "banana=banana", "salt=salt"]);
    expect(seg.map((s) => s.text).join("")).toContain("Combine bananas, sugar, egg");
  });
  test("leaves a vague word alone when two ingredients share it", () => {
    const seg = stepSegments("Add the sugar.", [{ name: "white sugar", name_norm: "white sugar" }, { name: "brown sugar", name_norm: "brown sugar" }]);
    expect(seg.some((s) => s.ingredients)).toBe(false);
  });
  test("a word several ingredients share points to all of them", () => {
    const cheeses = [
      { name: "sharp cheddar cheese", name_norm: "cheddar cheese" },
      { name: "Gruyère cheese", name_norm: "gruyere cheese" },
      { name: "elbow macaroni", name_norm: "elbow macaroni" },
    ];
    const seg = stepSegments("Stir in the cheese until melted, then the macaroni.", cheeses);
    expect(seg.find((s) => s.text === "cheese")?.ingredients?.map((i) => i.name_norm)).toEqual(["cheddar cheese", "gruyere cheese"]);
    const one = stepSegments("Add the cheese.", [{ name: "cheese", name_norm: "cheese" }, { name: "cream cheese", name_norm: "cream cheese" }]);
    expect(one.find((s) => s.text === "cheese")?.ingredients?.map((i) => i.name_norm)).toEqual(["cheese"]);
  });
});
