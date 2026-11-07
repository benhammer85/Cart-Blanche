// Recipe sources: sites that turn apps away, pages we browse, and reading a
// web-search answer into links.

/** Sites that block apps from reading recipes. */
export const BLOCKED_SITES = [
  "traderjoes.com", "seriouseats.com", "allrecipes.com", "simplyrecipes.com", "eatingwell.com", "thekitchn.com", "damndelicious.net",
  "instagram.com", "tiktok.com", "pinterest.com", "youtube.com", "facebook.com",
];

export interface DiscoverPick {
  title: string;
  url: string;
  site: string;
  why: string;
}

/** Pull the JSON array out of the model's answer (it may add prose or code fences). */
export function parseDiscoverAnswer(text: string): DiscoverPick[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1)) as Partial<DiscoverPick>[];
    return arr
      .filter((x) => typeof x?.url === "string" && /^https?:\/\//.test(x.url!))
      .map((x) => ({ title: String(x.title ?? ""), url: x.url!, site: String(x.site ?? ""), why: String(x.why ?? "") }));
  } catch {
    return [];
  }
}

export function isBlockedSite(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return BLOCKED_SITES.some((b) => h === b || h.endsWith(`.${b}`));
  } catch {
    return true;
  }
}

/** Pages that list recipes the app can read: open one and tick what you want. */
export const BROWSE_SOURCES: { label: string; site: string; url: string; store?: string }[] = [
  { label: "Trader Joe’s recipes", site: "Get On My Plate", url: "https://getonmyplate.com/category/trader-joes-recipes/", store: "traderjoes" },
  { label: "A week of Trader Joe’s dinners", site: "Gimme Some Oven", url: "https://www.gimmesomeoven.com/trader-joes-dinners/", store: "traderjoes" },
  { label: "30-minute meals", site: "Gimme Some Oven", url: "https://www.gimmesomeoven.com/popular/30-minute-meals/" },
  { label: "Instant Pot", site: "Gimme Some Oven", url: "https://www.gimmesomeoven.com/cooking-method/instant-pot-pressure-cooker/" },
  { label: "Kid favorites", site: "Smitten Kitchen", url: "https://smittenkitchen.com/recipes/kid-favorites/?format=photo" },
  { label: "Kid-friendly", site: "Gimme Some Oven", url: "https://www.gimmesomeoven.com/popular/kid-friendly/" },
  { label: "Main dishes", site: "Budget Bytes", url: "https://www.budgetbytes.com/category/recipes/main-dish/" },
  { label: "Main dishes", site: "RecipeTin Eats", url: "https://www.recipetineats.com/category/main-dishes/" },
];

/** Reddit threads to browse in Safari; send a good one with the share shortcut. */
export const REDDIT_SOURCES: { label: string; url: string; store?: string }[] = [
  { label: "r/traderjoes · dinner ideas", url: "https://www.reddit.com/r/traderjoes/search/?q=dinner&restrict_sr=1&sort=top&t=year", store: "traderjoes" },
  { label: "r/Costco · meals", url: "https://www.reddit.com/r/Costco/search/?q=dinner%20recipe&restrict_sr=1&sort=top&t=year", store: "costco" },
  { label: "r/EatCheapAndHealthy", url: "https://www.reddit.com/r/EatCheapAndHealthy/top/?t=month" },
  { label: "r/instantpot", url: "https://www.reddit.com/r/instantpot/top/?t=month" },
  { label: "r/MealPrepSunday", url: "https://www.reddit.com/r/MealPrepSunday/top/?t=month" },
  { label: "r/Cooking · weeknight", url: "https://www.reddit.com/r/Cooking/search/?q=weeknight%20dinner&restrict_sr=1&sort=top&t=year" },
];
