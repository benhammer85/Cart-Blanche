import type { ListItem } from "@/lib/types";

/** Items ticked off before today (local time): the trip is over, so they can go. */
export function staleChecked(items: ListItem[], now: Date = new Date()): ListItem[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return items.filter((i) => i.checked && !i.deleted_at && i.client_updated_at && new Date(i.client_updated_at).getTime() < startOfToday);
}
