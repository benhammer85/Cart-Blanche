"use client";
import { isIdea } from "@/lib/ideas";
import { historyLine } from "@/lib/history";
import { useEffect, useState } from "react";
import { PhotoSheet } from "@/components/PhotoSheet";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBack, IconCamera, IconPencil, IconHeart, IconSwap } from "@/components/icons";
import { Sheet, cx } from "@/components/ui";
import { Substitutes } from "@/components/Substitutes";
import { StepText } from "@/components/StepText";
import { fahrenheit } from "@/lib/temps";
import { substitutesFor } from "@/lib/substitutes";
import { RecipeImage } from "@/components/RecipeImage";
import { formatAmount, usEquivalent } from "@/lib/units";
import { AddToListSheet } from "@/components/AddToListSheet";
import { isIngredientHeading } from "@/lib/ingredientParser";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Recipe } from "@/lib/types";

export function RecipeDetail({ recipe: r }: { recipe: Recipe }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const ingredients = [...(r.recipe_ingredients ?? [])].sort((a, b) => a.position - b.position);
  const steps = r.steps ?? [];
  const stepIngredients = ingredients.filter((i) => !isIngredientHeading(i.raw_text || i.name, i.qty, i.unit));
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

  const amountOf = (i: (typeof ingredients)[number]) => formatAmount(i.qty != null ? Number(i.qty) * scale : null, i.unit, i.qty_max != null ? Number(i.qty_max) * scale : null);
  const meta = [
    `Serves ${Number(r.servings) * scale}`,
    r.prep_min != null && `${r.prep_min} minutes hands-on`,
    r.cook_min ? `${r.cook_min} cooking` : null,
  ].filter(Boolean).join(" · ");
  const labels = [isIdea(r) && "Idea, not cooked yet", r.kid_friendly && "Kid-friendly", ...tags.filter((t) => t !== "Loved" && !(isIdea(r) && (t === "Idea" || t === "AI idea")))].filter(Boolean) as string[];
  const roundBtn = "grid h-10 w-10 place-items-center rounded-full bg-bg/90 text-[19px] shadow-sm backdrop-blur";

  return (
    <article className="pb-8">
      <div className="relative">
        <div className={r.image_path ? "aspect-[4/3] w-full" : "aspect-[5/2] w-full"}>
          <RecipeImage src={r.image_path} title={r.title} placeholderText={false} />
        </div>
        {!r.image_path && (
          <button onClick={() => setPhotoOpen(true)} className="absolute bottom-6 left-1/2 flex h-10 -translate-x-1/2 items-center gap-2 rounded-full bg-bg px-4 text-[15px] font-medium shadow-sm">
            <IconCamera /> Add a photo
          </button>
        )}
        <div className="pt-safe absolute inset-x-0 top-0 flex justify-between px-4 pt-2">
          <Link href="/recipes" className={cx(roundBtn, "text-ink")} aria-label="Back">
            <IconBack />
          </Link>
          <div className="flex gap-2">
            <button onClick={toggleLoved} className={cx(roundBtn, loved ? "text-accent" : "text-ink")} aria-label={loved ? "Remove from Loved" : "Mark as Loved"} aria-pressed={loved}>
              <IconHeart filled={loved} />
            </button>
            <button onClick={() => setMenuOpen(true)} className={cx(roundBtn, "text-ink")} aria-label="More">
              <span className="text-[20px] leading-none">⋯</span>
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 pt-6">
        {r.source_url ? (
          <a href={r.source_url} target="_blank" rel="noreferrer" className="text-[14px] text-muted">
            From {r.source_name ?? new URL(r.source_url).hostname.replace(/^www\./, "")}
          </a>
        ) : null}
        <h1 className="recipe-title mt-1 text-[34px] leading-[1.06]">{r.title}</h1>
        <p className="recipe-title mt-2 text-[17px] leading-snug text-muted italic">
          {meta}
          <br />
          {historyLine(r.times_made, r.last_made_at)}
        </p>
        {labels.length > 0 && <p className="mt-2 text-[13px] text-muted">{labels.join(" · ")}</p>}
        {lowRes && (
          <button onClick={() => setPhotoOpen(true)} className="mt-2 text-[14px] text-muted underline decoration-line underline-offset-4">Find a sharper photo</button>
        )}

        <div className="mt-6 flex items-center gap-6">
          {(r.steps ?? []).some((x) => !x.isSection) && (
            <Link href={`/recipes/${r.id}/cook`} className="flex h-12 items-center justify-center rounded-[10px] bg-ink px-6 text-[16px] font-semibold text-bg">
              Start cooking
            </Link>
          )}
          {ingredients.length > 0 && (
            <button onClick={() => setAdding(true)} className="text-[16px] font-semibold underline decoration-line decoration-2 underline-offset-[6px]">
              Add to list
            </button>
          )}
        </div>

        <PhotoSheet recipe={r} open={photoOpen} onClose={() => setPhotoOpen(false)} />
        <AddToListSheet recipe={r} scale={scale} open={adding} onClose={() => setAdding(false)} />
        <Sheet open={!!subFor} onClose={() => setSubFor(null)} title={subFor ?? ""}>
          {subFor && <Substitutes name={subFor} dish={r.title} />}
        </Sheet>
        <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={r.title}>
          <div className="divide-y divide-line">
            <button className="flex h-14 w-full items-center gap-3 text-left text-[17px]" onClick={() => { setMenuOpen(false); setPhotoOpen(true); }}>
              <IconCamera className="text-muted" /> Change photo
            </button>
            <Link href={`/recipes/${r.id}/edit`} className="flex h-14 w-full items-center gap-3 text-[17px]">
              <IconPencil className="text-muted" /> Edit recipe
            </Link>
          </div>
        </Sheet>

        {ingredients.length > 0 && (
          <section className="mt-10">
            <div className="flex items-baseline justify-between border-b border-ink pb-2">
              <h2 className="recipe-title text-[25px]">Ingredients</h2>
              <div className="flex gap-3 text-[14px] text-muted">
                {[0.5, 1, 1.5, 2].map((x) => (
                  <button key={x} onClick={() => setScale(x)} className={cx("tabular-nums", scale === x && "font-semibold text-ink underline decoration-2 underline-offset-[5px]")}>
                    {x === 0.5 ? "½" : x === 1.5 ? "1½" : x}×
                  </button>
                ))}
              </div>
            </div>
            <ul>
              {ingredients.map((i) =>
                isIngredientHeading(i.raw_text || i.name, i.qty, i.unit) ? (
                  <li key={i.id} className="menu-label pt-5 pb-1 text-muted">{i.name}</li>
                ) : (
                  <li key={i.id} className="border-b hairline">
                    <button className="grid w-full grid-cols-[64px_1fr_auto] gap-3.5 py-2.5 text-left text-[16px] leading-snug active:bg-soft" onClick={() => setSubFor(i.name)}>
                      <span className="text-right font-semibold tabular-nums">{amountOf(i)}</span>
                      <span className={cx(!i.parsed_ok && "text-[#c0392b]")}>
                        {i.name}
                        {i.note && <span className="recipe-title text-[15.5px] text-muted italic"> {i.note}</span>}
                        {(() => {
                          // Metric recipes: show the US amount too ("200 g" → about 7 oz).
                          const us = /\b(oz|cups?|lb)\b/i.test(i.name) ? null : usEquivalent(i.qty != null ? Number(i.qty) * scale : null, i.unit);
                          return us ? <span className="text-muted"> (about {us})</span> : null;
                        })()}
                      </span>
                      {substitutesFor(i.name) ? <IconSwap className="mt-1 text-[14px] text-muted/70" aria-label="Has substitutes" /> : <span />}
                    </button>
                  </li>
                ),
              )}
            </ul>
          </section>
        )}

        <section className="mt-10">
          <h2 className="recipe-title border-b border-ink pb-2 text-[25px]">Method</h2>
          <ol className="mt-4 space-y-6">
            {steps.map((s, idx) =>
              s.isSection ? (
                <li key={idx} className="menu-label pt-2 text-muted">{s.text}</li>
              ) : (
                <li key={idx} className="grid grid-cols-[34px_1fr] gap-2.5">
                  <span className="recipe-title text-[32px] leading-[0.95] text-accent">{++stepNo}</span>
                  <StepText className="recipe-title text-[18px] leading-relaxed" text={s.text.replace(/^\d+\.\s*/, "")} ingredients={stepIngredients} amount={amountOf} />
                </li>
              ),
            )}
            {!steps.length && <p className="text-muted">No steps saved.</p>}
          </ol>
        </section>

        {r.notes && (
          <section className="mt-10">
            <h2 className="recipe-title border-b border-ink pb-2 text-[25px]">Notes</h2>
            <p className="recipe-title mt-3 text-[17px] leading-relaxed whitespace-pre-line italic">{fahrenheit(r.notes)}</p>
          </section>
        )}
      </div>
    </article>
  );
}
