import { describe, expect, test } from "vitest";
import { buildDiscoverPrompt, buildTasteProfile, isBlockedSite, parseDiscoverAnswer } from "@/lib/discover";

const r = (title: string, extra: Partial<{ tags: string[]; main_protein: string | null; kid_friendly: boolean; times_made: number }> = {}) => ({
  title, tags: [], main_protein: null, kid_friendly: false, times_made: 0, ...extra,
});

describe("Discover taste profile", () => {
  const recipes = [
    r("Sheet-Pan Bibimbap", { tags: ["Loved"], main_protein: "beef" }),
    r("Instant Pot Chipotle Chicken", { tags: ["Instant Pot", "Loved"], main_protein: "chicken", kid_friendly: true }),
    r("Mushroom Carbonara", { tags: ["Loved"] }),
    r("Takeout-Style Sesame Noodles", { tags: ["Molly Favorites"] }),
    r("Chicken Chile Verde Pressure Cooker", { tags: ["Asa and Saul Favorites"], main_protein: "chicken" }),
    r("Some Unflagged Casserole", { times_made: 0 }),
  ];
  const p = buildTasteProfile(recipes, ["Molly Favorites", "Asa and Saul Favorites"]);

  test("uses the recipes we flagged in Crouton", () => {
    expect(p.favorites).toContain("Sheet-Pan Bibimbap");
    expect(p.favorites).toContain("Takeout-Style Sesame Noodles");
    expect(p.favorites).not.toContain("Some Unflagged Casserole");
    expect(p.proteins[0]).toBe("chicken");
    expect(p.cuisines).toEqual(expect.arrayContaining(["Korean", "Mexican", "Italian", "Chinese"]));
    expect(p.styles[0]).toBe("Instant Pot / pressure cooker");
  });

  test("prompt carries the filters and no names", () => {
    const prompt = buildDiscoverPrompt(p, { store: "Trader Joe's", maxMinutes: 30, kidFriendly: true }, [6, 4], ["cilantro"], ["Beef Kebabs"]);
    expect(prompt).toContain("easy to buy at Trader Joe's");
    expect(prompt).toContain("signature products");
    expect(buildDiscoverPrompt(p, { store: "Costco" }, [], [], [])).toContain("family pack");
    expect(buildDiscoverPrompt(p, { store: "H Mart" }, [], [], [])).toContain("Korean");
    expect(prompt).toContain("30 minutes");
    expect(prompt).toContain("aged 6 and 4");
    expect(prompt).toContain("Never use: cilantro");
    expect(prompt).toContain("cooking.nytimes.com");
    expect(prompt).not.toMatch(/Asa|Saul|Molly|Ben\b/);
  });
});

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
