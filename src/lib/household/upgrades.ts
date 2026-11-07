import "server-only";
import { COSTCO_HISTORY } from "../seed/costcoHistory";
import { SHAWS_HISTORY } from "../seed/shawsHistory";
import { sortSections, walkOrderFor } from "../list/walkOrder";
import { parseIngredientLine } from "../ingredientParser";
import { OUR_KITCHEN } from "../kitchen";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inferMealTypes } from "../infer";
import { normalizeName } from "../normalize";

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

const HMART_SECTIONS = walkOrderFor("H Mart");

export async function applyUpgrades(db: SupabaseClient, householdId: string): Promise<void> {
  if (done.has(householdId)) return;
  try {
    await addHMart(db, householdId);
    await addLovedBonus(db, householdId);
    await addEverydayItems(db, householdId);
    await reclassifyMeals(db, householdId);
    await addCostcoFavorites(db, householdId);
    await setUpKitchen(db, householdId);
    await addChickenRamen(db, householdId);
    await setWalkOrder(db, householdId);
    await addShawsHistory(db, householdId);
    await addCostcoCounts(db, householdId);
    await addFamilyWords(db, householdId);
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

// What our Costco receipts (six trips, fall 2026) show we buy there, by category.
// Pack sizes only where the Kirkland pack is standard.
const COSTCO: Record<string, [string, string?][]> = {
  "Meat & Poultry": [["chicken thighs", "~6.5 lb"], ["rotisserie chicken"], ["chuck roast"], ["hot dogs"], ["meatballs"]],
  "Dairy & Eggs": [["eggs", "2 dozen"], ["butter", "4 lb"], ["organic milk"], ["chocolate milk"], ["half and half"], ["yogurt"]],
  Cheese: [["cheddar slices"], ["string cheese"], ["mexican cheese blend"], ["parmesan"]],
  Produce: [["strawberries"], ["raspberries"], ["bananas"], ["red grapes"], ["apples", "3 lb"], ["avocados"], ["limes", "3 lb"], ["mandarins"], ["baby spinach"], ["mushrooms"], ["sweet corn"], ["watermelon"], ["cantaloupe"]],
  Frozen: [["chicken nuggets"], ["chicken fried rice"], ["yakisoba"], ["mini wontons"], ["pierogi"], ["waffles"], ["fruit bars"]],
  Pantry: [["pasta"], ["tortillas"], ["maple syrup"], ["olive oil"], ["coffee"]],
  "Bread & Bakery": [["hot dog buns"], ["croissants"], ["sandwich bread"]],
  Snacks: [["goldfish"], ["fruit snacks"]],
};
const COSTCO_NOTES =
  "Rotisserie chicken, boneless chicken thighs, chuck roast, Kirkland meatballs, Hebrew National hot dogs, Dino Buddies nuggets, " +
  "frozen chicken fried rice, yakisoba, mini wontons, pierogi, butternut squash ravioli, organic chocolate milk, cheddar slices, " +
  "string cheese, Mexican cheese blend, eggs, berries and fruit";

async function addCostcoFavorites(db: SupabaseClient, household_id: string) {
  const { data: settings } = await db.from("household_settings").select("planner_defaults").eq("household_id", household_id).maybeSingle();
  const defaults = (settings?.planner_defaults ?? {}) as Record<string, unknown>;
  if (!settings || defaults._costcoReceiptsV1) return;
  const [{ data: stores }, { data: cats }, { data: known }, { data: syn }] = await Promise.all([
    db.from("stores").select("*").eq("household_id", household_id),
    db.from("categories").select("id, name").eq("household_id", household_id),
    db.from("ingredients").select("id, name_norm, category_id, learned_store_id, pack_size").eq("household_id", household_id),
    db.from("synonyms").select("alias, canonical").eq("household_id", household_id),
  ]);
  const costco = ((stores ?? []) as { id: string; name: string; notes?: string | null }[]).find((x) => x.name.toLowerCase().replace(/[^a-z]/g, "") === "costco");
  if (!costco) return;
  const synonyms = Object.fromEntries(((syn ?? []) as { alias: string; canonical: string }[]).map((x) => [x.alias, x.canonical]));
  const byName = new Map(((known ?? []) as { id: string; name_norm: string; category_id: string | null; learned_store_id: string | null; pack_size: string | null }[]).map((k) => [k.name_norm, k]));
  const catId = (n: string) => ((cats ?? []) as { id: string; name: string }[]).find((c) => c.name === n)?.id ?? null;

  for (const [cat, items] of Object.entries(COSTCO)) {
    for (const [raw, pack] of items) {
      const name_norm = normalizeName(raw, synonyms);
      const k = byName.get(name_norm);
      if (!k) {
        await db.from("ingredients").insert({ household_id, name_norm, category_id: catId(cat), learned_store_id: costco.id, pack_size: pack ?? null });
        continue;
      }
      // Never undo a choice we made by hand: only fill in what's empty.
      const patch: Record<string, unknown> = {};
      if (!k.learned_store_id) patch.learned_store_id = costco.id;
      if (!k.category_id && catId(cat)) patch.category_id = catId(cat);
      if (pack && !k.pack_size && (!k.learned_store_id || k.learned_store_id === costco.id)) patch.pack_size = pack;
      // The starting guess was 5 dozen; the receipts show the 2-dozen organic pack.
      if (name_norm === "egg" && k.pack_size === "5 dozen") patch.pack_size = "2 dozen";
      if (Object.keys(patch).length) await db.from("ingredients").update(patch).eq("id", k.id);
    }
  }
  // Store notes feed Discover and AI ideas; only if we haven't written our own.
  if ("notes" in costco && !costco.notes?.trim()) await db.from("stores").update({ notes: COSTCO_NOTES }).eq("id", costco.id);
  await db.from("household_settings").update({ planner_defaults: { ...defaults, _costcoReceiptsV1: true } }).eq("household_id", household_id);
}

/** What Ben told us (Nov 2026): our equipment, 4 dinners a week with leftovers, 2 family dinners. */
async function setUpKitchen(db: SupabaseClient, household_id: string) {
  const { data: settings } = await db.from("household_settings").select("planner_defaults").eq("household_id", household_id).maybeSingle();
  const d = (settings?.planner_defaults ?? {}) as Record<string, unknown>;
  if (!settings || d._kitchenV1) return;
  const next = {
    ...d,
    kitchen: Array.isArray(d.kitchen) && d.kitchen.length ? d.kitchen : OUR_KITCHEN,
    mealCount: 4,
    makeExtra: true,
    familyNights: typeof d.familyNights === "number" ? d.familyNights : 2,
    _kitchenV1: true,
  };
  await db.from("household_settings").update({ planner_defaults: next }).eq("household_id", household_id);
}

/**
 * A kids' menu dinner we make all the time: ramen noodles in homemade stock
 * (from Costco rotisserie chickens) with bits of the chicken. The stock is a
 * pantry staple, so only the noodles and chicken go on the list.
 */
async function addChickenRamen(db: SupabaseClient, household_id: string) {
  const { data: settings } = await db.from("household_settings").select("planner_defaults").eq("household_id", household_id).maybeSingle();
  const d = (settings?.planner_defaults ?? {}) as Record<string, unknown>;
  if (!settings || d._ramenV1) return;
  const title = "Chicken Ramen with Homemade Stock";
  const { data: existing } = await db.from("recipes").select("id").eq("household_id", household_id).eq("title_norm", title.toLowerCase()).maybeSingle();
  if (!existing) {
    const { data: syn } = await db.from("synonyms").select("alias, canonical").eq("household_id", household_id);
    const synonyms = Object.fromEntries(((syn ?? []) as { alias: string; canonical: string }[]).map((x) => [x.alias, x.canonical]));
    const { data: r } = await db
      .from("recipes")
      .insert({
        household_id, title, title_norm: title.toLowerCase(), servings: 2, prep_min: 10, cook_min: 5,
        steps: [
          { text: "Bring the stock to a simmer." },
          { text: "Add the noodles (skip the flavor packet) and cook about 3 minutes, until tender." },
          { text: "Stir in the chicken and warm through. Let it cool a little before serving." },
        ],
        notes: "Made with stock from our Costco rotisserie chickens.",
        tags: ["kids"], meal_types: ["dinner"], main_protein: "chicken", kid_friendly: true, is_kid_meal: true, origin: "manual",
      })
      .select("id")
      .single();
    if (r) {
      const lines = ["2 cups homemade chicken stock", "1 package ramen noodles", "1 cup shredded rotisserie chicken"];
      await db.from("recipe_ingredients").insert(
        lines.map((raw, position) => {
          const p = parseIngredientLine(raw, synonyms);
          return { recipe_id: r.id, household_id, position, raw_text: raw, qty: p.qty, qty_max: p.qtyMax, unit: p.unit, name: p.name, name_norm: p.nameNorm, note: p.note, parsed_ok: p.ok };
        }),
      );
    }
  }
  await db.from("household_settings").update({ planner_defaults: { ...d, _ramenV1: true } }).eq("household_id", household_id);
}

/** Put every store's aisles in walking order: produce first (Costco: center aisles first), cold things last. */
async function setWalkOrder(db: SupabaseClient, household_id: string) {
  const { data: settings } = await db.from("household_settings").select("planner_defaults").eq("household_id", household_id).maybeSingle();
  const d = (settings?.planner_defaults ?? {}) as Record<string, unknown>;
  if (!settings || d._walkOrderV1) return;
  const [{ data: stores }, { data: secs }] = await Promise.all([
    db.from("stores").select("id, name").eq("household_id", household_id),
    db.from("store_sections").select("id, store_id, name, sort_order").eq("household_id", household_id).order("sort_order"),
  ]);
  for (const st of (stores ?? []) as { id: string; name: string }[]) {
    const mine = ((secs ?? []) as { id: string; store_id: string; name: string; sort_order: number }[]).filter((x) => x.store_id === st.id);
    const sorted = sortSections(mine, st.name);
    for (const [i, sec] of sorted.entries()) if (sec.sort_order !== i) await db.from("store_sections").update({ sort_order: i }).eq("id", sec.id);
  }
  await db.from("household_settings").update({ planner_defaults: { ...d, _walkOrderV1: true } }).eq("household_id", household_id);
}

/**
 * Everything from our Shaw's receipts: new items get an aisle, and how often
 * we buy each one ranks suggestions while typing. No store is set, so they
 * still follow the store rules (Market Basket first).
 */
async function addShawsHistory(db: SupabaseClient, household_id: string) {
  const { data: settings } = await db.from("household_settings").select("planner_defaults").eq("household_id", household_id).maybeSingle();
  const d = (settings?.planner_defaults ?? {}) as Record<string, unknown>;
  if (!settings || d._shawsHistoryV1) return;
  const [{ data: cats }, { data: known }, { data: syn }] = await Promise.all([
    db.from("categories").select("id, name").eq("household_id", household_id),
    db.from("ingredients").select("id, name_norm, category_id").eq("household_id", household_id),
    db.from("synonyms").select("alias, canonical").eq("household_id", household_id),
  ]);
  const synonyms = Object.fromEntries(((syn ?? []) as { alias: string; canonical: string }[]).map((x) => [x.alias, x.canonical]));
  const byName = new Map(((known ?? []) as { id: string; name_norm: string; category_id: string | null }[]).map((k) => [k.name_norm, k]));
  const catId = (n: string) => ((cats ?? []) as { id: string; name: string }[]).find((c) => c.name === n)?.id ?? null;
  const counts: Record<string, number> = { ...((d.purchaseCounts as Record<string, number>) ?? {}) };
  const fresh: Record<string, unknown>[] = [];
  for (const [raw, cat, n] of SHAWS_HISTORY) {
    const name_norm = normalizeName(raw, synonyms);
    if (!name_norm) continue;
    counts[name_norm] = Math.max(counts[name_norm] ?? 0, n);
    const k = byName.get(name_norm);
    if (!k) {
      if (!fresh.some((f) => f.name_norm === name_norm)) fresh.push({ household_id, name_norm, category_id: catId(cat) });
    } else if (!k.category_id && catId(cat)) {
      await db.from("ingredients").update({ category_id: catId(cat) }).eq("id", k.id);
    }
  }
  for (let i = 0; i < fresh.length; i += 100) await db.from("ingredients").insert(fresh.slice(i, i + 100));
  await db.from("household_settings").update({ planner_defaults: { ...d, purchaseCounts: counts, _shawsHistoryV1: true } }).eq("household_id", household_id);
}

/**
 * How often we buy each thing at Costco (from receipts), for "Usually at
 * Costco" on the list. Items new to us are added and sent to Costco; items
 * we already route somewhere keep their store.
 */
async function addCostcoCounts(db: SupabaseClient, household_id: string) {
  const { data: settings } = await db.from("household_settings").select("planner_defaults").eq("household_id", household_id).maybeSingle();
  const d = (settings?.planner_defaults ?? {}) as Record<string, unknown>;
  if (!settings || d._costcoCountsV1) return;
  const [{ data: stores }, { data: cats }, { data: known }, { data: syn }] = await Promise.all([
    db.from("stores").select("id, name").eq("household_id", household_id),
    db.from("categories").select("id, name").eq("household_id", household_id),
    db.from("ingredients").select("id, name_norm, category_id, learned_store_id").eq("household_id", household_id),
    db.from("synonyms").select("alias, canonical").eq("household_id", household_id),
  ]);
  const costco = ((stores ?? []) as { id: string; name: string }[]).find((x) => x.name.toLowerCase().replace(/[^a-z]/g, "") === "costco");
  if (!costco) return;
  const synonyms = Object.fromEntries(((syn ?? []) as { alias: string; canonical: string }[]).map((x) => [x.alias, x.canonical]));
  const byName = new Map(((known ?? []) as { id: string; name_norm: string; category_id: string | null; learned_store_id: string | null }[]).map((k) => [k.name_norm, k]));
  const catId = (n: string) => ((cats ?? []) as { id: string; name: string }[]).find((c) => c.name === n)?.id ?? null;
  const storeCounts = { ...((d.storeCounts as Record<string, Record<string, number>>) ?? {}) };
  const counts: Record<string, number> = { ...(storeCounts[costco.id] ?? {}) };
  const itemLabels: Record<string, string> = { ...((d.itemLabels as Record<string, string>) ?? {}) };
  for (const [raw, cat, n] of COSTCO_HISTORY) {
    const name_norm = normalizeName(raw, synonyms);
    if (!name_norm) continue;
    counts[name_norm] = Math.max(counts[name_norm] ?? 0, n);
    itemLabels[name_norm] ??= raw.charAt(0).toUpperCase() + raw.slice(1);
    const k = byName.get(name_norm);
    if (!k) {
      await db.from("ingredients").insert({ household_id, name_norm, category_id: catId(cat), learned_store_id: costco.id });
      byName.set(name_norm, { id: "", name_norm, category_id: catId(cat), learned_store_id: costco.id });
    } else if (!k.learned_store_id && k.id) {
      await db.from("ingredients").update({ learned_store_id: costco.id, ...(k.category_id ? {} : { category_id: catId(cat) }) }).eq("id", k.id);
    }
  }
  storeCounts[costco.id] = counts;
  await db.from("household_settings").update({ planner_defaults: { ...d, storeCounts, itemLabels, _costcoCountsV1: true } }).eq("household_id", household_id);
}

/** Our own words for things: Saul's "white chicken" is rotisserie chicken. */
async function addFamilyWords(db: SupabaseClient, household_id: string) {
  const { data: settings } = await db.from("household_settings").select("planner_defaults").eq("household_id", household_id).maybeSingle();
  const d = (settings?.planner_defaults ?? {}) as Record<string, unknown>;
  if (!settings || d._familyWordsV1) return;
  await db.from("synonyms").upsert([{ household_id, alias: "white chicken", canonical: "rotisserie chicken" }], { onConflict: "household_id,alias" });
  await db.from("household_settings").update({ planner_defaults: { ...d, _familyWordsV1: true } }).eq("household_id", household_id);
}
