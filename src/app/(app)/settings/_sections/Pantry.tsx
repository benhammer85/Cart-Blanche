"use client";
import { useMemo, useState } from "react";
import { useHousehold } from "@/lib/data/useHousehold";
import { Button, PageHeader, Section, TextField, Toggle } from "@/components/ui";
import { IconChevron, IconPlus, IconTrash } from "@/components/icons";
import { normalizeName } from "@/lib/normalize";

export function PantrySettings({ embedded = false }: { embedded?: boolean }) {
  const { data, reload, db, householdId } = useHousehold();
  const [name, setName] = useState("");
  const staples = useMemo(() => (data?.ingredients ?? []).filter((i) => i.is_staple), [data]);
  if (!data) return embedded ? null : <PageHeader title="Pantry" back="/settings" />;

  async function add() {
    const n = normalizeName(name, data!.synonyms);
    if (!n) return;
    await db.from("ingredients").upsert({ household_id: householdId, name_norm: n, is_staple: true }, { onConflict: "household_id,name_norm" });
    setName("");
    reload();
  }
  const content = (
    <>
        <Section title="Pantry">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <TextField value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a staple" />
            <Button aria-label="Add staple"><IconPlus /></Button>
          </form>
        </Section>
        <details className="group mt-3" open={!embedded}>
          <summary className="flex cursor-pointer list-none items-center justify-between px-1 py-2 text-[15px] text-muted">
            {staples.length} staples{staples.some((x) => x.is_out) ? ` · out of ${staples.filter((x) => x.is_out).map((x) => x.name_norm).join(", ")}` : ""}
            <IconChevron className="shrink-0 transition group-open:rotate-90" />
          </summary>
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
        </details>
    </>
  );
  if (embedded) return content;
  return (
    <div>
      <PageHeader title="Pantry" back="/settings" />
      <div className="px-4">{content}</div>
    </div>
  );
}
