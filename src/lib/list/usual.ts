// "Usually at Costco": fold variants you'd grab from the same spot into one
// (rice, jasmine rice, white rice), labelled with the one you buy most.

// Words that don't change which product you reach for.
const FILLER = /\b(organic|kirkland( signature)?|ks|signature|large|extra[- ]large|jumbo|fresh|raw|uncooked|natural|premium|value pack|family size|bag of|box of|pack of)\b/g;
// Kinds that live side by side on the shelf and stand in for each other.
const KINDS: [RegExp, string][] = [
  [/\b(jasmine|white|long[- ]grain|basmati|plain)\s+rice\b/g, "rice"],
  [/\b(brown|white|large|cage[- ]free|free[- ]range|pasture[- ]raised)\s+eggs?\b/g, "eggs"],
  [/\b(sweet\s+)?baby carrots?\b/g, "carrots"],
];

export function usualKey(nameNorm: string): string {
  let k = nameNorm.toLowerCase();
  for (const [re, to] of KINDS) k = k.replace(re, to);
  k = k.replace(FILLER, " ").replace(/\s+/g, " ").trim();
  return k || nameNorm;
}

export interface UsualItem {
  key: string;
  label: string;
  n: number;
}

/** Merge variants; the most-bought one names the group and is what gets added. */
export function foldVariants(items: UsualItem[]): UsualItem[] {
  const groups = new Map<string, UsualItem[]>();
  for (const it of items) {
    const g = usualKey(it.key);
    groups.set(g, [...(groups.get(g) ?? []), it]);
  }
  return [...groups.values()]
    .map((g) => {
      const top = [...g].sort((a, b) => b.n - a.n || a.key.length - b.key.length)[0];
      return { key: top.key, label: top.label, n: g.reduce((s, x) => s + x.n, 0) };
    })
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}
