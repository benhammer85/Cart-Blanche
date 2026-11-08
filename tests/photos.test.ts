import { describe, expect, test } from "vitest";
import { dishWords, matchScore, searchTerms } from "@/lib/photos";

describe("comparable photos", () => {
  test("dish words drop how it's cooked", () => {
    expect(dishWords("Chicken Chile Verde Pressure Cooker")).toEqual(["chicken", "chile", "verde"]);
    expect(dishWords("Air-Fryer Chicken Thighs")).toEqual(["chicken", "thigh"]);
    expect(searchTerms("Easy Baked Oatmeal")).toBe("baked oatmeal");
  });
  test("ranks recipes by how much of the dish they name", () => {
    const w = dishWords("Chicken Chile Verde");
    expect(matchScore("https://www.gimmesomeoven.com/verde-chicken-enchilada-casserole/", w)).toBeCloseTo(2 / 3);
    expect(matchScore("https://www.budgetbytes.com/crock-pot-salsa-chicken/", w)).toBeCloseTo(1 / 3);
    expect(matchScore("https://cookieandkate.com/videos/chile-verde/", w)).toBe(0);
    const o = dishWords("Baked Oatmeal");
    expect(matchScore("https://www.budgetbytes.com/cranberry-apple-baked-oatmeal/", o)).toBe(1);
    expect(matchScore("https://www.recipetineats.com/oatmeal-raisin-cookie-soft-chewy/", o)).toBe(0.5);
  });
});
