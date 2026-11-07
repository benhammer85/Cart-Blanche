import { BROWSE_SOURCES } from "@/lib/discover";

/** Which trusted recipe pages to look through for this trip: store pages first, then general ones. */
export function sourcesFor(storeNames: string[], kidFriendly: boolean, rand: () => number = Math.random): string[] {
  const storeKeys = storeNames.map((n) => n.toLowerCase().replace(/[^a-z]/g, ""));
  const forStore = BROWSE_SOURCES.filter((s) => s.store && storeKeys.some((k) => k.includes(s.store!)));
  const general = BROWSE_SOURCES.filter((s) => !s.store);
  const kid = general.filter((s) => /kid/i.test(s.label));
  const rest = general.filter((s) => !/kid/i.test(s.label));
  const shuffle = <T,>(a: T[]) => a.map((x) => [rand(), x] as const).sort((p, q) => p[0] - q[0]).map(([, x]) => x);
  const picked = [...shuffle(forStore).slice(0, 2), ...shuffle(kid).slice(0, kidFriendly ? 2 : 1), ...shuffle(rest)];
  // One page per site, so one blog doesn't fill the whole row.
  const sites = new Set<string>();
  return picked.filter((s) => !sites.has(s.site) && sites.add(s.site)).map((s) => s.url).slice(0, 4);
}

/** Take from each list in turn: a few from every site. */
export function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

export function shuffled<T>(items: T[], rand: () => number = Math.random): T[] {
  return items.map((x) => [rand(), x] as const).sort((p, q) => p[0] - q[0]).map(([, x]) => x);
}
