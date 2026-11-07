"use client";
import { useEffect, useState } from "react";
import { IconCheck, IconClock } from "@/components/icons";
import { cx } from "@/components/ui";
import type { RecipeDraft } from "@/lib/types";

/** A dinner picked from outside our library: a recipe from a site, or a quick idea. */
export interface PickedDraft {
  key: string;
  title: string;
  draft: RecipeDraft;
  kind: "web" | "idea";
}

interface WebCard {
  url: string;
  title: string;
  site: string;
  image: string | null;
  prepMin: number | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const read = <T,>(k: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "null") as T | null;
  } catch {
    return null;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* full or private */
  }
};

function Check({ on }: { on: boolean }) {
  return (
    <span className={cx("absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full text-[15px] shadow", on ? "bg-accent text-white" : "bg-white/85 text-transparent")}>
      <IconCheck strokeWidth={3} />
    </span>
  );
}

/** New recipes to try: real recipes from trusted sites that suit the stores on this trip. */
export function NewRecipes({ storeNames, maxPrep, picked, onPick, onUnpick, bare = false }: { storeNames: string[]; maxPrep: number | null; picked: string[]; onPick: (p: PickedDraft) => void; onUnpick: (key: string) => void; bare?: boolean }) {
  const key = `cb:trip-new:${today()}:${storeNames.join("+")}:${maxPrep ?? ""}`;
  const [cards, setCards] = useState<WebCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const hit = read<WebCard[]>(key);
    setCards(hit);
    // Opened from "Something new": start right away.
    if (bare && !hit) find();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function find() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/new-recipes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stores: storeNames, maxMinutes: maxPrep }) }).then((x) => x.json());
      if (!r.ok) setError(r.error ?? "Couldn’t find recipes right now.");
      else {
        setCards(r.cards);
        write(key, r.cards);
      }
    } catch {
      setError(navigator.onLine ? "Couldn’t find recipes right now." : "You’re offline.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(c: WebCard) {
    if (picked.includes(c.url)) return onUnpick(c.url);
    setOpening(c.url);
    setError(null);
    try {
      const res = await fetch("/api/recipe-from-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: c.url }) });
      const body = await res.json();
      if (!res.ok) throw new Error();
      onPick({ key: c.url, title: c.title, draft: { ...(body.recipe as RecipeDraft), tags: [...new Set([...((body.recipe as RecipeDraft).tags ?? []).slice(0, 4), "Discovered"])] }, kind: "web" });
    } catch {
      setError("Couldn’t open that recipe. Try another.");
    } finally {
      setOpening(null);
    }
  }

  return (
    <section className={bare ? "mt-4" : "mt-8"}>
      {bare ? (
        <h4 className="menu-label px-1 text-muted">New recipes</h4>
      ) : (
        <>
          <h3 className="recipe-title px-1 text-[22px] font-semibold">New recipes to try</h3>
          <p className="px-1 text-[13px] text-muted">From trusted recipe sites, for {storeNames.join(" and ")}</p>
        </>
      )}
      {!cards ? (
        <button onClick={find} disabled={busy} className="card mt-3 flex h-14 w-full items-center justify-center text-[16px] font-semibold text-accent disabled:opacity-60">
          {busy ? "Looking through recipe sites…" : "Find new recipes"}
        </button>
      ) : (
        <>
          <ul className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
            {cards.map((c) => {
              const on = picked.includes(c.url);
              return (
                <li key={c.url} className="w-[200px] shrink-0">
                  <button onClick={() => toggle(c)} disabled={!!opening} className="w-full text-left active:scale-[0.98]" aria-pressed={on}>
                    <div className={cx("relative aspect-[4/3] overflow-hidden rounded-2xl bg-soft", on && "ring-3 ring-accent")}>
                      {c.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                      )}
                      <Check on={on} />
                      {opening === c.url && <span className="absolute inset-0 grid place-items-center bg-black/40 text-[14px] font-semibold text-white">Opening…</span>}
                    </div>
                    <p className="menu-label mt-1.5 truncate px-0.5 text-accent">{c.site}</p>
                    <p className="recipe-title line-clamp-2 px-0.5 text-[15px] leading-snug font-semibold">{c.title}</p>
                    {c.prepMin != null && <p className="flex items-center gap-1 px-0.5 text-[12px] text-muted"><IconClock /> {c.prepMin} min</p>}
                  </button>
                </li>
              );
            })}
          </ul>
          <button onClick={find} disabled={busy} className="mt-1 h-10 px-1 text-[14px] text-accent disabled:opacity-50">{busy ? "Searching…" : "Find different ones"}</button>
        </>
      )}
      {error && <p className="mt-2 px-1 text-[13px] text-[#d23c3c]">{error}</p>}
    </section>
  );
}

/** Quick ideas: dinners built from products we buy at these stores (marked Idea until cooked). */
export function QuickIdeas({ request, storeNames, picked, onPick, onUnpick, bare = false }: { request: Record<string, unknown>; storeNames: string[]; picked: string[]; onPick: (p: PickedDraft) => void; onUnpick: (key: string) => void; bare?: boolean }) {
  const key = `cb:trip-ideas:${today()}:${storeNames.join("+")}`;
  const [ideas, setIdeas] = useState<{ title: string; draft: RecipeDraft }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const hit = read<{ title: string; draft: RecipeDraft }[]>(key);
    setIdeas(hit);
    if (bare && !hit) suggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function suggest() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/ai/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...request, mealCount: 4, favoritesPct: 0, pinnedIds: [] }) }).then((x) => x.json());
      if (!r.ok) setError(r.error ?? "Ideas aren’t available right now.");
      else {
        const next = (r.meals as { title: string; draft?: RecipeDraft }[]).filter((m) => m.draft).map((m) => ({ title: m.title, draft: m.draft! }));
        setIdeas(next);
        write(key, next);
      }
    } catch {
      setError("Ideas aren’t available right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={bare ? "mt-4" : "mt-8"}>
      {bare ? (
        <h4 className="menu-label px-1 text-muted">Quick ideas</h4>
      ) : (
        <>
          <h3 className="recipe-title px-1 text-[22px] font-semibold">Quick ideas</h3>
          <p className="px-1 text-[13px] text-muted">Simple dinners from what you buy at {storeNames.join(" and ")}, marked Idea until you’ve made them</p>
        </>
      )}
      {!ideas ? (
        <button onClick={suggest} disabled={busy} className="card mt-3 flex h-14 w-full items-center justify-center text-[16px] font-semibold text-accent disabled:opacity-60">
          {busy ? "Thinking…" : "Suggest quick ideas"}
        </button>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {ideas.map((i) => {
              const on = picked.includes(`idea:${i.title}`);
              return (
                <li key={i.title}>
                  <button
                    onClick={() => (on ? onUnpick(`idea:${i.title}`) : onPick({ key: `idea:${i.title}`, title: i.title, draft: i.draft, kind: "idea" }))}
                    className={cx("card relative w-full p-4 pr-12 text-left active:scale-[0.99]", on && "ring-2 ring-accent")}
                    aria-pressed={on}
                  >
                    <p className="menu-label text-muted">Idea{i.draft.prepMin ? ` · ${i.draft.prepMin} min` : ""}</p>
                    <p className="recipe-title mt-0.5 text-[17px] leading-snug font-semibold">{i.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{i.draft.ingredients.slice(0, 5).map((g) => g.name).join(", ")}</p>
                    <Check on={on} />
                  </button>
                </li>
              );
            })}
          </ul>
          <button onClick={suggest} disabled={busy} className="mt-1 h-10 px-1 text-[14px] text-accent disabled:opacity-50">{busy ? "Thinking…" : "Different ideas"}</button>
        </>
      )}
      {error && <p className="mt-2 px-1 text-[13px] text-[#d23c3c]">{error}</p>}
    </section>
  );
}
