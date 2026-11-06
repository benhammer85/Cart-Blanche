import { supabaseServer } from "@/lib/supabase/server";
import { RECIPE_LIST_COLUMNS_SERVER } from "@/lib/data/columns";
import { RecipesClient, type RecipeCard } from "./RecipesClient";

export const metadata = { title: "Recipes · Cart Blanche" };

export default async function RecipesPage() {
  const db = await supabaseServer();
  const { data } = await db.from("recipes").select(RECIPE_LIST_COLUMNS_SERVER).eq("archived", false).order("title");
  return <RecipesClient recipes={(data ?? []) as RecipeCard[]} />;
}
