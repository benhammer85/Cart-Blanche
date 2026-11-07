"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RecipeImage } from "./RecipeImage";
import { IconClock, IconX } from "./icons";
import { cx } from "./ui";

export interface FlipCard {
  id: string;
  title: string;
  image: string | null;
  prepMin: number | null;
  lines: ReactNode[];
}

/**
 * One dinner at a time, photo first. Swipe right or tap Add to take it,
 * swipe left or tap Skip. The buttons always work, so the gesture is optional.
 */
export function FlipThrough({ cards, picked, onToggle, onClose }: { cards: FlipCard[]; picked: string[]; onToggle: (id: string) => void; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  const start = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const card = cards[i];
  const nextCard = cards[i + 1];

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function go(dir: "left" | "right") {
    if (!card || leaving) return;
    if (dir === "right" && !picked.includes(card.id)) onToggle(card.id);
    if (navigator.vibrate) navigator.vibrate(dir === "right" ? 12 : 6);
    setLeaving(dir);
    setTimeout(() => {
      setLeaving(null);
      setDx(0);
      setI((n) => n + 1);
    }, 220);
  }

  const offset = leaving === "right" ? 500 : leaving === "left" ? -500 : dx;
  const added = card && picked.includes(card.id);

  return (
    <div className="animate-fade fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-label="Choose dinners">
      <div className="pt-safe flex items-center justify-between px-4">
        <button onClick={onClose} className="-ml-2 grid h-11 w-11 place-items-center text-[22px] text-muted" aria-label="Close">
          <IconX />
        </button>
        <span className="text-[14px] text-muted tabular-nums">{card ? `${i + 1} of ${cards.length}` : ""}</span>
        <button onClick={onClose} className="-mr-2 h-11 px-2 text-[16px] font-semibold text-accent">
          Done{picked.length ? ` · ${picked.length}` : ""}
        </button>
      </div>

      <div className="relative flex-1 px-4 pt-2">
        {nextCard && (
          <div className="absolute inset-x-4 top-2 bottom-0 scale-[0.96] opacity-60" aria-hidden>
            <div className="card h-full overflow-hidden">
              <div className="aspect-[4/5] max-h-[62%] w-full bg-soft">
                <RecipeImage src={nextCard.image} title={nextCard.title} />
              </div>
            </div>
          </div>
        )}
        {card ? (
          <div
            className="card absolute inset-x-4 top-2 bottom-0 flex touch-pan-y flex-col overflow-hidden select-none"
            style={{
              transform: `translateX(${offset}px) rotate(${offset / 25}deg)`,
              transition: start.current?.dragging ? "none" : "transform 0.22s ease",
            }}
            onTouchStart={(e) => {
              start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dragging: false };
            }}
            onTouchMove={(e) => {
              const st = start.current;
              if (!st) return;
              const mx = e.touches[0].clientX - st.x;
              if (!st.dragging && Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(e.touches[0].clientY - st.y)) st.dragging = true;
              if (st.dragging) setDx(mx);
            }}
            onTouchEnd={() => {
              const moved = dx;
              start.current = null;
              if (moved > 90) go("right");
              else if (moved < -90) go("left");
              else setDx(0);
            }}
          >
            <div className="relative min-h-0 flex-1 bg-soft">
              <RecipeImage src={card.image} title={card.title} />
              <span
                className={cx("absolute top-4 left-4 rounded-lg border-2 px-3 py-1 text-[15px] font-bold tracking-wide uppercase transition-opacity", "border-white bg-ok/80 text-white")}
                style={{ opacity: offset > 20 ? Math.min(offset / 90, 1) : 0 }}
              >
                Add
              </span>
              <span
                className="absolute top-4 right-4 rounded-lg border-2 border-white bg-black/50 px-3 py-1 text-[15px] font-bold tracking-wide text-white uppercase transition-opacity"
                style={{ opacity: offset < -20 ? Math.min(-offset / 90, 1) : 0 }}
              >
                Skip
              </span>
              {added && <span className="absolute bottom-3 left-3 rounded-full bg-ok px-3 py-1 text-[13px] font-semibold text-white">Added</span>}
            </div>
            <div className="p-5">
              <p className="recipe-title text-[26px] leading-tight font-semibold">{card.title}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-1 text-[14px] text-muted">
                {card.prepMin != null && <><IconClock /> {card.prepMin} min</>}
                {card.lines.map((l, k) => (
                  <span key={k}>{(k > 0 || card.prepMin != null) && "· "}{l}</span>
                ))}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="recipe-title text-[24px] font-semibold">That’s all of them</p>
              <p className="mt-1 text-[15px] text-muted">{picked.length ? `${picked.length} chosen` : "Nothing chosen yet"}</p>
              <div className="mt-5 flex justify-center gap-3">
                <button onClick={() => setI(0)} className="h-11 rounded-xl bg-soft px-5 font-semibold">Start over</button>
                <button onClick={onClose} className="h-11 rounded-xl bg-ink px-5 font-semibold text-bg">Done</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {card && (
        <div className="pb-safe flex gap-3 px-4 pt-4 pb-4">
          <button onClick={() => go("left")} className="h-14 flex-1 rounded-xl bg-soft text-[17px] font-semibold">Skip</button>
          <button
            onClick={() => (added ? onToggle(card.id) : go("right"))}
            className={cx("h-14 flex-1 rounded-xl text-[17px] font-semibold", added ? "bg-ok text-white" : "bg-ink text-bg")}
          >
            {added ? "Added ✓" : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}
