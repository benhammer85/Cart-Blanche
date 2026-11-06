import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { RecipeDetail } from "./RecipeDetail";
import type { Recipe } from "@/lib/types";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseServer();
  const { data } = await db.from("recipes").select("*, recipe_ingredients(*)").eq("id", id).maybeSingle();
  if (!data) notFound();
  return <RecipeDetail recipe={data as Recipe} />;
}
