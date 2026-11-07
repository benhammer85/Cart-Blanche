// What to use when the store doesn't have it. Kept short and practical:
// the closest swap first, then the easy fallback.

const SUBS: Record<string, string[]> = {
  // Chiles
  ancho: ["pasilla or guajillo chiles", "1 tbsp chili powder per chile"],
  guajillo: ["New Mexico or ancho chiles", "1 tsp paprika + pinch of cayenne per chile"],
  pasilla: ["ancho chiles", "1 tbsp chili powder per chile"],
  "new mexico chile": ["guajillo or ancho chiles", "1 tbsp chili powder per chile"],
  "chile de arbol": ["dried red pepper flakes, ½ tsp per chile", "cayenne, a pinch per chile"],
  "arbol chile": ["dried red pepper flakes, ½ tsp per chile", "cayenne, a pinch per chile"],
  chipotle: ["1 tsp smoked paprika + pinch of cayenne per chile", "chipotle chili powder, ½ tsp per chile"],
  "chipotle in adobo": ["smoked paprika + a little tomato paste and vinegar", "chipotle hot sauce"],
  poblano: ["Anaheim peppers", "green bell pepper + a jalapeño"],
  anaheim: ["poblano peppers", "green bell pepper"],
  serrano: ["jalapeño (use 1½ for each serrano)"],
  "thai chile": ["serrano", "red pepper flakes"],
  habanero: ["scotch bonnet", "2 jalapeños + pinch of cayenne"],
  gochugaru: ["red pepper flakes + a pinch of paprika", "mild chili powder"],
  gochujang: ["sriracha + a little miso and honey", "red pepper flakes in miso"],
  "aleppo pepper": ["sweet paprika + a pinch of red pepper flakes"],

  // Herbs and spices
  epazote: ["leave it out", "a little oregano + cilantro"],
  "mexican oregano": ["regular oregano + a pinch of cumin"],
  "fresh cilantro": ["flat-leaf parsley + lime zest"],
  cilantro: ["flat-leaf parsley + lime zest"],
  "fresh basil": ["fresh spinach + a little dried basil", "pesto, 1 tsp per ¼ cup basil"],
  "thai basil": ["regular basil + a few mint leaves"],
  "fresh dill": ["dried dill, 1 tsp per tbsp fresh"],
  tarragon: ["fennel seed, a pinch", "basil"],
  chervil: ["parsley + a little tarragon"],
  lemongrass: ["lemon zest + a little ginger"],
  "kaffir lime": ["lime zest"],
  "makrut lime": ["lime zest"],
  galangal: ["fresh ginger + lime juice"],
  "garam masala": ["curry powder + a pinch of cinnamon"],
  "five spice": ["cinnamon + a pinch each of cloves, fennel, black pepper"],
  "za'atar": ["dried thyme + sesame seeds + a little lemon zest"],
  sumac: ["lemon zest + a pinch of salt"],
  "smoked paprika": ["sweet paprika + a drop of liquid smoke", "chipotle powder (hotter)"],
  saffron: ["a pinch of turmeric for color"],
  allspice: ["cinnamon + a pinch of cloves and nutmeg"],
  cardamom: ["cinnamon + a pinch of nutmeg"],
  "star anise": ["fennel seed or Chinese five spice"],
  juniper: ["a splash of gin", "rosemary + bay leaf"],

  // Asian pantry
  "fish sauce": ["soy sauce + a squeeze of lime", "anchovy paste, a little"],
  mirin: ["rice vinegar + sugar (1 tsp per tbsp)", "dry white wine + sugar"],
  "shaoxing": ["dry sherry", "dry white wine"],
  sake: ["dry sherry", "dry white wine"],
  "oyster sauce": ["hoisin + a little soy sauce"],
  hoisin: ["BBQ sauce + a little soy sauce"],
  "rice vinegar": ["apple cider vinegar + a pinch of sugar"],
  "black vinegar": ["balsamic + a little rice vinegar"],
  "toasted sesame oil": ["a little peanut oil + toasted sesame seeds"],
  miso: ["soy sauce (less of it)", "tahini + soy sauce"],
  "doubanjiang": ["miso + chili garlic sauce"],
  "chili crisp": ["chili garlic sauce + fried shallots"],
  "sambal oelek": ["chili garlic sauce", "sriracha"],
  "panko": ["regular breadcrumbs", "crushed crackers"],
  "coconut aminos": ["soy sauce + a pinch of sugar"],
  "dashi": ["chicken broth + a splash of soy sauce"],
  "nori": ["leave it out"],
  "kimchi": ["sauerkraut + red pepper flakes"],

  // Dairy and cheese
  "creme fraiche": ["sour cream", "Greek yogurt + a little cream"],
  "crème fraîche": ["sour cream", "Greek yogurt + a little cream"],
  "mexican crema": ["sour cream thinned with a little milk + lime"],
  buttermilk: ["1 cup milk + 1 tbsp lemon juice or vinegar, wait 5 min"],
  mascarpone: ["cream cheese + a little heavy cream"],
  ricotta: ["cottage cheese, blended", "cream cheese thinned with milk"],
  "cotija": ["feta", "parmesan"],
  "queso fresco": ["feta", "mild ricotta salata"],
  "oaxaca": ["mozzarella", "Monterey Jack"],
  "queso blanco": ["Monterey Jack", "mozzarella"],
  "gruyere": ["Swiss or Jarlsberg"],
  "gruyère": ["Swiss or Jarlsberg"],
  fontina: ["provolone", "mozzarella"],
  "pecorino": ["parmesan"],
  "manchego": ["aged white cheddar", "parmesan"],
  "goat cheese": ["feta", "cream cheese + a little lemon"],
  halloumi: ["paneer", "thick-sliced feta, seared carefully"],
  paneer: ["firm tofu", "halloumi"],
  "heavy cream": ["¾ cup milk + ¼ cup melted butter", "half and half (won't whip)"],
  "evaporated milk": ["whole milk simmered to reduce by half"],

  // Baking and pantry
  "cake flour": ["1 cup flour minus 2 tbsp, plus 2 tbsp cornstarch"],
  "self-rising flour": ["1 cup flour + 1½ tsp baking powder + ¼ tsp salt"],
  "powdered sugar": ["white sugar blended fine + 1 tsp cornstarch per cup"],
  "corn syrup": ["honey", "maple syrup"],
  molasses: ["dark brown sugar", "maple syrup"],
  "baking powder": ["¼ tsp baking soda + ½ tsp cream of tartar per tsp"],
  "arrowroot": ["cornstarch"],
  "fire-roasted tomato": ["regular canned tomatoes + a pinch of smoked paprika"],
  "san marzano": ["any good canned whole tomatoes"],
  "tomatillo": ["green tomatoes + lime", "jarred salsa verde"],
  "white wine": ["chicken broth + a splash of white wine vinegar"],
  "red wine": ["beef broth + a splash of red wine vinegar"],
  "sherry vinegar": ["red wine vinegar"],
  "champagne vinegar": ["white wine vinegar"],
  "white wine vinegar": ["rice vinegar", "apple cider vinegar"],
  "balsamic": ["red wine vinegar + a little honey"],
  "worcestershire": ["soy sauce + a splash of vinegar"],
  "anchovy": ["a little fish sauce", "capers, chopped"],
  capers: ["chopped green olives"],
  "pine nut": ["walnuts or almonds, toasted"],
  tahini: ["peanut butter + sesame oil", "sunflower seed butter"],
  shallot: ["½ small onion + a little garlic"],
  leek: ["sweet onion + a few scallions"],
  fennel: ["celery + a pinch of fennel seed"],
  "bok choy": ["napa cabbage", "spinach"],
  "napa cabbage": ["green cabbage, sliced thin"],
  "swiss chard": ["spinach", "kale"],
  arugula: ["baby spinach + black pepper", "watercress"],
  "lacinato kale": ["curly kale"],
  "masa harina": ["corn tortillas, blended", "fine cornmeal (gritty)"],
  "pancetta": ["bacon", "salami, diced"],
  "guanciale": ["pancetta", "thick-cut bacon"],
  "prosciutto": ["thin ham", "bacon, cooked"],
  "chorizo": ["Italian sausage + smoked paprika and cumin"],
  "andouille": ["kielbasa + cayenne"],
  "arborio": ["any short-grain rice"],
  "pearl couscous": ["orzo"],
};

const KEYS = Object.keys(SUBS).sort((a, b) => b.length - a.length);
const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Swaps for an ingredient, or null when we don't have any built in. */
export function substitutesFor(name: string): { for: string; options: string[] } | null {
  const n = strip(name);
  for (const k of KEYS) {
    const key = strip(k);
    // Whole words; a trailing "s" or "es" is fine ("ancho chiles", "shallots").
    const re = new RegExp(`(^|[^a-z])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(e?s)?([^a-z]|$)`);
    if (re.test(n)) return { for: k, options: SUBS[k] };
  }
  return null;
}
