"use client";
import { useEffect, useMemo, useState } from "react";
import { stepSegments } from "@/lib/cook";

interface Ing {
  name: string;
  name_norm: string;
}

/** A step with its ingredients underlined; tap one to see how much. */
export function StepText<T extends Ing>({ text, ingredients, amount, className }: { text: string; ingredients: T[]; amount: (i: T) => string; className?: string }) {
  const segments = useMemo(() => stepSegments(text, ingredients), [text, ingredients]);
  const [shown, setShown] = useState<{ label: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!shown) return;
    const hide = () => setShown(null);
    const t = setTimeout(hide, 2500);
    window.addEventListener("scroll", hide, { passive: true, once: true });
    window.addEventListener("pointerdown", hide, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", hide);
      window.removeEventListener("pointerdown", hide);
    };
  }, [shown]);

  return (
    <>
      <p className={className}>
        {segments.map((s, k) =>
          s.ingredient ? (
            <button
              key={k}
              type="button"
              className="font-semibold underline decoration-accent/70 decoration-dotted decoration-2 underline-offset-4"
              onClick={(e) => {
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                const a = amount(s.ingredient!);
                setShown({ label: `${a ? `${a} ` : ""}${s.ingredient!.name}`, x: r.left + r.width / 2, y: r.top });
              }}
            >
              {s.text}
            </button>
          ) : (
            <span key={k}>{s.text}</span>
          ),
        )}
      </p>
      {shown && (
        <span
          role="status"
          className="pointer-events-none fixed z-[60] max-w-[80vw] -translate-x-1/2 -translate-y-full rounded-2xl bg-ink px-3.5 py-2 text-[15px] leading-snug font-semibold text-bg shadow-lg"
          style={{ left: Math.min(Math.max(shown.x, 120), window.innerWidth - 120), top: shown.y - 8 }}
        >
          {shown.label}
        </span>
      )}
    </>
  );
}
