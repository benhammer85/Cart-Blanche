"use client";
import { useState } from "react";
import { useHousehold } from "@/lib/data/useHousehold";
import { Button, PageHeader, Section, TextField } from "@/components/ui";
import { IconPlus, IconX } from "@/components/icons";

export function AvoidSettings() {
  const { data, reload, db, householdId } = useHousehold();
  const [avoid, setAvoid] = useState("");
  const [bonus, setBonus] = useState("");
  if (!data) return <PageHeader title="Avoid & favorites" back="/settings" />;

  async function save(patch: { avoid_terms?: string[]; bonus_tags?: string[] }) {
    await db.from("household_settings").upsert({ household_id: householdId, ...patch }, { onConflict: "household_id" });
    reload();
  }
  const ChipList = ({ items, onRemove }: { items: string[]; onRemove: (s: string) => void }) => (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((t) => (
        <span key={t} className="flex h-9 items-center gap-1 rounded-full bg-card pr-1.5 pl-3.5 text-[14px] ring-1 ring-line">
          {t}
          <button className="grid h-6 w-6 place-items-center rounded-full text-muted" onClick={() => onRemove(t)} aria-label={`Remove ${t}`}><IconX /></button>
        </span>
      ))}
      {!items.length && <span className="px-1 text-[14px] text-muted">None yet</span>}
    </div>
  );

  return (
    <div>
      <PageHeader title="Avoid & favorites" back="/settings" />
      <div className="px-4">
        <Section title="Never use">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (avoid.trim()) save({ avoid_terms: [...new Set([...data.avoidTerms, avoid.trim().toLowerCase()])] }); setAvoid(""); }}>
            <TextField value={avoid} onChange={(e) => setAvoid(e.target.value)} placeholder="Ingredient or word (e.g. cilantro)" />
            <Button aria-label="Add"><IconPlus /></Button>
          </form>
          <ChipList items={data.avoidTerms} onRemove={(t) => save({ avoid_terms: data.avoidTerms.filter((x) => x !== t) })} />
          <p className="mt-2 px-1 text-[13px] text-muted">Recipes containing these are skipped by the planner.</p>
        </Section>
        <Section title="Favorite tags (planner bonus)">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (bonus.trim()) save({ bonus_tags: [...new Set([...data.bonusTags, bonus.trim()])] }); setBonus(""); }}>
            <TextField value={bonus} onChange={(e) => setBonus(e.target.value)} placeholder="Tag (e.g. Molly Favorites)" />
            <Button aria-label="Add"><IconPlus /></Button>
          </form>
          <ChipList items={data.bonusTags} onRemove={(t) => save({ bonus_tags: data.bonusTags.filter((x) => x !== t) })} />
        </Section>
      </div>
    </div>
  );
}
