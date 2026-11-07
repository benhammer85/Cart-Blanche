import { describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { pickModel } from "@/lib/ai/provider";

const m = (name: string) => ({ name: `models/${name}`, supportedGenerationMethods: ["generateContent"] });

describe("Gemini model choice", () => {
  test("newest stable flash-lite wins; previews and special models are skipped", () => {
    expect(pickModel([m("gemini-2.0-flash"), m("gemini-2.5-flash-lite"), m("gemini-3.0-flash-lite-preview"), m("gemini-2.5-pro"), m("gemini-2.5-flash-image")])).toBe("gemini-2.5-flash-lite");
  });
  test("falls back to flash when no flash-lite exists", () => {
    expect(pickModel([m("gemini-2.5-pro"), m("gemini-2.5-flash")])).toBe("gemini-2.5-flash");
  });
  test("nothing usable", () => {
    expect(pickModel([{ name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] }])).toBeNull();
  });
});
