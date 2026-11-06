import { describe, expect, test } from "vitest";
import { recipeFromHtml, isoMinutes } from "@/lib/import/jsonld";

const page = (ld: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head></html>`;

describe("JSON-LD recipe extraction", () => {
  test("finds Recipe inside @graph with HowToSteps", () => {
    const html = page({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", name: "x" },
        {
          "@type": ["Recipe"], name: "Lemon Chicken &amp; Rice", recipeYield: ["4", "4 servings"],
          prepTime: "PT15M", cookTime: "PT30M", recipeIngredient: ["1 lb chicken thighs", "1 cup rice"],
          recipeInstructions: [{ "@type": "HowToSection", name: "Chicken", itemListElement: [{ "@type": "HowToStep", text: "Sear." }] }, { "@type": "HowToStep", text: "Serve." }],
          image: [{ url: "https://x.test/a.jpg" }], recipeCategory: "Dinner", keywords: "easy, weeknight",
        },
      ],
    });
    const r = recipeFromHtml(html, "https://www.example.com/r")!;
    expect(r.title).toBe("Lemon Chicken & Rice");
    expect(r.servings).toBe(4);
    expect(r.prepMin).toBe(15);
    expect(r.steps).toEqual([{ text: "Chicken", isSection: true }, { text: "Sear." }, { text: "Serve." }]);
    expect(r.ingredients.map((i) => i.nameNorm)).toEqual(["chicken thigh", "rice"]);
    expect(r.imageUrl).toBe("https://x.test/a.jpg");
    expect(r.sourceName).toBe("example.com");
    expect(r.mainProtein).toBe("chicken");
  });
  test("returns null when the page has no recipe", () => {
    expect(recipeFromHtml("<html></html>", "https://x.test")).toBeNull();
  });
  test("ISO durations", () => {
    expect(isoMinutes("PT1H15M")).toBe(75);
    expect(isoMinutes("P0DT0H20M")).toBe(20);
    expect(isoMinutes("nope")).toBeNull();
  });
});
