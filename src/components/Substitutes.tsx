"use client";
import { useEffect, useState } from "react";
import { substitutesFor } from "@/lib/substitutes";

/** "If they're out": built-in swaps, or ask Gemini for anything else. */
export function Substitutes({ name, dish }: { name: string; dish?: string }) {
  const built = substitutesFor(name);
  const [asked, setAsked] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setAsked(null);
    setError(null);
  }, [name]);
  const options = built?.options ?? asked;

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/ai/substitute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, dish }) }).then((x) => x.json());
      if (r.ok) setAsked(r.options);
      else setError(r.error ?? "Couldn’t look that up.");
    } catch {
      setError(navigator.onLine ? "Couldn’t look that up." : "You’re offline.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card px-4 py-3">
      <p className="menu-label text-muted">If they’re out</p>
      {options ? (
        <ul className="mt-1.5 space-y-1 text-[16px] leading-snug">
          {options.map((o) => <li key={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</li>)}
        </ul>
      ) : (
        <button className="mt-1 text-[16px] text-accent disabled:opacity-60" disabled={busy} onClick={ask}>
          {busy ? "Looking…" : "Find a substitute"}
        </button>
      )}
      {error && <p className="mt-1 text-[13px] text-[#d23c3c]">{error}</p>}
    </div>
  );
}
