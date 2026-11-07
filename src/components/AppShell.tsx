"use client";
import { OfflineRecipes } from "./OfflineRecipes";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconBook, IconCalendar, IconCart, IconSettings } from "./icons";
import { cx } from "./ui";
import type { Membership } from "@/lib/household/types";

const Ctx = createContext<Membership | null>(null);
export function useMembership(): Membership {
  const m = useContext(Ctx);
  if (!m) throw new Error("useMembership outside AppShell");
  return m;
}

const TABS = [
  { href: "/list", label: "List", Icon: IconCart },
  { href: "/plan", label: "Plan", Icon: IconCalendar },
  { href: "/recipes", label: "Recipes", Icon: IconBook },
  { href: "/settings", label: "Settings", Icon: IconSettings },
];

export function AppShell({ membership, children }: { membership: Membership; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  // Settings change what Plan and Recipes show: drop the cached tabs on the way out.
  const prev = useRef(path);
  useEffect(() => {
    if (prev.current.startsWith("/settings") && !path.startsWith("/settings")) router.refresh();
    prev.current = path;
  }, [path, router]);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // Weekly backup: ask once a day; the server only saves when the last one is a week old.
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (navigator.onLine && localStorage.getItem("cb:backup-check") !== today) {
        localStorage.setItem("cb:backup-check", today);
        setTimeout(() => fetch("/api/backup", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => {}), 5000);
      }
    } catch {
      /* private mode */
    }
  }, []);
  return (
    <Ctx.Provider value={membership}>
      <div className="mx-auto min-h-dvh max-w-xl pb-28">{children}</div>
      <OfflineRecipes />
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t hairline bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl">
          {TABS.map(({ href, label, Icon }) => {
            const active = path === href || path.startsWith(href + "/") || (href === "/plan" && path.startsWith("/history"));
            return (
              <Link key={href} href={href} prefetch className={cx("flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1 text-[11px] font-medium", active ? "text-accent" : "text-muted")}>
                <Icon className="text-[26px]" strokeWidth={active ? 2.1 : 1.75} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </Ctx.Provider>
  );
}
