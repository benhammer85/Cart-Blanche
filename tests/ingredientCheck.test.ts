import { describe, expect, test } from "vitest";
import { checkIngredient, type IngredientRow } from "@/lib/ingredientCheck";

const row = (name: string, extra: Partial<IngredientRow> = {}): IngredientRow => ({ id: "x", name, note: null, qty: null, unit: null, parsed_ok: true, raw_text: name, ...extra });
const fix = (name: string, extra: Partial<IngredientRow> = {}) => checkIngredient(row(name, extra))?.fix ?? null;

describe("checking imported ingredient lines", () => {
  test("moves amounts and prep out of the name", () => {
    expect(fix("diced celery 4 ribs", { qty: 2, unit: "cup", note: "3/4-inch" })).toEqual({ kind: "rename", name: "celery", note: "diced; 4 ribs; 3/4-inch" });
    expect(fix("spinach or kale washed and roughly chopped", { qty: 3, unit: "cup" })).toEqual({ kind: "rename", name: "spinach or kale", note: "washed and roughly chopped" });
  });
  test("tidies kosher salt brands and stray words", () => {
    expect(fix("Diamond Crystal or 1 tsp. Morton kosher salt", { qty: 1.5, unit: "tsp", note: "plus more" })).toEqual({ kind: "rename", name: "kosher salt", note: "Diamond Crystal; or 1 tsp. Morton; plus more" });
    expect(fix("ofr Trader Joe's Hardwood Smoked Pulled Chicken", { qty: 1, unit: "container" })).toEqual({ kind: "rename", name: "Trader Joe's Hardwood Smoked Pulled Chicken", note: null });
  });
  test("splits two things without amounts, but not one thing with an amount", () => {
    expect(fix("Kosher salt and black pepper")).toEqual({ kind: "split", names: ["Kosher salt", "black pepper"], note: null });
    expect(fix("bone-in skin-on chicken thighs and drumsticks", { qty: 3, unit: "lb" })).toBeNull();
  });
  test("flags lost names and non-ingredients", () => {
    expect(fix(") plus more for dusting", { qty: 2.5, unit: "cup" })).toEqual({ kind: "edit" });
    expect(fix("teaspoons", { qty: 2 })).toEqual({ kind: "edit" });
    expect(fix("Blend and freeze!")).toEqual({ kind: "remove" });
  });
  test("leaves good lines alone", () => {
    for (const n of ["all-purpose flour", "fresh cilantro leaves and fine stems", "shredded mozzarella", "cooked and cooled brown rice", "Italian seasoning mix"]) expect(fix(n, { qty: 1, unit: "cup" })).toBeNull();
  });
});
