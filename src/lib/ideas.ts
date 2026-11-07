// Recipes the AI suggested are "ideas" until we've cooked one.
export const IDEA_TAG = "Idea";

export function isIdea(r: { tags?: string[] | null; times_made?: number | null }): boolean {
  return !r.times_made && !!r.tags?.some((t) => t === IDEA_TAG || t === "AI idea");
}
