import Link from "next/link";
import { PageHeaderStatic } from "./_sections/Header";
import { IconChevron, IconLeaf, IconStore, IconUsers, IconX, IconBook, IconSettings } from "@/components/icons";
import type { ReactNode } from "react";

const ITEMS: { href: string; label: string; detail: string; icon: ReactNode; tint: string }[] = [
  { href: "/settings/people", label: "People", detail: "Who we cook for, portion sizes", icon: <IconUsers />, tint: "#5b8def" },
  { href: "/settings/stores", label: "Stores & aisles", detail: "Stores, order, section walk order", icon: <IconStore />, tint: "#e2553a" },
  { href: "/settings/rules", label: "Store rules", detail: "Which store gets which category", icon: <IconSettings />, tint: "#8a6de9" },
  { href: "/settings/pantry", label: "Pantry staples", detail: "Never added unless we’re out", icon: <IconLeaf />, tint: "#3a9a5b" },
  { href: "/settings/ingredients", label: "Ingredients", detail: "Categories, bulk pack sizes, synonyms", icon: <IconBook />, tint: "#c98a12" },
  { href: "/settings/avoid", label: "Avoid & favorites", detail: "Never-use list, bonus tags", icon: <IconX />, tint: "#d23c3c" },
];

export default function SettingsPage() {
  return (
    <div>
      <PageHeaderStatic title="Settings" />
      <div className="px-4">
        <ul className="card mt-4 divide-y divide-line overflow-hidden">
          {ITEMS.map((i) => (
            <li key={i.href}>
              <Link href={i.href} className="flex min-h-[60px] items-center gap-3 px-4 py-2 active:bg-soft">
                <span className="grid h-8 w-8 place-items-center rounded-lg text-[18px] text-white" style={{ background: i.tint }}>
                  {i.icon}
                </span>
                <span className="flex-1">
                  <span className="block text-[17px]">{i.label}</span>
                  <span className="block text-[13px] text-muted">{i.detail}</span>
                </span>
                <IconChevron className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 px-2 text-[13px] text-muted">Planning defaults are saved from the Plan screen (“Save as default”).</p>
        <form action="/auth/signout" method="post" className="mt-8">
          <button className="card h-12 w-full text-[17px] text-[#d23c3c]">Sign out</button>
        </form>
      </div>
    </div>
  );
}
