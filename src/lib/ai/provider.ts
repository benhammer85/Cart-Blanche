// Tiny AI provider interface. Only Google Gemini (free tier) is implemented;
// switch providers later by adding another implementation and setting
// AI_PROVIDER / AI_MODEL / AI_API_KEY. Server-only.
import "server-only";

export interface AiProvider {
  name: string;
  /** Returns the raw JSON text the model produced. Throws AiError on failure. */
  generateJson(prompt: string, opts?: { temperature?: number }): Promise<string>;
}

export class AiError extends Error {
  constructor(
    message: string,
    public kind: "not_configured" | "rate_limited" | "failed",
  ) {
    super(message);
  }
}

class GeminiProvider implements AiProvider {
  name = "gemini";
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async generateJson(prompt: string, opts: { temperature?: number } = {}): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: opts.temperature ?? 0.8 },
        }),
        signal: AbortSignal.timeout(25_000),
        cache: "no-store",
      });
    } catch (e) {
      throw new AiError(`Couldn’t reach Gemini (${e instanceof Error ? e.message : "network"})`, "failed");
    }
    if (res.status === 429) throw new AiError("Gemini free-tier limit reached — try again later.", "rate_limited");
    if (!res.ok) throw new AiError(`Gemini error ${res.status}`, "failed");
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) throw new AiError("Gemini returned an empty answer", "failed");
    return text;
  }
}

export function getAiProvider(): AiProvider | null {
  const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  const key = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || "gemini-2.5-flash-lite";
  if (!key) return null;
  if (provider === "gemini") return new GeminiProvider(key, model);
  return null;
}
