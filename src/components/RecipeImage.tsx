"use client";
import { useState } from "react";
import { cx } from "./ui";

/** Recipe photo with a warm placeholder when missing or failing to load. */
export function RecipeImage({ src, title, className, placeholderText = true }: { src: string | null | undefined; title: string; className?: string; placeholderText?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={cx("h-full w-full object-cover", className)} />;
  }
  return (
    <div className={cx("grid h-full w-full place-items-center bg-gradient-to-br from-accent-soft to-soft", className)}>
      {placeholderText && <span className="recipe-title line-clamp-3 px-3 text-center text-[20px] leading-tight text-accent/80">{title.split(" ").slice(0, 4).join(" ")}</span>}
    </div>
  );
}
