import { describe, expect, test } from "vitest";
import { alsoHere } from "@/lib/list/alsoHere";
import type { ListItem } from "@/lib/types";

const it = (name: string, store: string, extra: Partial<ListItem> = {}) => ({ id: name, name, name_norm: name.toLowerCase(), store_id: store, list_id: "L", checked: false, deleted_at: null, ...extra }) as ListItem;
const list = [it("Spaghetti", "mb"), it("Bananas", "mb"), it("Chicken thighs", "mb"), it("Soyaki", "tj"), it("Gochujang", "hmart"), it("Milk", "mb", { checked: true })];
const onlyAt = (n: string) => (n === "soyaki" ? "tj" : n === "gochujang" ? "hmart" : null);

describe("also here", () => {
  test("a full grocery store shows everything else that isn't sold only elsewhere", () => {
    expect(alsoHere(list, "shaws", { fullGrocery: true, usualKeys: new Set(), onlyAt }).map((i) => i.name)).toEqual(["Bananas", "Chicken thighs", "Spaghetti"]);
  });
  test("a specialty store shows only what we buy there", () => {
    expect(alsoHere(list, "tj", { fullGrocery: false, usualKeys: new Set(["bananas", "spaghetti"]), onlyAt }).map((i) => i.name)).toEqual(["Bananas", "Spaghetti"]);
  });
  test("a specialty store's items stay there unless we've bought them here", () => {
    const l = [it("Japchae sauce", "hmart"), it("Spaghetti", "mb")];
    const specialty = new Set(["hmart"]);
    expect(alsoHere(l, "shaws", { fullGrocery: true, usualKeys: new Set(), onlyAt, specialty }).map((i) => i.name)).toEqual(["Spaghetti"]);
    expect(alsoHere(l, "shaws", { fullGrocery: true, usualKeys: new Set(["japchae sauce"]), onlyAt, specialty }).map((i) => i.name)).toEqual(["Japchae sauce", "Spaghetti"]);
  });
  test("checked items and this store's own items stay out", () => {
    expect(alsoHere(list, "mb", { fullGrocery: true, usualKeys: new Set(), onlyAt }).map((i) => i.name)).toEqual([]);
  });
});
