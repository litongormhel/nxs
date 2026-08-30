"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/nav";
import { useStaffSim } from "@/lib/staff-context";
import { logout } from "@/app/(auth)/login/actions";

export function Sidebar() {
  const pathname = usePathname();
  const { currentRole, sessionStaff } = useStaffSim();

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-surface flex flex-col">
      <div className="px-5 py-6 border-b border-border flex items-center gap-2">
        <Image src="/logo.jpeg" alt="NXS Spa" width={28} height={28} className="rounded-sm" />
        <span className="text-lg font-semibold tracking-wide text-gold">
          NXS Spa
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
      <div className="border-t border-border px-5 py-4">
        {sessionStaff ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-foreground truncate">
                {sessionStaff.name}
              </div>
              <div className="text-[11px] text-muted truncate">{currentRole}</div>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-muted hover:text-foreground hover:bg-white/5"
              >
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            className="block rounded-md border border-border px-2.5 py-1.5 text-center text-[11px] text-muted hover:text-foreground hover:bg-white/5"
          >
            Log in
          </Link>
        )}
      </div>
    </aside>
  );
}
