import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { backupName, toPrune } from "@/lib/backup";

describe("backups", () => {
  it("names sort by date", () => {
    expect(backupName(new Date("2026-11-08T09:05:00Z"))).toBe("2026-11-08-09-05-00.json");
  });
  it("keeps the newest eight", () => {
    const names = Array.from({ length: 10 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}-00-00.json`);
    expect(toPrune(names)).toEqual(["2026-11-02-00-00.json", "2026-11-01-00-00.json"]);
    expect(toPrune(names.slice(0, 3))).toEqual([]);
  });
});
