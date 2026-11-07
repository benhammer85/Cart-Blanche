"use client";
import { useState } from "react";
import { cx } from "./ui";

/** Recipe photo, or a quiet placeholder (plate and cutlery) when there's no photo. */
export function RecipeImage({ src, title, className }: { src: string | null | undefined; title: string; className?: string; placeholderText?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={title} loading="lazy" onError={() => setFailed(true)} className={cx("h-full w-full object-cover", className)} />;
  }
  return (
    <div className={cx("grid h-full w-full place-items-center bg-soft text-muted/50", className)} aria-label={title}>
      <svg width="34%" height="34%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="5.5" />
        <circle cx="12" cy="12" r="8.5" />
        <path d="M2.5 4v5a1.5 1.5 0 0 0 1.5 1.5v9.5M4 4v5M5.5 4v5a1.5 1.5 0 0 1-1.5 1.5" />
        <path d="M21.5 4c-1.5 0-2.5 2-2.5 4.5V12h2.5v8" />
      </svg>
    </div>
  );
}
