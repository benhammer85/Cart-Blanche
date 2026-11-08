import type { ListItem } from "@/lib/types";
import { usualKey } from "./usual";

/**
 * Things on other stores' lists you could pick up at this one. A full grocery
 * store carries anything except what's on a specialty store's list (H Mart);
 * a specialty store only what we've bought there before.
 * Items sold only at another store never count.
 */
export function alsoHere(
  items: ListItem[],
  storeId: string,
  opts: { fullGrocery: boolean; usualKeys: Set<string>; onlyAt: (nameNorm: string) => string | null; listId?: string | null; specialty?: Set<string> },
): ListItem[] {
  return items
    .filter((i) => !i.checked && !i.deleted_at && i.store_id !== storeId && (!opts.listId || i.list_id === opts.listId))
    .filter((i) => {
      const n = i.name_norm ?? i.name.toLowerCase();
      const only = opts.onlyAt(n);
      if (only && only !== storeId) return false;
      if (opts.usualKeys.has(usualKey(n))) return true;
      // Things on a specialty store's list (H Mart) are usually there for a reason.
      return opts.fullGrocery && !(i.store_id && opts.specialty?.has(i.store_id));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
