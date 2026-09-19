export const navItems = [
  { href: "/bookings", label: "Bookings" },
  { href: "/call-sheet", label: "Call Sheet" },
  { href: "/therapists", label: "Therapists" },
  { href: "/lockers", label: "Lockers" },
  { href: "/sales", label: "Sales" },
  { href: "/clients", label: "Clients" },
  { href: "/analytics", label: "Analytics", ownerOnly: true },
  { href: "/staff", label: "Staff", ownerOnly: true },
  { href: "/logs", label: "Logs", ownerOnly: true },
  { href: "/settings", label: "Settings" },
] as const;
