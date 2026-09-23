"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

function peso(n: number): string {
  return `₱${Math.round(n).toLocaleString("en-PH")}`;
}

function formatCutoffShort(startStr: string, endStr: string): string {
  if (!startStr || !endStr) return `${startStr} – ${endStr}`;
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return `${startStr} – ${endStr}`;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const sMonth = months[sm - 1];
  const eMonth = months[em - 1];
  const sDay = String(sd).padStart(2, "0");
  const eDay = String(ed).padStart(2, "0");
  if (sy === ey && sm === em) {
    return `${sMonth} ${sDay} – ${eDay}`;
  }
  if (sy === ey) {
    return `${sMonth} ${sDay} – ${eMonth} ${eDay}`;
  }
  return `${sMonth} ${sDay}, ${sy} – ${eMonth} ${eDay}, ${ey}`;
}

function formatClaimedDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCutoffWithYear(startStr: string, endStr: string): string {
  if (!startStr || !endStr) return `${startStr} – ${endStr}`;
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return `${startStr} – ${endStr}`;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const sMonth = months[sm - 1];
  const eMonth = months[em - 1];
  const sDay = String(sd).padStart(2, "0");
  const eDay = String(ed).padStart(2, "0");
  if (sy === ey && sm === em) {
    return `${sMonth} ${sDay} – ${eDay}, ${sy}`;
  }
  if (sy === ey) {
    return `${sMonth} ${sDay} – ${eMonth} ${eDay}, ${sy}`;
  }
  return `${sMonth} ${sDay}, ${sy} – ${eMonth} ${eDay}, ${ey}`;
}

function formatDisbursedDate(iso: string | null): string {
  if (!iso) return "Claimed";
  const d = new Date(iso);
  const m = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Disbursed ${m}`;
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

type DisbursementRecord = {
  id: string;
  period_start: string;
  period_end: string;
  total_bookings: number;
  gross_commission: number;
  deductions: number;
  net_payout: number;
  payment_method: "cash" | "gcash";
  status: "unclaimed" | "claimed";
  notes: string | null;
  disbursed_at: string | null;
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
  const [disbursements, setDisbursements] = useState<DisbursementRecord[]>([]);
  const [selectedDisbursement, setSelectedDisbursement] = useState<DisbursementRecord | null>(null);

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

        // 4. Fetch disbursement records for this therapist
        const { data: payoutsData } = await supabase
          .from("commission_payouts")
          .select("id, period_start, period_end, total_bookings, gross_commission, deductions, net_payout, payment_method, status, notes, disbursed_at")
          .eq("therapist_id", therapistId)
          .eq("status", "claimed")
          .order("disbursed_at", { ascending: false })
          .limit(6);

        if (!cancelled && payoutsData) {
          setDisbursements(
            payoutsData.map((p) => ({
              id: p.id,
              period_start: p.period_start,
              period_end: p.period_end,
              total_bookings: Number(p.total_bookings),
              gross_commission: Number(p.gross_commission),
              deductions: Number(p.deductions),
              net_payout: Number(p.net_payout),
              payment_method: (p.payment_method === "gcash" ? "gcash" : "cash") as "cash" | "gcash",
              status: p.status as "unclaimed" | "claimed",
              notes: p.notes,
              disbursed_at: p.disbursed_at,
            }))
          );
        }
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

          {/* Disbursement / Claim History */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-2.5">
              DISBURSEMENT / CLAIM HISTORY
            </h3>
            {loading ? (
              <div className="text-xs text-muted">Loading disbursement history...</div>
            ) : disbursements.length === 0 ? (
              <div className="rounded-lg border border-border bg-background/50 p-3 text-xs text-muted">
                No disbursement records found for this therapist.
              </div>
            ) : (
              <div className="space-y-2">
                {disbursements.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border bg-background p-3 space-y-2"
                  >
                    {/* Card Top Row: Cutoff period + Channel badge + [ 📄 Slip ] button */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="font-mono text-xs font-bold text-foreground">
                          {formatCutoffWithYear(item.period_start, item.period_end)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium text-muted">
                          {item.payment_method === "gcash" ? "📱 GCash" : "💵 Cash"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedDisbursement(item)}
                        title="View disbursement voucher"
                        aria-label="View disbursement details"
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-[10.5px] font-semibold text-muted hover:border-gold hover:text-accent-gold transition shrink-0"
                      >
                        <span>📄</span>
                        <span>Slip</span>
                      </button>
                    </div>

                    {/* Card Bottom Row: Claimed date + bold amber Net Handed amount, with -₱X Vale indicator if deductions exist */}
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/40">
                      <div className="text-[11px] text-muted">
                        {formatDisbursedDate(item.disbursed_at)}
                      </div>
                      <div className="text-right flex items-baseline gap-1.5">
                        {item.deductions > 0 && (
                          <span className="text-[11px] text-red-400 font-mono font-medium">
                            -{peso(item.deductions)} Vale
                          </span>
                        )}
                        <span className="font-mono text-sm font-bold text-amber-400">
                          {peso(item.net_payout)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
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

      {/* Disbursement Voucher Slip Modal */}
      {selectedDisbursement && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setSelectedDisbursement(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-stone-800 bg-stone-950 p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white font-mono">
                  Disbursement Voucher
                </h2>
                <p className="text-[11px] text-stone-400 font-sans">
                  Official Claim Record
                </p>
              </div>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                Claimed
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-stone-800/60">
                <span className="text-stone-400 font-sans">Therapist:</span>
                <span className="font-bold text-white">{therapistName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-800/60">
                <span className="text-stone-400 font-sans">Cutoff Window:</span>
                <span className="text-stone-200">
                  {formatCutoffShort(selectedDisbursement.period_start, selectedDisbursement.period_end)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-800/60">
                <span className="text-stone-400 font-sans">Completed Sessions:</span>
                <span className="text-stone-200">{selectedDisbursement.total_bookings}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-800/60">
                <span className="text-stone-400 font-sans">Gross Commission:</span>
                <span className="text-stone-200">{peso(selectedDisbursement.gross_commission)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-800/60">
                <span className="text-stone-400 font-sans">Vale / Deductions:</span>
                <span className="text-red-400">-{peso(selectedDisbursement.deductions)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-stone-800/60 items-center">
                <span className="text-stone-300 font-semibold font-sans">Net Disbursed:</span>
                <span className="font-bold text-base text-amber-400">{peso(selectedDisbursement.net_payout)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-800/60">
                <span className="text-stone-400 font-sans">Payment Method:</span>
                <span className="text-stone-200">
                  {selectedDisbursement.payment_method === "gcash" ? "GCash" : "Cash"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-800/60">
                <span className="text-stone-400 font-sans">Claimed Date:</span>
                <span className="text-stone-200 text-[11px]">
                  {formatClaimedDate(selectedDisbursement.disbursed_at)}
                </span>
              </div>
              {selectedDisbursement.notes && (
                <div className="pt-1">
                  <span className="text-stone-400 font-sans block mb-1 text-[11px]">Notes:</span>
                  <div className="rounded-lg border border-stone-800 bg-stone-900/60 p-2 text-stone-200 text-[11px]">
                    {selectedDisbursement.notes}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSelectedDisbursement(null)}
                className="w-full rounded-xl border border-stone-800 bg-stone-900 py-2 text-xs font-bold text-stone-200 hover:bg-stone-800 transition"
              >
                Close Slip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
