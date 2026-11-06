import "server-only";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "../supabase/admin";
import { isAllowed } from "../env";
import { parseIngredientLine } from "../ingredientParser";
import { normalizeTitle } from "../normalize";
import { DEFAULT_PLANNER } from "../types";
import {
  DEFAULT_TRIP_STORES, SEED_BONUS_TAGS, SEED_CATEGORIES, SEED_KID_MEALS, SEED_PACK_SIZES, SEED_PEOPLE,
  SEED_STAPLES, SEED_STORE_OVERRIDES, SEED_STORES, SEED_SYNONYMS,
} from "../seed/defaults";

import type { Membership } from "./types";
export type { Membership };

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Make sure an allowlisted user belongs to the household. The first person to
 * log in creates it (with default stores, rules, staples, kid favorites…);
 * the second joins it. Returns null for non-allowlisted users.
 */
export async function ensureMembership(user: User): Promise<Membership | null> {
  const allowed = isAllowed(user.email);
  if (!allowed) return null;
  const admin = supabaseAdmin();

  const { data: existing } = await admin.from("household_members").select("household_id, display_name, initials").eq("user_id", user.id).maybeSingle();
  if (existing) return { householdId: existing.household_id, displayName: existing.display_name, initials: existing.initials };

  const { data: hh } = await admin.from("households").select("id").order("created_at").limit(1).maybeSingle();
  const householdId = hh?.id ?? (await createHousehold());
  const initials = initialsOf(allowed.name);
  const { error } = await admin.from("household_members").insert({ user_id: user.id, household_id: householdId, display_name: allowed.name, initials });
  if (error) throw error;
  return { householdId, displayName: allowed.name, initials };
}

async function check<T extends { error: unknown }>(p: PromiseLike<T>): Promise<T> {
  const r = await p;
  if (r.error) throw r.error;
  return r;
}

export async function createHousehold(): Promise<string> {
  const db = supabaseAdmin();
  const { data: hh } = await check(db.from("households").insert({ name: "Our kitchen" }).select("id").single());
  const household_id = hh!.id as string;

  // Stores and their section walk order
  const storeIds: Record<string, string> = {};
  for (const [i, s] of SEED_STORES.entries()) {
    const { data } = await check(
      db.from("stores").insert({ household_id, name: s.name, location: s.location, is_bulk: s.isBulk, sort_order: i }).select("id").single(),
    );
    storeIds[s.key] = data!.id;
  }
  const sectionRows = SEED_STORES.flatMap((s) =>
    s.sections.map((name, i) => ({ household_id, store_id: storeIds[s.key], name, sort_order: i })),
  );
  await check(db.from("store_sections").insert(sectionRows));

  // Categories → store rules → ingredients
  const { data: cats } = await check(
    db
      .from("categories")
      .insert(SEED_CATEGORIES.map((c, i) => ({ household_id, name: c.name, default_section: c.section, sort_order: i })))
      .select("id, name"),
  );
  const catId = Object.fromEntries(cats!.map((c: { id: string; name: string }) => [c.name, c.id]));
  await check(
    db.from("category_store_rules").insert(
      SEED_CATEGORIES.flatMap((c) => c.stores.map((key, priority) => ({ household_id, category_id: catId[c.name], store_id: storeIds[key], priority }))),
    ),
  );

  const ingredients = new Map<string, Record<string, unknown>>();
  for (const c of SEED_CATEGORIES) {
    for (const item of c.items) ingredients.set(item, { household_id, name_norm: item, category_id: catId[c.name] });
  }
  for (const s of SEED_STAPLES) {
    const row = ingredients.get(s) ?? { household_id, name_norm: s, category_id: catId["Spices & Baking"] };
    ingredients.set(s, { ...row, is_staple: true });
  }
  for (const [name, key] of Object.entries(SEED_STORE_OVERRIDES)) {
    const row = ingredients.get(name) ?? { household_id, name_norm: name, category_id: null };
    ingredients.set(name, { ...row, learned_store_id: storeIds[key] });
  }
  for (const [name, size] of Object.entries(SEED_PACK_SIZES)) {
    const row = ingredients.get(name) ?? { household_id, name_norm: name, category_id: null };
    ingredients.set(name, { ...row, pack_size: size });
  }
  const rows = [...ingredients.values()].map((r) => ({ is_staple: false, learned_store_id: null, pack_size: null, ...r }));
  await check(db.from("ingredients").insert(rows));

  await check(db.from("synonyms").insert(Object.entries(SEED_SYNONYMS).map(([alias, canonical]) => ({ household_id, alias, canonical }))));

  await check(
    db.from("household_people").insert(SEED_PEOPLE.map((p, i) => ({ household_id, name: p.name, kind: p.kind, birthdate: p.birthdate, sort_order: i }))),
  );

  await check(
    db.from("household_settings").insert({
      household_id,
      bonus_tags: SEED_BONUS_TAGS,
      planner_defaults: { ...DEFAULT_PLANNER, storeIds: DEFAULT_TRIP_STORES.map((k) => storeIds[k]) },
    }),
  );

  // Kids' favorites (sized for both kids together = 1 adult-equivalent serving)
  for (const k of SEED_KID_MEALS) {
    const { data: rec } = await check(
      db
        .from("recipes")
        .insert({
          household_id, title: k.title, title_norm: normalizeTitle(k.title), servings: 1, prep_min: 10,
          tags: ["kids"], meal_types: ["dinner", "lunch"], kid_friendly: true, is_kid_meal: true, origin: "seed",
        })
        .select("id")
        .single(),
    );
    await check(
      db.from("recipe_ingredients").insert(
        k.ingredients.map((line, position) => {
          const p = parseIngredientLine(line, SEED_SYNONYMS);
          return {
            household_id, recipe_id: rec!.id, position, raw_text: p.raw, qty: p.qty, qty_max: p.qtyMax, unit: p.unit,
            name: p.name, name_norm: p.nameNorm, note: p.note, parsed_ok: p.ok,
          };
        }),
      ),
    );
  }

  await check(db.from("shopping_lists").insert({ household_id, is_active: true }));
  return household_id;
}
