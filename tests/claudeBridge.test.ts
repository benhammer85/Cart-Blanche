import { describe, expect, test } from "vitest";
import { parseClaudeReply, buildClaudePrompt, extractJson } from "@/lib/import/claudeBridge";

const good = {
  recipes: [
    {
      title: "Sheet-pan gnocchi", servings: 4, prepMinutes: 15, tags: ["vegetarian"],
      ingredients: [{ qty: 1, unit: "lb", name: "shelf-stable gnocchi" }, { qty: 2, unit: "", name: "bell peppers" }],
      steps: ["Heat oven.", "Roast."], kidNote: "Serve plain gnocchi with butter.",
    },
  ],
};

describe("Claude bridge", () => {
  test("valid reply → drafts tagged 'from Claude'", () => {
    const r = parseClaudeReply(JSON.stringify(good));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.recipes[0].tags).toContain("from Claude");
    expect(r.recipes[0].ingredients[1]).toMatchObject({ qty: 2, unit: "each", nameNorm: "bell pepper" });
    expect(r.recipes[0].notes).toMatch(/^Kids:/);
    expect(r.recipes[0].origin).toBe("claude");
  });

  test("tolerates code fences, chatter, smart quotes and trailing commas", () => {
    const text = "Sure! Here you go:\n```json\n" + JSON.stringify(good).replace(/\]\}$/, ",]}") + "\n```\nEnjoy!";
    expect(parseClaudeReply(text).ok).toBe(true);
    expect(extractJson("x {“a”: 1} y")).toBe('{"a": 1}');
  });

  test("string numbers are accepted", () => {
    const r = parseClaudeReply(JSON.stringify({ recipes: [{ ...good.recipes[0], servings: "4", prepMinutes: "20" }] }));
    expect(r.ok).toBe(true);
  });

  test("friendly errors", () => {
    const noJson = parseClaudeReply("no json here");
    expect(noJson.ok).toBe(false);
    if (!noJson.ok) expect(noJson.errors[0]).toMatch(/Couldn’t find any JSON/);

    const bad = parseClaudeReply(JSON.stringify({ recipes: [{ title: "", ingredients: [] }] }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.join(" ")).toMatch(/title/);
      expect(bad.errors.join(" ")).toMatch(/no ingredients/);
    }

    const empty = parseClaudeReply('{"recipes": []}');
    expect(empty.ok).toBe(false);
  });

  test("prompt includes constraints and the exact schema, and no names", () => {
    const p = buildClaudePrompt({
      adults: 2, kidAges: [6, 4], count: 5, maxPrep: 30, stores: ["Costco", "Trader Joe's"], avoid: ["cilantro"],
      mustInclude: [], favoriteTitles: ["Beef Kebabs"], kidFavorites: ["hot dogs", "nuggets"],
    });
    expect(p).toContain("2 adults and 2 kids (ages 6 and 4)");
    expect(p).toContain("Never use: cilantro");
    expect(p).toContain('"kidNote": ""');
    expect(p).not.toMatch(/Asa|Saul|Ben|Molly/);
  });
});
