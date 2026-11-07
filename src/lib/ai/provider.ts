// Tiny AI provider interface. Only Google Gemini (free tier) is implemented;
// switch providers later by adding another implementation and setting
// AI_PROVIDER / AI_MODEL / AI_API_KEY. Server-only.
import "server-only";

export interface AiImage {
  mimeType: string;
  /** base64 without the data: prefix */
  data: string;
}

export interface AiSearchResult {
  text: string;
  /** web pages Google Search grounded the answer on (may be redirect links) */
  sources: { uri: string; title: string }[];
}

export interface AiProvider {
  name: string;
  /** Answer using live Google Search results (grounding). */
  searchWeb(prompt: string): Promise<AiSearchResult>;
  /** Returns the raw JSON text the model produced. Throws AiError on failure. */
  generateJson(prompt: string, opts?: { temperature?: number; images?: AiImage[] }): Promise<string>;
}

export class AiError extends Error {
  constructor(
    message: string,
    public kind: "not_configured" | "rate_limited" | "failed",
  ) {
    super(message);
  }
}

const API = "https://generativelanguage.googleapis.com/v1beta";
let autoModel: string | null = null;

/**
 * Pick the newest stable Flash-Lite model this key can use (falls back to
 * Flash). Google renames models over time, so we ask instead of hard-coding.
 */
export function pickModel(models: { name: string; supportedGenerationMethods?: string[] }[]): string | null {
  const usable = models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /^gemini-/.test(n) && !/(preview|exp|tts|image|live|audio|embedding|thinking|learnlm|-\d{3,}$)/.test(n));
  const version = (n: string) => parseFloat(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? "0");
  const best = (re: RegExp) => usable.filter((n) => re.test(n)).sort((a, b) => version(b) - version(a) || a.length - b.length)[0];
  return best(/flash-lite/) ?? best(/flash/) ?? null;
}

class GeminiProvider implements AiProvider {
  name = "gemini";
  constructor(
    private apiKey: string,
    private model: string | null,
  ) {}

  private async resolveModel(): Promise<string> {
    if (this.model) return this.model;
    if (autoModel) return autoModel;
    const res = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": this.apiKey }, cache: "no-store" });
    if (!res.ok) throw new AiError(res.status === 400 || res.status === 403 ? "The AI key isn’t valid." : `Couldn’t list models (${res.status})`, "failed");
    const { models = [] } = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    autoModel = pickModel(models);
    if (!autoModel) throw new AiError("No suitable free model found for this key.", "failed");
    return autoModel;
  }

  async searchWeb(prompt: string): Promise<AiSearchResult> {
    // Search grounding isn't on every model; try the chosen model, then the 2.5 Flash-Lite family.
    const first = await this.resolveModel();
    const tries = [...new Set([first, "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-flash-latest", "gemini-2.0-flash"])];
    let lastStatus = 0;
    let limited: "minute" | "day" | null = null;
    for (const model of tries) {
      const res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(45_000),
        cache: "no-store",
      }).catch(() => null);
      if (!res) throw new AiError("Couldn’t reach Gemini", "failed");
      if (res.status === 429) {
        // Each model has its own free allowance, so try the next one.
        // Google says which limit was hit: per minute, or per day.
        const body = await res.text().catch(() => "");
        if (/PerMinute|per minute/i.test(body)) limited = limited ?? "minute";
        else limited = "day";
        lastStatus = 429;
        continue;
      }
      if (!res.ok) {
        lastStatus = res.status;
        continue; // model may not support search; try the next
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[];
      };
      const c = data.candidates?.[0];
      const text = c?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const sources = (c?.groundingMetadata?.groundingChunks ?? [])
        .map((g) => ({ uri: g.web?.uri ?? "", title: g.web?.title ?? "" }))
        .filter((x) => x.uri);
      return { text, sources };
    }
    if (limited === "minute") throw new AiError("Too many searches in a short time. Wait a minute and try again.", "rate_limited");
    if (limited === "day") throw new AiError("Today’s free recipe searches are used up. Try again tomorrow.", "rate_limited");
    throw new AiError(`Recipe search isn’t available with this key (${lastStatus}).`, "failed");
  }

  async generateJson(prompt: string, opts: { temperature?: number; images?: AiImage[] } = {}): Promise<string> {
    const model = await this.resolveModel();
    let res: Response;
    try {
      res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [...(opts.images ?? []).map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.data } })), { text: prompt }],
            },
          ],
          generationConfig: { responseMimeType: "application/json", temperature: opts.temperature ?? 0.8 },
        }),
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });
    } catch (e) {
      throw new AiError(`Couldn’t reach Gemini (${e instanceof Error ? e.message : "network"})`, "failed");
    }
    if (res.status === 404 && this.model) {
      // The configured model was retired: fall back to picking one automatically.
      this.model = null;
      return this.generateJson(prompt, opts);
    }
    if (res.status === 429) throw new AiError("Free limit reached for now. Try again later.", "rate_limited");
    if (!res.ok) throw new AiError(`Gemini error ${res.status}`, "failed");
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) throw new AiError("Gemini returned an empty answer", "failed");
    return text;
  }
}

export function getAiProvider(): AiProvider | null {
  const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  const key = process.env.AI_API_KEY;
  if (!key) return null;
  if (provider === "gemini") return new GeminiProvider(key, process.env.AI_MODEL?.trim() || null);
  return null;
}
