"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, cx } from "@/components/ui";
import { IconCheck } from "@/components/icons";
import { RecipeImage } from "@/components/RecipeImage";
import { useMembership } from "@/components/AppShell";
import { supabaseBrowser } from "@/lib/supabase/client";
import { isDuplicate, loadExistingKeys, saveRecipe } from "@/lib/data/recipes";
import type { RecipeDraft } from "@/lib/types";

export type PageResult =
  | { kind: "several"; site: string; recipes: RecipeDraft[] }
  | { kind: "links"; site: string; links: { title: string; url: string }[] };

/** A page with several recipes (or links to them): tick the ones to keep. */
export function PickRecipes({ page, onCancel }: { page: PageResult; onCancel: () => void }) {
  const router = useRouter();
  const { householdId } = useMembership();
  const items =
    page.kind === "several"
      ? page.recipes.map((r, i) => ({ key: String(i), title: r.title, image: r.imageUrl ?? null, detail: `${r.ingredients.length} ingredients` }))
      : page.links.map((l) => ({ key: l.url, title: l.title, image: null, detail: new URL(l.url).hostname.replace(/^www\./, "") }));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(page.kind === "several" ? items.map((i) => i.key) : []));
  const [progress, setProgress] = useState<string | null>(null);
  const [done, setDone] = useState<{ saved: number; skipped: string[]; failed: string[] } | null>(null);

  const toggle = (k: string) =>
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  async function saveAll() {
    const db = supabaseBrowser();
    const existing = await loadExistingKeys(db);
    const chosen = items.filter((i) => picked.has(i.key));
    let saved = 0;
    const skipped: string[] = [];
    const failed: string[] = [];
    for (const [n, it] of chosen.entries()) {
      setProgress(`Saving ${n + 1} of ${chosen.length}…`);
      try {
        let draft: RecipeDraft | null = null;
        if (page.kind === "several") draft = page.recipes[Number(it.key)];
        else {
          const res = await fetch("/api/recipe-from-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: it.key }) });
          draft = res.ok ? ((await res.json()).recipe as RecipeDraft) : null;
        }
        if (!draft) {
          failed.push(it.title);
          continue;
        }
        if (isDuplicate(draft, existing)) {
          skipped.push(draft.title);
          continue;
        }
        await saveRecipe(db, householdId, draft);
        saved++;
      } catch (e) {
        if (e instanceof Error && e.message.includes("duplicate")) skipped.push(it.title);
        else failed.push(it.title);
      }
    }
    setProgress(null);
    setDone({ saved, skipped, failed });
    router.refresh();
  }

  if (done) {
    return (
      <div className="card mt-4 p-5">
        <p className="recipe-title text-[22px] font-semibold">
          {done.saved ? `Saved ${done.saved} ${done.saved === 1 ? "recipe" : "recipes"}` : "Nothing new saved"}
        </p>
        {done.skipped.length > 0 && <p className="mt-2 text-[14px] text-muted">Already saved: {done.skipped.join(", ")}</p>}
        {done.failed.length > 0 && (
          <p className="mt-2 text-[14px] text-muted">
            No recipe found on: {done.failed.join(", ")}. These may be articles rather than recipes, or the site may not allow apps to read them.
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>Add more</Button>
          <Button className="flex-1" onClick={() => router.push("/recipes")}>See recipes</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-end justify-between px-1">
        <div>
          <p className="menu-label text-muted">{page.site}</p>
          <p className="recipe-title text-[22px] font-semibold">
            {page.kind === "several" ? `${items.length} recipes on this page` : `${items.length} links on this page`}
          </p>
        </div>
        <button className="-mr-2 h-11 px-2 text-[15px] text-accent" onClick={() => setPicked(picked.size === items.length ? new Set() : new Set(items.map((i) => i.key)))}>
          {picked.size === items.length ? "Clear" : "Select all"}
        </button>
      </div>
      
      <ul className="card mt-3 divide-y divide-line overflow-hidden">
        {items.map((it) => {
          const on = picked.has(it.key);
          return (
            <li key={it.key}>
              <button className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left active:bg-soft" onClick={() => toggle(it.key)} aria-pressed={on}>
                <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", on ? "border-accent bg-accent text-white" : "border-line")}>
                  {on && <IconCheck className="text-[13px]" strokeWidth={3} />}
                </span>
                {it.image && (
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                    <RecipeImage src={it.image} title={it.title} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="recipe-title block text-[16px] leading-snug font-semibold">{it.title}</span>
                  <span className="block truncate text-[12px] text-muted">{it.detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Button size="lg" className="mt-4 w-full" disabled={!picked.size || !!progress} onClick={saveAll}>
        {progress ?? `Save ${picked.size || ""} ${picked.size === 1 ? "recipe" : "recipes"}`}
      </Button>
      <button className="mt-2 h-11 w-full text-[15px] text-muted" onClick={onCancel}>Cancel</button>
    </div>
  );
}
