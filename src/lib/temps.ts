// We cook in Fahrenheit: show every temperature in °F.
//
// "Preheat to 180°C" → "Preheat to 350°F" (oven heat rounds to the nearest 25,
// like an oven dial; meat and sugar temperatures to the nearest 5).
// "325°F (165°C)" and "350°F/180°C" drop the Celsius half. "Gas mark 4" → 350°F.

const GAS: Record<string, number> = { "1": 275, "2": 300, "3": 325, "4": 350, "5": 375, "6": 400, "7": 425, "8": 450, "9": 475 };

// A Celsius reading. Bare "C" ("180C") only counts for real cooking heat, so "2 c" stays cups.
const C = String.raw`(?:fan(?:-forced)?\s*)?(-?\d{1,3}(?:\.\d)?)\s*(°\s*C\b|º\s*C\b|degrees?\s*(?:C\b|Celsius|centigrade)|C\b)(?:\s*\(?fan\)?)?`;
const F = String.raw`(-?\d{1,3})\s*(?:°\s*F\b|º\s*F\b|degrees?\s*(?:F\b|Fahrenheit)|F\b)`;

export function toF(c: number): number {
  const f = (c * 9) / 5 + 32;
  return c >= 100 ? Math.round(f / 25) * 25 : Math.round(f / 5) * 5;
}

const isTemp = (n: string, unit: string) => /°|º|degree/i.test(unit) || Number(n) >= 40;

export function fahrenheit(text: string): string {
  let s = text;
  // Both given: keep the °F, drop the °C beside it ("350°F (180°C)", "350°F/180°C").
  s = s.replace(new RegExp(`${F}\\s*(?:\\(\\s*${C}\\s*\\)|\\/\\s*${C})`, "gi"), (_m, f) => `${f}°F`);
  // ... or the other way round ("180°C (350°F)", "180°C/350°F").
  s = s.replace(new RegExp(`${C}\\s*(?:\\(\\s*${F}\\s*\\)|\\/\\s*${F})`, "gi"), (_m, _c, _u, f1, f2) => `${f1 ?? f2}°F`);
  // Celsius alone.
  s = s.replace(new RegExp(C, "gi"), (m, c, unit) => (isTemp(c, unit) ? `${toF(Number(c))}°F` : m));
  // Gas mark (UK ovens).
  s = s.replace(/\bgas\s*mark\s*([1-9])\b/gi, (_m, n) => `${GAS[n]}°F`);
  // One way of writing it: "350 degrees F" → "350°F".
  s = s.replace(new RegExp(F, "gi"), (_m, f) => `${f}°F`);
  return s;
}
