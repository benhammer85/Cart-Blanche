"use client";
import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Saves this week's planned recipes (page, cook mode and photo) on the phone,
 * so they open in the kitchen even with no signal. Runs quietly once a day,
 * and again whenever a new plan is sent to the list.
 */
export function OfflineRecipes() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    const KEY = "cb:offline-saved";
    const run = async () => {
      if (!navigator.onLine) return;
      const reg = await navigator.serviceWorker.ready;
      const db = supabaseBrowser();
      const { data: plan } = await db
        .from("meal_plans")
        .select("id, meal_plan_items(recipe_id, recipes(image_path))")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const items = ((plan?.meal_plan_items ?? []) as unknown as { recipe_id: string | null; recipes: { image_path: string | null } | null }[]).filter((i) => i.recipe_id);
      const stamp = `${plan?.id ?? ""}:${new Date().toISOString().slice(0, 10)}`;
      if (!items.length || localStorage.getItem(KEY) === stamp) return;
      reg.active?.postMessage({
        type: "save-offline",
        pages: items.flatMap((i) => [`/recipes/${i.recipe_id}`, `/recipes/${i.recipe_id}/cook`]),
        photos: items.map((i) => i.recipes?.image_path).filter(Boolean),
      });
      try {
        localStorage.setItem(KEY, stamp);
      } catch {
        /* private mode */
      }
    };
    const t = setTimeout(() => run().catch(() => {}), 4000); // after the page has settled
    // A new plan was just sent to the list: save its recipes now.
    const onPlan = () => setTimeout(() => run().catch(() => {}), 2000);
    window.addEventListener("cb:plan-sent", onPlan);
    return () => {
      clearTimeout(t);
      window.removeEventListener("cb:plan-sent", onPlan);
    };
  }, []);
  return null;
}
