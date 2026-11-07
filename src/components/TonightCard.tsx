"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { RecipeImage } from "./RecipeImage";
import { IconCheck } from "./icons";
import { Sheet } from "./ui";

interface PlanItem {
  id: string;
  title: string;
  recipe_id: string | null;
  for_kids: boolean;
  made_at: string | null;
  position: number;
  recipes: { image_path: string | null; prep_min: number | null } | null;
}

const CACHE = "cb:tonight";

/** Next uncooked dinner from the latest plan (last two weeks), with the kids' meal. */
export function TonightCard() {
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const { data, error } = await supabaseBrowser()
      .from("meal_plans")
      .select("id, created_at, meal_plan_items(id, title, recipe_id, for_kids, made_at, position, recipes(image_path, prep_min))")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return; // offline: keep the cached card
    const list = ((data?.meal_plan_items ?? []) as unknown as PlanItem[]).sort((a, b) => a.position - b.position);
    setItems(list);
    try {
      localStorage.setItem(CACHE, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE) ?? "null");
      if (cached) setItems(cached);
    } catch {
      /* ignore */
    }
    load();
  }, [load]);

  if (!items) return null;
  const dinners = items.filter((i) => !i.for_kids && !i.made_at);
  const tonight = dinners[0];
  if (!tonight) return null;
  const kids = items.find((i) => i.for_kids && i.position === tonight.position + 1);
  const next = dinners[1];

  /** Cook another dinner from this week tonight: the two swap days (kids' items move with them). */
  async function switchTo(other: PlanItem) {
    setSwitching(false);
    setBusy(true);
    const db = supabaseBrowser();
    const kidOf = (it: PlanItem) => items!.find((x) => x.for_kids && x.position === it.position + 1);
    const a = tonight;
    const ak = kidOf(a);
    const bk = kidOf(other);
    await Promise.all([
      db.from("meal_plan_items").update({ position: other.position }).eq("id", a.id),
      db.from("meal_plan_items").update({ position: a.position }).eq("id", other.id),
      ak && db.from("meal_plan_items").update({ position: other.position + 1 }).eq("id", ak.id),
      bk && db.from("meal_plan_items").update({ position: a.position + 1 }).eq("id", bk.id),
    ]);
    await load();
    setBusy(false);
  }

  async function madeIt() {
    setBusy(true);
    await supabaseBrowser().rpc("mark_meal_made", { p_item_id: tonight.id, p_made: true });
    if (kids) await supabaseBrowser().rpc("mark_meal_made", { p_item_id: kids.id, p_made: true });
    await load();
    setBusy(false);
  }

  return (
    <section className="card mt-4 overflow-hidden">
      <div className="flex gap-3 p-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-soft">
          <RecipeImage src={tonight.recipes?.image_path} title={tonight.title} placeholderText={false} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-accent">Tonight</p>
          <p className="recipe-title text-[18px] leading-snug font-semibold">{tonight.title}</p>
          {kids && <p className="text-[13px] text-muted">Kids: {kids.title}</p>}
          {next && <p className="truncate text-[12px] text-muted">Then: {next.title}</p>}
        </div>
      </div>
      <div className="flex border-t hairline text-[15px] font-semibold">
        {tonight.recipe_id && (
          <Link href={`/recipes/${tonight.recipe_id}/cook`} className="flex h-11 flex-1 items-center justify-center text-accent">
            Start cooking
          </Link>
        )}
        {dinners.length > 1 && (
          <button onClick={() => setSwitching(true)} disabled={busy} className="flex h-11 flex-1 items-center justify-center border-l hairline text-muted disabled:opacity-40">
            Switch
          </button>
        )}
        <button onClick={madeIt} disabled={busy} className="flex h-11 flex-1 items-center justify-center gap-1.5 border-l hairline text-muted disabled:opacity-40">
          <IconCheck /> Made
        </button>
      </div>
      {switching && (
        <Sheet open onClose={() => setSwitching(false)} title="Cook something else tonight">
          <ul className="card divide-y divide-line overflow-hidden">
            {dinners.slice(1).map((d) => (
              <li key={d.id}>
                <button onClick={() => switchTo(d)} className="flex w-full items-center gap-3 p-3 text-left active:bg-soft">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-soft">
                    <RecipeImage src={d.recipes?.image_path} title={d.title} placeholderText={false} />
                  </div>
                  <span className="recipe-title flex-1 text-[16px] font-semibold">{d.title}</span>
                  {d.recipes?.prep_min != null && <span className="text-[13px] text-muted">{d.recipes.prep_min} min</span>}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 px-1 text-[13px] text-muted">The two dinners swap days.</p>
        </Sheet>
      )}
    </section>
  );
}
