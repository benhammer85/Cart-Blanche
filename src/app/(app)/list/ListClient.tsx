"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { StoreBadge } from "@/components/StoreBadge";
import { TonightCard } from "@/components/TonightCard";
import { useMembership } from "@/components/AppShell";
import { useSharedList } from "@/lib/offline/useSharedList";
import { Button, Chip, Empty, Select, Sheet, TextArea, TextField, Toast, Toggle, cx } from "@/components/ui";
import { IconCart, IconCheck, IconCopy, IconPlus, IconTrash, IconWifiOff, IconChevron, IconUpload, IconPencil, IconLeaf, IconSnow, IconMinus } from "@/components/icons";
import { resizeImage } from "@/lib/data/recipes";
import { parseIngredientLine } from "@/lib/ingredientParser";
import { buildVocabulary, correctSpelling } from "@/lib/spell";
import { assignStore, buildKeywordIndex } from "@/lib/list/storeAssign";
import { buildCandidates, suggestItems } from "@/lib/list/suggest";
import { learnWalkOrder } from "@/lib/list/walkOrder";
import { QtySheet } from "@/components/QtySheet";
import { formatAmount } from "@/lib/units";
import type { IngredientInfo, ListItem } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";

const NO_STORE = "__none";

export function ListClient() {
  const me = useMembership();
  const { listId, items, household, status, pending, loaded, write, refetch } = useSharedList(me.householdId);

  // Quick-add: the things we add by hand most often (from past lists).
  const [frequent, setFrequent] = useState<string[]>([]);
  const [history, setHistory] = useState<{ name: string; name_norm: string | null; store_id: string | null }[]>([]);
  useEffect(() => {
    supabaseBrowser()
      .from("shopping_list_items")
      .select("name, name_norm, is_manual, added_by, store_id")
      .order("created_at", { ascending: false })
      .limit(800)
      .then(({ data }) => {
        const rows = (data ?? []) as { name: string; name_norm: string | null; is_manual: boolean; added_by: string | null; store_id: string | null }[];
        setHistory(rows);
        const counts = new Map<string, { name: string; n: number }>();
        for (const r of rows.filter((x) => x.is_manual && x.added_by !== "Alexa")) {
          const key = r.name_norm ?? r.name.toLowerCase();
          const cur = counts.get(key);
          counts.set(key, { name: cur?.name ?? r.name, n: (cur?.n ?? 0) + 1 });
        }
        setFrequent([...counts.values()].filter((c) => c.n >= 2).sort((a, b) => b.n - a.n).map((c) => c.name).slice(0, 10));
      });
  }, []);
  const quickAdd = useMemo(() => {
    const onList = new Set(items.filter((i) => !i.checked && !i.deleted_at).map((i) => (i.name_norm ?? i.name).toLowerCase()));
    // Until we have our own history, start with what our Shaw's receipts show we buy most.
    const base = frequent.length >= 4 ? frequent : [...frequent, "Bananas", "Carrots", "Milk", "Onions", "Garlic", "Cilantro", "Chicken thighs", "Ice cream", "Pasta", "Strawberries"];
    const seen = new Set<string>();
    return base.filter((n) => {
      const k = n.toLowerCase();
      if (seen.has(k) || onList.has(k) || onList.has(k.replace(/s$/, ""))) return false;
      seen.add(k);
      return true;
    }).slice(0, 8);
  }, [frequent, items]);
  function addQuick(name: string, storeId: string | null = viewing) {
    const item = makeItem(parseIngredientLine(name, household?.synonyms ?? {}), storeId);
    if (item) {
      write([item]);
      if (navigator.vibrate) navigator.vibrate(8);
      setToast(`Added ${name}`);
    }
  }
  const [text, setText] = useState("");
  const [storeOverride, setStoreOverride] = useState<string | null>(null);
  const [editing, setEditing] = useState<ListItem | null>(null);
  const [qtyItem, setQtyItem] = useState<ListItem | null>(null);
  // Amount for the item being typed in the add box (− 1 +).
  const [addCount, setAddCount] = useState(1);
  const [openCart, setOpenCart] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [tonightKey, setTonightKey] = useState(0);
  const pullStart = useRef<number | null>(null);
  // Which store's list we're looking at ("all" or a store id); remembered on this phone.
  const [viewStore, setViewStoreState] = useState<string>("all");
  useEffect(() => {
    try {
      const v = localStorage.getItem("cb:listStore");
      if (v) setViewStoreState(v);
    } catch {
      /* ignore */
    }
  }, []);
  const setViewStore = (v: string) => {
    setViewStoreState(v);
    try {
      localStorage.setItem("cb:listStore", v);
    } catch {
      /* ignore */
    }
  };

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
  const viewing = viewStore !== "all" && stores.some((s) => s.id === viewStore) ? viewStore : null;
  // Where it usually goes: an item we always buy at one store (rotisserie chicken → Costco) goes there.
  const usualStore = (nameNorm: string) => {
    const learned = assignCtx?.ingredients.get(nameNorm)?.learned_store_id;
    return learned && stores.some((s) => s.id === learned) ? learned : null;
  };
  // Otherwise, when looking at one store, new items go to that store unless you pick another.
  const addStoreId = storeOverride ?? (parsed ? usualStore(parsed.nameNorm) : null) ?? viewing ?? predicted?.storeId ?? stores[0]?.id ?? null;

  // "Usually at Costco": what we buy at the store we're looking at, most often first
  // (receipts + past lists), so Costco never offers ice cream.
  const favStore = storeOverride ?? viewing;
  const storeFavs = useMemo(() => {
    if (!favStore || !household) return [];
    const score = new Map<string, { label: string; n: number }>();
    const bump = (key: string, label: string, n: number) => {
      const cur = score.get(key);
      score.set(key, { label: cur?.label ?? label, n: (cur?.n ?? 0) + n });
    };
    const labels = household.plannerDefaults.itemLabels ?? {};
    for (const [k, n] of Object.entries(household.plannerDefaults.storeCounts?.[favStore] ?? {})) bump(k, labels[k] ?? k.charAt(0).toUpperCase() + k.slice(1), n);
    for (const h of history) {
      if (h.store_id !== favStore) continue;
      const name = h.name.replace(/^\s*[\d½¼¾⅓⅔/.]+\s*/, "").trim();
      if (name) bump(h.name_norm ?? name.toLowerCase(), name.charAt(0).toUpperCase() + name.slice(1), 1);
    }
    for (const i of household.ingredients) if (i.learned_store_id === favStore && !score.has(i.name_norm)) bump(i.name_norm, labels[i.name_norm] ?? i.name_norm.charAt(0).toUpperCase() + i.name_norm.slice(1), 0.5);
    const onList = new Set(items.filter((i) => !i.checked && !i.deleted_at).map((i) => i.name_norm ?? i.name.toLowerCase()));
    return [...score.entries()]
      .map(([key, v]) => ({ key, label: v.label, n: v.n, onList: onList.has(key) }))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  }, [favStore, household, history, items]);
  const [favSheet, setFavSheet] = useState(false);
  const [favPicked, setFavPicked] = useState<Set<string>>(new Set());

  // Suggestions while typing: "ro" → Rotisserie chicken (Costco).
  const candidates = useMemo(() => buildCandidates((household?.ingredients ?? []).map((i) => ({ name: i.name_norm, bought: !!i.learned_store_id })), history, household?.plannerDefaults.purchaseCounts), [household, history]);
  const typedName = useMemo(() => (text.trim() ? parseIngredientLine(text, {}).name : ""), [text]);
  const suggestions = useMemo(() => {
    const onList = new Set(items.filter((i) => !i.checked && !i.deleted_at).map((i) => i.name_norm ?? i.name.toLowerCase()));
    return suggestItems(typedName, candidates, onList).map((c) => {
      const storeId = storeOverride ?? usualStore(c.nameNorm) ?? (assignCtx ? assignStore(c.nameNorm, assignCtx).storeId : null) ?? viewing;
      return { ...c, storeId };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typedName, candidates, items, storeOverride, assignCtx, viewing]);
  function addSuggestion(sg: (typeof suggestions)[number]) {
    const p = parseIngredientLine(text, household?.synonyms ?? {});
    const line = p.qty != null ? `${formatAmount(p.qty, p.unit)} ${sg.label}` : addCount > 1 ? `${addCount} ${sg.label}` : sg.label;
    const item = makeItem(parseIngredientLine(line, household?.synonyms ?? {}), sg.storeId);
    if (!item) return;
    write([item]);
    if (navigator.vibrate) navigator.vibrate(8);
    setToast(`Added ${sg.label}${sg.storeId ? ` · ${stores.find((x) => x.id === sg.storeId)?.name}` : ""}`);
    setText("");
    setAddCount(1);
    setKeepSpelling(false);
    setStoreOverride(null);
  }

  /** A list row from one parsed line, in the chosen store (or the store our rules pick). */
  function makeItem(parsed: ReturnType<typeof parseIngredientLine>, storeId: string | null): ListItem | null {
    if (!listId) return null;
    const auto = assignCtx ? assignStore(parsed.nameNorm, assignCtx) : null;
    const store = storeId ?? auto?.storeId ?? stores[0]?.id ?? null;
    const sectionId = store && assignCtx ? (store === auto?.storeId ? auto.sectionId : assignStore(parsed.nameNorm, { ...assignCtx, selectedStoreIds: [store] }).sectionId) : null;
    const name = parsed.name.charAt(0).toUpperCase() + parsed.name.slice(1);
    return {
        id: crypto.randomUUID(),
        household_id: me.householdId,
        list_id: listId,
        name,
        name_norm: parsed.nameNorm,
        qty: parsed.qty,
        unit: parsed.unit,
        display_qty: parsed.qty != null ? formatAmount(parsed.qty, parsed.unit, parsed.qtyMax) : null,
        store_id: store,
        section_id: sectionId,
        checked: false,
        checked_by: null,
        added_by: me.initials,
        is_manual: true,
        note: parsed.note,
        source_meals: [],
        deleted_at: null,
        client_updated_at: new Date().toISOString(),
    };
  }

  function add() {
    if (!parsed) return;
    const withCount = parsed.qty == null && addCount > 1 ? parseIngredientLine(`${addCount} ${spelled.text}`, household?.synonyms ?? {}) : parsed;
    const item = makeItem(withCount, addStoreId);
    if (!item) return;
    write([item]);
    setText("");
    setAddCount(1);
    setKeepSpelling(false);
    setStoreOverride(null);
  }

  // Bulk add: a pasted list or the items read from a screenshot (e.g. Molly's Instacart cart)
  const [bulk, setBulk] = useState<{ text: string; busy?: string; error?: string } | null>(null);
  const bulkLines = useMemo(
    () =>
      (bulk?.text ?? "")
        .split(/\n|,(?![^(]*\))/)
        .map((l) => l.replace(/^\s*(?:[-•*▢☐]\s*|\d+[.)]\s+)/, "").trim())
        .filter((l) => l.length > 1)
        .map((l) => {
          const fixed = correctSpelling(l, vocab).text;
          const p = parseIngredientLine(fixed, household?.synonyms ?? {});
          const a = assignCtx ? assignStore(p.nameNorm, assignCtx) : null;
          return { line: fixed, parsed: p, storeId: a?.storeId ?? stores[0]?.id ?? null };
        }),
    [bulk?.text, vocab, household, assignCtx, stores],
  );
  function addBulk() {
    const rows = bulkLines.map((b) => makeItem(b.parsed, b.storeId)).filter(Boolean) as ListItem[];
    if (rows.length) write(rows);
    setToast(`Added ${rows.length} item${rows.length === 1 ? "" : "s"}`);
    setBulk(null);
  }
  async function readScreenshot(file: File) {
    setMenu(false);
    setBulk({ text: "", busy: "Reading the screenshot…" });
    try {
      const small = await resizeImage(file, 1600, 0.85);
      const b64 = await new Promise<string>((res) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).replace(/^data:[^,]+,/, ""));
        fr.readAsDataURL(small);
      });
      const r = await fetch("/api/ai/screenshot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: b64, mimeType: "image/jpeg" }) }).then((x) => x.json());
      if (!r.ok) setBulk({ text: "", error: r.error ?? "Couldn’t read that picture." });
      else setBulk({ text: (r.lines as string[]).join("\n") });
    } catch {
      setBulk({ text: "", error: navigator.onLine ? "Couldn’t read that picture." : "You’re offline. Try again with signal." });
    }
  }

  function toggle(item: ListItem) {
    if (navigator.vibrate) navigator.vibrate(8);
    write([{ ...item, checked: !item.checked, checked_by: !item.checked ? me.initials : null }]);
    if (!item.checked && item.store_id) {
      noteWalk(item.store_id, item.section_id);
      // Last thing at this store? Say so, and learn the aisle order from this trip.
      const left = items.filter((i) => i.store_id === item.store_id && !i.checked && !i.deleted_at && i.id !== item.id).length;
      const store = stores.find((s) => s.id === item.store_id);
      if (!left && store) {
        if (navigator.vibrate) navigator.vibrate([10, 60, 20]);
        learnWalk(store.id).then((learned) => setToast(`All done at ${store.name} ✓${learned ? " Aisle order updated from this trip." : ""}`));
      }
    }
  }

  // The order aisles get checked off in the store (kept on this phone for the current trip).
  const walkKey = (storeId: string) => `cb:walk:${storeId}`;
  function noteWalk(storeId: string, sectionId: string | null) {
    if (!sectionId) return;
    try {
      const raw = JSON.parse(localStorage.getItem(walkKey(storeId)) ?? "null") as { at: number; sections: string[] } | null;
      // A trip is one sitting: start fresh after 6 hours.
      const trip = raw && Date.now() - raw.at < 6 * 3600_000 ? raw : { at: Date.now(), sections: [] };
      if (!trip.sections.includes(sectionId)) trip.sections.push(sectionId);
      localStorage.setItem(walkKey(storeId), JSON.stringify({ at: Date.now(), sections: trip.sections }));
    } catch {
      /* private mode */
    }
  }
  async function learnWalk(storeId: string): Promise<boolean> {
    try {
      const raw = JSON.parse(localStorage.getItem(walkKey(storeId)) ?? "null") as { sections: string[] } | null;
      localStorage.removeItem(walkKey(storeId));
      if (!raw) return false;
      const secs = sections.filter((x) => x.store_id === storeId && x.name !== "Other");
      const current = secs.map((x) => x.id);
      const next = learnWalkOrder(current, raw.sections);
      if (next.every((id, i) => id === current[i])) return false;
      const db = supabaseBrowser();
      await Promise.all(next.map((id, i) => db.from("store_sections").update({ sort_order: i }).eq("id", id)));
      return true;
    } catch {
      return false;
    }
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
  // Show one store only if it still has something on the list.
  const shown = viewing && groups.some((g) => g.storeId === viewing) ? viewing : null;
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
    <div
      onTouchStart={(e) => {
        pullStart.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
      }}
      onTouchMove={(e) => {
        if (pullStart.current == null || refreshing) return;
        const d = e.touches[0].clientY - pullStart.current;
        setPull(d > 0 ? Math.min(d * 0.5, 90) : 0);
      }}
      onTouchEnd={async () => {
        const go = pull > 60;
        pullStart.current = null;
        setPull(0);
        if (go) {
          setRefreshing(true);
          if (navigator.vibrate) navigator.vibrate(8);
          await refetch();
          setTonightKey((k) => k + 1);
          setRefreshing(false);
        }
      }}
    >
      {(pull > 0 || refreshing) && (
        <div className="pt-safe pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center" style={{ transform: `translateY(${refreshing ? 50 : pull}px)` }}>
          <span className="rounded-full bg-card px-3 py-1.5 text-[13px] font-medium text-muted shadow">
            {refreshing ? "Refreshing…" : pull > 60 ? "Release to refresh" : "Pull to refresh"}
          </span>
        </div>
      )}
      <header className="pt-safe sticky top-0 z-30 bg-bg/90 px-5 pb-3 backdrop-blur-xl">
        <div className="flex h-11 items-center justify-end gap-2">
          <SyncBadge status={status} pending={pending} />
          <button onClick={() => setMenu(true)} className="-mr-2 h-11 px-2 text-[16px] text-accent">
            More
          </button>
        </div>
        <h1 className="large-title">Shopping list</h1>
        <p className="mt-1 text-[15px] text-muted">
          {loaded ? (totalTodo ? `${totalTodo} to get${totalCart ? ` · ${totalCart} in cart` : ""}` : totalCart ? `All done · ${totalCart} in cart` : "No items") : "Loading…"}
        </p>
        {groups.length > 1 && (
          <div className="no-scrollbar -mx-5 mt-2 flex gap-5 overflow-x-auto border-b hairline px-5" role="tablist">
            {[{ id: null as string | null, name: "All", count: totalTodo }, ...groups.map((g) => ({ id: g.storeId as string | null, name: g.name, count: g.todoCount }))].map((t) => {
              const on = (shown ?? null) === t.id;
              return (
                <button
                  key={t.id ?? "all"}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setViewStore(t.id ?? "all")}
                  className={cx("-mb-px flex h-11 shrink-0 items-center gap-1.5 border-b-2 text-[15px] transition-colors", on ? "border-accent font-semibold text-ink" : "border-transparent text-muted")}
                >
                  {t.name}
                  <span className="text-[13px] font-normal text-muted tabular-nums">{t.count || "✓"}</span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      <div className="px-4">
        <TonightCard key={tonightKey} />
        {loaded && !groups.length && (
          <Empty icon={<IconCart />} title="Your list is empty">
            Add items below or plan the week’s meals.
          </Empty>
        )}

        {groups.filter((g) => !shown || g.storeId === shown).map((g) => (
          <section key={g.storeId} className="card mt-4 overflow-hidden">
            <div className="flex items-start justify-between px-4 pt-4 pb-1">
              <div className="flex items-start gap-2.5">
                <span className="mt-1"><StoreBadge name={g.name} size={24} /></span>
                <div>
                  <h2 className="recipe-title text-[22px] leading-tight font-semibold">{g.name}</h2>
                  {g.location && <p className="menu-label mt-0.5 text-muted">{g.location}</p>}
                </div>
              </div>
              <div className="-mr-2 flex items-center gap-1">
                <span className={cx("text-[14px] tabular-nums", g.todoCount ? "text-muted" : "font-semibold text-ok")}>
                  {g.todoCount ? `${g.todoCount} left` : "Done"}
                </span>
                <button onClick={() => copy(storeText(g), g.name)} className="grid h-11 w-11 place-items-center text-lg text-muted" aria-label={`Copy ${g.name} list`}>
                  <IconCopy />
                </button>
              </div>
            </div>

            {g.sections.map((s) => (
              <div key={s.id}>
                <div className="menu-label px-4 pt-4 pb-1 text-muted">{s.name}</div>
                <ul>
                  {s.items.map((i) => (
                    <ItemRow key={i.id} item={i} onToggle={() => toggle(i)} onEdit={() => setEditing(i)} onQty={() => setQtyItem(i)} />
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
                      <ItemRow key={i.id} item={i} onToggle={() => toggle(i)} onEdit={() => setEditing(i)} onQty={() => setQtyItem(i)} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        ))}
        <div className="h-52" />
      </div>

      {/* Add bar */}
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+58px)] z-30 border-t hairline bg-bg px-3 pt-2 pb-2">
        <div className="mx-auto max-w-xl">
          {!text.trim() && favStore && storeFavs.length > 0 && listId && (
            <div className="no-scrollbar mb-2 flex items-center gap-2 overflow-x-auto px-1">
              <span className="menu-label shrink-0 text-muted">Usually</span>
              {storeFavs.filter((f) => !f.onList).slice(0, 10).map((f) => (
                <button key={f.key} onClick={() => addQuick(f.label, favStore)} className="h-9 shrink-0 rounded-full px-3 text-[14px] text-ink ring-1 ring-line active:scale-95 active:bg-soft">
                  + {f.label}
                </button>
              ))}
              <button onClick={() => { setFavPicked(new Set()); setFavSheet(true); }} className="h-9 shrink-0 rounded-full bg-ink px-3.5 text-[14px] font-semibold text-bg">
                See all
              </button>
            </div>
          )}
          {!text.trim() && !favStore && quickAdd.length > 0 && listId && (
            <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto px-1">
              {quickAdd.map((n) => (
                <button key={n} onClick={() => addQuick(n)} className="h-9 shrink-0 rounded-full px-3 text-[14px] text-ink ring-1 ring-line active:scale-95 active:bg-soft">
                  + {n}
                </button>
              ))}
            </div>
          )}
          {spelled.corrections.length > 0 && (
            <button type="button" onClick={() => setKeepSpelling(true)} className="mb-2 ml-1 rounded-full bg-card px-3 py-1.5 text-[13px] shadow-sm ring-1 ring-line">
              Adding as <b>{spelled.corrections.map((c) => c.to).join(", ")}</b>. <span className="text-accent">Keep “{spelled.corrections.map((c) => c.from).join(", ")}”</span>
            </button>
          )}
          {suggestions.length > 0 && (
            <div className="card mb-2 divide-y divide-line overflow-hidden" role="listbox" aria-label="Suggestions">
              {suggestions.map((sg) => {
                const st = stores.find((x) => x.id === sg.storeId);
                return (
                  <button key={sg.nameNorm} role="option" aria-selected="false" onClick={() => addSuggestion(sg)} className="flex min-h-[48px] w-full items-center gap-3 px-4 text-left active:bg-soft">
                    <IconPlus className="shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate text-[16px]">{sg.label}</span>
                    {st && (
                      <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted">
                        <StoreBadge name={st.name} size={18} />
                        {st.name}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {text.trim() && stores.length > 0 && (
            <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto px-1">
              {stores.map((s) => (
                <Chip key={s.id} active={addStoreId === s.id} onClick={() => setStoreOverride(s.id)}>
                  <span className="flex items-center gap-1.5"><StoreBadge name={s.name} size={18} />{s.name}</span>
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
                if (!e.target.value) {
                  setKeepSpelling(false);
                  setAddCount(1);
                }
              }}
              autoCorrect="on"
              spellCheck
              placeholder="Add an item"
              className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
              enterKeyHint="done"
              autoCapitalize="sentences"
            />
            {text.trim() && parsed?.qty == null && (
              <span className="flex shrink-0 items-center rounded-full bg-soft" aria-label="How many">
                <button type="button" onClick={() => setAddCount((n) => Math.max(1, n - 1))} className="grid h-11 w-8 place-items-center text-[18px] text-muted" aria-label="Fewer">
                  <IconMinus />
                </button>
                <span className="w-5 text-center text-[16px] font-semibold tabular-nums">{addCount}</span>
                <button type="button" onClick={() => setAddCount((n) => n + 1)} className="grid h-11 w-8 place-items-center text-[18px]" aria-label="More">
                  <IconPlus />
                </button>
              </span>
            )}
            <button disabled={!text.trim() || !listId} className="grid h-11 w-11 place-items-center rounded-full bg-ink text-2xl text-bg disabled:opacity-30" aria-label="Add">
              <IconPlus />
            </button>
          </form>
        </div>
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} title="List">
        <div className="card mb-3 divide-y divide-line overflow-hidden">
          <label className="flex h-14 w-full cursor-pointer items-center gap-3 px-4 text-left text-[17px]">
            <IconUpload className="text-muted" /> Add from a screenshot
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readScreenshot(f); }} />
          </label>
          <button className="flex h-14 w-full items-center gap-3 px-4 text-left text-[17px]" onClick={() => { setMenu(false); setBulk({ text: "" }); }}>
            <IconPencil className="text-muted" /> Paste a list
          </button>
          <Link href="/settings/pantry" className="flex h-14 w-full items-center gap-3 px-4 text-left text-[17px]" onClick={() => setMenu(false)}>
            <IconLeaf className="text-muted" /> Pantry staples we’re out of
          </Link>
          <Link href="/settings/stock" className="flex h-14 w-full items-center gap-3 px-4 text-left text-[17px]" onClick={() => setMenu(false)}>
            <IconSnow className="text-muted" /> Freezer
          </Link>
        </div>
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

      {bulk && (
        <Sheet open onClose={() => setBulk(null)} title={bulk.busy ? "Reading…" : "Add several items"}>
          {bulk.busy ? (
            <p className="py-10 text-center text-[15px] text-muted">{bulk.busy}</p>
          ) : (
            <div className="space-y-3">
              {bulk.error && <p className="text-[14px] text-[#d23c3c]">{bulk.error}</p>}
              <TextArea
                rows={6}
                value={bulk.text}
                onChange={(e) => setBulk({ text: e.target.value })}
                placeholder={"One item per line\n2 lb chicken thighs\nbananas\nGreek yogurt"}
              />
              {bulkLines.length > 0 && (
                <ul className="card divide-y divide-line overflow-hidden">
                  {bulkLines.map((b, i) => (
                    <li key={i} className="flex items-center gap-2 px-3 py-2 text-[15px]">
                      <StoreBadge name={stores.find((s) => s.id === b.storeId)?.name ?? "?"} size={22} />
                      <span className="flex-1">{b.parsed.name.charAt(0).toUpperCase() + b.parsed.name.slice(1)}</span>
                      <span className="text-[13px] text-muted">{b.parsed.qty != null ? formatAmount(b.parsed.qty, b.parsed.unit, b.parsed.qtyMax) : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Button size="lg" className="w-full" disabled={!bulkLines.length || !listId} onClick={addBulk}>
                Add {bulkLines.length || ""} {bulkLines.length === 1 ? "item" : "items"}
              </Button>
              <p className="px-1 text-[13px] text-muted">Each item goes to the store our rules pick. You can move any of them afterwards.</p>
            </div>
          )}
        </Sheet>
      )}

      {editing && household && (
        <EditItemSheet
          item={editing}
          onClose={() => setEditing(null)}
          stores={stores}
          sections={sections}
          onlyAt={!!household.ingredients.find((i) => i.name_norm === editing.name_norm)?.only_at}
          onSave={async (next, learn, onlyAt) => {
            write([next]);
            setEditing(null);
            if (onlyAt !== undefined && next.name_norm) {
              const db = supabaseBrowser();
              await db.from("ingredients").upsert(
                { household_id: me.householdId, name_norm: next.name_norm, learned_store_id: next.store_id, learned_section_id: next.section_id, only_at: onlyAt },
                { onConflict: "household_id,name_norm" },
              );
            } else if (learn && next.name_norm) {
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
      <Sheet open={favSheet} onClose={() => setFavSheet(false)} title={`Usually at ${stores.find((x) => x.id === favStore)?.name ?? "this store"}`}>
        <p className="px-1 text-[14px] text-muted">Most bought first. Tick what you need.</p>
        <ul className="card mt-3 divide-y divide-line overflow-hidden">
          {storeFavs.map((f) => {
            const on = favPicked.has(f.key);
            return (
              <li key={f.key}>
                <button
                  disabled={f.onList}
                  onClick={() => setFavPicked((cur) => { const n = new Set(cur); if (n.has(f.key)) n.delete(f.key); else n.add(f.key); return n; })}
                  className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left active:bg-soft disabled:opacity-50"
                  aria-pressed={on}
                >
                  <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", on ? "border-ink bg-ink text-bg" : "border-line")}>
                    {on && <IconCheck className="text-[13px]" strokeWidth={3} />}
                  </span>
                  <span className="flex-1 text-[16px]">{f.label}</span>
                  {f.onList && <span className="shrink-0 text-[13px] text-muted">On the list</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <Button
          size="lg"
          className="mt-4 w-full"
          disabled={!favPicked.size}
          onClick={() => {
            const rows = storeFavs.filter((f) => favPicked.has(f.key)).map((f) => makeItem(parseIngredientLine(f.label, household?.synonyms ?? {}), favStore)).filter(Boolean) as ListItem[];
            if (rows.length) write(rows);
            setToast(`Added ${rows.length} ${rows.length === 1 ? "item" : "items"}`);
            setFavSheet(false);
          }}
        >
          {favPicked.size ? `Add ${favPicked.size} ${favPicked.size === 1 ? "item" : "items"}` : "Tick items to add"}
        </Button>
      </Sheet>
      <QtySheet
        item={qtyItem}
        open={!!qtyItem}
        onClose={() => setQtyItem(null)}
        onSave={(q, u) => {
          if (!qtyItem) return;
          write([{ ...qtyItem, qty: q, unit: q == null ? null : u, display_qty: q == null ? null : formatAmount(q, u) || String(q) }]);
        }}
      />
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function ItemRow({ item, onToggle, onEdit, onQty }: { item: ListItem; onToggle: () => void; onEdit: () => void; onQty: () => void }) {
  const meals = item.source_meals?.map((m) => m.title).join(", ");
  // Swipe right to check off (or un-check). Taps still work as before.
  const [dx, setDxState] = useState(0);
  const dxRef = useRef(0); // latest distance, readable even before React re-renders
  const setDx = (v: number) => {
    dxRef.current = v;
    setDxState(v);
  };
  const start = useRef<{ x: number; y: number; swiping: boolean } | null>(null);
  const SWIPE = 72;
  return (
    <li className="relative overflow-hidden">
      <div className={cx("absolute inset-y-0 left-0 flex items-center pl-5 text-white transition-colors", dx > SWIPE ? "bg-ok" : "bg-ok/60")} style={{ width: Math.max(dx, 0) }} aria-hidden>
        {dx > 24 && <IconCheck strokeWidth={3} className="text-xl" />}
      </div>
      <div
        className="relative flex items-stretch bg-card"
        style={{ transform: `translateX(${dx}px)`, transition: start.current?.swiping ? "none" : "transform 0.2s ease" }}
        onTouchStart={(e) => {
          start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, swiping: false };
        }}
        onTouchMove={(e) => {
          const st = start.current;
          if (!st) return;
          const mx = e.touches[0].clientX - st.x;
          const my = e.touches[0].clientY - st.y;
          if (!st.swiping && Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.5) st.swiping = true;
          if (st.swiping) setDx(Math.max(0, Math.min(mx, 140)));
        }}
        onTouchEnd={() => {
          const swiped = start.current?.swiping && dxRef.current > SWIPE;
          start.current = null;
          setDx(0);
          if (swiped) onToggle();
        }}
      >
        <button
          onClick={() => {
            if (dxRef.current === 0) onToggle();
          }}
          className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3.5 pl-4 text-left active:bg-soft"
          aria-pressed={item.checked}
        >
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
            </span>
            {(meals || item.note) && (
              <span className="block truncate text-[13px] text-muted">{[item.note, meals && `for ${meals}`].filter(Boolean).join(" · ")}</span>
            )}
          </span>
        </button>
        {!item.checked && (
          <button
            onClick={onQty}
            className={cx("my-auto h-9 shrink-0 rounded-full px-3 text-[15px] tabular-nums", item.display_qty ? "bg-soft font-semibold" : "text-muted ring-1 ring-line")}
            aria-label={`Amount of ${item.name}`}
          >
            {item.display_qty || "+ Qty"}
          </button>
        )}
        {item.checked && item.display_qty && <span className="my-auto shrink-0 text-[14px] text-muted">{item.display_qty}</span>}
        <button onClick={onEdit} className="flex shrink-0 items-center gap-2 pr-4 pl-2 text-muted" aria-label={`Edit ${item.name}`}>
          {item.is_manual && item.added_by && (
            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-soft px-1.5 text-[11px] font-semibold">{item.added_by}</span>
          )}
          <span className="text-[20px] leading-none">⋯</span>
        </button>
      </div>
    </li>
  );
}

function EditItemSheet({
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
        {item.name_norm && storeId && (
          <div className="card flex items-center justify-between px-4 py-3">
            <span>
              <span className="block text-[17px]">Only sold at {stores.find((s) => s.id === storeId)?.name}</span>
              <span className="block text-[13px] text-muted">Always goes here, even when we aren’t planning a trip</span>
            </span>
            <Toggle checked={onlyAt} onChange={setOnlyAt} label="Only sold at this store" />
          </div>
        )}
        {moved && <p className="px-1 text-[13px] text-muted">We’ll remember this store for “{item.name_norm ?? name}” next time.</p>}
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
