import { NewRecipe } from "./NewRecipe";

export default async function NewRecipePage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <NewRecipe initialMode={mode === "paste" ? "paste" : mode === "manual" ? "manual" : "url"} />;
}
