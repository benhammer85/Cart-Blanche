"use client";
import { useEffect, useState } from "react";
import { Button, Sheet, cx } from "./ui";
import { IconMinus, IconPlus } from "./icons";
import { canonicalUnit, formatAmount, formatQty } from "@/lib/units";

// Units people actually buy things in, in the order they come up.
const UNITS: { value: string; label: string }[] = [
  { value: "each", label: "Count" },
  { value: "lb", label: "lb" },
  { value: "oz", label: "oz" },
  { value: "bag", label: "Bag" },
  { value: "bunch", label: "Bunch" },
  { value: "package", label: "Pack" },
  { value: "box", label: "Box" },
  { value: "can", label: "Can" },
  { value: "jar", label: "Jar" },
  { value: "bottle", label: "Bottle" },
  { value: "gallon", label: "Gallon" },
];
const QUICK = [0.5, 1, 2, 3, 4, 6, 12];

/** Weight and volume step by halves; things you count step by one. */
const stepFor = (unit: string) => (["lb", "gallon", "cup"].includes(unit) ? 0.5 : 1);

/**
 * Set an item's amount with taps: a big − / + stepper, units, and common
 * amounts. Saves when you tap Done (or Remove amount).
 */
export function QtySheet({
  item, open, onClose, onSave,
}: {
  item: { name: string; qty: number | null; unit: string | null } | null;
  open: boolean;
  onClose: () => void;
  onSave: (qty: number | null, unit: string | null) => void;
}) {
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState("each");
  useEffect(() => {
    if (!item) return;
    setQty(item.qty != null && item.qty > 0 ? Number(item.qty) : 1);
    setUnit(canonicalUnit(item.unit ?? "") ?? item.unit ?? "each");
  }, [item]);

  const step = stepFor(unit);
  const shown = formatAmount(qty, unit) || formatQty(qty);
  const known = UNITS.some((u) => u.value === unit);

  return (
    <Sheet open={open} onClose={onClose} title={item?.name ?? "Amount"}>
      <div className="flex items-center justify-center gap-6 py-2">
        <button onClick={() => setQty((q) => Math.max(step === 1 ? 1 : 0.5, +(q - step).toFixed(2)))} className="grid h-16 w-16 place-items-center rounded-full bg-soft text-[28px] active:scale-95" aria-label="Less">
          <IconMinus />
        </button>
        <span className="recipe-title min-w-[120px] text-center text-[40px] leading-none font-semibold tabular-nums">{shown}</span>
        <button onClick={() => setQty((q) => +(q + step).toFixed(2))} className="grid h-16 w-16 place-items-center rounded-full bg-ink text-[28px] text-bg active:scale-95" aria-label="More">
          <IconPlus />
        </button>
      </div>

      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {QUICK.map((n) => (
          <button key={n} onClick={() => setQty(n)} className={cx("h-10 min-w-12 shrink-0 rounded-full px-3 text-[16px] tabular-nums ring-1", qty === n ? "bg-ink text-bg ring-ink" : "ring-line")}>
            {formatQty(n)}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[...UNITS, ...(known ? [] : [{ value: unit, label: unit }])].map((u) => (
          <button key={u.value} onClick={() => setUnit(u.value)} className={cx("h-10 rounded-full px-3.5 text-[15px] ring-1", unit === u.value ? "bg-ink text-bg ring-ink" : "ring-line")}>
            {u.label}
          </button>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => { onSave(null, null); onClose(); }}>Remove amount</Button>
        <Button className="flex-1" onClick={() => { onSave(qty, unit); onClose(); }}>Done</Button>
      </div>
    </Sheet>
  );
}
