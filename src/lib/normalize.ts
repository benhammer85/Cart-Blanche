// Ingredient name normalization: lowercase, strip prep words and sizes,
// singularize, then apply the household's editable synonyms table.

/** Prep / size / freshness words that don't change what you buy. */
const DESCRIPTORS = [
  "chopped", "finely", "coarsely", "roughly", "thinly", "thickly", "diced", "minced",
  "sliced", "grated", "shredded", "fresh", "freshly", "peeled", "trimmed", "halved",
  "quartered", "cubed", "crushed", "julienned", "mashed", "melted", "softened",
  "room temperature", "at room temperature", "large", "medium", "small", "extra-large",
  "medium-size", "medium-sized", "large-size", "jumbo", "ripe", "heaping", "packed",
  "lightly", "well", "torn", "rinsed", "drained", "washed", "cleaned", "pitted",
  "seeded", "deseeded", "cored", "boneless", "skinless", "skin-on", "bone-in",
  "toasted", "cooked", "uncooked", "raw", "frozen", "thawed", "divided", "optional",
  "to taste", "plus more", "as needed", "about", "approximately", "roughly", "generous",
  "good-quality", "good quality", "organic", "salted", "unsalted", "low-sodium", "low sodium", "reduced-sodium", "store-bought", "homemade", "lean",
  "cooled", "cleaned", "scrubbed", "squeezed", "juiced", "zested", "unbleached", "seedless", "smashed", "deveined", "patted dry", "very soft", "chilled", "warm", "cold",
];

// Words that stay part of the product name even though they look like descriptors.
// (e.g. "boneless skinless chicken thighs" → "chicken thigh" but
//  "frozen peas" are bought frozen; we still drop "frozen" — store rules
//  use the category, which handles that.)

const INVARIANT = new Set([
  "molasses", "hummus", "couscous", "asparagus", "swiss", "bass", "grits", "oats",
  "lemongrass", "harissa", "pancetta", "feta", "pasta", "quinoa", "salsa", "tortilla chips",
  "chips", "greens", "peas", "lentils", "noodles", "brussels sprouts", "sprouts",
  "chickpeas", "scallions", "spaghettios", "nuggets", "raisins", "pine nuts", "almonds",
  "walnuts", "pecans", "cashews", "beans", "black beans", "oreos", "cornflakes",
  "hot dogs", "meatballs", "chicken nuggets", "cheerios", "golden raisins",
  "olives", "capers", "breadcrumbs", "panko breadcrumbs", "rolled oats",
]);

const IRREGULAR: Record<string, string> = {
  leaves: "leaf", loaves: "loaf", knives: "knife", potatoes: "potato",
  tomatoes: "tomato", mangoes: "mango", avocados: "avocado", cookies: "cookie",
  anchovies: "anchovy", berries: "berry", cherries: "cherry", strawberries: "strawberry",
  blueberries: "blueberry", raspberries: "raspberry", blackberries: "blackberry",
  radishes: "radish", peaches: "peach", sandwiches: "sandwich", dishes: "dish",
  boxes: "box", tortillas: "tortilla", chilies: "chili", chilis: "chili", chiles: "chile",
  cloves: "clove", halves: "half", children: "child", mice: "mouse",
};

export function singularizeWord(word: string): string {
  const w = word.toLowerCase();
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.length <= 3) return w;
  if (/(ss|us|is)$/.test(w)) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + "y";
  if (/(ch|sh|x|z)es$/.test(w)) return w.slice(0, -2);
  if (/oes$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

export function singularize(name: string): string {
  if (INVARIANT.has(name)) return name;
  const parts = name.split(" ");
  // Only the head noun (last word) changes: "cherry tomatoes" → "cherry tomato"
  const last = parts[parts.length - 1];
  const phraseTail = parts.slice(-2).join(" ");
  if (INVARIANT.has(phraseTail) || INVARIANT.has(last)) return name;
  parts[parts.length - 1] = singularizeWord(last);
  return parts.join(" ");
}

const descriptorRe = new RegExp(
  `\\b(${DESCRIPTORS.map((d) => d.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).sort((a, b) => b.length - a.length).join("|")})\\b`,
  "gi",
);

/**
 * Split an ingredient name into the thing you buy and a prep note.
 * "medium leeks, white and light green parts only" → { name: "leeks", note: "white and light green parts only" }
 */
export function splitNameAndNote(text: string): { name: string; note: string | null } {
  let s = text.trim();
  const notes: string[] = [];
  // Parentheticals become notes: "lemon (about 2 tablespoons)"
  s = s.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    if (inner.trim()) notes.push(inner.trim());
    return " ";
  });
  // "potatoes peeled & cut into chunks" → prep starts at the verb
  s = s.replace(/\s+(?:and|&)\s+(?=(?:cut|sliced|diced|chopped|minced|halved|quartered|peeled|seeded|torn|crushed|drained)\b)/i, ", ");
  // Anything after the first comma or " - " / " – " is prep.
  const m = s.match(/^(.*?)(?:\s*,\s*|\s+[-–—]\s+|\s*;\s*)(.*)$/);
  if (m && m[1].trim()) {
    if (isOnlyDescriptors(m[1])) {
      // "coarsely chopped toasted, salted almonds" — the product is after the comma
      const after = m[2].match(/^(.*?)(?:\s*,\s*(.*))?$/)!;
      s = `${m[1]} ${after[1]}`;
      if (after[2]?.trim()) notes.unshift(after[2].trim());
    } else {
      s = m[1];
      if (m[2].trim()) notes.unshift(m[2].trim());
    }
  }
  // "such as top sirloin" / "for serving"
  s = s.replace(/\b(such as|for serving|for garnish|or more).*$/i, (all) => {
    notes.push(all.trim());
    return "";
  });
  return { name: s.replace(/\s+/g, " ").trim(), note: notes.length ? notes.join("; ") : null };
}

function isOnlyDescriptors(text: string): boolean {
  return !text.toLowerCase().replace(descriptorRe, " ").replace(/[^a-z]+/g, "").trim();
}

/** Normalize to the canonical shopping name used for merging and lookups. */
const SUFFIX_JUNK =
  /\b(depending on|for extra|see tip|see note|see below|if desired|if possible|if using|if unavailable|to taste|to top|for serving|for garnish|for cooking|for drizzling|approx\.?|preferably|i like|i used|i make|no need to|leave whole|with juice|cut lengthwise|of choice|of your choice|is great too|plus more|plus an additional|as needed)\b.*$/;

/** "chicken broth or vegetable broth" → "chicken broth"; "light or dark brown sugar" → "light brown sugar". */
export function pickAlternative(s: string): string {
  const m = s.match(/^(.+?)\s+or\s+(.+)$/);
  if (!m) return s;
  const [a, b] = [m[1].trim(), m[2].trim()];
  if (/\bother\b/.test(b)) return a; // "spaghetti or other long pasta"
  if (a.split(" ").length >= 2) return a;
  const bw = b.split(" ");
  return bw.length > 1 ? `${a} ${bw.slice(1).join(" ")}` : a; // "cherry or grape tomato" → "cherry tomato"
}

/** Normalize to the canonical shopping name used for merging and lookups. */
export function normalizeName(text: string, synonyms: Record<string, string> = {}): string {
  let s = splitNameAndNote(text).name.toLowerCase();
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // jalapeño → jalapeno, gruyère → gruyere
  s = s.replace(/^[-•*·\s]+/, "");
  s = s.replace(/\band\/or\b/g, "or").replace(/\s*\/.*$/, ""); // "ranch dressing/seasoning mix" → first option
  s = s.replace(SUFFIX_JUNK, "");
  s = s.replace(/\s+\d+(\.\d+)?\s*(ounces?|oz|grams?|g|pounds?|lbs?|ml)\b.*$/, ""); // "carrots 10 ounces"
  s = s.replace(/^(zest|juice) of (half |one )?(an? )?/, "");
  s = s.replace(descriptorRe, " ").replace(/\s+/g, " ").trim();
  // "cilantro leaves and tender stems" → "cilantro" (but "bay leaf" stays a bay leaf)
  s = s.replace(/\s*\b(and|with)\s+(tender|fine)\s+stems?\b/g, "").replace(/\b(cilantro|parsley|basil|mint|dill|thyme|sage|tarragon|oregano|rosemary|chervil)\s+(leaves|leaf)$/, "$1");
  for (let i = 0; i < 3; i++) s = s.replace(/^(and|or|with|of|the|a|an|-)\s+/, "").replace(/^-+/, "").trim();
  s = s.replace(/^(packages?|cans?|jars?|bags?|boxes|box|bottles?)\s+(of\s+)?/, "");
  s = s.replace(/\b(and|or|of|the|a|an|with)\s*$/g, "");
  s = s.replace(/\s+or water$/, ""); // "chicken broth or water" → shop for the broth
  s = pickAlternative(s);
  s = s.replace(/[^\p{L}\p{N}'\-& ]+/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  // some descriptors are hyphen-joined ("extra-virgin" stays; "well-trimmed" goes)
  s = s.replace(/^-+|-+$/g, "").trim();
  if (!s) s = text.toLowerCase().trim();
  if (synonyms[s]) return synonyms[s];
  const single = singularize(s);
  return synonyms[single] ?? single;
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
