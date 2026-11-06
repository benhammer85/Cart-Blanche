import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, expect, test } from "vitest";
import { assignStore, type AssignContext } from "@/lib/list/storeAssign";
import { buildShoppingList } from "@/lib/list/buildList";
import type { IngredientInfo, StoreSection } from "@/lib/types";

const sections: StoreSection[] = ["costco", "tj", "mb"].flatMap((s, si) =>
  ["Produce", "Meat", "Cheese", "Other"].map((n, i) => ({ id: `${s}-${n}`, store_id: s, name: n, sort_order: i + si })),
);
const categories = [
  { id: "produce", name: "Produce", default_section: "Produce", sort_order: 0 },
  { id: "meat", name: "Meat & Poultry", default_section: "Meat", sort_order: 1 },
  { id: "cheese", name: "Cheese", default_section: "Cheese", sort_order: 2 },
  { id: "other", name: "Other", default_section: "Other", sort_order: 3 },
];
const rules = [
  { category_id: "produce", store_id: "mb", priority: 0 },
  { category_id: "produce", store_id: "tj", priority: 1 },
  { category_id: "meat", store_id: "costco", priority: 0 },
  { category_id: "meat", store_id: "mb", priority: 1 },
  { category_id: "cheese", store_id: "tj", priority: 0 },
  { category_id: "other", store_id: "mb", priority: 0 },
];
const info = (name_norm: string, category_id: string | null, extra: Partial<IngredientInfo> = {}): [string, IngredientInfo] => [
  name_norm,
  { name_norm, category_id, is_staple: false, is_out: false, pack_size: null, learned_store_id: null, learned_section_id: null, ...extra },
];
const ctx = (selected: string[], extra: [string, IngredientInfo][] = []): AssignContext => ({
  selectedStoreIds: selected,
  categories,
  rules,
  sections,
  ingredients: new Map([info("onion", "produce"), info("chicken thigh", "meat"), info("chicken", "meat"), info("feta", "cheese"), ...extra]),
});

describe("store assignment", () => {
  test("first selected store in the category's preference order", () => {
    expect(assignStore("onion", ctx(["costco", "tj", "mb"])).storeId).toBe("mb");
    expect(assignStore("onion", ctx(["costco", "tj"])).storeId).toBe("tj");
    expect(assignStore("chicken thigh", ctx(["costco", "tj"]))).toMatchObject({ storeId: "costco", sectionId: "costco-Meat" });
  });

  test("never assigns a store that wasn't selected", () => {
    const a = assignStore("feta", ctx(["costco"]));
    expect(a.storeId).toBe("costco");
    expect(a.sectionId).toBe("costco-Cheese");
  });

  test("keyword match finds the category for longer names", () => {
    expect(assignStore("boneless chicken thigh fillet", ctx(["costco", "tj"])).storeId).toBe("costco");
  });

  test("unknown items: Other rule if possible, else first selected store, section Other", () => {
    expect(assignStore("dragonfruit jam", ctx(["costco", "mb"]))).toMatchObject({ storeId: "mb", sectionId: "mb-Other", unknown: true });
    expect(assignStore("dragonfruit jam", ctx(["tj", "costco"]))).toMatchObject({ storeId: "tj", sectionId: "tj-Other", unknown: true });
  });

  test("learned reassignment wins when that store is on the trip", () => {
    const learned = info("onion", "produce", { learned_store_id: "costco", learned_section_id: "costco-Produce" });
    expect(assignStore("onion", ctx(["costco", "mb"], [learned])).storeId).toBe("costco");
    expect(assignStore("onion", ctx(["tj", "mb"], [learned])).storeId).toBe("mb");
  });

  test("bulk store items get a pack note", () => {
    const c = ctx(["costco"], [info("chicken thigh", "meat", { pack_size: "~6 lb" })]);
    const items = buildShoppingList(
      [{ key: "a", title: "A", recipeId: "a", baseServings: 4, servings: 4, ingredients: [{ qty: 2, qty_max: null, unit: "lb", name: "chicken thigh", name_norm: "chicken thigh", raw_text: "", parsed_ok: true }] }],
      { ...c, stores: [{ id: "costco", name: "Costco", location: null, sort_order: 0, is_bulk: true, archived: false }], synonyms: {} },
    );
    expect(items[0].note).toBe("Bulk pack: ~6 lb");
  });
});

import { validCertUrl } from "@/lib/alexa/verify";
describe("Alexa cert URL validation", () => {
  test("accepts Amazon's documented forms and rejects others", () => {
    expect(validCertUrl("https://s3.amazonaws.com/echo.api/echo-api-cert.pem")).toBe(true);
    expect(validCertUrl("https://s3.amazonaws.com:443/echo.api/echo-api-cert.pem")).toBe(true);
    expect(validCertUrl("https://s3.amazonaws.com/echo.api/../echo.api/echo-api-cert.pem")).toBe(true);
    expect(validCertUrl("http://s3.amazonaws.com/echo.api/echo-api-cert.pem")).toBe(false);
    expect(validCertUrl("https://notamazon.com/echo.api/echo-api-cert.pem")).toBe(false);
    expect(validCertUrl("https://s3.amazonaws.com/EcHo.aPi/echo-api-cert.pem")).toBe(false);
    expect(validCertUrl("https://s3.amazonaws.com:563/echo.api/echo-api-cert.pem")).toBe(false);
    expect(validCertUrl("https://s3.amazonaws.com/invalid.path/echo-api-cert.pem")).toBe(false);
  });
});
