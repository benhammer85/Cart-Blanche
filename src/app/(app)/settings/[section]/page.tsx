import { notFound } from "next/navigation";
import { PeopleSettings } from "../_sections/People";
import { StoresSettings } from "../_sections/Stores";
import { RulesSettings } from "../_sections/Rules";
import { PantrySettings } from "../_sections/Pantry";
import { IngredientsSettings } from "../_sections/Ingredients";
import { AvoidSettings } from "../_sections/Avoid";

const SECTIONS = {
  people: PeopleSettings,
  stores: StoresSettings,
  rules: RulesSettings,
  pantry: PantrySettings,
  ingredients: IngredientsSettings,
  avoid: AvoidSettings,
};

export default async function SettingsSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const Comp = SECTIONS[section as keyof typeof SECTIONS];
  if (!Comp) notFound();
  return <Comp />;
}
