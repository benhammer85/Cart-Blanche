"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Sheet, cx } from "./ui";
import { IconCamera, IconSearch } from "./icons";
import { useMembership } from "./AppShell";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uploadRecipeImage } from "@/lib/data/recipes";

interface Photo {
  image: string;
  site: string;
  page: string;
}

/**
 * Change a recipe's photo: the recipe's own page (often much sharper than an
 * imported copy), photos of the same dish from other recipe sites, your camera
 * or library, or Google Images in Safari.
 */
export function PhotoSheet({ recipe, open, onClose }: { recipe: { id: string; title: string; source_url: string | null }; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { householdId } = useMembership();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async (web: boolean) => {
    const r = await fetch("/api/recipe-photos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: recipe.title, sourceUrl: recipe.source_url, web }) })
      .then((x) => x.json())
      .catch(() => ({ ok: false }));
    return r as { ok: boolean; photos?: Photo[]; note?: string; error?: string };
  };

  useEffect(() => {
    if (!open || photos) return;
    ask(false).then((r) => {
      setPhotos(r.photos ?? []);
      // Nothing on the recipe's own page: look on recipe sites straight away.
      if (!r.photos?.length) searchWeb();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function searchWeb() {
    setSearching(true);
    setNote(null);
    const r = await ask(true);
    setPhotos(r.photos ?? photos ?? []);
    setNote(r.note ?? (r.photos?.length ? null : "No photos found."));
    setSearched(true);
    setSearching(false);
  }

  async function save(blob: Blob, key: string) {
    setSaving(key);
    setError(null);
    const db = supabaseBrowser();
    const { url, error: err } = await uploadRecipeImage(db, householdId, recipe.id, blob, 1600);
    if (!url) {
      setError(err ?? "Couldn’t save the photo.");
      setSaving(null);
      return;
    }
    await db.from("recipes").update({ image_path: url }).eq("id", recipe.id);
    setSaving(null);
    onClose();
    router.refresh();
  }

  /** A photo copied anywhere (Safari, Photos, Messages): paste it straight in. */
  async function pastePhoto() {
    setError(null);
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith("image/"));
        if (type) return save(await it.getType(type), "paste");
      }
      setError("No photo copied. Press and hold a photo, choose Copy, then try again.");
    } catch {
      setError("Couldn’t read a copied photo. Press and hold a photo, choose Copy, then try again.");
    }
  }

  async function choose(p: Photo) {
    try {
      const res = await fetch(`/api/photo-proxy?url=${encodeURIComponent(p.image)}`);
      if (!res.ok) throw new Error();
      await save(await res.blob(), p.image);
    } catch {
      setSaving(null);
      setError("That photo couldn’t be saved. Try another.");
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Change photo">
      <h3 className="menu-label mb-2 px-1 text-muted">{searching ? "Looking on recipe sites…" : recipe.source_url && !searched ? "From the recipe’s page" : "Photos of this dish"}</h3>
      {photos == null || (searching && !photos.length) ? (
        <div className="grid grid-cols-2 gap-2">{[0, 1].map((n) => <div key={n} className="skeleton aspect-[4/3]" />)}</div>
      ) : photos.length ? (
        <ul className="grid grid-cols-2 gap-2">
          {photos.map((p) => (
            <li key={p.image}>
              <button onClick={() => choose(p)} disabled={!!saving} className="relative block w-full overflow-hidden rounded-xl bg-soft text-left active:scale-[0.98]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt="" referrerPolicy="no-referrer" loading="lazy" className="aspect-[4/3] w-full object-cover" onError={(e) => ((e.currentTarget.closest("li") as HTMLElement).style.display = "none")} />
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pt-5 pb-1.5 text-[11px] font-semibold text-white">{p.site}</span>
                {saving === p.image && <span className="absolute inset-0 grid place-items-center bg-black/40 text-[14px] font-semibold text-white">Saving…</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 text-[14px] text-muted">{recipe.source_url ? "No photo on the recipe’s page." : "This recipe has no web page."}</p>
      )}
      {!searched && !searching && (
        <Button variant="secondary" className="mt-3 w-full" onClick={searchWeb} disabled={searching || !!saving}>
          {searching ? "Searching recipe sites…" : "More photos from recipe sites"}
        </Button>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button onClick={pastePhoto} disabled={!!saving} className="card flex min-h-[56px] items-center justify-center gap-2 text-[15px] font-semibold active:bg-soft disabled:opacity-60">
          Paste photo
        </button>
        <label className={cx("card flex min-h-[56px] cursor-pointer items-center justify-center gap-2 text-[15px] font-semibold active:bg-soft", saving && "pointer-events-none opacity-60")}>
          <IconCamera className="text-[18px] text-accent" /> Camera or photos
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) save(f, "file"); }} />
        </label>
      </div>
      <a href={`https://www.bing.com/images/search?q=${encodeURIComponent(recipe.title)}`} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center gap-2 px-1 text-[15px] text-accent">
        <IconSearch /> Search images in Safari ↗
      </a>
      <p className="mt-1 px-1 text-[13px] text-muted">Copy a photo there, then tap Paste photo.</p>
      {note && <p className="mt-2 px-1 text-[13px] text-muted">{note}</p>}
      {error && <p className="mt-2 px-1 text-[13px] text-[#d23c3c]">{error}</p>}
    </Sheet>
  );
}
