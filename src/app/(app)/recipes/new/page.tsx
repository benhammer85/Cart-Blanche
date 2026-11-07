import { NewRecipe } from "./NewRecipe";

// /recipes/new?url=…  (or ?text=… from the iPhone share sheet) opens straight
// into "From a link" and reads the recipe right away.
export default async function NewRecipePage({ searchParams }: { searchParams: Promise<{ mode?: string; url?: string; text?: string }> }) {
  const { mode, url, text } = await searchParams;
  const shared = (url ?? text ?? "").match(/https?:\/\/[^\s"'<>]+/)?.[0] ?? null;
  return <NewRecipe initialMode={shared ? "url" : mode === "paste" ? "paste" : mode === "manual" ? "manual" : "url"} initialUrl={shared} />;
}
