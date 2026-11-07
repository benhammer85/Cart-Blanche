"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RecipeEditor, emptyDraft } from "@/components/RecipeEditor";
import { Button, PageHeader, TextArea, cx } from "@/components/ui";
import Link from "next/link";
import { IconCamera, IconSearch } from "@/components/icons";
import { parseIngredientLine, parsePlainTextRecipe } from "@/lib/ingredientParser";
import { inferMainProtein, inferMealTypes } from "@/lib/infer";
import { isDuplicate, loadExistingKeys, resizeImage, saveRecipe } from "@/lib/data/recipes";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useMembership } from "@/components/AppShell";
import type { RecipeDraft } from "@/lib/types";
import { PickRecipes, type PageResult } from "./PickRecipes";
import { socialSite } from "@/lib/import/social";
import type { DiscoverCard } from "@/lib/import/searchCards";

interface Found {
  cards: DiscoverCard[];
  caption: string | null;
  captionIsRecipe: boolean;
  needShot: boolean;
  error: string | null;
}

type Mode = "url" | "paste" | "manual";

const isLink = (t: string) => /^https?:\/\/\S+$/i.test(t.trim());

export function NewRecipe({ initialMode, initialUrl = null }: { initialMode: Mode; initialUrl?: string | null }) {
  const router = useRouter();
  const { householdId } = useMembership();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [url, setUrl] = useState(initialUrl ?? "");
  const [paste, setPaste] = useState("");
  const [draft, setDraft] = useState<RecipeDraft | null>(initialMode === "manual" ? emptyDraft() : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [page, setPage] = useState<PageResult | null>(null);
  const [found, setFound] = useState<Found | null>(null);

  // Opened from the share sheet with a link: read it straight away.
  const started = useRef(false);
  useEffect(() => {
    if (initialUrl && !started.current) {
      started.current = true;
      fetchUrl(initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  /** A whole page sent from Safari by the share shortcut (works on sites that turn apps away). */
  function looksLikeHtml(t: string) {
    return /^\s*(<!doctype html|<html)/i.test(t) || (t.includes("</head>") && t.includes("<body"));
  }
  function slimHtml(t: string) {
    return t
      .replace(/<script\b(?![^>]*ld\+json)[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<(style|svg|noscript|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\s(style|class|data-(?!src|lazy-src)[a-z-]+)="[^"]*"/gi, "")
      .slice(0, 3_800_000);
  }

  /** A TikTok or Instagram video (link or screenshot) → the full recipe online. */
  async function findOnline(body: { url?: string; image?: string; mimeType?: string }) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/recipes-from-social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
      setFound({
        cards: r.cards ?? [],
        caption: r.caption ?? null,
        captionIsRecipe: !!r.captionIsRecipe,
        needShot: !!r.needScreenshot,
        error: r.ok ? null : (r.error ?? "Couldn’t find it."),
      });
    } catch {
      setFound({ cards: [], caption: null, captionIsRecipe: false, needShot: false, error: "Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function fetchUrl(target = url, html?: string) {
    if (!html && socialSite(target)) return findOnline({ url: target });
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/recipes-from-page", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(html ? { html: slimHtml(html) } : { url: target }) });
      const body = await res.json();
      if (!res.ok) {
        if (body.blocked) setMode("paste");
        throw new Error(body.error ?? "Couldn’t read that page");
      }
      if (body.kind === "several" || body.kind === "links") {
        setPage(body as PageResult);
        return;
      }
      setDraft(body.recipe);
      const dup = isDuplicate(body.recipe, await loadExistingKeys(supabaseBrowser()));
      setWarning(dup ? `Heads up: ${dup}.` : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t read that page");
    } finally {
      setBusy(false);
    }
  }

  /** Pasted page text or a screenshot → Gemini reads it into a recipe draft. */
  async function readWithAi(body: { text?: string; image?: string; mimeType?: string }) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/ai/recipe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
      if (!r.ok) return r.error as string;
      const ai = r.recipe as { title: string; servings?: number | null; prepMinutes?: number | null; cookMinutes?: number | null; ingredients: string[]; steps: string[]; tags: string[]; source?: string | null };
      const ingredients = ai.ingredients.map((l) => parseIngredientLine(l));
      setDraft({
        ...emptyDraft("paste"),
        title: ai.title,
        servings: ai.servings || 4,
        prepMin: ai.prepMinutes ?? null,
        cookMin: ai.cookMinutes ?? null,
        ingredients,
        steps: ai.steps.map((text) => ({ text })),
        tags: ai.tags.slice(0, 6),
        sourceName: ai.source ?? null,
        sourceUrl: url.trim() || null,
        mealTypes: inferMealTypes(ai.title, ai.tags),
        mainProtein: inferMainProtein(ai.title, ingredients.map((i) => i.nameNorm)),
      });
      return null;
    } catch {
      return "Couldn’t read that. Check your connection and try again.";
    } finally {
      setBusy(false);
    }
  }

  async function toJpegBase64(file: File) {
    const small = await resizeImage(file, 1800, 0.85);
    return new Promise<string>((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).replace(/^data:[^,]+,/, ""));
      fr.readAsDataURL(small);
    });
  }

  async function readScreenshot(file: File) {
    const b64 = await toJpegBase64(file);
    const err = await readWithAi({ image: b64, mimeType: "image/jpeg" });
    // No recipe on the page (say, a TikTok video): look for it online by name.
    if (err && /find a recipe/i.test(err)) await findOnline({ image: b64, mimeType: "image/jpeg" });
    else if (err) setError(err);
  }

  async function readPaste() {
    // Messy page text (e.g. copied from traderjoes.com): let Gemini clean it up.
    const err = await readWithAi({ text: paste });
    if (!err) return;
    const p = parsePlainTextRecipe(paste);
    if (!p.ingredients.length) {
      setError(err.includes("set up") ? "Put ingredients first (one per line), then a blank line, then the steps." : err);
      return;
    }
    const ingredients = p.ingredients.map((l) => parseIngredientLine(l));
    const title = p.title ?? "";
    setDraft({
      ...emptyDraft("paste"),
      title,
      ingredients,
      steps: p.steps.map((text) => ({ text })),
      mealTypes: inferMealTypes(title, []),
      mainProtein: inferMainProtein(title, ingredients.map((i) => i.nameNorm)),
    });
    setError(null);
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const id = await saveRecipe(supabaseBrowser(), householdId, draft, { image: photo });
      router.push(`/recipes/${id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? (e.message.includes("duplicate") ? "A recipe with that link is already saved." : e.message) : "Couldn’t save");
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={draft ? "New recipe" : "Add a recipe"}
        back="/recipes"
        right={draft && <Button size="sm" onClick={save} disabled={busy || !draft.title.trim()}>Save</Button>}
      />
      <div className="px-4">
        {page && !draft && <PickRecipes page={page} onCancel={() => { setPage(null); setUrl(""); }} />}
        {found && !draft && !page && (
          <div className="mt-4">
            {found.cards.length > 0 && (
              <ul className="card divide-y divide-line overflow-hidden">
                {found.cards.map((c) => (
                  <li key={c.url}>
                    <button className="flex min-h-[72px] w-full items-center gap-3 px-3 py-2 text-left active:bg-soft" disabled={busy} onClick={() => { setFound(null); setUrl(c.url); fetchUrl(c.url); }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {c.image ? <img src={c.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <span className="h-14 w-14 shrink-0 rounded-lg bg-soft" />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] leading-snug font-semibold">{c.title}</span>
                        <span className="block truncate text-[13px] text-muted">{[c.site, c.why].filter(Boolean).join(" · ")}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {found.captionIsRecipe && found.caption && (
              <Button variant="secondary" size="lg" className="mt-3 w-full" disabled={busy} onClick={async () => { const cap = found.caption!; setFound(null); const err = await readWithAi({ text: cap }); if (err) setError(err); }}>
                Use the recipe in the caption
              </Button>
            )}
            {!found.cards.length && !found.captionIsRecipe && !found.error && <p className="card p-4 text-[15px]">Couldn’t find it online.</p>}
            {found.error && <p className="card p-4 text-[15px] text-[#d23c3c]">{found.error}</p>}
            {(found.needShot || !found.cards.length) && (
              <label className={cx("card mt-3 flex min-h-[64px] cursor-pointer items-center gap-4 px-4 py-3 active:bg-soft", busy && "pointer-events-none opacity-60")}>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-[22px] text-bg"><IconCamera /></span>
                <span className="flex-1 text-[17px] font-semibold">{busy ? "Looking…" : "Add a screenshot"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) findOnline({ image: await toJpegBase64(f), mimeType: "image/jpeg" }); }} />
              </label>
            )}
            <button type="button" className="mt-2 w-full py-2 text-[15px] text-accent" onClick={() => { setFound(null); setUrl(""); setPaste(""); }}>Start over</button>
          </div>
        )}
        {!draft && !page && !found && (
          <>
            {mode !== "manual" && (
              <div className="mt-4 space-y-3">
                <label className={cx("card flex min-h-[72px] cursor-pointer items-center gap-4 px-4 py-3 active:bg-soft", busy && "pointer-events-none opacity-60")}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-[22px] text-bg"><IconCamera /></span>
                  <span className="flex-1 text-[17px] font-semibold">{busy ? "Reading…" : "Scan a cookbook page"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readScreenshot(f); }} />
                </label>
                <Link href="/recipes/browse" className="card flex min-h-[64px] items-center gap-4 px-4 py-3 active:bg-soft">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-[20px] text-accent"><IconSearch /></span>
                  <span className="flex-1 text-[17px] font-semibold">Browse recipe sites</span>
                </Link>
                <button
                  type="button"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-soft text-[15px] font-semibold"
                  onClick={async () => {
                    try {
                      const t = await navigator.clipboard.readText();
                      if (isLink(t)) {
                        setUrl(t.trim());
                        await fetchUrl(t.trim());
                      } else if (looksLikeHtml(t)) {
                        await fetchUrl("", t);
                      } else if (t.trim()) {
                        setPaste(t);
                        const err = await readWithAi({ text: t });
                        if (err) setError(err);
                      } else setError("The clipboard is empty.");
                    } catch {
                      setError("Couldn’t read the clipboard. Long-press the box below and choose Paste.");
                    }
                  }}
                >
                  Paste from clipboard
                </button>
                <TextArea rows={12} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a link or a recipe" />
                <Button size="lg" className="w-full" onClick={() => { if (isLink(paste)) { setUrl(paste.trim()); setPaste(""); fetchUrl(paste.trim()); } else readPaste(); }} disabled={!paste.trim() || busy}>{busy ? "Reading…" : "Get recipe"}</Button>
                <button type="button" className="w-full py-2 text-[15px] text-accent" onClick={() => { setMode("manual"); setDraft(emptyDraft()); }}>Start from blank</button>
              </div>
            )}
            {error && (
              <div className="card mt-4 p-4 text-[15px]">
                <p className="text-[#d23c3c]">{error}</p>
              </div>
            )}
          </>
        )}
        {draft && (
          <>
            {warning && <p className="card mt-4 p-3 text-[14px] text-warn">{warning}</p>}
            {(photoPreview || draft.imageUrl) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview ?? draft.imageUrl ?? ""} alt="" className="mt-4 aspect-[16/9] w-full rounded-2xl object-cover" />
            )}
            <label className="card mt-3 flex cursor-pointer items-center justify-between px-4 py-3 text-[15px]">
              <span>{photo ? "Photo added" : draft.imageUrl ? "Use a different photo" : "Add a photo"}</span>
              <span className="text-accent">Choose</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setPhoto(f);
                  setPhotoPreview(f ? URL.createObjectURL(f) : null);
                }}
              />
            </label>
            <RecipeEditor draft={draft} onChange={setDraft} />
            {error && <p className="mt-3 text-[#d23c3c]">{error}</p>}
            <Button size="lg" className="mt-6 w-full" onClick={save} disabled={busy || !draft.title.trim()}>{busy ? "Saving…" : "Save to recipes"}</Button>
          </>
        )}
      </div>
    </div>
  );
}
