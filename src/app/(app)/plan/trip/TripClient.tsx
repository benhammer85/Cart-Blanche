"use client";
import { useEffect, useMemo, useState } from "react";
import { StoreBadge } from "@/components/StoreBadge";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Chip, Empty, PageHeader, cx } from "@/components/ui";
import { IconCheck, IconClock, IconSearch } from "@/components/icons";
import { RecipeImage } from "@/components/RecipeImage";
import { fitShare, makeFitContext, storeFit, type StoreFit } from "@/lib/trip";
import { rng, scoreRecipe } from "@/lib/planner/planner";
import { COOKING_STYLES, cookingStyles, type CookingStyle } from "@/lib/infer";
import type { HouseholdData } from "@/lib/data/household";
import type { IngredientInfo, MealType } from "@/lib/types";
import type { PlanRecipe } from "../PlanClient";

type TripRecipe = PlanRecipe & { cook_min?: number | null; steps?: { text: string }[] };

export function TripClient({ household, recipes, initialStore }: { household: HouseholdData; recipes: TripRecipe[]; initialStore: string | null }) {
  const router = useRouter();
  const stores = household.stores.filter((s) => !s.archived);
  const [storeId, setStoreId] = useState<string | null>(initialStore && stores.some((s) => s.id === initialStore) ? initialStore : null);
  const [mealType, setMealType] = useState<MealType>("dinner");
  const [kidsOnly, setKidsOnly] = useState(false);
  const [maxMin, setMaxMin] = useState<number | null>(null);
  const [styles, setStyles] = useState<CookingStyle[]>([]);
  const stylesOf = useMemo(() => new Map(recipes.map((r) => [r.id, cookingStyles(r.title, r.tags, r.steps ?? [])])), [recipes]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [seed, setSeed] = useState<number | null>(null);
  useEffect(() => setSeed(Date.now()), []);

  const ctx = useMemo(
    () =>
      makeFitContext({
        categories: household.categories,
        rules: household.rules,
        ingredients: new Map<string, IngredientInfo>(household.ingredients.map((i) => [i.name_norm, i])),
        synonyms: household.synonyms,
      }),
    [household],
  );

  const ranked = useMemo(() => {
    if (!storeId || seed == null) return [];
    const rand = rng(seed);
    const avoid = household.avoidTerms.map((t) => t.toLowerCase());
    const needle = q.toLowerCase().trim();
    return recipes
      .filter((r) => r.meal_types.includes(mealType))
      .filter((r) => !kidsOnly || r.kid_friendly)
      .filter((r) => !needle || r.title.toLowerCase().includes(needle))
      .filter((r) => !styles.length || styles.some((st) => stylesOf.get(r.id)?.includes(st)))
      .filter((r) => maxMin == null || r.prep_min == null || r.prep_min <= maxMin)
      .filter((r) => !avoid.some((a) => r.recipe_ingredients.some((i) => i.name_norm.includes(a))))
      .map((r) => {
        const names = r.recipe_ingredients.map((i) => i.name_norm);
        const fit = storeFit(names, storeId, ctx);
        const { score } = scoreRecipe(
          { ...r, ingredientNames: names },
          { mealCount: 1, mealTypes: [mealType], maxPrep: null, includeTags: [], excludeTags: [], excludeIngredients: [], avoidTerms: [], bonusTags: household.bonusTags, variety: false, useUp: [], pinnedIds: [], kidMeals: false },
          rand,
        );
        // Store fit matters most; within the same fit, the usual planner score decides.
        // With a time limit, recipes with no time listed go below the ones that fit.
        const unknownTime = maxMin != null && r.prep_min == null;
        return { r, fit, unknownTime, rank: Math.round(fitShare(fit) * 10) * 100 + score - (unknownTime ? 1000 : 0) };
      })
      .sort((a, b) => b.rank - a.rank);
  }, [storeId, recipes, mealType, kidsOnly, q, ctx, household, seed, styles, maxMin, stylesOf]);

  const store = stores.find((s) => s.id === storeId);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div>
      <PageHeader title="Quick trip" back="/plan" subtitle={store ? `Pick what to cook. Everything goes on the ${store.name} list.` : "Where are you headed?"} />
      <div className="px-4">
        <div className="mt-4 flex flex-wrap gap-2">
          {stores.map((s) => (
            <Chip key={s.id} active={storeId === s.id} onClick={() => { setStoreId(s.id); setPicked([]); }}>
              <span className="flex items-center gap-1.5"><StoreBadge name={s.name} size={20} />{s.name}</span>
            </Chip>
          ))}
        </div>

        {storeId && (
          <>
            <div className="mt-4 flex items-center gap-2">
              <div className="relative flex-1">
                <IconSearch className="absolute top-1/2 left-3.5 -translate-y-1/2 text-[18px] text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-10 w-full rounded-xl bg-soft pr-3 pl-10 text-[16px] outline-none placeholder:text-muted" />
              </div>
            </div>
            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
              {(["dinner", "lunch", "breakfast"] as MealType[]).map((m) => (
                <Chip key={m} active={mealType === m} onClick={() => setMealType(m)}>{m[0].toUpperCase() + m.slice(1)}</Chip>
              ))}
              <Chip active={kidsOnly} onClick={() => setKidsOnly(!kidsOnly)}>Kid-friendly</Chip>
            </div>
            <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
              {[null, 15, 30, 45].map((m) => (
                <Chip key={String(m)} active={maxMin === m} onClick={() => setMaxMin(m)}>{m ? `${m} min` : "Any time"}</Chip>
              ))}
            </div>
            <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
              {COOKING_STYLES.map((st) => (
                <Chip key={st} active={styles.includes(st)} onClick={() => setStyles(styles.includes(st) ? styles.filter((x) => x !== st) : [...styles, st])}>{st}</Chip>
              ))}
            </div>

            {!recipes.length ? (
              <Link href="/recipes/import" className="card mt-4 flex items-center gap-3 p-4">
                <span className="flex-1">
                  <span className="block text-[17px] font-semibold">Import your recipes first</span>
                  <span className="block text-[13px] text-muted">Recommendations come from your recipe library. Import your Crouton recipes to get started.</span>
                </span>
              </Link>
            ) : (
              !ranked.length && <Empty title="No matching recipes">Try another meal type, time or style.</Empty>
            )}
            <ul className="mt-3 space-y-3 pb-36">
              {ranked.map(({ r, fit, unknownTime }) => {
                const on = picked.includes(r.id);
                return (
                  <li key={r.id}>
                    <button onClick={() => toggle(r.id)} className={cx("card flex w-full gap-3 p-3 text-left transition", on && "ring-2 ring-accent")}>
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-soft">
                        <RecipeImage src={r.image_path} title={r.title} placeholderText={false} />
                        {on && (
                          <span className="absolute inset-0 grid place-items-center bg-black/35 text-3xl text-white">
                            <IconCheck strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="recipe-title text-[17px] leading-snug font-semibold">{r.title}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted">
                          {r.prep_min != null ? (<><IconClock /> {r.prep_min} min · </>) : unknownTime ? "time not listed · " : null}
                          {(stylesOf.get(r.id) ?? []).length > 0 && `${stylesOf.get(r.id)!.join(", ")} · `}
                          {r.kid_friendly ? "kid-friendly" : r.times_made ? `made ${r.times_made}×` : "not made yet"}
                        </p>
                        <FitLine fit={fit} storeName={store!.name} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {storeId && picked.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+64px)] z-30 px-4">
          <div className="mx-auto max-w-xl">
            <Button size="lg" className="w-full shadow-lg" onClick={() => router.push(`/plan?trip=${storeId}&recipes=${picked.join(",")}`)}>
              Make the list ({picked.length} {picked.length === 1 ? "meal" : "meals"})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FitLine({ fit, storeName }: { fit: StoreFit; storeName: string }) {
  if (!fit.missing.length) return <p className="mt-1.5 text-[13px] font-semibold text-ok">Everything at {storeName}</p>;
  const shown = fit.missing.slice(0, 3).join(", ");
  const more = fit.missing.length > 3 ? ` and ${fit.missing.length - 3} more` : "";
  return (
    <p className="mt-1.5 text-[13px] text-warn">
      Usually from elsewhere: {shown}
      {more}
    </p>
  );
}
