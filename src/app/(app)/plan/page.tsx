import { supabaseServer } from "@/lib/supabase/server";
import { loadHouseholdData } from "@/lib/data/household";
import { PlanClient, type PlanRecipe, type RepeatPlan } from "./PlanClient";

export const metadata = { title: "Plan · Cart Blanche" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  const { data: member } = await db.from("household_members").select("household_id").eq("user_id", user!.id).single();
  const [household, recipes, repeat] = await Promise.all([
    loadHouseholdData(db, member!.household_id),
    db
      .from("recipes")
      .select("id, title, servings, prep_min, image_path, tags, meal_types, main_protein, kid_friendly, is_kid_meal, times_made, last_made_at, recipe_ingredients(qty, qty_max, unit, name, name_norm, raw_text, parsed_ok)")
      .eq("archived", false),
    from
      ? db.from("meal_plans").select("params, store_ids, meal_plan_items(recipe_id, ai_recipe, title, for_kids, position)").eq("id", from).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return <PlanClient household={household} recipes={(recipes.data ?? []) as PlanRecipe[]} repeat={(repeat.data as RepeatPlan) ?? null} />;
}
