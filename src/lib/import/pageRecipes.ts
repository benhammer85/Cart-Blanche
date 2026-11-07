// Pages with more than one recipe.
//
// Three shapes we see:
//   • several schema.org Recipe blocks (rare, but easy);
//   • a "week of dinners" post with the recipes written out on the page, with
//     no recipe data (e.g. Gimme Some Oven's Trader Joe's week) → Gemini reads them;
//   • a roundup that links out to each recipe ("25 Trader Joe's dinners")
//     → we list the links and import the ones you pick, one by one.

import { parseIngredientLine } from "../ingredientParser";
import { inferMainProtein, inferMealTypes } from "../infer";
import type { RecipeDraft } from "../types";
import { findJsonLdBlocks, recipeFromJsonLd } from "./jsonld";

const decode = (s: string) =>
  s
    .replace(/&#0?39;|&#x27;|&rsquo;|&lsquo;|&#8217;|&#8216;/g, "’")
    .replace(/&quot;|&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

/** Every schema.org Recipe on the page (some pages have several). */
export function allJsonLdRecipes(html: string, url: string, synonyms: Record<string, string> = {}): RecipeDraft[] {
  const out: RecipeDraft[] = [];
  const visit = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(visit);
    const o = n as Record<string, unknown>;
    const t = o["@type"];
    const isRecipe = typeof t === "string" ? /recipe$/i.test(t) : Array.isArray(t) && t.some((x) => typeof x === "string" && /recipe$/i.test(x));
    if (isRecipe) {
      try {
        out.push(recipeFromJsonLd(o, url, synonyms));
      } catch {
        /* skip a broken one */
      }
      return;
    }
    for (const k of ["@graph", "mainEntity", "itemListElement", "item"]) if (o[k]) visit(o[k]);
  };
  findJsonLdBlocks(html).forEach(visit);
  return out;
}

/** The article body as plain text with headings marked, minus navigation, sidebars and comments. */
export function mainText(html: string): string {
  let s = html;
  const start = s.search(/<(article|main)\b|class="[^"]*(entry-content|post-content|article-body)/i);
  if (start > 0) s = s.slice(start);
  const end = s.search(/id="(comments|respond)"|class="[^"]*(comments-area|comment-list)/i);
  if (end > 0) s = s.slice(0, end);
  s = s.replace(/<(script|style|noscript|svg|nav|aside|footer|form|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<h([1-4])[^>]*>/gi, "\n\n## ").replace(/<\/h[1-4]>/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "\n- ").replace(/<(p|br|div|tr)\b[^>]*>/gi, "\n");
  s = decode(s.replace(/<[^>]+>/g, " "));
  return s.replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*(\n\s*)+/g, "\n\n").trim();
}

/** How many recipes are written out on the page (an "Ingredients" heading for each). */
export function inlineRecipeCount(text: string): number {
  return (text.match(/^## *ingredients\b/gim) ?? []).length;
}

export interface PageLink {
  title: string;
  url: string;
}

const NOT_RECIPES = /google\.com\/|share\.|bookmarklet|sharer|cookbook|\/(category|categories|tag|tags|author|courses|cuisine|cooking-method|occasions|proteins|dietary|popular|about|contact|privacy|shop|newsletter|page)\b|\/(recipes|recipe-index)\/?$|mailchi\.mp|pinterest|instagram|facebook|twitter|x\.com|tiktok|youtube|amazon\.|#/i;

const slugTitle = (u: URL) =>
  decodeURIComponent(u.pathname.replace(/\/$/, "").split("/").pop() ?? "")
    .replace(/\.(html?|php|aspx?)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\brecipe\b/gi, "")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Links that look like recipes in a roundup. Headings that are links win; if a
 * page has few of those, every link in the article body counts. "More recipes"
 * and "You may also like" blocks at the end are skipped. You pick from the list,
 * and anything that turns out not to be a recipe is reported when importing.
 */
export function roundupLinks(html: string, pageUrl: string): PageLink[] {
  let s = html;
  const h1 = s.search(/<h1\b/i);
  if (h1 > 0) s = s.slice(h1);
  // A category page lists many posts (each with its own footer); a single post ends at its footer.
  const isArchive = (s.match(/<article\b/gi) ?? []).length > 2;
  const stop = isArchive
    ? s.search(/id="(comments|respond)"|class="[^"]*\b(site-footer|pagination)\b/i)
    : s.search(/id="(comments|respond)"|class="[^"]*\b(entry-related|post-navigation|related-posts|jp-relatedposts|yarpp|entry-footer|comments-area)\b|>\s*(you may also like|similar posts|more (easy )?[a-z ]*recipes|related (posts|recipes)|reader favorites)\s*</i);
  if (stop > 0) s = s.slice(0, stop);
  s = s.replace(/<(script|style|noscript|nav|aside|footer|form)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const page = new URL(pageUrl);
  const self = page.origin + page.pathname.replace(/\/$/, "");

  const collect = (re: RegExp, pick: (m: RegExpExecArray) => { href: string; text: string } | null) => {
    const seen = new Set<string>();
    const out: PageLink[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const got = pick(m);
      if (!got) continue;
      let href: URL;
      try {
        href = new URL(decode(got.href), page);
      } catch {
        continue;
      }
      const key = href.origin + href.pathname.replace(/\/$/, "");
      if (!/^https?:$/.test(href.protocol) || key === self || NOT_RECIPES.test(href.href) || seen.has(key) || href.pathname.length < 4) continue;
      let title = decode(got.text.replace(/<[^>]+>/g, " ")).replace(/^\s*\d+[.)]\s*/, "").replace(/\s+/g, " ").trim();
      // Cards often wrap the title with a price, count or description: keep the title.
      title = title.split(/\s+(?:\$\d|\d+\s*$)/)[0].trim();
      if (title.length > 90) title = slugTitle(href);
      // Links inside a sentence ("the frozen food department", "here") read better as the page's own name.
      if (title.length < 4 || /^[a-z]/.test(title) || /^(here|click here|recipe|get the recipe|this recipe|link|read more|full recipe)$/i.test(title)) title = slugTitle(href);
      if (title.length < 4) continue;
      seen.add(key);
      out.push({ title, url: href.href });
    }
    return out;
  };

  const inHeadings = collect(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi, (m) => {
    const a = m[1].match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    return a ? { href: a[1], text: a[2] || m[1] } : null;
  });
  if (inHeadings.length >= 3) return inHeadings.slice(0, 60);
  return collect(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m) => ({ href: m[1], text: m[2] })).slice(0, 60);
}

/** The first photo after a heading that mentions this title (for recipes written out on a page). */
export function photoAfterHeading(html: string, title: string, pageUrl: string): string | null {
  const words = title.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3).slice(0, 3);
  if (!words.length) return null;
  const re = /<h[2-3][^>]*>([\s\S]*?)<\/h[2-3]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = m[1].replace(/<[^>]+>/g, " ").toLowerCase();
    if (!words.every((w) => text.includes(w))) continue;
    // Blogs usually put the photo just above the recipe's heading.
    const before = html.slice(0, m.index);
    const prevHeading = Math.max(before.lastIndexOf("<h2"), before.lastIndexOf("<H2"));
    const above = [...before.slice(prevHeading > 0 ? prevHeading : Math.max(0, m.index - 20000)).matchAll(/<img\b[^>]*?(?:data-lazy-src|data-src|src)=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/gi)].pop();
    if (above) {
      try {
        return new URL(decode(above[1]), pageUrl).href;
      } catch {
        /* fall through */
      }
    }
    const rest = html.slice(m.index + m[0].length);
    const next = rest.search(/<h2\b/i);
    const chunk = next > 0 ? rest.slice(0, next) : rest.slice(0, 20000);
    const img = chunk.match(/<img\b[^>]*?(?:data-lazy-src|data-src|src)=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i);
    if (img) {
      try {
        return new URL(decode(img[1]), pageUrl).href;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export interface AiPageRecipe {
  title: string;
  servings?: number | null;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  ingredients: string[];
  steps: string[];
  notes?: string | null;
}

export function buildPagePrompt(text: string, site: string, discussion = false): string {
  const intro = discussion
    ? `This is a discussion thread from ${site}. People share dinner ideas in the post and comments.
Return each complete recipe someone wrote out (with ingredients and at least rough steps). If a comment gives a clear store-bought combination (for example "frozen dumplings + chili crisp + bok choy, pan-fry"), you may return it as a short recipe with those ingredients. Name each one plainly. Skip jokes, questions and opinions.`
    : `This web page from ${site} has several recipes written out on it.
Return every complete recipe (one with its own ingredient list). Skip intros, shopping lists, FAQs, ads and links to other recipes.`;
  return `${intro}
Keep ingredient lines exactly as a shopper would read them, with amounts. Steps: one string per step, without numbering or the bold lead-in words.
"notes": the author's short tip for that recipe, if any, in one or two sentences.
Reply with JSON only:
{"recipes":[{"title":"","servings":4,"prepMinutes":null,"cookMinutes":null,"ingredients":[""],"steps":[""],"notes":""}]}

PAGE:
${text.slice(0, 45_000)}`;
}

export function draftFromAi(r: AiPageRecipe, pageUrl: string, site: string, image: string | null, synonyms: Record<string, string> = {}): RecipeDraft {
  const ingredients = r.ingredients.map((l) => parseIngredientLine(l, synonyms));
  return {
    title: r.title.replace(/^\s*\d+[.)]\s*/, "").trim(),
    servings: r.servings || 4,
    prepMin: r.prepMinutes ?? null,
    cookMin: r.cookMinutes ?? null,
    steps: r.steps.map((text) => ({ text })),
    notes: r.notes?.trim() || null,
    sourceUrl: pageUrl,
    sourceName: site,
    tags: [],
    mealTypes: inferMealTypes(r.title, []),
    mainProtein: inferMainProtein(r.title, ingredients.map((i) => i.nameNorm)),
    kidFriendly: false,
    isKidMeal: false,
    origin: "url",
    externalId: null,
    ingredients,
    imageUrl: image,
  };
}

/** "www.gimmesomeoven.com" → "Gimme Some Oven"-ish: the page's own site name when it has one. */
export function siteName(html: string, url: string): string {
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (og) return decode(og).trim();
  return new URL(url).hostname.replace(/^www\./, "");
}

/** A page's own photos, best first: the recipe's photos, then og:image / twitter:image. */
export function pageImages(html: string, pageUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (u: unknown) => {
    const s = typeof u === "string" ? u : u && typeof u === "object" ? ((u as { url?: string; contentUrl?: string }).url ?? (u as { contentUrl?: string }).contentUrl) : null;
    if (!s) return;
    try {
      const abs = new URL(decode(s), pageUrl).href;
      // The same photo in several sizes (-1200x800, ?w=600) counts once.
      const stem = abs.replace(/\?.*$/, "").replace(/-\d+x\d+(?=\.\w+$)/, "").replace(/-(scaled|large|medium|small)(?=\.\w+$)/, "");
      if (/^https?:/.test(abs) && !seen.has(stem) && !/\.(svg|gif)(\?|$)/i.test(abs) && !/logo|avatar|icon|sprite|placeholder/i.test(abs)) {
        seen.add(stem);
        out.push(abs);
      }
    } catch {
      /* skip */
    }
  };
  const visit = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(visit);
    const o = n as Record<string, unknown>;
    const t = o["@type"];
    if ((typeof t === "string" && /recipe$/i.test(t)) || (Array.isArray(t) && t.some((x) => typeof x === "string" && /recipe$/i.test(x)))) {
      const img = o.image;
      (Array.isArray(img) ? img : [img]).forEach(add);
    }
    for (const k of ["@graph", "mainEntity", "itemListElement", "item"]) if (o[k]) visit(o[k]);
  };
  findJsonLdBlocks(html).forEach(visit);
  for (const re of [/<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi, /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/gi, /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/gi]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) add(m[1]);
  }
  return out.slice(0, 4);
}
