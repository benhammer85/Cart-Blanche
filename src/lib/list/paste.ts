// Turning a pasted or texted list into lines: one item per line (or comma),
// without the checkboxes, bullets and numbers notes apps add.

const LEAD = /^\s*(?:[-–—•*▢☐☑✓✔□■○◯●◦▪·>]+\s*)*(?:\[\s*[xX✓✔]?\s*\]\s*|\(\s*[xX]?\s*\)\s*)?(?:\d+[.)]\s+)?/;

export function cleanListLine(line: string): string {
  let t = line.replace(LEAD, "");
  // A lone "o" or "O" used as a bullet ("O Milk"), not a word.
  t = t.replace(/^[oO]\s+(?=[A-Z])/, "");
  return t.replace(/\s+/g, " ").trim();
}

export function splitPastedList(text: string): string[] {
  return text
    .split(/\n|,(?![^(]*\))/)
    .map(cleanListLine)
    .filter((l) => l.length > 1);
}
