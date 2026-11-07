// Typo fixing for items typed into the list ("theighs" → "thighs").
// Words are checked against the grocery words the app already knows
// (ingredient names, synonyms). Only confident fixes are made:
//   • words of 5+ letters may be 1 edit away; 8+ letters may be 2 edits away
//   • there must be a single best match
// Swapped letters ("chikcen") count as one edit.

const EXTRA_WORDS = [
  "chicken", "thighs", "breasts", "broccoli", "zucchini", "cucumber", "tomatoes", "potatoes", "avocado", "banana",
  "bananas", "yogurt", "cheese", "mozzarella", "parmesan", "spinach", "lettuce", "cilantro", "parsley", "cabbage",
  "cauliflower", "mushrooms", "peppers", "onions", "garlic", "ginger", "lemons", "limes", "strawberries", "blueberries",
  "raspberries", "cereal", "oatmeal", "granola", "crackers", "pretzels", "cookies", "tortillas", "sausage", "salmon",
  "shrimp", "turkey", "noodles", "spaghetti", "macaroni", "lasagna", "ricotta", "sourdough", "bagels", "muffins",
  "coffee", "seltzer", "napkins", "towels", "detergent", "diapers", "wipes", "toothpaste", "shampoo", "vinegar",
  "mayonnaise", "ketchup", "mustard", "hummus", "applesauce", "popsicles", "waffles", "pancake", "syrup", "nuggets",
  "hotdogs", "spaghettios", "edamame", "dumplings", "kimchi", "gochujang", "sriracha", "tahini", "harissa", "chickpeas",
];

/** Damerau–Levenshtein distance (optimal string alignment), capped for speed. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** Build the vocabulary from known ingredient names and synonyms. */
export function buildVocabulary(names: Iterable<string>): Set<string> {
  const vocab = new Set<string>(EXTRA_WORDS);
  for (const n of names) {
    for (const w of n.toLowerCase().split(/[^a-z]+/)) {
      if (w.length < 3) continue;
      vocab.add(w);
      // plurals of known words are fine too
      if (!w.endsWith("s")) vocab.add(w + "s");
      if (/(o|ch|sh)$/.test(w)) vocab.add(w + "es");
      if (/[^aeiou]y$/.test(w)) vocab.add(w.slice(0, -1) + "ies");
    }
  }
  return vocab;
}

export interface Correction {
  from: string;
  to: string;
}

function bestMatch(word: string, vocab: Set<string>): string | null {
  const max = word.length >= 8 ? 2 : word.length >= 5 ? 1 : 0;
  if (!max) return null;
  let best: string | null = null;
  let bestD = max + 1;
  let ties = 0;
  for (const v of vocab) {
    if (Math.abs(v.length - word.length) > max || v[0] !== word[0] && v[1] !== word[1]) continue;
    const dist = editDistance(word, v, max);
    if (dist < bestD) {
      best = v;
      bestD = dist;
      ties = 0;
    } else if (dist === bestD && v !== best) {
      // "tomatos" is close to both "tomato" and "tomatoes" — prefer the plural form match below
      ties++;
    }
  }
  if (!best || bestD > max) return null;
  if (ties > 0) {
    // Accept ties only when they are just singular/plural of the same word.
    const root = best.replace(/(es|s)$/, "");
    const allSameRoot = [...vocab].filter((v) => editDistance(word, v, max) === bestD).every((v) => v.replace(/(es|s)$/, "") === root || v.replace(/ies$/, "y") === root);
    if (!allSameRoot) return null;
    // keep the user's number: plural if they typed an "s" ending
    const plural = [...vocab].find((v) => v.replace(/(es|s)$/, "") === root && /s$/.test(v));
    if (/s$/.test(word) && plural && editDistance(word, plural, max) <= max) return plural;
  }
  return best;
}

/** Fix likely typos in free text. Numbers, units and short words are left alone. */
export function correctSpelling(text: string, vocab: Set<string>): { text: string; corrections: Correction[] } {
  const corrections: Correction[] = [];
  const out = text.replace(/[A-Za-z]+/g, (word) => {
    const lower = word.toLowerCase();
    if (lower.length < 5 || vocab.has(lower)) return word;
    const fix = bestMatch(lower, vocab);
    if (!fix || fix === lower) return word;
    corrections.push({ from: word, to: fix });
    // keep the user's capitalization
    return word[0] === word[0].toUpperCase() ? fix[0].toUpperCase() + fix.slice(1) : fix;
  });
  return { text: out, corrections };
}
