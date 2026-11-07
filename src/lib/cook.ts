// Which ingredients a step uses, so cook mode can show them under the step.
//
// "Add the chicken thighs and garlic" → chicken thighs, garlic.
// Matches the full name first ("soy sauce"), then the main word ("thighs" for
// "chicken thighs", "oil" for "olive oil"), then a leading protein ("chicken").

interface StepIngredient {
  name: string;
  name_norm: string;
}

// Main words too vague to match on their own ("sauce" could be any sauce).
const VAGUE = new Set(["sauce", "powder", "paste", "flakes", "mix", "blend", "seasoning", "extract", "juice", "zest", "leaves", "leaf", "seed", "seeds", "water", "stock", "broth", "cream", "vinegar", "sugar", "flour", "salt", "pepper", "spice", "spices", "herbs"]);
const LEADING = new Set(["chicken", "beef", "pork", "shrimp", "salmon", "tofu", "turkey", "lamb", "sausage", "bacon", "cod", "tilapia", "steak", "eggs", "egg", "rice", "pasta", "noodles", "beans", "lentils", "chickpeas", "spinach", "kale", "broccoli", "mushrooms", "onion", "garlic", "ginger", "tomatoes", "potatoes"]);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (w: string) => new RegExp(`\\b${esc(w)}(e?s)?\\b`, "i");

function phrases(i: StepIngredient): string[] {
  const norm = i.name_norm.toLowerCase().trim();
  const words = norm.split(/\s+/).filter(Boolean);
  const out = [norm];
  const head = words[words.length - 1];
  if (words.length > 1 && head && head.length >= 3 && !VAGUE.has(head)) out.push(head);
  if (words.length > 1 && LEADING.has(words[0])) out.push(words[0]);
  return out;
}

/** Ingredients mentioned in a step, in the order the step mentions them. */
export function ingredientsForStep<T extends StepIngredient>(step: string, ingredients: T[]): T[] {
  const text = step.toLowerCase();
  const found: { i: T; at: number; exact: boolean }[] = [];
  for (const i of ingredients) {
    let best: { at: number; exact: boolean } | null = null;
    phrases(i).forEach((p, n) => {
      const m = word(p).exec(text);
      if (m && (!best || (n === 0 && !best.exact))) best = { at: m.index, exact: n === 0 };
    });
    if (best) found.push({ i, ...(best as { at: number; exact: boolean }) });
  }
  // If one ingredient matched exactly ("olive oil"), drop loose matches of the same word ("sesame oil" via "oil").
  const exactWords = new Set(found.filter((f) => f.exact).flatMap((f) => f.i.name_norm.toLowerCase().split(/\s+/)));
  return found
    .filter((f) => f.exact || !phrases(f.i).slice(1).some((p) => exactWords.has(p)))
    .sort((a, b) => a.at - b.at)
    .map((f) => f.i);
}
