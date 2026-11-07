// Bulk packs (Costco) and what's left over in the freezer/pantry.
//
// • A pack size like "~6 lb", "5 dozen", "2 × 1 gal", "12 rolls" is parsed
//   into a quantity we can compare with what the plan needs.
// • Buying a pack for 1.5 lb of chicken leaves ~4.5 lb: that becomes stock.
// • Next time, stock is used first; only the shortfall goes on the list.

import { canonicalUnit, fromBase, toBase, unitDimension, round, type Dimension } from "../units";

export interface Amount {
  qty: number;
  unit: string;
}

/** "~6 lb" → {6, lb}; "5 dozen" → {60, each}; "2 × 1 gal" → {2, gallon}; "12 rolls" → {12, each}. */
export function parsePack(text: string | null | undefined): Amount | null {
  if (!text) return null;
  const t = text.toLowerCase().trim().replace(/^(~|≈|about|approx\.?)\s*/, "");
  const multi = t.match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*([a-z.]+)/);
  if (multi) {
    const unit = canonicalUnit(multi[3]) ?? (/gal/.test(multi[3]) ? "gallon" : null);
    if (unit) return { qty: +multi[1] * +multi[2], unit };
  }
  const dozen = t.match(/^(\d+(?:\.\d+)?)\s*dozen/);
  if (dozen) return { qty: +dozen[1] * 12, unit: "each" };
  const m = t.match(/(\d+(?:\.\d+)?)\s*([a-z.]+)?/);
  if (!m) return null;
  const word = m[2] ?? "";
  const unit = canonicalUnit(word) ?? (/^(rolls?|ct|count|pcs?|pieces?|eggs?)$/.test(word) || !word ? "each" : /gal/.test(word) ? "gallon" : null);
  return unit ? { qty: +m[1], unit } : null;
}

function base(a: Amount): { v: number; dim: Dimension; unit: string } {
  const dim = unitDimension(a.unit);
  return { v: dim === "count" ? a.qty : toBase(a.qty, a.unit), dim, unit: a.unit };
}

function sameKind(a: Amount, b: Amount): boolean {
  const da = unitDimension(a.unit);
  return da === unitDimension(b.unit) && (da !== "count" || a.unit === b.unit);
}

/** Back from base units, keeping the unit we were given (lb stays lb). */
function back(v: number, dim: Dimension, unit: string): Amount {
  if (dim === "count") return { qty: round(v, 2), unit };
  const per = toBase(1, unit);
  return per ? { qty: round(v / per, 2), unit } : fromBase(v, dim);
}

export interface PackPlan {
  packs: number;
  leftover: Amount | null;
}

/** How many packs cover what we need, and what's left over. */
export function planPacks(need: Amount, pack: Amount): PackPlan | null {
  if (!sameKind(need, pack) || pack.qty <= 0) return null;
  const n = base(need);
  const p = base(pack);
  const packs = Math.max(1, Math.ceil(n.v / p.v - 1e-9));
  const left = packs * p.v - n.v;
  return { packs, leftover: left > p.v * 0.05 ? back(left, p.dim, pack.unit) : null };
}

export interface StockUse {
  /** what we take from stock */
  used: Amount;
  /** what still needs buying (null = nothing) */
  toBuy: Amount | null;
  /** stock left afterwards (null = none) */
  remaining: Amount | null;
}

/** Use what we already have before buying more. */
export function useStock(need: Amount, stock: Amount): StockUse | null {
  if (!sameKind(need, stock) || stock.qty <= 0) return null;
  const n = base(need);
  const s = base(stock);
  const usedV = Math.min(n.v, s.v);
  return {
    used: back(usedV, n.dim, need.unit),
    toBuy: n.v - usedV > n.v * 0.02 ? back(n.v - usedV, n.dim, need.unit) : null,
    remaining: s.v - usedV > s.v * 0.02 ? back(s.v - usedV, s.dim, stock.unit) : null,
  };
}

/** Add to what's already in stock (same kind of unit), or replace it. */
export function addStock(current: Amount | null, add: Amount): Amount {
  if (!current || !sameKind(current, add)) return add;
  const c = base(current);
  return back(c.v + base(add).v, c.dim, current.unit);
}
