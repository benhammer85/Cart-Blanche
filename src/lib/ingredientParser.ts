// Deterministic ingredient-line parser.
// "1 1/2 cups chopped onion" → { qty: 1.5, unit: "cup", name: "chopped onion", nameNorm: "onion" }

import { canonicalUnit } from "./units";
import { normalizeName, splitNameAndNote } from "./normalize";

export interface ParsedIngredient {
  raw: string;
  qty: number | null;
  qtyMax: number | null;
  unit: string | null;
  /** product name as written, without amount/unit and prep note */
  name: string;
  /** normalized shopping name used for merging / store rules */
  nameNorm: string;
  note: string | null;
  /** false when the line looks garbled and should be shown for fixing */
  ok: boolean;
}

const UNICODE_FRACTIONS: Record<string, string> = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅕": "1/5", "⅖": "2/5",
  "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, half: 0.5, "a half": 0.5,
  "a couple": 2, couple: 2, few: 3, "a few": 3,
};

/** Pre-clean: unicode fractions → ascii, "1½" → "1 1/2", trim bullets. */
export function preclean(line: string): string {
  let s = line.replace(/ /g, " ").trim();
  s = s.replace(/^[-•*·▢☐◦]+\s*/, "");
  s = s.replace(/(\d)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, "$1 $2");
  s = s.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (c) => UNICODE_FRACTIONS[c]);
  s = s.replace(/⁄/g, "/"); // fraction slash
  s = s.replace(/(\d)\s*(?:-|–|—|to)\s*(\d)/g, "$1-$2");
  return s.replace(/\s+/g, " ");
}

/** Parse "1", "1.5", "1/2", "1 1/2" at the start of the string. */
function readNumber(s: string): { value: number; rest: string } | null {
  const m = s.match(/^(\d+)\s+(\d+)\/(\d+)(?![\d/])\s*(.*)$/);
  if (m) return { value: +m[1] + +m[2] / +m[3], rest: m[4] };
  const f = s.match(/^(\d+)\/(\d+)\s*(.*)$/);
  if (f) return { value: +f[1] / +f[2], rest: f[3] };
  const d = s.match(/^(\d*\.?\d+)\s*(.*)$/);
  if (d) return { value: parseFloat(d[1]), rest: d[2] };
  return null;
}

function readQuantity(s: string): { qty: number | null; qtyMax: number | null; rest: string } {
  const first = readNumber(s);
  if (!first) {
    const w = s.match(/^(a couple|a few|a half|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|half|couple|few)\b\s*(?:of\s+)?(.*)$/i);
    if (w) {
      const word = w[1].toLowerCase();
      // "a pinch of salt" — "a" belongs to the unit, handled the same: qty 1
      return { qty: WORD_NUMBERS[word], qtyMax: null, rest: w[2] };
    }
    return { qty: null, qtyMax: null, rest: s };
  }
  let rest = first.rest;
  let qtyMax: number | null = null;
  const range = rest.match(/^-\s*(.*)$/);
  if (range) {
    const second = readNumber(range[1]);
    if (second) {
      qtyMax = second.value;
      rest = second.rest;
    }
  }
  return { qty: first.value, qtyMax, rest };
}

/** Read an optional unit word (possibly "fl oz"), allowing a trailing "of". */
export function readUnit(s: string): { unit: string | null; rest: string } {
  const two = s.match(/^([a-zA-Z]+\.?\s+[a-zA-Z]+\.?)\b\.?\s*(?:of\s+)?(.*)$/);
  if (two) {
    const u = canonicalUnit(two[1]);
    if (u) return { unit: u, rest: two[2] };
  }
  const one = s.match(/^([a-zA-Z]+\.?)(?=\s|$|\)|\/)\s*(?:of\s+)?(.*)$/);
  if (one) {
    const u = canonicalUnit(one[1]);
    if (u) return { unit: u, rest: one[2] };
  }
  return { unit: null, rest: s };
}

export function parseIngredientLine(rawLine: string, synonyms: Record<string, string> = {}): ParsedIngredient {
  const raw = rawLine.trim();
  let s = preclean(raw);

  // "Juice of 1 lemon", "zest of 2 limes"
  const citrus = s.match(/^(juice|zest)(?: and (?:juice|zest))? of (\d+(?:\/\d+)?|one|two|three|a|an|half|1\/2) (?:large |small |medium )?(lemon|lime|orange)s?\b\s*,?\s*(.*)$/i);
  if (citrus) {
    const n = citrus[2].toLowerCase();
    const q = n.includes("/") ? +n.split("/")[0] / +n.split("/")[1] : (WORD_NUMBERS[n] ?? (parseFloat(n) || 1));
    const fruit = citrus[3].toLowerCase();
    return { raw, qty: q, qtyMax: null, unit: "each", name: fruit, nameNorm: normalizeName(fruit, synonyms), note: [citrus[1].toLowerCase(), citrus[4]].filter(Boolean).join("; "), ok: true };
  }

  const { qty, qtyMax, rest: afterQty } = readQuantity(s);
  s = afterQty;

  // "1 (15-ounce) can black beans" → size goes to the note
  let sizeNote: string | null = null;
  const size = s.match(/^\(([^)]*)\)\s*(.*)$/);
  if (size) {
    sizeNote = size[1].trim();
    s = size[2];
  }

  let { unit, rest } = readUnit(s);
  // "heaping tbs PB2", "large or 2 small bunches kale", "plus 1/4 cup cornstarch"
  const peeled = peelAmountWords(rest, unit);
  rest = peeled.rest;
  unit = unit ?? peeled.unit;
  const qtyMaxFinal = qtyMax ?? (qty != null && peeled.qtyMax != null && peeled.qtyMax > qty ? peeled.qtyMax : null);
  // "pinch of salt" with no number
  const finalQty = qty ?? (unit && ["pinch", "dash"].includes(unit) ? 1 : null);

  const { name, note } = splitNameAndNote(rest);
  const notes = [sizeNote, note].filter(Boolean).join("; ") || null;
  const cleanName = name.replace(/^of\s+/i, "").trim();

  return {
    raw,
    qty: finalQty,
    qtyMax: qtyMaxFinal,
    unit: unit ?? (finalQty != null ? "each" : null),
    name: cleanName || raw,
    nameNorm: normalizeName(cleanName || raw, synonyms),
    note: notes,
    ok: looksOk(raw, cleanName),
  };
}

const AMOUNT_MODIFIERS = /^(?:heaping|level|scant|rounded|generous|large|medium|small|big|packed|lightly packed|loosely packed|firmly packed|medium-size|medium-sized|good)\s+/i;

/**
 * Strip amount words Crouton and recipe sites leave in front of the name:
 *   "large or 2 small bunches kale" → { qtyMax: 2, unit: "bunch", rest: "kale" }
 *   "to 2 ripe avocados"            → { qtyMax: 2, rest: "ripe avocados" }
 *   "packed cup fresh dill"         → { unit: "cup", rest: "fresh dill" }
 *   "plus 1/4 cup cornstarch"       → { rest: "cornstarch" }
 *   "block firm tofu" (unit block)  → { rest: "firm tofu" }  (repeated unit)
 */
export function peelAmountWords(text: string, knownUnit: string | null = null): { rest: string; qtyMax: number | null; unit: string | null } {
  let rest = text.trim();
  let qtyMax: number | null = null;
  let unit: string | null = null;
  for (let i = 0; i < 6; i++) {
    const before = rest;
    rest = rest.replace(AMOUNT_MODIFIERS, "");
    const range = rest.match(/^(?:to|or|-|–)\s+(\d+(?:\.\d+)?(?:\/\d+)?)\s+(.*)$/i);
    if (range) {
      const [n, d] = range[1].split("/");
      qtyMax = d ? +n / +d : +n;
      rest = range[2];
      continue;
    }
    const plus = rest.match(/^(?:plus|and|\+)\s+[\d\s/.]+\s*[a-zA-Z]+\.?\s+(.*)$/i);
    if (plus) {
      rest = plus[1];
      continue;
    }
    // A second measurement or a size: "/ 7 oz / 200 g oats", "14.5-oz. can tomatoes", '4" piece ginger'
    const inch = rest.match(/^\d+(?:\.\d+)?\s*(?:"|”|-inch|inch)\s+(.*)$/i);
    if (inch) {
      rest = inch[1];
      continue;
    }
    const alt = rest.match(/^\/?\s*(?:or\s+)?\d+(?:[.\/]\d+)?\s*-?\s*([a-zA-Z]+)\.?\s*\/?\s*(.*)$/);
    if (alt && canonicalUnit(alt[1]) && alt[2] && (knownUnit || unit || /^(cans?|packages?|jars?|bags?|box(es)?|pieces?|sticks?|bottles?|containers?)\b/i.test(alt[2]))) {
      rest = alt[2];
      continue;
    }
    const r = readUnit(rest);
    if (r.unit && r.rest && (!knownUnit || r.unit === knownUnit) && !unit) {
      if (!knownUnit) unit = r.unit;
      rest = r.rest;
      continue;
    }
    if (rest === before) break;
  }
  return { rest, qtyMax, unit };
}

/** Section headings ("For Serving:") and equipment ("An Instant Pot") aren't groceries. */
export function isJunkLine(raw: string): boolean {
  const t = raw.trim();
  if (/:\s*$/.test(t) && t.length < 40) return true;
  if (/^(ingredients?\b|special equipment|equipment\b|\/\/|for the\b.*:)/i.test(t)) return true;
  return /^(an?\s+|\d+\s+)?(instant pot|pressure cooker|slow cooker|mason jar|cocktail shaker|glass(es)?|skillet|sheet pan|baking dish|food processor|blender|stand mixer|thermometer)\b/i.test(t);
}

/**
 * Heuristic garble check: OCR-style characters (%), empty name, or the name
 * still starting with a number usually means the line needs a human.
 */
export function looksOk(raw: string, name: string): boolean {
  if (!name || name.length < 2) return false;
  if (/[%@#{}<>]/.test(raw)) return false;
  if (/^\d/.test(name)) return false;
  if (canonicalUnit(name)) return false; // the name is just a unit ("2 teaspoons, plus more")
  return true;
}

/** Plain-text paste: ingredients first, a blank line, then steps. */
export function parsePlainTextRecipe(text: string): { title: string | null; ingredients: string[]; steps: string[] } {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean));
  const nonEmpty = blocks.filter((b) => b.length);
  if (!nonEmpty.length) return { title: null, ingredients: [], steps: [] };
  let title: string | null = null;
  let ingBlock = nonEmpty[0];
  // A single first line without a quantity is treated as the title.
  if (nonEmpty.length > 2 && nonEmpty[0].length === 1 && !/^\d/.test(nonEmpty[0][0])) {
    title = nonEmpty[0][0];
    ingBlock = nonEmpty[1];
    return { title, ingredients: ingBlock, steps: nonEmpty.slice(2).flat().map(stripStepNumber) };
  }
  return { title, ingredients: ingBlock, steps: nonEmpty.slice(1).flat().map(stripStepNumber) };
}

function stripStepNumber(s: string): string {
  return s.replace(/^(step\s*)?\d+[.):]\s*/i, "").trim();
}
