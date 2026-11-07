import { describe, expect, test } from "vitest";
import { findTimers, formatClock } from "@/lib/timers";

describe("step timers", () => {
  test("finds times in steps", () => {
    expect(findTimers("Simmer for 20 minutes, stirring.")).toEqual([{ label: "20 min", seconds: 1200 }]);
    expect(findTimers("Bake 30 to 35 minutes until golden")).toEqual([{ label: "30–35 min", seconds: 1800 }]);
    expect(findTimers("Cook on high pressure for 1 1/2 hours")).toEqual([{ label: "1.5 hr", seconds: 5400 }]);
    expect(findTimers("Rest for half an hour")).toEqual([{ label: "½ hr", seconds: 1800 }]);
    expect(findTimers("Sear 4-5 min per side, then roast 10 minutes")).toHaveLength(2);
  });
  test("ignores tiny or silly durations", () => {
    expect(findTimers("Whisk for 10 seconds")).toEqual([]);
    expect(findTimers("Heat the oven to 450ºF.")).toEqual([]);
  });
  test("clock", () => {
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3725)).toBe("1:02:05");
  });
});
