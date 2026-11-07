"use client";
import { useMemo, useState } from "react";
import { useHousehold } from "@/lib/data/useHousehold";
import { Button, Chip, PageHeader, Section, Toast, cx } from "@/components/ui";
import { IconCheck, IconUpload } from "@/components/icons";
import { StoreBadge } from "@/components/StoreBadge";
import { resizeImage } from "@/lib/data/recipes";
import { isFullGrocery, receiptUpdates, suggestFromReceipt, type ReceiptItem, type ReceiptSuggestion } from "@/lib/receipts";
import type { IngredientInfo } from "@/lib/types";

const MAX_PDF = 3_000_000; // bytes; keeps the upload under the server limit

function toBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).replace(/^data:[^,]+,/, ""));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

export function ReceiptsSettings() {
  const { data, reload, db, householdId } = useHousehold();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [read, setRead] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [picked, setPicked] = useState<ReceiptSuggestion[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const stores = useMemo(() => (data?.stores ?? []).filter((s) => !s.archived), [data]);
  const ctx = useMemo(() => {
    if (!data || !storeId) return null;
    return {
      storeId,
      categories: data.categories,
      rules: data.rules,
      ingredients: new Map<string, IngredientInfo>(data.ingredients.map((i) => [i.name_norm, i])),
      synonyms: data.synonyms,
    };
  }, [data, storeId]);

  if (!data) return <PageHeader title="Learn from receipts" back="/settings" />;
  const store = stores.find((s) => s.id === storeId);
  const everyday = storeId ? isFullGrocery(storeId, data.categories, data.rules) : false;
  const storeName = (id: string | null) => stores.find((s) => s.id === id)?.name ?? "another store";

  async function readFiles(files: FileList) {
    if (!ctx) return;
    const all = [...items];
    const errs: string[] = [];
    let n = read;
    const list = [...files];
    for (const [i, f] of list.entries()) {
      setBusy(`Reading ${list.length > 1 ? `${i + 1} of ${list.length}` : "the receipt"}…`);
      try {
        const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
        if (isPdf && f.size > MAX_PDF) {
          errs.push(`${f.name} is too large. Save just the item pages, or take screenshots.`);
          continue;
        }
        const blob = isPdf ? f : await resizeImage(f, 2000, 0.85);
        const r = await fetch("/api/ai/receipt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ file: await toBase64(blob), mimeType: isPdf ? "application/pdf" : "image/jpeg", categories: data!.categories.map((c) => c.name) }),
        }).then((x) => x.json());
        if (!r.ok) errs.push(`${f.name}: ${r.error ?? "couldn’t read it."}`);
        else {
          all.push(...(r.items as ReceiptItem[]));
          n++;
        }
      } catch {
        errs.push(`${f.name}: ${navigator.onLine ? "couldn’t read it." : "you’re offline."}`);
      }
    }
    setItems(all);
    setRead(n);
    setErrors(errs);
    setPicked(suggestFromReceipt(all, ctx));
    setBusy(null);
  }

  async function apply() {
    if (!ctx || !picked || !store) return;
    setBusy("Saving…");
    const rows = receiptUpdates(picked, { ...ctx, householdId, isBulk: store.is_bulk });
    // Rows with the same columns go together, so nothing unset is overwritten.
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const r of rows) {
      const k = Object.keys(r).sort().join(",");
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    try {
      for (const g of groups.values()) {
        const { error } = await db.from("ingredients").upsert(g, { onConflict: "household_id,name_norm" });
        if (error) throw error;
      }
      setToast(`Updated ${rows.length} ${rows.length === 1 ? "item" : "items"}`);
      setItems([]);
      setRead(0);
      setPicked(null);
      reload();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Couldn’t save");
    }
    setBusy(null);
  }

  const toggle = (n: string) => setPicked((cur) => cur?.map((s) => (s.nameNorm === n ? { ...s, checked: !s.checked } : s)) ?? null);
  const ticked = picked?.filter((s) => s.checked && (s.action === "new" || s.action === "move")).length ?? 0;
  const hint: Record<ReceiptSuggestion["action"], (s: ReceiptSuggestion) => string> = {
    new: (s) => (everyday && !s.signature ? "New, sorted by category" : `New, will go to ${store?.name}`),
    move: (s) => `Usually ${s.currentStoreId ? storeName(s.currentStoreId) : "by category rules"}`,
    same: () => `Already ${store?.name}`,
    "only-at": (s) => `Only sold at ${storeName(s.currentStoreId)}`,
  };

  return (
    <div>
      <PageHeader
        title="Learn from receipts"
        back="/settings"
      />
      <div className="px-4">
        <Section title="Store">
          <div className="flex flex-wrap gap-2">
            {stores.map((s) => (
              <Chip key={s.id} active={storeId === s.id} onClick={() => { setStoreId(s.id); setItems([]); setRead(0); setPicked(null); setErrors([]); }}>
                <span className="flex items-center gap-1.5"><StoreBadge name={s.name} size={18} />{s.name}</span>
              </Chip>
            ))}
          </div>
        </Section>

        {store && (
          <Section title="Receipts">
            <label className={cx("card flex min-h-[64px] cursor-pointer items-center gap-3 px-4 py-3", busy && "pointer-events-none opacity-60")}>
              <IconUpload className="text-accent" />
              <span className="flex-1">
                <span className="block text-[17px]">{busy ?? (read ? "Add more receipts" : "Choose receipts")}</span>
                <span className="block text-[13px] text-muted">
                  {store.is_bulk ? "Costco: PDFs from Orders & Purchases, or screenshots" : "Photos, screenshots, PDFs, or Instacart order screenshots"}
                </span>
              </span>
              <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files;
                  if (f?.length) readFiles(f);
                  e.target.value = "";
                }}
              />
            </label>
            {everyday && (
              <p className="mt-2 px-1 text-[13px] text-muted">
                {store.name} carries nearly everything, so only new items and store-brand products are ticked. Tick others to always buy them here.
              </p>
            )}
            {errors.map((e) => (
              <p key={e} className="mt-2 px-1 text-[13px] text-[#d23c3c]">{e}</p>
            ))}
          </Section>
        )}

        {picked && (
          <Section title={`${picked.length} items from ${read} ${read === 1 ? "receipt" : "receipts"}`}>
            {picked.length ? (
              <ul className="card divide-y divide-line overflow-hidden">
                {picked.map((s) => {
                  const can = s.action === "new" || s.action === "move";
                  return (
                    <li key={s.nameNorm}>
                      <button
                        className={cx("flex min-h-[52px] w-full items-center gap-3 px-4 py-1.5 text-left", !can && "opacity-55")}
                        disabled={!can}
                        onClick={() => toggle(s.nameNorm)}
                      >
                        <span className={cx("grid h-6 w-6 place-items-center rounded-full border-2", s.checked && can ? "border-accent bg-accent text-white" : "border-line")}>
                          {s.checked && can && <IconCheck className="h-3.5 w-3.5" />}
                        </span>
                        <span className="flex-1">
                          <span className="block text-[16px] capitalize">
                            {s.label}
                            {s.count > 1 && <span className="text-muted"> ×{s.count}</span>}
                          </span>
                          <span className="block text-[12px] text-muted">
                            {[hint[s.action](s), s.signature && "store brand", store?.is_bulk && s.size && `pack ${s.size}`].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="card p-4 text-[15px] text-muted">No grocery items found.</p>
            )}
            <Button size="lg" className="mt-4 w-full" disabled={!ticked || !!busy} onClick={apply}>
              {busy ?? `Learn ${ticked} ${ticked === 1 ? "item" : "items"}`}
            </Button>
          </Section>
        )}
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
