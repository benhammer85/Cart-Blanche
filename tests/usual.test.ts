import { describe, expect, it } from "vitest";
import { foldVariants, usualKey } from "@/lib/list/usual";

describe("usual items", () => {
  it("folds rice varieties and filler words", () => {
    expect(usualKey("jasmine rice")).toBe("rice");
    expect(usualKey("white rice")).toBe("rice");
    expect(usualKey("organic milk")).toBe("milk");
    expect(usualKey("kirkland signature large eggs")).toBe("eggs");
  });
  it("keeps different products apart", () => {
    expect(usualKey("peanut butter")).not.toBe(usualKey("butter"));
    expect(usualKey("oat milk")).not.toBe(usualKey("milk"));
    expect(usualKey("rice vinegar")).not.toBe("rice");
    expect(usualKey("chicken fried rice")).not.toBe("rice");
  });
  it("names the group after the one bought most and adds up the counts", () => {
    const out = foldVariants([
      { key: "rice", label: "Rice", n: 1 },
      { key: "jasmine rice", label: "Jasmine rice", n: 3 },
      { key: "white rice", label: "White rice", n: 1 },
      { key: "eggs", label: "Eggs", n: 4 },
    ]);
    expect(out).toEqual([
      { key: "jasmine rice", label: "Jasmine rice", n: 5 },
      { key: "eggs", label: "Eggs", n: 4 },
    ]);
  });
});
