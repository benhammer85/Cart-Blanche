"use client";
import { useState } from "react";
import { Button, Chip, Select, Sheet, TextField, Toggle } from "@/components/ui";
import { IconTrash } from "@/components/icons";
import type { ListItem } from "@/lib/types";
import { Substitutes } from "@/components/Substitutes";

export default function EditItemSheet({
  item,
  stores,
  sections,
  onlyAt: onlyAtInitial,
  onClose,
  onSave,
  onDelete,
}: {
  item: ListItem;
  stores: { id: string; name: string }[];
  sections: { id: string; store_id: string; name: string }[];
  onlyAt: boolean;
  onClose: () => void;
  onSave: (next: ListItem, learn: boolean, onlyAt?: boolean) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(item.display_qty ?? "");
  const [storeId, setStoreId] = useState(item.store_id ?? stores[0]?.id ?? null);
  const storeSections = sections.filter((s) => s.store_id === storeId);
  const [sectionId, setSectionId] = useState(item.section_id);
  const sectionOk = storeSections.some((s) => s.id === sectionId);
  const effectiveSection = sectionOk ? sectionId : storeSections.find((s) => s.name === "Other")?.id ?? storeSections[0]?.id ?? null;
  const moved = storeId !== item.store_id || effectiveSection !== item.section_id;
  const [onlyAt, setOnlyAt] = useState(onlyAtInitial);

  return (
    <Sheet open onClose={onClose} title="Edit item">
      <div className="space-y-3">
        <TextField value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        <TextField value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Amount" aria-label="Amount" />
        <div>
          <p className="menu-label mb-2 px-1 text-muted">Store</p>
          <div className="flex flex-wrap gap-2">
            {stores.map((s) => (
              <Chip key={s.id} active={storeId === s.id} onClick={() => setStoreId(s.id)}>
                {s.name}
              </Chip>
            ))}
          </div>
        </div>
        <Select value={effectiveSection ?? ""} onChange={(e) => setSectionId(e.target.value)} aria-label="Section">
          {storeSections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        {item.source_meals?.length > 0 && (
          <p className="px-1 text-[14px] text-muted">Needed for: {item.source_meals.map((m) => m.title).join(", ")}</p>
        )}
        <Substitutes name={item.name} dish={item.source_meals?.[0]?.title} />
        {item.name_norm && storeId && (
          <div className="card flex items-center justify-between px-4 py-3">
            <span>
              <span className="block text-[17px]">Only sold at {stores.find((s) => s.id === storeId)?.name}</span>
              
            </span>
            <Toggle checked={onlyAt} onChange={setOnlyAt} label="Only sold at this store" />
          </div>
        )}
        
        <div className="flex gap-2 pt-2">
          <Button variant="danger" onClick={onDelete} aria-label="Delete item">
            <IconTrash />
          </Button>
          <Button
            className="flex-1"
            onClick={() =>
              onSave({ ...item, name: name.trim() || item.name, display_qty: qty.trim() || null, store_id: storeId, section_id: effectiveSection }, moved, onlyAt !== onlyAtInitial || (onlyAt && moved) ? onlyAt : undefined)
            }
          >
            Save
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
