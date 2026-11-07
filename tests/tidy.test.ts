import { describe, expect, it } from "vitest";
import { staleChecked } from "@/lib/list/tidy";
import type { ListItem } from "@/lib/types";

const item = (over: Partial<ListItem>) => ({ id: "x", checked: false, deleted_at: null, client_updated_at: "2026-11-07T15:00:00", ...over }) as ListItem;

describe("clearing old checked items", () => {
  const now = new Date(2026, 10, 8, 9, 0); // Sunday morning
  it("clears what was ticked off on an earlier day", () => {
    const yesterday = new Date(2026, 10, 7, 15, 0).toISOString();
    const today = new Date(2026, 10, 8, 8, 0).toISOString();
    const out = staleChecked([
      item({ id: "a", checked: true, client_updated_at: yesterday }),
      item({ id: "b", checked: true, client_updated_at: today }),
      item({ id: "c", checked: false, client_updated_at: yesterday }),
      item({ id: "d", checked: true, client_updated_at: yesterday, deleted_at: yesterday }),
    ], now);
    expect(out.map((i) => i.id)).toEqual(["a"]);
  });
});

import { mergeDuplicates } from "@/lib/list/tidy";
describe("duplicates in one store", () => {
  const base = { list_id: "L", store_id: "costco", name: "Milk", name_norm: "milk", checked: false, deleted_at: null } as const;
  it("folds two into the first, adding amounts", () => {
    const out = mergeDuplicates([
      { ...base, id: "b", created_at: "2026-11-07T12:09:00Z", qty: 2, unit: "each", display_qty: "2" } as unknown as ListItem,
      { ...base, id: "a", created_at: "2026-11-07T12:08:00Z", qty: 2, unit: "each", display_qty: "2" } as unknown as ListItem,
    ], "T");
    expect(out.find((r) => r.id === "a")).toMatchObject({ qty: 4, display_qty: "4", deleted_at: null });
    expect(out.find((r) => r.id === "b")).toMatchObject({ deleted_at: "T" });
  });
  it("leaves different stores and checked items alone", () => {
    expect(mergeDuplicates([
      { ...base, id: "a", created_at: "1" } as unknown as ListItem,
      { ...base, id: "b", created_at: "2", store_id: "tj" } as unknown as ListItem,
      { ...base, id: "c", created_at: "3", checked: true } as unknown as ListItem,
    ])).toEqual([]);
  });
});
