"use client";
import { familyFriendly } from "@/lib/infer";
import { isIdea } from "@/lib/ideas";
import { useEffect, useMemo, useState } from "react";
import { StoreBadge } from "@/components/StoreBadge";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Chip, Segmented, Sheet, Stepper, TextField, Toast, cx } from "@/components/ui";
import { IconChevron, IconCheck, IconLock, IconSwap, IconPlus } from "@/components/icons";
import { useMembership } from "@/components/AppShell";
import { RecipeImage } from "@/components/RecipeImage";
import { AddStoreSheet } from "@/components/AddStoreSheet";
import { Recommend } from "./Recommend";
import { StorePicker } from "./StorePicker";
import type { PickedDraft } from "./NewPicks";
import dynamic from "next/dynamic";

// Loaded only when used, so the page opens faster.
const DayList = dynamic(() => import("./DayList"));
const NewRecipes = dynamic(() => import("./NewPicks").then((m) => m.NewRecipes));
const QuickIdeas = dynamic(() => import("./NewPicks").then((m) => m.QuickIdeas));
import { planMeals, pickKidMeals, rng, swapMeal, type PlannerRecipe, type PlanParams } from "@/lib/planner/planner";
import { buildShoppingList, portionsFor, type DraftListItem, type PlannedMealForList } from "@/lib/list/buildList";
import { supabaseBrowser } from "@/lib/supabase/client";
import { saveRecipe } from "@/lib/data/recipes";
import { PLAN_INBOX_KEY } from "@/lib/planInbox";
import { addQty, formatAmount, round } from "@/lib/units";
import { addStock, useStock as takeFromStock, type Amount } from "@/lib/list/bulk";
import type { HouseholdData } from "@/lib/data/household";
import type { IngredientInfo, ListItem, MealType, PlannerDefaults, RecipeDraft, RecipeIngredient } from "@/lib/types";

export interface PlanRecipe {
  id: string;
  title: string;
  servings: number;
  prep_min: number | null;
  image_path: string | null;
  tags: string[];
  meal_types: MealType[];
  main_protein: string | null;
  kid_friendly: boolean;
  is_kid_meal: boolean;
  times_made: number;
  last_made_at: string | null;
  recipe_ingredients: Pick<RecipeIngredient, "qty" | "qty_max" | "unit" | "name" | "name_norm" | "raw_text" | "parsed_ok">[];
}

export interface RepeatPlan {
  params: Partial<PlannerDefaults>;
  store_ids: string[];
  meal_plan_items: { recipe_id: string | null; ai_recipe: RecipeDraft | null; title: string; for_kids: boolean; position: number }[];
}

interface Slot {
  key: string;
  recipeId: string | null;
  draft: RecipeDraft | null;
  title: string;
  locked: boolean;
  reason?: string;
  kid: { recipeId: string; title: string } | null;
  skipIds: string[];
}

type Step = "params" | "plan" | "list";
type PreviewItem = DraftListItem & { have: boolean; moved: boolean };

const uid = () => Math.random().toString(36).slice(2, 10);

export interface CurrentPlan {
  id: string;
  created_at: string;
  items: { id: string; title: string; recipe_id: string | null; made_at: string | null; for_kids: boolean; position: number; image_path: string | null }[];
}

export function PlanClient({ household, recipes, repeat, intro, current = null }: { household: HouseholdData; recipes: PlanRecipe[]; repeat: RepeatPlan | null; intro?: string; current?: CurrentPlan | null }) {
  const router = useRouter();
  const me = useMembership();
  const db = supabaseBrowser();
  const stores = household.stores.filter((s) => !s.archived);

  const [p, setP] = useState<PlannerDefaults>(() => ({ ...household.plannerDefaults, ...(repeat?.params ?? {}), storeIds: repeat?.store_ids?.length ? repeat.store_ids : household.plannerDefaults.storeIds }));
  const [useUp, setUseUp] = useState<string[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [moreKey, setMoreKey] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showIdeas, setShowIdeas] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  // New recipes from sites and quick ideas picked on this trip (not in our library yet).
  const [pickedDrafts, setPickedDrafts] = useState<PickedDraft[]>([]);
  const chosenCount = pinnedIds.length + pickedDrafts.length;
  const pickDraft = (d: PickedDraft) => setPickedDrafts((cur) => (cur.some((x) => x.key === d.key) ? cur : [...cur, d]));
  const unpickDraft = (key: string) => setPickedDrafts((cur) => cur.filter((x) => x.key !== key));
  const draftSlots = (): Slot[] =>
    pickedDrafts.map((d) => ({ key: uid(), recipeId: null, draft: d.draft, title: d.title, locked: true, reason: d.kind === "idea" ? "not cooked yet" : "new recipe", kid: null, skipIds: [] }));
  const [ai, setAi] = useState<{ enabled: boolean; requestsToday: number }>({ enabled: false, requestsToday: 0 });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [step, setStep] = useState<Step>("params");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ mode: "replace" | "add" | "pin"; index: number } | null>(null);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => Date.now());
  const [addingStore, setAddingStore] = useState(false);
  const [stock, setStock] = useState<Map<string, Amount>>(new Map());

  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const plannerRecipes: PlannerRecipe[] = useMemo(
    () => recipes.map((r) => ({ ...r, ingredientNames: r.recipe_ingredients.map((i) => i.name_norm) })),
    [recipes],
  );
  const portions = useMemo(() => portionsFor(household.people), [household.people]);
  const everyone = portions.everyone;
  const extra = p.makeExtra ? 1.5 : 1;

  useEffect(() => {
    fetch("/api/ai/plan").then((r) => r.json()).then(setAi).catch(() => {});
  }, []);

  // What's left from bulk packs / in the freezer: plan around it and use it first.
  useEffect(() => {
    db.from("bulk_stock")
      .select("name_norm, qty, unit")
      .then(({ data, error }) => {
        if (error || !data) return;
        const m = new Map<string, Amount>();
        for (const r of data as { name_norm: string; qty: number; unit: string | null }[]) {
          if (Number(r.qty) > 0) m.set(r.name_norm, { qty: Number(r.qty), unit: r.unit ?? "each" });
        }
        setStock(m);
        if (m.size) setUseUp((cur) => (cur.length ? cur : [...m.keys()].slice(0, 6)));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed slots from "Repeat this week" or the Claude bridge inbox.
  useEffect(() => {
    const initial: Slot[] = [];
    if (repeat) {
      for (const it of [...repeat.meal_plan_items].sort((a, b) => a.position - b.position)) {
        if (it.for_kids) continue;
        if (it.recipe_id && byId.has(it.recipe_id)) initial.push({ key: uid(), recipeId: it.recipe_id, draft: null, title: byId.get(it.recipe_id)!.title, locked: true, kid: null, skipIds: [] });
        else if (it.ai_recipe) initial.push({ key: uid(), recipeId: null, draft: it.ai_recipe, title: it.title, locked: true, kid: null, skipIds: [] });
      }
    }
    try {
      const inbox = JSON.parse(sessionStorage.getItem(PLAN_INBOX_KEY) ?? "[]") as RecipeDraft[];
      sessionStorage.removeItem(PLAN_INBOX_KEY);
      for (const d of inbox) initial.push({ key: uid(), recipeId: null, draft: d, title: d.title, locked: true, kid: null, skipIds: [] });
    } catch {
      /* ignore */
    }
    if (initial.length) {
      setSlots(assignKids(initial));
      setStep("plan");
      if (repeat) setNote(intro ?? "Previous week loaded. Review, then build the shopping list.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const params = (overrides: Partial<PlanParams> = {}): PlanParams => ({
    mealCount: Math.max(p.mealCount, pinnedIds.length),
    mealTypes: p.mealTypes,
    maxPrep: p.maxPrep,
    includeTags: p.includeTags,
    excludeTags: p.excludeTags,
    excludeIngredients: p.excludeIngredients,
    avoidTerms: household.avoidTerms,
    bonusTags: household.bonusTags,
    variety: p.variety,
    useUp,
    pinnedIds,
    kidMeals: p.kidMeals,
    familyNights: p.familyNights ?? 0,
    seed,
    ...overrides,
  });

  // Kid-friendly by tag, or a familiar, mild dinner (pasta, meatballs, tacos…): the whole family eats it.
  const isKidFriendly = (s: Slot) => {
    const r = s.recipeId ? byId.get(s.recipeId) : null;
    if (r) return r.kid_friendly || familyFriendly(r.title, r.recipe_ingredients.map((i) => i.name_norm));
    return s.draft?.kidFriendly ?? false;
  };

  /** Give each non-kid-friendly dinner a kids' favorite (keeps existing picks). */
  function assignKids(list: Slot[]): Slot[] {
    if (!p.kidMeals) return list.map((s) => ({ ...s, kid: null }));
    const order = pickKidMeals(plannerRecipes, plannerRecipes.filter((r) => r.is_kid_meal).map((r) => ({ ...r, kid_friendly: false })), params(), rng(seed));
    const pool = order.map((k) => ({ recipeId: k.recipeId, title: k.title }));
    if (!pool.length) return list.map((s) => ({ ...s, kid: null }));
    const used = new Map<string, number>();
    for (const s of list) if (s.kid) used.set(s.kid.recipeId, (used.get(s.kid.recipeId) ?? 0) + 1);
    return list.map((s) => {
      if (isKidFriendly(s)) return { ...s, kid: null };
      if (s.kid) return s;
      const next = [...pool].sort((a, b) => (used.get(a.recipeId) ?? 0) - (used.get(b.recipeId) ?? 0))[0];
      used.set(next.recipeId, (used.get(next.recipeId) ?? 0) + 1);
      return { ...s, kid: next };
    });
  }

  /** Use only the recipes tapped in the recommendations. */
  function useJustPicked() {
    const picked: Slot[] = pinnedIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((r) => ({ key: uid(), recipeId: r!.id, draft: null, title: r!.title, locked: true, reason: "picked", kid: null, skipIds: [] }));
    setSlots(assignKids([...picked, ...draftSlots()]));
    setNote(null);
    setSuggestions([]);
    setStep("plan");
  }

  async function planIt() {
    setNote(null);
    setSuggestions([]);
    const newSeed = Date.now();
    setSeed(newSeed);
    const drafts = draftSlots();
    const locked = [...slots.filter((s) => s.locked && !drafts.some((d) => d.title === s.title)), ...drafts];
    const lockedIds = locked.map((s) => s.recipeId).filter(Boolean) as string[];

    const res = planMeals(plannerRecipes, params({ seed: newSeed, mealCount: p.mealCount - locked.filter((s) => !s.recipeId).length, lockedIds }));
    const lockedById = new Map(locked.filter((s) => s.recipeId).map((s) => [s.recipeId!, s]));
    const next: Slot[] = [
      ...locked.filter((s) => !s.recipeId),
      ...res.meals.map((m) => lockedById.get(m.recipeId) ?? { key: uid(), recipeId: m.recipeId, draft: null, title: m.title, locked: m.pinned, reason: m.reason, kid: null, skipIds: [] }),
    ];
    setSlots(assignKids(next));
    setSuggestions(res.suggestions);
    setStep("plan");
  }

  async function swap(i: number) {
    const s = slots[i];
    const ids = slots.map((x) => x.recipeId ?? `draft-${x.key}`);
    const pick = swapMeal(plannerRecipes, ids, i, params(), s.skipIds);
    if (!pick) {
      setToast("No other recipes match. Try adjusting the filters.");
      return;
    }
    replaceSlot(i, { recipeId: pick.recipeId, draft: null, title: pick.title, reason: pick.reason });
  }

  function replaceSlot(i: number, patch: Partial<Slot>) {
    setSlots((cur) => {
      const old = cur[i];
      const next = [...cur];
      next[i] = { ...old, ...patch, kid: null, skipIds: old.recipeId ? [...old.skipIds, old.recipeId] : old.skipIds };
      return assignKids(next);
    });
  }

  function cycleKid(i: number) {
    const pool = plannerRecipes.filter((r) => r.is_kid_meal);
    if (!pool.length) return;
    setSlots((cur) => {
      const next = [...cur];
      const at = pool.findIndex((k) => k.id === next[i].kid?.recipeId);
      const k = pool[(at + 1) % pool.length];
      next[i] = { ...next[i], kid: { recipeId: k.id, title: k.title } };
      return next;
    });
  }

  // ----- list preview -----
  function mealsForList(): PlannedMealForList[] {
    const out: PlannedMealForList[] = [];
    for (const s of slots) {
      const kf = isKidFriendly(s);
      const servings = round((kf || !p.kidMeals ? everyone : portions.adults) * extra, 2);
      if (s.recipeId) {
        const r = byId.get(s.recipeId)!;
        out.push({ key: s.key, title: r.title, recipeId: r.id, baseServings: Number(r.servings), servings, ingredients: r.recipe_ingredients });
      } else if (s.draft) {
        out.push({
          key: s.key, title: s.draft.title, recipeId: null, baseServings: s.draft.servings, servings,
          ingredients: s.draft.ingredients.map((i) => ({ qty: i.qty, qty_max: i.qtyMax, unit: i.unit, name: i.name, name_norm: i.nameNorm, raw_text: i.raw, parsed_ok: i.ok })),
        });
      }
      if (s.kid) {
        const k = byId.get(s.kid.recipeId);
        if (k) out.push({ key: `${s.key}-kid`, title: `${k.title} (kids)`, recipeId: k.id, baseServings: Number(k.servings), servings: portions.kidsOnly, ingredients: k.recipe_ingredients });
      }
    }
    return out;
  }

  const orderedStoreIds = useMemo(() => stores.filter((s) => p.storeIds.includes(s.id)).map((s) => s.id), [stores, p.storeIds]);

  function computePreview(): PreviewItem[] {
    const ingredients = new Map<string, IngredientInfo>(household.ingredients.map((i) => [i.name_norm, i]));
    const items = buildShoppingList(mealsForList(), {
      selectedStoreIds: orderedStoreIds,
      stores,
      categories: household.categories,
      rules: household.rules,
      sections: household.sections,
      ingredients,
      synonyms: household.synonyms,
      stock,
    });
    return items.map((i) => ({ ...i, have: !!i.coveredByStock, moved: false }));
  }

  function buildPreview() {
    setPreview(computePreview());
    setStep("list");
  }

  function moveItem(key: string, storeId: string) {
    setPreview((cur) =>
      cur.map((i) => {
        if (i.key !== key) return i;
        const sec = household.sections.find((s) => s.store_id === storeId && s.id === i.sectionId)
          ?? household.sections.find((s) => s.store_id === storeId && s.name === household.sections.find((x) => x.id === i.sectionId)?.name)
          ?? household.sections.find((s) => s.store_id === storeId && s.name === "Other");
        const store = stores.find((s) => s.id === storeId);
        const info = household.ingredients.find((x) => x.name_norm === i.nameNorm);
        return { ...i, storeId, sectionId: sec?.id ?? null, moved: true, note: store?.is_bulk && info?.pack_size ? `Bulk pack: ${info.pack_size}` : null };
      }),
    );
  }

  async function sendToList(items: PreviewItem[] = preview) {
    setBusy("Sending to the list…");
    try {
      // 0. Anything from the previous plan not marked yet is assumed cooked
      //    (keeps "last made" right for the planner without tapping Made it).
      const { data: prev } = await db.from("meal_plans").select("id, meal_plan_items(id, made_at, for_kids)").order("created_at", { ascending: false }).limit(1).maybeSingle();
      for (const it of ((prev?.meal_plan_items ?? []) as { id: string; made_at: string | null }[]).filter((x) => !x.made_at)) {
        await db.rpc("mark_meal_made", { p_item_id: it.id, p_made: true });
      }
      // New recipes and ideas we're cooking this week join our recipes (so they
      // open in cook mode and count in history). Ideas keep their Idea tag.
      const weekSlots: Slot[] = [];
      for (const s of slots) {
        if (s.recipeId || !s.draft) {
          weekSlots.push(s);
          continue;
        }
        try {
          const id = await saveRecipe(db, me.householdId, s.draft);
          weekSlots.push({ ...s, recipeId: id });
        } catch {
          weekSlots.push(s); // already saved, or offline: keep it as a one-off
        }
      }

      // 1. Save the plan (history)
      const { data: plan, error: pe } = await db
        .from("meal_plans")
        .insert({ household_id: me.householdId, params: { ...p, useUp, everyone }, store_ids: orderedStoreIds, status: "final" })
        .select("id")
        .single();
      if (pe) throw pe;
      const planItems = weekSlots.flatMap((s, i) => {
        const kf = isKidFriendly(s);
        const rows = [{
          household_id: me.householdId, plan_id: plan.id, position: i * 2, recipe_id: s.recipeId, ai_recipe: s.recipeId ? null : s.draft,
          title: s.title, for_kids: false, servings: round((kf || !p.kidMeals ? everyone : portions.adults) * extra, 2),
        }];
        if (s.kid) rows.push({ household_id: me.householdId, plan_id: plan.id, position: i * 2 + 1, recipe_id: s.kid.recipeId, ai_recipe: null, title: s.kid.title, for_kids: true, servings: portions.kidsOnly });
        return rows;
      });
      if (planItems.length) await db.from("meal_plan_items").insert(planItems);

      // 2. Active list
      let { data: list } = await db.from("shopping_lists").select("id").eq("is_active", true).maybeSingle();
      if (!list) list = (await db.from("shopping_lists").insert({ household_id: me.householdId, is_active: true }).select("id").single()).data;
      await db.from("shopping_lists").update({ plan_id: plan.id }).eq("id", list!.id);
      const { data: existing } = await db.from("shopping_list_items").select("*").eq("list_id", list!.id).is("deleted_at", null).eq("checked", false);

      // 3. Merge into existing unchecked items (same item + store), else add
      const now = new Date().toISOString();
      const rows: ListItem[] = [];
      for (const it of items.filter((x) => !x.have)) {
        const match = (existing as ListItem[] | null)?.find((e) => e.name_norm === it.nameNorm && e.store_id === it.storeId);
        if (match) {
          const sum = addQty(match.qty, match.unit, it.qty, it.unit);
          rows.push({
            ...match,
            display_qty: sum ? formatAmount(sum.qty, sum.unit) : [match.display_qty, it.displayQty].filter(Boolean).join(" + ") || null,
            qty: sum?.qty ?? null,
            unit: sum?.unit ?? match.unit,
            source_meals: [...(match.source_meals ?? []), ...it.sourceMeals],
            client_updated_at: now,
          });
        } else {
          rows.push({
            id: crypto.randomUUID(), household_id: me.householdId, list_id: list!.id, name: it.name, name_norm: it.nameNorm, qty: it.qty, unit: it.unit,
            display_qty: it.displayQty || null, store_id: it.storeId, section_id: it.sectionId, checked: false, checked_by: null, added_by: me.initials,
            is_manual: false, note: it.note, source_meals: it.sourceMeals, deleted_at: null, client_updated_at: now,
          });
        }
      }
      if (rows.length) {
        const { error } = await db.from("shopping_list_items").upsert(rows, { onConflict: "id" });
        if (error) throw error;
      }

      // 4. Learn manual store moves; staples marked "out" are now on the list
      const learned = items.filter((x) => x.moved);
      if (learned.length) {
        await db.from("ingredients").upsert(
          learned.map((x) => ({ household_id: me.householdId, name_norm: x.nameNorm, learned_store_id: x.storeId, learned_section_id: x.sectionId })),
          { onConflict: "household_id,name_norm" },
        );
      }
      const outStaples = items.filter((x) => x.wasOut && !x.have).map((x) => x.nameNorm);
      if (outStaples.length) await db.from("ingredients").update({ is_out: false }).in("name_norm", outStaples);

      // 5. Stock: take out what the plan uses, add what new bulk packs leave over.
      try {
        const next = new Map(stock);
        const touched = new Set<string>();
        for (const it of items) {
          const cur = next.get(it.nameNorm);
          if (it.fromStock && cur && (!it.coveredByStock || it.have)) {
            const use = takeFromStock(it.fromStock, cur);
            if (use) {
              if (use.remaining) next.set(it.nameNorm, use.remaining);
              else next.delete(it.nameNorm);
              touched.add(it.nameNorm);
            }
          }
          if (!it.have && it.leftover) {
            next.set(it.nameNorm, addStock(next.get(it.nameNorm) ?? null, it.leftover));
            touched.add(it.nameNorm);
          }
        }
        const keep = [...touched].filter((n) => next.has(n));
        const gone = [...touched].filter((n) => !next.has(n));
        if (keep.length) {
          await db.from("bulk_stock").upsert(
            keep.map((n) => ({ household_id: me.householdId, name_norm: n, qty: next.get(n)!.qty, unit: next.get(n)!.unit, updated_at: now })),
            { onConflict: "household_id,name_norm" },
          );
        }
        if (gone.length) await db.from("bulk_stock").delete().in("name_norm", gone);
      } catch {
        /* stock is a convenience; never block the list */
      }

      window.dispatchEvent(new Event("cb:plan-sent")); // save this week's recipes for offline cooking
      router.push("/list");
    } catch (e) {
      setBusy(null);
      setToast(e instanceof Error ? e.message : "Couldn’t send to the list");
    }
  }

  /** Dinners and hands-on time carry over to next time. */
  async function rememberUsual() {
    const { data } = await db.from("household_settings").select("planner_defaults").eq("household_id", me.householdId).maybeSingle();
    const cur = (data?.planner_defaults ?? {}) as Record<string, unknown>;
    if (cur.mealCount === p.mealCount && cur.maxPrep === p.maxPrep) return;
    await db.from("household_settings").upsert({ household_id: me.householdId, planner_defaults: { ...cur, mealCount: p.mealCount, maxPrep: p.maxPrep } }, { onConflict: "household_id" });
  }


  const toggleIn = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  // ---------------------------------------------------------------- render
  return (
    <div>
      <header className="pt-safe px-5">
        <div className="flex h-11 items-center justify-between">
          {step !== "params" ? (
            <button className="text-[17px] text-accent" onClick={() => setStep(step === "list" ? "plan" : "params")}>‹ {step === "list" ? "Meals" : "Settings"}</button>
          ) : (
            <span />
          )}
          {step === "params" ? (
            <Link href="/history" className="text-[15px] text-accent">Past weeks</Link>
          ) : null}
        </div>
        <h1 className="large-title">{step === "params" ? (current?.items.length ? "This week" : "What’s for dinner?") : step === "plan" ? "Your week" : "Shopping list"}</h1>
        <p className="mt-1 text-[15px] text-muted">
          {step === "plan" && `${slots.length} meals · ${orderedStoreIds.map((id) => stores.find((s) => s.id === id)?.name).join(" + ")}`}
          {step === "list" && `${preview.filter((i) => !i.have).length} items · tick what you already have`}
        </p>
      </header>

      <div className="px-4">
        {step === "params" && current && current.items.length > 0 && <ThisWeek plan={current} />}
        {step === "params" && (
          <>
            {current && current.items.length > 0 && <h2 className="recipe-title mt-8 px-1 text-[24px] font-semibold">Plan next week</h2>}
            <h2 className="menu-label mt-6 mb-2 px-1 text-muted">1 · Where are you going?</h2>
            <StorePicker stores={stores} selected={p.storeIds} onToggle={(id) => setP({ ...p, storeIds: toggleIn(p.storeIds, id) })} onAdd={() => setAddingStore(true)} />

            {p.storeIds.length > 0 && (
            <>
            <h2 className="menu-label mt-8 mb-2 px-1 text-muted">2 · Pick your dinners</h2>
            <button onClick={() => setOptionsOpen(true)} className="card flex min-h-[52px] w-full items-center gap-2 px-4 py-2 text-left active:bg-soft">
              <span className="min-w-0 flex-1 truncate text-[15px]">
                {[`${p.mealCount} dinners`, p.maxPrep ? `${p.maxPrep} min` : "Any time", useUp.length ? `Have ${useUp.join(", ")}` : null].filter(Boolean).join(" · ")}
              </span>
              <span className="text-[15px] text-accent">Change</span>
            </button>

            <Recommend
              have={useUp}
              recipes={recipes}
              household={household}
              storeIds={orderedStoreIds}
              mealTypes={p.mealTypes}
              maxPrep={p.maxPrep}
              picked={pinnedIds}
              onToggle={(id) => setPinnedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
            />

            <section className="mt-6">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setShowNew(true)} className={cx("card h-14 text-[16px] font-semibold", showNew ? "text-muted" : "text-accent")} disabled={showNew}>Find new recipes</button>
                {ai.enabled && <button onClick={() => setShowIdeas(true)} className={cx("card h-14 text-[16px] font-semibold", showIdeas ? "text-muted" : "text-accent")} disabled={showIdeas}>Quick ideas</button>}
              </div>
              {showNew && <NewRecipes bare storeNames={orderedStoreIds.map((id) => stores.find((x) => x.id === id)?.name ?? "")} maxPrep={p.maxPrep} picked={pickedDrafts.map((d) => d.key)} onPick={pickDraft} onUnpick={unpickDraft} />}
              {showIdeas && ai.enabled && (
                <QuickIdeas
                  bare
                  request={{ mealTypes: p.mealTypes, maxPrep: p.maxPrep, includeTags: [], excludeTags: p.excludeTags, excludeIngredients: p.excludeIngredients, useUp, variety: p.variety, storeIds: p.storeIds }}
                  storeNames={orderedStoreIds.map((id) => stores.find((x) => x.id === id)?.name ?? "")}
                  picked={pickedDrafts.map((d) => d.key)}
                  onPick={pickDraft}
                  onUnpick={unpickDraft}
                />
              )}
            </section>
            </>
            )}

            {!chosenCount && p.storeIds.length > 0 && (
              <Button size="lg" className="mt-8 w-full" disabled={!p.storeIds.length || !!busy} onClick={() => planIt()}>
                {busy ?? `Plan ${p.mealCount} ${p.mealTypes.length === 1 && p.mealTypes[0] === "dinner" ? "dinners" : "meals"} for me`}
              </Button>
            )}

            {!p.storeIds.length && <p className="mt-2 text-center text-[13px] text-muted">Pick at least one store.</p>}
            {chosenCount > 0 && (
              <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+64px)] z-30 px-4">
                <div className="card mx-auto max-w-xl p-3 shadow-xl">
                  <p className="px-1 pb-2 text-[14px]">
                    <span className="font-semibold">{chosenCount} of {Math.max(p.mealCount, chosenCount)} dinners chosen.</span>{" "}
                    <span className="text-muted">{chosenCount < p.mealCount ? "Pick more, or let the app fill the rest." : "Ready to plan."}</span>
                  </p>
                  <div className="flex gap-2">
                    {chosenCount < p.mealCount ? (
                      <>
                        <Button variant="secondary" className="flex-1 whitespace-nowrap" disabled={!!busy} onClick={useJustPicked}>
                          Plan just {chosenCount === 1 ? "this one" : `these ${chosenCount}`}
                        </Button>
                        <Button className="flex-1 whitespace-nowrap" disabled={!!busy || !p.storeIds.length} onClick={() => planIt()}>
                          {busy ?? `Choose ${p.mealCount - chosenCount} more`}
                        </Button>
                      </>
                    ) : (
                      <Button className="flex-1" disabled={!!busy} onClick={useJustPicked}>Continue</Button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {chosenCount > 0 && <div className="h-36" />}
          </>
        )}

        {step === "plan" && (
          <>
            {note && <p className="card mt-4 p-3 text-[14px] text-warn">{note}</p>}
            {suggestions.length > 0 && (
              <div className="card mt-4 p-4 text-[14px]">
                <p className="font-semibold">Not enough matches</p>
                <ul className="mt-1 list-disc pl-5 text-muted">{suggestions.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            )}
            <DayList
              ids={slots.map((s) => s.key)}
              onReorder={(keys) => setSlots(keys.map((k) => slots.find((s) => s.key === k)!))}
              render={(key, i, handle) => {
                const s = slots.find((x) => x.key === key)!;
                const r = s.recipeId ? byId.get(s.recipeId) : null;
                const prep = r?.prep_min ?? s.draft?.prepMin;
                const photo = r?.image_path ?? s.draft?.imageUrl ?? null;
                const title = (
                  <>
                    {s.title}
                    {s.locked && <IconLock className="ml-1.5 inline align-baseline text-[14px] opacity-70" aria-label="Locked" />}
                  </>
                );
                return (
                  <div className="card overflow-hidden">
                    {photo ? (
                      // The photo leads; day and dish sit on it, like a magazine spread.
                      <div className="relative aspect-[16/10] bg-soft">
                        <RecipeImage src={photo} title={s.title} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                        <span className="absolute top-1.5 right-1.5 grid h-11 w-11 place-items-center rounded-full bg-black/25 text-white backdrop-blur [&_button]:text-white">{handle}</span>
                        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                          <p className="menu-label opacity-90">{dayLabel(i)}{(s.draft && !s.recipeId) || (r && isIdea(r)) ? " · Idea" : ""}</p>
                          <p className="recipe-title mt-0.5 text-[22px] leading-tight font-semibold">{title}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3 px-4 pt-4">
                        <div>
                          <p className={cx("menu-label", i === 0 ? "text-accent" : "text-muted")}>{dayLabel(i)}{(s.draft && !s.recipeId) || (r && isIdea(r)) ? " · Idea" : ""}</p>
                          <p className="recipe-title mt-0.5 text-[22px] leading-tight font-semibold">{title}</p>
                        </div>
                        <span className="-mt-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center">{handle}</span>
                      </div>
                    )}
                    <div className="px-4 pt-2.5">
                      {s.kid ? (
                        <button onClick={() => cycleKid(i)} className="text-left text-[15px]">
                          <span className="text-muted">Kids:</span> {s.kid.title} <span className="text-accent">↻</span>
                        </button>
                      ) : (
                        isKidFriendly(s) && <p className="text-[15px] font-semibold text-ok">Family dinner</p>
                      )}
                      <p className="mt-0.5 text-[13px] text-muted">
                        {[prep != null && `${prep} min`, s.draft && !s.recipeId ? "not cooked yet" : s.reason].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="mt-1 flex px-2 pb-1 text-[15px]">
                      <button className="h-11 px-2 text-accent disabled:opacity-40" onClick={() => swap(i)} disabled={s.locked || !!busy}>Swap</button>
                      <button className="h-11 px-2 text-accent" onClick={() => setPicker({ mode: "replace", index: i })}>Change</button>
                      {moreKey === s.key ? (
                        <>
                          <button className="h-11 px-2 text-muted" aria-pressed={s.locked} onClick={() => { setSlots(slots.map((x, j) => (j === i ? { ...x, locked: !x.locked } : x))); setMoreKey(null); }}>{s.locked ? "Unlock" : "Lock"}</button>
                          <button className="h-11 px-2 text-[#d23c3c]" onClick={() => { setSlots(slots.filter((_, j) => j !== i)); setMoreKey(null); }}>Remove</button>
                        </>
                      ) : (
                        <button className="ml-auto h-11 px-3 text-[20px] leading-none text-muted" onClick={() => setMoreKey(s.key)} aria-label={`More for ${s.title}`}>⋯</button>
                      )}
                    </div>
                  </div>
                );
              }}
            />
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setPicker({ mode: "add", index: -1 })}><IconPlus /> Add meal</Button>
              <Button variant="secondary" className="flex-1" onClick={planIt} disabled={!!busy}><IconSwap /> Re-plan</Button>
            </div>
            <Button size="lg" className="mt-4 w-full" onClick={() => sendToList(computePreview())} disabled={!slots.length || !!busy}>{busy ?? "Send to shopping list"}</Button>
            <button className="mt-1 h-11 w-full text-[15px] text-accent disabled:opacity-40" onClick={buildPreview} disabled={!slots.length || !!busy}>Review the list first</button>
          </>
        )}

        {step === "list" && (
          <>
            {[...orderedStoreIds, ...new Set(preview.map((x) => x.storeId).filter((id): id is string => !!id && !orderedStoreIds.includes(id)))].map((sid) => {
              const items = preview.filter((x) => x.storeId === sid);
              if (!items.length) return null;
              return (
                <section key={sid} className="card mt-4 overflow-hidden">
                  <h2 className="flex items-center gap-3 px-4 pt-4 pb-1 text-[20px] font-bold"><StoreBadge name={stores.find((s) => s.id === sid)?.name ?? ""} size={32} />{stores.find((s) => s.id === sid)?.name}</h2>
                  <ul>
                    {items.map((it) => (
                      <PreviewRow key={it.key} item={it} storeIds={orderedStoreIds} stores={stores} onHave={(v) => setPreview(preview.map((x) => (x.key === it.key ? { ...x, have: v } : x)))} onMove={(st) => moveItem(it.key, st)} />
                    ))}
                  </ul>
                </section>
              );
            })}
            
            <Button size="lg" className="mt-4 w-full" onClick={() => sendToList()} disabled={!!busy}>{busy ?? `Send ${preview.filter((i) => !i.have).length} items to the list`}</Button>
          </>
        )}
      </div>

      {picker && (
        <RecipePicker
          recipes={recipes.filter((r) => !r.is_kid_meal)}
          onClose={() => setPicker(null)}
          onPick={(r) => {
            if (picker.mode === "pin") setPinnedIds([...new Set([...pinnedIds, r.id])]);
            else if (picker.mode === "add") setSlots(assignKids([...slots, { key: uid(), recipeId: r.id, draft: null, title: r.title, locked: true, reason: "picked", kid: null, skipIds: [] }]));
            else replaceSlot(picker.index, { recipeId: r.id, draft: null, title: r.title, reason: "picked", locked: true });
            setPicker(null);
          }}
        />
      )}
      {addingStore && (
        <AddStoreSheet
          householdId={me.householdId}
          onClose={() => setAddingStore(false)}
          onAdded={(id) => {
            setAddingStore(false);
            setP((cur) => ({ ...cur, storeIds: [...cur.storeIds, id] }));
            setToast("Store added. Fine-tune it in Settings → Store rules.");
            router.refresh();
          }}
        />
      )}
      <Sheet open={optionsOpen} onClose={() => { setOptionsOpen(false); rememberUsual(); }} title="Options">
        <div className="card divide-y divide-line">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[17px]">Dinners</span>
            <Stepper value={p.mealCount} min={1} max={14} onChange={(v) => setP({ ...p, mealCount: v })} label="Number of dinners" />
          </div>
          <div className="px-4 py-3">
            <span className="mb-2 block text-[15px] text-muted">Hands-on time</span>
            <Segmented value={p.maxPrep} onChange={(v) => setP({ ...p, maxPrep: v })} options={[{ value: 15, label: "15 min" }, { value: 30, label: "30 min" }, { value: 45, label: "45 min" }, { value: null, label: "Any" }]} />
          </div>
          <div className="px-4 py-3">
            <span className="block text-[15px] text-muted">I have</span>
            <FreeChips values={useUp} onChange={setUseUp} placeholder="Ingredient" />
          </div>
        </div>
        <Button size="lg" className="mt-4 w-full" onClick={() => { setOptionsOpen(false); rememberUsual(); }}>Done</Button>
      </Sheet>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function PreviewRow({ item, storeIds, stores, onHave, onMove }: { item: PreviewItem; storeIds: string[]; stores: { id: string; name: string }[]; onHave: (v: boolean) => void; onMove: (storeId: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t hairline first:border-t-0">
      <div className="flex min-h-[56px] items-center gap-3 px-4 py-2">
        <button onClick={() => onHave(!item.have)} className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full border-2", item.have ? "border-ok bg-ok text-white" : "border-line")} aria-label="Already have it">
          {item.have && <IconCheck strokeWidth={3} />}
        </button>
        <div className={cx("min-w-0 flex-1", item.have && "opacity-40")}>
          <p className="text-[16px]">
            {item.name} <span className="text-[14px] text-muted">{item.displayQty}</span>
            
          </p>
          <p className="truncate text-[12px] text-muted">{[item.note, item.wasOut && "we’re out", `for ${item.sourceMeals.map((m) => m.title).join(", ")}`].filter(Boolean).join(" · ")}</p>
        </div>
        {storeIds.length > 1 && (
          <button onClick={() => setOpen(!open)} className="shrink-0 rounded-full bg-soft px-2.5 py-1 text-[12px] text-muted">Move</button>
        )}
      </div>
      {open && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {storeIds.map((id) => (
            <Chip key={id} active={item.storeId === id} onClick={() => { onMove(id); setOpen(false); }}>{stores.find((s) => s.id === id)?.name}</Chip>
          ))}
        </div>
      )}
    </li>
  );
}

function FreeChips({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState("");
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); const parts = text.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean); if (parts.length) onChange([...new Set([...values, ...parts])]); setText(""); }}>
        <TextField value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} enterKeyHint="done" />
      </form>
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((v) => <Chip key={v} active onClick={() => onChange(values.filter((x) => x !== v))}>{v} ✕</Chip>)}
        </div>
      )}
    </div>
  );
}

function RecipePicker({ recipes, onPick, onClose }: { recipes: PlanRecipe[]; onPick: (r: PlanRecipe) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const shown = recipes.filter((r) => r.title.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.title.localeCompare(b.title));
  return (
    <Sheet open onClose={onClose} title="Pick a recipe">
      <TextField value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes" autoFocus />
      <ul className="card mt-3 divide-y divide-line overflow-hidden">
        {shown.slice(0, 80).map((r) => (
          <li key={r.id}>
            <button className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left" onClick={() => onPick(r)}>
              <span className="recipe-title flex-1 text-[16px]">{r.title}</span>
              <span className="text-[12px] text-muted">{r.prep_min ? `${r.prep_min}m` : ""}</span>
            </button>
          </li>
        ))}
        {!shown.length && <li className="px-4 py-4 text-muted">No matches</li>}
      </ul>
    </Sheet>
  );
}

/** "Tonight", "Tomorrow", then weekday names. */
function dayLabel(i: number): string {
  if (i === 0) return "Tonight";
  if (i === 1) return "Tomorrow";
  const d = new Date();
  d.setDate(d.getDate() + i);
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

/** The week we already planned: dinners in order, with what's been made. */
function ThisWeek({ plan }: { plan: CurrentPlan }) {
  const dinners = plan.items.filter((i) => !i.for_kids).sort((a, b) => a.position - b.position);
  const kids = new Map(plan.items.filter((i) => i.for_kids).map((i) => [i.position - 1, i.title]));
  const madeCount = dinners.filter((d) => d.made_at).length;
  return (
    <section className="mt-2">
      <p className="px-1 text-[15px] text-muted">
        {madeCount ? `${madeCount} of ${dinners.length} made` : `${dinners.length} ${dinners.length === 1 ? "dinner" : "dinners"} planned`} · {new Date(plan.created_at).toLocaleDateString(undefined, { weekday: "long" })}’s plan
      </p>
      <ul className="card mt-3 divide-y divide-line overflow-hidden">
        {dinners.map((d) => (
          <li key={d.id}>
            <Link href={d.recipe_id ? `/recipes/${d.recipe_id}` : "/list"} className="flex items-center gap-3 px-3 py-2.5 active:bg-soft">
              <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                <RecipeImage src={d.image_path} title={d.title} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("recipe-title block text-[17px] leading-snug font-semibold", d.made_at && "text-muted")}>{d.title}</span>
                {kids.get(d.position) && <span className="block truncate text-[13px] text-muted">Kids: {kids.get(d.position)}</span>}
              </span>
              {d.made_at ? <span className="shrink-0 text-[13px] font-semibold text-ok">Made ✓</span> : <IconChevron className="shrink-0 text-muted" />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
