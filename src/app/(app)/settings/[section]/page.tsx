import { notFound } from "next/navigation";
import { PeopleSettings } from "../_sections/People";
import { StoresSettings } from "../_sections/Stores";
import { RulesSettings } from "../_sections/Rules";
import { PantrySettings } from "../_sections/Pantry";
import { IngredientsSettings } from "../_sections/Ingredients";
import { AvoidSettings } from "../_sections/Avoid";
import { StockSettings } from "../_sections/Stock";
import { ReceiptsSettings } from "../_sections/Receipts";

const SECTIONS = {
  people: PeopleSettings,
  stores: StoresSettings,
  rules: RulesSettings,
  pantry: PantrySettings,
  ingredients: IngredientsSettings,
  avoid: AvoidSettings,
  stock: StockSettings,
  receipts: ReceiptsSettings,
};

export default async function SettingsSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const Comp = SECTIONS[section as keyof typeof SECTIONS];
  if (!Comp) notFound();
  return <Comp />;
}
