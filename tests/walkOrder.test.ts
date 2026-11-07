import { describe, expect, test } from "vitest";
import { learnWalkOrder, sortSections, walkOrderFor } from "@/lib/list/walkOrder";

describe("walking order", () => {
  test("cold things last, produce first at supermarkets", () => {
    const o = walkOrderFor("Market Basket");
    expect(o[0]).toBe("Produce");
    expect(o.indexOf("Frozen")).toBe(o.length - 2);
    expect(walkOrderFor("Costco").indexOf("Frozen")).toBeGreaterThan(walkOrderFor("Costco").indexOf("Produce"));
  });
  test("sections sort into place; unknown ones just before Other", () => {
    const secs = ["Frozen", "Other", "International", "Produce", "Flowers", "Meat"].map((name) => ({ name }));
    expect(sortSections(secs, "Shaw's").map((s) => s.name)).toEqual(["Produce", "Meat", "International", "Frozen", "Flowers", "Other"]);
  });
  test("learns from the order things were checked off", () => {
    expect(learnWalkOrder(["P", "B", "M", "D", "F"], ["P", "D", "M"])).toEqual(["P", "B", "D", "M", "F"]);
    expect(learnWalkOrder(["P", "B", "M"], ["M", "P"])).toEqual(["P", "B", "M"]); // too little
    expect(learnWalkOrder(["P", "B", "M", "D"], ["D", "D", "B", "P"])).toEqual(["D", "B", "M", "P"]);
  });
});
