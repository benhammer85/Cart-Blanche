"use client";
import { useState } from "react";
import { Button, Sheet, TextField, Toggle } from "./ui";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Add a store from anywhere. A full grocery store gets everything; a
 * specialty store is added last in every category so you can move it up
 * in Settings → Store rules.
 */
export function AddStoreSheet({ householdId, onClose, onAdded }: { householdId: string; onClose: () => void; onAdded: (id: string) => void }) {
  const [name, setName] = useState("");
  const [full, setFull] = useState(true);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    const db = supabaseBrowser();
    const [{ data: stores }, { data: cats }, { data: rules }] = await Promise.all([
      db.from("stores").select("id, sort_order").order("sort_order"),
      db.from("categories").select("id, name, default_section"),
      db.from("category_store_rules").select("category_id, priority"),
    ]);
    const { data: store } = await db
      .from("stores")
      .insert({ household_id: householdId, name: name.trim(), sort_order: (stores ?? []).length })
      .select("id")
      .single();
    if (!store) {
      setBusy(false);
      return;
    }
    // Same aisles as the first store, so items land in sensible sections.
    const first = stores?.[0]?.id;
    const { data: secs } = first ? await db.from("store_sections").select("name, sort_order").eq("store_id", first).order("sort_order") : { data: [] };
    const names = (secs ?? []).map((x: { name: string }) => x.name);
    const list = names.length ? names : ["Produce", "Bakery", "Meat", "Seafood", "Dairy", "Pantry", "Frozen", "International", "Other"];
    await db.from("store_sections").insert(list.map((n, i) => ({ household_id: householdId, store_id: store.id, name: n, sort_order: i })));
    // Rules: last choice everywhere; a full grocery store is also a usual stop for "Other".
    const maxPrio = (catId: string) => Math.max(-1, ...(rules ?? []).filter((r: { category_id: string }) => r.category_id === catId).map((r: { priority: number }) => r.priority));
    await db.from("category_store_rules").insert(
      (cats ?? []).map((c: { id: string; name: string }) => ({
        household_id: householdId,
        category_id: c.id,
        store_id: store.id,
        priority: full && c.name === "Other" ? 1 : maxPrio(c.id) + 1,
      })),
    );
    setBusy(false);
    onAdded(store.id);
  }

  return (
    <Sheet open onClose={onClose} title="Add a store">
      <div className="space-y-3">
        <TextField value={name} onChange={(e) => setName(e.target.value)} placeholder="Store name" autoFocus />
        <label className="card flex items-center justify-between px-4 py-3">
          <span>
            <span className="block text-[17px]">Full grocery store</span>
            
          </span>
          <Toggle checked={full} onChange={setFull} label="Full grocery store" />
        </label>
        <Button size="lg" className="w-full" disabled={!name.trim() || busy} onClick={add}>{busy ? "Adding…" : "Add store"}</Button>
      </div>
    </Sheet>
  );
}
