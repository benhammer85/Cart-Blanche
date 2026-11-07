"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, cx } from "@/components/ui";
import { IconClock, IconHeart, IconPlus } from "@/components/icons";
import { StoreBadge } from "@/components/StoreBadge";
import { useMembership } from "@/components/AppShell";
import { supabaseBrowser } from "@/lib/supabase/client";
import { saveRecipe } from "@/lib/data/recipes";
import { PLAN_INBOX_KEY } from "@/lib/planInbox";
import type { RecipeDraft } from "@/lib/types";

interface Card {
  url: string;
  title: string;
  site: string;
  image: string | null;
  prepMin: number | null;
  ingredientCount: number;
  why: string;
}

const STYLES = ["Instant Pot", "One pot", "Sheet pan", "Grill"];
const CACHE = "cb:discover:";

/**
 * Real recipes from sites like NYT Cooking and Gimme Some Oven, chosen to match
 * the recipes we flagged in Crouton (Loved, Molly/Asa and Saul favorites).
 * Results are kept for the day so browsing doesn't spend searches.
 */
export function Discover({ stores }: { stores: { id: string; name: string }[] }) {
  const router = useRouter();
  const { householdId } = useMembership();
  const [store, setStore] = useState<string | null>(null);
  const [maxMinutes, setMaxMinutes] = useState<number | null>(null);
  const [kidFriendly, setKidFriendly] = useState(false);
  const [style, setStyle] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, "saving" | "saved">>({});

  const key = `${CACHE}${new Date().toISOString().slice(0, 10)}:${store ?? ""}:${maxMinutes ?? ""}:${kidFriendly}:${style ?? ""}`;
  useEffect(() => {
    try {
      const hit = JSON.parse(localStorage.getItem(key) ?? "null");
      setCards(hit?.cards ?? null);
    } catch {
      setCards(null);
    }
    setError(null);
  }, [key]);

  async function search() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/ai/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ store, maxMinutes, kidFriendly, style }),
      }).then((x) => x.json());
      if (!r.ok) setError(r.error ?? "Couldn’t find recipes right now.");
      else {
        setCards(r.cards);
        try {
          localStorage.setItem(key, JSON.stringify({ cards: r.cards }));
        } catch {
          /* ignore */
        }
      }
    } catch {
      setError(navigator.onLine ? "Couldn’t find recipes right now." : "You’re offline.");
    } finally {
      setBusy(false);
    }
  }

  async function fetchDraft(url: string): Promise<RecipeDraft | null> {
    const res = await fetch("/api/recipe-from-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
    const body = await res.json();
    return res.ok ? (body.recipe as RecipeDraft) : null;
  }

  async function save(c: Card) {
    setSaved((s) => ({ ...s, [c.url]: "saving" }));
    const draft = await fetchDraft(c.url);
    if (!draft) {
      setSaved((s) => {
        const n = { ...s };
        delete n[c.url];
        return n;
      });
      setError("Couldn’t save that one. Open it to save by hand.");
      return;
    }
    try {
      await saveRecipe(supabaseBrowser(), householdId, { ...draft, tags: [...new Set([...draft.tags.slice(0, 4), "Discovered"])] });
      setSaved((s) => ({ ...s, [c.url]: "saved" }));
      router.refresh();
    } catch (e) {
      const dup = e instanceof Error && e.message.includes("duplicate");
      setSaved((s) => ({ ...s, [c.url]: "saved" }));
      if (!dup) setError("Couldn’t save that one.");
    }
  }

  async function addToWeek(c: Card) {
    const draft = await fetchDraft(c.url);
    if (!draft) return setError("Couldn’t open that one.");
    try {
      const cur = JSON.parse(sessionStorage.getItem(PLAN_INBOX_KEY) ?? "[]");
      sessionStorage.setItem(PLAN_INBOX_KEY, JSON.stringify([...cur, draft]));
    } catch {
      /* ignore */
    }
    router.push("/plan");
  }

  return (
    <div className="px-4">
      <p className="mt-3 px-1 text-[14px] text-muted">
        Recipes from trusted cooking sites, picked to match the recipes you love.
      </p>

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip active={!store} onClick={() => setStore(null)}>Any store</Chip>
        {stores.map((s) => (
          <Chip key={s.id} active={store === s.name} onClick={() => setStore(store === s.name ? null : s.name)}>
            <span className="flex items-center gap-1.5"><StoreBadge name={s.name} size={18} />{s.name}</span>
          </Chip>
        ))}
      </div>
      <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
        {[null, 20, 30, 45].map((m) => (
          <Chip key={String(m)} active={maxMinutes === m} onClick={() => setMaxMinutes(m)}>{m ? `${m} min` : "Any time"}</Chip>
        ))}
        <Chip active={kidFriendly} onClick={() => setKidFriendly(!kidFriendly)}>Kid-friendly</Chip>
        {STYLES.map((s) => (
          <Chip key={s} active={style === s} onClick={() => setStyle(style === s ? null : s)}>{s}</Chip>
        ))}
      </div>

      <Button size="lg" className="mt-4 w-full" onClick={search} disabled={busy}>
        {busy ? "Searching recipe sites…" : cards ? "Find different recipes" : "Find recipes"}
      </Button>
      {busy && <p className="mt-2 text-center text-[13px] text-muted">This takes about 20 seconds.</p>}
      {error && <p className="card mt-3 p-3 text-[14px] text-[#d23c3c]">{error}</p>}

      {cards && (
        <ul className="mt-3 space-y-4 pb-6">
          {cards.map((c) => (
            <li key={c.url} className="card overflow-hidden">
              <a href={`/recipes/new?url=${encodeURIComponent(c.url)}`} className="block">
                <div className="aspect-[16/10] bg-soft">
                  {c.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt="" loading="lazy" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  )}
                </div>
                <div className="p-4 pb-2">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-accent">{c.site}</p>
                  <p className="recipe-title mt-0.5 text-[19px] leading-snug font-semibold">{c.title}</p>
                  <p className="mt-1 flex items-center gap-1 text-[13px] text-muted">
                    {c.prepMin != null && (<><IconClock /> {c.prepMin} min · </>)}
                    {c.ingredientCount} ingredients
                  </p>
                </div>
              </a>
              <div className="flex border-t hairline text-[15px] font-semibold">
                <button onClick={() => save(c)} disabled={!!saved[c.url]} className={cx("flex h-12 flex-1 items-center justify-center gap-1.5", saved[c.url] === "saved" ? "text-ok" : "text-accent")}>
                  <IconHeart filled={saved[c.url] === "saved"} /> {saved[c.url] === "saved" ? "Saved" : saved[c.url] === "saving" ? "Saving…" : "Save"}
                </button>
                <button onClick={() => addToWeek(c)} className="flex h-12 flex-1 items-center justify-center gap-1.5 border-l hairline text-muted">
                  <IconPlus /> This week
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
