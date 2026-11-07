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
    ask(false).then((r) => setPhotos(r.photos ?? []));
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
      <div className="grid grid-cols-2 gap-2">
        <label className={cx("card flex min-h-[64px] cursor-pointer items-center gap-2.5 px-3 active:bg-soft", saving && "pointer-events-none opacity-60")}>
          <IconCamera className="shrink-0 text-[20px] text-accent" />
          <span className="text-[15px] leading-tight font-semibold">Camera or photos</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) save(f, "file"); }} />
        </label>
        <a href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(recipe.title)}`} target="_blank" rel="noopener noreferrer" className="card flex min-h-[64px] items-center gap-2.5 px-3 active:bg-soft">
          <IconSearch className="shrink-0 text-[20px] text-accent" />
          <span className="text-[15px] leading-tight font-semibold">Google Images ↗</span>
        </a>
      </div>
      <p className="mt-2 px-1 text-[13px] text-muted">From Google Images: press and hold a photo, choose Save to Photos, then use Camera or photos.</p>

      <h3 className="menu-label mt-5 mb-2 px-1 text-muted">{recipe.source_url && !searched ? "From the recipe’s page" : "Photos of this dish"}</h3>
      {photos == null ? (
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
      {!searched && (
        <Button variant="secondary" className="mt-3 w-full" onClick={searchWeb} disabled={searching || !!saving}>
          {searching ? "Searching recipe sites…" : "Find photos of this dish online"}
        </Button>
      )}
      {note && <p className="mt-2 px-1 text-[13px] text-muted">{note}</p>}
      {error && <p className="mt-2 px-1 text-[13px] text-[#d23c3c]">{error}</p>}
    </Sheet>
  );
}
