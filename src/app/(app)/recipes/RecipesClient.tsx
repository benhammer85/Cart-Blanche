"use client";
import { isIdea } from "@/lib/ideas";
import { lastMadeShort } from "@/lib/history";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Chip, Empty, Section, Segmented, Sheet } from "@/components/ui";
import { Discover } from "./Discover";
import { RecipeImage } from "@/components/RecipeImage";
import { StoreBadge } from "@/components/StoreBadge";
import { fitShare, makeFitContext, onlyAtStores, storeFit, type StoreFit } from "@/lib/trip";
import { CardBadge } from "@/components/CardBadge";
import type { HouseholdData } from "@/lib/data/household";
import type { IngredientInfo } from "@/lib/types";
import { IconBook, IconClock, IconLink, IconPencil, IconPlus, IconSearch, IconShare, IconUpload, IconSliders, IconCamera } from "@/components/icons";

export interface RecipeCard {
  id: string;
  title: string;
  servings: number;
  prep_min: number | null;
  cook_min: number | null;
  image_path: string | null;
  tags: string[];
  meal_types: string[];
  main_protein: string | null;
  kid_friendly: boolean;
  is_kid_meal: boolean;
  origin: string;
  times_made: number;
  last_made_at: string | null;
  created_at: string;
  recipe_ingredients?: { name_norm: string }[];
}

type Sort = "az" | "stale" | "new" | "most";
const SORTS: { value: Sort; label: string }[] = [
  { value: "az", label: "A to Z" },
  { value: "stale", label: "Not made lately" },
  { value: "most", label: "Most made" },
  { value: "new", label: "Newest" },
];

/** "coconut milk" or "thighs" → the ingredient a recipe uses that matches, if any (whole words). */
function usesIngredient(r: RecipeCard, needle: string): string | null {
  if (needle.length < 3) return null;
  const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/s$/, "")}`, "i");
  return (r.recipe_ingredients ?? []).find((i) => re.test(i.name_norm))?.name_norm ?? null;
}

export function RecipesClient({ recipes, household }: { recipes: RecipeCard[]; household: HouseholdData }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [maxPrep, setMaxPrep] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>("az");
  const [adding, setAdding] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [view, setView] = useState<"ours" | "discover">("ours");
  // "Best at <store>": sort by how much of each recipe that store usually carries.
  const [storeFocus, setStoreFocus] = useState<string | null>(null);
  const stores = household.stores.filter((s) => !s.archived);
  const filterCount = (storeFocus ? 1 : 0) + (maxPrep ? 1 : 0) + (sort !== "az" ? 1 : 0);
  const fitCtx = useMemo(
    () => makeFitContext({ categories: household.categories, rules: household.rules, ingredients: new Map<string, IngredientInfo>(household.ingredients.map((i) => [i.name_norm, i])), synonyms: household.synonyms }),
    [household],
  );
  const special = useMemo(() => new Map(recipes.map((r) => [r.id, onlyAtStores((r.recipe_ingredients ?? []).map((i) => i.name_norm), fitCtx)])), [recipes, fitCtx]);
  const fits = useMemo(() => {
    if (!storeFocus) return null;
    return new Map(recipes.map((r) => [r.id, storeFit((r.recipe_ingredients ?? []).map((i) => i.name_norm), storeFocus, fitCtx)]));
  }, [storeFocus, recipes, fitCtx]);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [recipes]);

  const shown = useMemo(() => {
    const needle = q.toLowerCase().trim();
    let list = recipes.filter((r) => {
      if (tag === "__kids") return r.is_kid_meal;
      if (tag === "__kf") return r.kid_friendly && !r.is_kid_meal;
      if (r.is_kid_meal && tag !== "kids") return false;
      if (tag && !r.tags.includes(tag)) return false;
      if (maxPrep && r.prep_min != null && r.prep_min > maxPrep) return false;
      return !needle || r.title.toLowerCase().includes(needle) || r.tags.some((t) => t.toLowerCase().includes(needle)) || !!usesIngredient(r, needle);
    });
    if (fits) {
      // Recipes that use something only this store sells come first among equals.
      const fitRank = (r: RecipeCard) => fitShare(fits.get(r.id)!) + ((special.get(r.id) ?? []).some((x) => x.storeId === storeFocus) ? 0.15 : 0);
      // Store view: dinners and lunches only, best fit first.
      return list
        .filter((r) => !r.is_kid_meal && r.meal_types.some((t) => t === "dinner" || t === "lunch"))
        .sort((a, b) => fitRank(b) - fitRank(a) || a.title.localeCompare(b.title));
    }
    list = [...list].sort((a, b) => {
      if (sort === "stale") return (a.last_made_at ?? "0000").localeCompare(b.last_made_at ?? "0000");
      if (sort === "most") return b.times_made - a.times_made;
      if (sort === "new") return b.created_at.localeCompare(a.created_at);
      return a.title.localeCompare(b.title);
    });
    return list;
  }, [recipes, q, tag, maxPrep, sort, fits, special, storeFocus]);

  return (
    <div>
      <header className="pt-safe px-5">
        <div className="flex h-11 items-center justify-end gap-2">
          <button
            onClick={() => {
              const pool = shown.filter((r) => !r.is_kid_meal);
              if (pool.length) router.push(`/recipes/${pool[Math.floor(Math.random() * pool.length)].id}`);
            }}
            className="h-9 px-2 text-[16px] text-accent"
            aria-label="Open a random recipe"
          >
            Pick one
          </button>
          <button onClick={() => setAdding(true)} className="grid h-9 w-9 place-items-center rounded-full text-[22px] text-accent" aria-label="Add recipe">
            <IconPlus />
          </button>
        </div>
        <h1 className="large-title">Recipes</h1>
        <div className="relative mt-3">
          <IconSearch className="absolute top-1/2 left-3.5 -translate-y-1/2 text-[18px] text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${recipes.filter((r) => !r.is_kid_meal).length} recipes or an ingredient`} className="h-10 w-full rounded-xl bg-soft pr-3 pl-10 text-[16px] outline-none placeholder:text-muted" />
        </div>
      </header>

      <div className="mt-3 px-4">
        <Segmented value={view} onChange={setView} options={[{ value: "ours", label: "Our recipes" }, { value: "discover", label: "Discover" }]} />
      </div>
      {view === "discover" ? (
        <Discover stores={stores} />
      ) : (
      <>
      {recipes.length > 0 && recipes.filter((r) => !r.is_kid_meal).length < 10 && (
        <Link href="/recipes/import" className="card mx-4 mt-3 flex items-center gap-3 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-2xl text-accent"><IconUpload /></span>
          <span className="flex-1">
            <span className="block text-[17px] font-semibold">Import your Crouton library</span>
            <span className="block text-[13px] text-muted">Bring in all your recipes with photos. Works from a phone or a laptop.</span>
          </span>
        </Link>
      )}
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
        <Chip active={filterCount > 0} onClick={() => setFiltering(true)}>
          <span className="flex items-center gap-1.5"><IconSliders /> {filterCount ? `Filter · ${filterCount}` : "Filter"}</span>
        </Chip>
        <Chip active={!tag} onClick={() => setTag(null)}>All</Chip>
        <Chip active={tag === "Loved"} onClick={() => setTag(tag === "Loved" ? null : "Loved")}>Loved</Chip>
        <Chip active={tag === "__kf"} onClick={() => setTag(tag === "__kf" ? null : "__kf")}>Kid-friendly</Chip>
        <Chip active={tag === "__kids"} onClick={() => setTag(tag === "__kids" ? null : "__kids")}>Kids’ menu</Chip>
        {tags.filter((t) => t !== "kids" && t !== "Loved").map((t) => (
          <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</Chip>
        ))}
      </div>
      {filterCount > 0 && (
        <p className="mt-1.5 px-6 text-[13px] text-muted">
          {[storeFocus && `Best at ${stores.find((st) => st.id === storeFocus)?.name}`, maxPrep && `${maxPrep} min or less`, sort !== "az" && SORTS.find((x) => x.value === sort)?.label].filter(Boolean).join(" · ")}
          <button className="ml-2 font-semibold text-accent" onClick={() => { setStoreFocus(null); setMaxPrep(null); setSort("az"); }}>Clear</button>
        </p>
      )}

      {!recipes.length ? (
        <Empty icon={<IconBook />} title="No recipes yet">
          Import your Crouton favorites to get started.
          <div className="mt-4">
            <Link href="/recipes/import" className="inline-flex h-11 items-center rounded-xl bg-ink px-5 font-semibold text-bg">Import from Crouton</Link>
          </div>
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 pt-3">
          {shown.map((r) => (
            <Link key={r.id} href={`/recipes/${r.id}`} className="group active:scale-[0.98] transition">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-soft">
                <RecipeImage src={r.image_path} title={r.title} />
                {(() => {
                  const sp = special.get(r.id)?.[0];
                  const st = sp && stores.find((x) => x.id === sp.storeId);
                  return <CardBadge idea={isIdea(r)} store={st ? st.name : null} kidsMenu={r.is_kid_meal} loved={r.tags.includes("Loved")} kidFriendly={r.kid_friendly} />;
                })()}
              </div>
              <p className="recipe-title mt-2 line-clamp-2 px-0.5 text-[16px] leading-snug font-semibold">{r.title}</p>
              <p className="flex items-center gap-1 px-0.5 text-[12px] text-muted">
                {r.prep_min != null && (<><IconClock /> {r.prep_min} min · </>)}
                {lastMadeShort(r.times_made, r.last_made_at)}
              </p>
              {(() => {
                const n = q.toLowerCase().trim();
                const hit = n && !r.title.toLowerCase().includes(n) ? usesIngredient(r, n) : null;
                return hit ? <p className="truncate px-0.5 text-[12px] font-semibold text-accent">Uses {hit}</p> : null;
              })()}
              {fits && <FitNote fit={fits.get(r.id)!} store={stores.find((s) => s.id === storeFocus)?.name ?? ""} />}
            </Link>
          ))}
        </div>
      )}
      {recipes.length > 0 && !shown.length && <Empty title="Nothing matches">Try a different search or filter.</Empty>}

      </>
      )}

      <Sheet open={filtering} onClose={() => setFiltering(false)} title="Filter">
        <Section title="Best at a store" className="mt-0">
          <div className="flex flex-wrap gap-2">
            <Chip active={!storeFocus} onClick={() => setStoreFocus(null)}>Any store</Chip>
            {stores.map((st) => (
              <Chip key={st.id} active={storeFocus === st.id} onClick={() => setStoreFocus(storeFocus === st.id ? null : st.id)}>
                <span className="flex items-center gap-1.5"><StoreBadge name={st.name} size={18} />{st.name}</span>
              </Chip>
            ))}
          </div>
        </Section>
        <Section title="Hands-on time">
          <Segmented value={maxPrep} onChange={setMaxPrep} options={[{ value: null, label: "Any" }, { value: 15, label: "15 min" }, { value: 30, label: "30 min" }, { value: 45, label: "45 min" }]} />
        </Section>
        <Section title="Sort">
          <Segmented value={sort} onChange={setSort} options={SORTS} />
        </Section>
        <Button size="lg" className="mt-6 w-full" onClick={() => setFiltering(false)}>Show {shown.length} recipes</Button>
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add recipes">
        <div className="card divide-y divide-line overflow-hidden">
          {[
            { href: "/recipes/new?mode=url", icon: <IconLink />, label: "From a link", detail: "Paste a recipe website address" },
            { href: "/recipes/new?mode=scan", icon: <IconCamera />, label: "Scan a cookbook page", detail: "A photo of a page, or a screenshot" },
            { href: "/recipes/new?mode=paste", icon: <IconPencil />, label: "Type or paste", detail: "A recipe page you copied, or your own" },
            { href: "/recipes/import", icon: <IconUpload />, label: "Import from Crouton", detail: ".crumb files or a .zip" },
            { href: "/recipes/share-setup", icon: <IconShare />, label: "Share button setup", detail: "Save from any site in Safari, in one tap" },
          ].map((o) => (
            <Link key={o.href} href={o.href} className="flex min-h-[64px] items-center gap-3 px-4 py-2 active:bg-soft" onClick={() => setAdding(false)}>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-[18px] text-accent">{o.icon}</span>
              <span>
                <span className="block text-[17px]">{o.label}</span>
                <span className="block text-[13px] text-muted">{o.detail}</span>
              </span>
            </Link>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function FitNote({ fit, store }: { fit: StoreFit; store: string }) {
  if (!fit.missing.length) return <p className="px-0.5 text-[12px] font-semibold text-ok">Everything at {store}</p>;
  return <p className="truncate px-0.5 text-[12px] text-warn">Elsewhere: {fit.missing.slice(0, 2).join(", ")}{fit.missing.length > 2 ? ` +${fit.missing.length - 2}` : ""}</p>;
}
