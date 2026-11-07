// Recipes from TikTok and Instagram videos: read the caption, then find the
// full written recipe online (often on the creator's own site).

export type SocialSite = "tiktok" | "instagram";

export function socialSite(url: string): SocialSite | null {
  try {
    const h = new URL(url).hostname.replace(/^www\.|^m\.|^vm\.|^vt\./, "");
    if (h === "tiktok.com" || h.endsWith(".tiktok.com")) return "tiktok";
    if (h === "instagram.com" || h === "instagr.am") return "instagram";
  } catch {
    /* not a link */
  }
  return null;
}

export const tiktokOembed = (url: string) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

/** Caption and account from an Instagram page's preview tags, when it shows them. */
export function instagramCaption(html: string): { caption: string; creator: string | null } | null {
  const meta = (p: string) => html.match(new RegExp(`<meta[^>]+property="og:${p}"[^>]+content="([^"]*)"`, "i"))?.[1];
  const desc = meta("description");
  if (!desc) return null;
  const text = decode(desc);
  // "123 likes, 4 comments - handle on May 1, 2025: "caption""
  const m = text.match(/-\s*([\w.]+)\s+on\s+[^:]+:\s*["“]?([\s\S]*?)["”]?\s*$/);
  if (m) return { caption: m[2].trim(), creator: m[1] };
  return { caption: text.trim(), creator: null };
}

/** True when the caption itself holds the recipe (a list of ingredient lines). */
export function captionHasRecipe(caption: string): boolean {
  const lines = caption.split(/\n+/).map((l) => l.trim());
  const amounts = lines.filter((l) => /^([-•*▪️✔️]\s*)?(\d|½|¼|¾|⅓|⅔|one |two |a |an )/i.test(l) && l.length < 90);
  return amounts.length >= 3;
}

export function buildFindPrompt(p: { caption: string; creator: string | null; site: SocialSite | "screenshot" }): string {
  const from = p.site === "screenshot" ? "a social media video" : p.site === "tiktok" ? "a TikTok video" : "an Instagram video";
  return `A home cook saw this recipe in ${from} and wants the full written recipe.
${p.creator ? `Creator: ${p.creator}\n` : ""}Caption: """${p.caption.slice(0, 1500)}"""

Work out the dish, then search the web for written recipes of it.
Put the creator's own recipe first if they publish one (their website or blog, often linked from their profile).
Then up to 4 close matches from well-known recipe sites. Only pages with a full ingredient list and steps.
Never TikTok, Instagram, YouTube, Facebook or Pinterest pages.
Reply with a JSON array only: [{"title":"","url":"","site":"","why":"the creator's own recipe, or how it matches"}]`;
}

const CAPTION_PROMPT = `This is a screenshot from TikTok, Instagram or a similar app showing a recipe video or its caption.
Read what is on screen. Reply with JSON only:
{"dish":"the dish name","creator":"account name or null","caption":"the caption text, as written"}`;

export const captionPrompt = () => CAPTION_PROMPT;

export function parseCaptionAnswer(raw: string): { caption: string; creator: string | null } | null {
  try {
    const j = JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim()) as { dish?: string; creator?: string | null; caption?: string };
    const caption = [j.dish, j.caption].filter((x) => typeof x === "string" && x.trim()).join("\n");
    if (!caption) return null;
    return { caption, creator: typeof j.creator === "string" && j.creator && j.creator !== "null" ? j.creator.replace(/^@/, "") : null };
  } catch {
    return null;
  }
}
