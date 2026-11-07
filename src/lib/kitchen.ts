// What's in our kitchen, and how that changes a recipe.

export const KITCHEN: { key: string; label: string }[] = [
  { key: "induction", label: "Induction cooktop" },
  { key: "nonstick", label: "Nonstick pans" },
  { key: "stainless", label: "Stainless steel pans" },
  { key: "carbon-steel", label: "Carbon steel pans" },
  { key: "cast-iron", label: "Cast iron" },
  { key: "dutch-oven", label: "Large Dutch oven" },
  { key: "instant-pot", label: "Instant Pot (8 qt)" },
  { key: "slow-cooker", label: "Slow cooker" },
  { key: "sheet-pans", label: "Baking sheets" },
  { key: "glass-dishes", label: "Glass baking dishes" },
  { key: "convection", label: "Convection oven" },
  { key: "air-fry-oven", label: "Air fry mode in the oven" },
  { key: "air-fryer", label: "Separate air fryer" },
  { key: "grill", label: "Outdoor grill" },
  { key: "blender", label: "High-speed blender" },
  { key: "food-processor", label: "Food processor" },
  { key: "microwave", label: "Microwave" },
];

/** Our setup as of November 2026 (from Ben). */
export const OUR_KITCHEN = ["induction", "nonstick", "stainless", "carbon-steel", "dutch-oven", "instant-pot", "sheet-pans", "glass-dishes", "convection", "air-fry-oven", "grill", "blender", "food-processor"];

/** One paragraph for AI prompts: what we cook with and what we don't have. */
export function kitchenSummary(keys: string[] | undefined): string | null {
  if (!keys?.length) return null;
  const has = new Set(keys);
  const names = KITCHEN.filter((k) => has.has(k.key)).map((k) => k.label.toLowerCase());
  const lacks = [
    !has.has("slow-cooker") && "no slow cooker (use the Instant Pot or Dutch oven instead)",
    !has.has("air-fryer") && has.has("air-fry-oven") && "air frying is done in the oven's air-fry mode",
    !has.has("air-fryer") && !has.has("air-fry-oven") && "no air fryer",
    !has.has("grill") && "no grill",
  ].filter(Boolean);
  return `Our kitchen: ${names.join(", ")}.${lacks.length ? ` Note: ${lacks.join("; ")}.` : ""}`;
}

/** Short, practical notes for a step, given what we have. */
export function kitchenTips(step: string, keys: string[] | undefined): string[] {
  if (!keys?.length) return [];
  const has = new Set(keys);
  const t = step.toLowerCase();
  const tips: string[] = [];
  if (/slow[- ]cooker|crock[- ]?pot/.test(t) && !has.has("slow-cooker")) {
    tips.push(
      has.has("instant-pot")
        ? "No slow cooker: use the Instant Pot’s Slow Cook setting with the lid vented, or the Dutch oven, covered, at 300°F."
        : "No slow cooker: use a covered Dutch oven at 300°F.",
    );
  }
  if (/air[- ]?fry/.test(t) && !has.has("air-fryer") && has.has("air-fry-oven")) {
    tips.push("Use the oven’s Air Fry mode: spread in one layer on a baking sheet and check a few minutes early.");
  }
  if (/cast[- ]iron/.test(t) && !has.has("cast-iron") && has.has("carbon-steel")) tips.push("Carbon steel works the same as cast iron here.");
  if (/(pyrex|glass (baking )?dish)/.test(t) && has.has("induction") && /(stove|burner|over (medium|high|low)|simmer|boil)/.test(t)) {
    tips.push("Glass dishes can’t go on the induction cooktop; use a stainless pan for this part.");
  }
  if (has.has("convection") && /\b(bake|roast)\b/.test(t) && /\d{3}\s*°?\s*f\b/.test(t) && !/convection/.test(t)) {
    tips.push("On convection, set the oven 25°F lower or check a few minutes early.");
  }
  if (/\bgrill\b/.test(t) && !has.has("grill")) tips.push("No grill: use a hot carbon steel or stainless pan, or the broiler.");
  return tips;
}
