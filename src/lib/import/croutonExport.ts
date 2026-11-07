// Write a recipe as a Crouton .crumb file (same structure Crouton exports),
// so a recipe saved here can be opened in Crouton from the share sheet.

import type { RecipeDraft } from "../types";

const TO_CROUTON: Record<string, string> = {
  tsp: "TEASPOON", tbsp: "TABLESPOON", cup: "CUP", lb: "POUND", oz: "OUNCE", g: "GRAMS", kg: "KGS",
  ml: "MILLS", can: "CAN", bunch: "BUNCH", package: "PACKET", each: "ITEM",
};

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().toUpperCase();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  }).toUpperCase();
}

export function toCrumb(d: RecipeDraft, opts: { id?: string; imageBase64?: string | null } = {}) {
  return {
    uuid: (d.origin === "crouton" && d.externalId) || opts.id?.toUpperCase() || uuid(),
    name: d.title,
    serves: d.servings,
    ...(d.prepMin != null ? { duration: d.prepMin } : {}),
    ...(d.cookMin != null ? { cookingDuration: d.cookMin } : {}),
    ...(d.notes ? { notes: d.notes } : {}),
    ...(d.sourceUrl ? { webLink: d.sourceUrl } : {}),
    ...(d.sourceName ? { sourceName: d.sourceName } : {}),
    tags: d.tags.map((name) => ({ name, color: "#E2553A", uuid: uuid() })),
    folderIDs: [],
    images: opts.imageBase64 ? [opts.imageBase64] : [],
    isPublicRecipe: false,
    defaultScale: 1,
    ingredients: d.ingredients.map((i, order) => {
      const type = i.unit ? TO_CROUTON[i.unit] : undefined;
      // Units Crouton has no type for (clove, pinch, slice…) go in front of the name.
      const unitWord = i.unit && !type ? `${i.unit} ` : "";
      const name = `${unitWord}${i.name}${i.note ? `, ${i.note}` : ""}`;
      return {
        order,
        uuid: uuid(),
        ingredient: { name, uuid: uuid() },
        ...(i.qty != null
          ? { quantity: { amount: i.qty, ...(i.qtyMax ? { secondaryAmount: i.qtyMax } : {}), quantityType: type ?? "ITEM" } }
          : {}),
      };
    }),
    steps: d.steps.map((s, order) => ({ order, uuid: uuid(), step: s.text, isSection: !!s.isSection })),
  };
}

export function crumbFileName(title: string): string {
  return `${title.replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 80) || "Recipe"}.crumb`;
}
