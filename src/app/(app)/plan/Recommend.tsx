"use client";
import { isIdea } from "@/lib/ideas";
import { lastMadeShort } from "@/lib/history";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Chip, Sheet, cx } from "@/components/ui";
import { IconCheck, IconClock, IconSliders, IconUpload } from "@/components/icons";
import { RecipeImage } from "@/components/RecipeImage";
import { fitShare, makeFitContext, onlyAtStores, tripFit, type StoreFit } from "@/lib/trip";
import { CardBadge } from "@/components/CardBadge";
import { FlipThrough } from "@/components/FlipThrough";
import { rng, scoreRecipe } from "@/lib/planner/planner";
import { COOKING_STYLES, cookingStyles, type CookingStyle } from "@/lib/infer";
import type { HouseholdData } from "@/lib/data/household";
import type { IngredientInfo, MealType } from "@/lib/types";
import type { PlanRecipe } from "./PlanClient";

type R = PlanRecipe & { steps?: { text: string }[] };

/**
 * Recipes recommended for the stores on this trip: what you can mostly buy
 * there first, then the usual planner picks (Loved, kid-friendly, not made lately).
 */
export function Recommend({
  recipes, household, storeIds, mealTypes, maxPrep, picked, onToggle, onFocusStore, have = [],
}: {
  /** "I have…": ingredients to use up; recipes using more of them rank first */
  have?: string[];
  recipes: R[];
  household: HouseholdData;
  storeIds: string[];
  mealTypes: MealType[];
  maxPrep: number | null;
  picked: string[];
  onToggle: (id: string) => void;
  /** Called when you look at a store that isn't on the trip yet. */
  onFocusStore?: (storeId: string) => void;
}) {
  const [styles, setStyles] = useState<CookingStyle[]>([]);
  const [kidsOnly, setKidsOnly] = useState(false);
  const [lovedOnly, setLovedOnly] = useState(false);
  const [limit, setLimit] = useState(12);
  const [flash, setFlash] = useState<string | null>(null);
  const [flipping, setFlipping] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const filterCount = (lovedOnly ? 1 : 0) + (kidsOnly ? 1 : 0) + styles.length;
  // Ranking has a little randomness, so build it on the phone only (no server/phone mismatch).
  const [seed, setSeed] = useState<number | null>(null);
  useEffect(() => setSeed(Date.now()), []);
  const shownIds = storeIds;
  const storeNames = household.stores.filter((s) => shownIds.includes(s.id)).map((s) => s.name);
  const allStores = household.stores.filter((s) => !s.archived);

  const ctx = useMemo(
    () => makeFitContext({ categories: household.categories, rules: household.rules, ingredients: new Map<string, IngredientInfo>(household.ingredients.map((i) => [i.name_norm, i])), synonyms: household.synonyms }),
    [household],
  );
  const haveTerms = useMemo(() => have.map((h) => h.toLowerCase().trim().replace(/(es|s)$/, "")).filter((h) => h.length > 2), [have]);
  const special = useMemo(() => new Map(recipes.map((r) => [r.id, onlyAtStores(r.recipe_ingredients.map((i) => i.name_norm), ctx)])), [recipes, ctx]);
  const stylesOf = useMemo(() => new Map(recipes.map((r) => [r.id, cookingStyles(r.title, r.tags, r.steps ?? [])])), [recipes]);

  const adultRecipes = recipes.filter((r) => !r.is_kid_meal);
  const ranked = useMemo(() => {
    if (!shownIds.length || seed == null) return [];
    const rand = rng(seed);
    const avoid = household.avoidTerms.map((t) => t.toLowerCase());
    return adultRecipes
      .filter((r) => r.meal_types.some((t) => mealTypes.includes(t)))
      .filter((r) => !kidsOnly || r.kid_friendly)
      .filter((r) => !lovedOnly || r.tags.includes("Loved"))
      .filter((r) => !styles.length || styles.some((st) => stylesOf.get(r.id)?.includes(st)))
      .filter((r) => maxPrep == null || r.prep_min == null || r.prep_min <= maxPrep)
      .filter((r) => !avoid.some((a) => r.recipe_ingredients.some((i) => i.name_norm.includes(a))))
      .map((r) => {
        const names = r.recipe_ingredients.map((i) => i.name_norm);
        const fit = tripFit(names, shownIds, ctx);
        const { score } = scoreRecipe(
          { ...r, ingredientNames: names },
          { mealCount: 1, mealTypes, maxPrep: null, includeTags: [], excludeTags: [], excludeIngredients: [], avoidTerms: [], bonusTags: household.bonusTags, variety: false, useUp: [], pinnedIds: [], kidMeals: false },
          rand,
        );
        const unknownTime = maxPrep != null && r.prep_min == null;
        // Recipes built around something only this store sells are what a trip there is for.
        const signature = (special.get(r.id) ?? []).some((x) => shownIds.includes(x.storeId)) ? 150 : 0;
        // "I have…": every ingredient it uses counts more than store fit.
        const uses = haveTerms.filter((h) => names.some((n) => n.includes(h) || h.includes(n)));
        return { r, fit, uses, rank: uses.length * 1200 + Math.round(fitShare(fit) * 10) * 100 + score + signature - (unknownTime ? 50 : 0) };
      })
      .filter((x) => !haveTerms.length || x.uses.length > 0)
      .sort((a, b) => b.rank - a.rank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipes, storeIds, mealTypes, maxPrep, kidsOnly, lovedOnly, styles, ctx, household, seed, stylesOf, special, haveTerms.join("|")]);

  /** Pick a random dinner from the best matches that isn't picked yet. */
  function surprise() {
    const pool = ranked.slice(0, 20).filter(({ r }) => !picked.includes(r.id));
    if (!pool.length) return;
    const choice = pool[Math.floor(Math.random() * pool.length)].r;
    onToggle(choice.id);
    setFlash(choice.id);
    const idx = ranked.findIndex((x) => x.r.id === choice.id);
    if (idx >= limit) setLimit(idx + 1);
    setTimeout(() => document.getElementById(`rec-${choice.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    setTimeout(() => setFlash(null), 1600);
  }

  if (adultRecipes.length < 10) {
    return (
      <Link href="/recipes/import" className="card mt-4 flex items-center gap-3 p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-2xl text-accent"><IconUpload /></span>
        <span className="flex-1">
          <span className="block text-[17px] font-semibold">Import your recipes</span>
          
        </span>
      </Link>
    );
  }
  if (!storeIds.length) return null;

  return (
    <section className="mt-6">
      {flipping && (
        <FlipThrough
          cards={ranked.slice(0, 40).map(({ r, fit }) => ({
            id: r.id,
            title: r.title,
            image: r.image_path,
            prepMin: r.prep_min,
            lines: [
              lastMadeShort(r.times_made, r.last_made_at),
              r.tags.includes("Loved") && "loved",
              r.kid_friendly && "kid-friendly",
              fit.missing.length > 0 && `also need ${fit.missing.slice(0, 2).join(", ")}`,
            ].filter(Boolean) as string[],
          }))}
          picked={picked}
          onToggle={onToggle}
          onClose={() => setFlipping(false)}
        />
      )}
      <div className="mb-3 px-1">
        <h2 className="recipe-title text-[22px] font-semibold">Your recipes</h2>
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-[13px] text-muted">Best for {storeNames.length > 2 ? "your stores" : storeNames.join(" & ")}</p>
          <div className="-mr-2 flex shrink-0 items-center">
            <button onClick={() => setFlipping(true)} disabled={!ranked.length} className="h-11 px-2 text-[16px] whitespace-nowrap text-accent disabled:opacity-40">
              Flip through
            </button>
            <button onClick={surprise} disabled={!ranked.length} className="h-11 px-2 text-[16px] whitespace-nowrap text-accent disabled:opacity-40">
              Pick one
            </button>
          </div>
        </div>
      </div>
      <div className="no-scrollbar -mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip active={filterCount > 0} onClick={() => setFiltering(true)}>
          <span className="flex items-center gap-1.5"><IconSliders /> {styles.length ? `Filter · ${styles.length}` : "Filter"}</span>
        </Chip>
        <Chip active={lovedOnly} onClick={() => setLovedOnly(!lovedOnly)}>Loved</Chip>
        <Chip active={kidsOnly} onClick={() => setKidsOnly(!kidsOnly)}>Kid-friendly</Chip>
      </div>
      <Sheet open={filtering} onClose={() => setFiltering(false)} title="Cooking style">
        <div className="flex flex-wrap gap-2">
          {COOKING_STYLES.map((st) => (
            <Chip key={st} active={styles.includes(st)} onClick={() => setStyles(styles.includes(st) ? styles.filter((x) => x !== st) : [...styles, st])}>{st}</Chip>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setStyles([])}>Clear</Button>
          <Button className="flex-1" onClick={() => setFiltering(false)}>Show {ranked.length}</Button>
        </div>
      </Sheet>
      {seed != null && !ranked.length && <p className="px-1 py-6 text-center text-[15px] text-muted">{haveTerms.length ? "None of your recipes use those. Try fewer ingredients." : "No recipes match those filters."}</p>}
      <ul className="mt-3 grid grid-cols-2 gap-3">
        {ranked.slice(0, limit).map(({ r, fit, uses }) => {
          const on = picked.includes(r.id);
          return (
            <li key={r.id} id={`rec-${r.id}`} className={cx(flash === r.id && "animate-pulse")}>
              <button onClick={() => onToggle(r.id)} className="w-full text-left active:scale-[0.98] transition" aria-pressed={on}>
                <div className={cx("relative aspect-[4/3] overflow-hidden rounded-2xl bg-soft", on && "ring-3 ring-accent")}>
                  <RecipeImage src={r.image_path} title={r.title} />
                  <span className={cx("absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full text-[15px] shadow", on ? "bg-accent text-white" : "bg-white/85 text-transparent")}>
                    <IconCheck strokeWidth={3} />
                  </span>
                  {(() => {
                    const sp = special.get(r.id)?.[0];
                    const st = sp && allStores.find((x) => x.id === sp.storeId);
                    return <CardBadge idea={isIdea(r)} store={st ? st.name : null} loved={r.tags.includes("Loved")} />;
                  })()}
                </div>
                <p className="recipe-title mt-1.5 line-clamp-2 px-0.5 text-[15px] leading-snug font-semibold">{r.title}</p>
                <p className="flex items-center gap-1 px-0.5 text-[12px] text-muted">
                  {r.prep_min != null && (<><IconClock /> {r.prep_min} min · </>)}
                  {r.kid_friendly ? "kid-friendly" : (stylesOf.get(r.id) ?? [])[0] ?? lastMadeShort(r.times_made, r.last_made_at)}
                </p>
                {uses.length > 0 && <p className="truncate px-0.5 text-[12px] font-semibold text-ok">Uses {uses.join(", ")}</p>}
                <FitBadge fit={fit} />
              </button>
            </li>
          );
        })}
      </ul>
      {ranked.length > limit && (
        <button onClick={() => setLimit(limit + 12)} className="mt-3 w-full rounded-full bg-soft py-2.5 text-[15px] font-medium">Show more</button>
      )}
    </section>
  );
}

/** Only speak up when the trip won't cover everything. */
function FitBadge({ fit }: { fit: StoreFit }) {
  if (!fit.missing.length) return null;
  return <p className="truncate px-0.5 text-[12px] text-warn">Also need: {fit.missing.slice(0, 2).join(", ")}{fit.missing.length > 2 ? ` +${fit.missing.length - 2}` : ""}</p>;
}
