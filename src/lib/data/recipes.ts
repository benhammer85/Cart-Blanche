"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeTitle } from "../normalize";
import type { Recipe, RecipeDraft } from "../types";

export const RECIPE_LIST_COLUMNS =
  "id, title, title_norm, servings, prep_min, cook_min, image_path, tags, meal_types, main_protein, kid_friendly, is_kid_meal, origin, external_id, source_url, times_made, last_made_at, archived, created_at";

export interface ExistingKeys {
  externalIds: Set<string>;
  sourceUrls: Set<string>;
  titles: Set<string>;
}

export async function loadExistingKeys(db: SupabaseClient): Promise<ExistingKeys> {
  const { data } = await db.from("recipes").select("external_id, source_url, title_norm");
  const rows = (data ?? []) as { external_id: string | null; source_url: string | null; title_norm: string }[];
  return {
    externalIds: new Set(rows.map((r) => r.external_id).filter(Boolean) as string[]),
    sourceUrls: new Set(rows.map((r) => r.source_url && normalizeUrl(r.source_url)).filter(Boolean) as string[]),
    titles: new Set(rows.map((r) => r.title_norm)),
  };
}

import { normalizeUrl } from "./recipes.shared";
export { normalizeUrl };

/** Re-imports must not duplicate: match on Crouton id, source URL, or normalized title. */
export function isDuplicate(d: RecipeDraft, keys: ExistingKeys): string | null {
  if (d.externalId && keys.externalIds.has(d.externalId)) return "already imported";
  if (d.sourceUrl && keys.sourceUrls.has(normalizeUrl(d.sourceUrl))) return "same link already saved";
  if (keys.titles.has(normalizeTitle(d.title))) return "same title already saved";
  return null;
}

/** Downscale an image to ≤ maxPx on the long side and re-encode as JPEG. */
export async function resizeImage(src: Blob, maxPx = 1000, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(src);
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", quality));
}

export function base64ToBlob(b64: string, type = "image/jpeg"): Blob {
  const bin = atob(b64.replace(/^data:[^,]+,/, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * Upload a recipe photo (resized) and return its public URL.
 * Always a new file name, so no "overwrite" permission is needed.
 */
export async function uploadRecipeImage(db: SupabaseClient, householdId: string, recipeId: string, image: Blob): Promise<{ url: string | null; error: string | null }> {
  try {
    const small = await resizeImage(image);
    const path = `${householdId}/${recipeId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
    const { error } = await db.storage.from("recipe-images").upload(path, small, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
    if (error) return { url: null, error: error.message };
    return { url: db.storage.from("recipe-images").getPublicUrl(path).data.publicUrl, error: null };
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : "Couldn’t read the photo" };
  }
}

/** Insert or update a recipe and replace its ingredients. Returns the id. */
export async function saveRecipe(
  db: SupabaseClient,
  householdId: string,
  d: RecipeDraft,
  opts: { id?: string; image?: Blob | null; userId?: string; onPhotoError?: (message: string) => void } = {},
): Promise<string> {
  const row = {
    household_id: householdId,
    title: d.title.trim(),
    title_norm: normalizeTitle(d.title),
    servings: d.servings || 4,
    prep_min: d.prepMin,
    cook_min: d.cookMin,
    steps: d.steps,
    notes: d.notes,
    source_url: d.sourceUrl,
    source_name: d.sourceName,
    tags: d.tags,
    meal_types: d.mealTypes.length ? d.mealTypes : ["dinner"],
    main_protein: d.mainProtein,
    kid_friendly: d.kidFriendly,
    is_kid_meal: d.isKidMeal,
    origin: d.origin,
    external_id: d.externalId,
    updated_at: new Date().toISOString(),
    ...(d.imageUrl !== undefined ? { image_path: d.imageUrl } : {}),
  };
  let id = opts.id;
  if (id) {
    const { error } = await db.from("recipes").update(row).eq("id", id);
    if (error) throw error;
    await db.from("recipe_ingredients").delete().eq("recipe_id", id);
  } else {
    const { data, error } = await db.from("recipes").insert({ ...row, created_by: opts.userId ?? null }).select("id").single();
    if (error) throw error;
    id = data.id as string;
  }
  if (d.ingredients.length) {
    const { error } = await db.from("recipe_ingredients").insert(
      d.ingredients.map((i, position) => ({
        household_id: householdId,
        recipe_id: id,
        position,
        raw_text: i.raw,
        qty: i.qty,
        qty_max: i.qtyMax,
        unit: i.unit,
        name: i.name,
        name_norm: i.nameNorm,
        note: i.note,
        parsed_ok: i.ok,
      })),
    );
    if (error) throw error;
  }
  if (opts.image) {
    const { url, error } = await uploadRecipeImage(db, householdId, id!, opts.image);
    if (url) await db.from("recipes").update({ image_path: url }).eq("id", id);
    else if (error) opts.onPhotoError?.(error);
  }
  return id!;
}

/** Recipe row → editable draft. */
export function recipeToDraft(r: Recipe): RecipeDraft {
  return {
    title: r.title,
    servings: Number(r.servings),
    prepMin: r.prep_min,
    cookMin: r.cook_min,
    steps: r.steps ?? [],
    notes: r.notes,
    sourceUrl: r.source_url,
    sourceName: r.source_name,
    tags: r.tags ?? [],
    mealTypes: r.meal_types ?? ["dinner"],
    mainProtein: r.main_protein,
    kidFriendly: r.kid_friendly,
    isKidMeal: r.is_kid_meal,
    origin: r.origin,
    externalId: r.external_id,
    imageUrl: r.image_path,
    ingredients: (r.recipe_ingredients ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        raw: i.raw_text,
        qty: i.qty == null ? null : Number(i.qty),
        qtyMax: i.qty_max == null ? null : Number(i.qty_max),
        unit: i.unit,
        name: i.name,
        nameNorm: i.name_norm,
        note: i.note,
        ok: i.parsed_ok,
      })),
  };
}
