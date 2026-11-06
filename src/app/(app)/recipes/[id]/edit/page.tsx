import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { EditRecipe } from "./EditRecipe";
import type { Recipe } from "@/lib/types";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseServer();
  const { data } = await db.from("recipes").select("*, recipe_ingredients(*)").eq("id", id).maybeSingle();
  if (!data) notFound();
  return <EditRecipe recipe={data as Recipe} />;
}
