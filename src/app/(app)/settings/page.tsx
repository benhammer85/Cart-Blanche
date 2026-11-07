import Link from "next/link";
import { PageHeaderStatic } from "./_sections/Header";
import { IconChevron, IconStore, IconUsers, IconX, IconBook, IconReceipt, IconPot, IconUpload, IconShare } from "@/components/icons";
import type { ReactNode } from "react";

type Item = { href: string; label: string; detail: string; icon: ReactNode };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Stores",
    items: [
      { href: "/settings/stores", label: "Stores & aisles", detail: "Your stores, what you buy there, aisle order", icon: <IconStore /> },
    ],
  },
  {
    title: "Kitchen",
    items: [
      { href: "/settings/kitchen", label: "Kitchen", detail: "Dinners a week, pantry, freezer, equipment", icon: <IconPot /> },
    ],
  },
  {
    title: "Family",
    items: [
      { href: "/settings/people", label: "People", detail: "Who you cook for, portion sizes", icon: <IconUsers /> },
      { href: "/settings/avoid", label: "Avoid & favorites", detail: "Never-use list, favorite tags", icon: <IconX /> },
    ],
  },
  {
    title: "Advanced",
    items: [
      { href: "/settings/ingredients", label: "Ingredients", detail: "Aisles, pack sizes, only-at items, synonyms", icon: <IconBook /> },
      { href: "/settings/receipts", label: "Learn from receipts", detail: "Teach which store you buy things at", icon: <IconReceipt /> },
      { href: "/recipes/import", label: "Import from Crouton", detail: ".crumb files or a .zip", icon: <IconUpload /> },
      { href: "/recipes/share-setup", label: "Share button setup", detail: "Save recipes from Safari", icon: <IconShare /> },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div>
      <PageHeaderStatic title="Settings" />
      <div className="px-4">
        {GROUPS.map((g) => (
          <section key={g.title} className="mt-6">
            <h2 className="menu-label mb-2 px-1 text-muted">{g.title}</h2>
            <ul className="card divide-y divide-line overflow-hidden">
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="flex min-h-[60px] items-center gap-3 px-4 py-2 active:bg-soft">
                    <span className="grid h-8 w-8 place-items-center text-[20px] text-ink/70">{i.icon}</span>
                    <span className="flex-1">
                      <span className="block text-[17px]">{i.label}</span>
                      <span className="block text-[13px] text-muted">{i.detail}</span>
                    </span>
                    <IconChevron className="text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <form action="/auth/signout" method="post" className="mt-8">
          <button className="card h-12 w-full text-[17px] text-[#d23c3c]">Sign out</button>
        </form>
      </div>
    </div>
  );
}
