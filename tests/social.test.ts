import { describe, expect, it } from "vitest";
import { buildFindPrompt, captionHasRecipe, instagramCaption, parseCaptionAnswer, socialSite } from "@/lib/import/social";

describe("social recipe links", () => {
  it("knows TikTok and Instagram links", () => {
    expect(socialSite("https://www.tiktok.com/@cook/video/123")).toBe("tiktok");
    expect(socialSite("https://vm.tiktok.com/ZMabc/")).toBe("tiktok");
    expect(socialSite("https://www.instagram.com/reel/Cxyz/")).toBe("instagram");
    expect(socialSite("https://smittenkitchen.com/2020/01/soup/")).toBeNull();
    expect(socialSite("not a link")).toBeNull();
  });

  it("reads an Instagram preview caption", () => {
    const html = `<meta property="og:description" content="1,234 likes, 56 comments - halfbakedharvest on May 1, 2025: &quot;Crispy gnocchi with pesto&#x1f33f;&quot;" />`;
    expect(instagramCaption(html)).toEqual({ caption: "Crispy gnocchi with pesto🌿", creator: "halfbakedharvest" });
    expect(instagramCaption("<html></html>")).toBeNull();
  });

  it("spots a caption that holds the whole recipe", () => {
    expect(captionHasRecipe("Best chili ever! Recipe on my site")).toBe(false);
    expect(captionHasRecipe("Chili\n1 lb ground beef\n2 cans beans\n1 onion\n- 2 tbsp chili powder\nCook it all")).toBe(true);
  });

  it("reads the screenshot answer", () => {
    expect(parseCaptionAnswer('```json\n{"dish":"Marry me chicken","creator":"@cook","caption":"so good"}\n```')).toEqual({ caption: "Marry me chicken\nso good", creator: "cook" });
    expect(parseCaptionAnswer('{"dish":"","creator":null,"caption":""}')).toBeNull();
    expect(parseCaptionAnswer("nope")).toBeNull();
  });

  it("asks for the creator's own recipe first and skips video sites", () => {
    const p = buildFindPrompt({ caption: "Marry me chicken", creator: "cook", site: "tiktok" });
    expect(p).toContain("Creator: cook");
    expect(p).toContain("creator's own recipe first");
    expect(p).toContain("Never TikTok");
  });
});
