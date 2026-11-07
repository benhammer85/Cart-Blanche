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
