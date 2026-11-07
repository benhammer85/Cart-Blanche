import { describe, expect, test } from "vitest";
import { cleanListLine, splitPastedList } from "@/lib/list/paste";

describe("pasted lists", () => {
  test("checkboxes, bullets and numbers are removed", () => {
    expect(cleanListLine("- [ ] Strawberries")).toBe("Strawberries");
    expect(cleanListLine("[x] White chicken")).toBe("White chicken");
    expect(cleanListLine("☐ Cookies")).toBe("Cookies");
    expect(cleanListLine("○ Shredded cheese")).toBe("Shredded cheese");
    expect(cleanListLine("O Seltzer")).toBe("Seltzer");
    expect(cleanListLine("• 2 lb chicken thighs")).toBe("2 lb chicken thighs");
    expect(cleanListLine("3. Onions")).toBe("Onions");
    expect(cleanListLine("Oat milk")).toBe("Oat milk");
    expect(cleanListLine("2 avocados")).toBe("2 avocados");
  });
  test("lines and commas", () => {
    expect(splitPastedList("- [ ] Milk\n- [ ] Eggs, bananas\n\n")).toEqual(["Milk", "Eggs", "bananas"]);
  });
});
