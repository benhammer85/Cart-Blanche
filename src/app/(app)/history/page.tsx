import { supabaseServer } from "@/lib/supabase/server";
import { HistoryClient, type HistoryPlan } from "./HistoryClient";

export const metadata = { title: "History · Cart Blanche" };

export default async function HistoryPage() {
  const db = await supabaseServer();
  const [{ data: plans }, { data: stores }] = await Promise.all([
    db
      .from("meal_plans")
      .select("id, created_at, store_ids, meal_plan_items(id, title, recipe_id, for_kids, made_at, position)")
      .order("created_at", { ascending: false })
      .limit(30),
    db.from("stores").select("id, name"),
  ]);
  return <HistoryClient plans={(plans ?? []) as HistoryPlan[]} stores={stores ?? []} />;
}
