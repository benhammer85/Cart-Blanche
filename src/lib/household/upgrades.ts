import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inferMealTypes } from "../infer";

// One-time additions to households created before a feature existed.
// Each step checks whether it already ran, so this is safe to call often;
// a per-instance cache keeps it to one check per server start.

const done = new Set<string>();

export const ASIAN_GROCERIES = [
  "gochujang", "gochugaru", "gochugaru pepper flake", "kimchi", "doenjang", "korean dumpling", "dumpling", "rice cake",
  "korean rice cake round", "rice cake slice", "napa cabbage", "bok choy", "baby bok choy", "gai lan", "chinese broccoli",
  "shiitake mushroom", "dried shiitake mushroom", "enoki mushroom", "oyster mushroom", "mirin", "shaoxing wine",
  "shaoxing rice wine", "chinese rice wine", "fish sauce", "oyster sauce", "hoisin sauce", "black bean sauce",
  "dark soy sauce", "korean soup soy sauce", "chinese sesame paste", "dashi", "kombu", "dried sea kelp", "nori",
  "roasted seaweed", "rice noodles", "sen yai", "udon noodles", "ramen noodles", "instant ramen noodles",
  "sweet potato noodles", "glass noodles", "japchae sauce", "perilla", "korean green pepper", "short grain rice",
  "sushi rice", "sweet rice flour", "dried anchovy", "sichuan pepper", "chile-garlic paste", "sambal oelek",
  "chili crisp", "black vinegar", "rice vinegar", "chinese rice vinegar", "yeotkireum", "jujube", "pearl tapioca",
];

const HMART_SECTIONS = ["Produce", "Meat", "Seafood", "International", "Pantry", "Frozen", "Dairy", "Snacks", "Other"];

export async function applyUpgrades(db: SupabaseClient, householdId: string): Promise<void> {
  if (done.has(householdId)) return;
  try {
    await addHMart(db, householdId);
    await addLovedBonus(db, householdId);
    await addEverydayItems(db, householdId);
    await reclassifyMeals(db, householdId);
    done.add(householdId);
  } catch (e) {
    console.error("household upgrade failed", e);
  }
}

// Things we actually buy (from our Shaw's receipts) that recipes rarely mention.
const EVERYDAY: Record<string, string[]> = {
  Produce: ["mandarin", "cantaloupe", "watermelon", "kiwi", "mango", "radish", "turnip", "corn on the cob"],
  "Dairy & Eggs": ["creamer", "coffee creamer", "international delight creamer", "whipped cream", "cottage cheese", "kefir", "chocolate milk", "organic 2% milk", "half gallon milk"],
  Cheese: ["american cheese", "string cheese", "sliced cheese"],
  Deli: ["genoa salami", "pepperoni", "deli ham"],
  "Bread & Bakery": ["portuguese sweet roll", "sandwich bread", "boule"],
  Pantry: ["ramen noodles", "maruchan", "canned soup", "progresso soup", "jell-o", "nutella", "bisquick", "brownie mix", "cake mix", "pasta sauce", "pizza sauce", "mac and cheese", "boxed mac and cheese", "applesauce pouch", "storage bag"],
  Frozen: ["popsicle", "popsicles", "fruit bar", "hoodsie", "ice cream cake", "frozen pizza", "pillsbury dough"],
  Snacks: ["cheez-it", "goldfish", "ice breakers", "candy", "m&ms", "kit kat", "corn nuts", "popcorn", "veggie straws", "donettes", "peanuts"],
  Beverages: ["gatorade", "seltzer", "ginger ale", "coke", "coke zero", "juice boxes", "apple juice", "orange juice"],
};

async function addEverydayItems(db: SupabaseClient, household_id: string) {
  const [{ data: cats }, { data: known }] = await Promise.all([
    db.from("categories").select("id, name").eq("household_id", household_id),
    db.from("ingredients").select("name_norm").eq("household_id", household_id),
  ]);
  const have = new Set(((known ?? []) as { name_norm: string }[]).map((k) => k.name_norm));
  const catId = (n: string) => (cats ?? []).find((c: { name: string }) => c.name === n)?.id as string | undefined;
  const rows = Object.entries(EVERYDAY).flatMap(([cat, items]) =>
    catId(cat) ? items.filter((i) => !have.has(i)).map((name_norm) => ({ household_id, name_norm, category_id: catId(cat) })) : [],
  );
  if (rows.length) await db.from("ingredients").insert(rows);
}

async function addLovedBonus(db: SupabaseClient, household_id: string) {
  const { data } = await db.from("household_settings").select("bonus_tags").eq("household_id", household_id).maybeSingle();
  const tags = (data?.bonus_tags as string[] | undefined) ?? [];
  if (!tags.includes("Loved")) await db.from("household_settings").update({ bonus_tags: ["Loved", ...tags] }).eq("household_id", household_id);
}

async function addHMart(db: SupabaseClient, household_id: string) {
  const { data: existing } = await db.from("categories").select("id").eq("household_id", household_id).eq("name", "Asian groceries").maybeSingle();
  if (existing) return;

  const { data: stores } = await db.from("stores").select("id, name, sort_order").eq("household_id", household_id);
  const byName = (n: string) => (stores ?? []).find((s: { name: string }) => s.name.toLowerCase().replace(/[^a-z]/g, "") === n)?.id as string | undefined;

  // H Mart store + aisles
  let hmart = byName("hmart");
  if (!hmart) {
    const { data } = await db
      .from("stores")
      .insert({ household_id, name: "H Mart", location: null, sort_order: (stores ?? []).length, is_bulk: false })
      .select("id")
      .single();
    hmart = data!.id as string;
    await db.from("store_sections").insert(HMART_SECTIONS.map((name, sort_order) => ({ household_id, store_id: hmart, name, sort_order })));
  }

  // "International" aisle in the other stores, just before "Other"
  for (const s of stores ?? []) {
    const { data: secs } = await db.from("store_sections").select("name, sort_order").eq("store_id", s.id);
    if ((secs ?? []).some((x: { name: string }) => x.name === "International")) continue;
    const otherOrder = (secs ?? []).find((x: { name: string }) => x.name === "Other")?.sort_order ?? (secs ?? []).length;
    await db.from("store_sections").update({ sort_order: otherOrder + 1 }).eq("store_id", s.id).eq("name", "Other");
    await db.from("store_sections").insert({ household_id, store_id: s.id, name: "International", sort_order: otherOrder });
  }

  // Category + rules: H Mart first, then the regular grocery stores
  const { data: cats } = await db.from("categories").select("sort_order").eq("household_id", household_id);
  const { data: cat } = await db
    .from("categories")
    .insert({ household_id, name: "Asian groceries", default_section: "International", sort_order: (cats ?? []).length })
    .select("id")
    .single();
  const order = [hmart, byName("marketbasket"), byName("shaws"), byName("traderjoes"), byName("costco")].filter(Boolean) as string[];
  await db.from("category_store_rules").insert(order.map((store_id, priority) => ({ household_id, category_id: cat!.id, store_id, priority })));

  // Move these ingredients into the new category (keeps staples, pack sizes and any store you set)
  for (const name_norm of ASIAN_GROCERIES) {
    await db.from("ingredients").upsert({ household_id, name_norm, category_id: cat!.id }, { onConflict: "household_id,name_norm" });
  }
}

/**
 * Recipes imported before the stricter dinner check (dressings, drinks, plain
 * rice, sides) were all marked "dinner". Re-sort them once; a marker in the
 * settings keeps later manual changes from being undone.
 */
async function reclassifyMeals(db: SupabaseClient, household_id: string) {
  const { data: settings } = await db.from("household_settings").select("planner_defaults").eq("household_id", household_id).maybeSingle();
  const defaults = (settings?.planner_defaults ?? {}) as Record<string, unknown>;
  if (!settings || defaults._mealTypesV2) return;
  const { data: recipes } = await db.from("recipes").select("id, title, tags, meal_types").eq("household_id", household_id);
  for (const r of (recipes ?? []) as { id: string; title: string; tags: string[]; meal_types: string[] }[]) {
    if (r.meal_types.length !== 1 || r.meal_types[0] !== "dinner") continue;
    const next = inferMealTypes(r.title, r.tags ?? []);
    if (!next.includes("dinner")) await db.from("recipes").update({ meal_types: next }).eq("id", r.id);
  }
  await db.from("household_settings").update({ planner_defaults: { ...defaults, _mealTypesV2: true } }).eq("household_id", household_id);
}
