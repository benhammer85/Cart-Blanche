// Crouton (.crumb) importer.
//
// Structure verified against real exports (Nov 2026):
//   { uuid, name, serves?, duration? (prep min), cookingDuration? (min), notes?,
//     webLink?, sourceName?, rating?, tags: [{name,color,uuid}], folderIDs: [],
//     images: [base64 JPEG…], sourceImage?: base64,
//     ingredients: [{ order, uuid, ingredient: {name, uuid},
//                     quantity?: { amount?, secondaryAmount?, quantityType } }],
//     steps: [{ order, uuid, step, isSection }] }
//
// Quirks handled:
//   • quantity with only secondaryAmount → that is the amount (½ banana)
//   • amount + secondaryAmount → a range (2–3 potatoes)
//   • quantityType ITEM with the unit inside the name ("teaspoons fine sea salt")
//   • blank ingredient rows, leading "- " bullets, OCR garbage ("% teaspoon")

import { z } from "zod";
import { parseIngredientLine, peelAmountWords, looksOk, isJunkLine, type ParsedIngredient } from "../ingredientParser";
import { normalizeName, splitNameAndNote } from "../normalize";
import { canonicalUnit, formatAmount } from "../units";
import type { RecipeDraft } from "../types";
import { inferMainProtein, inferMealTypes } from "../infer";

const quantitySchema = z
  .object({
    amount: z.number().optional(),
    secondaryAmount: z.number().optional(),
    quantityType: z.string().optional(),
  })
  .passthrough();

export const crumbSchema = z
  .object({
    uuid: z.string(),
    name: z.string(),
    serves: z.number().optional(),
    duration: z.number().optional(),
    cookingDuration: z.number().optional(),
    notes: z.string().optional(),
    webLink: z.string().optional(),
    sourceName: z.string().optional(),
    tags: z.array(z.object({ name: z.string() }).passthrough()).optional().default([]),
    images: z.array(z.string()).optional().default([]),
    ingredients: z
      .array(
        z
          .object({
            order: z.number().optional(),
            ingredient: z.object({ name: z.string().optional().default("") }).passthrough(),
            quantity: quantitySchema.optional().nullable(),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
    steps: z
      .array(
        z
          .object({
            order: z.number().optional(),
            step: z.string().optional().default(""),
            isSection: z.boolean().optional().default(false),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
  })
  .passthrough();

export type Crumb = z.infer<typeof crumbSchema>;

const QUANTITY_TYPES: Record<string, string> = {
  ITEM: "each", TEASPOON: "tsp", TABLESPOON: "tbsp", CUP: "cup", POUND: "lb", OUNCE: "oz",
  GRAM: "g", GRAMS: "g", KILOGRAM: "kg", KGS: "kg", KG: "kg", MILLILITER: "ml", MILLILITRE: "ml", MILLS: "ml", ML: "ml",
  LITER: "l", LITRE: "l", LITERS: "l",
  CAN: "can", BUNCH: "bunch", PACKAGE: "package", PACKET: "package", PINCH: "pinch",
  DASH: "dash", CLOVE: "clove", SLICE: "slice", JAR: "jar", BOTTLE: "bottle", BAG: "bag",
  BOX: "box", HEAD: "head", STICK: "stick", FLUID_OUNCE: "fl oz", PINT: "pint", QUART: "quart",
  GALLON: "gallon", HANDFUL: "handful", PIECE: "piece", SPRIG: "sprig", STALK: "stalk",
};

export function crumbIngredient(
  ing: Crumb["ingredients"][number],
  synonyms: Record<string, string> = {},
): ParsedIngredient | null {
  const rawName = (ing.ingredient?.name ?? "").trim();
  if (!rawName || isJunkLine(rawName)) return null; // blank spacer rows, "For Serving:", equipment

  const q = ing.quantity;
  if (!q || (q.amount == null && q.secondaryAmount == null)) {
    // No structured amount: run the free-text parser ("- pinch of salt").
    return parseIngredientLine(rawName, synonyms);
  }

  let qty = q.amount ?? q.secondaryAmount ?? null;
  let qtyMax = q.amount != null && q.secondaryAmount != null && q.secondaryAmount > q.amount ? q.secondaryAmount : null;
  let unit = QUANTITY_TYPES[(q.quantityType ?? "ITEM").toUpperCase()] ?? canonicalUnit(q.quantityType ?? "") ?? "each";
  let text = rawName.replace(/^[-•*\s]+/, "");

  // Amount words left in the name: "teaspoons fine sea salt" (ITEM), "to 2 ripe
  // avocados", "large or 2 small bunches kale", "packed cup dill", "block block tofu"
  const peeled = peelAmountWords(text, unit === "each" ? null : unit);
  text = peeled.rest || text;
  if (unit === "each" && peeled.unit) unit = peeled.unit;
  if (peeled.qtyMax != null && qty != null && peeled.qtyMax > qty) qtyMax = peeled.qtyMax;
  if (qty != null && qty <= 0) qty = null;
  if (qtyMax != null && qty == null) qtyMax = null;

  const { name, note } = splitNameAndNote(text);
  const ok = looksOk(rawName, name);
  // Show a clean line ("1–2 ripe avocados, halved") unless it needs fixing by hand.
  const raw = `${formatAmount(qty, unit, qtyMax)} ${ok ? text : rawName}`.trim();
  return {
    raw,
    qty,
    qtyMax,
    unit,
    name: name || text,
    nameNorm: normalizeName(name || text, synonyms),
    note,
    ok,
  };
}

export interface CroutonParseResult {
  recipe: RecipeDraft;
  /** base64 JPEG (no data: prefix) of the best image, to be resized client-side */
  imageBase64: string | null;
  /** smallest image (Crouton keeps a thumbnail) for previews */
  thumbBase64: string | null;
  warnings: string[];
}

export function parseCrumb(json: unknown, synonyms: Record<string, string> = {}): CroutonParseResult {
  const c = crumbSchema.parse(json);
  const warnings: string[] = [];

  const ingredients = [...c.ingredients]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((i) => crumbIngredient(i, synonyms))
    .filter((x): x is ParsedIngredient => x !== null);

  for (const i of ingredients) if (!i.ok) warnings.push(`Check ingredient: “${i.raw}”`);
  if (!ingredients.length) warnings.push("No ingredients");

  const steps = [...c.steps]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((s) => s.step.trim())
    .map((s) => ({ text: s.step.trim(), isSection: s.isSection }));
  if (!steps.length) warnings.push("No steps");

  const title = c.name.replace(/\s{2,}.*$/, "").trim() || c.name.trim(); // "Title  The Splendid Table" → "Title"
  const tags = c.tags.map((t) => t.name.trim()).filter(Boolean);
  // Prefer the largest image (Crouton stores a thumbnail and the full photo).
  const images = [...c.images].sort((a, b) => b.length - a.length);
  const ingredientNames = ingredients.map((i) => i.nameNorm);

  return {
    recipe: {
      title,
      servings: c.serves && c.serves > 0 ? c.serves : 4,
      prepMin: c.duration ?? null,
      cookMin: c.cookingDuration ?? null,
      steps,
      notes: c.notes?.trim() || null,
      sourceUrl: c.webLink?.trim() || null,
      sourceName: c.sourceName?.trim() || null,
      tags,
      mealTypes: inferMealTypes(title, tags),
      mainProtein: inferMainProtein(title, ingredientNames),
      // A tag like "Asa and Saul Favorites" or "Kid Favorites" means the kids eat it.
      kidFriendly: tags.some((t) => /\b(kids?|children|asa|saul)\b/i.test(t)),
      isKidMeal: false,
      origin: "crouton",
      externalId: c.uuid,
      ingredients,
    },
    imageBase64: images[0] ?? null,
    thumbBase64: images[images.length - 1] ?? null,
    warnings,
  };
}
