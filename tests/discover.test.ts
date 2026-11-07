import { describe, expect, test } from "vitest";
import { BROWSE_SOURCES, isBlockedSite, parseDiscoverAnswer } from "@/lib/discover";
import { interleave, sourcesFor } from "@/lib/newRecipes";

describe("Discover answer parsing", () => {
  test("pulls the JSON array out of prose and fences", () => {
    const text = 'Here you go:\n```json\n[{"title":"A","url":"https://www.seriouseats.com/a","site":"Serious Eats","why":"x"},{"title":"bad","url":"nope"}]\n```';
    expect(parseDiscoverAnswer(text)).toEqual([{ title: "A", url: "https://www.seriouseats.com/a", site: "Serious Eats", why: "x" }]);
    expect(parseDiscoverAnswer("no json")).toEqual([]);
  });
  test("blocked sites", () => {
    expect(isBlockedSite("https://www.traderjoes.com/home/recipes/x")).toBe(true);
    expect(isBlockedSite("https://cooking.nytimes.com/recipes/1")).toBe(false);
  });
});

describe("new recipes to try", () => {
  test("store pages come first, then general ones", () => {
    const urls = sourcesFor(["Trader Joe's", "Costco"], false, () => 0.5);
    expect(urls.length).toBeGreaterThanOrEqual(3);
    expect(BROWSE_SOURCES.find((s) => s.url === urls[0])?.store).toBe("traderjoes");
    const sites = urls.map((u) => BROWSE_SOURCES.find((s) => s.url === u)!.site);
    expect(new Set(sites).size).toBe(sites.length);
  });
  test("no store pages for stores without them", () => {
    const urls = sourcesFor(["Costco"], true, () => 0.5);
    expect(urls.every((u) => !BROWSE_SOURCES.find((s) => s.url === u)?.store)).toBe(true);
  });
});

test("interleave takes from each list in turn", () => {
  expect(interleave([[1, 2, 3], [4], [5, 6]])).toEqual([1, 4, 5, 2, 6, 3]);
});
