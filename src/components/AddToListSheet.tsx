"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Sheet, cx } from "./ui";
import { IconCheck } from "./icons";
import { StoreBadge } from "./StoreBadge";
import { useMembership } from "./AppShell";
import { useHousehold } from "@/lib/data/useHousehold";
import { buildShoppingList, type DraftListItem } from "@/lib/list/buildList";
import { addQty, formatAmount } from "@/lib/units";
import type { IngredientInfo, ListItem, Recipe } from "@/lib/types";

/**
 * One recipe's ingredients → the shared list. Amounts follow the scale you
 * picked, pantry staples we have are left off, and each item goes to the
 * store our rules pick (merged into anything already on the list).
 */
export function AddToListSheet({ recipe: r, scale, open, onClose }: { recipe: Recipe; scale: number; open: boolean; onClose: () => void }) {
  const me = useMembership();
  const { data, db } = useHousehold();
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const stores = useMemo(() => (data?.stores ?? []).filter((s) => !s.archived).sort((a, b) => a.sort_order - b.sort_order), [data]);
  const items: DraftListItem[] = useMemo(() => {
    if (!data) return [];
    const base = Number(r.servings) || 4;
    return buildShoppingList(
      [{ key: r.id, title: r.title, recipeId: r.id, baseServings: base, servings: base * scale, ingredients: r.recipe_ingredients ?? [] }],
      {
        selectedStoreIds: data.plannerDefaults.storeIds.length ? [...data.plannerDefaults.storeIds, ...stores.map((s) => s.id).filter((id) => !data.plannerDefaults.storeIds.includes(id))] : stores.map((s) => s.id),
        stores,
        categories: data.categories,
        rules: data.rules,
        sections: data.sections,
        ingredients: new Map<string, IngredientInfo>(data.ingredients.map((i) => [i.name_norm, i])),
        synonyms: data.synonyms,
      },
    );
  }, [data, r, scale, stores]);
  const pantry = useMemo(() => {
    const have = new Set((data?.ingredients ?? []).filter((i) => i.is_staple && !i.is_out).map((i) => i.name_norm));
    return [...new Set((r.recipe_ingredients ?? []).map((i) => data?.synonyms[i.name_norm] ?? i.name_norm).filter((n) => have.has(n)))];
  }, [data, r]);
  const chosen = items.filter((i) => !unticked.has(i.key));
  const storeName = (id: string | null) => stores.find((s) => s.id === id)?.name ?? "";

  async function add() {
    setBusy(true);
    try {
      let { data: list } = await db.from("shopping_lists").select("id").eq("is_active", true).maybeSingle();
      if (!list) list = (await db.from("shopping_lists").insert({ household_id: me.householdId, is_active: true }).select("id").single()).data;
      const { data: existing } = await db.from("shopping_list_items").select("*").eq("list_id", list!.id).is("deleted_at", null).eq("checked", false);
      const now = new Date().toISOString();
      const rows: ListItem[] = chosen.map((it) => {
        const match = (existing as ListItem[] | null)?.find((e) => e.name_norm === it.nameNorm && e.store_id === it.storeId);
        if (match) {
          const sum = addQty(match.qty, match.unit, it.qty, it.unit);
          return {
            ...match,
            display_qty: sum ? formatAmount(sum.qty, sum.unit) : [match.display_qty, it.displayQty].filter(Boolean).join(" + ") || null,
            qty: sum?.qty ?? null,
            unit: sum?.unit ?? match.unit,
            source_meals: [...(match.source_meals ?? []), ...it.sourceMeals],
            client_updated_at: now,
          };
        }
        return {
          id: crypto.randomUUID(), household_id: me.householdId, list_id: list!.id, name: it.name, name_norm: it.nameNorm, qty: it.qty, unit: it.unit,
          display_qty: it.displayQty || null, store_id: it.storeId, section_id: it.sectionId, checked: false, checked_by: null, added_by: me.initials,
          is_manual: false, note: it.note, source_meals: it.sourceMeals, deleted_at: null, client_updated_at: now,
        };
      });
      if (rows.length) {
        const { error } = await db.from("shopping_list_items").upsert(rows, { onConflict: "id" });
        if (error) throw error;
      }
      setDone(rows.length);
    } catch {
      setDone(-1);
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    onClose();
    setTimeout(() => {
      setDone(null);
      setUnticked(new Set());
    }, 300);
  };

  return (
    <Sheet open={open} onClose={close} title="Add to shopping list">
      {done != null ? (
        <div className="py-2 text-center">
          <p className="recipe-title text-[22px] font-semibold">{done < 0 ? "Couldn’t add those" : `Added ${done} ${done === 1 ? "item" : "items"}`}</p>
          <p className="mt-1 text-[15px] text-muted">{done < 0 ? "Check your connection and try again." : `For ${r.title}`}</p>
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={close}>Done</Button>
            {done >= 0 && <Link href="/list" className="flex h-11 flex-1 items-center justify-center rounded-xl bg-ink font-semibold text-bg">Open list</Link>}
          </div>
        </div>
      ) : !data ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((n) => <div key={n} className="skeleton h-12" />)}</div>
      ) : (
        <>
          <p className="px-1 text-[14px] text-muted">
            {scale !== 1 ? `Amounts for ${scale}× the recipe. ` : ""}Untick anything you already have.
          </p>
          <ul className="card mt-3 divide-y divide-line overflow-hidden">
            {items.map((it) => {
              const on = !unticked.has(it.key);
              return (
                <li key={it.key}>
                  <button
                    className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left active:bg-soft"
                    aria-pressed={on}
                    onClick={() =>
                      setUnticked((cur) => {
                        const n = new Set(cur);
                        if (n.has(it.key)) n.delete(it.key);
                        else n.add(it.key);
                        return n;
                      })
                    }
                  >
                    <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", on ? "border-ink bg-ink text-bg" : "border-line")}>
                      {on && <IconCheck className="text-[13px]" strokeWidth={3} />}
                    </span>
                    <span className={cx("min-w-0 flex-1", !on && "text-muted line-through decoration-1")}>
                      <span className="block text-[16px] leading-snug">
                        {it.name}
                        {it.displayQty && <span className="ml-1.5 text-[14px] text-muted">{it.displayQty}</span>}
                      </span>
                      {it.note && <span className="block truncate text-[12px] text-muted">{it.note}</span>}
                    </span>
                    {it.storeId && (
                      <span className="flex shrink-0 items-center gap-1 text-[12px] text-muted">
                        <StoreBadge name={storeName(it.storeId)} size={16} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {pantry.length > 0 && <p className="mt-2 px-1 text-[13px] text-muted">Left off because they’re in the pantry: {pantry.join(", ")}.</p>}
          <Button size="lg" className="mt-4 w-full" disabled={!chosen.length || busy} onClick={add}>
            {busy ? "Adding…" : `Add ${chosen.length} ${chosen.length === 1 ? "item" : "items"}`}
          </Button>
        </>
      )}
    </Sheet>
  );
}
