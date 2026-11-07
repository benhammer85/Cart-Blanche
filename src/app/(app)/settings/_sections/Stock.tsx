"use client";
import { useCallback, useEffect, useState } from "react";
import { useHousehold } from "@/lib/data/useHousehold";
import { Button, PageHeader, Section, TextField } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";
import { normalizeName } from "@/lib/normalize";
import { parsePack } from "@/lib/list/bulk";
import { formatAmount } from "@/lib/units";

interface StockRow {
  name_norm: string;
  qty: number;
  unit: string | null;
  updated_at: string;
}

/** What's left from bulk packs, in the freezer or pantry. The planner uses it first. */
export function StockSettings() {
  const { data, db, householdId } = useHousehold();
  const [rows, setRows] = useState<StockRow[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: r, error: e } = await db.from("bulk_stock").select("name_norm, qty, unit, updated_at").order("name_norm");
    if (e) {
      setMissing(true);
      setRows([]);
    } else setRows((r ?? []) as StockRow[]);
  }, [db]);
  useEffect(() => {
    load();
  }, [load]);

  async function save(n: string, text: string) {
    const amt = parsePack(text);
    if (!n || !amt) {
      setError("Enter an amount like 4 lb, 2 L or 12.");
      return;
    }
    setError(null);
    await db.from("bulk_stock").upsert(
      { household_id: householdId, name_norm: n, qty: amt.qty, unit: amt.unit, updated_at: new Date().toISOString() },
      { onConflict: "household_id,name_norm" },
    );
    load();
  }
  async function add() {
    const n = normalizeName(name, data?.synonyms ?? {});
    await save(n, amount);
    if (n && parsePack(amount)) {
      setName("");
      setAmount("");
    }
  }
  async function remove(n: string) {
    await db.from("bulk_stock").delete().eq("name_norm", n);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Freezer & bulk stock"
        back="/settings"
        subtitle="What’s left from Costco packs and what’s in the freezer. Plans use it first and only the rest goes on the list."
      />
      <div className="px-4">
        {missing ? (
          <p className="card mt-4 p-4 text-[15px]">
            This needs a one-time database update. Run the file <b>20261107000002_store_details.sql</b> in the Supabase SQL Editor, then come back.
          </p>
        ) : (
          <>
            <Section title="Add">
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
                <TextField value={name} onChange={(e) => setName(e.target.value)} placeholder="Chicken thighs" aria-label="Item" />
                <TextField value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="4 lb" aria-label="Amount" className="max-w-[110px]" />
                <Button aria-label="Add to stock"><IconPlus /></Button>
              </form>
              {error && <p className="mt-2 px-1 text-[13px] text-[#d23c3c]">{error}</p>}
            </Section>
            <Section title={rows ? (rows.length ? `${rows.length} items` : "Nothing in stock") : "Loading"}>
              {!!rows?.length && (
                <ul className="card divide-y divide-line overflow-hidden">
                  {rows.map((r) => (
                    <StockLine key={r.name_norm} row={r} onSave={(t) => save(r.name_norm, t)} onRemove={() => remove(r.name_norm)} />
                  ))}
                </ul>
              )}
              <p className="mt-3 px-1 text-[13px] text-muted">
                When a plan buys a Costco pack with pack size set (Settings, Ingredients), what’s left over is added here automatically.
              </p>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function StockLine({ row, onSave, onRemove }: { row: StockRow; onSave: (text: string) => void; onRemove: () => void }) {
  const shown = formatAmount(Number(row.qty), row.unit ?? "each") || String(row.qty);
  const [text, setText] = useState(shown);
  return (
    <li className="flex min-h-[56px] items-center gap-2 px-4 py-1.5">
      <span className="flex-1">
        <span className="block text-[16px] capitalize">{row.name_norm}</span>
        <span className="block text-[12px] text-muted">Updated {new Date(row.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
      </span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() !== shown && onSave(text)}
        className="h-10 w-[96px] rounded-xl bg-soft px-3 text-right text-[15px]"
        aria-label={`Amount of ${row.name_norm}`}
      />
      <button className="px-1 text-muted" onClick={onRemove} aria-label={`Remove ${row.name_norm}`}>
        <IconTrash />
      </button>
    </li>
  );
}
