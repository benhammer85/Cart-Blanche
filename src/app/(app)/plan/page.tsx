import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { getMembershipFor } from "@/lib/household/ensure";
import { loadHouseholdData } from "@/lib/data/household";
import { PlanClient, type CurrentPlan, type PlanRecipe, type RepeatPlan } from "./PlanClient";

export const metadata = { title: "Plan · Cart Blanche" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const db = await supabaseServer();
  const user = await getAuthUser(db);
  const member = await getMembershipFor(user!);
  const weekAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
  const [household, recipes, repeat, latest] = await Promise.all([
    loadHouseholdData(db, member!.householdId),
    db
      .from("recipes")
      .select("id, title, servings, prep_min, steps, image_path, tags, meal_types, main_protein, kid_friendly, is_kid_meal, times_made, last_made_at, recipe_ingredients(qty, qty_max, unit, name, name_norm, raw_text, parsed_ok)")
      .eq("archived", false),
    from
      ? db.from("meal_plans").select("params, store_ids, meal_plan_items(recipe_id, ai_recipe, title, for_kids, position)").eq("id", from).maybeSingle()
      : Promise.resolve({ data: null }),
    // The week already planned (sent in the last 8 days), shown first.
    db
      .from("meal_plans")
      .select("id, created_at, meal_plan_items(id, title, recipe_id, made_at, for_kids, position, recipes(image_path))")
      .gte("created_at", weekAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  type Row = { id: string; title: string; recipe_id: string | null; made_at: string | null; for_kids: boolean; position: number; recipes: { image_path: string | null } | null };
  const current: CurrentPlan | null = latest.data
    ? {
        id: latest.data.id,
        created_at: latest.data.created_at,
        items: ((latest.data.meal_plan_items ?? []) as unknown as Row[]).map(({ recipes: r, ...i }) => ({ ...i, image_path: r?.image_path ?? null })),
      }
    : null;
  return (
    <PlanClient
      household={household}
      recipes={(recipes.data ?? []) as PlanRecipe[]}
      repeat={(repeat.data as RepeatPlan) ?? null}
      current={from ? null : current}
    />
  );
}
