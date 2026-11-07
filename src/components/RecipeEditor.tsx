"use client";
import { useMemo, useState } from "react";
import { Chip, Section, Segmented, TextArea, TextField, Toggle, cx } from "./ui";
import { parseIngredientLine } from "@/lib/ingredientParser";
import { formatAmount } from "@/lib/units";
import type { MealType, RecipeDraft } from "@/lib/types";

const PROTEINS = ["chicken", "beef", "pork", "turkey", "seafood", "lamb", "tofu", "beans", "eggs"];

/** Editable form for any recipe draft. Ingredients are edited as lines and re-parsed live. */
export function RecipeEditor({ draft, onChange, synonyms = {} }: { draft: RecipeDraft; onChange: (d: RecipeDraft) => void; synonyms?: Record<string, string> }) {
  const [ingText, setIngText] = useState(() => draft.ingredients.map((i) => i.raw).join("\n"));
  const [stepText, setStepText] = useState(() => draft.steps.map((s) => (s.isSection ? `# ${s.text}` : s.text)).join("\n\n"));
  const [tagText, setTagText] = useState("");
  const set = (patch: Partial<RecipeDraft>) => onChange({ ...draft, ...patch });

  const parsed = useMemo(() => draft.ingredients, [draft.ingredients]);
  const bad = parsed.filter((p) => !p.ok);

  return (
    <div className="space-y-1">
      <Section title="Title">
        <TextField value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Recipe name" />
      </Section>

      <div className="grid grid-cols-3 gap-2 pt-4">
        <NumberField label="Serves" value={draft.servings} onChange={(v) => set({ servings: v ?? 4 })} />
        <NumberField label="Prep min" value={draft.prepMin} onChange={(v) => set({ prepMin: v })} />
        <NumberField label="Cook min" value={draft.cookMin} onChange={(v) => set({ cookMin: v })} />
      </div>

      <Section title="Meal">
        <div className="flex flex-wrap gap-2">
          {(["dinner", "lunch", "breakfast", "side", "dessert"] as MealType[]).map((m) => (
            <Chip
              key={m}
              active={draft.mealTypes.includes(m)}
              onClick={() => set({ mealTypes: draft.mealTypes.includes(m) ? draft.mealTypes.filter((x) => x !== m) : [...draft.mealTypes, m] })}
            >
              {m[0].toUpperCase() + m.slice(1)}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Main protein (for variety)">
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          <Chip active={!draft.mainProtein} onClick={() => set({ mainProtein: null })}>None</Chip>
          {PROTEINS.map((p) => (
            <Chip key={p} active={draft.mainProtein === p} onClick={() => set({ mainProtein: p })}>
              {p}
            </Chip>
          ))}
        </div>
      </Section>

      <div className="card mt-4 divide-y divide-line">
        <label className="flex items-center justify-between px-4 py-3">
          <span>
            <span className="block text-[17px]">Kids eat this too</span>
            <span className="block text-[13px] text-muted">No separate kids’ dinner needed</span>
          </span>
          <Toggle checked={draft.kidFriendly} onChange={(v) => set({ kidFriendly: v })} label="Kid friendly" />
        </label>
        <label className="flex items-center justify-between px-4 py-3">
          <span>
            <span className="block text-[17px]">Kids’ meal</span>
            <span className="block text-[13px] text-muted">Hot dogs, nuggets… planned alongside adult dinners</span>
          </span>
          <Toggle checked={draft.isKidMeal} onChange={(v) => set({ isKidMeal: v, kidFriendly: v || draft.kidFriendly })} label="Kids' meal" />
        </label>
      </div>

      <Section title="Tags">
        <div className="flex flex-wrap gap-2">
          {draft.tags.map((t) => (
            <Chip key={t} active onClick={() => set({ tags: draft.tags.filter((x) => x !== t) })}>
              {t} ✕
            </Chip>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const t = tagText.trim();
              if (t && !draft.tags.includes(t)) set({ tags: [...draft.tags, t] });
              setTagText("");
            }}
          >
            <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="+ tag" className="h-9 w-28 rounded-full bg-card px-3.5 text-[14px] ring-1 ring-line outline-none" />
          </form>
        </div>
      </Section>

      <Section title="Ingredients, one per line">
        <TextArea
          rows={Math.max(6, ingText.split("\n").length + 1)}
          value={ingText}
          onChange={(e) => {
            setIngText(e.target.value);
            set({ ingredients: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => parseIngredientLine(l, synonyms)) });
          }}
          placeholder={"1 1/2 cups orzo\n3 garlic cloves, minced\nKosher salt"}
        />
        {parsed.length > 0 && (
          <div className="card mt-2 overflow-hidden">
            <p className="px-4 pt-3 text-[12px] font-semibold uppercase tracking-wide text-muted">How it reads</p>
            <ul className="px-4 pb-3 text-[14px]">
              {parsed.map((p, i) => (
                <li key={i} className={cx("flex gap-2 py-1", !p.ok && "text-[#d23c3c]")}>
                  <span className="w-20 shrink-0 text-muted tabular-nums">{formatAmount(p.qty, p.unit, p.qtyMax) || ""}</span>
                  <span className="flex-1">
                    {p.nameNorm}
                    {!p.ok && " (check this one)"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {bad.length > 0 && <p className="mt-2 px-1 text-[13px] text-[#d23c3c]">{bad.length === 1 ? "One line needs" : `${bad.length} lines need`} a quick fix above.</p>}
      </Section>

      <Section title="Steps (leave a blank line between them)">
        <TextArea
          rows={8}
          value={stepText}
          onChange={(e) => {
            setStepText(e.target.value);
            set({
              steps: e.target.value
                .split(/\n\s*\n|\n(?=\d+[.)]\s)/)
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => (s.startsWith("#") ? { text: s.replace(/^#+\s*/, ""), isSection: true } : { text: s.replace(/^\d+[.)]\s*/, "") })),
            });
          }}
        />
      </Section>

      <Section title="Notes">
        <TextArea rows={3} value={draft.notes ?? ""} onChange={(e) => set({ notes: e.target.value || null })} />
      </Section>

      <Section title="Source link">
        <TextField value={draft.sourceUrl ?? ""} onChange={(e) => set({ sourceUrl: e.target.value.trim() || null })} placeholder="https://" inputMode="url" />
      </Section>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="card block px-3 py-2">
      <span className="block text-[12px] text-muted">{label}</span>
      <input
        inputMode="decimal"
        value={value ?? ""}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          onChange(Number.isFinite(n) ? n : null);
        }}
        className="w-full bg-transparent text-[20px] font-semibold outline-none"
        placeholder=""
      />
    </label>
  );
}

export function emptyDraft(origin: RecipeDraft["origin"] = "manual"): RecipeDraft {
  return {
    title: "", servings: 4, prepMin: null, cookMin: null, steps: [], notes: null, sourceUrl: null, sourceName: null,
    tags: [], mealTypes: ["dinner"], mainProtein: null, kidFriendly: false, isKidMeal: false, origin, externalId: null, ingredients: [],
  };
}

export { Segmented };
