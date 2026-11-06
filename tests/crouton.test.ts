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
    expect(r.recipe.tags).toEqual(["Instant Pot"]);
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

  test("rejects files that aren't Crouton recipes", () => {
    expect(() => parseCrumb({ foo: 1 })).toThrow();
  });
});
