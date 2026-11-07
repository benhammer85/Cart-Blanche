// Discover: find real recipes online that match what we already love.
//
// The taste profile comes from the recipes we flagged in Crouton (Loved =
// 4–5 stars, plus bonus tags like "Molly Favorites" / "Asa and Saul
// Favorites"), falling back to the most-made recipes. It is summarised as
// dish titles, proteins and cuisines; household names are never included.

export interface ProfileRecipe {
  title: string;
  tags: string[];
  main_protein: string | null;
  kid_friendly: boolean;
  times_made: number;
}

export interface TasteProfile {
  favorites: string[];
  proteins: string[];
  cuisines: string[];
  styles: string[];
  kidFriendlyShare: number;
}

const CUISINES: [string, RegExp][] = [
  ["Korean", /\b(korean|gochujang|kimchi|bibimbap|bulgogi|japchae|jangjorim)\b/i],
  ["Chinese", /\b(chinese|stir[- ]?fry|lo mein|kung pao|sesame noodles?|fried rice|three[- ]cup|oyster sauce)\b/i],
  ["Thai", /\b(thai|pad see ew|pad thai|curry paste|larb)\b/i],
  ["Vietnamese", /\b(vietnamese|pho|banh mi)\b/i],
  ["Japanese", /\b(japanese|teriyaki|miso|ramen|udon|katsu)\b/i],
  ["Filipino", /\b(filipino|adobo|arroz caldo|bibingka|sinigang)\b/i],
  ["Mexican", /\b(mexican|taco|enchilada|chipotle|tinga|carnitas|chile verde|quesadilla|salsa)\b/i],
  ["Latin", /\b(puerto rican|picadillo|arroz con|sofrito|carne mechada|cuban)\b/i],
  ["Middle Eastern", /\b(harissa|shawarma|za'?atar|tahini|harira|sumac|shakshuka|moroccan)\b/i],
  ["Italian", /\b(pasta|risotto|lasagna|carbonara|tortellini|orzo|gnocchi|pastina|marinara|parmesan)\b/i],
  ["Indian", /\b(indian|tikka|masala|dal|korma|biryani|turmeric)\b/i],
  ["American comfort", /\b(mac and cheese|pot pie|meatloaf|casserole|sloppy|chili|pancakes)\b/i],
];

const STYLES: [string, RegExp][] = [
  ["Instant Pot / pressure cooker", /\b(instant pot|pressure cook)/i],
  ["sheet-pan", /\bsheet[- ]pan\b/i],
  ["one-pot / skillet", /\b(one[- ]pot|one[- ]pan|skillet)\b/i],
  ["soups and stews", /\b(soup|stew|chowder)\b/i],
];

function top(counts: Map<string, number>, n: number): string[] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

export function buildTasteProfile(recipes: ProfileRecipe[], bonusTags: string[]): TasteProfile {
  const lower = bonusTags.map((t) => t.toLowerCase());
  const flagged = recipes.filter((r) => r.tags.some((t) => t === "Loved" || lower.includes(t.toLowerCase())));
  // Not enough flagged yet: use what we cook most.
  const basis = flagged.length >= 5 ? flagged : [...flagged, ...[...recipes].sort((a, b) => b.times_made - a.times_made).slice(0, 15)];
  const proteins = new Map<string, number>();
  const cuisines = new Map<string, number>();
  const styles = new Map<string, number>();
  for (const r of basis) {
    if (r.main_protein) proteins.set(r.main_protein, (proteins.get(r.main_protein) ?? 0) + 1);
    const text = `${r.title} ${r.tags.join(" ")}`;
    for (const [c, re] of CUISINES) if (re.test(text)) cuisines.set(c, (cuisines.get(c) ?? 0) + 1);
    for (const [s, re] of STYLES) if (re.test(text)) styles.set(s, (styles.get(s) ?? 0) + 1);
  }
  return {
    favorites: [...new Set(basis.map((r) => r.title))].slice(0, 30),
    proteins: top(proteins, 4),
    cuisines: top(cuisines, 5),
    styles: top(styles, 3),
    kidFriendlyShare: basis.length ? basis.filter((r) => r.kid_friendly).length / basis.length : 0,
  };
}

/**
 * What makes each store worth a recipe of its own. Matched by store name;
 * unknown stores are treated as regular supermarkets.
 */
export const STORE_STYLES: Record<string, string> = {
  traderjoes:
    "Trader Joe's: build the dish around one or two of its signature products used as shortcuts (simmer sauces, Soyaki, zhoug, bomba sauce, chili onion crunch, Everything but the Bagel seasoning, frozen dumplings/gyoza, cauliflower gnocchi, Indian and Thai heat-and-serve items, pre-cut produce). Name the product in the recipe or the reason.",
  costco:
    "Costco: bulk packs and specialty items. Favor recipes that use a whole family pack (about 6 lb chicken thighs, a large salmon fillet, a rotisserie chicken, big bags of frozen vegetables or berries) and make good leftovers or freeze well, or that feature Costco finds like Kirkland pesto, pine nuts, good olive oil, prosciutto or specialty cheeses.",
  hmart: "H Mart: Korean and other Asian ingredients (gochujang, kimchi, rice cakes, thin-sliced beef or pork, dumplings, fresh noodles, Asian greens).",
  marketbasket: "Market Basket: an everyday supermarket; regular ingredients at good prices.",
  shaws: "Shaw's: an everyday supermarket; regular ingredients.",
  starmarket: "Star Market: an everyday supermarket; regular ingredients.",
  wholefoods: "Whole Foods: good produce, specialty and organic ingredients.",
};

export function storeStyle(name: string | null | undefined): string | null {
  if (!name) return null;
  return STORE_STYLES[name.toLowerCase().replace(/[^a-z]/g, "")] ?? `${name}: a regular grocery store.`;
}

/** Sites we trust that also let the app read their recipes (checked November 2026). */
export const PREFERRED_SITES = ["cooking.nytimes.com", "gimmesomeoven.com", "budgetbytes.com", "bonappetit.com", "smittenkitchen.com", "cookieandkate.com", "recipetineats.com"];
/** Store-specific blogs with recipes the app can read. */
export const STORE_SITES: Record<string, string[]> = {
  traderjoes: ["getonmyplate.com", "gimmesomeoven.com"],
};
/** Sites that block apps from reading recipes. */
export const BLOCKED_SITES = [
  "traderjoes.com", "seriouseats.com", "allrecipes.com", "simplyrecipes.com", "eatingwell.com", "thekitchn.com", "damndelicious.net",
  "instagram.com", "tiktok.com", "pinterest.com", "youtube.com", "facebook.com",
];

export interface DiscoverFilters {
  store?: string | null;
  maxMinutes?: number | null;
  kidFriendly?: boolean;
  style?: string | null;
  extra?: string | null;
  /** filled in on the server: what we buy at the chosen store, in our words */
  storeNotes?: string | null;
  /** filled in on the server: products we can only get at the chosen store */
  storeOnly?: string[];
}

export function buildDiscoverPrompt(p: TasteProfile, f: DiscoverFilters, kidAges: number[], avoid: string[], have: string[]): string {
  const wants = [
    f.store && `ingredients that are easy to buy at ${f.store} in one trip. ${storeStyle(f.store)}`,
    f.store && STORE_SITES[f.store.toLowerCase().replace(/[^a-z]/g, "")] && `good sources for ${f.store} recipes: ${STORE_SITES[f.store.toLowerCase().replace(/[^a-z]/g, "")].join(", ")}`,
    f.store && f.storeNotes && `what we usually buy at ${f.store}: ${f.storeNotes.slice(0, 400)}`,
    f.store && f.storeOnly?.length && `recipes that use products we get only at ${f.store} are especially welcome: ${f.storeOnly.slice(0, 15).join(", ")}`,
    f.maxMinutes && `about ${f.maxMinutes} minutes of hands-on time or less`,
    f.kidFriendly && `kid-friendly for children aged ${kidAges.join(" and ") || "4 to 6"}`,
    f.style && `cooked as ${f.style}`,
    f.extra,
  ].filter(Boolean);
  return `Find 10 real, published dinner recipes for a family, using Google Search.

Our taste (recipes we love): ${p.favorites.slice(0, 20).join("; ")}.
We cook a lot of ${p.cuisines.join(", ") || "varied"} food, mostly with ${p.proteins.join(", ") || "chicken"}${p.styles.length ? `, often ${p.styles.join(" or ")}` : ""}.
${wants.length ? `This time we want: ${wants.join("; ")}.\n` : ""}${avoid.length ? `Never use: ${avoid.join(", ")}.\n` : ""}${have.length ? `We already have these, so suggest different dishes: ${have.slice(0, 40).join("; ")}.\n` : ""}
Prefer recipes from ${PREFERRED_SITES.join(", ")}; other reputable recipe sites are fine. Do not use ${BLOCKED_SITES.join(", ")}.
Each must be a single recipe page (not a roundup or list). Use the exact URL of the recipe page.

Reply with only a JSON array, no other text:
[{"title":"","url":"https://...","site":"","why":"one short reason it fits us, e.g. like our Sheet-Pan Bibimbap"}]`;
}

export interface DiscoverPick {
  title: string;
  url: string;
  site: string;
  why: string;
}

/** Pull the JSON array out of the model's answer (it may add prose or code fences). */
export function parseDiscoverAnswer(text: string): DiscoverPick[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1)) as Partial<DiscoverPick>[];
    return arr
      .filter((x) => typeof x?.url === "string" && /^https?:\/\//.test(x.url!))
      .map((x) => ({ title: String(x.title ?? ""), url: x.url!, site: String(x.site ?? ""), why: String(x.why ?? "") }));
  } catch {
    return [];
  }
}

export function isBlockedSite(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return BLOCKED_SITES.some((b) => h === b || h.endsWith(`.${b}`));
  } catch {
    return true;
  }
}
