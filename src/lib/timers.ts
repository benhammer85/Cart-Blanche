// Find cooking times in a step: "simmer 20 minutes", "bake 30 to 35 min", "1 1/2 hours".
export interface StepTimer {
  label: string;
  seconds: number;
}

const NUM = String.raw`(\d+(?:\.\d+)?(?:\s+\d\/\d)?|\d\/\d|one|two|three|four|five|ten|fifteen|twenty|thirty|forty|forty-five|sixty|an?|half an?)`;
const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, "forty-five": 45, sixty: 60, a: 1, an: 1, "half a": 0.5, "half an": 0.5,
};

function toNumber(s: string): number {
  const w = WORDS[s.toLowerCase()];
  if (w != null) return w;
  const parts = s.trim().split(/\s+/);
  return parts.reduce((sum, p) => {
    if (p.includes("/")) {
      const [a, b] = p.split("/").map(Number);
      return sum + a / b;
    }
    return sum + Number(p);
  }, 0);
}

export function findTimers(text: string): StepTimer[] {
  const re = new RegExp(`${NUM}(?:\\s*(?:to|-|–|or)\\s*${NUM})?\\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\\b`, "gi");
  const out: StepTimer[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const low = toNumber(m[1]);
    const high = m[2] ? toNumber(m[2]) : null;
    const unit = m[3].toLowerCase();
    const mult = unit.startsWith("h") ? 3600 : unit.startsWith("s") ? 1 : 60;
    if (!low || low * mult < 30 || low * mult > 12 * 3600) continue;
    const short = unit.startsWith("h") ? "hr" : unit.startsWith("s") ? "sec" : "min";
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n === 0.5 ? "½" : n.toFixed(1));
    out.push({ label: high ? `${fmt(low)}–${fmt(high)} ${short}` : `${fmt(low)} ${short}`, seconds: Math.round(low * mult) });
  }
  return out;
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
