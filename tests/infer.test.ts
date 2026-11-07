import { describe, expect, test } from "vitest";

describe("not every recipe is a dinner", () => {
  test("sauces, drinks, basics and sides stay out of dinner plans", async () => {
    const { inferMealTypes } = await import("@/lib/infer");
    const dinner = (t: string) => inferMealTypes(t, []).includes("dinner");
    for (const t of [
      "Quick & Classic Italian Dressing", "How To Cook Frozen Shrimp", "Iced Brown Sugar Oat Milk Shaken Espresso Latte",
      "The Best Instant Pot Rice", "Instant Pot Garlic Rice", "The Best Pizza Dough", "Quick Pickled Jalepenos Or Onions",
      "Rhubarb Crisp", "Sugar Snap Salad", "Fries (Baked!)", "Three-Cup Vegetables", "Chinese Broccoli with Oyster Sauce",
      "Savory Gruyère Bread with Ham", "Coconut Tapioca with Pineapple, Mango, and Lime",
    ]) expect(dinner(t), t).toBe(false);
    for (const t of [
      "Kale Sauce Pasta", "Soy Sauce Noodles with Cabbage and Fried Eggs", "Garlic Butter Steak Bites", "Fried Rice",
      "Lemony Chicken-Feta Meatball Soup With Spinach", "Teriyaki Salmon Quinoa Bowls", "Chipotle Chicken Salad",
      "One-Pot Chicken and Rice With Caramelized Lemon", "Foolproof Pan Pizza",
    ]) expect(dinner(t), t).toBe(true);
  });
});
