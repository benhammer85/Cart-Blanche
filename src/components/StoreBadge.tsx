// Round initials badge for a store (no store logos: those are trademarked).
const KNOWN: Record<string, { label: string; bg: string; fg?: string }> = {
  traderjoes: { label: "TJ", bg: "#c8102e" },
  costco: { label: "C", bg: "#005daa" },
  marketbasket: { label: "MB", bg: "#d6312b" },
  shaws: { label: "S", bg: "#0a6ebd" },
  hmart: { label: "H", bg: "#1f8a4c" },
  starmarket: { label: "SM", bg: "#e4002b" },
  wholefoods: { label: "WF", bg: "#00674b" },
  stopandshop: { label: "S&S", bg: "#d7282f" },
};
const PALETTE = ["#7b5ea7", "#c47a1a", "#2f7f8f", "#a23b72", "#4a6fa5", "#5d8a3a"];

export function storeBadgeStyle(name: string) {
  const key = name.toLowerCase().replace(/[^a-z]/g, "");
  if (KNOWN[key]) return KNOWN[key];
  const words = name.replace(/['’]/g, "").split(/\s+/).filter(Boolean);
  const label = (words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [words[0]?.[0] ?? "?"]).join("").toUpperCase();
  const hash = [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return { label, bg: PALETTE[hash % PALETTE.length] };
}

export function StoreBadge({ name, size = 32 }: { name: string; size?: number }) {
  const s = storeBadgeStyle(name);
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: s.bg, color: s.fg ?? "#fff", fontSize: size * (s.label.length > 2 ? 0.32 : s.label.length > 1 ? 0.38 : 0.46) }}
    >
      {s.label}
    </span>
  );
}
