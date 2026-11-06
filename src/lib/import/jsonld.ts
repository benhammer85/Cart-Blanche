// Extract a schema.org Recipe from a web page's JSON-LD.
import { z } from "zod";
import { parseIngredientLine } from "../ingredientParser";
import type { RecipeDraft, Step } from "../types";
import { inferMainProtein, inferMealTypes } from "../infer";

const looseRecipe = z
  .object({
    name: z.string(),
    recipeIngredient: z.array(z.string()).min(1),
  })
  .passthrough();

export function findJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, "");
    try {
      out.push(JSON.parse(text));
    } catch {
      // Some sites put raw newlines in strings; try once more after squashing.
      try {
        out.push(JSON.parse(text.replace(/[\n\r\t]+/g, " ")));
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}

function isRecipeType(t: unknown): boolean {
  if (typeof t === "string") return t.toLowerCase() === "recipe" || t.endsWith("/Recipe");
  if (Array.isArray(t)) return t.some(isRecipeType);
  return false;
}

export function findRecipeNode(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipeNode(n);
      if (r) return r;
    }
    return null;
  }
  const o = node as Record<string, unknown>;
  if (isRecipeType(o["@type"])) return o;
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item"]) {
    if (o[key]) {
      const r = findRecipeNode(o[key]);
      if (r) return r;
    }
  }
  return null;
}

/** ISO-8601 duration ("PT1H15M") → minutes. */
export function isoMinutes(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+)S)?)?$/i);
  if (!m) return null;
  const mins = (+(m[1] ?? 0)) * 1440 + (+(m[2] ?? 0)) * 60 + +(m[3] ?? 0);
  return mins > 0 ? Math.round(mins) : null;
}

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ")
    .trim();
}

export function extractSteps(v: unknown): Step[] {
  if (!v) return [];
  if (typeof v === "string") {
    return decode(v)
      .split(/(?:\r?\n|(?<=\.)\s+(?=\d+\.\s))/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text) => ({ text }));
  }
  if (Array.isArray(v)) return v.flatMap(extractSteps);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (isTypeOf(o, "HowToSection")) {
      const head: Step[] = typeof o.name === "string" ? [{ text: decode(o.name), isSection: true }] : [];
      return [...head, ...extractSteps(o.itemListElement)];
    }
    const text = typeof o.text === "string" ? o.text : typeof o.name === "string" ? o.name : null;
    return text ? [{ text: decode(text) }] : [];
  }
  return [];
}

function isTypeOf(o: Record<string, unknown>, t: string) {
  const ty = o["@type"];
  return ty === t || (Array.isArray(ty) && ty.includes(t));
}

function firstString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = firstString(x);
      if (s) return s;
    }
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return firstString(o.url ?? o.contentUrl ?? null);
  }
  return null;
}

function toTags(...vals: unknown[]): string[] {
  const out = new Set<string>();
  for (const v of vals) {
    const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
    for (const t of list) if (typeof t === "string" && t.trim() && t.length < 30) out.add(t.trim().toLowerCase());
  }
  return [...out].slice(0, 8);
}

export function recipeFromJsonLd(node: Record<string, unknown>, url: string, synonyms: Record<string, string> = {}): RecipeDraft {
  const r = looseRecipe.parse(node);
  const ingredients = r.recipeIngredient.map((l) => parseIngredientLine(decode(l), synonyms)).filter((i) => i.name);
  const yieldStr = firstString(node.recipeYield);
  const servings = yieldStr ? parseInt(yieldStr.match(/\d+/)?.[0] ?? "", 10) || 4 : 4;
  const prep = isoMinutes(node.prepTime) ?? null;
  const total = isoMinutes(node.totalTime);
  const cook = isoMinutes(node.cookTime);
  const title = decode(r.name);
  const tags = toTags(node.recipeCategory, node.recipeCuisine, node.keywords);
  let host: string | null = null;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* ignore */
  }
  return {
    title,
    servings,
    prepMin: prep ?? (total && cook ? Math.max(total - cook, 0) || null : total),
    cookMin: cook,
    steps: extractSteps(node.recipeInstructions),
    notes: null,
    sourceUrl: url,
    sourceName: host,
    tags,
    mealTypes: inferMealTypes(title, tags),
    mainProtein: inferMainProtein(title, ingredients.map((i) => i.nameNorm)),
    kidFriendly: false,
    isKidMeal: false,
    origin: "url",
    externalId: null,
    ingredients,
    imageUrl: firstString(node.image),
  };
}

export function recipeFromHtml(html: string, url: string, synonyms: Record<string, string> = {}): RecipeDraft | null {
  for (const block of findJsonLdBlocks(html)) {
    const node = findRecipeNode(block);
    if (node) {
      try {
        return recipeFromJsonLd(node, url, synonyms);
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}
