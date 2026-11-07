// Weekly copy of what took work to build: recipes, stores, ingredients, settings.
// Saved as JSON in a private storage bucket; restoring only adds back what's missing.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "backups";
export const KEEP = 8;
export const EVERY_DAYS = 7;

/** Saved in this order, restored in this order (parents before children). */
const TABLES: { name: string; key: string }[] = [
  { name: "household_settings", key: "household_id" },
  { name: "household_people", key: "id" },
  { name: "stores", key: "id" },
  { name: "store_sections", key: "id" },
  { name: "categories", key: "id" },
  { name: "category_store_rules", key: "category_id,store_id" },
  { name: "ingredients", key: "household_id,name_norm" },
  { name: "synonyms", key: "household_id,alias" },
  { name: "bulk_stock", key: "household_id,name_norm" },
  { name: "recipes", key: "id" },
  { name: "recipe_ingredients", key: "id" },
  { name: "meal_plans", key: "id" },
  { name: "meal_plan_items", key: "id" },
];

export interface Backup {
  version: 1;
  createdAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

/** Every row of a table this household can see (the API returns 1,000 at a time). */
async function selectAll(db: SupabaseClient, table: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("*").range(from, from + 999);
    if (error) {
      // A table this database doesn't have yet (an update not run) is skipped.
      if (from === 0 && /does not exist|schema cache/i.test(error.message)) return [];
      throw new Error(`${table}: ${error.message}`);
    }
    out.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < 1000) return out;
  }
}

export async function makeBackup(db: SupabaseClient): Promise<Backup> {
  const tables: Backup["tables"] = {};
  for (const t of TABLES) tables[t.name] = await selectAll(db, t.name);
  return { version: 1, createdAt: new Date().toISOString(), tables };
}

export const backupName = (d: Date) => `${d.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;

/** Which saved files to delete so only the newest `keep` remain. */
export function toPrune(names: string[], keep = KEEP): string[] {
  return [...names].sort().reverse().slice(keep);
}

/** Add back anything missing; never overwrite something edited since. */
export async function restoreBackup(db: SupabaseClient, b: Backup, householdId: string): Promise<{ added: Record<string, number> }> {
  const added: Record<string, number> = {};
  const ours = (rows: Record<string, unknown>[]) => rows.filter((r) => !("household_id" in r) || r.household_id === householdId);
  const ids = async (table: string) => new Set((await selectAll(db, table)).map((r) => r.id as string));

  // Children only for parents we put back: a recipe that still exists keeps
  // its current ingredients, not a mix of old and new.
  const haveRecipes = await ids("recipes");
  const havePlans = await ids("meal_plans");
  const newRecipes = new Set(ours(b.tables.recipes ?? []).map((r) => r.id as string).filter((id) => !haveRecipes.has(id)));
  const newPlans = new Set(ours(b.tables.meal_plans ?? []).map((r) => r.id as string).filter((id) => !havePlans.has(id)));

  for (const t of TABLES) {
    let rows = ours(b.tables[t.name] ?? []);
    if (t.name === "recipes") rows = rows.filter((r) => newRecipes.has(r.id as string));
    if (t.name === "recipe_ingredients") rows = rows.filter((r) => newRecipes.has(r.recipe_id as string));
    if (t.name === "meal_plans") rows = rows.filter((r) => newPlans.has(r.id as string));
    if (t.name === "meal_plan_items") rows = rows.filter((r) => newPlans.has(r.plan_id as string));
    if (!rows.length) continue;
    let n = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await db.from(t.name).upsert(chunk, { onConflict: t.key, ignoreDuplicates: true, defaultToNull: false });
      if (!error) {
        n += chunk.length;
        continue;
      }
      // One clashing row (say, the same link saved again under a new id) shouldn't stop the rest.
      for (const row of chunk) {
        const { error: e } = await db.from(t.name).upsert([row], { onConflict: t.key, ignoreDuplicates: true, defaultToNull: false });
        if (!e) n++;
      }
    }
    added[t.name] = n;
  }
  return { added };
}
