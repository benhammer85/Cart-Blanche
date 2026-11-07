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
