// Store + section assignment for a shopping item.
//
// Order of precedence:
//   1. A store/section learned from a manual reassignment of this ingredient
//      (only if that store was selected for this trip).
//   2. The ingredient's category → ordered store rules; first selected store wins.
//   3. The "Other" category's rules (e.g. Market Basket for everything else).
//   4. The first selected store, section "Other".
// Never returns a store that wasn't selected.

import type { Category, CategoryStoreRule, IngredientInfo, StoreSection } from "../types";

export interface AssignContext {
  /** selected store ids in priority order (as chosen for the trip) */
  selectedStoreIds: string[];
  categories: Category[];
  rules: CategoryStoreRule[];
  sections: StoreSection[];
  ingredients: Map<string, IngredientInfo>;
  /** every active store (for "only at" items when that store isn't on the trip) */
  allStoreIds?: string[];
  /** keyword index: lowercase ingredient names sorted longest first */
  keywordIndex?: string[];
}

export interface Assignment {
  storeId: string | null;
  sectionId: string | null;
  categoryId: string | null;
  /** true when nothing matched and it fell back to the first store/Other */
  unknown: boolean;
  /** only sold at this store (may be a store that isn't on this trip) */
  onlyAt?: boolean;
}

export function buildKeywordIndex(ingredients: Map<string, IngredientInfo>): string[] {
  return [...ingredients.keys()].sort((a, b) => b.length - a.length);
}

/** Exact match on the normalized name, else the longest known name contained as whole words. */
export function lookupIngredient(nameNorm: string, ctx: AssignContext): IngredientInfo | null {
  const exact = ctx.ingredients.get(nameNorm);
  if (exact) return exact;
  const index = ctx.keywordIndex ?? buildKeywordIndex(ctx.ingredients);
  const padded = ` ${nameNorm} `;
  for (const key of index) {
    if (key.length >= 3 && padded.includes(` ${key} `)) return ctx.ingredients.get(key) ?? null;
  }
  return null;
}

function sectionFor(storeId: string, sectionName: string | null, ctx: AssignContext): string | null {
  const inStore = ctx.sections.filter((s) => s.store_id === storeId);
  const name = (sectionName ?? "Other").toLowerCase();
  return (
    inStore.find((s) => s.name.toLowerCase() === name)?.id ??
    inStore.find((s) => s.name.toLowerCase() === "other")?.id ??
    null
  );
}

function storeFromRules(categoryId: string, ctx: AssignContext): string | null {
  const ordered = ctx.rules
    .filter((r) => r.category_id === categoryId && ctx.selectedStoreIds.includes(r.store_id))
    .sort((a, b) => a.priority - b.priority);
  return ordered[0]?.store_id ?? null;
}

export function assignStore(nameNorm: string, ctx: AssignContext): Assignment {
  const first = ctx.selectedStoreIds[0] ?? null;
  const info = lookupIngredient(nameNorm, ctx);
  const category = info?.category_id ? ctx.categories.find((c) => c.id === info.category_id) ?? null : null;

  // 0. only sold at one store: always that store, even if it isn't on this trip
  if (info?.only_at && info.learned_store_id && (ctx.allStoreIds ?? ctx.selectedStoreIds).includes(info.learned_store_id)) {
    const sec =
      info.learned_section_id && ctx.sections.some((s) => s.id === info.learned_section_id && s.store_id === info.learned_store_id)
        ? info.learned_section_id
        : sectionFor(info.learned_store_id, category?.default_section ?? null, ctx);
    return { storeId: info.learned_store_id, sectionId: sec, categoryId: category?.id ?? null, unknown: false, onlyAt: true };
  }

  // 1. learned
  if (info?.learned_store_id && ctx.selectedStoreIds.includes(info.learned_store_id)) {
    const learnedSection =
      info.learned_section_id && ctx.sections.some((s) => s.id === info.learned_section_id && s.store_id === info.learned_store_id)
        ? info.learned_section_id
        : sectionFor(info.learned_store_id, category?.default_section ?? null, ctx);
    return { storeId: info.learned_store_id, sectionId: learnedSection, categoryId: category?.id ?? null, unknown: false };
  }

  // 2. category rules
  if (category) {
    const storeId = storeFromRules(category.id, ctx);
    if (storeId) {
      return { storeId, sectionId: sectionFor(storeId, category.default_section, ctx), categoryId: category.id, unknown: false };
    }
  }

  // 3. "Other" category rules
  const other = ctx.categories.find((c) => c.name.toLowerCase() === "other");
  if (other) {
    const storeId = storeFromRules(other.id, ctx);
    if (storeId) {
      return {
        storeId,
        sectionId: sectionFor(storeId, category?.default_section ?? "Other", ctx),
        categoryId: category?.id ?? null,
        unknown: !category,
      };
    }
  }

  // 4. first selected store
  if (!first) return { storeId: null, sectionId: null, categoryId: category?.id ?? null, unknown: true };
  return {
    storeId: first,
    sectionId: sectionFor(first, category?.default_section ?? "Other", ctx),
    categoryId: category?.id ?? null,
    unknown: !category,
  };
}
