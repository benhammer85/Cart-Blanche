// Loads the household's configuration in one go (works with any Supabase
// client: server or browser — RLS scopes it to the household).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, CategoryStoreRule, IngredientInfo, Person, PlannerDefaults, Store, StoreSection } from "../types";
import { DEFAULT_PLANNER } from "../types";

export interface HouseholdData {
  householdId: string;
  stores: Store[];
  sections: StoreSection[];
  categories: Category[];
  rules: CategoryStoreRule[];
  ingredients: (IngredientInfo & { id: string })[];
  synonyms: Record<string, string>;
  people: Person[];
  plannerDefaults: PlannerDefaults;
  avoidTerms: string[];
  bonusTags: string[];
  members: { user_id: string; display_name: string; initials: string }[];
}

export async function loadHouseholdData(db: SupabaseClient, householdId: string): Promise<HouseholdData> {
  const [stores, sections, categories, rules, ingredients, synonyms, people, settings, members] = await Promise.all([
    db.from("stores").select("*").eq("household_id", householdId).order("sort_order"),
    db.from("store_sections").select("*").eq("household_id", householdId).order("sort_order"),
    db.from("categories").select("*").eq("household_id", householdId).order("sort_order"),
    db.from("category_store_rules").select("category_id, store_id, priority").eq("household_id", householdId),
    db.from("ingredients").select("*").eq("household_id", householdId).order("name_norm"),
    db.from("synonyms").select("alias, canonical").eq("household_id", householdId),
    db.from("household_people").select("*").eq("household_id", householdId).order("sort_order"),
    db.from("household_settings").select("*").eq("household_id", householdId).maybeSingle(),
    db.from("household_members").select("user_id, display_name, initials").eq("household_id", householdId),
  ]);
  for (const r of [stores, sections, categories, rules, ingredients, synonyms, people, settings, members]) {
    if (r.error) throw r.error;
  }
  return {
    householdId,
    stores: stores.data ?? [],
    sections: sections.data ?? [],
    categories: categories.data ?? [],
    rules: rules.data ?? [],
    ingredients: ingredients.data ?? [],
    synonyms: Object.fromEntries((synonyms.data ?? []).map((s: { alias: string; canonical: string }) => [s.alias, s.canonical])),
    people: people.data ?? [],
    plannerDefaults: { ...DEFAULT_PLANNER, ...((settings.data?.planner_defaults as Partial<PlannerDefaults>) ?? {}) },
    avoidTerms: settings.data?.avoid_terms ?? [],
    bonusTags: settings.data?.bonus_tags ?? [],
    members: members.data ?? [],
  };
}
