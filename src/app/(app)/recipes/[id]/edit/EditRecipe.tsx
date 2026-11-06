"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RecipeEditor } from "@/components/RecipeEditor";
import { Button, PageHeader } from "@/components/ui";
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
  const [image, setImage] = useState<File | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveRecipe(supabaseBrowser(), householdId, draft, { id: recipe.id, image });
      router.push(`/recipes/${recipe.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save");
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Edit recipe" back={`/recipes/${recipe.id}`} right={<Button size="sm" onClick={save} disabled={saving || !draft.title.trim()}>{saving ? "Saving…" : "Save"}</Button>} />
      <div className="px-4">
        <label className="card mt-4 flex items-center justify-between px-4 py-3 text-[15px]">
          <span>{image ? image.name : "Change photo"}</span>
          <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] ?? null)} className="max-w-[55%] text-[13px]" />
        </label>
        <RecipeEditor draft={draft} onChange={setDraft} />
        {error && <p className="mt-3 text-[#d23c3c]">{error}</p>}
        <Button size="lg" className="mt-6 w-full" onClick={save} disabled={saving || !draft.title.trim()}>{saving ? "Saving…" : "Save recipe"}</Button>
      </div>
    </div>
  );
}
