// Learn from receipts: what we actually buy at each store.
//
// Gemini reads the receipt (Costco PDF, paper receipt photo, Instacart order
// screenshot) into plain item names. We then suggest, per item:
//   • new        not known yet: add it, with a category, at this store
//   • move       known, but usually bought elsewhere
//   • same       already set to this store (nothing to do)
//   • only-at    marked "only sold at" another store (left alone)
// For a full grocery store (Market Basket, Shaw's) most items are left to the
// category rules, since those stores carry nearly everything; only items we
// don't know yet are pre-ticked, so a Shaw's top-up run doesn't pull bananas
// away from Market Basket. For specialty and bulk stores everything is pre-ticked.

import { normalizeName } from "./normalize";
import type { Category, CategoryStoreRule, IngredientInfo } from "./types";

export function buildReceiptPrompt(categoryNames: string[]): string {
  return `This is a grocery receipt or order (a store receipt PDF, a photo of a paper receipt, or an Instacart order screenshot).
List every food or household item bought. For each item:
- "name": a short plain name a shopper would write, lower case, singular where natural, without brand names or sizes
  (receipt codes like "KS ORG EGGS 24CT" become "eggs"; "TJ'S SOYAKI" stays "soyaki" because it is a product only that store sells;
  "MB 2% MILK GAL" becomes "milk").
- "size": the package size if it is printed (e.g. "6 lb", "24 ct", "2 x 1 gal"), else "".
- "category": the best fit from this list: ${categoryNames.join(", ")}.
- "signature": true if it is a store-brand or specialty product that other stores would not carry under that name, else false.
Skip bag fees, deposits, coupons, discounts, taxes, totals, gift cards, gas and non-grocery items like clothing or electronics.
Also give "store": the store name printed on the receipt, if any.
Reply with JSON only: {"store":"","items":[{"name":"","size":"","category":"","signature":false}]}`;
}

/** Static prompt for older callers; the route builds one with the household's categories. */
export const RECEIPT_PROMPT = buildReceiptPrompt(["Produce", "Meat", "Dairy", "Pantry", "Frozen", "Bakery", "Other"]);

export interface ReceiptItem {
  name: string;
  size?: string | null;
  category?: string | null;
  signature?: boolean | null;
}

export type ReceiptAction = "new" | "move" | "same" | "only-at";

export interface ReceiptSuggestion {
  nameNorm: string;
  label: string;
  action: ReceiptAction;
  /** store it's set to now (for "move" and "only-at") */
  currentStoreId: string | null;
  categoryId: string | null;
  size: string | null;
  signature: boolean;
  /** pre-ticked in the review list */
  checked: boolean;
  /** how many times it appeared across the receipts */
  count: number;
}

export interface ReceiptContext {
  storeId: string;
  categories: Category[];
  rules: CategoryStoreRule[];
  ingredients: Map<string, IngredientInfo>;
  synonyms: Record<string, string>;
}

/** Is this one of our everyday stores (1st or 2nd choice for "Other")? */
export function isFullGrocery(storeId: string, categories: Category[], rules: CategoryStoreRule[]): boolean {
  const other = categories.find((c) => c.name.toLowerCase() === "other");
  return !!other && rules.some((r) => r.category_id === other.id && r.store_id === storeId && r.priority <= 1);
}

const JUNK = /^(bag|bags|bag fee|deposit|bottle deposit|coupon|discount|tax|subtotal|total|tip|service fee|delivery fee|instant savings)$/;

export function suggestFromReceipt(items: ReceiptItem[], ctx: ReceiptContext): ReceiptSuggestion[] {
  const everyday = isFullGrocery(ctx.storeId, ctx.categories, ctx.rules);
  const byName = new Map<string, ReceiptSuggestion>();
  for (const it of items) {
    const nameNorm = normalizeName(it.name, ctx.synonyms);
    if (!nameNorm || nameNorm.length < 2 || JUNK.test(nameNorm)) continue;
    const prev = byName.get(nameNorm);
    if (prev) {
      prev.count++;
      continue;
    }
    const info = ctx.ingredients.get(nameNorm);
    const cat = it.category ? ctx.categories.find((c) => c.name.toLowerCase() === it.category!.toLowerCase().trim()) : undefined;
    const signature = !!it.signature;
    let action: ReceiptAction;
    if (!info) action = "new";
    else if (info.only_at && info.learned_store_id && info.learned_store_id !== ctx.storeId) action = "only-at";
    else if (info.learned_store_id === ctx.storeId) action = "same";
    else action = "move";
    const checked = action === "new" ? true : action === "move" ? !everyday || signature : false;
    byName.set(nameNorm, {
      nameNorm,
      label: nameNorm,
      action,
      currentStoreId: info?.learned_store_id ?? null,
      categoryId: info?.category_id ?? cat?.id ?? null,
      size: it.size?.trim() || null,
      signature,
      checked,
      count: 1,
    });
  }
  const order: Record<ReceiptAction, number> = { new: 0, move: 1, same: 2, "only-at": 3 };
  return [...byName.values()].sort((a, b) => order[a.action] - order[b.action] || a.label.localeCompare(b.label));
}

/**
 * Rows to upsert into ingredients for the ticked suggestions.
 * For an everyday store, a new item only gets its category (the store rules
 * already send it there); for specialty/bulk stores it's tied to the store.
 */
export function receiptUpdates(
  picked: ReceiptSuggestion[],
  ctx: ReceiptContext & { householdId: string; isBulk: boolean },
): Record<string, unknown>[] {
  const everyday = isFullGrocery(ctx.storeId, ctx.categories, ctx.rules);
  return picked
    .filter((s) => s.checked && (s.action === "new" || s.action === "move"))
    .map((s) => {
      const info = ctx.ingredients.get(s.nameNorm);
      const row: Record<string, unknown> = { household_id: ctx.householdId, name_norm: s.nameNorm };
      if (!info?.category_id && s.categoryId) row.category_id = s.categoryId;
      const tie = !everyday || s.signature || s.action === "move";
      if (tie) {
        row.learned_store_id = ctx.storeId;
        row.learned_section_id = null;
      }
      if (ctx.isBulk && s.size && !info?.pack_size) row.pack_size = s.size;
      return row;
    });
}
