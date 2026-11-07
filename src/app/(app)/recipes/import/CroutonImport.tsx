"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import { Button, PageHeader, Sheet, Toggle, cx } from "@/components/ui";
import { IconCheck, IconUpload } from "@/components/icons";
import { RecipeEditor } from "@/components/RecipeEditor";
import { LOVED, parseCrumb } from "@/lib/import/crouton";
import { base64ToBlob, isDuplicate, loadExistingKeys, saveRecipe, uploadRecipeImage } from "@/lib/data/recipes";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useMembership } from "@/components/AppShell";
import type { RecipeDraft } from "@/lib/types";

interface Item {
  key: string;
  fileName: string;
  /** re-read at import time so big images aren't all held in memory */
  read: () => Promise<string>;
  draft: RecipeDraft;
  warnings: string[];
  thumb: string | null;
  duplicate: string | null;
  include: boolean;
  status: "ready" | "saving" | "saved" | "failed";
  error?: string;
}

export function CroutonImport() {
  const router = useRouter();
  const { householdId } = useMembership();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [failures, setFailures] = useState<{ file: string; error: string }[]>([]);
  const [reading, setReading] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [importing, setImporting] = useState(false);
  const [drag, setDrag] = useState(false);
  const [photoErrors, setPhotoErrors] = useState<{ count: number; message: string | null }>({ count: 0, message: null });
  const [repaired, setRepaired] = useState(0);

  async function handleFiles(files: FileList | File[]) {
    const db = supabaseBrowser();
    const keys = await loadExistingKeys(db);
    const { data: syn } = await db.from("synonyms").select("alias, canonical");
    const synonyms = Object.fromEntries((syn ?? []).map((s: { alias: string; canonical: string }) => [s.alias, s.canonical]));

    const sources: { name: string; read: () => Promise<string> }[] = [];
    const errs: { file: string; error: string }[] = [];
    for (const f of Array.from(files)) {
      if (/\.zip$/i.test(f.name)) {
        try {
          const zip = await JSZip.loadAsync(f);
          zip.forEach((path, entry) => {
            if (!entry.dir && /\.crumb$/i.test(path) && !path.includes("__MACOSX")) sources.push({ name: path.split("/").pop()!, read: () => entry.async("string") });
          });
        } catch {
          errs.push({ file: f.name, error: "Couldn’t open the zip" });
        }
      } else if (/\.crumb$/i.test(f.name) || f.type === "application/json") {
        sources.push({ name: f.name, read: () => f.text() });
      } else {
        errs.push({ file: f.name, error: "Not a .crumb or .zip file" });
      }
    }

    const seen = new Set(items.map((i) => i.draft.externalId));
    const seenTitles = new Set(items.map((i) => i.draft.title.toLowerCase()));
    const next: Item[] = [];
    for (const [n, src] of sources.entries()) {
      setReading(`Reading ${n + 1} of ${sources.length}…`);
      try {
        const parsed = parseCrumb(JSON.parse(await src.read()), synonyms);
        if (parsed.recipe.externalId && seen.has(parsed.recipe.externalId)) continue;
        seen.add(parsed.recipe.externalId);
        const titleKey = parsed.recipe.title.toLowerCase();
        // Same recipe exported twice (e.g. "Tofu and Broccoli" and "Tofu and Broccoli-1")
        const duplicate = isDuplicate(parsed.recipe, keys) ?? (seenTitles.has(titleKey) ? "same recipe twice in this import" : null);
        seenTitles.add(titleKey);
        next.push({
          key: `${src.name}-${n}-${Date.now()}`,
          fileName: src.name,
          read: src.read,
          draft: parsed.recipe,
          warnings: parsed.warnings,
          thumb: parsed.thumbBase64 ? URL.createObjectURL(base64ToBlob(parsed.thumbBase64)) : null,
          duplicate,
          include: !duplicate,
          status: "ready",
        });
      } catch (e) {
        errs.push({ file: src.name, error: e instanceof SyntaxError ? "Not valid JSON" : "Not a Crouton recipe" });
      }
    }
    setReading(null);
    setItems((cur) => [...cur, ...next]);
    setFailures((cur) => [...cur, ...errs]);
  }

  async function importAll() {
    setImporting(true);
    setPhotoErrors({ count: 0, message: null });
    setRepaired(0);
    const db = supabaseBrowser();
    const photoFailed = (message: string) => setPhotoErrors((p) => ({ count: p.count + 1, message: p.message ?? message }));
    // Recipes imported before: add the Loved tag and any missing photo.
    for (const item of items) {
      if (!item.duplicate || !item.draft.externalId) continue;
      const { data: existing } = await db.from("recipes").select("id, tags, image_path").eq("external_id", item.draft.externalId).maybeSingle();
      if (!existing) continue;
      if (item.draft.tags.includes(LOVED) && !(existing.tags as string[]).includes(LOVED)) {
        await db.from("recipes").update({ tags: [...(existing.tags as string[]), LOVED] }).eq("id", existing.id);
      }
      if (!existing.image_path) {
        setItems((cur) => cur.map((i) => (i.key === item.key ? { ...i, status: "saving" } : i)));
        const full = parseCrumb(JSON.parse(await item.read()));
        if (full.imageBase64) {
          const { url, error } = await uploadRecipeImage(db, householdId, existing.id, base64ToBlob(full.imageBase64));
          if (url) {
            await db.from("recipes").update({ image_path: url }).eq("id", existing.id);
            setRepaired((n) => n + 1);
          } else if (error) photoFailed(error);
        }
        setItems((cur) => cur.map((i) => (i.key === item.key ? { ...i, status: "ready" } : i)));
      }
    }
    for (const item of items) {
      if (!item.include || item.status === "saved") continue;
      setItems((cur) => cur.map((i) => (i.key === item.key ? { ...i, status: "saving" } : i)));
      try {
        // Re-read to get the full-size photo; it's resized to ~1000px before upload.
        const full = parseCrumb(JSON.parse(await item.read()));
        const image = full.imageBase64 ? base64ToBlob(full.imageBase64) : null;
        await saveRecipe(db, householdId, item.draft, { image, onPhotoError: photoFailed });
        setItems((cur) => cur.map((i) => (i.key === item.key ? { ...i, status: "saved" } : i)));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "failed";
        setItems((cur) => cur.map((i) => (i.key === item.key ? { ...i, status: "failed", error: msg.includes("duplicate") ? "Already in your recipes" : msg } : i)));
      }
    }
    setImporting(false);
    router.refresh();
  }

  const toImport = items.filter((i) => i.include && i.status !== "saved").length;
  const saved = items.filter((i) => i.status === "saved").length;
  const withWarnings = items.filter((i) => i.warnings.some((w) => w.startsWith("Check"))).length;

  return (
    <div>
      <PageHeader title="Import from Crouton" back="/recipes" subtitle="In Crouton: select recipes → Share → Export. Then choose the .crumb files or the .zip here." />
      <div className="px-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={cx("card mt-5 flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed px-6 py-10 text-center", drag ? "border-accent" : "border-transparent")}
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-3xl text-accent"><IconUpload /></span>
          <p className="text-[17px] font-semibold">{reading ?? "Choose files"}</p>
          <p className="text-[14px] text-muted">A .zip or a few .crumb files. You can drag them here too.</p>
          <input ref={inputRef} type="file" multiple accept=".crumb,.zip,application/zip,application/json" className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
        </div>

        {failures.length > 0 && (
          <div className="card mt-4 p-4">
            <p className="text-[15px] font-semibold text-[#d23c3c]">{failures.length} file(s) couldn’t be read</p>
            <ul className="mt-1 text-[14px] text-muted">{failures.map((f, i) => <li key={i}>{f.file}: {f.error}</li>)}</ul>
          </div>
        )}

        {items.length > 0 && (
          <>
            <p className="mt-6 px-1 text-[15px] text-muted">
              {items.length} found · {items.filter((i) => i.duplicate).length} already saved · {withWarnings} need a look{saved ? ` · ${saved} imported` : ""}
            </p>
            <ul className="mt-2 space-y-2">
              {items.map((it) => (
                <li key={it.key} className="card flex gap-3 p-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-soft">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {it.thumb && <img src={it.thumb} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="recipe-title truncate text-[16px] font-semibold">{it.draft.title}</p>
                    <p className="text-[13px] text-muted">
                      {it.draft.ingredients.length} ingredients · {it.draft.steps.length} steps{it.draft.prepMin ? ` · ${it.draft.prepMin} min` : ""}
                      {it.draft.mainProtein ? ` · ${it.draft.mainProtein}` : ""}
                    </p>
                    {it.duplicate && <p className="text-[13px] text-warn">Skipped: {it.duplicate}</p>}
                    {it.warnings.filter((w) => w.startsWith("Check")).map((w) => <p key={w} className="truncate text-[13px] text-[#d23c3c]">{w}</p>)}
                    {it.status === "failed" && <p className="text-[13px] text-[#d23c3c]">Failed: {it.error}</p>}
                    <div className="mt-2 flex items-center gap-3">
                      <button className="text-[14px] font-semibold text-accent" onClick={() => setEditing(it)}>Review</button>
                      <label className="flex items-center gap-1.5 text-[13px] text-muted">
                        Kid-friendly
                        <input type="checkbox" checked={it.draft.kidFriendly} onChange={(e) => setItems((cur) => cur.map((i) => (i.key === it.key ? { ...i, draft: { ...i.draft, kidFriendly: e.target.checked } } : i)))} />
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    {it.status === "saved" ? (
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-ok text-white"><IconCheck /></span>
                    ) : it.status === "saving" ? (
                      <span className="text-[13px] text-muted">Saving…</span>
                    ) : (
                      <Toggle checked={it.include} onChange={(v) => setItems((cur) => cur.map((i) => (i.key === it.key ? { ...i, include: v } : i)))} label="Include" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {(repaired > 0 || photoErrors.count > 0) && (
              <div className="card mt-4 p-4 text-[14px]">
                {repaired > 0 && <p className="text-ok">Added photos to {repaired} recipe{repaired === 1 ? "" : "s"} you’d already imported.</p>}
                {photoErrors.count > 0 && (
                  <p className="text-[#d23c3c]">
                    {photoErrors.count} photo{photoErrors.count === 1 ? "" : "s"} couldn’t be saved: {photoErrors.message}
                  </p>
                )}
              </div>
            )}
            <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+70px)] mt-4">
              <Button size="lg" className="w-full shadow-lg" disabled={importing || !items.length} onClick={importAll}>
                {importing ? "Importing…" : toImport ? `Import ${toImport} recipe${toImport === 1 ? "" : "s"}` : saved ? "All done" : "Update existing recipes (photos, Loved)"}
              </Button>
            </div>
          </>
        )}
      </div>

      {editing && (
        <Sheet open onClose={() => setEditing(null)} title="Review recipe">
          <RecipeEditor
            draft={editing.draft}
            onChange={(d) => {
              setEditing({ ...editing, draft: d });
              setItems((cur) => cur.map((i) => (i.key === editing.key ? { ...i, draft: d, warnings: i.warnings.filter((w) => !w.startsWith("Check")) } : i)));
            }}
          />
          <Button className="mt-4 w-full" onClick={() => setEditing(null)}>Done</Button>
        </Sheet>
      )}
    </div>
  );
}
