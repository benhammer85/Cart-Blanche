import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { getMembershipFor } from "@/lib/household/ensure";
import { loadHouseholdData } from "@/lib/data/household";
import { PlanClient, type PlanRecipe, type RepeatPlan } from "./PlanClient";

export const metadata = { title: "Plan · Cart Blanche" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ from?: string; trip?: string; recipes?: string }> }) {
  const { from, trip, recipes: tripRecipes } = await searchParams;
  const db = await supabaseServer();
  const user = await getAuthUser(db);
  const member = await getMembershipFor(user!);
  const [household, recipes, repeat] = await Promise.all([
    loadHouseholdData(db, member!.householdId),
    db
      .from("recipes")
      .select("id, title, servings, prep_min, steps, image_path, tags, meal_types, main_protein, kid_friendly, is_kid_meal, times_made, last_made_at, recipe_ingredients(qty, qty_max, unit, name, name_norm, raw_text, parsed_ok)")
      .eq("archived", false),
    from
      ? db.from("meal_plans").select("params, store_ids, meal_plan_items(recipe_id, ai_recipe, title, for_kids, position)").eq("id", from).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  // Quick trip: one store and the recipes picked on /plan/trip, loaded like a repeated week.
  const tripPlan: RepeatPlan | null =
    trip && tripRecipes
      ? {
          params: { mealCount: tripRecipes.split(",").length },
          store_ids: [trip],
          meal_plan_items: tripRecipes.split(",").filter(Boolean).map((id, position) => ({ recipe_id: id, ai_recipe: null, title: "", for_kids: false, position })),
        }
      : null;
  return (
    <PlanClient
      household={household}
      recipes={(recipes.data ?? []) as PlanRecipe[]}
      repeat={tripPlan ?? (repeat.data as RepeatPlan) ?? null}
      intro={tripPlan ? "Your selected recipes. Review, then build the shopping list." : undefined}
    />
  );
}
