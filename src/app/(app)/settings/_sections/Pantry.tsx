"use client";
import { useMemo, useState } from "react";
import { useHousehold } from "@/lib/data/useHousehold";
import { Button, PageHeader, Section, TextField, Toggle } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";
import { normalizeName } from "@/lib/normalize";

export function PantrySettings() {
  const { data, reload, db, householdId } = useHousehold();
  const [name, setName] = useState("");
  const staples = useMemo(() => (data?.ingredients ?? []).filter((i) => i.is_staple), [data]);
  if (!data) return <PageHeader title="Pantry staples" back="/settings" />;

  async function add() {
    const n = normalizeName(name, data!.synonyms);
    if (!n) return;
    await db.from("ingredients").upsert({ household_id: householdId, name_norm: n, is_staple: true }, { onConflict: "household_id,name_norm" });
    setName("");
    reload();
  }
  return (
    <div>
      <PageHeader title="Pantry" back="/settings" subtitle="We always have these, so they stay off the list. Flip “We’re out” when we run low." />
      <div className="px-4">
        <Section>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <TextField value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a staple" />
            <Button aria-label="Add staple"><IconPlus /></Button>
          </form>
        </Section>
        <Section title={`${staples.length} staples`}>
          <ul className="card divide-y divide-line overflow-hidden">
            {staples.map((s) => (
              <li key={s.id} className="flex min-h-[56px] items-center gap-3 px-4">
                <span className="flex-1 text-[17px] capitalize">{s.name_norm}</span>
                <span className="text-[13px] text-muted">We’re out</span>
                <Toggle checked={s.is_out} onChange={async (v) => { await db.from("ingredients").update({ is_out: v }).eq("id", s.id); reload(); }} label={`We're out of ${s.name_norm}`} />
                <button className="pl-1 text-muted" onClick={async () => { await db.from("ingredients").update({ is_staple: false, is_out: false }).eq("id", s.id); reload(); }} aria-label={`Not a staple: ${s.name_norm}`}>
                  <IconTrash />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
