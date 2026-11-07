// Quick trip: how well does a recipe fit a single store?
//
// Based on our own store rules, not live inventory:
//   • A full grocery store (1st or 2nd choice for "Other", e.g. Market Basket,
//     Shaw's) counts as having everything.
//   • For other stores (Trader Joe's, Costco) an item counts when that store is
//     our 1st or 2nd choice for its category, or the item was moved there before.
//     Anything else is "usually from elsewhere" (the store may still have it).
// Pantry staples we have are ignored; unknown items use the "Other" category.

import { lookupIngredient, buildKeywordIndex, type AssignContext } from "./list/storeAssign";
import type { Category, CategoryStoreRule, IngredientInfo } from "./types";

export interface StoreFit {
  /** ingredients we'd need to buy */
  total: number;
  /** of those, how many this store carries */
  carried: number;
  /** names it doesn't carry */
  missing: string[];
}

export interface FitContext {
  categories: Category[];
  rules: CategoryStoreRule[];
  ingredients: Map<string, IngredientInfo>;
  synonyms: Record<string, string>;
  keywordIndex?: string[];
}

export function makeFitContext(c: Omit<FitContext, "keywordIndex">): FitContext {
  return { ...c, keywordIndex: buildKeywordIndex(c.ingredients) };
}

/** Fit for a trip to several stores: an item counts if any of them carries it. */
export function tripFit(ingredientNames: string[], storeIds: string[], ctx: FitContext): StoreFit {
  if (storeIds.length <= 1) return storeFit(ingredientNames, storeIds[0] ?? "", ctx);
  const fits = storeIds.map((id) => storeFit(ingredientNames, id, ctx));
  const missing = fits[0].missing.filter((m) => fits.every((f) => f.missing.includes(m)));
  const total = fits[0].total;
  return { total, carried: total - missing.length, missing };
}

export function storeFit(ingredientNames: string[], storeId: string, ctx: FitContext): StoreFit {
  const assignCtx: AssignContext = {
    selectedStoreIds: [storeId],
    categories: ctx.categories,
    rules: ctx.rules,
    sections: [],
    ingredients: ctx.ingredients,
    keywordIndex: ctx.keywordIndex,
  };
  const other = ctx.categories.find((c) => c.name.toLowerCase() === "other");
  const usual = (categoryId: string) => ctx.rules.some((r) => r.category_id === categoryId && r.store_id === storeId && r.priority <= 1);
  const fullGrocery = other ? usual(other.id) : false;
  const seen = new Set<string>();
  let total = 0;
  let carried = 0;
  const missing: string[] = [];
  for (const raw of ingredientNames) {
    const name = ctx.synonyms[raw] ?? raw;
    if (seen.has(name)) continue;
    seen.add(name);
    // "salt and pepper": skip when every part is a staple we have
    const parts = name.split(/\s+(?:and|&)\s+/);
    const infos = parts.map((p) => lookupIngredient(ctx.synonyms[p] ?? p, assignCtx));
    if (infos.every((i) => i?.is_staple && !i.is_out)) continue;
    const info = infos[0];
    total++;
    const categoryId = info?.category_id ?? other?.id ?? null;
    const elsewhereOnly = !!info?.only_at && !!info.learned_store_id && info.learned_store_id !== storeId;
    const sells = !elsewhereOnly && (fullGrocery || info?.learned_store_id === storeId || (categoryId ? usual(categoryId) : true));
    if (sells) carried++;
    else missing.push(name);
  }
  return { total, carried, missing };
}

/** 0–1 share of what we'd buy that this store carries (1 when nothing to buy). */
export function fitShare(f: StoreFit): number {
  return f.total ? f.carried / f.total : 1;
}

/**
 * Stores a recipe depends on because an ingredient is only sold there
 * (e.g. Soyaki from Trader Joe's). Returns store ids with the item names.
 */
export function onlyAtStores(ingredientNames: string[], ctx: FitContext): { storeId: string; items: string[] }[] {
  const assignCtx: AssignContext = { selectedStoreIds: [], categories: ctx.categories, rules: ctx.rules, sections: [], ingredients: ctx.ingredients, keywordIndex: ctx.keywordIndex };
  const out = new Map<string, string[]>();
  for (const raw of ingredientNames) {
    const name = ctx.synonyms[raw] ?? raw;
    const info = lookupIngredient(name, assignCtx);
    if (!info?.only_at || !info.learned_store_id) continue;
    const list = out.get(info.learned_store_id) ?? [];
    if (!list.includes(info.name_norm)) list.push(info.name_norm);
    out.set(info.learned_store_id, list);
  }
  return [...out.entries()].map(([storeId, items]) => ({ storeId, items }));
}
