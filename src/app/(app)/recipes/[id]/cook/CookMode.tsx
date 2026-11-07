"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Sheet, cx } from "@/components/ui";
import { IconClock, IconX, IconCheck } from "@/components/icons";
import { findTimers, formatClock } from "@/lib/timers";
import { formatAmount } from "@/lib/units";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Recipe } from "@/lib/types";

interface Running {
  id: number;
  label: string;
  endsAt: number;
  done: boolean;
}

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
  } catch {
    /* no audio */
  }
}

export function CookMode({ recipe: r }: { recipe: Recipe }) {
  const router = useRouter();
  // One page per step; a section heading rides along with the step after it.
  const pages = useMemo(() => {
    const out: { text: string; section: string | null }[] = [];
    let section: string | null = null;
    for (const s of r.steps ?? []) {
      if (s.isSection) section = s.text;
      else {
        out.push({ text: s.text.replace(/^\d+\.\s*/, ""), section });
        section = null;
      }
    }
    return out;
  }, [r.steps]);
  const [i, setI] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [scale, setScale] = useState(1);
  const [timers, setTimers] = useState<Running[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const touch = useRef<number | null>(null);
  const total = pages.length;
  const page = pages[i];
  const stepTimers = page ? findTimers(page.text) : [];

  // Keep the screen awake while cooking.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const get = () => nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    get();
    const onVis = () => document.visibilityState === "visible" && get();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
    };
  }, []);

  // Tick timers; ring when one finishes.
  useEffect(() => {
    if (!timers.some((t) => !t.done)) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setTimers((cur) =>
        cur.map((x) => {
          if (!x.done && x.endsAt <= t) {
            beep();
            navigator.vibrate?.([300, 150, 300, 150, 300]);
            return { ...x, done: true };
          }
          return x;
        }),
      );
    }, 500);
    return () => clearInterval(id);
  }, [timers]);

  const go = (d: number) => setI((x) => Math.max(0, Math.min(total - 1, x + d)));

  async function madeIt() {
    const db = supabaseBrowser();
    // Prefer ticking it off in this week's plan; otherwise just count it on the recipe.
    const { data: item } = await db
      .from("meal_plan_items")
      .select("id")
      .eq("recipe_id", r.id)
      .is("made_at", null)
      .order("position")
      .limit(1)
      .maybeSingle();
    if (item) await db.rpc("mark_meal_made", { p_item_id: item.id, p_made: true });
    else await db.from("recipes").update({ times_made: (r.times_made ?? 0) + 1, last_made_at: new Date().toISOString().slice(0, 10) }).eq("id", r.id);
    setSaved(true);
    router.refresh();
  }

  const ingredients = [...(r.recipe_ingredients ?? [])].sort((a, b) => a.position - b.position);

  return (
    <div
      className="pt-safe fixed inset-0 z-50 flex flex-col bg-bg"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 60) dx < 0 ? (i === total - 1 ? setFinished(true) : go(1)) : go(-1);
      }}
    >
      <div className="flex items-center gap-3 px-4 py-2">
        <button onClick={() => router.back()} className="grid h-10 w-10 place-items-center rounded-full bg-soft text-xl" aria-label="Close cook mode">
          <IconX />
        </button>
        <p className="recipe-title min-w-0 flex-1 truncate text-[16px] font-semibold">{r.title}</p>
        <button onClick={() => setShowIngredients(true)} className="h-10 rounded-full bg-soft px-4 text-[15px] font-medium">Ingredients</button>
      </div>

      {/* progress */}
      <div className="flex gap-1 px-4">
        {pages.map((_, n) => (
          <span key={n} className={cx("h-1 flex-1 rounded-full", n <= i ? "bg-accent" : "bg-line")} />
        ))}
      </div>

      {timers.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-3">
          {timers.map((t) => (
            <button
              key={t.id}
              onClick={() => setTimers((cur) => cur.filter((x) => x.id !== t.id))}
              className={cx("flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] font-semibold tabular-nums", t.done ? "animate-pulse bg-accent text-accent-ink" : "bg-ink text-bg")}
              aria-label={`${t.label} timer, tap to dismiss`}
            >
              <IconClock /> {t.done ? `${t.label} done` : formatClock((t.endsAt - now) / 1000)}
              <IconX className="opacity-60" />
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-1 flex-col justify-center overflow-y-auto px-6 py-6">
        {!total ? (
          <p className="text-center text-[20px] text-muted">This recipe has no steps saved.</p>
        ) : finished ? (
          <div className="text-center">
            <p className="recipe-title text-[30px] font-semibold">Dinner’s ready</p>
            <p className="mt-2 text-[17px] text-muted">Enjoy it.</p>
            <Button size="lg" className="mt-8 w-full" onClick={madeIt} disabled={saved}>
              {saved ? (<><IconCheck /> Marked as made</>) : "We made this"}
            </Button>
            <Button variant="ghost" className="mt-2 w-full" onClick={() => router.back()}>Back to recipe</Button>
          </div>
        ) : (
          <>
            <p className="text-[14px] font-semibold uppercase tracking-wide text-muted">
              Step {i + 1} of {total}
              {page.section && ` · ${page.section}`}
            </p>
            <p className="mt-4 text-[26px] leading-[1.45] font-medium">{page.text}</p>
            {stepTimers.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {stepTimers.map((t, n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setNow(Date.now());
                      setTimers((cur) => [...cur, { id: Date.now() + n, label: t.label, endsAt: Date.now() + t.seconds * 1000, done: false }]);
                    }}
                    className="flex h-12 items-center gap-2 rounded-full bg-accent-soft px-5 text-[17px] font-semibold text-accent"
                  >
                    <IconClock /> Start {t.label} timer
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {!finished && total > 0 && (
        <div className="pb-safe flex gap-3 px-4 pt-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => go(-1)} disabled={i === 0}>Back</Button>
          <Button size="lg" className="flex-[2]" onClick={() => (i === total - 1 ? setFinished(true) : go(1))}>
            {i === total - 1 ? "Finish" : "Next"}
          </Button>
        </div>
      )}

      <Sheet open={showIngredients} onClose={() => setShowIngredients(false)} title="Ingredients">
        <div className="mb-3 flex gap-2">
          {[0.5, 1, 1.5, 2].map((s) => <Chip key={s} active={scale === s} onClick={() => setScale(s)}>{s}×</Chip>)}
        </div>
        <ul className="card divide-y divide-line overflow-hidden">
          {ingredients.map((g) => (
            <li key={g.id} className="flex gap-3 px-4 py-3 text-[17px]">
              <span className="w-20 shrink-0 font-semibold tabular-nums">{formatAmount(g.qty != null ? Number(g.qty) * scale : null, g.unit, g.qty_max != null ? Number(g.qty_max) * scale : null)}</span>
              <span>{g.name}{g.note && <span className="text-muted">, {g.note}</span>}</span>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
