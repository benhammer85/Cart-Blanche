"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RecipeEditor } from "@/components/RecipeEditor";
import { Button, PageHeader } from "@/components/ui";
import { IconCopy } from "@/components/icons";
import { formatAmount as fmt } from "@/lib/units";
import { recipeToDraft, saveRecipe } from "@/lib/data/recipes";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useMembership } from "@/components/AppShell";
import type { Recipe } from "@/lib/types";

export function EditRecipe({ recipe }: { recipe: Recipe }) {
  const router = useRouter();
  const { householdId } = useMembership();
  const [draft, setDraft] = useState(() => recipeToDraft(recipe));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveRecipe(supabaseBrowser(), householdId, draft, { id: recipe.id });
      router.push(`/recipes/${recipe.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save");
      setSaving(false);
    }
  }

  async function copyAsText() {
    const lines = [
      recipe.title,
      "",
      `Serves ${Number(recipe.servings)}${recipe.prep_min ? `, ${recipe.prep_min} min prep` : ""}`,
      "",
      "Ingredients",
      ...[...(recipe.recipe_ingredients ?? [])].sort((a, b) => a.position - b.position).map((i) => `${fmt(i.qty == null ? null : Number(i.qty), i.unit, i.qty_max == null ? null : Number(i.qty_max))} ${i.name}${i.note ? `, ${i.note}` : ""}`.trim()),
      "",
      "Steps",
      ...(recipe.steps ?? []).filter((s) => !s.isSection).map((s, n) => `${n + 1}. ${s.text.replace(/^\d+\.\s*/, "")}`),
      ...(recipe.source_url ? ["", recipe.source_url] : []),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setMsg("Copied. Paste it into a message or note.");
    } catch {
      setMsg("Couldn’t copy on this device.");
    }
  }

  async function archive() {
    if (!confirm(`Delete “${recipe.title}”? Past plans keep their history.`)) return;
    await supabaseBrowser().from("recipes").update({ archived: true }).eq("id", recipe.id);
    router.push("/recipes");
    router.refresh();
  }

  return (
    <div>
      <PageHeader title="Edit recipe" back={`/recipes/${recipe.id}`} right={<Button size="sm" onClick={save} disabled={saving || !draft.title.trim()}>{saving ? "Saving…" : "Save"}</Button>} />
      <div className="px-4">
        <RecipeEditor draft={draft} onChange={setDraft} />
        {error && <p className="mt-3 text-[#d23c3c]">{error}</p>}
        <Button size="lg" className="mt-6 w-full" onClick={save} disabled={saving || !draft.title.trim()}>{saving ? "Saving…" : "Save recipe"}</Button>
        <Button variant="secondary" className="mt-8 w-full" onClick={copyAsText}><IconCopy /> Copy recipe as text</Button>
        {msg && <p className="mt-2 px-1 text-[13px] text-muted">{msg}</p>}
        <Button variant="danger" className="mt-3 w-full" onClick={archive}>Delete recipe</Button>
      </div>
    </div>
  );
}
