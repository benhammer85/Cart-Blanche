"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, PageHeader, Section, Stepper, TextArea, TextField, Toast } from "@/components/ui";
import { IconCopy, IconCheck } from "@/components/icons";
import { useHousehold } from "@/lib/data/useHousehold";
import { buildClaudePrompt, parseClaudeReply } from "@/lib/import/claudeBridge";
import { ageOn } from "@/lib/list/buildList";
import { saveRecipe } from "@/lib/data/recipes";
import { formatAmount } from "@/lib/units";
import type { RecipeDraft } from "@/lib/types";

import { PLAN_INBOX_KEY } from "@/lib/planInbox";

export function ClaudeBridge() {
  const router = useRouter();
  const { data, db, householdId } = useHousehold();
  const [titles, setTitles] = useState<{ title: string; is_kid_meal: boolean }[]>([]);
  const [count, setCount] = useState(5);
  const [extra, setExtra] = useState("");
  const [reply, setReply] = useState("");
  const [result, setResult] = useState<ReturnType<typeof parseClaudeReply> | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    db.from("recipes").select("title, is_kid_meal").eq("archived", false).then(({ data }) => setTitles(data ?? []));
  }, [db]);

  const prompt = useMemo(() => {
    if (!data) return "";
    const kids = data.people.filter((p) => p.kind === "kid");
    const stores = data.stores.filter((s) => s.archived === false && data.plannerDefaults.storeIds.includes(s.id)).map((s) => s.name);
    return buildClaudePrompt({
      adults: data.people.filter((p) => p.kind === "adult").length,
      kidAges: kids.map((k) => (k.birthdate ? ageOn(k.birthdate) : 5)),
      count,
      maxPrep: data.plannerDefaults.maxPrep,
      stores: stores.length ? stores : data.stores.map((s) => s.name),
      avoid: data.avoidTerms,
      mustInclude: [],
      favoriteTitles: titles.filter((t) => !t.is_kid_meal).map((t) => t.title),
      kidFavorites: titles.filter((t) => t.is_kid_meal).map((t) => t.title.toLowerCase()),
      notes: extra.trim() || undefined,
    });
  }, [data, titles, count, extra]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setToast("Prompt copied — paste it into Claude");
    } catch {
      setToast("Couldn’t copy — select the text instead");
    }
  }

  async function save(i: number, d: RecipeDraft) {
    await saveRecipe(db, householdId, d);
    setSaved((s) => new Set(s).add(i));
    setToast(`Saved “${d.title}”`);
    router.refresh();
  }

  function addToPlan(drafts: RecipeDraft[]) {
    try {
      const cur = JSON.parse(sessionStorage.getItem(PLAN_INBOX_KEY) ?? "[]");
      sessionStorage.setItem(PLAN_INBOX_KEY, JSON.stringify([...cur, ...drafts]));
    } catch {
      /* ignore */
    }
    router.push("/plan");
  }

  return (
    <div>
      <PageHeader title="Ideas from Claude" back="/recipes" subtitle="No API needed: copy the prompt into your Claude app, then paste its reply here." />
      <div className="px-4">
        <Section title="1 · Build the prompt">
          <div className="card flex items-center justify-between px-4 py-3">
            <span className="text-[17px]">How many ideas</span>
            <Stepper value={count} min={1} max={10} onChange={setCount} />
          </div>
          <TextField className="mt-2" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Anything else? (e.g. a soup, use up spinach)" />
          <details className="card mt-2 p-4 text-[13px] text-muted">
            <summary className="cursor-pointer text-[15px] text-ink">Preview prompt</summary>
            <pre className="mt-2 whitespace-pre-wrap font-sans">{prompt}</pre>
          </details>
          <Button size="lg" className="mt-3 w-full" onClick={copyPrompt} disabled={!prompt}>
            <IconCopy /> Copy prompt
          </Button>
        </Section>

        <Section title="2 · Paste Claude’s reply">
          <TextArea rows={7} value={reply} onChange={(e) => setReply(e.target.value)} placeholder='{ "recipes": [ … ] }' />
          <Button variant="secondary" size="lg" className="mt-2 w-full" disabled={!reply.trim()} onClick={() => { setResult(parseClaudeReply(reply, data?.synonyms ?? {})); setSaved(new Set()); }}>
            Read reply
          </Button>
        </Section>

        {result && !result.ok && (
          <div className="card mt-4 p-4">
            <p className="font-semibold text-[#d23c3c]">That reply didn’t match the format</p>
            <ul className="mt-1 list-disc pl-5 text-[14px] text-muted">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            <p className="mt-2 text-[13px] text-muted">Tip: ask Claude “Reply with only the JSON, exactly in the schema”.</p>
          </div>
        )}

        {result?.ok && (
          <Section title={`3 · ${result.recipes.length} ideas`}>
            <div className="space-y-3">
              {result.recipes.map((r, i) => (
                <div key={i} className="card p-4">
                  <p className="recipe-title text-[19px] font-semibold">{r.title}</p>
                  <p className="text-[13px] text-muted">{[r.prepMin && `${r.prepMin} min`, `serves ${r.servings}`, ...r.tags.filter((t) => t !== "from Claude")].filter(Boolean).join(" · ")}</p>
                  <p className="mt-2 text-[14px] text-muted">{r.ingredients.map((x) => `${formatAmount(x.qty, x.unit)} ${x.name}`.trim()).join(", ")}</p>
                  {r.notes && <p className="mt-2 text-[14px]">{r.notes}</p>}
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant={saved.has(i) ? "secondary" : "primary"} disabled={saved.has(i)} onClick={() => save(i, r)}>
                      {saved.has(i) ? <><IconCheck /> Saved</> : "Save to recipes"}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => addToPlan([r])}>Add to this week</Button>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="secondary" className="mt-3 w-full" onClick={() => addToPlan(result.recipes)}>Add all to this week’s plan</Button>
          </Section>
        )}
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
