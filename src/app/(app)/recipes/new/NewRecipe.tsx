"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RecipeEditor, emptyDraft } from "@/components/RecipeEditor";
import { Button, PageHeader, Segmented, TextArea, TextField } from "@/components/ui";
import { parseIngredientLine, parsePlainTextRecipe } from "@/lib/ingredientParser";
import { inferMainProtein, inferMealTypes } from "@/lib/infer";
import { isDuplicate, loadExistingKeys, resizeImage, saveRecipe } from "@/lib/data/recipes";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useMembership } from "@/components/AppShell";
import type { RecipeDraft } from "@/lib/types";

type Mode = "url" | "paste" | "manual";

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

  // Opened from the share sheet with a link: read it straight away.
  const started = useRef(false);
  useEffect(() => {
    if (initialUrl && !started.current) {
      started.current = true;
      fetchUrl(initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  async function fetchUrl(target = url) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/recipe-from-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: target }) });
      const body = await res.json();
      if (!res.ok) {
        if (body.blocked) setMode("paste");
        throw new Error(body.error ?? "Couldn’t read that page");
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

  async function readScreenshot(file: File) {
    const small = await resizeImage(file, 1800, 0.85);
    const b64 = await new Promise<string>((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).replace(/^data:[^,]+,/, ""));
      fr.readAsDataURL(small);
    });
    const err = await readWithAi({ image: b64, mimeType: "image/jpeg" });
    if (err) setError(err);
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
        {!draft && (
          <>
            <div className="mt-4">
              <Segmented value={mode} onChange={(m) => { setMode(m); setError(null); if (m === "manual") setDraft(emptyDraft()); }} options={[{ value: "url", label: "Link" }, { value: "paste", label: "Paste" }, { value: "manual", label: "Blank" }]} />
            </div>
            {mode === "url" && (
              <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); fetchUrl(); }}>
                <TextField value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.seriouseats.com/…" inputMode="url" autoFocus />
                <Button size="lg" className="w-full" disabled={busy || !url.trim()}>{busy ? "Reading the page…" : "Get recipe"}</Button>
              </form>
            )}
            {mode === "paste" && (
              <div className="mt-4 space-y-3">
                <p className="px-1 text-[14px] text-muted">Paste a whole recipe page (select all, copy) or type one out. Works for sites that block links, like traderjoes.com.</p>
                <TextArea rows={12} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Paste the recipe page here"} />
                <Button size="lg" className="w-full" onClick={readPaste} disabled={!paste.trim() || busy}>{busy ? "Reading…" : "Read recipe"}</Button>
                <label className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-soft text-[15px] font-semibold">
                  Or read a screenshot
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readScreenshot(f); }} />
                </label>
              </div>
            )}
            {error && (
              <div className="card mt-4 p-4 text-[15px]">
                <p className="text-[#d23c3c]">{error}</p>
                {mode === "url" && (
                  <Link href="/recipes/claude" className="mt-2 inline-block font-semibold text-accent">Find it another way</Link>
                )}
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
