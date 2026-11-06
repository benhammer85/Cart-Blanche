import { describe, expect, test } from "vitest";
import { buildShoppingList, portionsFor, scaleQty, type PlannedMealForList, type BuildListOptions } from "@/lib/list/buildList";
import { formatQty, formatAmount, fromBase, canonicalUnit, mergeKey } from "@/lib/units";
import type { IngredientInfo } from "@/lib/types";

describe("unit table", () => {
  test("aliases", () => {
    expect(canonicalUnit("Tablespoons")).toBe("tbsp");
    expect(canonicalUnit("T")).toBe("tbsp");
    expect(canonicalUnit("t")).toBe("tsp");
    expect(canonicalUnit("lbs.")).toBe("lb");
    expect(canonicalUnit("onion")).toBeNull();
  });
  test("volumes and weights merge, counts don't", () => {
    expect(mergeKey("tbsp")).toBe(mergeKey("cup"));
    expect(mergeKey("oz")).toBe(mergeKey("lb"));
    expect(mergeKey("each")).not.toBe(mergeKey("can"));
  });
  test("friendly conversion back", () => {
    expect(fromBase(48 + 24, "volume")).toEqual({ qty: 1.5, unit: "cup" }); // 1½ cups in tsp
    expect(fromBase(6, "volume")).toEqual({ qty: 2, unit: "tbsp" });
    expect(fromBase(453.592 * 1.5, "weight")).toEqual({ qty: 1.5, unit: "lb" });
    expect(fromBase(28.3495 * 8, "weight")).toEqual({ qty: 8, unit: "oz" });
  });
  test("formatting", () => {
    expect(formatQty(1.5)).toBe("1½");
    expect(formatQty(0.333)).toBe("⅓");
    expect(formatAmount(2, "can")).toBe("2 cans");
    expect(formatAmount(3, "each")).toBe("3");
    expect(formatAmount(2, "each", 3)).toBe("2–3");
  });
  test("scaling", () => {
    expect(scaleQty(2, 4, 2)).toBe(1);
    expect(scaleQty(null, 4, 2)).toBeNull();
  });
});

describe("portions", () => {
  test("Asa (6) and Saul (4) are half portions each", () => {
    const p = portionsFor(
      [
        { kind: "adult", birthdate: null, portion_override: null },
        { kind: "adult", birthdate: null, portion_override: null },
        { kind: "kid", birthdate: "2020-07-30", portion_override: null },
        { kind: "kid", birthdate: "2022-03-22", portion_override: null },
      ],
      new Date("2026-11-06"),
    );
    expect(p).toEqual({ adults: 2, kids: 2, everyone: 3, kidsOnly: 1 });
  });
});

const ING = (name_norm: string, extra: Partial<IngredientInfo> = {}): [string, IngredientInfo] => [
  name_norm,
  { name_norm, category_id: null, is_staple: false, is_out: false, pack_size: null, learned_store_id: null, learned_section_id: null, ...extra },
];

function opts(ingredients: [string, IngredientInfo][] = []): BuildListOptions {
  return {
    selectedStoreIds: ["mb"],
    stores: [{ id: "mb", name: "Market Basket", location: null, sort_order: 0, is_bulk: false, archived: false }],
    categories: [],
    rules: [],
    sections: [],
    ingredients: new Map(ingredients),
    synonyms: { "garlic clove": "garlic" },
  };
}

const meal = (key: string, servings: number, base: number, ings: [number | null, string | null, string][]): PlannedMealForList => ({
  key, title: key, recipeId: key, baseServings: base, servings,
  ingredients: ings.map(([qty, unit, name_norm]) => ({ qty, qty_max: null, unit, name: name_norm, name_norm, raw_text: name_norm, parsed_ok: true })),
});

describe("buildShoppingList merging", () => {
  test("merges volumes across units and scales servings", () => {
    const items = buildShoppingList(
      [meal("A", 2, 4, [[1, "cup", "yogurt"]]), meal("B", 4, 4, [[4, "tbsp", "yogurt"]])],
      opts(),
    );
    // ½ cup + ¼ cup = ¾ cup
    expect(items).toHaveLength(1);
    expect(items[0].displayQty).toBe("¾ cup");
    expect(items[0].sourceMeals.map((m) => m.title)).toEqual(["A", "B"]);
  });

  test("count items round up and stay 'each'", () => {
    const items = buildShoppingList([meal("A", 3, 4, [[1, "each", "onion"]]), meal("B", 4, 4, [[1, "each", "onion"]])], opts());
    expect(items[0].qty).toBe(2); // 0.75 + 1 → 2 onions
    expect(items[0].displayQty).toBe("2");
  });

  test("mixed units show both", () => {
    const items = buildShoppingList([meal("A", 4, 4, [[3, "each", "garlic clove"], [2, "clove", "garlic"]])], opts());
    expect(items).toHaveLength(1);
    expect(items[0].displayQty).toBe("3 + 2 cloves");
  });

  test("pantry staples are skipped unless out", () => {
    const o = opts([ING("salt", { is_staple: true }), ING("pepper", { is_staple: true }), ING("olive oil", { is_staple: true, is_out: true })]);
    const items = buildShoppingList([meal("A", 4, 4, [[1, "tsp", "salt"], [null, null, "salt and pepper"], [2, "tbsp", "olive oil"]])], o);
    expect(items.map((i) => i.nameNorm)).toEqual(["olive oil"]);
    expect(items[0].wasOut).toBe(true);
  });

  test("ranges use the high end", () => {
    const m = meal("A", 4, 4, []);
    m.ingredients.push({ qty: 2, qty_max: 3, unit: "each", name: "potato", name_norm: "potato", raw_text: "", parsed_ok: true });
    expect(buildShoppingList([m], opts())[0].qty).toBe(3);
  });
});

describe("citrus and quantity addition", () => {
  test("lemon juice by volume becomes whole lemons", () => {
    const items = buildShoppingList([meal("A", 4, 4, [[2, "tbsp", "lemon"], [1, "each", "lemon"]])], opts());
    expect(items[0].displayQty).toBe("2"); // 2 tbsp ≈ 1 lemon + 1 lemon
  });
  test("addQty", async () => {
    const { addQty } = await import("@/lib/units");
    expect(addQty(2, "lb", 12, "oz")).toEqual({ qty: 2.75, unit: "lb" });
    expect(addQty(1, "can", 2, "can")).toEqual({ qty: 3, unit: "can" });
    expect(addQty(1, "can", 2, "each")).toBeNull();
    expect(addQty(null, "lb", 1, "lb")).toBeNull();
  });
});
