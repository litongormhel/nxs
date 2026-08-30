"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/nav";
import { useStaffSim } from "@/lib/staff-context";
import { logout } from "@/app/(auth)/login/actions";

export function Sidebar() {
  const pathname = usePathname();
  const { currentRole, sessionStaff } = useStaffSim();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open menu"
          className="fixed left-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-md border border-border bg-surface text-foreground shadow-md sm:hidden"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 sm:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 shrink-0 border-r border-border bg-surface flex flex-col transition-transform duration-200 sm:static sm:translate-x-0 sm:transition-none ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-5 py-6 border-b border-border flex items-center gap-2">
          <Image src="/logo.jpeg" alt="NXS Spa" width={28} height={28} className="rounded-sm" />
          <span className="flex-1 text-lg font-semibold tracking-wide text-gold">
            NXS Spa
          </span>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:text-foreground sm:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
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
                onClick={() => setIsOpen(false)}
                className={`block px-5 py-3 sm:py-2.5 text-sm border-l-2 transition-colors ${
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
                  className="shrink-0 rounded-md border border-border px-2.5 py-2.5 sm:py-1.5 text-[11px] text-muted hover:text-foreground hover:bg-white/5"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/login"
              onClick={() => setIsOpen(false)}
              className="block rounded-md border border-border px-2.5 py-2.5 sm:py-1.5 text-center text-[11px] text-muted hover:text-foreground hover:bg-white/5"
            >
              Log in
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
