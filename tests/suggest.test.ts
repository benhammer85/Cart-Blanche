import { describe, expect, test } from "vitest";
import { buildCandidates, suggestItems } from "@/lib/list/suggest";

const c = buildCandidates(
  ["rotisserie chicken", "romaine", "rosemary", "chicken thigh", "red onion", "ramen noodles"],
  [{ name: "Romaine", name_norm: "romaine" }, { name: "Rotisserie chicken", name_norm: "rotisserie chicken" }, { name: "Rotisserie chicken", name_norm: "rotisserie chicken" }],
);
const labels = (q: string, ex?: Set<string>) => suggestItems(q, c, ex).map((s) => s.label);

describe("suggestions while typing", () => {
  test("starts-with first, most bought first", () => {
    expect(labels("ro")).toEqual(["Rotisserie chicken", "Romaine", "Rosemary"]);
    expect(labels("rot")).toEqual(["Rotisserie chicken"]);
  });
  test("things we buy at a store come first", () => {
    const c2 = buildCandidates([{ name: "rotisserie chicken", bought: true }, "romaine", "rosemary", "rolled oats"], [{ name: "Roll", name_norm: "roll" }]);
    expect(suggestItems("ro", c2).map((s) => s.label)[0]).toBe("Rotisserie chicken");
  });
  test("amounts typed into old list names are dropped", () => {
    const c3 = buildCandidates(["milk"], [{ name: "2 milk", name_norm: "2 milk" }, { name: "Milk", name_norm: "milk" }]);
    expect(suggestItems("mi", c3).map((s) => s.label)).toEqual(["Milk"]);
  });
  test("a later word matches too", () => {
    expect(labels("chick")).toEqual(["Chicken thigh", "Rotisserie chicken"]);
    expect(labels("noo")).toEqual(["Ramen noodles"]);
  });
  test("nothing for one letter, nothing already on the list", () => {
    expect(labels("r")).toEqual([]);
    expect(labels("ro", new Set(["rotisserie chicken"]))).toEqual(["Romaine", "Rosemary"]);
  });
});
