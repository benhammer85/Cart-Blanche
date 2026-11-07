"use client";
import { useMemo, useState } from "react";
import { useMembership } from "@/components/AppShell";
import { useSharedList } from "@/lib/offline/useSharedList";
import { Button, Chip, Empty, Select, Sheet, TextField, Toast, cx } from "@/components/ui";
import { IconCart, IconCheck, IconCopy, IconPlus, IconTrash, IconWifiOff, IconChevron } from "@/components/icons";
import { parseIngredientLine } from "@/lib/ingredientParser";
import { buildVocabulary, correctSpelling } from "@/lib/spell";
import { assignStore, buildKeywordIndex } from "@/lib/list/storeAssign";
import { formatAmount } from "@/lib/units";
import type { IngredientInfo, ListItem } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";

const NO_STORE = "__none";

export function ListClient() {
  const me = useMembership();
  const { listId, items, household, status, pending, loaded, write } = useSharedList(me.householdId);
  const [text, setText] = useState("");
  const [storeOverride, setStoreOverride] = useState<string | null>(null);
  const [editing, setEditing] = useState<ListItem | null>(null);
  const [openCart, setOpenCart] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  const stores = useMemo(() => (household?.stores ?? []).filter((s) => !s.archived), [household]);
  const sections = household?.sections ?? [];

  const assignCtx = useMemo(() => {
    if (!household) return null;
    const ingredients = new Map<string, IngredientInfo>(household.ingredients.map((i) => [i.name_norm, i]));
    return {
      selectedStoreIds: stores.map((s) => s.id),
      categories: household.categories,
      rules: household.rules,
      sections,
      ingredients,
      keywordIndex: buildKeywordIndex(ingredients),
    };
  }, [household, stores, sections]);

  // Fix typos as you type ("theighs" → "thighs"); tap the note to keep your spelling.
  const vocab = useMemo(
    () => buildVocabulary([...(household?.ingredients ?? []).map((i) => i.name_norm), ...Object.keys(household?.synonyms ?? {})]),
    [household],
  );
  const [keepSpelling, setKeepSpelling] = useState(false);
  const spelled = useMemo(() => (keepSpelling ? { text, corrections: [] } : correctSpelling(text, vocab)), [text, vocab, keepSpelling]);
  const parsed = useMemo(() => (spelled.text.trim() ? parseIngredientLine(spelled.text, household?.synonyms ?? {}) : null), [spelled.text, household]);
  const predicted = useMemo(() => (parsed && assignCtx ? assignStore(parsed.nameNorm, assignCtx) : null), [parsed, assignCtx]);
  const addStoreId = storeOverride ?? predicted?.storeId ?? stores[0]?.id ?? null;

  function add() {
    if (!parsed || !listId) return;
    const storeId = addStoreId;
    const sectionId =
      storeId && assignCtx ? (storeId === predicted?.storeId ? predicted.sectionId : assignStore(parsed.nameNorm, { ...assignCtx, selectedStoreIds: [storeId] }).sectionId) : null;
    const name = parsed.name.charAt(0).toUpperCase() + parsed.name.slice(1);
    write([
      {
        id: crypto.randomUUID(),
        household_id: me.householdId,
        list_id: listId,
        name,
        name_norm: parsed.nameNorm,
        qty: parsed.qty,
        unit: parsed.unit,
        display_qty: parsed.qty != null ? formatAmount(parsed.qty, parsed.unit, parsed.qtyMax) : null,
        store_id: storeId,
        section_id: sectionId,
        checked: false,
        checked_by: null,
        added_by: me.initials,
        is_manual: true,
        note: parsed.note,
        source_meals: [],
        deleted_at: null,
        client_updated_at: new Date().toISOString(),
      },
    ]);
    setText("");
    setKeepSpelling(false);
    setStoreOverride(null);
  }

  function toggle(item: ListItem) {
    if (navigator.vibrate) navigator.vibrate(8);
    write([{ ...item, checked: !item.checked, checked_by: !item.checked ? me.initials : null }]);
  }

  // Group: store → section (in each store's walk order) → items
  const groups = useMemo(() => {
    const byStore = new Map<string, ListItem[]>();
    for (const i of items) {
      if (i.deleted_at || (listId && i.list_id !== listId)) continue;
      const key = i.store_id && stores.some((s) => s.id === i.store_id) ? i.store_id : NO_STORE;
      byStore.set(key, [...(byStore.get(key) ?? []), i]);
    }
    const order = [...stores.map((s) => s.id), NO_STORE];
    // Stores with nothing left to get sink to the bottom.
    const left = (id: string) => (byStore.get(id) ?? []).some((i) => !i.checked);
    order.sort((x, y) => Number(left(y)) - Number(left(x)));
    return order
      .filter((id) => byStore.has(id))
      .map((storeId) => {
        const all = byStore.get(storeId)!;
        const store = stores.find((s) => s.id === storeId);
        const secs = sections.filter((s) => s.store_id === storeId);
        const todo = all.filter((i) => !i.checked);
        const bySection = new Map<string, ListItem[]>();
        for (const i of todo) {
          const sid = i.section_id && secs.some((s) => s.id === i.section_id) ? i.section_id : "other";
          bySection.set(sid, [...(bySection.get(sid) ?? []), i]);
        }
        const sectionList = [...secs.map((s) => ({ id: s.id, name: s.name })), { id: "other", name: "Other" }]
          .filter((s) => bySection.has(s.id))
          .map((s) => ({ ...s, items: bySection.get(s.id)!.sort((a, b) => a.name.localeCompare(b.name)) }));
        return {
          storeId,
          name: store?.name ?? "No store",
          location: store?.location,
          sections: sectionList,
          inCart: all.filter((i) => i.checked).sort((a, b) => a.name.localeCompare(b.name)),
          todoCount: todo.length,
        };
      });
  }, [items, stores, sections, listId]);

  const totalTodo = groups.reduce((n, g) => n + g.todoCount, 0);
  const totalCart = groups.reduce((n, g) => n + g.inCart.length, 0);

  function storeText(g: (typeof groups)[number]) {
    const lines = [`${g.name}`];
    for (const s of g.sections) {
      lines.push(``, `${s.name}`);
      for (const i of s.items) lines.push(`- ${i.name}${i.display_qty ? ` (${i.display_qty})` : ""}`);
    }
    return lines.join("\n");
  }
  async function copy(t: string, label: string) {
    try {
      await navigator.clipboard.writeText(t);
      setToast(`${label} copied`);
    } catch {
      setToast("Couldn’t copy");
    }
  }
  function clearChecked() {
    const checked = items.filter((i) => i.checked && !i.deleted_at);
    if (!checked.length) return;
    write(checked.map((i) => ({ ...i, deleted_at: new Date().toISOString() })));
    setToast(`Cleared ${checked.length} item${checked.length === 1 ? "" : "s"}`);
    setMenu(false);
  }

  return (
    <div>
      <header className="pt-safe sticky top-0 z-30 bg-bg/90 px-5 pb-3 backdrop-blur-xl">
        <div className="flex h-11 items-center justify-end gap-2">
          <SyncBadge status={status} pending={pending} />
          <button onClick={() => setMenu(true)} className="h-8 rounded-full bg-soft px-3 text-[14px] font-medium">
            More
          </button>
        </div>
        <h1 className="large-title">Shopping List</h1>
        <p className="mt-1 text-[15px] text-muted">
          {loaded ? (totalTodo ? `${totalTodo} to get${totalCart ? ` · ${totalCart} in cart` : ""}` : totalCart ? `All done · ${totalCart} in cart` : "Nothing yet") : "Loading…"}
        </p>
      </header>

      <div className="px-4">
        {loaded && !groups.length && (
          <Empty icon={<IconCart />} title="Your list is empty">
            Add something below, or plan this week’s meals.
          </Empty>
        )}

        {groups.map((g) => (
          <section key={g.storeId} className="card mt-4 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-1">
              <div>
                <h2 className="text-[20px] font-bold leading-tight">{g.name}</h2>
                {g.location && <p className="text-[13px] text-muted">{g.location}</p>}
              </div>
              <div className="flex items-center gap-2">
                {g.todoCount ? (
                  <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[13px] font-semibold text-accent">{g.todoCount}</span>
                ) : (
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-ok text-white"><IconCheck strokeWidth={3} /></span>
                )}
                <button onClick={() => copy(storeText(g), g.name)} className="grid h-9 w-9 place-items-center rounded-full bg-soft text-lg text-muted" aria-label={`Copy ${g.name} list`}>
                  <IconCopy />
                </button>
              </div>
            </div>

            {g.sections.map((s) => (
              <div key={s.id}>
                <div className="px-4 pt-3 pb-1 text-[12px] font-semibold uppercase tracking-wide text-muted">{s.name}</div>
                <ul>
                  {s.items.map((i) => (
                    <ItemRow key={i.id} item={i} onToggle={() => toggle(i)} onEdit={() => setEditing(i)} />
                  ))}
                </ul>
              </div>
            ))}
            {!g.sections.length && <p className="px-4 py-3 text-[15px] text-muted">Everything’s in the cart.</p>}

            {g.inCart.length > 0 && (
              <div className="border-t hairline">
                <button
                  className="flex w-full items-center justify-between px-4 py-3 text-[15px] text-muted"
                  onClick={() => setOpenCart((o) => ({ ...o, [g.storeId]: !o[g.storeId] }))}
                >
                  <span className="flex items-center gap-2">
                    <IconCheck className="text-ok" /> In cart ({g.inCart.length})
                  </span>
                  <IconChevron className={cx("transition", openCart[g.storeId] && "rotate-90")} />
                </button>
                {openCart[g.storeId] && (
                  <ul className="pb-2">
                    {g.inCart.map((i) => (
                      <ItemRow key={i.id} item={i} onToggle={() => toggle(i)} onEdit={() => setEditing(i)} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        ))}
        <div className="h-40" />
      </div>

      {/* Add bar */}
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+58px)] z-30 px-3 pb-2">
        <div className="mx-auto max-w-xl">
          {spelled.corrections.length > 0 && (
            <button type="button" onClick={() => setKeepSpelling(true)} className="mb-2 ml-1 rounded-full bg-card px-3 py-1.5 text-[13px] shadow-sm ring-1 ring-line">
              Adding as <b>{spelled.corrections.map((c) => c.to).join(", ")}</b>. <span className="text-accent">Keep “{spelled.corrections.map((c) => c.from).join(", ")}”</span>
            </button>
          )}
          {text.trim() && stores.length > 0 && (
            <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto px-1">
              {stores.map((s) => (
                <Chip key={s.id} active={addStoreId === s.id} onClick={() => setStoreOverride(s.id)}>
                  {s.name}
                </Chip>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
            className="card flex items-center gap-2 p-1.5 pl-4"
          >
            <input
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (!e.target.value) setKeepSpelling(false);
              }}
              autoCorrect="on"
              spellCheck
              placeholder="Add something, like 2 lb chicken thighs"
              className="h-11 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
              enterKeyHint="done"
              autoCapitalize="sentences"
            />
            <button disabled={!text.trim() || !listId} className="grid h-11 w-11 place-items-center rounded-full bg-accent text-2xl text-accent-ink disabled:opacity-30" aria-label="Add">
              <IconPlus />
            </button>
          </form>
        </div>
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} title="List">
        <div className="card divide-y divide-line overflow-hidden">
          <button className="flex h-14 w-full items-center gap-3 px-4 text-left text-[17px]" onClick={() => { copy(groups.map(storeText).join("\n\n"), "Whole list"); setMenu(false); }}>
            <IconCopy className="text-muted" /> Copy whole list as text
          </button>
          <button className="flex h-14 w-full items-center gap-3 px-4 text-left text-[17px] text-[#d23c3c] disabled:opacity-40" disabled={!totalCart} onClick={clearChecked}>
            <IconTrash /> Clear checked items ({totalCart})
          </button>
        </div>
        <p className="mt-3 px-1 text-[13px] text-muted">Tip: copy a store’s list to paste into Apple Reminders or AnyList as a backup.</p>
      </Sheet>

      {editing && household && (
        <EditItemSheet
          item={editing}
          onClose={() => setEditing(null)}
          stores={stores}
          sections={sections}
          onSave={async (next, learn) => {
            write([next]);
            setEditing(null);
            if (learn && next.name_norm) {
              // Remember this store/section for next time.
              const db = supabaseBrowser();
              await db.from("ingredients").upsert(
                { household_id: me.householdId, name_norm: next.name_norm, learned_store_id: next.store_id, learned_section_id: next.section_id },
                { onConflict: "household_id,name_norm" },
              );
            }
          }}
          onDelete={() => {
            write([{ ...editing, deleted_at: new Date().toISOString() }]);
            setEditing(null);
          }}
        />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function ItemRow({ item, onToggle, onEdit }: { item: ListItem; onToggle: () => void; onEdit: () => void }) {
  const meals = item.source_meals?.map((m) => m.title).join(", ");
  return (
    <li className="flex items-stretch">
      <button onClick={onToggle} className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3.5 pl-4 text-left active:bg-soft" aria-pressed={item.checked}>
        <span
          className={cx(
            "grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition",
            item.checked ? "check-pop border-ok bg-ok text-white" : "border-line",
          )}
        >
          {item.checked && <IconCheck className="text-[16px]" strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1 py-2">
          <span className={cx("block text-[17px] leading-snug", item.checked && "text-muted line-through decoration-1")}>
            {item.name}
            {item.display_qty && <span className="ml-1.5 text-[15px] text-muted">{item.display_qty}</span>}
          </span>
          {(meals || item.note) && (
            <span className="block truncate text-[13px] text-muted">{[item.note, meals && `for ${meals}`].filter(Boolean).join(" · ")}</span>
          )}
        </span>
      </button>
      <button onClick={onEdit} className="flex shrink-0 items-center gap-2 pr-4 pl-2 text-muted" aria-label={`Edit ${item.name}`}>
        {item.is_manual && item.added_by && (
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-soft px-1.5 text-[11px] font-semibold">{item.added_by}</span>
        )}
        <span className="text-[20px] leading-none">⋯</span>
      </button>
    </li>
  );
}

function EditItemSheet({
  item,
  stores,
  sections,
  onClose,
  onSave,
  onDelete,
}: {
  item: ListItem;
  stores: { id: string; name: string }[];
  sections: { id: string; store_id: string; name: string }[];
  onClose: () => void;
  onSave: (next: ListItem, learn: boolean) => void;
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

  return (
    <Sheet open onClose={onClose} title="Edit item">
      <div className="space-y-3">
        <TextField value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        <TextField value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Amount (e.g. 2 lb)" aria-label="Amount" />
        <div>
          <p className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-muted">Store</p>
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
        {moved && <p className="px-1 text-[13px] text-muted">We’ll remember this store for “{item.name_norm ?? name}” next time.</p>}
        <div className="flex gap-2 pt-2">
          <Button variant="danger" onClick={onDelete} aria-label="Delete item">
            <IconTrash />
          </Button>
          <Button
            className="flex-1"
            onClick={() =>
              onSave({ ...item, name: name.trim() || item.name, display_qty: qty.trim() || null, store_id: storeId, section_id: effectiveSection }, moved)
            }
          >
            Save
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function SyncBadge({ status, pending }: { status: "synced" | "syncing" | "offline"; pending: number }) {
  if (status === "offline")
    return (
      <span className="flex h-8 items-center gap-1.5 rounded-full bg-[#fff3d6] px-3 text-[13px] font-medium text-[#8a5a00] dark:bg-[#3a2e10] dark:text-[#f0c060]">
        <IconWifiOff /> Offline{pending ? `, ${pending} waiting` : ""}
      </span>
    );
  return (
    <span className="flex h-8 items-center gap-1.5 px-1 text-[13px] text-muted" aria-live="polite">
      <span className={cx("h-2 w-2 rounded-full", status === "synced" ? "bg-ok" : "animate-pulse bg-warn")} />
      {status === "synced" ? "Live" : "Syncing"}
    </span>
  );
}
