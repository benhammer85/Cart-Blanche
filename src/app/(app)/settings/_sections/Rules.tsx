"use client";
import { useState } from "react";
import { useHousehold } from "@/lib/data/useHousehold";
import { PageHeader, Section, Select, Sheet, Button, cx } from "@/components/ui";
import { SortableList } from "@/components/SortableList";
import { IconChevron } from "@/components/icons";
import { SECTION_NAMES } from "@/lib/seed/defaults";
import type { Category } from "@/lib/types";

export function RulesSettings() {
  const { data, reload, db, householdId } = useHousehold();
  const [open, setOpen] = useState<Category | null>(null);
  if (!data) return <PageHeader title="Store rules" back="/settings" />;
  const stores = data.stores.filter((s) => !s.archived);
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "?";

  return (
    <div>
      <PageHeader title="Store rules" back="/settings" subtitle="For each kind of item, the first store on your trip in this order wins." />
      <div className="px-4">
        <Section>
          <ul className="card divide-y divide-line overflow-hidden">
            {data.categories.map((c) => {
              const order = data.rules.filter((r) => r.category_id === c.id).sort((a, b) => a.priority - b.priority).map((r) => storeName(r.store_id));
              return (
                <li key={c.id}>
                  <button className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left" onClick={() => setOpen(c)}>
                    <span className="flex-1">
                      <span className="block text-[17px]">{c.name}</span>
                      <span className="block text-[13px] text-muted">{order.join(" → ") || "No stores"} · aisle “{c.default_section}”</span>
                    </span>
                    <IconChevron className="text-muted" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
      {open && (
        <RuleSheet
          category={open}
          storeIds={(() => {
            const ranked = data.rules.filter((r) => r.category_id === open.id).sort((a, b) => a.priority - b.priority).map((r) => r.store_id);
            return [...ranked, ...stores.map((s) => s.id).filter((id) => !ranked.includes(id))];
          })()}
          enabledIds={data.rules.filter((r) => r.category_id === open.id).map((r) => r.store_id)}
          stores={stores}
          onClose={async (order, enabled, section) => {
            await db.from("category_store_rules").delete().eq("category_id", open.id);
            const rows = order.filter((id) => enabled.includes(id)).map((store_id, priority) => ({ household_id: householdId, category_id: open.id, store_id, priority }));
            if (rows.length) await db.from("category_store_rules").insert(rows);
            await db.from("categories").update({ default_section: section }).eq("id", open.id);
            setOpen(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function RuleSheet({
  category, storeIds, enabledIds, stores, onClose,
}: {
  category: Category;
  storeIds: string[];
  enabledIds: string[];
  stores: { id: string; name: string }[];
  onClose: (order: string[], enabled: string[], section: string) => void;
}) {
  const [order, setOrder] = useState(storeIds.map((id) => ({ id })));
  const [enabled, setEnabled] = useState(enabledIds);
  const [section, setSection] = useState(category.default_section);
  const done = () => onClose(order.map((o) => o.id), enabled, section);
  return (
    <Sheet open onClose={done} title={category.name}>
      <p className="mb-3 text-[14px] text-muted">Drag to set preference. Tap a store to skip it for this category.</p>
      <SortableList
        items={order}
        onReorder={setOrder}
        render={(o, i) => {
          const on = enabled.includes(o.id);
          return (
            <button className="flex min-h-[52px] w-full items-center gap-3 pl-4 text-left" onClick={() => setEnabled(on ? enabled.filter((x) => x !== o.id) : [...enabled, o.id])}>
              <span className={cx("grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold", on ? "bg-accent text-accent-ink" : "bg-soft text-muted")}>{on ? i + 1 : "–"}</span>
              <span className={cx("text-[17px]", !on && "text-muted line-through")}>{stores.find((s) => s.id === o.id)?.name}</span>
            </button>
          );
        }}
      />
      <Section title="Aisle / section">
        <Select value={section} onChange={(e) => setSection(e.target.value)}>
          {SECTION_NAMES.map((n) => <option key={n}>{n}</option>)}
        </Select>
      </Section>
      <Button className="mt-4 w-full" onClick={done}>Done</Button>
    </Sheet>
  );
}
