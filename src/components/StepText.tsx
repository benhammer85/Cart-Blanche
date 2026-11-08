"use client";
import { useEffect, useMemo, useState } from "react";
import { stepSegments } from "@/lib/cook";
import { fahrenheit } from "@/lib/temps";

interface Ing {
  name: string;
  name_norm: string;
}

/** A step with its ingredients underlined; tap one to see how much. */
export function StepText<T extends Ing>({ text, ingredients, amount, className }: { text: string; ingredients: T[]; amount: (i: T) => string; className?: string }) {
  const segments = useMemo(() => stepSegments(fahrenheit(text), ingredients), [text, ingredients]);
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
          s.ingredients ? (
            <button
              key={k}
              type="button"
              className="underline decoration-muted/80 decoration-dotted decoration-[1.5px] underline-offset-[5px]"
              onClick={(e) => {
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                const lines = s.ingredients!.map((g) => {
                  const a = amount(g);
                  return `${a ? `${a} ` : ""}${g.name}`;
                });
                setShown({ label: lines.join("\n"), x: r.left + r.width / 2, y: r.top });
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
          className="pointer-events-none fixed z-[60] max-w-[80vw] -translate-x-1/2 -translate-y-full rounded-2xl bg-ink px-3.5 py-2 text-[15px] leading-snug whitespace-pre-line font-semibold text-bg shadow-lg"
          style={{ left: Math.min(Math.max(shown.x, 120), window.innerWidth - 120), top: shown.y - 8 }}
        >
          {shown.label}
        </span>
      )}
    </>
  );
}
