import { describe, expect, test } from "vitest";
import { receiptUpdates, suggestFromReceipt } from "@/lib/receipts";
import { makeFitContext, onlyAtStores, storeFit } from "@/lib/trip";
import { buildDiscoverPrompt } from "@/lib/discover";
import type { Category, CategoryStoreRule, IngredientInfo } from "@/lib/types";

const categories: Category[] = [
  { id: "c-prod", name: "Produce", default_section: "Produce", sort_order: 0 },
  { id: "c-sauce", name: "Pantry", default_section: "Pantry", sort_order: 1 },
  { id: "c-other", name: "Other", default_section: "Other", sort_order: 9 },
];
const rules: CategoryStoreRule[] = [
  { category_id: "c-other", store_id: "mb", priority: 0 },
  { category_id: "c-other", store_id: "shaws", priority: 1 },
  { category_id: "c-prod", store_id: "mb", priority: 0 },
  { category_id: "c-sauce", store_id: "mb", priority: 0 },
];
const ing = (name_norm: string, extra: Partial<IngredientInfo> = {}): IngredientInfo => ({
  name_norm, category_id: null, is_staple: false, is_out: false, pack_size: null, learned_store_id: null, learned_section_id: null, ...extra,
});
const ingredients = new Map<string, IngredientInfo>([
  ["banana", ing("banana", { category_id: "c-prod" })],
  ["soyaki", ing("soyaki", { category_id: "c-sauce", learned_store_id: "tj", only_at: true })],
  ["chicken thigh", ing("chicken thigh", { learned_store_id: "costco" })],
]);
const base = { categories, rules, ingredients, synonyms: {} as Record<string, string> };

describe("learning from receipts", () => {
  test("specialty store: new and known items are ticked, only-at elsewhere is left alone", () => {
    const s = suggestFromReceipt(
      [{ name: "Mandarin orange chicken", category: "Other", signature: true }, { name: "banana" }, { name: "Soyaki" }, { name: "Banana" }, { name: "Bag fee" }],
      { ...base, storeId: "tj" },
    );
    const by = Object.fromEntries(s.map((x) => [x.nameNorm, x]));
    expect(by["mandarin orange chicken"]).toMatchObject({ action: "new", checked: true });
    expect(by["banana"]).toMatchObject({ action: "move", checked: true, count: 2 });
    expect(by["soyaki"]).toMatchObject({ action: "same", checked: false });
    expect(Object.keys(by)).not.toContain("bag fee");
  });

  test("everyday store: moves aren't ticked, new items only get a category", () => {
    const ctx = { ...base, storeId: "shaws" };
    const s = suggestFromReceipt([{ name: "chicken thighs" }, { name: "popsicles", category: "Other" }, { name: "soyaki" }], ctx);
    const by = Object.fromEntries(s.map((x) => [x.nameNorm, x]));
    expect(by["chicken thigh"]).toMatchObject({ action: "move", checked: false });
    expect(by["soyaki"].action).toBe("only-at");
    const rows = receiptUpdates(s, { ...ctx, householdId: "h", isBulk: false });
    expect(rows).toEqual([{ household_id: "h", name_norm: "popsicle", category_id: "c-other" }]);
  });

  test("bulk store keeps the pack size for new items", () => {
    const ctx = { ...base, storeId: "costco" };
    const s = suggestFromReceipt([{ name: "salmon", size: "3 lb", category: "Other" }], ctx);
    expect(receiptUpdates(s, { ...ctx, householdId: "h", isBulk: true })[0]).toMatchObject({ learned_store_id: "costco", pack_size: "3 lb" });
  });
});

describe("only-at items", () => {
  const ctx = makeFitContext(base);
  test("a full grocery store doesn't carry another store's only-at item", () => {
    expect(storeFit(["soyaki", "banana"], "mb", ctx).missing).toEqual(["soyaki"]);
    expect(storeFit(["soyaki"], "tj", ctx).missing).toEqual([]);
  });
  test("recipes that need a store's own products", () => {
    expect(onlyAtStores(["soyaki", "chicken thigh"], ctx)).toEqual([{ storeId: "tj", items: ["soyaki"] }]);
  });
  test("Discover hears about the store's notes and products", () => {
    const prompt = buildDiscoverPrompt({ favorites: [], cuisines: [], proteins: [], styles: [] } as never, { store: "Trader Joe's", storeNotes: "frozen dumplings", storeOnly: ["soyaki"] }, [4, 6], [], []);
    expect(prompt).toContain("frozen dumplings");
    expect(prompt).toContain("soyaki");
  });
});
