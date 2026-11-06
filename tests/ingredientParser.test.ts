import { describe, expect, test } from "vitest";
import { parseIngredientLine, parsePlainTextRecipe } from "@/lib/ingredientParser";
import { normalizeName } from "@/lib/normalize";

describe("parseIngredientLine", () => {
  const cases: [string, number | null, number | null, string | null, string][] = [
    ["1 1/2 cups chopped onion", 1.5, null, "cup", "onion"],
    ["1½ tbsp olive oil", 1.5, null, "tbsp", "olive oil"],
    ["½ cup pine nuts", 0.5, null, "cup", "pine nuts"],
    ["2-3 large carrots, peeled", 2, 3, "each", "carrot"],
    ["2 to 3 potatoes", 2, 3, "each", "potato"],
    ["1 (15-ounce) can black beans, drained", 1, null, "can", "black beans"],
    ["a pinch of salt", 1, null, "pinch", "salt"],
    ["2 cloves garlic, minced", 2, null, "clove", "garlic"],
    ["1 lb. boneless skinless chicken thighs", 1, null, "lb", "chicken thigh"],
    ["2 T butter", 2, null, "tbsp", "butter"],
    ["2 t vanilla", 2, null, "tsp", "vanilla"],
    ["12 oz frozen peas", 12, null, "oz", "peas"],
    ["2 large eggs", 2, null, "each", "egg"],
    ["0.5 cup coarsely chopped toasted, salted almonds", 0.5, null, "cup", "almonds"],
    ["Juice of 1 lemon", 1, null, "each", "lemon"],
    ["2 heaping tbs PB2", 2, null, "tbsp", "pb2"],
    ["1 large head of cauliflower", 1, null, "head", "cauliflower"],
    ["- milk", null, null, null, "milk"],
    ["Kosher salt", null, null, null, "kosher salt"],
  ];
  test.each(cases)("%s", (line, qty, qtyMax, unit, norm) => {
    const r = parseIngredientLine(line);
    if (qty == null) expect(r.qty).toBeNull();
    else expect(r.qty).toBeCloseTo(qty);
    expect(r.qtyMax).toBe(qtyMax);
    expect(r.unit).toBe(unit);
    expect(r.nameNorm).toBe(norm);
  });

  test("keeps prep in the note", () => {
    const r = parseIngredientLine("3 medium leeks, white and light green parts only, thinly sliced");
    expect(r.nameNorm).toBe("leek");
    expect(r.note).toContain("white and light green");
  });

  test("flags garbled OCR lines", () => {
    expect(parseIngredientLine("% teaspoon freshly ground black pepper").ok).toBe(false);
  });

  test("synonyms apply after normalization", () => {
    expect(normalizeName("3 garlic cloves".replace(/^\d+ /, ""), { "garlic clove": "garlic" })).toBe("garlic");
    expect(parseIngredientLine("1 tsp kosher salt", { "kosher salt": "salt" }).nameNorm).toBe("salt");
  });
});

describe("parsePlainTextRecipe", () => {
  test("title, ingredients, blank line, steps", () => {
    const r = parsePlainTextRecipe("Weeknight Tacos\n\n1 lb ground beef\n8 tortillas\n\n1. Brown the beef.\n2. Warm tortillas.");
    expect(r.title).toBe("Weeknight Tacos");
    expect(r.ingredients).toEqual(["1 lb ground beef", "8 tortillas"]);
    expect(r.steps).toEqual(["Brown the beef.", "Warm tortillas."]);
  });
  test("no title", () => {
    const r = parsePlainTextRecipe("1 cup rice\n2 cups water\n\nBoil.");
    expect(r.title).toBeNull();
    expect(r.ingredients).toHaveLength(2);
    expect(r.steps).toEqual(["Boil."]);
  });
});
