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
  "good-quality", "good quality", "organic", "salted", "unsalted", "low-sodium", "reduced-sodium", "store-bought", "homemade", "lean",
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
export function normalizeName(text: string, synonyms: Record<string, string> = {}): string {
  let s = splitNameAndNote(text).name.toLowerCase();
  s = s.replace(/^[-•*·\s]+/, "");
  s = s.replace(descriptorRe, " ");
  s = s.replace(/\b(and|or|of|the|a|an)\s*$/g, "");
  s = s.replace(/^(of|the|a|an)\s+/g, "");
  s = s.replace(/[^a-z0-9'\-& ]+/g, " ");
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
