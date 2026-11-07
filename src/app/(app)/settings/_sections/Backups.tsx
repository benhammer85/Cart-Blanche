"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, PageHeader, Section, Toast } from "@/components/ui";

interface Saved {
  name: string;
  createdAt: string | null;
  size: number | null;
}

const when = (b: Saved) => {
  const d = b.createdAt ? new Date(b.createdAt) : null;
  return d ? d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : b.name.replace(/\.json$/, "");
};

export function BackupsSettings() {
  const [list, setList] = useState<Saved[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/backup").then((x) => x.json()).catch(() => null);
    if (r?.ok) setList(r.backups);
    else {
      setList([]);
      setToast(r?.error ?? "Couldn’t load backups");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function backUpNow() {
    setBusy("now");
    const r = await fetch("/api/backup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force: true }) }).then((x) => x.json()).catch(() => null);
    setToast(r?.ok ? `Saved ${r.recipes} recipes` : (r?.error ?? "Couldn’t back up"));
    setBusy(null);
    load();
  }

  async function restore(b: Saved) {
    if (!confirm(`Put back anything missing since ${when(b)}? Nothing you’ve changed since will be overwritten.`)) return;
    setBusy(b.name);
    const r = await fetch("/api/backup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ restore: b.name }) }).then((x) => x.json()).catch(() => null);
    setToast(r?.ok ? (r.recipes ? `Put back ${r.recipes} ${r.recipes === 1 ? "recipe" : "recipes"}` : "Nothing was missing") : (r?.error ?? "Couldn’t restore"));
    setBusy(null);
  }

  return (
    <div>
      <PageHeader title="Backups" back="/settings" />
      <div className="px-4">
        <Section title={list ? (list.length ? "Saved every week" : "No backups yet") : "Loading"}>
          {!!list?.length && (
            <ul className="card divide-y divide-line overflow-hidden">
              {list.map((b) => (
                <li key={b.name} className="flex min-h-[56px] items-center gap-3 px-4 py-1.5">
                  <span className="flex-1">
                    <span className="block text-[17px]">{when(b)}</span>
                    <span className="block text-[13px] text-muted">
                      {[b.createdAt && new Date(b.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }), b.size != null && `${(b.size / 1024 / 1024).toFixed(1)} MB`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <a href={`/api/backup?file=${encodeURIComponent(b.name)}`} className="px-2 text-[15px] text-accent">Download</a>
                  <button className="px-2 text-[15px] text-accent disabled:opacity-50" disabled={!!busy} onClick={() => restore(b)}>
                    {busy === b.name ? "Restoring…" : "Restore"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="secondary" className="mt-3 w-full" disabled={!!busy} onClick={backUpNow}>{busy === "now" ? "Saving…" : "Back up now"}</Button>
        </Section>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
