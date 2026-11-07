import { addQty, formatAmount } from "@/lib/units";
import type { ListItem } from "@/lib/types";

/** Items ticked off before today (local time): the trip is over, so they can go. */
export function staleChecked(items: ListItem[], now: Date = new Date()): ListItem[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return items.filter((i) => i.checked && !i.deleted_at && i.client_updated_at && new Date(i.client_updated_at).getTime() < startOfToday);
}

/** One row standing for both: plain items make 2, amounts add up when the units do. */
export function combine(a: ListItem, b: ListItem): ListItem {
  const sum = a.qty == null && b.qty == null ? { qty: 2, unit: "each" } : addQty(a.qty ?? 1, a.unit ?? "each", b.qty ?? 1, b.unit ?? "each");
  return sum
    ? { ...a, qty: sum.qty, unit: sum.unit, display_qty: formatAmount(sum.qty, sum.unit) || String(sum.qty) }
    : { ...a, display_qty: [a.display_qty, b.display_qty].filter(Boolean).join(" + ") || a.display_qty };
}

/**
 * The same thing added twice to one store (say, from two phones at once):
 * keep the first one with the amounts added up, and drop the rest.
 * Both phones work this out the same way, so it settles on one answer.
 */
export function mergeDuplicates(items: ListItem[], now = new Date().toISOString()): ListItem[] {
  const open = items.filter((i) => !i.checked && !i.deleted_at && i.name_norm);
  const groups = new Map<string, ListItem[]>();
  for (const i of open) {
    const k = `${i.list_id}|${i.store_id}|${i.name_norm}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  const out: ListItem[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const [first, ...rest] = [...g].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id));
    let kept = first;
    for (const r of rest) kept = combine(kept, r);
    out.push({ ...kept, client_updated_at: now }, ...rest.map((r) => ({ ...r, deleted_at: now, client_updated_at: now })));
  }
  return out;
}
