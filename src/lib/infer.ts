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
  const t = title.toLowerCase();
  const text = `${t} ${tags.join(" ")}`.toLowerCase();
  const hasProtein = inferMainProtein(title, []) !== null && !/\b(eggs)\b/.test(inferMainProtein(title, []) ?? "");
  const savoryPie = /\b(pot pie|shepherd'?s pie|meat pie|chicken pie|cottage pie)\b/.test(t);
  if (/\b(oats|oatmeal|pancakes?|waffles?|granola|smoothie|muffins?|french toast|breakfast|scones?|porridge|banana bread|zucchini bread)\b/.test(text)) {
    return hasProtein ? ["breakfast", "dinner"] : ["breakfast"]; // e.g. chicken rice porridge
  }
  if (!hasProtein && !savoryPie && /\b(cakes?|cookies?|brownies?|pie|tart|cobbler|crumble|pudding|ice cream|sorbet|gelato|creamie|fudge|cupcakes?|blondies?|dessert|frosting|cheesecake)\b|\bcrisp$/.test(t + " " + tags.join(" ").toLowerCase())) {
    return ["dessert"];
  }
  if (/\b(lunch|sandwich|wrap)\b/.test(text)) return ["lunch", "dinner"];
  // Breads and single-vegetable dishes are sides — never planned as a dinner.
  if (!hasProtein && /\b(rolls?|bread|biscuits?|focaccia|cornbread)\b/.test(text)) return ["side"];
  if (/^(roasted|steamed|sauteed|sautéed|grilled|charred|glazed)\s+(broccoli|broccolini|carrots?|green beans|asparagus|brussels sprouts|cauliflower|potatoes|sweet potatoes|zucchini|squash|beets)\b(?!.*\band\b)/.test(t)) return ["side"];
  return ["dinner"];
}

export function isSoup(title: string, tags: string[]): boolean {
  return /\b(soup|stew|chowder|bisque|chili|ramen|pho|gumbo)\b/i.test(`${title} ${tags.join(" ")}`);
}

export const COOKING_STYLES = ["Instant Pot", "One pot", "Sheet pan", "Slow cooker", "Grill"] as const;
export type CookingStyle = (typeof COOKING_STYLES)[number];

const STYLE_PATTERNS: Record<CookingStyle, RegExp> = {
  "Instant Pot": /\b(instant pot|pressure[- ]cook(er|ed|ing)?|multicooker)\b/i,
  "One pot": /\b(one[- ](pot|pan|skillet)|skillet|dutch oven)\b/i,
  "Sheet pan": /\b(sheet[- ]pan|traybake|tray bake)\b/i,
  "Slow cooker": /\b(slow[- ]cook(er)?|crock[- ]?pot)\b/i,
  Grill: /\b(grill(ed|ing)?|barbecue|bbq)\b/i,
};

/** Cooking styles from the title and tags first, then the steps. */
export function cookingStyles(title: string, tags: string[], steps: { text: string }[] = []): CookingStyle[] {
  const head = `${title} ${tags.join(" ")}`;
  const body = steps.map((s) => s.text).join(" ");
  return COOKING_STYLES.filter((s) => {
    if (STYLE_PATTERNS[s].test(head)) return true;
    // From steps only for clear-cut equipment (skillet/grill words in steps are too common)
    return (s === "Instant Pot" || s === "Slow cooker" || s === "Sheet pan") && STYLE_PATTERNS[s].test(body);
  });
}
