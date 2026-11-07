"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RecipeEditor, emptyDraft } from "@/components/RecipeEditor";
import { Button, PageHeader, Segmented, TextArea, TextField } from "@/components/ui";
import { parseIngredientLine, parsePlainTextRecipe } from "@/lib/ingredientParser";
import { inferMainProtein, inferMealTypes } from "@/lib/infer";
import { isDuplicate, loadExistingKeys, saveRecipe } from "@/lib/data/recipes";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useMembership } from "@/components/AppShell";
import type { RecipeDraft } from "@/lib/types";

type Mode = "url" | "paste" | "manual";

export function NewRecipe({ initialMode }: { initialMode: Mode }) {
  const router = useRouter();
  const { householdId } = useMembership();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [draft, setDraft] = useState<RecipeDraft | null>(initialMode === "manual" ? emptyDraft() : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function fetchUrl() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/recipe-from-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn’t read that page");
      setDraft(body.recipe);
      const dup = isDuplicate(body.recipe, await loadExistingKeys(supabaseBrowser()));
      setWarning(dup ? `Heads up: ${dup}.` : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t read that page");
    } finally {
      setBusy(false);
    }
  }

  function readPaste() {
    const p = parsePlainTextRecipe(paste);
    if (!p.ingredients.length) {
      setError("Put ingredients first (one per line), then a blank line, then the steps.");
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
      const id = await saveRecipe(supabaseBrowser(), householdId, draft);
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
                <TextArea rows={14} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Recipe title (optional)\n\n1 lb ground beef\n1 onion, diced\n8 tortillas\n\nBrown the beef with the onion.\n\nWarm the tortillas and serve."} />
                <Button size="lg" className="w-full" onClick={readPaste} disabled={!paste.trim()}>Read recipe</Button>
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
            {draft.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.imageUrl} alt="" className="mt-4 aspect-[16/9] w-full rounded-2xl object-cover" />
            )}
            <RecipeEditor draft={draft} onChange={setDraft} />
            {error && <p className="mt-3 text-[#d23c3c]">{error}</p>}
            <Button size="lg" className="mt-6 w-full" onClick={save} disabled={busy || !draft.title.trim()}>{busy ? "Saving…" : "Save to recipes"}</Button>
          </>
        )}
      </div>
    </div>
  );
}
