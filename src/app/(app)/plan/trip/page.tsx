import { supabaseServer } from "@/lib/supabase/server";
import { loadHouseholdData } from "@/lib/data/household";
import { TripClient } from "./TripClient";
import type { PlanRecipe } from "../PlanClient";

export const metadata = { title: "Quick trip · Cart Blanche" };

export default async function TripPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const { store } = await searchParams;
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  const { data: member } = await db.from("household_members").select("household_id").eq("user_id", user!.id).single();
  const [household, recipes] = await Promise.all([
    loadHouseholdData(db, member!.household_id),
    db
      .from("recipes")
      .select("id, title, servings, prep_min, cook_min, steps, image_path, tags, meal_types, main_protein, kid_friendly, is_kid_meal, times_made, last_made_at, recipe_ingredients(qty, qty_max, unit, name, name_norm, raw_text, parsed_ok)")
      .eq("archived", false)
      .eq("is_kid_meal", false),
  ]);
  return <TripClient household={household} recipes={(recipes.data ?? []) as PlanRecipe[]} initialStore={store ?? null} />;
}
