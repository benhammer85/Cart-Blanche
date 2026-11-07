"use client";
import { useEffect, useState } from "react";
import { useHousehold } from "@/lib/data/useHousehold";
import { PageHeader, Section, Stepper, Toggle } from "@/components/ui";
import { IconCheck } from "@/components/icons";
import { KITCHEN } from "@/lib/kitchen";
import { cx } from "@/components/ui";

/** Our equipment and how we like to eat. Used by AI ideas, Discover and cook mode tips. */
export function KitchenSettings() {
  const { data, db, householdId } = useHousehold();
  const [have, setHave] = useState<string[] | null>(null);
  const [meals, setMeals] = useState(4);
  const [family, setFamily] = useState(2);
  const [extra, setExtra] = useState(true);
  const [kidsMenu, setKidsMenu] = useState(true);

  useEffect(() => {
    if (!data) return;
    setHave(data.plannerDefaults.kitchen ?? []);
    setMeals(data.plannerDefaults.mealCount);
    setFamily(data.plannerDefaults.familyNights ?? 0);
    setExtra(data.plannerDefaults.makeExtra);
    setKidsMenu(data.plannerDefaults.kidMeals);
  }, [data]);

  async function save(patch: Record<string, unknown>) {
    const { data: row } = await db.from("household_settings").select("planner_defaults").eq("household_id", householdId).maybeSingle();
    const cur = (row?.planner_defaults ?? {}) as Record<string, unknown>;
    await db.from("household_settings").upsert({ household_id: householdId, planner_defaults: { ...cur, ...patch } }, { onConflict: "household_id" });
  }
  const toggle = (k: string) => {
    const next = have!.includes(k) ? have!.filter((x) => x !== k) : [...have!, k];
    setHave(next);
    save({ kitchen: next });
  };

  return (
    <div>
      <PageHeader title="Kitchen" back="/settings" subtitle="Ideas, recipe search and cooking tips follow what you have." />
      <div className="px-4">
        <Section title="Our week">
          <div className="card divide-y divide-line overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[17px]">Dinners a week</span>
              <Stepper value={meals} min={1} max={7} onChange={(v) => { setMeals(v); setFamily(Math.min(family, v)); save({ mealCount: v, familyNights: Math.min(family, v) }); }} label="Dinners a week" />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span>
                <span className="block text-[17px]">Family dinners</span>
                <span className="block text-[13px] text-muted">Everyone eats the same dinner</span>
              </span>
              <Stepper value={family} min={0} max={meals} onChange={(v) => { setFamily(v); save({ familyNights: v }); }} label="Family dinners" />
            </div>
            <label className="flex items-center justify-between px-4 py-3">
              <span className="text-[17px]">Make extra for leftovers</span>
              <Toggle checked={extra} onChange={(v) => { setExtra(v); save({ makeExtra: v }); }} label="Make extra for leftovers" />
            </label>
            <label className="flex items-center justify-between px-4 py-3">
              <span>
                <span className="block text-[17px]">Kids’ menu</span>
                <span className="block text-[13px] text-muted">A kids’ dinner on nights that aren’t family dinners</span>
              </span>
              <Toggle checked={kidsMenu} onChange={(v) => { setKidsMenu(v); save({ kidMeals: v }); }} label="Kids’ menu" />
            </label>
          </div>
        </Section>
        <Section title="Equipment">
          {!have ? (
            <div className="space-y-2">{[0, 1, 2].map((n) => <div key={n} className="skeleton h-12" />)}</div>
          ) : (
            <ul className="card divide-y divide-line overflow-hidden">
              {KITCHEN.map((k) => {
                const on = have.includes(k.key);
                return (
                  <li key={k.key}>
                    <button className="flex min-h-[50px] w-full items-center justify-between px-4 text-left text-[16px] active:bg-soft" onClick={() => toggle(k.key)} aria-pressed={on}>
                      <span className={cx(!on && "text-muted")}>{k.label}</span>
                      <span className={cx("grid h-6 w-6 place-items-center rounded-full border-2", on ? "border-ink bg-ink text-bg" : "border-line")}>
                        {on && <IconCheck className="text-[13px]" strokeWidth={3} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
