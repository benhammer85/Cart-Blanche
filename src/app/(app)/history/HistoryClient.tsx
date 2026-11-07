"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Empty, PageHeader, cx } from "@/components/ui";
import { IconCheck, IconClock } from "@/components/icons";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface HistoryPlan {
  id: string;
  created_at: string;
  store_ids: string[];
  meal_plan_items: { id: string; title: string; recipe_id: string | null; for_kids: boolean; made_at: string | null; position: number }[];
}

export function HistoryClient({ plans: initial, stores }: { plans: HistoryPlan[]; stores: { id: string; name: string }[] }) {
  const router = useRouter();
  const [plans, setPlans] = useState(initial);

  async function toggleMade(planId: string, itemId: string, made: boolean) {
    setPlans((cur) =>
      cur.map((p) => (p.id !== planId ? p : { ...p, meal_plan_items: p.meal_plan_items.map((i) => (i.id === itemId ? { ...i, made_at: made ? new Date().toISOString().slice(0, 10) : null } : i)) })),
    );
    await supabaseBrowser().rpc("mark_meal_made", { p_item_id: itemId, p_made: made });
    router.refresh();
  }

  return (
    <div>
      <PageHeader title="Past weeks" back="/plan" />
      <div className="px-4">
        {!plans.length && <Empty icon={<IconClock />} title="No plans yet">Plans you send to the list show up here.</Empty>}
        {plans.map((p) => {
          const items = [...p.meal_plan_items].sort((a, b) => a.position - b.position);
          const made = items.filter((i) => i.made_at && !i.for_kids).length;
          const adults = items.filter((i) => !i.for_kids).length;
          return (
            <section key={p.id} className="card mt-4 overflow-hidden">
              <div className="flex items-start justify-between px-4 pt-4">
                <div>
                  <h2 className="text-[18px] font-bold">
                    Week of {new Date(p.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </h2>
                  <p className="text-[13px] text-muted">
                    {p.store_ids.map((id) => stores.find((s) => s.id === id)?.name).filter(Boolean).join(" + ")} · {made}/{adults} made
                  </p>
                </div>
                <Link href={`/plan?from=${p.id}`} className="rounded-full bg-accent-soft px-3 py-1.5 text-[13px] font-semibold text-accent">
                  Repeat this week
                </Link>
              </div>
              <ul className="mt-2">
                {items.map((i) => (
                  <li key={i.id} className="flex min-h-[52px] items-center gap-3 border-t hairline px-4">
                    <button
                      onClick={() => toggleMade(p.id, i.id, !i.made_at)}
                      className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition", i.made_at ? "border-ok bg-ok text-white" : "border-line")}
                      aria-label={i.made_at ? `Unmark ${i.title}` : `Mark ${i.title} made`}
                    >
                      {i.made_at && <IconCheck strokeWidth={3} />}
                    </button>
                    {i.recipe_id ? (
                      <Link href={`/recipes/${i.recipe_id}`} className={cx("recipe-title flex-1 text-[16px]", i.for_kids && "text-[14px] text-muted")}>
                        {i.for_kids ? `Kids: ${i.title}` : i.title}
                      </Link>
                    ) : (
                      <span className="recipe-title flex-1 text-[16px]">{i.title}</span>
                    )}
                    {i.made_at && <span className="text-[12px] text-muted">{new Date(i.made_at + "T00:00").toLocaleDateString(undefined, { weekday: "short" })}</span>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
