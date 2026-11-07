import { describe, expect, test } from "vitest";
import { isIdea } from "@/lib/ideas";
import { buildPlanPrompt, type AiPlanContext } from "@/lib/ai/planSchema";

describe("ideas", () => {
  test("an AI idea stays an idea until it's cooked", () => {
    expect(isIdea({ tags: ["Idea"], times_made: 0 })).toBe(true);
    expect(isIdea({ tags: ["AI idea"], times_made: 0 })).toBe(true);
    expect(isIdea({ tags: ["Idea"], times_made: 1 })).toBe(false);
    expect(isIdea({ tags: ["Loved"], times_made: 0 })).toBe(false);
  });

  test("ideas may only name products we've confirmed", () => {
    const c: AiPlanContext = {
      mealCount: 3, favoritesPct: 50, mealTypes: ["dinner"], maxPrep: 30, adults: 2, kidAges: [4, 6], includeTags: [], exclude: [], useUp: [],
      variety: true, stores: ["Trader Joe's"], staples: [], favorites: [], recentTitles: [], pinnedIds: [],
      storeProducts: [{ store: "Trader Joe's", notes: "frozen dumplings, cheap flowers", onlyHere: ["soyaki"], buyHere: ["mandarin orange chicken"] }],
    };
    const p = buildPlanPrompt(c);
    expect(p).toContain("only sold here: soyaki");
    expect(p).toContain("we buy here: mandarin orange chicken");
    expect(p).toContain("Never invent or guess product names");
    expect(buildPlanPrompt({ ...c, storeProducts: [] })).toContain("Confirmed products: none listed.");
  });
});
