// Small built-in unit table. Volumes convert through teaspoons, weights
// through grams. Count units (each, can, bunch, clove…) only merge with
// themselves.

export type Dimension = "volume" | "weight" | "count";

interface UnitDef {
  canonical: string;
  dimension: Dimension;
  /** size in base units (tsp for volume, g for weight, 1 for count) */
  factor: number;
}

const DEFS: Record<string, UnitDef> = {
  tsp: { canonical: "tsp", dimension: "volume", factor: 1 },
  tbsp: { canonical: "tbsp", dimension: "volume", factor: 3 },
  "fl oz": { canonical: "fl oz", dimension: "volume", factor: 6 },
  cup: { canonical: "cup", dimension: "volume", factor: 48 },
  pint: { canonical: "pint", dimension: "volume", factor: 96 },
  quart: { canonical: "quart", dimension: "volume", factor: 192 },
  gallon: { canonical: "gallon", dimension: "volume", factor: 768 },
  ml: { canonical: "ml", dimension: "volume", factor: 0.202884 },
  l: { canonical: "l", dimension: "volume", factor: 202.884 },
  g: { canonical: "g", dimension: "weight", factor: 1 },
  kg: { canonical: "kg", dimension: "weight", factor: 1000 },
  oz: { canonical: "oz", dimension: "weight", factor: 28.3495 },
  lb: { canonical: "lb", dimension: "weight", factor: 453.592 },
};

const COUNT_UNITS = [
  "each", "can", "jar", "bunch", "clove", "head", "package", "bag", "box",
  "bottle", "slice", "stalk", "sprig", "pinch", "dash", "loaf", "container",
  "stick", "ear", "fillet", "piece", "handful", "carton", "block",
];

/** Every spelling we accept → canonical unit. */
export const UNIT_ALIASES: Record<string, string> = {
  t: "tsp", tsp: "tsp", tsps: "tsp", teaspoon: "tsp", teaspoons: "tsp", "tsp.": "tsp",
  T: "tbsp", tbsp: "tbsp", tbsps: "tbsp", tbs: "tbsp", tbl: "tbsp", tablespoon: "tbsp",
  tablespoons: "tbsp", "tbsp.": "tbsp", "tbs.": "tbsp",
  c: "cup", cup: "cup", cups: "cup",
  "fl oz": "fl oz", "fluid ounce": "fl oz", "fluid ounces": "fl oz",
  pint: "pint", pints: "pint", pt: "pint",
  quart: "quart", quarts: "quart", qt: "quart",
  gallon: "gallon", gallons: "gallon", gal: "gallon",
  ml: "ml", milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
  l: "l", liter: "l", liters: "l", litre: "l", litres: "l",
  g: "g", gram: "g", grams: "g", gr: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg",
  oz: "oz", ounce: "oz", ounces: "oz", "oz.": "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb", "lb.": "lb", "lbs.": "lb",
  each: "each", ea: "each", whole: "each",
  can: "can", cans: "can", tin: "can", tins: "can",
  jar: "jar", jars: "jar",
  bunch: "bunch", bunches: "bunch", bundle: "bunch", bundles: "bunch",
  clove: "clove", cloves: "clove",
  head: "head", heads: "head",
  package: "package", packages: "package", pkg: "package", pkgs: "package",
  packet: "package", packets: "package",
  bag: "bag", bags: "bag", box: "box", boxes: "box",
  bottle: "bottle", bottles: "bottle",
  slice: "slice", slices: "slice", stalk: "stalk", stalks: "stalk",
  sprig: "sprig", sprigs: "sprig", pinch: "pinch", pinches: "pinch",
  dash: "dash", dashes: "dash", loaf: "loaf", loaves: "loaf",
  container: "container", containers: "container", stick: "stick", sticks: "stick",
  ear: "ear", ears: "ear", fillet: "fillet", fillets: "fillet",
  piece: "piece", pieces: "piece", handful: "handful", handfuls: "handful",
  carton: "carton", cartons: "carton", block: "block", blocks: "block",
};

export function canonicalUnit(u: string | null | undefined): string | null {
  if (!u) return null;
  const trimmed = u.trim();
  if (trimmed === "T") return "tbsp"; // capital T is tablespoon by convention
  const key = trimmed.toLowerCase();
  return UNIT_ALIASES[key] ?? UNIT_ALIASES[key.replace(/\.$/, "")] ?? null;
}

export function unitDimension(unit: string | null): Dimension {
  if (!unit) return "count";
  return DEFS[unit]?.dimension ?? "count";
}

export function isCountUnit(unit: string | null): boolean {
  return !unit || COUNT_UNITS.includes(unit) || !DEFS[unit];
}

/** Key used for merging: volume/weight merge across units; counts only with same unit. */
export function mergeKey(unit: string | null): string {
  const d = unitDimension(unit);
  if (d === "count") return `count:${unit ?? "each"}`;
  return d;
}

export function toBase(qty: number, unit: string): number {
  const def = DEFS[unit];
  return def ? qty * def.factor : qty;
}

/** Convert a base quantity back to a friendly unit. */
export function fromBase(base: number, dimension: Dimension, preferMetric = false): { qty: number; unit: string } {
  if (dimension === "volume") {
    if (preferMetric) {
      const ml = base / DEFS.ml.factor;
      return ml >= 1000 ? { qty: round(ml / 1000, 2), unit: "l" } : { qty: round(ml, 0), unit: "ml" };
    }
    if (base >= 12) return { qty: niceFraction(base / 48), unit: "cup" }; // ≥ 1/4 cup
    if (base >= 3) return { qty: niceFraction(base / 3), unit: "tbsp" };
    return { qty: niceFraction(base), unit: "tsp" };
  }
  if (dimension === "weight") {
    if (preferMetric) {
      return base >= 1000 ? { qty: round(base / 1000, 2), unit: "kg" } : { qty: round(base, 0), unit: "g" };
    }
    const oz = base / DEFS.oz.factor;
    if (oz >= 16) return { qty: niceFraction(oz / 16), unit: "lb" };
    return { qty: round(oz, oz < 4 ? 1 : 0), unit: "oz" };
  }
  return { qty: base, unit: "each" };
}

/** Add two amounts when their units are compatible (same count unit, or both volume/weight). */
export function addQty(aQty: number | null, aUnit: string | null, bQty: number | null, bUnit: string | null): { qty: number; unit: string } | null {
  if (aQty == null || bQty == null) return null;
  const ua = aUnit ?? "each";
  const ub = bUnit ?? "each";
  const da = unitDimension(ua);
  if (da !== unitDimension(ub)) return null;
  if (da === "count") return ua === ub ? { qty: aQty + bQty, unit: ua } : null;
  return fromBase(toBase(aQty, ua) + toBase(bQty, ub), da);
}

export function round(n: number, digits: number): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

/** Round to the nearest quarter (thirds when closer), never down to zero. */
export function niceFraction(n: number): number {
  if (n <= 0) return 0;
  const quarter = Math.round(n * 4) / 4;
  const third = Math.round(n * 3) / 3;
  const best = Math.abs(third - n) < Math.abs(quarter - n) ? third : quarter;
  return best === 0 ? (n < 1 / 6 ? round(n, 2) : 0.25) : round(best, 3);
}

const FRACTIONS: [number, string][] = [
  [0.25, "¼"], [1 / 3, "⅓"], [0.5, "½"], [2 / 3, "⅔"], [0.75, "¾"],
];

export function formatQty(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "";
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  if (frac < 0.02) return String(whole);
  for (const [v, s] of FRACTIONS) {
    if (Math.abs(frac - v) < 0.02) return whole ? `${whole}${s}` : s;
  }
  return String(round(n, 2));
}

const PLURAL_UNITS = new Set(["cup", "can", "jar", "bunch", "clove", "head", "package", "bag", "box",
  "bottle", "slice", "stalk", "sprig", "pinch", "dash", "loaf", "container", "stick", "ear",
  "fillet", "piece", "handful", "carton", "block", "pint", "quart", "gallon"]);

export function formatUnit(unit: string | null, qty: number | null): string {
  if (!unit || unit === "each") return "";
  if (qty != null && qty > 1 && PLURAL_UNITS.has(unit)) {
    if (unit === "bunch" || unit === "box" || unit === "pinch" || unit === "dash") return unit + "es";
    if (unit === "loaf") return "loaves";
    return unit + "s";
  }
  return unit;
}

export function formatAmount(qty: number | null, unit: string | null, qtyMax?: number | null): string {
  if (qty == null) return "";
  const q = qtyMax && qtyMax > qty ? `${formatQty(qty)}–${formatQty(qtyMax)}` : formatQty(qty);
  const u = formatUnit(unit, qtyMax ?? qty);
  return u ? `${q} ${u}` : q;
}

/**
 * A US-kitchen equivalent for a metric amount, or null when there isn't one
 * worth showing. Weight stays weight and volume stays volume (no guessing
 * how many cups 200 g of rice is): 200 g → "7 oz", 500 ml → "2 cups".
 */
export function usEquivalent(qty: number | null, unit: string | null): string | null {
  if (qty == null || !unit || !["g", "kg", "ml", "l"].includes(unit)) return null;
  const dim = unitDimension(unit);
  const base = toBase(qty, unit);
  if (dim === "weight" && base < 5) return null; // a few grams of spice: oz would be noise
  if (dim === "volume" && base < 1) return null;
  const r = fromBase(base, dim);
  return formatAmount(r.qty, r.unit) || null;
}
