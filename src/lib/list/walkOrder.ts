// The order you walk a store, aisle by aisle.
//
// Start from how each kind of store is usually laid out (produce at the door,
// meat along the back, cold things last so they stay cold), then learn from
// the order you actually check things off in your store.

const SUPERMARKET = ["Produce", "Bakery", "Deli", "Meat", "Seafood", "Pantry", "International", "Condiments", "Baking & Spices", "Snacks", "Beverages", "Household", "Cheese", "Dairy", "Frozen", "Other"];

/** Usual walk order by store (matched on the store's name). */
export const WALK_ORDERS: Record<string, string[]> = {
  // Produce and flowers at the door, bread, cheese and refrigerated, then the aisles; frozen near the registers.
  traderjoes: ["Produce", "Bakery", "Cheese", "Deli", "Meat", "Seafood", "Dairy", "Pantry", "International", "Condiments", "Snacks", "Baking & Spices", "Beverages", "Household", "Frozen", "Other"],
  // Big center aisles first (household, pantry, snacks, drinks), then the cold walls: meat, deli, dairy, produce; frozen and bakery near checkout.
  costco: ["Household", "Pantry", "Condiments", "Baking & Spices", "Snacks", "Beverages", "Meat", "Seafood", "Deli", "Cheese", "Dairy", "Produce", "Bakery", "Frozen", "Other"],
  hmart: ["Produce", "Seafood", "Meat", "Dairy", "International", "Pantry", "Snacks", "Frozen", "Other"],
  marketbasket: SUPERMARKET,
  shaws: SUPERMARKET,
};

export function walkOrderFor(storeName: string): string[] {
  return WALK_ORDERS[storeName.toLowerCase().replace(/[^a-z]/g, "")] ?? SUPERMARKET;
}

/** Sort a store's sections into the usual order; ones we don't know go just before Other. */
export function sortSections<T extends { name: string }>(sections: T[], storeName: string): T[] {
  const order = walkOrderFor(storeName).map((s) => s.toLowerCase());
  const otherAt = order.indexOf("other");
  const rank = (s: T) => {
    const i = order.indexOf(s.name.toLowerCase());
    return i >= 0 ? i : otherAt - 0.5;
  };
  return sections.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map((x) => x.s);
}

/**
 * Learn from a trip: the sections you checked off, in the order you did,
 * take the places those sections had; everything else stays put.
 * [Produce, Bakery, Meat, Dairy] walked as Produce → Dairy → Meat
 * becomes [Produce, Bakery, Dairy, Meat].
 */
export function learnWalkOrder(current: string[], walked: string[]): string[] {
  const seen = walked.filter((id, i) => current.includes(id) && walked.indexOf(id) === i);
  if (seen.length < 3) return current; // too little to go on
  const slots = current.map((id, i) => (seen.includes(id) ? i : -1)).filter((i) => i >= 0);
  const next = [...current];
  slots.forEach((slot, k) => (next[slot] = seen[k]));
  return next;
}
