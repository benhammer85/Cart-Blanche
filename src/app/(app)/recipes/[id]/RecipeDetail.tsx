"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBack, IconClock, IconPencil, IconUsers, IconLink } from "@/components/icons";
import { Button, Chip, cx } from "@/components/ui";
import { RecipeImage } from "@/components/RecipeImage";
import { formatAmount } from "@/lib/units";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Recipe } from "@/lib/types";

export function RecipeDetail({ recipe: r }: { recipe: Recipe }) {
  const router = useRouter();
  const [tab, setTab] = useState<"ingredients" | "steps">("ingredients");
  const [scale, setScale] = useState(1);
  const ingredients = [...(r.recipe_ingredients ?? [])].sort((a, b) => a.position - b.position);
  const steps = r.steps ?? [];
  let stepNo = 0;

  async function archive() {
    if (!confirm(`Delete “${r.title}”? Past plans keep their history.`)) return;
    await supabaseBrowser().from("recipes").update({ archived: true }).eq("id", r.id);
    router.push("/recipes");
    router.refresh();
  }

  return (
    <article>
      <div className="relative">
        <div className={r.image_path ? "aspect-[4/3] w-full" : "aspect-[5/2] w-full"}>
          <RecipeImage src={r.image_path} title={r.title} placeholderText={false} />
        </div>
        <div className="pt-safe absolute inset-x-0 top-0 flex justify-between px-4 pt-2">
          <Link href="/recipes" className="grid h-10 w-10 place-items-center rounded-full bg-black/35 text-2xl text-white backdrop-blur" aria-label="Back">
            <IconBack />
          </Link>
          <Link href={`/recipes/${r.id}/edit`} className="grid h-10 w-10 place-items-center rounded-full bg-black/35 text-xl text-white backdrop-blur" aria-label="Edit">
            <IconPencil />
          </Link>
        </div>
      </div>

      <div className="relative -mt-6 rounded-t-[1.75rem] bg-bg px-5 pt-6">
        <h1 className="recipe-title text-[28px] leading-tight font-semibold">{r.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-muted">
          {r.prep_min != null && <span className="flex items-center gap-1"><IconClock /> {r.prep_min} min prep{r.cook_min ? ` · ${r.cook_min} cook` : ""}</span>}
          <span className="flex items-center gap-1"><IconUsers /> serves {Number(r.servings) * scale}</span>
          <span>{r.times_made ? `made ${r.times_made}×${r.last_made_at ? `, last ${new Date(r.last_made_at + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}` : "not made yet"}</span>
        </div>
        {(r.tags.length > 0 || r.kid_friendly) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {r.kid_friendly && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent">Kids eat it</span>}
            {r.tags.map((t) => <span key={t} className="rounded-full bg-soft px-2.5 py-1 text-[12px]">{t}</span>)}
          </div>
        )}
        {r.source_url && (
          <a href={r.source_url} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1.5 text-[14px] text-accent">
            <IconLink /> {r.source_name ?? new URL(r.source_url).hostname}
          </a>
        )}

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
              {ingredients.map((i) => (
                <li key={i.id} className="flex gap-3 py-3 text-[16px]">
                  <span className="w-20 shrink-0 font-semibold tabular-nums">{formatAmount(i.qty != null ? Number(i.qty) * scale : null, i.unit, i.qty_max != null ? Number(i.qty_max) * scale : null)}</span>
                  <span className={cx(!i.parsed_ok && "text-[#d23c3c]")}>
                    {i.name}
                    {i.note && <span className="text-muted">, {i.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="mt-4 space-y-5">
            {steps.map((s, idx) =>
              s.isSection ? (
                <li key={idx} className="pt-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{s.text}</li>
              ) : (
                <li key={idx} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-bold text-accent-ink">{++stepNo}</span>
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
        <Button variant="danger" className="mt-8 w-full" onClick={archive}>Delete recipe</Button>
      </div>
    </article>
  );
}
