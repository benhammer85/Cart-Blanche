// How we talk about when a recipe was last made, in plain words.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "this week", "last week", "3 weeks ago", "in August", "last year" */
export function whenWords(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(+d)) return null;
  const days = Math.floor((+now - +d) / 86_400_000);
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 7) return "this week";
  if (days < 14) return "last week";
  if (days < 35) return `${Math.floor(days / 7)} weeks ago`;
  if (d.getFullYear() === now.getFullYear() || days < 300) return `in ${MONTHS[d.getMonth()]}`;
  return days < 730 ? "last year" : "a while ago";
}

function times(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
}

/** One line for a recipe card: "Made 14 times · last 3 weeks ago" or "Not made yet". */
export function historyLine(timesMade: number, lastMadeAt: string | null | undefined, now: Date = new Date()): string {
  if (!timesMade) return "Not made yet";
  const when = whenWords(lastMadeAt, now);
  if (!when) return `Made ${times(timesMade)}`;
  const days = lastMadeAt ? (+now - +new Date(lastMadeAt)) / 86_400_000 : 0;
  // Long gaps read better as "not since": a nudge to bring something back.
  if (days >= 60 && when.startsWith("in ")) return `Made ${times(timesMade)} · not since ${when.slice(3)}`;
  return `Made ${times(timesMade)} · last ${when}`;
}

/** Short form for tight spaces: "3 weeks ago", "not since July", "new". */
export function lastMadeShort(timesMade: number, lastMadeAt: string | null | undefined, now: Date = new Date()): string {
  if (!timesMade) return "new";
  const when = whenWords(lastMadeAt, now);
  if (!when) return `made ${times(timesMade)}`;
  const days = lastMadeAt ? (+now - +new Date(lastMadeAt)) / 86_400_000 : 0;
  if (days >= 60 && when.startsWith("in ")) return `not since ${when.slice(3)}`;
  return when.startsWith("in ") ? `last made ${when}` : `made ${when}`;
}
