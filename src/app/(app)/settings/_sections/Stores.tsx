"use client";
import { useState } from "react";
import Link from "next/link";
import { StoreBadge } from "@/components/StoreBadge";
import { useHousehold } from "@/lib/data/useHousehold";
import { Button, PageHeader, Section, Sheet, TextArea, TextField, Toggle } from "@/components/ui";
import { SortableList } from "@/components/SortableList";
import { IconChevron, IconPlus, IconTrash } from "@/components/icons";
import type { Store, StoreSection } from "@/lib/types";

export function StoresSettings() {
  const { data, reload, db, householdId } = useHousehold();
  const [open, setOpen] = useState<Store | null>(null);
  const [newName, setNewName] = useState("");
  if (!data) return <PageHeader title="Stores" back="/settings" />;
  const stores = data.stores.filter((s) => !s.archived);

  async function reorder(next: Store[]) {
    await Promise.all(next.map((s, i) => db.from("stores").update({ sort_order: i }).eq("id", s.id)));
    reload();
  }
  async function addStore() {
    if (!newName.trim()) return;
    const { data: s } = await db.from("stores").insert({ household_id: householdId, name: newName.trim(), sort_order: stores.length }).select("*").single();
    if (s) {
      const names = data!.sections.filter((x) => x.store_id === stores[0]?.id).map((x) => x.name);
      const fallback = names.length ? names : ["Produce", "Meat", "Dairy", "Pantry", "Frozen", "Other"];
      await db.from("store_sections").insert(fallback.map((name, i) => ({ household_id: householdId, store_id: s.id, name, sort_order: i })));
    }
    setNewName("");
    reload();
  }

  return (
    <div>
      <PageHeader title="Stores" back="/settings" subtitle="Drag to set priority. Tap a store for its aisle order." />
      <div className="px-4">
        <Section>
          <SortableList
            items={stores}
            onReorder={reorder}
            render={(s) => (
              <button className="flex min-h-[60px] w-full items-center gap-3 pl-4 text-left" onClick={() => setOpen(s)}>
                <StoreBadge name={s.name} size={32} />
                <span className="flex-1">
                  <span className="block text-[17px]">{s.name}</span>
                  <span className="block text-[13px] text-muted">{[s.location, s.is_bulk && "bulk store"].filter(Boolean).join(" · ")}</span>
                </span>
                <IconChevron className="text-muted" />
              </button>
            )}
          />
        </Section>
        <Link href="/settings/rules" className="mt-4 flex items-center justify-between px-1 py-2 text-[15px] text-muted">
          <span>Advanced: which store gets each category</span>
          <IconChevron />
        </Link>
        <Section title="Add a store">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addStore(); }}>
            <TextField value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Store name" />
            <Button aria-label="Add store"><IconPlus /></Button>
          </form>
        </Section>
      </div>
      {open && <StoreSheet store={open} sections={data.sections.filter((s) => s.store_id === open.id)} onClose={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

function StoreSheet({ store, sections: initial, onClose }: { store: Store; sections: StoreSection[]; onClose: () => void }) {
  const { db, householdId } = useHousehold();
  const [name, setName] = useState(store.name);
  const [location, setLocation] = useState(store.location ?? "");
  const [bulk, setBulk] = useState(store.is_bulk);
  const [notes, setNotes] = useState(store.notes ?? "");
  const [sections, setSections] = useState(initial);
  const [newSection, setNewSection] = useState("");

  async function save() {
    await db.from("stores").update({ name: name.trim() || store.name, location: location.trim() || null, is_bulk: bulk }).eq("id", store.id);
    if ((notes.trim() || null) !== (store.notes ?? null)) {
      // Separate update so an older database without the column still saves the rest.
      await db.from("stores").update({ notes: notes.trim() || null }).eq("id", store.id);
    }
    onClose();
  }
  async function reorder(next: StoreSection[]) {
    setSections(next);
    await Promise.all(next.map((s, i) => db.from("store_sections").update({ sort_order: i }).eq("id", s.id)));
  }
  async function addSection() {
    if (!newSection.trim()) return;
    const { data } = await db.from("store_sections").insert({ household_id: householdId, store_id: store.id, name: newSection.trim(), sort_order: sections.length }).select("*").single();
    if (data) setSections([...sections, data]);
    setNewSection("");
  }
  async function removeSection(s: StoreSection) {
    await db.from("store_sections").delete().eq("id", s.id);
    setSections(sections.filter((x) => x.id !== s.id));
  }
  async function archive() {
    if (!confirm(`Remove ${store.name}? Items already on the list keep their place.`)) return;
    await db.from("stores").update({ archived: true }).eq("id", store.id);
    onClose();
  }

  return (
    <Sheet open onClose={save} title={store.name}>
      <div className="space-y-3">
        <TextField value={name} onChange={(e) => setName(e.target.value)} aria-label="Store name" />
        <TextField value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" aria-label="Location" />
        <div className="card flex items-center justify-between px-4 py-3">
          <span>
            <span className="block text-[17px]">Bulk store</span>
            <span className="block text-[13px] text-muted">Shows a “bulk pack” note on items</span>
          </span>
          <Toggle checked={bulk} onChange={setBulk} label="Bulk store" />
        </div>
        <label className="block">
          <span className="mb-1 block px-1 text-[13px] text-muted">What we buy here</span>
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Products, sauces, specialty items"
            aria-label="What we buy here"
          />
          <span className="mt-1 block px-1 text-[12px] text-muted">Used by Discover to find recipes that suit this store.</span>
        </label>
        <Section title="Aisle order (the way we walk the store)">
          <SortableList
            items={sections}
            onReorder={reorder}
            render={(s) => (
              <div className="flex min-h-[48px] items-center pl-4">
                <span className="flex-1 text-[16px]">{s.name}</span>
                {s.name !== "Other" && (
                  <button className="px-2 text-muted" onClick={() => removeSection(s)} aria-label={`Delete ${s.name}`}>
                    <IconTrash />
                  </button>
                )}
              </div>
            )}
          />
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); addSection(); }}>
            <TextField value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="New section" />
            <Button aria-label="Add section"><IconPlus /></Button>
          </form>
        </Section>
        <div className="flex gap-2 pt-3">
          <Button variant="danger" onClick={archive}>Remove store</Button>
          <Button className="flex-1" onClick={save}>Done</Button>
        </div>
      </div>
    </Sheet>
  );
}
