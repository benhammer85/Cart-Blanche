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
  // Not a meal at all: drinks, sauces, dressings, doughs, pickles, how-to guides.
  if (/\b(latte|espresso|coffee|smoothie|punch|lemonade|cocktail|sikhye|horchata|iced tea|hot chocolate|drink)\b/.test(t)) return ["basic"];
  if (/^how to\b/.test(t)) return ["basic"];
  if (/\b(pizza dough|pie crust|bread dough)\b/.test(t)) return ["basic"];
  const dish0 = t.split(/\s+with\s+/)[0];
  const isMealWord = /\b(pasta|noodles?|soup|stew|bowls?|rice and|tacos?|pizza|sandwich|salad|curry|chicken|beef|pork|shrimp|salmon|tofu)\b/;
  if (/\b(dressing|vinaigrette|marinade|dough|pickled|pickles?|seasoning|spice (blend|mix|rub)|stock|broth|syrup|aioli|pesto|salsa|dip|hummus|chutney|jam|pie crust|sauce)\b/.test(dish0) && !isMealWord.test(dish0)) return ["basic"];
  if (/\b(stock|broth|bone broth)$/.test(dish0.replace(/\s*\(.*\)$/, ""))) return ["basic"];
  if (/^(the best |easy |perfect |simple )?(instant pot |pressure[- ]cooker |stovetop |oven )?(garlic |coconut |jasmine |basmati |brown |white |sushi |cilantro[- ]lime |lemon )?(rice|quinoa|farro|polenta|grits)\b/.test(t) && !/\b(bowls?|and|chicken|beef|pork|shrimp|tofu|beans?)\b/.test(t)) return ["side"];
  if (/\b(oats|oatmeal|pancakes?|waffles?|granola|smoothie|muffins?|french toast|breakfast|scones?|porridge|banana bread|zucchini bread)\b/.test(text)) {
    return hasProtein ? ["breakfast", "dinner"] : ["breakfast"]; // e.g. chicken rice porridge
  }
  if (!hasProtein && !savoryPie && (/\b(cakes?|cookies?|brownies?|pie|tart|cobbler|crumble|pudding|tapioca|ice cream|sorbet|gelato|creamie|fudge|cupcakes?|blondies?|dessert|frosting|cheesecake|crisp)\b/.test(dish0) || /\b(dessert)\b/.test(tags.join(" ").toLowerCase()))) {
    return ["dessert"];
  }
  if (/\b(lunch|sandwich|wrap)\b/.test(text)) return ["lunch", "dinner"];
  // Breads and single-vegetable dishes are sides, never planned as a dinner.
  if (/\b(rolls?|bread|biscuits?|focaccia|cornbread)\b/.test(dish0) && !/\b(pudding|bowls?|soup)\b/.test(dish0)) return ["side"];
  if (!hasProtein && /\b(fries|slaw|coleslaw|vegetables|veggies|banchan|jangjorim)\b/.test(dish0) && !/\b(soup|stew|curry|pasta|noodles|rice|bowls?|tacos?|pot pie)\b/.test(dish0)) return ["side"];
  if (!hasProtein && /\bsalad\b/.test(dish0) && !/\b(pasta|noodle|grain|farro|quinoa|lentil|bean|chickpea|egg|tuna|chicken|salmon|steak)\b/.test(t)) return ["side"];
  if (!hasProtein && /\b(chinese broccoli|gai lan|bok choy|sugar snaps?|snap peas|stuffed tomatoes)\b/.test(dish0)) return ["side"];
  // Vegetable dishes without a protein: "Air-Fryer Brussels Sprouts", "Broccoli Gratin", "Korean Spinach Side Dish"
  if (/\bside dish\b/.test(text)) return ["side"];
  // Only the dish itself counts, not "…with garlic, lemon and parmesan".
  const dish = t.split(/\s+with\s+/)[0];
  if (!hasProtein && /^((air[- ]fry(er|ed)|roasted|steamed|sauteed|sautéed|grilled|charred|glazed|crispy|smashed|garlicky|honey[- ]glazed)\s+)?(broccoli|broccolini|carrots?|green beans|asparagus|brussels sprouts|cauliflower|potatoes|sweet potatoes|zucchini|squash|beets|corn|spinach|kale|cabbage)\b/.test(dish) && !/\b(and|soup|pasta|pastina|orzo|couscous|rice|farro|quinoa|grains?|noodles|risotto|bowls?|salad|tacos?|curry)\b/.test(dish)) return ["side"];
  if (!hasProtein && /\bgratin\b/.test(t)) return ["side"];
  return ["dinner"];
}

export function isSoup(title: string, tags: string[]): boolean {
  return /\b(soup|stew|chowder|bisque|chili|ramen|pho|gumbo)\b/i.test(`${title} ${tags.join(" ")}`);
}

// No slow cooker in our kitchen: the Instant Pot slow-cooks, so those recipes count as Instant Pot.
export const COOKING_STYLES = ["Instant Pot", "One pot", "Sheet pan", "Grill"] as const;
export type CookingStyle = (typeof COOKING_STYLES)[number];

const STYLE_PATTERNS: Record<CookingStyle, RegExp> = {
  "Instant Pot": /\b(instant pot|pressure[- ]cook(er|ed|ing)?|multicooker|slow[- ]cook(er)?|crock[- ]?pot)\b/i,
  "One pot": /\b(one[- ](pot|pan|skillet)|skillet|dutch oven)\b/i,
  "Sheet pan": /\b(sheet[- ]pan|traybake|tray bake)\b/i,
  Grill: /\b(grill(ed|ing)?|barbecue|bbq)\b/i,
};

/** Cooking styles from the title and tags first, then the steps. */
export function cookingStyles(title: string, tags: string[], steps: { text: string }[] = []): CookingStyle[] {
  const head = `${title} ${tags.join(" ")}`;
  const body = steps.map((s) => s.text).join(" ");
  return COOKING_STYLES.filter((s) => {
    if (STYLE_PATTERNS[s].test(head)) return true;
    // From steps only for clear-cut equipment (skillet/grill words in steps are too common)
    return (s === "Instant Pot" || s === "Sheet pan") && STYLE_PATTERNS[s].test(body);
  });
}

const FAMILY_YES = /\b(pasta|spaghetti|mac(aroni)?( and| &| \+)? cheese|meatballs?|tacos?|quesadillas?|burritos?|pizza|nuggets|tenders|fried rice|teriyaki|orange chicken|lo mein|noodles|chicken and rice|roast(ed)? chicken|rotisserie|chicken (breasts?|thighs?|cutlets?)|meatloaf|sloppy|burgers?|sliders|pierogi|gnocchi|ravioli|tortellini|lasagna|chowder|pot pie|enchiladas?|shepherd'?s pie|salmon|risotto|grilled cheese|sandwich(es)?|pastina|orzo|chicken soup|noodle soup|stir[- ]fry|fajitas?|nachos)\b/;
const FAMILY_NO = /\b(spicy|mushrooms?|kale|miso|chil[ei]|harissa|gochujang|sriracha|jalape|curry|vindaloo|szechuan|sichuan|buffalo|hot honey|kimchi|anchov|blue cheese|olives?|capers|eggplant|beets?|liver|chili crisp|chile crisp|habanero|chipotle)\b/;

/**
 * A dinner the kids will likely eat with us: familiar (pasta, meatballs, tacos,
 * plain chicken) and not spicy. A guess; recipes marked kid-friendly always count.
 */
export function familyFriendly(title: string, ingredientNames: string[] = []): boolean {
  const t = title.toLowerCase();
  if (FAMILY_NO.test(t)) return false;
  if (ingredientNames.some((n) => /\b(gochujang|sriracha|harissa|jalape|chili crisp|chile crisp|habanero|cayenne|red pepper flake)\b/.test(n))) return false;
  return FAMILY_YES.test(t);
}
