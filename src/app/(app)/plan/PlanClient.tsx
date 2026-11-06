"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Section, Segmented, Sheet, Stepper, TextField, Toast, Toggle, cx } from "@/components/ui";
import { IconCheck, IconLock, IconSearch, IconSparkle, IconSwap, IconUnlock, IconX, IconPlus, IconClock } from "@/components/icons";
import { useMembership } from "@/components/AppShell";
import { RecipeImage } from "@/components/RecipeImage";
import { planMeals, pickKidMeals, rng, swapMeal, type PlannerRecipe, type PlanParams } from "@/lib/planner/planner";
import { buildShoppingList, portionsFor, type DraftListItem, type PlannedMealForList } from "@/lib/list/buildList";
import { supabaseBrowser } from "@/lib/supabase/client";
import { saveRecipe } from "@/lib/data/recipes";
import { PLAN_INBOX_KEY } from "@/lib/planInbox";
import { addQty, formatAmount, round } from "@/lib/units";
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

export function PlanClient({ household, recipes, repeat }: { household: HouseholdData; recipes: PlanRecipe[]; repeat: RepeatPlan | null }) {
  const router = useRouter();
  const me = useMembership();
  const db = supabaseBrowser();
  const stores = household.stores.filter((s) => !s.archived);

  const [p, setP] = useState<PlannerDefaults>(() => ({ ...household.plannerDefaults, ...(repeat?.params ?? {}), storeIds: repeat?.store_ids?.length ? repeat.store_ids : household.plannerDefaults.storeIds }));
  const [useUp, setUseUp] = useState<string[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [servingsOverride, setServingsOverride] = useState<number | null>(null);
  const [useAi, setUseAi] = useState(false);
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

  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const plannerRecipes: PlannerRecipe[] = useMemo(
    () => recipes.map((r) => ({ ...r, ingredientNames: r.recipe_ingredients.map((i) => i.name_norm) })),
    [recipes],
  );
  const allTags = useMemo(() => [...new Set(recipes.filter((r) => !r.is_kid_meal).flatMap((r) => r.tags))].sort(), [recipes]);
  const portions = useMemo(() => portionsFor(household.people), [household.people]);
  const everyone = servingsOverride ?? portions.everyone;
  const extra = p.makeExtra ? 1.5 : 1;

  useEffect(() => {
    fetch("/api/ai/plan").then((r) => r.json()).then(setAi).catch(() => {});
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
      if (repeat) setNote("Loaded last time’s meals — swap or send to the list.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const params = (overrides: Partial<PlanParams> = {}): PlanParams => ({
    mealCount: p.mealCount,
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
    seed,
    ...overrides,
  });

  const isKidFriendly = (s: Slot) => (s.recipeId ? byId.get(s.recipeId)?.kid_friendly : s.draft?.kidFriendly) ?? false;

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

  async function planIt() {
    setNote(null);
    setSuggestions([]);
    const newSeed = Date.now();
    setSeed(newSeed);
    const locked = slots.filter((s) => s.locked);
    const lockedIds = locked.map((s) => s.recipeId).filter(Boolean) as string[];
    const freeCount = Math.max(0, p.mealCount - locked.length);

    if (useAi && ai.enabled && freeCount > 0) {
      setBusy("Asking Gemini…");
      try {
        const res = await fetch("/api/ai/plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mealCount: freeCount, favoritesPct: p.aiFavoritesPct, mealTypes: p.mealTypes, maxPrep: p.maxPrep, includeTags: p.includeTags,
            excludeTags: p.excludeTags, excludeIngredients: p.excludeIngredients, useUp, variety: p.variety, storeIds: p.storeIds, pinnedIds,
          }),
        }).then((r) => r.json());
        if (res.requestsToday) setAi((a) => ({ ...a, requestsToday: res.requestsToday }));
        if (res.ok) {
          const fresh: Slot[] = res.meals
            .filter((m: { recipeId?: string }) => !m.recipeId || !lockedIds.includes(m.recipeId))
            .map((m: { recipeId?: string; draft?: RecipeDraft; title: string }) => ({
              key: uid(), recipeId: m.recipeId ?? null, draft: m.draft ?? null, title: m.title, locked: false, kid: null, skipIds: [],
              reason: m.draft ? "new idea" : "favorite",
            }));
          setSlots(assignKids([...locked, ...fresh]));
          setStep("plan");
          setBusy(null);
          return;
        }
        setNote(`${res.error ?? "AI unavailable"} — used the built-in planner instead.`);
      } catch {
        setNote("Couldn’t reach the AI — used the built-in planner instead.");
      }
      setBusy(null);
    } else if (useAi && !ai.enabled) {
      setNote("No AI key is set up — used the built-in planner.");
    }

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
    if (useAi && ai.enabled) {
      setBusy("Asking Gemini for another idea…");
      try {
        const res = await fetch("/api/ai/swap", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mealCount: 1, favoritesPct: p.aiFavoritesPct, mealTypes: p.mealTypes, maxPrep: p.maxPrep, includeTags: [], excludeTags: p.excludeTags,
            excludeIngredients: p.excludeIngredients, useUp, variety: p.variety, storeIds: p.storeIds, pinnedIds: [],
            keepTitles: slots.filter((_, j) => j !== i).map((x) => x.title), replacing: s.title,
          }),
        }).then((r) => r.json());
        if (res.requestsToday) setAi((a) => ({ ...a, requestsToday: res.requestsToday }));
        setBusy(null);
        if (res.ok) {
          replaceSlot(i, { recipeId: res.meal.recipeId ?? null, draft: res.meal.draft ?? null, title: res.meal.title, reason: res.meal.draft ? "new idea" : "favorite" });
          return;
        }
        setToast("AI swap failed — picked a favorite instead");
      } catch {
        setBusy(null);
      }
    }
    const pick = swapMeal(plannerRecipes, ids, i, params(), s.skipIds);
    if (!pick) {
      setToast("No other favorites fit — try relaxing a filter");
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

  function buildPreview() {
    const ingredients = new Map<string, IngredientInfo>(household.ingredients.map((i) => [i.name_norm, i]));
    const items = buildShoppingList(mealsForList(), {
      selectedStoreIds: orderedStoreIds,
      stores,
      categories: household.categories,
      rules: household.rules,
      sections: household.sections,
      ingredients,
      synonyms: household.synonyms,
    });
    setPreview(items.map((i) => ({ ...i, have: false, moved: false })));
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
        return { ...i, storeId, sectionId: sec?.id ?? null, moved: true, note: store?.is_bulk ? (info?.pack_size ? `Bulk pack: ${info.pack_size}` : "Bulk pack") : null };
      }),
    );
  }

  async function sendToList() {
    setBusy("Sending to the list…");
    try {
      // 1. Save the plan (history)
      const { data: plan, error: pe } = await db
        .from("meal_plans")
        .insert({ household_id: me.householdId, params: { ...p, useUp, everyone, ai: useAi }, store_ids: orderedStoreIds, status: "final" })
        .select("id")
        .single();
      if (pe) throw pe;
      const planItems = slots.flatMap((s, i) => {
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
      for (const it of preview.filter((x) => !x.have)) {
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
      const learned = preview.filter((x) => x.moved);
      if (learned.length) {
        await db.from("ingredients").upsert(
          learned.map((x) => ({ household_id: me.householdId, name_norm: x.nameNorm, learned_store_id: x.storeId, learned_section_id: x.sectionId })),
          { onConflict: "household_id,name_norm" },
        );
      }
      const outStaples = preview.filter((x) => x.wasOut && !x.have).map((x) => x.nameNorm);
      if (outStaples.length) await db.from("ingredients").update({ is_out: false }).in("name_norm", outStaples);

      router.push("/list");
    } catch (e) {
      setBusy(null);
      setToast(e instanceof Error ? e.message : "Couldn’t send to the list");
    }
  }

  async function saveDefaults() {
    await db.from("household_settings").upsert({ household_id: me.householdId, planner_defaults: p }, { onConflict: "household_id" });
    setToast("Saved as default");
  }

  async function saveDraftToFavorites(i: number) {
    const s = slots[i];
    if (!s.draft) return;
    try {
      const id = await saveRecipe(db, me.householdId, s.draft);
      setSlots((cur) => cur.map((x, j) => (j === i ? { ...x, recipeId: id, reason: "saved to recipes" } : x)));
      setToast(`Saved “${s.title}” to recipes`);
      router.refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Couldn’t save");
    }
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
          {ai.enabled && <span className="text-[12px] text-muted">AI requests today: {ai.requestsToday}</span>}
        </div>
        <h1 className="large-title">{step === "params" ? "Plan a trip" : step === "plan" ? "This week" : "Shopping list"}</h1>
        <p className="mt-1 text-[15px] text-muted">
          {step === "params" && "Pick stores and constraints, then plan."}
          {step === "plan" && `${slots.length} meals · ${orderedStoreIds.map((id) => stores.find((s) => s.id === id)?.name).join(" + ")}`}
          {step === "list" && `${preview.filter((i) => !i.have).length} items · tick what you already have`}
        </p>
      </header>

      <div className="px-4">
        {step === "params" && (
          <>
            <Section title="Stores">
              <div className="flex flex-wrap gap-2">
                {stores.map((s) => (
                  <Chip key={s.id} active={p.storeIds.includes(s.id)} onClick={() => setP({ ...p, storeIds: toggleIn(p.storeIds, s.id) })}>{s.name}</Chip>
                ))}
              </div>
            </Section>

            <div className="card mt-6 divide-y divide-line">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-[17px]">Meals</span>
                <Stepper value={p.mealCount} min={1} max={14} onChange={(v) => setP({ ...p, mealCount: v })} />
              </div>
              <div className="px-4 py-3">
                <div className="flex gap-2">
                  {(["dinner", "lunch", "breakfast"] as MealType[]).map((m) => (
                    <Chip key={m} active={p.mealTypes.includes(m)} onClick={() => setP({ ...p, mealTypes: toggleIn(p.mealTypes, m).length ? toggleIn(p.mealTypes, m) : p.mealTypes })}>
                      {m[0].toUpperCase() + m.slice(1)}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span>
                  <span className="block text-[17px]">Portions per meal</span>
                  <span className="block text-[13px] text-muted">{portions.adults} adults + {portions.kids} kids{servingsOverride == null ? " (auto)" : ""}</span>
                </span>
                <Stepper value={everyone} min={1} max={12} step={0.5} onChange={setServingsOverride} />
              </div>
              <label className="flex items-center justify-between px-4 py-3">
                <span className="text-[17px]">Make extra for leftovers</span>
                <Toggle checked={p.makeExtra} onChange={(v) => setP({ ...p, makeExtra: v })} />
              </label>
              <label className="flex items-center justify-between px-4 py-3">
                <span>
                  <span className="block text-[17px]">Kids’ meals</span>
                  <span className="block text-[13px] text-muted">Add a kids’ favorite when they won’t eat dinner</span>
                </span>
                <Toggle checked={p.kidMeals} onChange={(v) => setP({ ...p, kidMeals: v })} />
              </label>
            </div>

            <Section title="Max active prep">
              <Segmented value={p.maxPrep} onChange={(v) => setP({ ...p, maxPrep: v })} options={[{ value: 15, label: "15" }, { value: 30, label: "30" }, { value: 45, label: "45" }, { value: null, label: "60+" }]} />
            </Section>

            <Section title="Must include">
              <TagPicker tags={allTags} selected={p.includeTags} onChange={(v) => setP({ ...p, includeTags: v })} />
            </Section>
            <Section title="Exclude tags">
              <TagPicker tags={allTags} selected={p.excludeTags} onChange={(v) => setP({ ...p, excludeTags: v })} />
            </Section>
            <Section title="Exclude ingredients">
              <FreeChips values={p.excludeIngredients} onChange={(v) => setP({ ...p, excludeIngredients: v })} placeholder="e.g. mushrooms" />
              {household.avoidTerms.length > 0 && <p className="mt-2 px-1 text-[13px] text-muted">Always avoided: {household.avoidTerms.join(", ")}</p>}
            </Section>
            <Section title="Use up what we have">
              <FreeChips values={useUp} onChange={setUseUp} placeholder="e.g. spinach, feta" />
            </Section>
            <Section title="Pinned meals" action={<button className="text-[15px] text-accent" onClick={() => setPicker({ mode: "pin", index: -1 })}>Add</button>}>
              <div className="flex flex-wrap gap-2">
                {pinnedIds.map((id) => (
                  <Chip key={id} active onClick={() => setPinnedIds(pinnedIds.filter((x) => x !== id))}>{byId.get(id)?.title} ✕</Chip>
                ))}
                {!pinnedIds.length && <span className="px-1 text-[14px] text-muted">None</span>}
              </div>
            </Section>

            <div className="card mt-6 divide-y divide-line">
              <label className="flex items-center justify-between px-4 py-3">
                <span>
                  <span className="block text-[17px]">Variety</span>
                  <span className="block text-[13px] text-muted">No repeated protein, at most one soup</span>
                </span>
                <Toggle checked={p.variety} onChange={(v) => setP({ ...p, variety: v })} />
              </label>
              <label className="flex items-center justify-between px-4 py-3">
                <span>
                  <span className="flex items-center gap-1.5 text-[17px]"><IconSparkle className="text-accent" /> Plan with AI</span>
                  <span className="block text-[13px] text-muted">{ai.enabled ? "Gemini mixes favorites with new ideas" : "Add a Gemini key to enable"}</span>
                </span>
                <Toggle checked={useAi} onChange={setUseAi} />
              </label>
              {useAi && (
                <div className="px-4 py-3">
                  <div className="mb-1 flex justify-between text-[14px]"><span>Favorites</span><span className="text-muted">{p.aiFavoritesPct}% · {100 - p.aiFavoritesPct}% new</span></div>
                  <input type="range" min={0} max={100} step={10} value={p.aiFavoritesPct} onChange={(e) => setP({ ...p, aiFavoritesPct: +e.target.value })} className="w-full accent-[var(--accent)]" />
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-2">
              <Button variant="secondary" onClick={saveDefaults}>Save as default</Button>
              <Button size="lg" className="flex-1" disabled={!p.storeIds.length || !!busy} onClick={planIt}>
                {busy ?? "Plan it"}
              </Button>
            </div>
            {!p.storeIds.length && <p className="mt-2 text-center text-[13px] text-muted">Pick at least one store.</p>}
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
            <ul className="mt-4 space-y-3">
              {slots.map((s, i) => {
                const r = s.recipeId ? byId.get(s.recipeId) : null;
                return (
                  <li key={s.key} className="card overflow-hidden">
                    <div className="flex gap-3 p-3">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-soft">
                        {s.draft && !r ? (
                          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-accent-soft to-soft text-2xl text-accent"><IconSparkle /></div>
                        ) : (
                          <RecipeImage src={r?.image_path} title={s.title} placeholderText={false} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="recipe-title text-[17px] leading-snug font-semibold">{s.title}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted">
                          {(r?.prep_min ?? s.draft?.prepMin) != null && <><IconClock /> {r?.prep_min ?? s.draft?.prepMin} min · </>}
                          {s.draft && !s.recipeId ? "new idea" : s.reason}
                        </p>
                        {s.kid && (
                          <button onClick={() => cycleKid(i)} className="mt-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-[12px] font-semibold text-accent">
                            Kids: {s.kid.title} ↻
                          </button>
                        )}
                        {!s.kid && isKidFriendly(s) && <p className="mt-1.5 text-[12px] font-semibold text-ok">Kids eat this too</p>}
                      </div>
                    </div>
                    <div className="flex border-t hairline text-[14px] font-medium">
                      <SlotAction onClick={() => swap(i)} disabled={s.locked || !!busy}><IconSwap /> Swap</SlotAction>
                      <SlotAction onClick={() => setSlots(slots.map((x, j) => (j === i ? { ...x, locked: !x.locked } : x)))} active={s.locked}>
                        {s.locked ? <IconLock /> : <IconUnlock />} {s.locked ? "Locked" : "Lock"}
                      </SlotAction>
                      <SlotAction onClick={() => setPicker({ mode: "replace", index: i })}><IconSearch /> Pick</SlotAction>
                      <SlotAction onClick={() => setSlots(slots.filter((_, j) => j !== i))}><IconX /> Remove</SlotAction>
                    </div>
                    {s.draft && !s.recipeId && (
                      <button onClick={() => saveDraftToFavorites(i)} className="w-full border-t hairline py-2.5 text-[14px] font-semibold text-accent">Save to recipes</button>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setPicker({ mode: "add", index: -1 })}><IconPlus /> Add meal</Button>
              <Button variant="secondary" className="flex-1" onClick={planIt} disabled={!!busy}><IconSwap /> Re-plan</Button>
            </div>
            <Button size="lg" className="mt-4 w-full" onClick={buildPreview} disabled={!slots.length || !!busy}>{busy ?? "Build shopping list"}</Button>
          </>
        )}

        {step === "list" && (
          <>
            {orderedStoreIds.map((sid) => {
              const items = preview.filter((x) => x.storeId === sid);
              if (!items.length) return null;
              return (
                <section key={sid} className="card mt-4 overflow-hidden">
                  <h2 className="px-4 pt-4 pb-1 text-[20px] font-bold">{stores.find((s) => s.id === sid)?.name}</h2>
                  <ul>
                    {items.map((it) => (
                      <PreviewRow key={it.key} item={it} storeIds={orderedStoreIds} stores={stores} onHave={(v) => setPreview(preview.map((x) => (x.key === it.key ? { ...x, have: v } : x)))} onMove={(st) => moveItem(it.key, st)} />
                    ))}
                  </ul>
                </section>
              );
            })}
            <p className="mt-3 px-1 text-[13px] text-muted">Tap ✓ for things you already have. Tap a store name to move an item — we’ll remember it.</p>
            <Button size="lg" className="mt-4 w-full" onClick={sendToList} disabled={!!busy}>{busy ?? `Send ${preview.filter((i) => !i.have).length} items to the list`}</Button>
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
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function SlotAction({ children, onClick, disabled, active }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={cx("flex h-11 flex-1 items-center justify-center gap-1 disabled:opacity-35", active ? "text-accent" : "text-muted")}>
      {children}
    </button>
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
            {item.unknown && <span className="ml-1.5 rounded bg-soft px-1.5 text-[11px] text-muted">new item</span>}
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

function TagPicker({ tags, selected, onChange }: { tags: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [extra, setExtra] = useState("");
  const all = [...new Set([...selected, ...tags, "soup", "vegetarian"])];
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
      {all.map((t) => (
        <Chip key={t} active={selected.includes(t)} onClick={() => onChange(selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t])}>{t}</Chip>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); if (extra.trim()) onChange([...new Set([...selected, extra.trim()])]); setExtra(""); }}>
        <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="+ tag" className="h-9 w-24 rounded-full bg-card px-3.5 text-[14px] ring-1 ring-line outline-none" />
      </form>
    </div>
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
