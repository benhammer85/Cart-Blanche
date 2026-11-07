"use client";
import { useMemo, useState } from "react";
import { useHousehold } from "@/lib/data/useHousehold";
import { Button, Chip, PageHeader, Section, Select, Sheet, TextField, Toggle } from "@/components/ui";
import { IconChevron, IconPlus, IconSearch, IconTrash } from "@/components/icons";
import { normalizeName } from "@/lib/normalize";
import type { IngredientInfo } from "@/lib/types";

type Row = IngredientInfo & { id: string };

export function IngredientsSettings() {
  const { data, reload, db, householdId } = useHousehold();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"items" | "synonyms">("items");
  const [open, setOpen] = useState<Row | null>(null);
  const [alias, setAlias] = useState("");
  const [canonical, setCanonical] = useState("");
  const list = useMemo(() => (data?.ingredients ?? []).filter((i) => i.name_norm.includes(q.toLowerCase().trim())), [data, q]);
  if (!data) return <PageHeader title="Ingredients" back="/settings" />;
  const catName = (id: string | null) => data.categories.find((c) => c.id === id)?.name ?? "Uncategorized";
  const storeName = (id: string | null) => data.stores.find((s) => s.id === id)?.name;

  async function addIngredient() {
    const n = normalizeName(q, data!.synonyms);
    if (!n) return;
    const { data: row } = await db.from("ingredients").upsert({ household_id: householdId, name_norm: n }, { onConflict: "household_id,name_norm" }).select("*").single();
    await reload();
    if (row) setOpen(row);
  }
  async function addSynonym() {
    const a = alias.toLowerCase().trim();
    const c = normalizeName(canonical);
    if (!a || !c) return;
    await db.from("synonyms").upsert({ household_id: householdId, alias: a, canonical: c }, { onConflict: "household_id,alias" });
    setAlias("");
    setCanonical("");
    reload();
  }

  return (
    <div>
      <PageHeader title="Ingredients" back="/settings" />
      <div className="px-4">
        <div className="mt-3 flex gap-2">
          <Chip active={tab === "items"} onClick={() => setTab("items")}>Categories</Chip>
          <Chip active={tab === "synonyms"} onClick={() => setTab("synonyms")}>Synonyms</Chip>
        </div>
        {tab === "items" ? (
          <>
            <div className="relative mt-3">
              <IconSearch className="absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
              <TextField value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or add" className="pl-11" />
            </div>
            {q.trim() && !list.some((i) => i.name_norm === normalizeName(q)) && (
              <Button variant="secondary" className="mt-2 w-full" onClick={addIngredient}>
                <IconPlus /> Add “{normalizeName(q)}”
              </Button>
            )}
            <Section title={`${list.length} ingredients`}>
              <ul className="card divide-y divide-line overflow-hidden">
                {list.slice(0, 200).map((i) => (
                  <li key={i.id}>
                    <button className="flex min-h-[52px] w-full items-center gap-3 px-4 py-1.5 text-left" onClick={() => setOpen(i)}>
                      <span className="flex-1">
                        <span className="block text-[16px] capitalize">{i.name_norm}</span>
                        <span className="block text-[12px] text-muted">
                          {[catName(i.category_id), i.is_staple && "staple", storeName(i.learned_store_id) && `${i.only_at ? "only at" : "always"} ${storeName(i.learned_store_id)}`, i.pack_size && `pack ${i.pack_size}`].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <IconChevron className="text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        ) : (
          <>
            <p className="mt-3 px-1 text-[14px] text-muted">When a recipe says the first thing, we buy the second. For example, chicken stock becomes bone broth.</p>
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); addSynonym(); }}>
              <TextField value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Recipe says…" />
              <TextField value={canonical} onChange={(e) => setCanonical(e.target.value)} placeholder="We buy…" />
              <Button aria-label="Add synonym"><IconPlus /></Button>
            </form>
            <Section>
              <ul className="card divide-y divide-line overflow-hidden">
                {Object.entries(data.synonyms).sort().map(([a, c]) => (
                  <li key={a} className="flex min-h-[48px] items-center gap-2 px-4">
                    <span className="flex-1 text-[15px]">{a} <span className="text-muted">→</span> {c}</span>
                    <button className="text-muted" onClick={async () => { await db.from("synonyms").delete().eq("alias", a); reload(); }} aria-label={`Delete ${a}`}>
                      <IconTrash />
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
      </div>
      {open && (
        <IngredientSheet
          row={open}
          categories={data.categories}
          stores={data.stores.filter((s) => !s.archived)}
          onClose={async (patch) => {
            if (patch) await db.from("ingredients").update(patch).eq("id", open.id);
            setOpen(null);
            reload();
          }}
          onDelete={async () => {
            await db.from("ingredients").delete().eq("id", open.id);
            setOpen(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function IngredientSheet({ row, categories, stores, onClose, onDelete }: {
  row: Row;
  categories: { id: string; name: string }[];
  stores: { id: string; name: string }[];
  onClose: (patch?: Partial<Row>) => void;
  onDelete: () => void;
}) {
  const [cat, setCat] = useState(row.category_id ?? "");
  const [staple, setStaple] = useState(row.is_staple);
  const [pack, setPack] = useState(row.pack_size ?? "");
  const [store, setStore] = useState(row.learned_store_id ?? "");
  const [onlyAt, setOnlyAt] = useState(!!row.only_at);
  const patch = () => ({
    ...(onlyAt !== !!row.only_at || onlyAt ? { only_at: onlyAt && !!store } : {}),
    category_id: cat || null,
    is_staple: staple,
    pack_size: pack.trim() || null,
    learned_store_id: store || null,
    learned_section_id: store === row.learned_store_id ? row.learned_section_id : null,
  });
  return (
    <Sheet open onClose={() => onClose(patch())} title={row.name_norm}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block px-1 text-[13px] text-muted">Category</span>
          <Select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Uncategorized</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block px-1 text-[13px] text-muted">Always buy at (when it’s on the trip)</span>
          <Select value={store} onChange={(e) => setStore(e.target.value)}>
            <option value="">Follow category rules</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </label>
        {store && (
          <div className="card flex items-center justify-between px-4 py-3">
            <span>
              <span className="block text-[17px]">Only sold there</span>
              <span className="block text-[13px] text-muted">Goes to {stores.find((s) => s.id === store)?.name} even when it isn’t on the trip</span>
            </span>
            <Toggle checked={onlyAt} onChange={setOnlyAt} label="Only sold there" />
          </div>
        )}
        <TextField value={pack} onChange={(e) => setPack(e.target.value)} placeholder="Bulk pack size (e.g. 6 lb)" aria-label="Bulk pack size" />
        <div className="card flex items-center justify-between px-4 py-3">
          <span className="text-[17px]">Pantry staple</span>
          <Toggle checked={staple} onChange={setStaple} label="Pantry staple" />
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="danger" onClick={onDelete} aria-label="Delete ingredient"><IconTrash /></Button>
          <Button className="flex-1" onClick={() => onClose(patch())}>Done</Button>
        </div>
      </div>
    </Sheet>
  );
}
