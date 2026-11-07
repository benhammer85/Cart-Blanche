"use client";
import { useState } from "react";
import { cx } from "./ui";

/** Recipe photo, or a monogram placeholder when there's no photo. */
export function RecipeImage({ src, title, className }: { src: string | null | undefined; title: string; className?: string; placeholderText?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={title} loading="lazy" onError={() => setFailed(true)} className={cx("h-full w-full object-cover", className)} />;
  }
  // No photo: a monogram on card stock, like the initial on a printed menu.
  const words = title.replace(/[^A-Za-z\s']/g, " ").split(/\s+/).filter((w) => w.length > 2 && !/^(the|and|with|minute|pressure|cooker|instant|pot|air|fryer|easy|best|quick)$/i.test(w));
  const letter = (words[0] ?? title.replace(/[^A-Za-z]/g, "") ?? "?").charAt(0).toUpperCase() || "·";
  return (
    <div className={cx("relative grid h-full w-full place-items-center bg-soft [container-type:inline-size]", className)} aria-label={title}>
      <span className="absolute inset-2.5 rounded-[10px] border border-line" aria-hidden />
      <span className="recipe-title text-[clamp(2rem,22cqw,4.5rem)] leading-none text-muted/70 italic" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }} aria-hidden>
        {letter}
      </span>
    </div>
  );
}
