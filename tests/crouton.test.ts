import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseCrumb } from "@/lib/import/crouton";

const load = (name: string) => JSON.parse(fs.readFileSync(path.join("tests/fixtures", name), "utf8"));

describe("Crouton .crumb parser (real exports)", () => {
  test("Beef kebabs: structured quantities, web link, notes", () => {
    const r = parseCrumb(load("Beef_Kebabs_with_Cumin_Marinade.crumb"));
    expect(r.recipe.title).toBe("Beef Kebabs with Cumin Marinade");
    expect(r.recipe.servings).toBe(4);
    expect(r.recipe.sourceUrl).toMatch(/^https:\/\/www\.whattoexpect\.com/);
    expect(r.recipe.notes).toMatch(/pineapple/);
    expect(r.recipe.mainProtein).toBe("beef");
    expect(r.recipe.externalId).toBe("8D929CEF-F73C-45B6-BB71-DCF954048BEE");
    const beef = r.recipe.ingredients[0];
    expect([beef.qty, beef.unit, beef.nameNorm]).toEqual([0.5, "lb", "beef"]);
    expect(r.recipe.steps).toHaveLength(4);
  });

  test("Chipotle chicken: blank spacer rows are skipped, tags kept", () => {
    const r = parseCrumb(load("Instant_Pot_Chipotle_Chicken.crumb"));
    expect(r.recipe.ingredients).toHaveLength(7);
    expect(r.recipe.tags).toEqual(["Instant Pot", "Loved"]); // 5 stars in Crouton
    expect(r.recipe.ingredients.find((i) => i.nameNorm === "black beans")?.unit).toBe("can");
    expect(r.recipe.mainProtein).toBe("chicken");
  });

  test("Overnight oats: secondaryAmount-only quantities, breakfast, unit in name", () => {
    const r = parseCrumb(load("PB_and_banana_overnight_oats.crumb"));
    expect(r.recipe.mealTypes).toEqual(["breakfast"]);
    const banana = r.recipe.ingredients[0];
    expect([banana.qty, banana.unit, banana.nameNorm]).toEqual([0.5, "each", "banana"]);
    const pb2 = r.recipe.ingredients[1];
    expect([pb2.qty, pb2.unit, pb2.nameNorm]).toEqual([2, "tbsp", "pb2"]);
    expect(r.warnings).toContain("No steps");
    expect(r.recipe.ingredients.map((i) => i.nameNorm)).toContain("milk");
  });

  test("Splendid Table: prep/cook minutes, ranges, garbled line flagged, title cleaned", () => {
    const r = parseCrumb(load("Roasted_Cauliflower_And_Potatoes_With_Harissa_Yogurt_And_Toasted_Almonds__The_Splendid_Table.crumb"));
    expect(r.recipe.title).toBe("Roasted Cauliflower And Potatoes With Harissa, Yogurt, And Toasted Almonds");
    expect(r.recipe.prepMin).toBe(10);
    expect(r.recipe.cookMin).toBe(40);
    expect(r.recipe.tags).toEqual(["Molly Favorites"]);
    const potatoes = r.recipe.ingredients.find((i) => i.nameNorm === "yukon gold potato")!;
    expect([potatoes.qty, potatoes.qtyMax]).toEqual([2, 3]);
    const oil = r.recipe.ingredients.find((i) => i.nameNorm === "extra-virgin olive oil")!;
    expect([oil.qty, oil.unit]).toEqual([5, "tbsp"]); // "ITEM" + "tablespoons …" in the name
    expect(r.recipe.ingredients.find((i) => i.nameNorm === "cauliflower")?.unit).toBe("head");
    expect(r.warnings.some((w) => w.includes("%"))).toBe(true);
  });

  test("Orzo: ingredient without quantity, bunch unit, picks the biggest image", () => {
    const r = parseCrumb(load("Orzo_with_Leeks_Olives_and_Golden_Raisins.crumb"));
    expect(r.recipe.ingredients[0].qty).toBeNull();
    expect(r.recipe.ingredients.find((i) => i.unit === "bunch")?.nameNorm).toBe("flat-leaf parsley");
    expect(r.imageBase64?.length).toBeGreaterThan(20);
  });

  test("amount words left in Crouton names are peeled off", () => {
    const ing = (name: string, quantity: Record<string, unknown>) =>
      parseCrumb({ uuid: "x", name: "T", ingredients: [{ order: 0, ingredient: { name }, quantity }], steps: [], tags: [], images: [] }).recipe.ingredients[0];
    expect(ing("to 2 ripe avocados, halved", { amount: 1, quantityType: "ITEM" })).toMatchObject({ qty: 1, qtyMax: 2, unit: "each", nameNorm: "avocado", raw: "1–2 ripe avocados, halved" });
    expect(ing("large or 2 small bunches kale", { amount: 1, quantityType: "ITEM" })).toMatchObject({ qtyMax: 2, unit: "bunch", nameNorm: "kale" });
    expect(ing("packed cup fresh dill", { amount: 0.33, quantityType: "ITEM" })).toMatchObject({ unit: "cup", nameNorm: "dill" });
    expect(ing("block firm tofu, drained", { amount: 1, quantityType: "BLOCK" })).toMatchObject({ unit: "block", nameNorm: "firm tofu" });
    expect(ing("plus 1/4 cup cornstarch, divided", { amount: 1, quantityType: "TEASPOON" })).toMatchObject({ unit: "tsp", nameNorm: "cornstarch" });
  });

  test("breads and simple vegetable dishes are sides, not dinners", () => {
    const meal = (name: string) => parseCrumb({ uuid: "x", name, ingredients: [], steps: [], tags: [], images: [] }).recipe.mealTypes;
    expect(meal("Quick Poppy Seed Rolls")).toEqual(["side"]);
    expect(meal("Roasted Broccoli With Vinegar-Mustard Glaze")).toEqual(["side"]);
    expect(meal("Roasted Cauliflower And Potatoes With Harissa")).toEqual(["dinner"]);
  });

  test("rejects files that aren't Crouton recipes", () => {
    expect(() => parseCrumb({ foo: 1 })).toThrow();
  });
});

import { toCrumb } from "@/lib/import/croutonExport";
describe("export to Crouton", () => {
  test("round-trips through our own Crouton reader", () => {
    const original = parseCrumb(load("Beef_Kebabs_with_Cumin_Marinade.crumb")).recipe;
    const back = parseCrumb(JSON.parse(JSON.stringify(toCrumb(original)))).recipe;
    expect(back.title).toBe(original.title);
    expect(back.servings).toBe(original.servings);
    expect(back.steps).toEqual(original.steps);
    expect(back.ingredients.map((i) => [i.qty, i.unit, i.nameNorm])).toEqual(original.ingredients.map((i) => [i.qty, i.unit, i.nameNorm]));
  });
  test("units Crouton lacks go in the name; ranges use secondaryAmount", () => {
    const c = toCrumb({
      title: "T", servings: 2, prepMin: 10, cookMin: null, steps: [], notes: null, sourceUrl: null, sourceName: null, tags: ["Loved"],
      mealTypes: ["dinner"], mainProtein: null, kidFriendly: false, isKidMeal: false, origin: "manual", externalId: null,
      ingredients: [
        { raw: "", qty: 3, qtyMax: null, unit: "clove", name: "garlic", nameNorm: "garlic", note: "minced", ok: true },
        { raw: "", qty: 2, qtyMax: 3, unit: "each", name: "potatoes", nameNorm: "potato", note: null, ok: true },
      ],
    });
    expect(c.ingredients[0]).toMatchObject({ ingredient: { name: "clove garlic, minced" }, quantity: { amount: 3, quantityType: "ITEM" } });
    expect(c.ingredients[1].quantity).toEqual({ amount: 2, secondaryAmount: 3, quantityType: "ITEM" });
    expect(c.duration).toBe(10);
    expect(c.tags[0].name).toBe("Loved");
  });
});
