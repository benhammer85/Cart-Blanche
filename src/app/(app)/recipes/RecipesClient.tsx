"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Chip, Empty, Sheet, cx } from "@/components/ui";
import { RecipeImage } from "@/components/RecipeImage";
import { IconBook, IconChat, IconClock, IconLink, IconPencil, IconPlus, IconSearch, IconShare, IconUpload } from "@/components/icons";

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
}

type Sort = "az" | "stale" | "new" | "most";
const SORTS: { value: Sort; label: string }[] = [
  { value: "az", label: "A to Z" },
  { value: "stale", label: "Not made lately" },
  { value: "most", label: "Most made" },
  { value: "new", label: "Newest" },
];

export function RecipesClient({ recipes }: { recipes: RecipeCard[] }) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [maxPrep, setMaxPrep] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>("az");
  const [adding, setAdding] = useState(false);

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
      return !needle || r.title.toLowerCase().includes(needle) || r.tags.some((t) => t.toLowerCase().includes(needle));
    });
    list = [...list].sort((a, b) => {
      if (sort === "stale") return (a.last_made_at ?? "0000").localeCompare(b.last_made_at ?? "0000");
      if (sort === "most") return b.times_made - a.times_made;
      if (sort === "new") return b.created_at.localeCompare(a.created_at);
      return a.title.localeCompare(b.title);
    });
    return list;
  }, [recipes, q, tag, maxPrep, sort]);

  return (
    <div>
      <header className="pt-safe px-5">
        <div className="flex h-11 items-center justify-end">
          <button onClick={() => setAdding(true)} className="grid h-9 w-9 place-items-center rounded-full bg-accent text-xl text-accent-ink shadow-sm" aria-label="Add recipe">
            <IconPlus />
          </button>
        </div>
        <h1 className="large-title">Recipes</h1>
        <div className="relative mt-3">
          <IconSearch className="absolute top-1/2 left-3.5 -translate-y-1/2 text-[18px] text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${recipes.filter((r) => !r.is_kid_meal).length} recipes`} className="h-10 w-full rounded-xl bg-soft pr-3 pl-10 text-[16px] outline-none placeholder:text-muted" />
        </div>
      </header>

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
        <Chip active={!tag} onClick={() => setTag(null)}>All</Chip>
        <Chip active={tag === "Loved"} onClick={() => setTag(tag === "Loved" ? null : "Loved")}>♥ Loved</Chip>
        <Chip active={tag === "__kf"} onClick={() => setTag(tag === "__kf" ? null : "__kf")}>Kid-friendly</Chip>
        <Chip active={tag === "__kids"} onClick={() => setTag(tag === "__kids" ? null : "__kids")}>Kids’ menu</Chip>
        {tags.filter((t) => t !== "kids" && t !== "Loved").map((t) => (
          <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</Chip>
        ))}
      </div>
      <div className="no-scrollbar mt-2 flex items-center gap-2 overflow-x-auto px-5 pb-1 text-[13px]">
        {[null, 15, 30, 45].map((m) => (
          <button key={String(m)} onClick={() => setMaxPrep(m)} className={cx("h-7 shrink-0 rounded-full px-3", maxPrep === m ? "bg-ink text-bg" : "text-muted")}>
            {m ? `≤ ${m} min` : "Any time"}
          </button>
        ))}
        <span className="mx-1 h-4 w-px shrink-0 bg-line" />
        {SORTS.map((s) => (
          <button key={s.value} onClick={() => setSort(s.value)} className={cx("h-7 shrink-0 rounded-full px-3", sort === s.value ? "bg-ink text-bg" : "text-muted")}>
            {s.label}
          </button>
        ))}
      </div>

      {!recipes.length ? (
        <Empty icon={<IconBook />} title="No recipes yet">
          Import your Crouton favorites to get started.
          <div className="mt-4">
            <Link href="/recipes/import" className="inline-flex h-11 items-center rounded-full bg-accent px-5 font-semibold text-accent-ink">Import from Crouton</Link>
          </div>
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 pt-3">
          {shown.map((r) => (
            <Link key={r.id} href={`/recipes/${r.id}`} className="group active:scale-[0.98] transition">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-soft">
                <RecipeImage src={r.image_path} title={r.title} />
                {(r.kid_friendly || r.is_kid_meal) && (
                  <span className="absolute top-2 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">{r.is_kid_meal ? "Kids’ menu" : "Kid-friendly"}</span>
                )}
              </div>
              <p className="recipe-title mt-2 line-clamp-2 px-0.5 text-[16px] leading-snug font-semibold">{r.title}</p>
              <p className="flex items-center gap-1 px-0.5 text-[12px] text-muted">
                {r.prep_min != null && (<><IconClock /> {r.prep_min} min · </>)}
                {r.times_made ? `made ${r.times_made}×` : "not made yet"}
              </p>
            </Link>
          ))}
        </div>
      )}
      {recipes.length > 0 && !shown.length && <Empty title="Nothing matches">Try a different search or filter.</Empty>}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add recipes">
        <div className="card divide-y divide-line overflow-hidden">
          {[
            { href: "/recipes/new?mode=url", icon: <IconLink />, label: "From a link", detail: "Paste a recipe website address" },
            { href: "/recipes/new?mode=paste", icon: <IconPencil />, label: "Type or paste", detail: "Ingredients, a blank line, then steps" },
            { href: "/recipes/import", icon: <IconUpload />, label: "Import from Crouton", detail: ".crumb files or a .zip" },
            { href: "/recipes/claude", icon: <IconChat />, label: "Find new recipes", detail: "Get fresh ideas that fit our week" },
            { href: "/recipes/share-setup", icon: <IconShare />, label: "Share button setup", detail: "Save recipes from any website or app in one tap" },
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
