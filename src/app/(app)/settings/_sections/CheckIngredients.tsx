"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useHousehold } from "@/lib/data/useHousehold";
import { Button, PageHeader, Section, Toast } from "@/components/ui";
import { normalizeName } from "@/lib/normalize";
import { checkIngredient, describeFix, type Issue } from "@/lib/ingredientCheck";

interface Row {
  id: string;
  recipe_id: string;
  household_id: string;
  position: number;
  raw_text: string;
  qty: number | null;
  qty_max: number | null;
  unit: string | null;
  name: string;
  name_norm: string;
  note: string | null;
  parsed_ok: boolean;
}

const SKIP_KEY = "cb:ingcheck-skip";
const readSkip = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SKIP_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
};

/** Imported ingredient lines that read badly, each with a proposed fix you approve. */
export function CheckIngredientsSettings() {
  const { data, db } = useHousehold();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [titles, setTitles] = useState<Map<string, string>>(new Map());
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const all: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page } = await db.from("recipe_ingredients").select("*").range(from, from + 999);
      all.push(...((page ?? []) as Row[]));
      if (!page || page.length < 1000) break;
    }
    const { data: recipes } = await db.from("recipes").select("id, title").eq("archived", false);
    setTitles(new Map(((recipes ?? []) as { id: string; title: string }[]).map((r) => [r.id, r.title])));
    setRows(all);
  }, [db]);
  useEffect(() => {
    setSkip(readSkip());
    load();
  }, [load]);

  const issues = useMemo(() => {
    if (!rows) return null;
    return rows
      .filter((r) => titles.has(r.recipe_id) && !skip.has(r.id))
      .map((r) => ({ row: r, issue: checkIngredient({ ...r, qty: r.qty == null ? null : Number(r.qty) }) }))
      .filter((x): x is { row: Row; issue: Issue } => !!x.issue)
      .sort((a, b) => (titles.get(a.row.recipe_id) ?? "").localeCompare(titles.get(b.row.recipe_id) ?? "") || a.row.position - b.row.position);
  }, [rows, titles, skip]);

  async function apply(row: Row, issue: Issue): Promise<boolean> {
    const syn = data?.synonyms ?? {};
    const f = issue.fix;
    if (f.kind === "rename") {
      const { error } = await db.from("recipe_ingredients").update({ name: f.name, name_norm: normalizeName(f.name, syn), note: f.note }).eq("id", row.id);
      return !error;
    }
    if (f.kind === "split") {
      const [first, ...rest] = f.names;
      const { error } = await db.from("recipe_ingredients").update({ name: first, name_norm: normalizeName(first, syn), note: f.note }).eq("id", row.id);
      if (error) return false;
      const { error: e2 } = await db.from("recipe_ingredients").insert(
        rest.map((n) => ({ household_id: row.household_id, recipe_id: row.recipe_id, position: row.position, raw_text: row.raw_text, qty: null, qty_max: null, unit: null, name: n, name_norm: normalizeName(n, syn), note: f.note, parsed_ok: true })),
      );
      return !e2;
    }
    if (f.kind === "remove") {
      const { error } = await db.from("recipe_ingredients").delete().eq("id", row.id);
      return !error;
    }
    return false;
  }

  async function fixOne(row: Row, issue: Issue) {
    setBusy(row.id);
    const ok = await apply(row, issue);
    setToast(ok ? "Fixed" : "Couldn’t save that one");
    setBusy(null);
    load();
  }
  async function fixAll() {
    if (!issues) return;
    setBusy("all");
    let n = 0;
    for (const { row, issue } of issues) if (issue.fix.kind !== "edit" && (await apply(row, issue))) n++;
    setToast(`Fixed ${n} ${n === 1 ? "line" : "lines"}`);
    setBusy(null);
    load();
  }
  function skipOne(id: string) {
    const next = new Set(skip).add(id);
    setSkip(next);
    try {
      localStorage.setItem(SKIP_KEY, JSON.stringify([...next]));
    } catch {
      /* private mode */
    }
  }

  const fixable = issues?.filter((x) => x.issue.fix.kind !== "edit").length ?? 0;
  return (
    <div>
      <PageHeader title="Check ingredients" back="/settings" />
      <div className="px-5">
        {!issues ? (
          <div className="mt-6 space-y-2">{[0, 1, 2].map((n) => <div key={n} className="skeleton h-16" />)}</div>
        ) : !issues.length ? (
          <p className="recipe-title mt-6 text-[17px] text-muted italic">Every ingredient line reads well.</p>
        ) : (
          <>
            {fixable > 0 && (
              <Button size="lg" className="mt-5 w-full" disabled={!!busy} onClick={fixAll}>
                {busy === "all" ? "Fixing…" : `Fix all ${fixable}`}
              </Button>
            )}
            <Section title={`${issues.length} ${issues.length === 1 ? "line" : "lines"} to look at`}>
              <ul>
                {issues.map(({ row, issue }) => (
                  <li key={row.id} className="border-b hairline py-3">
                    <p className="text-[13px] text-muted">{titles.get(row.recipe_id)}</p>
                    <p className="mt-0.5 text-[16px] leading-snug line-through decoration-muted/60">{row.raw_text}</p>
                    <p className="recipe-title mt-1 text-[16px] leading-snug italic">{issue.problem}: {describeFix(issue.fix)}</p>
                    <div className="mt-2 flex gap-5 text-[15px]">
                      {issue.fix.kind === "edit" ? (
                        <Link href={`/recipes/${row.recipe_id}/edit`} className="font-semibold underline decoration-line decoration-2 underline-offset-4">Edit recipe</Link>
                      ) : (
                        <button className="font-semibold underline decoration-line decoration-2 underline-offset-4 disabled:opacity-50" disabled={!!busy} onClick={() => fixOne(row, issue)}>
                          {busy === row.id ? "Fixing…" : "Fix"}
                        </button>
                      )}
                      <button className="text-muted" onClick={() => skipOne(row.id)}>Leave it</button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
