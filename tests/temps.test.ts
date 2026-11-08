import { describe, expect, test } from "vitest";
import { fahrenheit, toF } from "@/lib/temps";

describe("everything in Fahrenheit", () => {
  test("oven heat rounds like an oven dial; meat to the nearest 5", () => {
    expect(toF(180)).toBe(350);
    expect(toF(200)).toBe(400);
    expect(toF(220)).toBe(425);
    expect(toF(160)).toBe(325);
    expect(toF(63)).toBe(145);
    expect(toF(74)).toBe(165);
  });
  test("converts Celsius on its own", () => {
    expect(fahrenheit("Preheat the oven to 180°C.")).toBe("Preheat the oven to 350°F.");
    expect(fahrenheit("Bake at 200 degrees Celsius for 20 min")).toBe("Bake at 400°F for 20 min");
    expect(fahrenheit("Heat oven to 220C fan.")).toBe("Heat oven to 425°F.");
    expect(fahrenheit("Cook until it reads 63 °C inside")).toBe("Cook until it reads 145°F inside");
  });
  test("drops Celsius when Fahrenheit is already there", () => {
    expect(fahrenheit("Preheat oven to 325 degrees F (165 degrees C). Grease a pan.")).toBe("Preheat oven to 325°F. Grease a pan.");
    expect(fahrenheit("Heat to 350°F/180°C")).toBe("Heat to 350°F");
    expect(fahrenheit("Heat to 180°C (350°F) and bake")).toBe("Heat to 350°F and bake");
  });
  test("gas mark and leaves other things alone", () => {
    expect(fahrenheit("Oven at gas mark 4")).toBe("Oven at 350°F");
    expect(fahrenheit("Add 2 c flour and a 9x5-inch pan")).toBe("Add 2 c flour and a 9x5-inch pan");
    expect(fahrenheit("Stir for 2 minutes.")).toBe("Stir for 2 minutes.");
  });
});
