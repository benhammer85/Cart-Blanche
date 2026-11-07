import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { getMembershipFor } from "@/lib/household/ensure";
import { loadHouseholdData } from "@/lib/data/household";
import { RECIPE_LIST_COLUMNS_SERVER } from "@/lib/data/columns";
import { RecipesClient, type RecipeCard } from "./RecipesClient";

export const metadata = { title: "Recipes · Cart Blanche" };

export default async function RecipesPage() {
  const db = await supabaseServer();
  const user = await getAuthUser(db);
  const member = await getMembershipFor(user!);
  const [{ data }, household] = await Promise.all([
    db.from("recipes").select(`${RECIPE_LIST_COLUMNS_SERVER}, recipe_ingredients(name_norm)`).eq("archived", false).order("title"),
    loadHouseholdData(db, member!.householdId),
  ]);
  return <RecipesClient recipes={(data ?? []) as RecipeCard[]} household={household} />;
}
