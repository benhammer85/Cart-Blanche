import { describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { scrubNames } from "@/lib/ai/aiPlanner";
import { buildPlanPrompt } from "@/lib/ai/planSchema";

describe("no names go to the AI", () => {
  test("household names are scrubbed from tags and titles", () => {
    const kids = ["Asa", "Saul"];
    const adults = ["Ben", "Molly"];
    expect(scrubNames("Asa and Saul Favorites", kids, adults)).toBe("kids Favorites");
    expect(scrubNames("Molly Favorites", kids, adults)).toBe("family Favorites");
    expect(scrubNames("Ben's chili", kids, adults)).toBe("family chili");
    expect(scrubNames("Salsa verde", kids, adults)).toBe("Salsa verde"); // "Asa" inside a word is untouched
  });
  test("the plan prompt contains no names when given scrubbed data", () => {
    const p = buildPlanPrompt({
      mealCount: 3, favoritesPct: 70, mealTypes: ["dinner"], maxPrep: 30, adults: 2, kidAges: [6, 4], includeTags: [], exclude: [],
      useUp: [], variety: true, stores: ["Costco"], staples: ["salt"], recentTitles: [], pinnedIds: [],
      favorites: [{ id: "f1", title: "Tacos", tags: [scrubNames("Asa and Saul Favorites", ["Asa", "Saul"], [])], ingredients: ["beef"], timesMade: 1, lastMade: null, kidFriendly: true, prepMin: 20 }],
    });
    expect(p).not.toMatch(/Asa|Saul|Ben|Molly/);
  });
});
