import { describe, expect, it } from "vitest";
import { substitutesFor } from "@/lib/substitutes";

describe("substitutes", () => {
  it("finds swaps inside longer names and plurals", () => {
    expect(substitutesFor("dried ancho chiles")?.for).toBe("ancho");
    expect(substitutesFor("chipotle peppers in adobo sauce")?.for).toBe("chipotle");
    expect(substitutesFor("shallots")?.for).toBe("shallot");
    expect(substitutesFor("juniper berries")?.for).toBe("juniper");
    expect(substitutesFor("crème fraîche")?.options[0]).toBe("sour cream");
    expect(substitutesFor("Creme Fraiche")?.options[0]).toBe("sour cream");
  });
  it("prefers the most specific match", () => {
    expect(substitutesFor("thai basil")?.for).toBe("thai basil");
    expect(substitutesFor("fresh cilantro leaves")?.for).toBe("fresh cilantro");
  });
  it("doesn't match inside other words", () => {
    expect(substitutesFor("codfish cakes")).toBeNull();
    expect(substitutesFor("salt")).toBeNull();
    expect(substitutesFor("ricotta")?.for).toBe("ricotta");
  });
});
