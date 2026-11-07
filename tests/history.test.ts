import { describe, expect, test } from "vitest";
import { historyLine, lastMadeShort, whenWords } from "@/lib/history";

const now = new Date("2026-11-07T12:00:00Z");
const ago = (d: number) => new Date(+now - d * 86_400_000).toISOString();

describe("history in plain words", () => {
  test("when", () => {
    expect(whenWords(ago(3), now)).toBe("this week");
    expect(whenWords(ago(9), now)).toBe("last week");
    expect(whenWords(ago(21), now)).toBe("3 weeks ago");
    expect(whenWords("2026-08-10T12:00:00Z", now)).toBe("in August");
    expect(whenWords("2025-02-10T12:00:00Z", now)).toBe("last year");
  });
  test("card line", () => {
    expect(historyLine(0, null, now)).toBe("Not made yet");
    expect(historyLine(1, ago(21), now)).toBe("Made once · last 3 weeks ago");
    expect(historyLine(14, "2026-07-02T12:00:00Z", now)).toBe("Made 14 times · not since July");
    expect(historyLine(2, "2026-10-01T12:00:00Z", now)).toBe("Made twice · last in October");
  });
  test("short", () => {
    expect(lastMadeShort(0, null, now)).toBe("new");
    expect(lastMadeShort(3, ago(9), now)).toBe("made last week");
    expect(lastMadeShort(3, "2026-06-02T12:00:00Z", now)).toBe("not since June");
  });
});
