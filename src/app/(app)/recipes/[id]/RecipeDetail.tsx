"use client";
import { isIdea } from "@/lib/ideas";
import { historyLine } from "@/lib/history";
import { useEffect, useState } from "react";
import { PhotoSheet } from "@/components/PhotoSheet";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBack, IconCamera, IconCart, IconClock, IconPencil, IconUsers, IconLink, IconHeart, IconSwap } from "@/components/icons";
import { Chip, Sheet, cx } from "@/components/ui";
import { Substitutes } from "@/components/Substitutes";
import { substitutesFor } from "@/lib/substitutes";
import { RecipeImage } from "@/components/RecipeImage";
import { formatAmount, usEquivalent } from "@/lib/units";
import { AddToListSheet } from "@/components/AddToListSheet";
import { isIngredientHeading } from "@/lib/ingredientParser";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Recipe } from "@/lib/types";

export function RecipeDetail({ recipe: r }: { recipe: Recipe }) {
  const router = useRouter();
  const [tab, setTab] = useState<"ingredients" | "steps">("ingredients");
  const [scale, setScale] = useState(1);
  const ingredients = [...(r.recipe_ingredients ?? [])].sort((a, b) => a.position - b.position);
  const steps = r.steps ?? [];
  let stepNo = 0;

  const [tags, setTags] = useState(r.tags);
  const [adding, setAdding] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [subFor, setSubFor] = useState<string | null>(null);
  // Imported photos are sometimes tiny; offer a sharper one.
  const [lowRes, setLowRes] = useState(false);
  useEffect(() => {
    if (!r.image_path) return;
    const img = new Image();
    img.onload = () => setLowRes(img.naturalWidth > 0 && img.naturalWidth < 400);
    img.src = r.image_path;
  }, [r.image_path]);
  const loved = tags.includes("Loved");
  async function toggleLoved() {
    const next = loved ? tags.filter((t) => t !== "Loved") : [...tags, "Loved"];
    setTags(next);
    await supabaseBrowser().from("recipes").update({ tags: next }).eq("id", r.id);
    router.refresh();
  }

  return (
    <article>
      <div className="relative">
        <div className={r.image_path ? "aspect-[4/3] w-full" : "aspect-[5/2] w-full"}>
          <RecipeImage src={r.image_path} title={r.title} placeholderText={false} />
        </div>
        {!r.image_path && (
          <button onClick={() => setPhotoOpen(true)} className="absolute bottom-10 left-1/2 flex h-10 -translate-x-1/2 items-center gap-2 rounded-full bg-card px-4 text-[15px] font-semibold shadow">
            <IconCamera className="text-accent" /> Add a photo
          </button>
        )}
        <div className="pt-safe absolute inset-x-0 top-0 flex justify-between px-4 pt-2">
          <Link href="/recipes" className="grid h-10 w-10 place-items-center rounded-full bg-black/35 text-2xl text-white backdrop-blur" aria-label="Back">
            <IconBack />
          </Link>
          <div className="flex gap-2">
            <button onClick={toggleLoved} className={cx("grid h-10 w-10 place-items-center rounded-full text-xl backdrop-blur", loved ? "bg-white text-accent" : "bg-black/35 text-white")} aria-label={loved ? "Remove from Loved" : "Mark as Loved"} aria-pressed={loved}>
              <IconHeart filled={loved} />
            </button>
            {r.image_path && (
              <button onClick={() => setPhotoOpen(true)} className="grid h-10 w-10 place-items-center rounded-full bg-black/35 text-xl text-white backdrop-blur" aria-label="Change photo">
                <IconCamera />
              </button>
            )}
            <Link href={`/recipes/${r.id}/edit`} className="grid h-10 w-10 place-items-center rounded-full bg-black/35 text-xl text-white backdrop-blur" aria-label="Edit">
              <IconPencil />
            </Link>
          </div>
        </div>
      </div>

      <div className="relative -mt-6 rounded-t-[1.75rem] bg-bg px-5 pt-6">
        <h1 className="recipe-title text-[28px] leading-tight font-semibold">{r.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-muted">
          {r.prep_min != null && <span className="flex items-center gap-1"><IconClock /> {r.prep_min} min prep{r.cook_min ? ` · ${r.cook_min} cook` : ""}</span>}
          <span className="flex items-center gap-1"><IconUsers /> serves {Number(r.servings) * scale}</span>
          <span>{historyLine(r.times_made, r.last_made_at)}</span>
        </div>
        {lowRes && (
          <button onClick={() => setPhotoOpen(true)} className="mt-2 text-[14px] text-accent">Find a sharper photo</button>
        )}
        <PhotoSheet recipe={r} open={photoOpen} onClose={() => setPhotoOpen(false)} />
        <Sheet open={!!subFor} onClose={() => setSubFor(null)} title={subFor ?? ""}>
          {subFor && <Substitutes name={subFor} dish={r.title} />}
        </Sheet>
        {(tags.length > 0 || r.kid_friendly) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {isIdea(r) && <span className="rounded-full bg-soft px-2.5 py-1 text-[12px] font-semibold">Idea · not cooked yet</span>}
            {r.kid_friendly && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent">Kid-friendly</span>}
            {tags.filter((t) => !(isIdea(r) && (t === "Idea" || t === "AI idea"))).map((t) => <span key={t} className="rounded-full bg-soft px-2.5 py-1 text-[12px]">{t}</span>)}
          </div>
        )}
        {r.source_url && (
          <a href={r.source_url} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1.5 text-[14px] text-accent">
            <IconLink /> {r.source_name ?? new URL(r.source_url).hostname}
          </a>
        )}

        <div className="mt-5 flex gap-2">
          {(r.steps ?? []).some((x) => !x.isSection) && (
            <Link href={`/recipes/${r.id}/cook`} className="flex h-12 flex-[3] items-center justify-center gap-2 rounded-xl bg-ink text-[16px] font-semibold text-bg">
              Start cooking
            </Link>
          )}
          {ingredients.length > 0 && (
            <button onClick={() => setAdding(true)} className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-soft text-[16px] font-semibold">
              <IconCart /> Add to list
            </button>
          )}
        </div>
        <AddToListSheet recipe={r} scale={scale} open={adding} onClose={() => setAdding(false)} />
        <div className="mt-5 flex rounded-xl bg-soft p-1">
          {(["ingredients", "steps"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cx("h-9 flex-1 rounded-lg text-[15px] font-semibold capitalize", tab === t ? "bg-card shadow-sm" : "text-muted")}>
              {t}
            </button>
          ))}
        </div>

        {tab === "ingredients" ? (
          <div className="mt-4">
            <div className="mb-2 flex gap-2">
              {[0.5, 1, 1.5, 2].map((s) => <Chip key={s} active={scale === s} onClick={() => setScale(s)}>{s}×</Chip>)}
            </div>
            <ul className="divide-y divide-line">
              {ingredients.map((i) =>
                isIngredientHeading(i.raw_text || i.name, i.qty, i.unit) ? (
                  <li key={i.id} className="menu-label pt-5 pb-2 text-muted">{i.name}</li>
                ) : (
                <li key={i.id}>
                  <button className="flex w-full gap-3 py-3 text-left text-[16px] active:bg-soft" onClick={() => setSubFor(i.name)}>
                  <span className="w-20 shrink-0 font-semibold tabular-nums">{formatAmount(i.qty != null ? Number(i.qty) * scale : null, i.unit, i.qty_max != null ? Number(i.qty_max) * scale : null)}</span>
                  <span className={cx(!i.parsed_ok && "text-[#d23c3c]")}>
                    {i.name}
                    {i.note && <span className="text-muted">, {i.note}</span>}
                    {(() => {
                      // Metric recipes: show the US amount too ("200 g" → about 7 oz).
                      const us = /\b(oz|cups?|lb)\b/i.test(i.name) ? null : usEquivalent(i.qty != null ? Number(i.qty) * scale : null, i.unit);
                      return us ? <span className="text-muted"> (about {us})</span> : null;
                    })()}
                  </span>
                  {substitutesFor(i.name) && <IconSwap className="ml-auto shrink-0 self-center text-[15px] text-muted" aria-label="Has substitutes" />}
                  </button>
                </li>
                ),
              )}
            </ul>
          </div>
        ) : (
          <ol className="mt-4 space-y-5">
            {steps.map((s, idx) =>
              s.isSection ? (
                <li key={idx} className="pt-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{s.text}</li>
              ) : (
                <li key={idx} className="flex gap-3">
                  <span className="recipe-title w-6 shrink-0 text-[20px] leading-7 font-semibold text-accent">{++stepNo}</span>
                  <p className="text-[17px] leading-relaxed">{s.text.replace(/^\d+\.\s*/, "")}</p>
                </li>
              ),
            )}
            {!steps.length && <p className="text-muted">No steps saved.</p>}
          </ol>
        )}

        {r.notes && (
          <div className="card mt-6 p-4">
            <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted">Notes</p>
            <p className="text-[15px] leading-relaxed whitespace-pre-line">{r.notes}</p>
          </div>
        )}
      </div>
    </article>
  );
}
