import { describe, expect, test } from "vitest";
import { buildVocabulary, correctSpelling, editDistance } from "@/lib/spell";
import { SEED_CATEGORIES, SEED_STAPLES } from "@/lib/seed/defaults";

const vocab = buildVocabulary([...SEED_CATEGORIES.flatMap((c) => c.items), ...SEED_STAPLES]);
const fix = (t: string) => correctSpelling(t, vocab).text;

describe("spelling fixes", () => {
  test("common typos", () => {
    expect(fix("2 lb chicken theighs")).toBe("2 lb chicken thighs");
    expect(fix("chiken thighs")).toBe("chicken thighs");
    expect(fix("chikcen")).toBe("chicken"); // swapped letters
    expect(fix("brocoli")).toBe("broccoli");
    expect(fix("zuchini")).toBe("zucchini");
    expect(fix("Bananna")).toBe("Banana");
    expect(fix("strawberies")).toBe("strawberries");
  });

  test("leaves correct words, short words and numbers alone", () => {
    expect(fix("2 lb chicken thighs")).toBe("2 lb chicken thighs");
    expect(fix("milk")).toBe("milk");
    expect(fix("3 cans black beans")).toBe("3 cans black beans");
    expect(fix("kombucha")).toBe("kombucha"); // unknown but not close to anything
  });

  test("reports what changed so the user can undo", () => {
    expect(correctSpelling("theighs", vocab).corrections).toEqual([{ from: "theighs", to: "thighs" }]);
  });

  test("edit distance", () => {
    expect(editDistance("theighs", "thighs")).toBe(1);
    expect(editDistance("chikcen", "chicken")).toBe(1);
  });
});
