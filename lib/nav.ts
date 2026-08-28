export const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/bookings", label: "Bookings" },
  { href: "/sales", label: "Sales" },
  { href: "/therapists", label: "Therapists" },
  { href: "/lockers", label: "Lockers" },
  { href: "/call-sheet", label: "Call Sheet" },
  { href: "/analytics", label: "Analytics", ownerOnly: true },
  { href: "/staff", label: "Staff", ownerOnly: true },
  { href: "/logs", label: "Logs", ownerOnly: true },
  { href: "/settings", label: "Settings" },
] as const;
