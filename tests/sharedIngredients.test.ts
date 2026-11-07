import { describe, expect, test } from "vitest";
import { buildShoppingList, type PlannedMealForList } from "@/lib/list/buildList";
import type { Store } from "@/lib/types";

const ing = (raw: string, qty: number | null, unit: string | null, name: string, name_norm = name) => ({ raw_text: raw, qty, qty_max: null, unit, name, name_norm, parsed_ok: true });
const meal = (title: string, ingredients: ReturnType<typeof ing>[], servings = 4, baseServings = 4): PlannedMealForList => ({ key: title, title, recipeId: title, baseServings, servings, ingredients });
const stores: Store[] = [{ id: "mb", name: "Market Basket", location: null, sort_order: 0, is_bulk: false, archived: false }];
const opts = { selectedStoreIds: ["mb"], stores, categories: [], rules: [], sections: [], ingredients: new Map(), synonyms: {} };

describe("the same ingredient in several dinners", () => {
  test("½ cup + 2 cups of rice is 2½ cups on the list", () => {
    const list = buildShoppingList([meal("Fried Rice", [ing("1/2 cup rice", 0.5, "cup", "rice")]), meal("Burrito Bowls", [ing("2 cups rice", 2, "cup", "rice")])], opts);
    const rice = list.filter((i) => i.nameNorm === "rice");
    expect(rice).toHaveLength(1);
    expect(rice[0].displayQty).toBe("2½ cups");
    expect(rice[0].sourceMeals.map((m) => m.title)).toEqual(["Fried Rice", "Burrito Bowls"]);
  });

  test("tablespoons and cups add up; ounces and pounds add up", () => {
    const list = buildShoppingList(
      [meal("A", [ing("4 tbsp butter", 4, "tbsp", "butter"), ing("8 oz chicken thighs", 8, "oz", "chicken thighs", "chicken thigh")]), meal("B", [ing("1/4 cup butter", 0.25, "cup", "butter"), ing("1 lb chicken thighs", 1, "lb", "chicken thighs", "chicken thigh")])],
      opts,
    );
    expect(list.find((i) => i.nameNorm === "chicken thigh")?.displayQty).toBe("1½ lb");
    expect(list.find((i) => i.nameNorm === "butter")?.displayQty).toBe("½ cup");
  });

  test("amounts scale to the servings we're cooking", () => {
    const list = buildShoppingList([meal("Rice for 6", [ing("1 cup rice", 1, "cup", "rice")], 6, 4)], opts);
    expect(list[0].displayQty).toBe("1½ cups");
  });

  test("things that can't be added are listed side by side", () => {
    const list = buildShoppingList([meal("A", [ing("2 cups spinach", 2, "cup", "spinach")]), meal("B", [ing("5 oz spinach", 5, "oz", "spinach")])], opts);
    expect(list).toHaveLength(1);
    expect(list[0].displayQty).toBe("2 cups + 5 oz");
  });
});
