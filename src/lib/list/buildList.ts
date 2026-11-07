// Turn planned meals into a merged, store-assigned shopping list.
//
//   1. Scale each recipe's ingredients to the meal's servings.
//   2. Normalize names (synonyms) and drop pantry staples unless marked "out".
//   3. Merge by normalized name. Volumes merge via tsp, weights via grams,
//      count units only with the same unit; mixed groups display as "2 lb + 1 can".
//   4. Assign store/section with storeAssign; add a bulk note for bulk stores.

import { assignStore, buildKeywordIndex, lookupIngredient, type AssignContext } from "./storeAssign";
import { formatAmount, fromBase, mergeKey, toBase, unitDimension, niceFraction, round } from "../units";
import { normalizeName } from "../normalize";
import { isIngredientHeading, isProseLine } from "../ingredientParser";
import { parsePack, planPacks, useStock, type Amount } from "./bulk";
import type { IngredientInfo, RecipeIngredient, Store } from "../types";

export interface PlannedMealForList {
  key: string;
  title: string;
  recipeId: string | null;
  /** servings the recipe was written for */
  baseServings: number;
  /** servings we are cooking */
  servings: number;
  ingredients: Pick<RecipeIngredient, "qty" | "qty_max" | "unit" | "name" | "name_norm" | "raw_text" | "parsed_ok">[];
}

export interface DraftListItem {
  key: string; // name_norm
  name: string;
  nameNorm: string;
  qty: number | null;
  unit: string | null;
  displayQty: string;
  storeId: string | null;
  sectionId: string | null;
  categoryId: string | null;
  unknown: boolean;
  note: string | null;
  sourceMeals: { title: string; recipeId: string | null }[];
  /** true if it's a pantry staple marked "we're out" */
  wasOut: boolean;
  /** only sold at its store */
  onlyAt?: boolean;
  /** taken from bulk/freezer stock (nothing or less to buy) */
  fromStock?: Amount | null;
  /** fully covered by stock: nothing to buy */
  coveredByStock?: boolean;
  /** what a bulk pack leaves over, to go into stock */
  leftover?: Amount | null;
}

export interface BuildListOptions extends Omit<AssignContext, "keywordIndex"> {
  stores: Store[];
  synonyms: Record<string, string>;
  /** what's left from bulk packs / in the freezer, by name */
  stock?: Map<string, Amount>;
}

interface Acc {
  name: string;
  nameNorm: string;
  amounts: Map<string, { base: number; unit: string | null; hasQty: boolean }>;
  meals: Map<string, { title: string; recipeId: string | null }>;
}

/** Teaspoons of juice one fruit gives. */
const CITRUS_TSP: Record<string, number> = { lemon: 6, lime: 4, orange: 12 };

export function scaleQty(qty: number | null, base: number, target: number): number | null {
  if (qty == null) return null;
  if (!base || base <= 0) return qty;
  return qty * (target / base);
}

export function buildShoppingList(meals: PlannedMealForList[], opts: BuildListOptions): DraftListItem[] {
  const groups = new Map<string, Acc>();
  const keywordIndex = buildKeywordIndex(opts.ingredients);
  const ctx: AssignContext = { ...opts, keywordIndex };
  const outStaples = new Set<string>();

  for (const meal of meals) {
    for (const ing of meal.ingredients) {
      // Sub-headings and stray sentences saved as ingredient lines aren't things to buy.
      if (isIngredientHeading(ing.raw_text || ing.name, ing.qty, ing.unit) || isProseLine(ing.raw_text || ing.name, ing.qty)) continue;
      const nameNorm = opts.synonyms[ing.name_norm] ?? (ing.name_norm || normalizeName(ing.name, opts.synonyms));
      // "salt and pepper" — skip when every part is a staple we have
      const parts = nameNorm.split(/\s+(?:and|&)\s+/);
      if (parts.length > 1 && parts.every((p) => {
        const i = lookupIngredient(opts.synonyms[p] ?? p, ctx);
        return i?.is_staple && !i.is_out;
      })) continue;
      const info = lookupIngredient(nameNorm, ctx);
      if (info?.is_staple) {
        if (!info.is_out) continue; // pantry staple we have
        outStaples.add(nameNorm);
      }
      // Use the high end of a range so we don't come home short.
      const rawQty = ing.qty_max ?? ing.qty;
      const qty = scaleQty(rawQty, meal.baseServings, meal.servings);
      const unit = ing.unit ?? (qty != null ? "each" : null);

      let g = groups.get(nameNorm);
      if (!g) {
        g = { name: prettyName(nameNorm), nameNorm, amounts: new Map(), meals: new Map() };
        groups.set(nameNorm, g);
      }
      g.meals.set(meal.key, { title: meal.title, recipeId: meal.recipeId });

      // Juice/zest measured by volume → whole fruit (≈2 tbsp juice per lemon/lime).
      let u2 = unit;
      let q2 = qty;
      if (CITRUS_TSP[nameNorm] && qty != null && unitDimension(unit) === "volume") {
        q2 = toBase(qty, unit!) / CITRUS_TSP[nameNorm];
        u2 = "each";
      }
      const mk = mergeKey(u2);
      const slot = g.amounts.get(mk) ?? { base: 0, unit: u2, hasQty: false };
      if (q2 != null) {
        const dim = unitDimension(u2);
        slot.base += dim === "count" ? q2 : toBase(q2, u2!);
        slot.hasQty = true;
      }
      g.amounts.set(mk, slot);
    }
  }

  const items: DraftListItem[] = [];
  for (const g of groups.values()) {
    const parts: { qty: number; unit: string }[] = [];
    for (const [mk, slot] of g.amounts) {
      if (!slot.hasQty) continue;
      if (mk === "volume" || mk === "weight") {
        const r = fromBase(slot.base, mk);
        parts.push(r);
      } else {
        const u = slot.unit ?? "each";
        // count items: round up to whole units (you can't buy 1.5 onions)
        const q = u === "each" || u === "can" || u === "jar" || u === "package" || u === "bag" || u === "box" || u === "bottle" || u === "head" || u === "bunch"
          ? Math.max(1, Math.ceil(slot.base - 0.05))
          : niceFraction(slot.base) || round(slot.base, 2);
        parts.push({ qty: q, unit: u });
      }
    }
    const assignment = assignStore(g.nameNorm, { ...ctx, allStoreIds: ctx.allStoreIds ?? opts.stores.filter((s) => !s.archived).map((s) => s.id) });
    const info = lookupIngredient(g.nameNorm, ctx);
    const store = opts.stores.find((s) => s.id === assignment.storeId);
    const notes: string[] = [];
    let need: Amount | null = parts.length === 1 ? { qty: parts[0].qty, unit: parts[0].unit } : null;

    // 1. Use what's in the freezer / left from a bulk pack first.
    let fromStock: Amount | null = null;
    let coveredByStock = false;
    const have = opts.stock?.get(g.nameNorm);
    if (need && have) {
      const use = useStock(need, have);
      if (use) {
        fromStock = use.used;
        if (!use.toBuy) {
          coveredByStock = true;
          notes.push(`Use ${formatAmount(use.used.qty, use.used.unit)} from the freezer`);
        } else {
          notes.push(`Have ${formatAmount(use.used.qty, use.used.unit)} frozen`);
          need = use.toBuy;
        }
      }
    }

    // 2. Bulk store: how far does a pack go?
    let leftover: Amount | null = null;
    if (!coveredByStock && store?.is_bulk && info?.pack_size) {
      const pack = parsePack(info.pack_size);
      const plan = need && pack ? planPacks(need, pack) : null;
      if (plan && pack) {
        leftover = plan.leftover;
        notes.push(
          `${plan.packs > 1 ? `${plan.packs} packs` : "1 pack"} (${formatAmount(pack.qty * plan.packs, pack.unit)})` +
            (leftover ? `, freeze ${formatAmount(leftover.qty, leftover.unit)}` : ""),
        );
      } else notes.push(`Bulk pack: ${info.pack_size}`);
    }
    if (assignment.onlyAt && store) notes.push(`Only at ${store.name}`);
    // Our rotisserie chickens become stock (and Saul's ramen).
    if (/rotisserie chicken/.test(g.nameNorm)) notes.push("Save the bones for stock");

    const shown = need && fromStock && !coveredByStock ? [need] : parts;
    items.push({
      key: g.nameNorm,
      name: g.name,
      nameNorm: g.nameNorm,
      qty: shown.length === 1 ? shown[0].qty : null,
      unit: shown.length === 1 ? shown[0].unit : null,
      displayQty: shown.map((p) => formatAmount(p.qty, p.unit) || String(p.qty)).join(" + "),
      storeId: assignment.storeId,
      sectionId: assignment.sectionId,
      categoryId: assignment.categoryId,
      unknown: assignment.unknown,
      note: notes.join(" · ") || null,
      sourceMeals: [...g.meals.values()],
      wasOut: outStaples.has(g.nameNorm),
      onlyAt: assignment.onlyAt,
      fromStock,
      coveredByStock,
      leftover,
    });
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export function prettyName(nameNorm: string): string {
  return nameNorm.charAt(0).toUpperCase() + nameNorm.slice(1);
}

/** Kid portion by age (editable per person via portion_override). */
export function portionForAge(age: number): number {
  if (age < 2) return 0.25;
  if (age < 4) return 0.33;
  if (age < 9) return 0.5;
  if (age < 13) return 0.75;
  return 1;
}

export function ageOn(birthdate: string, today = new Date()): number {
  const b = new Date(birthdate + "T00:00:00");
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

export interface Portions {
  adults: number;
  kids: number;
  /** adult-equivalent servings when everyone eats the same meal */
  everyone: number;
  /** adult-equivalent servings for the kids only */
  kidsOnly: number;
}

export function portionsFor(
  people: { kind: "adult" | "kid"; birthdate: string | null; portion_override: number | null }[],
  today = new Date(),
): Portions {
  let adults = 0;
  let kidsOnly = 0;
  let kids = 0;
  for (const p of people) {
    if (p.kind === "adult") {
      adults += p.portion_override ?? 1;
    } else {
      kids++;
      kidsOnly += p.portion_override ?? (p.birthdate ? portionForAge(ageOn(p.birthdate, today)) : 0.5);
    }
  }
  return { adults, kids, everyone: round(adults + kidsOnly, 2), kidsOnly: round(kidsOnly, 2) };
}

export type { IngredientInfo };
