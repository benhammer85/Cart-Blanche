"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMembership } from "@/components/AppShell";
import { saveRecipe } from "@/lib/data/recipes";
import { supabaseBrowser } from "@/lib/supabase/client";
import { IconCheck, IconClock } from "@/components/icons";
import { Button, Sheet, cx } from "@/components/ui";
import type { RecipeDraft } from "@/lib/types";

/** A dinner picked from outside our library: a recipe from a site, or a quick idea. */
export interface PickedDraft {
  key: string;
  title: string;
  draft: RecipeDraft;
  kind: "web" | "idea";
  /** set once it's saved to our recipes */
  recipeId?: string;
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

/** Save a picked recipe to our library; the week then uses the saved copy. */
function useSaveToRecipes() {
  const router = useRouter();
  const { householdId } = useMembership();
  const [saved, setSaved] = useState<Record<string, string>>({});
  async function save(key: string, draft: RecipeDraft): Promise<{ id: string | null; error: string | null }> {
    try {
      const id = await saveRecipe(supabaseBrowser(), householdId, draft);
      setSaved((cur) => ({ ...cur, [key]: id }));
      router.refresh();
      return { id, error: null };
    } catch (e) {
      const dup = e instanceof Error && /duplicate|unique/i.test(e.message);
      return { id: null, error: dup ? "That one is already in your recipes." : "Couldn’t save it. Try again." };
    }
  }
  return { saved, save };
}

/** A recipe's details before you add it to the week. */
function Preview({ title, image, site, url, draft, loading, error, on, onToggle, onClose, saved, onSave }: {
  title: string; image?: string | null; site?: string; url?: string; draft: RecipeDraft | null; loading: boolean; error: string | null;
  on: boolean; onToggle: () => void; onClose: () => void; saved: boolean; onSave: () => Promise<string | null>;
}) {
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const steps = (draft?.steps ?? []).filter((x) => x.text.trim());
  let n = 0;
  return (
    <Sheet open onClose={onClose} title={title}>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" referrerPolicy="no-referrer" className="-mt-1 mb-3 aspect-[16/9] w-full rounded-2xl object-cover" />
      )}
      <p className="flex flex-wrap items-center gap-x-3 text-[14px] text-muted">
        {site && (url ? <a href={url} target="_blank" rel="noreferrer" className="text-accent">{site}</a> : <span>{site}</span>)}
        {draft?.prepMin ? <span className="flex items-center gap-1"><IconClock /> {draft.prepMin} min prep</span> : null}
        {draft?.servings ? <span>serves {draft.servings}</span> : null}
      </p>
      {loading && <div className="mt-4 space-y-2">{[0, 1, 2, 3].map((k) => <div key={k} className="skeleton h-5" />)}</div>}
      {error && <p className="mt-4 text-[15px] text-[#d23c3c]">{error}</p>}
      {draft && (
        <>
          <h3 className="menu-label mt-5 mb-2 text-muted">Ingredients</h3>
          <ul className="space-y-1.5 text-[16px] leading-snug">
            {draft.ingredients.map((g, k) => <li key={k}>{g.raw || g.name}</li>)}
          </ul>
          {steps.length > 0 && (
            <>
              <h3 className="menu-label mt-5 mb-2 text-muted">Steps</h3>
              <ol className="space-y-3 text-[16px] leading-relaxed">
                {steps.map((x, k) =>
                  x.isSection ? (
                    <li key={k} className="pt-1 font-semibold">{x.text}</li>
                  ) : (
                    <li key={k} className="flex gap-3"><span className="w-5 shrink-0 font-semibold text-muted tabular-nums">{++n}</span><span>{x.text.replace(/^\d+\.\s*/, "")}</span></li>
                  ),
                )}
              </ol>
            </>
          )}
        </>
      )}
      {note && <p className="mt-4 text-[14px] text-[#d23c3c]">{note}</p>}
      <div className="sticky bottom-0 mt-5 flex gap-2 bg-bg pt-2">
        <Button
          size="lg"
          variant="secondary"
          className="flex-1 whitespace-nowrap"
          disabled={!draft || saved || saving}
          onClick={async () => { setSaving(true); setNote(await onSave()); setSaving(false); }}
        >
          {saved ? "Saved" : saving ? "Saving…" : "Save recipe"}
        </Button>
        <Button size="lg" variant={on ? "secondary" : "primary"} className="flex-1 whitespace-nowrap" disabled={!draft} onClick={() => { onToggle(); onClose(); }}>
          {on ? "Remove" : "Add to week"}
        </Button>
      </div>
    </Sheet>
  );
}

/** New recipes to try: real recipes from trusted sites that suit the stores on this trip. */
export function NewRecipes({ storeNames, maxPrep, picked, onPick, onUnpick, bare = false }: { storeNames: string[]; maxPrep: number | null; picked: string[]; onPick: (p: PickedDraft) => void; onUnpick: (key: string) => void; bare?: boolean }) {
  const key = `cb:trip-new:${today()}:${storeNames.join("+")}:${maxPrep ?? ""}`;
  const [cards, setCards] = useState<WebCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RecipeDraft>>({});
  const [viewing, setViewing] = useState<WebCard | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const { saved, save } = useSaveToRecipes();
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

  /** The recipe itself, read once and kept for the preview and for adding. */
  async function load(c: WebCard): Promise<RecipeDraft | null> {
    if (drafts[c.url]) return drafts[c.url];
    const res = await fetch("/api/recipe-from-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: c.url }) });
    const body = await res.json();
    if (!res.ok) return null;
    const d = { ...(body.recipe as RecipeDraft), tags: [...new Set([...((body.recipe as RecipeDraft).tags ?? []).slice(0, 4), "Discovered"])] };
    setDrafts((cur) => ({ ...cur, [c.url]: d }));
    return d;
  }

  async function toggle(c: WebCard) {
    if (picked.includes(c.url)) return onUnpick(c.url);
    setOpening(c.url);
    setError(null);
    try {
      const d = await load(c);
      if (!d) throw new Error();
      onPick({ key: c.url, title: c.title, draft: d, kind: "web", recipeId: saved[c.url] });
    } catch {
      setError("Couldn’t open that recipe. Try another.");
    } finally {
      setOpening(null);
    }
  }

  async function view(c: WebCard) {
    setViewing(c);
    setViewError(null);
    try {
      if (!(await load(c))) setViewError("Couldn’t open that recipe.");
    } catch {
      setViewError(navigator.onLine ? "Couldn’t open that recipe." : "You’re offline.");
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
                <li key={c.url} className="relative w-[200px] shrink-0">
                  <button onClick={() => view(c)} className="w-full text-left active:scale-[0.98]">
                    <div className={cx("relative aspect-[4/3] overflow-hidden rounded-2xl bg-soft", on && "ring-3 ring-accent")}>
                      {c.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                      )}
                      {opening === c.url && <span className="absolute inset-0 grid place-items-center bg-black/40 text-[14px] font-semibold text-white">Adding…</span>}
                    </div>
                    <p className="menu-label mt-1.5 truncate px-0.5 text-accent">{c.site}</p>
                    <p className="recipe-title line-clamp-2 px-0.5 text-[15px] leading-snug font-semibold">{c.title}</p>
                    {c.prepMin != null && <p className="flex items-center gap-1 px-0.5 text-[12px] text-muted"><IconClock /> {c.prepMin} min</p>}
                  </button>
                  <button onClick={() => toggle(c)} disabled={!!opening} className="absolute top-0 right-0 h-12 w-12" aria-pressed={on} aria-label={on ? `Remove ${c.title}` : `Add ${c.title}`}>
                    <Check on={on} />
                  </button>
                </li>
              );
            })}
          </ul>
          <button onClick={find} disabled={busy} className="mt-1 h-10 px-1 text-[14px] text-accent disabled:opacity-50">{busy ? "Searching…" : "Find different ones"}</button>
        </>
      )}
      {error && <p className="mt-2 px-1 text-[13px] text-[#d23c3c]">{error}</p>}
      {viewing && (
        <Preview
          title={viewing.title}
          image={viewing.image}
          site={viewing.site}
          url={viewing.url}
          draft={drafts[viewing.url] ?? null}
          loading={!drafts[viewing.url] && !viewError}
          error={viewError}
          on={picked.includes(viewing.url)}
          onToggle={() => toggle(viewing)}
          onClose={() => setViewing(null)}
          saved={!!saved[viewing.url]}
          onSave={async () => {
            const d = drafts[viewing.url];
            if (!d) return null;
            const { id, error } = await save(viewing.url, d);
            if (id && picked.includes(viewing.url)) onPick({ key: viewing.url, title: viewing.title, draft: d, kind: "web", recipeId: id });
            return error;
          }}
        />
      )}
    </section>
  );
}

/** Quick ideas: dinners built from products we buy at these stores (marked Idea until cooked). */
export function QuickIdeas({ request, storeNames, picked, onPick, onUnpick, bare = false }: { request: Record<string, unknown>; storeNames: string[]; picked: string[]; onPick: (p: PickedDraft) => void; onUnpick: (key: string) => void; bare?: boolean }) {
  const key = `cb:trip-ideas:${today()}:${storeNames.join("+")}`;
  const [ideas, setIdeas] = useState<{ title: string; draft: RecipeDraft }[] | null>(null);
  const [viewing, setViewing] = useState<{ title: string; draft: RecipeDraft } | null>(null);
  const { saved, save } = useSaveToRecipes();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const hit = read<{ title: string; draft: RecipeDraft }[]>(key);
    setIdeas(hit);
    if (bare && !hit) suggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const toggleIdea = (i: { title: string; draft: RecipeDraft }) =>
    picked.includes(`idea:${i.title}`) ? onUnpick(`idea:${i.title}`) : onPick({ key: `idea:${i.title}`, title: i.title, draft: i.draft, kind: "idea", recipeId: saved[`idea:${i.title}`] });

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
                <li key={i.title} className="relative">
                  <button onClick={() => setViewing(i)} className={cx("card w-full p-4 pr-12 text-left active:scale-[0.99]", on && "ring-2 ring-accent")}>
                    <p className="menu-label text-muted">Idea{i.draft.prepMin ? ` · ${i.draft.prepMin} min` : ""}</p>
                    <p className="recipe-title mt-0.5 text-[17px] leading-snug font-semibold">{i.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{i.draft.ingredients.slice(0, 5).map((g) => g.name).join(", ")}</p>
                  </button>
                  <button onClick={() => toggleIdea(i)} className="absolute top-0 right-0 h-12 w-12" aria-pressed={on} aria-label={on ? `Remove ${i.title}` : `Add ${i.title}`}>
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
      {viewing && (
        <Preview title={viewing.title} site="Idea" draft={viewing.draft} loading={false} error={null} on={picked.includes(`idea:${viewing.title}`)} onToggle={() => toggleIdea(viewing)} onClose={() => setViewing(null)}
          saved={!!saved[`idea:${viewing.title}`]}
          onSave={async () => {
            const k = `idea:${viewing.title}`;
            const { id, error } = await save(k, viewing.draft);
            if (id && picked.includes(k)) onPick({ key: k, title: viewing.title, draft: viewing.draft, kind: "idea", recipeId: id });
            return error;
          }}
        />
      )}
    </section>
  );
}
