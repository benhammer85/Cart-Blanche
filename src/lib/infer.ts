// Keyword guesses used at import time. Always shown in the preview and editable.
import type { MealType } from "./types";

const PROTEINS: [string, RegExp][] = [
  ["chicken", /\bchicken\b/],
  ["turkey", /\bturkey\b/],
  ["beef", /\b(beef|steak|sirloin|brisket|chuck|ground beef|short rib)\b/],
  ["pork", /\b(pork|bacon|ham|prosciutto|pancetta|sausage|chorizo|hot dog)\b/],
  ["lamb", /\blamb\b/],
  ["seafood", /\b(salmon|cod|tuna|shrimp|fish|halibut|tilapia|scallop|mussel|clam|haddock|crab|lobster)\b/],
  ["tofu", /\b(tofu|tempeh|seitan)\b/],
  ["eggs", /\b(frittata|omelet|omelette|quiche|shakshuka)\b/],
  ["beans", /\b(lentil|chickpea|black bean|kidney bean|cannellini|white bean|pinto)\b/],
];

/** Main protein: the title wins, then the first ingredients (where proteins usually are). */
export function inferMainProtein(title: string, ingredientNames: string[]): string | null {
  const t = title.toLowerCase();
  for (const [p, re] of PROTEINS) if (re.test(t)) return p;
  for (const name of ingredientNames.slice(0, 6)) {
    for (const [p, re] of PROTEINS) if (p !== "eggs" && re.test(name.toLowerCase())) return p;
  }
  return null;
}

export function inferMealTypes(title: string, tags: string[]): MealType[] {
  const text = `${title} ${tags.join(" ")}`.toLowerCase();
  if (/\b(oats|oatmeal|pancake|waffle|granola|smoothie|muffin|french toast|breakfast|scone|porridge)\b/.test(text)) {
    return ["breakfast"];
  }
  if (/\b(lunch|sandwich|wrap)\b/.test(text)) return ["lunch", "dinner"];
  return ["dinner"];
}

export function isSoup(title: string, tags: string[]): boolean {
  return /\b(soup|stew|chowder|bisque|chili|ramen|pho|gumbo)\b/i.test(`${title} ${tags.join(" ")}`);
}
