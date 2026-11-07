import { walkOrderFor } from "../list/walkOrder";
// Default household data, applied once when the household is created.
// Everything here is editable in Settings afterwards.

export const SECTION_NAMES = [
  "Produce", "Bakery", "Deli", "Meat", "Seafood", "Dairy", "Cheese", "Pantry",
  "Condiments", "Baking & Spices", "Frozen", "Snacks", "Beverages", "Household", "Other",
] as const;

export interface SeedStore {
  key: string;
  name: string;
  location: string;
  isBulk: boolean;
  /** walk order of sections in this store */
  sections: string[];
}

export const SEED_STORES: SeedStore[] = [
  {
    key: "mb", name: "Market Basket", location: "Chelsea", isBulk: false,
    sections: walkOrderFor("Market Basket").filter((x) => x !== "International"),
  },
  {
    key: "costco", name: "Costco", location: "Everett", isBulk: true,
    sections: walkOrderFor("Costco").filter((x) => x !== "International"),
  },
  {
    key: "tj", name: "Trader Joe's", location: "Assembly Square", isBulk: false,
    sections: walkOrderFor("Trader Joe's").filter((x) => x !== "International"),
  },
  {
    key: "shaws", name: "Shaw's", location: "East Boston", isBulk: false,
    sections: walkOrderFor("Shaw's").filter((x) => x !== "International"),
  },
];

/** Default planner store selection. */
export const DEFAULT_TRIP_STORES = ["costco", "tj"];

export interface SeedCategory {
  name: string;
  section: string;
  /** store keys in preference order */
  stores: string[];
  items: string[];
}

// Market Basket wherever possible (cheaper, better quality); Costco for bulk
// meat, eggs, milk, frozen fruit/veg and paper goods; Trader Joe's for
// specialty sauces, cheese, snacks, bread and frozen meals; Shaw's as backup.
export const SEED_CATEGORIES: SeedCategory[] = [
  {
    name: "Produce", section: "Produce", stores: ["mb", "tj", "shaws", "costco"],
    items: ["onion", "yellow onion", "red onion", "white onion", "sweet onion", "shallot", "garlic", "scallions",
      "green onion", "leek", "carrot", "celery", "potato", "yukon gold potato", "sweet potato", "russet potato",
      "tomato", "cherry tomato", "grape tomato", "roma tomato", "cucumber", "zucchini", "yellow squash",
      "butternut squash", "bell pepper", "red bell pepper", "green bell pepper", "jalapeno", "poblano",
      "broccoli", "cauliflower", "cabbage", "red cabbage", "kale", "spinach", "baby spinach", "arugula",
      "lettuce", "romaine", "mixed greens", "brussels sprouts", "green bean", "asparagus", "corn", "mushroom",
      "white button mushroom", "cremini mushroom", "eggplant", "avocado", "lemon", "lime", "orange", "apple",
      "banana", "berry", "strawberry", "blueberry", "raspberry", "grape", "pear", "peach", "mango", "pineapple",
      "ginger", "cilantro", "parsley", "flat-leaf parsley", "basil", "mint", "dill", "thyme", "rosemary",
      "chive", "sage", "lemongrass", "radish", "beet", "fennel", "bok choy", "snap pea", "snow pea", "herb",
      "lemon zest", "lemon juice", "lime juice", "watermelon", "melon", "clementine"],
  },
  {
    name: "Meat & Poultry", section: "Meat", stores: ["costco", "mb", "shaws", "tj"],
    items: ["chicken", "chicken breast", "chicken thigh", "chicken drumstick", "chicken wing", "whole chicken",
      "ground chicken", "ground turkey", "turkey", "beef", "ground beef", "steak", "sirloin", "flank steak",
      "skirt steak", "chuck roast", "short rib", "brisket", "stew meat", "pork", "pork chop", "pork tenderloin",
      "pork shoulder", "ground pork", "bacon", "sausage", "italian sausage", "chorizo", "lamb", "ground lamb"],
  },
  {
    name: "Seafood", section: "Seafood", stores: ["mb", "costco", "shaws", "tj"],
    items: ["salmon", "cod", "haddock", "shrimp", "tilapia", "halibut", "scallop", "mussel", "clam", "tuna steak",
      "fish"],
  },
  {
    name: "Dairy & Eggs", section: "Dairy", stores: ["costco", "mb", "tj", "shaws"],
    items: ["egg", "milk", "whole milk", "butter", "unsalted butter", "salted butter", "yogurt", "plain yogurt",
      "greek yogurt", "heavy cream", "half and half", "sour cream", "cream cheese", "buttermilk", "oat milk",
      "almond milk"],
  },
  {
    name: "Cheese", section: "Cheese", stores: ["tj", "mb", "costco", "shaws"],
    items: ["cheese", "parmesan", "parmigiano-reggiano", "cheddar", "mozzarella", "fresh mozzarella", "feta",
      "goat cheese", "ricotta", "monterey jack", "pepper jack", "gruyere", "swiss cheese", "shredded cheese",
      "mexican cheese blend", "halloumi", "burrata", "pecorino"],
  },
  {
    name: "Bread & Bakery", section: "Bakery", stores: ["tj", "mb", "shaws", "costco"],
    items: ["bread", "sourdough", "baguette", "pita", "naan", "tortilla", "flour tortilla", "corn tortilla",
      "hamburger bun", "hot dog bun", "bun", "roll", "english muffin", "bagel", "ciabatta", "brioche"],
  },
  {
    name: "Pantry", section: "Pantry", stores: ["mb", "costco", "shaws", "tj"],
    items: ["pasta", "spaghetti", "penne", "orzo", "rigatoni", "linguine", "egg noodles", "noodles", "rice noodle",
      "ramen", "rice", "white rice", "brown rice", "jasmine rice", "basmati rice", "arborio rice", "quinoa",
      "couscous", "farro", "lentils", "black beans", "chickpeas", "kidney bean", "cannellini bean", "white bean",
      "pinto bean", "refried bean", "canned tomato", "diced tomato", "crushed tomato", "tomato paste",
      "tomato sauce", "coconut milk", "rolled oats", "oats", "peanut butter", "almond butter", "pb2", "honey",
      "maple syrup", "jam", "breadcrumbs", "panko", "panko breadcrumbs", "raisins", "golden raisins", "almonds",
      "walnuts", "pecans", "pine nuts", "cashews", "chia seed", "sesame seed", "olives", "castelvetrano olive",
      "kalamata olive", "capers", "chipotle in adobo", "chipotle chile", "chipotle pepper", "canned tuna",
      "spaghettios", "mac and cheese", "cereal", "granola", "dried fruit", "broth", "beef broth",
      "vegetable broth"],
  },
  {
    name: "Sauces & Condiments", section: "Condiments", stores: ["tj", "mb", "shaws", "costco"],
    items: ["soy sauce", "low-sodium soy sauce", "tamari", "fish sauce", "hoisin sauce", "sriracha", "hot sauce",
      "harissa", "harissa paste", "pesto", "salsa", "marinara sauce", "pasta sauce", "bbq sauce", "ketchup",
      "mustard", "dijon mustard", "mayonnaise", "teriyaki sauce", "curry paste", "red curry paste", "gochujang",
      "tahini", "worcestershire sauce", "rice vinegar", "red wine vinegar", "balsamic vinegar",
      "apple cider vinegar", "adobo sauce", "enchilada sauce", "chili crisp", "sesame oil", "zaatar"],
  },
  {
    name: "Spices & Baking", section: "Baking & Spices", stores: ["mb", "shaws", "tj", "costco"],
    items: ["salt", "kosher salt", "sea salt", "black pepper", "pepper", "cumin", "ground cumin", "paprika",
      "smoked paprika", "chili powder", "cayenne", "red pepper flake", "oregano", "dried oregano", "thyme dried",
      "cinnamon", "nutmeg", "turmeric", "coriander", "garam masala", "curry powder", "italian seasoning",
      "garlic powder", "onion powder", "bay leaf", "vanilla", "vanilla extract", "baking soda", "baking powder",
      "flour", "all-purpose flour", "sugar", "brown sugar", "powdered sugar", "cornstarch", "yeast",
      "chocolate chip", "cocoa powder", "za'atar", "everything bagel seasoning"],
  },
  {
    name: "Oils", section: "Pantry", stores: ["costco", "mb", "tj", "shaws"],
    items: ["olive oil", "extra-virgin olive oil", "vegetable oil", "canola oil", "avocado oil", "cooking spray",
      "neutral oil"],
  },
  {
    name: "Frozen", section: "Frozen", stores: ["costco", "tj", "mb", "shaws"],
    items: ["frozen peas", "peas", "frozen corn", "frozen broccoli", "frozen spinach", "frozen fruit",
      "frozen berry", "frozen mango", "frozen vegetable", "ice cream", "frozen pizza", "chicken nuggets",
      "frozen meatballs", "meatballs", "frozen dumpling", "potsticker", "gyoza", "frozen fries", "tater tot",
      "waffle", "puff pastry", "pie crust"],
  },
  {
    name: "Deli", section: "Deli", stores: ["mb", "tj", "shaws", "costco"],
    items: ["hot dogs", "hot dog", "deli turkey", "sliced turkey", "ham", "salami", "prosciutto", "rotisserie chicken",
      "hummus", "tofu", "tempeh"],
  },
  {
    name: "Snacks", section: "Snacks", stores: ["tj", "mb", "costco", "shaws"],
    items: ["cookie", "cracker", "chips", "tortilla chips", "pretzel", "popcorn", "granola bar", "fruit snack",
      "goldfish", "veggie straws", "chocolate"],
  },
  {
    name: "Beverages", section: "Beverages", stores: ["mb", "costco", "shaws", "tj"],
    items: ["coffee", "tea", "juice", "orange juice", "sparkling water", "seltzer", "wine", "beer", "white wine",
      "red wine"],
  },
  {
    name: "Paper & Household", section: "Household", stores: ["costco", "mb", "shaws", "tj"],
    items: ["paper towel", "toilet paper", "napkin", "trash bag", "dish soap", "dishwasher detergent",
      "laundry detergent", "aluminum foil", "plastic wrap", "parchment paper", "ziploc bag", "sponge",
      "tissue", "diaper", "wipe"],
  },
  { name: "Other", section: "Other", stores: ["mb", "shaws", "tj", "costco"], items: [] },
];

/** Pantry staples: never added to the list unless marked "we're out". */
export const SEED_STAPLES = [
  "salt", "kosher salt", "sea salt", "black pepper", "pepper", "olive oil", "extra-virgin olive oil",
  "vegetable oil", "canola oil", "neutral oil", "cooking spray", "sesame oil", "cumin", "ground cumin",
  "paprika", "smoked paprika", "chili powder", "cayenne", "red pepper flake", "oregano", "dried oregano",
  "cinnamon", "nutmeg", "turmeric", "coriander", "garam masala", "curry powder", "italian seasoning",
  "garlic powder", "onion powder", "bay leaf", "vanilla", "vanilla extract", "baking soda", "baking powder",
  "flour", "all-purpose flour", "sugar", "brown sugar", "cornstarch", "bone broth", "water", "ice",
];

/** Items always bought at a specific store when it's on the trip (learned_store). */
export const SEED_STORE_OVERRIDES: Record<string, string> = {
  rice: "costco", "white rice": "costco", "jasmine rice": "costco", "basmati rice": "costco",
  "olive oil": "costco", "extra-virgin olive oil": "costco", "maple syrup": "costco",
  "frozen meatballs": "costco", meatballs: "costco", "chicken nuggets": "costco",
};

export const SEED_PACK_SIZES: Record<string, string> = {
  egg: "5 dozen", milk: "2 × 1 gal", butter: "4 lb", "chicken thigh": "~6 lb", "chicken breast": "~6 lb",
  "ground beef": "~5 lb", "olive oil": "2 L", rice: "25 lb", "frozen berry": "4 lb", "paper towel": "12 rolls",
  "toilet paper": "30 rolls", "chicken nuggets": "5 lb", "frozen meatballs": "6 lb", "maple syrup": "1 L",
};

export const SEED_SYNONYMS: Record<string, string> = {
  "garlic clove": "garlic",
  "clove garlic": "garlic",
  "green onion": "scallions",
  "spring onion": "scallions",
  "chicken stock": "bone broth",
  "chicken broth": "bone broth",
  "low-sodium chicken broth": "bone broth",
  "extra virgin olive oil": "olive oil",
  "extra-virgin olive oil": "olive oil",
  "ground black pepper": "black pepper",
  "black peppercorn": "black pepper",
  "fine sea salt": "salt",
  "sea salt": "salt",
  "kosher salt": "salt",
  "table salt": "salt",
  "egg yolk": "egg",
  "large egg": "egg",
  "cilantro leaf": "cilantro",
  "parsley leaf": "parsley",
  "flat-leaf parsley": "parsley",
  "italian parsley": "parsley",
  "unsalted butter": "butter",
  "salted butter": "butter",
  "scallion": "scallions",
  "chickpea": "chickpeas",
  "garbanzo bean": "chickpeas",
  "pb2": "pb2",
  "za'atar": "zaatar",
  "parmigiano-reggiano": "parmesan",
  "parmesan cheese": "parmesan",
  "grated parmesan": "parmesan",
  "lemon juice": "lemon",
  "lime juice": "lime",
  "lemon zest": "lemon",
  "lemon wedge": "lemon",
  "corn starch": "cornstarch",
  "crimini mushroom": "cremini mushroom",
  "red-wine vinegar": "red wine vinegar",
  "parmigiano-reggiano cheese": "parmesan",
  "spagetti": "spaghetti",
  "spaghetti noodles": "spaghetti",
  "shitake mushroom": "shiitake mushroom",
  "all purpose flour": "all-purpose flour",
  "feta cheese": "feta",
  "crumbled feta": "feta",
  "mozzarella cheese": "mozzarella",
  "red-pepper flake": "red pepper flake",
  "ground chicken or turkey": "ground chicken",
  "broccoli crown": "broccoli",
  "corn kernel": "corn",
  "cilantro leaf and stem": "cilantro",
  "dill leaves and fine stem": "dill",
  "lime wedge": "lime",
  "orange juice": "orange juice",
  "hot dog": "hot dogs",
};

export interface SeedKidMeal {
  title: string;
  ingredients: string[]; // free-text lines; parsed at seed time
}

/** Kids' favorites, sized for both kids together (1 adult-equivalent). */
export const SEED_KID_MEALS: SeedKidMeal[] = [
  { title: "Hot dogs", ingredients: ["1 package hot dogs", "1 package hot dog buns", "ketchup"] },
  { title: "Spaghetti", ingredients: ["8 oz spaghetti", "1 cup marinara sauce", "parmesan"] },
  { title: "SpaghettiOs", ingredients: ["2 cans SpaghettiOs"] },
  { title: "Chicken nuggets", ingredients: ["12 chicken nuggets", "ketchup"] },
  { title: "Meatballs & pasta", ingredients: ["10 frozen meatballs", "8 oz spaghetti", "1 cup marinara sauce"] },
];

export const SEED_PEOPLE = [
  { name: "Ben", kind: "adult" as const, birthdate: null },
  { name: "Molly", kind: "adult" as const, birthdate: null },
  { name: "Asa", kind: "kid" as const, birthdate: "2020-07-30" },
  { name: "Saul", kind: "kid" as const, birthdate: "2022-03-22" },
];

export const SEED_BONUS_TAGS = ["Loved", "Molly Favorites", "Asa and Saul Favorites"];
