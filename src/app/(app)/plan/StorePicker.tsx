"use client";
import { StoreBadge } from "@/components/StoreBadge";
import { IconCheck, IconPlus } from "@/components/icons";
import { cx } from "@/components/ui";

/** Step 1: where are you going? Big cards, tap as many as you like. */
export function StorePicker({
  stores, selected, onToggle, onAdd,
}: {
  stores: { id: string; name: string; location: string | null }[];
  selected: string[];
  onToggle: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2.5">
      {stores.map((s) => {
        const on = selected.includes(s.id);
        return (
          <li key={s.id}>
            <button
              onClick={() => onToggle(s.id)}
              aria-pressed={on}
              className={cx(
                "card relative flex h-[84px] w-full items-center gap-3 px-3.5 text-left transition active:scale-[0.98]",
                on && "ring-2 ring-ink",
              )}
            >
              <StoreBadge name={s.name} size={36} />
              <span className="min-w-0">
                <span className="recipe-title line-clamp-2 block text-[17px] leading-tight font-semibold">{s.name}</span>
                {s.location && <span className="block truncate text-[12px] text-muted">{s.location}</span>}
              </span>
              {on && (
                <span className="absolute top-2 right-2 grid h-5 w-5 place-items-center rounded-full bg-ink text-[11px] text-bg">
                  <IconCheck strokeWidth={3} />
                </span>
              )}
            </button>
          </li>
        );
      })}
      <li>
        <button onClick={onAdd} className="flex h-[84px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-[15px] text-muted active:bg-soft">
          <IconPlus /> Add a store
        </button>
      </li>
    </ul>
  );
}
