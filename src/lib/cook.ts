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

// The last word is just a shape or cut ("walnut pieces", "broccoli florets").
const FORM = new Set(["piece", "floret", "slice", "wedge", "thread", "rib", "sprig", "clove", "stalk", "leave", "leaf", "head", "bunch", "fillet", "strip", "chunk", "cube", "half", "halve", "round", "spear"]);
// Words that describe rather than name ("toasted sesame seeds" is sesame).
const DESC = new Set(["fresh", "dried", "ground", "whole", "large", "small", "medium", "toasted", "pure", "unsweetened", "light", "dark", "raw", "frozen", "boneless", "skinless", "extra", "virgin", "sweet", "mild", "chopped", "minced", "sliced", "diced", "shredded", "grated", "kosher", "fine", "coarse", "unsalted", "salted", "plain", "organic", "simmering", "aluminum-free"]);
const single = (w: string) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "");

type Phrase = { p: string; kind: "full" | "head" | "lead" | "main" };

function tagged(i: StepIngredient): Phrase[] {
  const norm = i.name_norm.toLowerCase().trim();
  const words = norm.split(/\s+/).filter(Boolean);
  const out: Phrase[] = [{ p: norm, kind: "full" }];
  if (words.length < 2) return out;
  const head = words[words.length - 1];
  const vagueHead = VAGUE.has(head) || FORM.has(single(head));
  if (head.length >= 3 && !vagueHead) out.push({ p: head, kind: "head" });
  // "chicken thighs" → chicken; but not "chicken stock", "rice vinegar", "garlic powder".
  if (LEADING.has(words[0]) && !VAGUE.has(head)) out.push({ p: words[0], kind: "lead" });
  // "balsamic vinegar" → balsamic, "walnut pieces" → walnut (only used when no other ingredient shares it).
  if (vagueHead && head !== "stock" && head !== "broth") {
    const main = words.slice(0, -1).reverse().find((w) => w.length >= 4 && !DESC.has(w) && !VAGUE.has(w));
    if (main && !out.some((x) => x.p === main)) out.push({ p: main, kind: "main" });
  }
  return out;
}

function phrases(i: StepIngredient): string[] {
  return tagged(i).map((x) => x.p);
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

/**
 * A step split into plain text and ingredient mentions, so each mention can be
 * tapped for its amount: "Mix flour and baking soda" → flour, baking soda.
 * A word several ingredients share ("cheese" for cheddar, Gruyère and
 * Parmesan) points to all of them. A vague word ("flour", "sugar") counts
 * only when one ingredient has it.
 */
export function stepSegments<T extends StepIngredient>(step: string, ingredients: T[]): { text: string; ingredients?: T[] }[] {
  const heads = new Map<string, number>();
  for (const i of ingredients) {
    const w = i.name_norm.toLowerCase().trim().split(/\s+/);
    const h = w[w.length - 1];
    if (h) heads.set(h, (heads.get(h) ?? 0) + 1);
  }
  // Each word or phrase → the ingredients it can mean.
  const byTerm = new Map<string, T[]>();
  const exact = new Map<string, T>();
  const mains = new Map<string, number>();
  for (const i of ingredients) for (const t of tagged(i)) if (t.kind !== "main") mains.set(t.p, (mains.get(t.p) ?? 0) + 1);
  for (const i of ingredients) for (const t of tagged(i)) if (t.kind === "main") mains.set(t.p, (mains.get(t.p) ?? 0) + 1);
  for (const i of ingredients) {
    const norm = i.name_norm.toLowerCase().trim();
    const w = norm.split(/\s+/);
    const h = w[w.length - 1];
    const ps = new Set(tagged(i).filter((t) => t.kind !== "main" || mains.get(t.p) === 1).map((t) => t.p));
    if (w.length > 1 && h && h.length >= 3 && VAGUE.has(h) && heads.get(h) === 1) ps.add(h);
    for (const p of ps) byTerm.set(p, [...(byTerm.get(p) ?? []), i]);
    exact.set(norm, i);
  }
  // An ingredient whose whole name is the word ("cheese") wins over ones that end in it.
  const terms = [...byTerm.entries()].map(([p, list]) => ({ p, list: exact.has(p) ? [exact.get(p)!] : list }));
  terms.sort((a, b) => b.p.length - a.p.length);
  // Mark the spans each term covers, longest terms first, never overlapping.
  const marks: { from: number; to: number; list: T[] }[] = [];
  for (const { p, list } of terms) {
    const re = new RegExp(`\\b${esc(p)}(e?s)?\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(step))) {
      const from = m.index, to = m.index + m[0].length;
      if (!marks.some((k) => from < k.to && to > k.from)) marks.push({ from, to, list });
    }
  }
  marks.sort((a, b) => a.from - b.from);
  const out: { text: string; ingredients?: T[] }[] = [];
  let at = 0;
  for (const k of marks) {
    if (k.from > at) out.push({ text: step.slice(at, k.from) });
    out.push({ text: step.slice(k.from, k.to), ingredients: k.list });
    at = k.to;
  }
  if (at < step.length) out.push({ text: step.slice(at) });
  return out;
}
