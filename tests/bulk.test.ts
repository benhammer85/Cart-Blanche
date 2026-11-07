import { describe, expect, test } from "vitest";
import { addStock, parsePack, planPacks, useStock } from "@/lib/list/bulk";

describe("pack sizes", () => {
  test("parses the sizes we write in Settings", () => {
    expect(parsePack("~6 lb")).toEqual({ qty: 6, unit: "lb" });
    expect(parsePack("5 dozen")).toEqual({ qty: 60, unit: "each" });
    expect(parsePack("2 × 1 gal")).toEqual({ qty: 2, unit: "gallon" });
    expect(parsePack("12 rolls")).toEqual({ qty: 12, unit: "each" });
    expect(parsePack("2 L")).toEqual({ qty: 2, unit: "l" });
    expect(parsePack("")).toBeNull();
  });
});

describe("bulk packs", () => {
  test("one 6 lb pack for 1.5 lb leaves 4.5 lb", () => {
    expect(planPacks({ qty: 1.5, unit: "lb" }, { qty: 6, unit: "lb" })).toEqual({ packs: 1, leftover: { qty: 4.5, unit: "lb" } });
  });
  test("needing more than a pack buys two", () => {
    expect(planPacks({ qty: 7, unit: "lb" }, { qty: 6, unit: "lb" })?.packs).toBe(2);
  });
  test("ounces vs pounds still compare", () => {
    expect(planPacks({ qty: 24, unit: "oz" }, { qty: 6, unit: "lb" })?.leftover).toEqual({ qty: 4.5, unit: "lb" });
  });
  test("different kinds don't compare", () => {
    expect(planPacks({ qty: 2, unit: "each" }, { qty: 6, unit: "lb" })).toBeNull();
  });
});

describe("using stock first", () => {
  test("stock covers it", () => {
    expect(useStock({ qty: 1.5, unit: "lb" }, { qty: 4.5, unit: "lb" })).toEqual({ used: { qty: 1.5, unit: "lb" }, toBuy: null, remaining: { qty: 3, unit: "lb" } });
  });
  test("stock covers part of it", () => {
    expect(useStock({ qty: 2, unit: "lb" }, { qty: 0.5, unit: "lb" })).toEqual({ used: { qty: 0.5, unit: "lb" }, toBuy: { qty: 1.5, unit: "lb" }, remaining: null });
  });
  test("adding to stock", () => {
    expect(addStock({ qty: 1, unit: "lb" }, { qty: 4.5, unit: "lb" })).toEqual({ qty: 5.5, unit: "lb" });
    expect(addStock(null, { qty: 3, unit: "each" })).toEqual({ qty: 3, unit: "each" });
  });
});
