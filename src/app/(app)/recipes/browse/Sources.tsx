"use client";
import { BROWSE_SOURCES, REDDIT_SOURCES } from "@/lib/discover";

/** Trusted sites to browse (opens a tick list), and Reddit threads to read in Safari. */
export function Sources() {
  return (
    <>
      <ul className="card mt-4 divide-y divide-line overflow-hidden">
        {BROWSE_SOURCES.map((s) => (
          <li key={s.url}>
            <a href={`/recipes/new?mode=url&url=${encodeURIComponent(s.url)}`} className="flex min-h-[60px] items-center justify-between gap-3 px-4 py-2 active:bg-soft">
              <span>
                <span className="menu-label block text-accent">{s.site}</span>
                <span className="recipe-title block text-[17px] font-semibold">{s.label}</span>
              </span>
              <span className="text-muted">›</span>
            </a>
          </li>
        ))}
      </ul>
      <h2 className="menu-label mt-7 mb-2 px-1 text-muted">From Reddit</h2>
      <ul className="card divide-y divide-line overflow-hidden">
        {REDDIT_SOURCES.map((r) => (
          <li key={r.url}>
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex min-h-[50px] items-center justify-between px-4 text-[16px] active:bg-soft">
              {r.label}
              <span className="text-[13px] text-muted">Open ↗</span>
            </a>
          </li>
        ))}
      </ul>
      
    </>
  );
}
