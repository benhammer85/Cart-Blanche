import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { CookMode } from "./CookMode";
import type { Recipe } from "@/lib/types";

export const metadata = { title: "Cook · Cart Blanche" };

export default async function CookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseServer();
  const { data } = await db.from("recipes").select("*, recipe_ingredients(*)").eq("id", id).maybeSingle();
  if (!data) notFound();
  return <CookMode recipe={data as Recipe} />;
}
