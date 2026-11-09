// Ingredient lines that were read badly when a recipe was imported, and what
// each should become. Nothing changes until you approve the fix.

export interface IngredientRow {
  id: string;
  name: string;
  note: string | null;
  qty: number | null;
  unit: string | null;
  parsed_ok: boolean;
  raw_text: string;
}

export type Fix =
  | { kind: "rename"; name: string; note: string | null }
  | { kind: "split"; names: string[]; note: string | null }
  | { kind: "remove" }
  | { kind: "edit" }; // the name was lost: only a person can say what it was

export interface Issue {
  id: string;
  problem: string;
  fix: Fix;
}

const joinNote = (...parts: (string | null | undefined)[]) => {
  const n = parts.map((p) => p?.trim().replace(/^[,;\s]+|[,;\s]+$/g, "")).filter(Boolean).join("; ");
  return n || null;
};
const tidy = (s: string) => s.replace(/\s{2,}/g, " ").replace(/^[\s,;:-]+|[\s,;:-]+$/g, "").trim();

const PREP = /^((?:diced|chopped|minced|sliced|scrubbed|peeled|washed|grated|shredded|crushed|trimmed|halved|quartered)\s+)+/i;
const MEASURE = /\s(\d[\d\s/½¼¾⅓⅔.-]*\s*(?:ribs?|stalks?|ounces?|oz\.?|pounds?|lbs?\.?|cups?|cloves?|grams?|g)\b\.?)/i;
const INSTRUCTION = /\s(?:thinly|roughly|finely|coarsely|washed|rinsed|patted|cut into|sliced|chopped|with a\b|I make\b|or store-bought|-{2,})/i;
const LOST = /^[)(,.;:-]|^(?:teaspoons?|tablespoons?|cups?|tsp|tbsp|ounces?|grams?)$|^\d/i;
const NOT_FOOD = /!$|^(?:blend|mix|stir|whisk|freeze|serve|bake|cook)\b(?!.*\b(?:seasoning|mix)\b)/i;

export function checkIngredient(i: IngredientRow): Issue | null {
  const name = i.name.trim();

  // The name went missing ("2½ cups ), plus more for dusting").
  if (!/[a-z]{3}/i.test(name.replace(/\bplus more\b.*/i, "")) || LOST.test(name)) {
    return { id: i.id, problem: "The ingredient’s name is missing", fix: { kind: "edit" } };
  }

  // Not an ingredient at all ("Blend and freeze!").
  if (i.qty == null && NOT_FOOD.test(name)) return { id: i.id, problem: "This isn’t an ingredient", fix: { kind: "remove" } };

  // A typo left at the front ("ofr Trader Joe's …").
  const typo = name.match(/^(?:ofr|fo|fro|fof)\s+(.+)$/i);
  if (typo) return { id: i.id, problem: "A stray word at the start", fix: { kind: "rename", name: typo[1], note: i.note } };

  // Kosher salt with brand alternatives.
  if (/\b(?:diamond crystal|morton)\b/i.test(name) && /\bkosher salt\b/i.test(name) && name.toLowerCase() !== "kosher salt") {
    const rest = tidy(name.replace(/\bkosher salt\b/i, "").replace(/\s+or\s+/i, "; or "));
    return { id: i.id, problem: "Brands are part of the name", fix: { kind: "rename", name: "kosher salt", note: joinNote(rest, i.note) } };
  }

  // A measurement inside the name ("diced celery 4 ribs").
  const m = name.match(MEASURE);
  if (m && m.index! > 0) {
    let base = tidy(name.slice(0, m.index) + name.slice(m.index! + m[0].length));
    const prep = base.match(PREP)?.[0];
    if (prep) base = tidy(base.slice(prep.length));
    if (base.length >= 3) return { id: i.id, problem: "An amount is part of the name", fix: { kind: "rename", name: base, note: joinNote(prep, m[1], i.note) } };
  }

  // Instructions inside the name ("spinach or kale washed and roughly chopped").
  const ins = name.match(INSTRUCTION);
  if (ins && ins.index! >= 3 && name.length > 24) {
    return { id: i.id, problem: "Instructions are part of the name", fix: { kind: "rename", name: tidy(name.slice(0, ins.index)), note: joinNote(name.slice(ins.index!), i.note) } };
  }

  // Two things on one line with no amount ("Salt and black pepper").
  if (i.qty == null) {
    const clean = name.replace(/\s*,?\s*to taste$/i, "");
    const parts = clean.split(/\s+and\s+/i).map(tidy).filter(Boolean);
    if (parts.length === 2 && parts.every((p) => p.length >= 3 && p.split(/\s+/).length <= 4)) {
      return { id: i.id, problem: "Two ingredients on one line", fix: { kind: "split", names: parts, note: joinNote(clean !== name ? "to taste" : null, i.note) } };
    }
  }
  return null;
}

/** "kosher salt; Diamond Crystal" style preview of what a line becomes. */
export function describeFix(f: Fix): string {
  if (f.kind === "rename") return f.note ? `${f.name} (${f.note})` : f.name;
  if (f.kind === "split") return f.names.join(" + ");
  if (f.kind === "remove") return "Remove it";
  return "Open the recipe to fix it";
}
