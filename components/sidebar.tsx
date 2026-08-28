"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/nav";
import { useStaffSim } from "@/lib/staff-context";

export function Sidebar() {
  const pathname = usePathname();
  const { currentRole } = useStaffSim();

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-surface flex flex-col">
      <div className="px-5 py-6 border-b border-border">
        <span className="text-lg font-semibold tracking-wide text-gold">
          NXS
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {navItems
          .filter((item) => !("ownerOnly" in item && item.ownerOnly) || currentRole === "Owner")
          .map((item) => {
          const active =
            pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-5 py-2.5 text-sm border-l-2 transition-colors ${
                active
                  ? "border-gold text-gold bg-gold/10"
                  : "border-transparent text-muted hover:text-foreground hover:bg-white/5"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
