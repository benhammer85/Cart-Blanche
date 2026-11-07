"use client";
import { useState } from "react";
import { useHousehold } from "@/lib/data/useHousehold";
import { Button, PageHeader, Section, Segmented, TextField, Toast } from "@/components/ui";
import { IconTrash } from "@/components/icons";
import { ageOn, portionForAge, portionsFor } from "@/lib/list/buildList";
import type { Person } from "@/lib/types";

export function PeopleSettings() {
  const { data, reload, db, householdId } = useHousehold();
  const [toast, setToast] = useState<string | null>(null);
  if (!data) return <PageHeader title="People" back="/settings" />;
  const portions = portionsFor(data.people);

  async function update(p: Person, patch: Partial<Person>) {
    await db.from("household_people").update(patch).eq("id", p.id);
    reload();
  }
  async function add(kind: "adult" | "kid") {
    await db.from("household_people").insert({ household_id: householdId, name: kind === "adult" ? "Adult" : "Kid", kind, sort_order: data!.people.length });
    reload();
  }
  async function remove(p: Person) {
    if (!confirm(`Remove ${p.name}?`)) return;
    await db.from("household_people").delete().eq("id", p.id);
    reload();
  }

  return (
    <div>
      <PageHeader title="People" back="/settings" subtitle={`Everyone eats ${portions.everyone} portions · kids alone ${portions.kidsOnly}`} />
      <div className="px-4">
        {(["adult", "kid"] as const).map((kind) => (
          <Section key={kind} title={kind === "adult" ? "Adults" : "Kids"} action={<button className="text-[15px] text-accent" onClick={() => add(kind)}>Add</button>}>
            <div className="space-y-3">
              {data.people.filter((p) => p.kind === kind).map((p) => {
                const auto = p.kind === "kid" && p.birthdate ? portionForAge(ageOn(p.birthdate)) : 1;
                return (
                  <div key={p.id} className="card space-y-3 p-4">
                    <div className="flex gap-2">
                      <TextField defaultValue={p.name} onBlur={(e) => e.target.value !== p.name && update(p, { name: e.target.value })} aria-label="Name" />
                      <Button variant="danger" onClick={() => remove(p)} aria-label={`Remove ${p.name}`}><IconTrash /></Button>
                    </div>
                    {p.kind === "kid" && (
                      <label className="flex items-center justify-between gap-3 text-[15px]">
                        <span className="text-muted">Birthday</span>
                        <input type="date" defaultValue={p.birthdate ?? ""} onChange={(e) => update(p, { birthdate: e.target.value || null })} className="h-10 rounded-lg bg-soft px-3" />
                      </label>
                    )}
                    <div>
                      <p className="mb-1.5 text-[13px] text-muted">
                        Portion {p.kind === "kid" && p.birthdate ? `(auto for age ${ageOn(p.birthdate)}: ${auto})` : ""}
                      </p>
                      <Segmented
                        value={p.portion_override == null ? null : Number(p.portion_override)}
                        onChange={(v) => update(p, { portion_override: v })}
                        options={[{ value: null, label: "Auto" }, { value: 0.33, label: "⅓" }, { value: 0.5, label: "½" }, { value: 0.75, label: "¾" }, { value: 1, label: "1" }, { value: 1.5, label: "1½" }]}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        ))}
        <p className="mt-4 px-2 text-[13px] text-muted">Names stay private. Only ages and portion sizes are used to plan.</p>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
