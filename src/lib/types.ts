import type { ParsedIngredient } from "./ingredientParser";

export type MealType = "dinner" | "lunch" | "breakfast";
export type RecipeOrigin = "crouton" | "url" | "manual" | "paste" | "claude" | "ai" | "seed";

export interface Step {
  text: string;
  isSection?: boolean;
}

/** A recipe before it is saved (from any importer). */
export interface RecipeDraft {
  title: string;
  servings: number;
  prepMin: number | null;
  cookMin: number | null;
  steps: Step[];
  notes: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  tags: string[];
  mealTypes: MealType[];
  mainProtein: string | null;
  kidFriendly: boolean;
  isKidMeal: boolean;
  origin: RecipeOrigin;
  externalId: string | null;
  ingredients: ParsedIngredient[];
  imageUrl?: string | null;
}

export interface RecipeIngredient {
  id?: string;
  position: number;
  raw_text: string;
  qty: number | null;
  qty_max: number | null;
  unit: string | null;
  name: string;
  name_norm: string;
  note: string | null;
  parsed_ok: boolean;
}

/** Recipe row as stored (snake_case matches the DB). */
export interface Recipe {
  id: string;
  household_id: string;
  title: string;
  title_norm: string;
  servings: number;
  prep_min: number | null;
  cook_min: number | null;
  steps: Step[];
  notes: string | null;
  source_url: string | null;
  source_name: string | null;
  image_path: string | null;
  tags: string[];
  meal_types: MealType[];
  main_protein: string | null;
  kid_friendly: boolean;
  is_kid_meal: boolean;
  origin: RecipeOrigin;
  external_id: string | null;
  times_made: number;
  last_made_at: string | null;
  archived: boolean;
  created_at: string;
  recipe_ingredients?: RecipeIngredient[];
}

export interface Store {
  id: string;
  name: string;
  location: string | null;
  sort_order: number;
  is_bulk: boolean;
  archived: boolean;
}

export interface StoreSection {
  id: string;
  store_id: string;
  name: string;
  sort_order: number;
}

export interface Category {
  id: string;
  name: string;
  default_section: string;
  sort_order: number;
}

export interface CategoryStoreRule {
  category_id: string;
  store_id: string;
  priority: number;
}

export interface IngredientInfo {
  id?: string;
  name_norm: string;
  category_id: string | null;
  is_staple: boolean;
  is_out: boolean;
  pack_size: string | null;
  learned_store_id: string | null;
  learned_section_id: string | null;
}

export interface Person {
  id: string;
  name: string;
  kind: "adult" | "kid";
  birthdate: string | null;
  portion_override: number | null;
  sort_order: number;
}

export interface PlannerDefaults {
  storeIds: string[];
  mealCount: number;
  mealTypes: MealType[];
  maxPrep: number | null; // null = 60+
  includeTags: string[];
  excludeTags: string[];
  excludeIngredients: string[];
  variety: boolean;
  makeExtra: boolean;
  kidMeals: boolean;
  aiFavoritesPct: number;
}

export const DEFAULT_PLANNER: PlannerDefaults = {
  storeIds: [],
  mealCount: 6,
  mealTypes: ["dinner"],
  maxPrep: 30,
  includeTags: [],
  excludeTags: [],
  excludeIngredients: [],
  variety: true,
  makeExtra: false,
  kidMeals: true,
  aiFavoritesPct: 70,
};

export interface ListItem {
  id: string;
  household_id: string;
  list_id: string;
  name: string;
  name_norm: string | null;
  qty: number | null;
  unit: string | null;
  display_qty: string | null;
  store_id: string | null;
  section_id: string | null;
  checked: boolean;
  checked_by: string | null;
  added_by: string | null;
  is_manual: boolean;
  note: string | null;
  source_meals: { title: string; recipeId: string | null }[];
  deleted_at: string | null;
  client_updated_at: string;
  created_at?: string;
}
