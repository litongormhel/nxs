"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/nav";
import { useStaffSim } from "@/lib/staff-context";
import { logout } from "@/app/(auth)/login/actions";
import { createClient } from "@/lib/supabase/client";

export type AppearanceConfig = {
  accentColor?: string;
  fontFamily?: string;
  fontScale?: string;
  tableDensity?: string;
};

export const ACCENT_PALETTES: Record<
  string,
  {
    name: string;
    preview: string;
    dark: { gold: string; goldHover: string; accentGold: string };
    light: { gold: string; goldHover: string; accentGold: string };
  }
> = {
  gold: {
    name: "Gold",
    preview: "#c89b3c",
    dark: { gold: "#c89b3c", goldHover: "#e0b754", accentGold: "#f3d48b" },
    light: { gold: "#a07820", goldHover: "#b8891a", accentGold: "#9c6f1e" },
  },
  emerald: {
    name: "Emerald",
    preview: "#10b981",
    dark: { gold: "#10b981", goldHover: "#34d399", accentGold: "#6ee7b7" },
    light: { gold: "#059669", goldHover: "#10b981", accentGold: "#047857" },
  },
  "rose-gold": {
    name: "Rose Gold",
    preview: "#e0838a",
    dark: { gold: "#e0838a", goldHover: "#ea9aa0", accentGold: "#f3b6bb" },
    light: { gold: "#b85b63", goldHover: "#c96b73", accentGold: "#9e444b" },
  },
  bronze: {
    name: "Bronze",
    preview: "#cd7f32",
    dark: { gold: "#cd7f32", goldHover: "#df954d", accentGold: "#e8b27c" },
    light: { gold: "#9e5b1e", goldHover: "#b46a26", accentGold: "#834712" },
  },
};

export function applyAppearanceTheme(config: AppearanceConfig) {
  if (typeof window === "undefined") return;

  const isLight = document.body.classList.contains("light");

  // 1. Accent Color
  if (config.accentColor) {
    const palette = ACCENT_PALETTES[config.accentColor] || ACCENT_PALETTES.gold;
    const colors = isLight ? palette.light : palette.dark;
    document.documentElement.style.setProperty("--gold", colors.gold);
    document.documentElement.style.setProperty("--gold-hover", colors.goldHover);
    document.documentElement.style.setProperty("--accent-gold", colors.accentGold);
    document.documentElement.setAttribute("data-accent", config.accentColor);
    try {
      localStorage.setItem("nxs_accent_color", config.accentColor);
    } catch {
      // ignore
    }
  }

  // 2. Font Family
  if (config.fontFamily) {
    let fontVal = "var(--font-geist-sans), Inter, -apple-system, BlinkMacSystemFont, sans-serif";
    if (config.fontFamily === "jakarta" || config.fontFamily === "Plus Jakarta Sans") {
      fontVal = '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif';
      ensureGoogleFontLoaded(
        "jakarta",
        "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap"
      );
    } else if (config.fontFamily === "serif" || config.fontFamily === "Playfair / Cinzel") {
      fontVal = '"Playfair Display", "Cinzel", Georgia, serif';
      ensureGoogleFontLoaded(
        "serif",
        "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap"
      );
    }
    document.body.style.fontFamily = fontVal;
    document.documentElement.style.setProperty("--font-sans", fontVal);
    document.documentElement.setAttribute("data-font-family", config.fontFamily);
    try {
      localStorage.setItem("nxs_font_family", config.fontFamily);
    } catch {
      // ignore
    }
  }

  // 3. Font Scale
  if (config.fontScale) {
    let sizeVal = "100%";
    if (config.fontScale === "compact") sizeVal = "90%";
    if (config.fontScale === "large") sizeVal = "110%";
    document.documentElement.style.fontSize = sizeVal;
    document.documentElement.setAttribute("data-font-scale", config.fontScale);
    try {
      localStorage.setItem("nxs_font_scale", config.fontScale);
    } catch {
      // ignore
    }
  }

  // 4. Table Density
  if (config.tableDensity) {
    document.documentElement.setAttribute("data-table-density", config.tableDensity);
    try {
      localStorage.setItem("nxs_table_density", config.tableDensity);
    } catch {
      // ignore
    }
    ensureDensityStyles(config.tableDensity === "dense");
  }
}

function ensureGoogleFontLoaded(id: string, href: string) {
  if (typeof document === "undefined") return;
  const linkId = `google-font-${id}`;
  if (!document.getElementById(linkId)) {
    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
}

function ensureDensityStyles(isDense: boolean) {
  if (typeof document === "undefined") return;
  const styleId = "nxs-table-density-styles";
  let styleEl = document.getElementById(styleId);
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  if (isDense) {
    styleEl.textContent = `
      [data-table-density="dense"] table td,
      [data-table-density="dense"] table th {
        padding-top: 0.35rem !important;
        padding-bottom: 0.35rem !important;
      }
      [data-table-density="dense"] .data-table-row {
        padding-top: 0.4rem !important;
        padding-bottom: 0.4rem !important;
      }
    `;
  } else {
    styleEl.textContent = "";
  }
}

export function broadcastBrandingChange(detail: { spaName?: string; logoUrl?: string | null }) {
  if (typeof window === "undefined") return;
  if (detail.spaName !== undefined) localStorage.setItem("nxs_spa_name", detail.spaName);
  if (detail.logoUrl !== undefined) {
    if (detail.logoUrl) localStorage.setItem("nxs_logo_url", detail.logoUrl);
    else localStorage.removeItem("nxs_logo_url");
  }
  window.dispatchEvent(new CustomEvent("nxs-branding-change", { detail }));
}

export function broadcastAppearanceChange(detail: AppearanceConfig) {
  if (typeof window === "undefined") return;
  applyAppearanceTheme(detail);
  window.dispatchEvent(new CustomEvent("nxs-appearance-change", { detail }));
}

export function Sidebar() {
  const pathname = usePathname();
  const { currentRole, sessionStaff } = useStaffSim();
  const [isOpen, setIsOpen] = useState(false);

  const [spaName, setSpaName] = useState("NXS Spa");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    // 1. Initial read from localStorage
    try {
      const storedName = localStorage.getItem("nxs_spa_name");
      if (storedName) setSpaName(storedName);
      const storedLogo = localStorage.getItem("nxs_logo_url");
      if (storedLogo) setLogoUrl(storedLogo);

      const storedAccent = localStorage.getItem("nxs_accent_color") || "gold";
      const storedFont = localStorage.getItem("nxs_font_family") || "sans";
      const storedScale = localStorage.getItem("nxs_font_scale") || "normal";
      const storedDensity = localStorage.getItem("nxs_table_density") || "comfortable";

      applyAppearanceTheme({
        accentColor: storedAccent,
        fontFamily: storedFont,
        fontScale: storedScale,
        tableDensity: storedDensity,
      });
    } catch {
      // ignore
    }

    // 2. Fetch app_settings from Supabase
    const supabase = createClient();
    supabase
      .from("app_settings")
      .select("spa_name, logo_url, accent_color, font_family, font_scale, table_density")
      .limit(1)
      .maybeSingle()
      .then(
        ({ data }) => {
          if (data) {
            const row = data as any;
            if (row.spa_name) {
              setSpaName(row.spa_name);
              localStorage.setItem("nxs_spa_name", row.spa_name);
            }
            if (row.logo_url !== undefined) {
              setLogoUrl(row.logo_url);
              if (row.logo_url) localStorage.setItem("nxs_logo_url", row.logo_url);
              else localStorage.removeItem("nxs_logo_url");
            }
            applyAppearanceTheme({
              accentColor: row.accent_color || localStorage.getItem("nxs_accent_color") || "gold",
              fontFamily: row.font_family || localStorage.getItem("nxs_font_family") || "sans",
              fontScale: row.font_scale || localStorage.getItem("nxs_font_scale") || "normal",
              tableDensity: row.table_density || localStorage.getItem("nxs_table_density") || "comfortable",
            });
          }
        },
        () => {
          // Ignore network errors
        }
      );

    // 3. Event listeners for instant client-side reactivity
    const handleBrandingChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.spaName !== undefined) setSpaName(detail.spaName);
      if (detail?.logoUrl !== undefined) setLogoUrl(detail.logoUrl);
    };

    const handleAppearanceChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) applyAppearanceTheme(detail);
    };

    window.addEventListener("nxs-branding-change", handleBrandingChange);
    window.addEventListener("nxs-appearance-change", handleAppearanceChange);

    // Watch for light/dark theme switch to adjust accent color brightness
    const observer = new MutationObserver(() => {
      const currentAccent = localStorage.getItem("nxs_accent_color") || "gold";
      applyAppearanceTheme({ accentColor: currentAccent });
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    return () => {
      window.removeEventListener("nxs-branding-change", handleBrandingChange);
      window.removeEventListener("nxs-appearance-change", handleAppearanceChange);
      observer.disconnect();
    };
  }, []);

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
        <div className="px-5 py-6 border-b border-border flex items-center gap-2.5 min-w-0">
          {logoUrl ? (
            // Using standard img tag so external or Supabase Storage image URLs load seamlessly
            // without Next.js domain whitelist errors
            <img
              src={logoUrl}
              alt={spaName}
              className="w-7 h-7 rounded-sm object-cover shrink-0 border border-border/50"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/logo.jpeg";
              }}
            />
          ) : (
            <Image src="/logo.jpeg" alt={spaName} width={28} height={28} className="rounded-sm shrink-0" />
          )}
          <span className="flex-1 text-lg font-semibold tracking-wide text-gold truncate">
            {spaName}
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
            <div className="space-y-2">
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
              <Link
                href="/my-profile"
                onClick={() => setIsOpen(false)}
                className="block text-center rounded-md border border-border px-2.5 py-2 text-[11px] text-muted hover:text-foreground hover:bg-white/5"
              >
                My Profile
              </Link>
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
