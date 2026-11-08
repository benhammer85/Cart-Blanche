// Photos of a comparable dish from recipe sites that let us search them,
// picked by how much of the dish's name the recipe's address shares.

/** Recipe sites whose own search works for an app that says who it is. */
export const PHOTO_SITES = ["https://www.gimmesomeoven.com", "https://www.budgetbytes.com", "https://cookieandkate.com", "https://www.recipetineats.com"];

// Words that say how it's cooked or sell it, not what it is.
const FILLER = new Set([
  "recipe", "recipes", "the", "a", "an", "with", "and", "or", "of", "in", "on", "for", "easy", "best", "ever", "simple", "quick",
  "homemade", "instant", "pot", "pressure", "cooker", "air", "fryer", "sheet", "pan", "one", "slow", "crock", "minute", "minutes",
  "my", "our", "favorite", "style", "healthy", "weeknight",
]);

const stem = (w: string) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "");

/** The words that name the dish: "Chicken Chile Verde Pressure Cooker" → chicken, chile, verde. */
export function dishWords(title: string): string[] {
  const words = title
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && !FILLER.has(w));
  return [...new Set(words.length ? words : title.toLowerCase().split(/\s+/).filter((w) => w.length > 2))].map(stem);
}

/** Search words: the dish words, at most four. */
export const searchTerms = (title: string) => dishWords(title).slice(0, 4).join(" ");

/** How well a recipe's address matches the dish (share of dish words it contains). */
export function matchScore(url: string, words: string[]): number {
  if (!words.length) return 0;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return 0;
  }
  if (/\/(videos?|life|join|category|tag|about)\//.test(path)) return 0;
  const slug = new Set(path.toLowerCase().split(/[^a-z]+/).filter(Boolean).map(stem));
  return words.filter((w) => slug.has(w)).length / words.length;
}
