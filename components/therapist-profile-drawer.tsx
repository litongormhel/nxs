"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

function peso(n: number): string {
  return `₱${Math.round(n).toLocaleString("en-PH")}`;
}

export type TherapistProfileDrawerProps = {
  therapistId: string;
  therapistName: string;
  therapistArchived?: boolean;
  cutoffRank?: number | null;
  currentCutoff?: { start: string; end: string };
  currentCutoffBookings?: number;
  currentCutoffCommission?: number;
  currentCutoffStatus?: "claimed" | "unclaimed";
  onClose: () => void;
};

type QualifiedService = {
  id: string;
  name: string;
  price: number;
};

type SukiClient = {
  codename: string;
  bookingCount: number;
  preferredService: string;
};

type MonthlyStats = {
  monthKey: string;
  monthLabel: string;
  bookingsCount: number;
  commission: number;
};

export function TherapistProfileDrawer({
  therapistId,
  therapistName,
  therapistArchived,
  cutoffRank,
  currentCutoff,
  currentCutoffBookings = 0,
  currentCutoffCommission = 0,
  currentCutoffStatus = "unclaimed",
  onClose,
}: TherapistProfileDrawerProps) {
  const [loading, setLoading] = useState(true);
  const [qualifiedServices, setQualifiedServices] = useState<QualifiedService[]>([]);
  const [sukiClients, setSukiClients] = useState<SukiClient[]>([]);
  const [monthlyHistory, setMonthlyHistory] = useState<MonthlyStats[]>([]);
  const [lifetimeBookings, setLifetimeBookings] = useState<number>(0);
  const [lifetimeEarnings, setLifetimeEarnings] = useState<number>(0);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    async function loadTherapistDetails() {
      setLoading(true);
      const supabase = createClient();

      try {
        // 1. Fetch qualified services
        const { data: qServices } = await supabase
          .from("therapist_services")
          .select("service_id, services(id, name, price)")
          .eq("therapist_id", therapistId);

        if (!cancelled && qServices) {
          const list: QualifiedService[] = [];
          for (const item of qServices) {
            // handle single or array join result
            const s = Array.isArray(item.services) ? item.services[0] : item.services;
            if (s) {
              list.push({
                id: s.id,
                name: s.name,
                price: Number(s.price),
              });
            }
          }
          setQualifiedServices(list.sort((a, b) => a.name.localeCompare(b.name)));
        }

        // 2. Fetch all commission rates
        const { data: ratesData } = await supabase
          .from("commission_rates")
          .select("service_id, percent, rate_type, is_active");

        const rateMap = new Map<string, { percent: number; rateType: string }>();
        for (const r of ratesData ?? []) {
          if (r.is_active || !rateMap.has(r.service_id)) {
            rateMap.set(r.service_id, {
              percent: Number(r.percent),
              rateType: r.rate_type ?? "percent",
            });
          }
        }

        // 3. Fetch lifetime completed bookings for this therapist
        const { data: bookingsData } = await supabase
          .from("bookings")
          .select("id, booking_date, service_id, client_id, guest_label, status, services(id, name, price), clients(id, codename)")
          .eq("therapist_id", therapistId)
          .in("status", ["Booked", "Completed"]);

        if (cancelled) return;

        const bookings = bookingsData ?? [];
        setLifetimeBookings(bookings.length);

        // Helper to compute commission for a booking
        function calcCommission(serviceId: string, price: number): number {
          const rate = rateMap.get(serviceId);
          if (!rate) return 0;
          if (rate.rateType === "flat") return rate.percent;
          return (price * rate.percent) / 100;
        }

        // Calculate lifetime earnings & monthly breakdown
        let totalEarnings = 0;
        const monthMap = new Map<string, { bookings: number; commission: number }>();
        const clientBookingMap = new Map<string, { codename: string; count: number; services: Map<string, number> }>();

        for (const b of bookings) {
          const s = Array.isArray(b.services) ? b.services[0] : b.services;
          const price = s ? Number(s.price) : 0;
          const comm = s ? calcCommission(s.id, price) : 0;
          totalEarnings += comm;

          // Month key (YYYY-MM)
          if (b.booking_date) {
            const mKey = b.booking_date.substring(0, 7);
            const curr = monthMap.get(mKey) ?? { bookings: 0, commission: 0 };
            curr.bookings += 1;
            curr.commission += comm;
            monthMap.set(mKey, curr);
          }

          // Client aggregation for suki
          const c = Array.isArray(b.clients) ? b.clients[0] : b.clients;
          const clientIdentifier = b.client_id || b.guest_label || "Walk-in Guest";
          const clientName = c?.codename || b.guest_label || "Walk-in Guest";
          const serviceName = s?.name || "Massage";

          const clientEntry = clientBookingMap.get(clientIdentifier) ?? {
            codename: clientName,
            count: 0,
            services: new Map<string, number>(),
          };
          clientEntry.count += 1;
          clientEntry.services.set(serviceName, (clientEntry.services.get(serviceName) ?? 0) + 1);
          clientBookingMap.set(clientIdentifier, clientEntry);
        }

        setLifetimeEarnings(totalEarnings);

        // Prepare monthly history: last 6 months descending
        const sortedMonths = Array.from(monthMap.keys()).sort().reverse().slice(0, 6);
        const monthlyList: MonthlyStats[] = sortedMonths.map((mKey) => {
          const [yr, mo] = mKey.split("-");
          const date = new Date(Number(yr), Number(mo) - 1, 1);
          const monthLabel = date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
          const stats = monthMap.get(mKey)!;
          return {
            monthKey: mKey,
            monthLabel,
            bookingsCount: stats.bookings,
            commission: stats.commission,
          };
        });
        setMonthlyHistory(monthlyList);

        // Prepare Suki Clients: top 4 sorted by booking count
        const sukiList: SukiClient[] = Array.from(clientBookingMap.values())
          .filter((cl) => cl.codename !== "Walk-in Guest")
          .sort((a, b) => b.count - a.count)
          .slice(0, 4)
          .map((cl) => {
            // Find most availed service
            let topService = "Massage";
            let topCount = 0;
            cl.services.forEach((count, svc) => {
              if (count > topCount) {
                topCount = count;
                topService = svc;
              }
            });
            return {
              codename: cl.codename,
              bookingCount: cl.count,
              preferredService: topService,
            };
          });

        setSukiClients(sukiList);
      } catch (err) {
        console.error("Failed to load therapist profile drawer data:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTherapistDetails();

    return () => {
      cancelled = true;
    };
  }, [therapistId]);

  // Dynamic Rank Badge
  const rankBadge = useMemo(() => {
    if (!cutoffRank) return null;
    if (cutoffRank === 1) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-400">
          🏆 Top 1 Therapist
        </span>
      );
    }
    if (cutoffRank === 2) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-400/40 bg-slate-400/10 px-2.5 py-0.5 text-[11px] font-bold text-slate-300">
          🥈 Top 2 Therapist
        </span>
      );
    }
    if (cutoffRank === 3) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-700/40 bg-amber-700/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-600">
          🥉 Top 3 Therapist
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] font-semibold text-muted">
        Rank #{cutoffRank} in Bookings
      </span>
    );
  }, [cutoffRank]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in Drawer */}
      <div className="relative z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface/95 px-6 py-4 backdrop-blur">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">{therapistName}</h2>
              {therapistArchived ? (
                <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-400">
                  Archived
                </span>
              ) : (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  Active Thera
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2">
              {rankBadge}
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:border-gold hover:text-foreground transition"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 space-y-6 p-6">
          {/* Lifetime & Current Metrics */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-3">
              Performance & Earnings
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Current Cutoff */}
              <div className="rounded-xl border border-border bg-background p-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted font-medium">Current Cutoff</span>
                    {currentCutoffStatus === "claimed" ? (
                      <span className="text-[10px] font-bold text-emerald-400">Claimed</span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-400">Unclaimed</span>
                    )}
                  </div>
                  <div className="mt-2 text-xl font-bold font-mono text-accent-gold">
                    {peso(currentCutoffCommission)}
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-muted">
                  {currentCutoffBookings} completed session{currentCutoffBookings === 1 ? "" : "s"}
                </div>
              </div>

              {/* Total Lifetime */}
              <div className="rounded-xl border border-border bg-background p-3.5 flex flex-col justify-between">
                <div>
                  <span className="text-[11px] text-muted font-medium">Lifetime Earnings</span>
                  <div className="mt-2 text-xl font-bold font-mono text-foreground">
                    {loading ? "..." : peso(lifetimeEarnings)}
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-muted">
                  {loading ? "..." : `${lifetimeBookings} lifetime booking${lifetimeBookings === 1 ? "" : "s"}`}
                </div>
              </div>
            </div>
          </div>

          {/* Qualified Services */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-2.5">
              Qualified Services
            </h3>
            {loading ? (
              <div className="text-xs text-muted">Loading qualified services...</div>
            ) : qualifiedServices.length === 0 ? (
              <div className="rounded-lg border border-border bg-background/50 p-3 text-xs text-muted">
                No specific certified services assigned.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {qualifiedServices.map((svc) => (
                  <span
                    key={svc.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground"
                  >
                    <span>✓</span>
                    <span>{svc.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Monthly Commission History */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-2.5">
              Monthly Commission History
            </h3>
            {loading ? (
              <div className="text-xs text-muted">Loading monthly history...</div>
            ) : monthlyHistory.length === 0 ? (
              <div className="rounded-lg border border-border bg-background/50 p-3 text-xs text-muted">
                No monthly booking history available.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-background">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] text-muted bg-surface/50">
                      <th className="px-3 py-2 font-semibold">Month</th>
                      <th className="px-3 py-2 font-semibold text-center">Sessions</th>
                      <th className="px-3 py-2 font-semibold text-right">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyHistory.map((m) => (
                      <tr key={m.monthKey} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2.5 font-medium text-foreground">{m.monthLabel}</td>
                        <td className="px-3 py-2.5 text-center text-muted font-mono">{m.bookingsCount}</td>
                        <td className="px-3 py-2.5 text-right font-bold font-mono text-accent-gold">
                          {peso(m.commission)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top Regular / Suki Clients */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-2.5">
              Top Regular / Suki Clients
            </h3>
            {loading ? (
              <div className="text-xs text-muted">Loading client favorites...</div>
            ) : sukiClients.length === 0 ? (
              <div className="rounded-lg border border-border bg-background/50 p-3 text-xs text-muted">
                No regular client bookings yet.
              </div>
            ) : (
              <div className="space-y-2">
                {sukiClients.map((client) => (
                  <div
                    key={client.codename}
                    className="flex items-center justify-between rounded-xl border border-border bg-background p-3"
                  >
                    <div>
                      <div className="text-xs font-bold text-foreground">
                        {client.codename}
                      </div>
                      <div className="text-[11px] text-muted">
                        Favorite: <span className="text-gold font-medium">{client.preferredService}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="rounded-full bg-gold/15 px-2 py-0.5 font-mono text-[11px] font-bold text-accent-gold">
                        {client.bookingCount} visit{client.bookingCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-surface p-4 text-center">
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-border bg-background py-2 text-xs font-bold text-foreground hover:bg-surface transition"
          >
            Close Profile
          </button>
        </div>
      </div>
    </div>
  );
}
