import { notFound } from "next/navigation";
import { PeopleSettings } from "../_sections/People";
import { StoresSettings } from "../_sections/Stores";
import { RulesSettings } from "../_sections/Rules";
import { IngredientsSettings } from "../_sections/Ingredients";
import { AvoidSettings } from "../_sections/Avoid";
import { KitchenSettings } from "../_sections/Kitchen";
import { ReceiptsSettings } from "../_sections/Receipts";
import { BackupsSettings } from "../_sections/Backups";

const SECTIONS = {
  people: PeopleSettings,
  stores: StoresSettings,
  rules: RulesSettings,
  pantry: KitchenSettings,
  ingredients: IngredientsSettings,
  avoid: AvoidSettings,
  stock: KitchenSettings,
  kitchen: KitchenSettings,
  receipts: ReceiptsSettings,
  backups: BackupsSettings,
};

export default async function SettingsSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const Comp = SECTIONS[section as keyof typeof SECTIONS];
  if (!Comp) notFound();
  return <Comp />;
}
