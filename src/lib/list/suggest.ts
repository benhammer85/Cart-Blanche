// Suggestions while typing in the list's add box: "ro" → Rotisserie chicken.
//
// Candidates are things we know (ingredients in Settings, including what our
// receipts taught us) and things we've put on the list before. Ranked by how
// well the words match, then how often we buy it.

export interface SuggestCandidate {
  nameNorm: string;
  /** how we write it on the list ("Rotisserie chicken") */
  label: string;
  /** times it's been on our list */
  count: number;
}

export function suggestItems(query: string, candidates: SuggestCandidate[], exclude: Set<string> = new Set(), limit = 4): SuggestCandidate[] {
  const q = query.toLowerCase().trim().replace(/\s+/g, " ");
  if (q.length < 2) return [];
  const scored: { c: SuggestCandidate; rank: number }[] = [];
  for (const c of candidates) {
    if (exclude.has(c.nameNorm)) continue;
    const name = c.nameNorm.toLowerCase();
    const label = c.label.toLowerCase();
    let rank = -1;
    if (name.startsWith(q) || label.startsWith(q)) rank = 0; // "ro" → rotisserie chicken
    else if (` ${name} `.includes(` ${q}`) || ` ${label} `.includes(` ${q}`)) rank = 1; // "chick" → rotisserie chicken
    if (rank < 0) continue;
    if (name === q || label === q) continue; // already typed in full
    scored.push({ c, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || b.c.count - a.c.count || a.c.label.length - b.c.label.length);
  const seen = new Set<string>();
  const out: SuggestCandidate[] = [];
  for (const { c } of scored) {
    if (seen.has(c.nameNorm)) continue;
    seen.add(c.nameNorm);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Merge known ingredients with list history (history wins for the label).
 * Things we buy at a particular store (from receipts or a move) start with a
 * head start, so "ro" offers rotisserie chicken before rosemary.
 */
export function buildCandidates(known: (string | { name: string; bought?: boolean })[], history: { name: string; name_norm: string | null }[], receipts: Record<string, number> = {}): SuggestCandidate[] {
  const map = new Map<string, SuggestCandidate>();
  for (const k of known) {
    const n = typeof k === "string" ? k : k.name;
    const bought = typeof k === "string" ? false : !!k.bought;
    map.set(n, { nameNorm: n, label: n.charAt(0).toUpperCase() + n.slice(1), count: (bought ? 3 : 0) + (receipts[n] ?? 0) });
  }
  for (let h of history) {
    // An amount typed into the name ("2 milk") isn't part of the item.
    const name = h.name.replace(/^\s*[\d½¼¾⅓⅔/.]+\s*(x\s*)?/i, "").trim();
    if (!name) continue;
    h = { ...h, name: name.charAt(0).toUpperCase() + name.slice(1) };
    const key = (h.name_norm ?? h.name.toLowerCase()).replace(/^\s*[\d½¼¾⅓⅔/.]+\s*/, "");
    const cur = map.get(key);
    map.set(key, { nameNorm: key, label: cur && cur.label.toLowerCase() !== key ? cur.label : h.name, count: (cur?.count ?? 0) + 1 });
  }
  return [...map.values()];
}
