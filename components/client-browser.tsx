"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogVisitModal } from "@/components/log-visit-modal";

export type Client = {
  id: string;
  codename: string;
  username: string;
  member_code: string;
  points_balance: number;
  since_date: string;
  phone?: string | null;
  qr_token?: string | null;
  has_portal_account: boolean;
};

export type WalkInVisit = {
  id: string;
  guest_label: string;
  booking_date: string;
  start_time: string;
  room_number?: number | null;
  status: string;
  created_at: string;
  service_name: string | null;
  therapist_name: string | null;
  locker_number: number | null;
  amount: number | null;
  payment_method: string | null;
};

export type MemberVisit = {
  id: string;
  client_id: string;
  date: string;
  time: string | null;
  service_name: string | null;
  therapist_name: string | null;
  locker_number: number | null;
  amount: number | null;
  payment_method: string | null;
  points_delta: number;
  entry_type: string;
  created_at: string;
};

type Service = {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  points_earned: number;
};
type Staff = { id: string; name: string; position: string };

type Therapist = { id: string; name: string };
type Promo = { id: string; label: string; discount: number };
type Addon = { id: string; name: string; price: number };

type GroupedWalkIn = {
  codename: string;
  visitCount: number;
  lastVisitDate: string;
  latestVisit: WalkInVisit;
  visits: WalkInVisit[];
};

function formatSinceDate(iso: string) {
  if (!iso) return "N/A";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDisplayDate(dateStr: string) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00"));
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(timeStr: string | null | undefined) {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return timeStr;

  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// QR-code renderer using a free API
function QRImage({ value, size = 160 }: { value: string; size?: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(value)}&size=${size}x${size}&margin=8&bgcolor=1a1a1a&color=c89b3c`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="QR Code" width={size} height={size} className="rounded-lg" />
  );
}

export function ClientBrowser({
  clients = [],
  walkInVisits = [],
  memberTransactions = [],
  memberBookings = [],
  services = [],
  staff = [],
  therapists = [],
  promos = [],
  addons = [],
  lockers = [],
  clientLockerMap: initialLockerMap = {},
}: {
  clients?: Client[];
  walkInVisits?: WalkInVisit[];
  memberTransactions?: any[];
  memberBookings?: any[];
  services?: Service[];
  staff?: Staff[];
  therapists?: Therapist[];
  promos?: Promo[];
  addons?: Addon[];
  lockers?: number[];
  clientLockerMap?: Record<string, number>;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"members" | "walkins">("members");
  const [search, setSearch] = useState("");

  // Pagination states
  const [membersPageSize, setMembersPageSize] = useState<number>(10);
  const [membersCurrentPage, setMembersCurrentPage] = useState<number>(1);

  const [walkInsPageSize, setWalkInsPageSize] = useState<number>(10);
  const [walkInsCurrentPage, setWalkInsCurrentPage] = useState<number>(1);

  // Modal states for Members
  const [selectedMemberForProfile, setSelectedMemberForProfile] = useState<Client | null>(null);
  const [selectedMemberForHistory, setSelectedMemberForHistory] = useState<{
    client: Client;
    visits: MemberVisit[];
  } | null>(null);

  // Modal state for Walk-In history drawer
  const [selectedWalkInCodename, setSelectedWalkInCodename] = useState<string | null>(null);

  // Log visit modal state
  const [showLogVisit, setShowLogVisit] = useState(false);
  const [logVisitClient, setLogVisitClient] = useState<Client | null>(null);

  // Live locker map (updated by realtime)
  const [lockerMap, setLockerMap] = useState<Record<string, number>>(initialLockerMap);

  // Reset pagination when search or page sizes change
  useEffect(() => {
    setMembersCurrentPage(1);
    setWalkInsCurrentPage(1);
  }, [search, membersPageSize, walkInsPageSize]);

  // Aggregate member visits from point_transactions and memberBookings
  const memberVisitsMap = useMemo(() => {
    const map = new Map<string, MemberVisit[]>();
    const txBookingIds = new Set<string>();

    for (const tx of memberTransactions) {
      if (!tx.client_id) continue;
      if (tx.booking_id) txBookingIds.add(tx.booking_id);

      const sale = Array.isArray(tx.sales) ? tx.sales[0] : tx.sales;
      const booking = Array.isArray(tx.bookings) ? tx.bookings[0] : tx.bookings;
      const bkLocker = booking?.locker_occupancy
        ? Array.isArray(booking.locker_occupancy)
          ? booking.locker_occupancy[0]?.locker_number
          : booking.locker_occupancy.locker_number
        : null;

      let serviceName: string | null =
        sale?.services?.name ?? booking?.services?.name ?? null;

      if (!serviceName && tx.notes) {
        if (tx.notes.startsWith("Visit: ")) {
          serviceName = tx.notes.replace("Visit: ", "");
        } else if (tx.notes.startsWith("Redemption: ")) {
          serviceName = tx.notes.replace("Redemption: ", "");
        } else {
          serviceName = tx.notes;
        }
      }

      const therapistName: string | null =
        sale?.therapists?.name ?? booking?.therapists?.name ?? null;

      const date =
        booking?.booking_date ??
        (tx.created_at ? tx.created_at.split("T")[0] : "");
      const time =
        booking?.start_time ??
        (tx.created_at ? tx.created_at.split("T")[1]?.slice(0, 5) : null);

      const visit: MemberVisit = {
        id: tx.id,
        client_id: tx.client_id,
        date,
        time,
        service_name: serviceName,
        therapist_name: therapistName,
        locker_number: bkLocker ?? null,
        amount: sale?.amount ?? null,
        payment_method: sale?.payment_method ?? null,
        points_delta: tx.points_delta ?? 0,
        entry_type: tx.entry_type ?? "VISIT",
        created_at: tx.created_at,
      };

      const existing = map.get(tx.client_id) ?? [];
      existing.push(visit);
      map.set(tx.client_id, existing);
    }

    for (const bk of memberBookings) {
      if (!bk.client_id || txBookingIds.has(bk.id)) continue;

      const svc = Array.isArray(bk.services) ? bk.services[0] : bk.services;
      const thera = Array.isArray(bk.therapists) ? bk.therapists[0] : bk.therapists;
      const sale = Array.isArray(bk.sales) ? bk.sales[0] : bk.sales;
      const occ = Array.isArray(bk.locker_occupancy) ? bk.locker_occupancy[0] : bk.locker_occupancy;

      const visit: MemberVisit = {
        id: bk.id,
        client_id: bk.client_id,
        date: bk.booking_date,
        time: bk.start_time,
        service_name: svc?.name ?? null,
        therapist_name: thera?.name ?? null,
        locker_number: occ?.locker_number ?? null,
        amount: sale?.amount ?? null,
        payment_method: sale?.payment_method ?? null,
        points_delta: 0,
        entry_type: bk.status ?? "Booked",
        created_at: bk.created_at,
      };

      const existing = map.get(bk.client_id) ?? [];
      existing.push(visit);
      map.set(bk.client_id, existing);
    }

    // Sort member visits descending by created_at / date
    map.forEach((visits) => {
      visits.sort((a, b) => {
        const timeA = new Date(a.created_at || a.date).getTime();
        const timeB = new Date(b.created_at || b.date).getTime();
        return timeB - timeA;
      });
    });

    return map;
  }, [memberTransactions, memberBookings]);

  // Filter clients for search (by codename, phone, or username)
  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) =>
      c.codename.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q) ||
      (c.phone && c.phone.toLowerCase().includes(q))
    );
  }, [clients, search]);

  // Paginated Members calculations
  const totalMembers = filteredClients.length;
  const totalMembersPages = Math.ceil(totalMembers / membersPageSize) || 1;
  const membersStartIndex = (membersCurrentPage - 1) * membersPageSize;
  const paginatedMembers = useMemo(() => {
    return filteredClients.slice(membersStartIndex, membersStartIndex + membersPageSize);
  }, [filteredClients, membersStartIndex, membersPageSize]);

  // Aggregate non-member walk-ins by codename
  const groupedWalkIns = useMemo(() => {
    const map = new Map<string, WalkInVisit[]>();
    for (const visit of walkInVisits) {
      const key = visit.guest_label.trim();
      const existing = map.get(key) ?? [];
      existing.push(visit);
      map.set(key, existing);
    }

    const result: GroupedWalkIn[] = [];
    map.forEach((visits, codename) => {
      const sorted = [...visits].sort((a, b) => {
        const dateA = new Date(`${a.booking_date}T${a.start_time || "00:00:00"}`).getTime();
        const dateB = new Date(`${b.booking_date}T${b.start_time || "00:00:00"}`).getTime();
        return dateB - dateA;
      });

      result.push({
        codename,
        visitCount: sorted.length,
        lastVisitDate: sorted[0].booking_date,
        latestVisit: sorted[0],
        visits: sorted,
      });
    });

    return result.sort((a, b) => {
      const dateA = new Date(a.lastVisitDate).getTime();
      const dateB = new Date(b.lastVisitDate).getTime();
      return dateB - dateA;
    });
  }, [walkInVisits]);

  // Filter walk-ins for search (by codename or date)
  const filteredWalkIns = useMemo(() => {
    if (!search.trim()) return groupedWalkIns;
    const q = search.toLowerCase();
    return groupedWalkIns.filter((g) => {
      if (g.codename.toLowerCase().includes(q)) return true;
      return g.visits.some(
        (v) =>
          v.booking_date.toLowerCase().includes(q) ||
          formatDisplayDate(v.booking_date).toLowerCase().includes(q)
      );
    });
  }, [groupedWalkIns, search]);

  // Paginated Walk-In slice calculations
  const totalWalkIns = filteredWalkIns.length;
  const totalWalkInPages = Math.ceil(totalWalkIns / walkInsPageSize) || 1;
  const walkInsStartIndex = (walkInsCurrentPage - 1) * walkInsPageSize;
  const paginatedWalkIns = useMemo(() => {
    return filteredWalkIns.slice(walkInsStartIndex, walkInsStartIndex + walkInsPageSize);
  }, [filteredWalkIns, walkInsStartIndex, walkInsPageSize]);

  // Selected Walk-In drawer record
  const activeWalkInGroup = useMemo(() => {
    if (!selectedWalkInCodename) return null;
    return groupedWalkIns.find((g) => g.codename === selectedWalkInCodename) ?? null;
  }, [groupedWalkIns, selectedWalkInCodename]);

  // Realtime: subscribe to locker_occupancy changes so locker badges update live
  useEffect(() => {
    const supabase = createClient();

    function rebuildMap() {
      supabase
        .from("locker_occupancy")
        .select("client_id, locker_number")
        .is("checked_out_at", null)
        .not("client_id", "is", null)
        .then(({ data }) => {
          const map: Record<string, number> = {};
          for (const row of data ?? []) {
            if (row.client_id) map[row.client_id] = row.locker_number;
          }
          setLockerMap(map);
        });
    }

    const channel = supabase
      .channel("locker_occupancy_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "locker_occupancy" },
        () => rebuildMap()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="mt-6 flex flex-col gap-5">
      {/* Top-level tab switcher */}
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => {
            setActiveTab("members");
            setSearch("");
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === "members"
              ? "border-gold text-gold"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          <span>Members</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              activeTab === "members"
                ? "bg-gold/20 text-gold"
                : "bg-surface-accent text-muted"
            }`}
          >
            {clients.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("walkins");
            setSearch("");
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === "walkins"
              ? "border-gold text-gold"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          <span>Walk-In Without Account</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              activeTab === "walkins"
                ? "bg-gold/20 text-gold"
                : "bg-surface-accent text-muted"
            }`}
          >
            {groupedWalkIns.length}
          </span>
        </button>
      </div>

      {/* Search bar */}
      <div className="relative max-w-sm">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            activeTab === "members"
              ? "Search by codename, phone, or @username..."
              : "Search by guest codename (e.g. Wax, Marky) or date..."
          }
          className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted focus:border-gold/50 focus:outline-none"
        />
      </div>

      {/* MEMBERS TAB */}
      {activeTab === "members" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              Registered Member Accounts ({filteredClients.length})
            </p>
          </div>

          {filteredClients.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted">
              {search.trim() ? "No members match your search." : "No registered member accounts currently on file."}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-border bg-surface">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-3">Member</th>
                      <th className="px-4 py-3">Username</th>
                      <th className="px-4 py-3">Member Since</th>
                      <th className="px-4 py-3">Points</th>
                      <th className="px-4 py-3">Total Visits</th>
                      <th className="px-4 py-3">Latest Service</th>
                      <th className="px-4 py-3">Latest Therapist</th>
                      <th className="px-4 py-3 text-right">Actions / Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-foreground">
                    {paginatedMembers.map((client) => {
                      const locker = lockerMap[client.id];
                      const visits = memberVisitsMap.get(client.id) ?? [];
                      const visitCount = visits.length;
                      const latest = visits[0];
                      const latestService = latest?.service_name ?? null;
                      const latestTherapist = latest?.therapist_name ?? null;

                      return (
                        <tr
                          key={client.id}
                          className="hover:bg-gold/5 transition-colors"
                        >
                          <td className="px-4 py-3 font-semibold text-gold">
                            <div className="flex items-center gap-2">
                              <span>{client.codename}</span>
                              {locker !== undefined && (
                                <span className="rounded border border-gold/50 bg-gold/10 px-1.5 py-0.5 text-[10px] font-semibold text-gold">
                                  Locker {locker}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span className="rounded bg-surface-accent px-2 py-0.5 font-mono text-xs text-foreground">
                              @{client.username}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted">
                            {formatSinceDate(client.since_date)}
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-gold">
                            {client.points_balance} pts
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span className="rounded bg-surface-accent px-2 py-0.5 font-mono text-[11px] font-medium text-foreground">
                              {visitCount} visit{visitCount !== 1 ? "s" : ""}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium">
                            {latestService ?? <span className="text-muted italic">None</span>}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {latestTherapist ?? <span className="text-muted italic">Unassigned</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-xs">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedMemberForProfile(client)}
                                className="rounded border border-border bg-surface px-2.5 py-1 font-medium text-gold hover:border-gold/40 hover:bg-gold/10 transition-colors cursor-pointer"
                              >
                                View Profile →
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedMemberForHistory({ client, visits })}
                                className="rounded border border-gold/40 bg-gold/10 px-2.5 py-1 font-medium text-gold hover:bg-gold/20 transition-colors cursor-pointer"
                              >
                                View Past Stays →
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Members Pagination Controls Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4 text-sm">
                <div className="text-xs text-muted">
                  Showing <span className="font-medium text-foreground">{membersStartIndex + 1}</span>–
                  <span className="font-medium text-foreground">
                    {Math.min(membersStartIndex + membersPageSize, totalMembers)}
                  </span>{" "}
                  of <span className="font-medium text-foreground">{totalMembers}</span> members
                </div>

                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">Rows per page:</span>
                    <select
                      value={membersPageSize}
                      onChange={(e) => setMembersPageSize(Number(e.target.value))}
                      className="rounded-md border border-[#292524] bg-[#141210] px-2.5 py-1 text-xs text-[#f5f5f4] focus:border-gold/50 focus:outline-none"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={membersCurrentPage <= 1}
                      onClick={() => setMembersCurrentPage((p) => Math.max(1, p - 1))}
                      className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:border-gold/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-muted">
                      Page <span className="font-medium text-foreground">{membersCurrentPage}</span> of{" "}
                      <span className="font-medium text-foreground">{totalMembersPages}</span>
                    </span>
                    <button
                      type="button"
                      disabled={membersCurrentPage >= totalMembersPages}
                      onClick={() => setMembersCurrentPage((p) => Math.min(totalMembersPages, p + 1))}
                      className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:border-gold/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* WALK-IN WITHOUT ACCOUNT TAB */}
      {activeTab === "walkins" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              Non-Account Walk-In Guests ({filteredWalkIns.length})
            </p>
            <p className="text-xs text-muted">
              Duplicate guest codenames are preserved independently without identity merge.
            </p>
          </div>

          {filteredWalkIns.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted">
              {search.trim() ? "No walk-in guests match your search." : "No walk-in guest records found."}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-border bg-surface">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-3">Codename</th>
                      <th className="px-4 py-3">Last Visit Date</th>
                      <th className="px-4 py-3">Total Visits</th>
                      <th className="px-4 py-3">Latest Service</th>
                      <th className="px-4 py-3">Latest Therapist</th>
                      <th className="px-4 py-3">Locker</th>
                      <th className="px-4 py-3">Amount Paid</th>
                      <th className="px-4 py-3 text-right">History</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-foreground">
                    {paginatedWalkIns.map((g) => {
                      const latest = g.latestVisit;
                      const displayLocker =
                        latest.locker_number ??
                        g.visits.find((v) => v.locker_number != null)?.locker_number ??
                        null;

                      return (
                        <tr
                          key={g.codename}
                          className="hover:bg-gold/5 transition-colors cursor-pointer"
                          onClick={() => setSelectedWalkInCodename(g.codename)}
                        >
                          <td className="px-4 py-3 font-semibold text-gold">
                            {g.codename}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted">
                            {formatDisplayDate(g.lastVisitDate)}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span className="rounded bg-surface-accent px-2 py-0.5 font-mono text-[11px] font-medium text-foreground">
                              {g.visitCount} visit{g.visitCount > 1 ? "s" : ""}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium">
                            {latest.service_name ?? <span className="text-muted italic">Wet Area / None</span>}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {latest.therapist_name ?? <span className="text-muted italic">Unassigned</span>}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono">
                            {displayLocker != null ? (
                              <span className="rounded border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-gold">
                                Locker {displayLocker}
                              </span>
                            ) : (
                              <span className="text-muted italic">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs font-medium">
                            {latest.amount != null ? (
                              <span>
                                ₱{Number(latest.amount).toLocaleString()}{" "}
                                {latest.payment_method && (
                                  <span className="text-muted text-[10px]">({latest.payment_method})</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted italic">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedWalkInCodename(g.codename);
                              }}
                              className="rounded border border-gold/40 bg-gold/10 px-2.5 py-1 font-medium text-gold hover:bg-gold/20 transition-colors cursor-pointer"
                            >
                              View Past Stays →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Walk-In Pagination Controls Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4 text-sm">
                <div className="text-xs text-muted">
                  Showing <span className="font-medium text-foreground">{walkInsStartIndex + 1}</span>–
                  <span className="font-medium text-foreground">
                    {Math.min(walkInsStartIndex + walkInsPageSize, totalWalkIns)}
                  </span>{" "}
                  of <span className="font-medium text-foreground">{totalWalkIns}</span> guests
                </div>

                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">Rows per page:</span>
                    <select
                      value={walkInsPageSize}
                      onChange={(e) => setWalkInsPageSize(Number(e.target.value))}
                      className="rounded-md border border-[#292524] bg-[#141210] px-2.5 py-1 text-xs text-[#f5f5f4] focus:border-gold/50 focus:outline-none"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={walkInsCurrentPage <= 1}
                      onClick={() => setWalkInsCurrentPage((p) => Math.max(1, p - 1))}
                      className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:border-gold/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-muted">
                      Page <span className="font-medium text-foreground">{walkInsCurrentPage}</span> of{" "}
                      <span className="font-medium text-foreground">{totalWalkInPages}</span>
                    </span>
                    <button
                      type="button"
                      disabled={walkInsCurrentPage >= totalWalkInPages}
                      onClick={() => setWalkInsCurrentPage((p) => Math.min(totalWalkInPages, p + 1))}
                      className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:border-gold/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CLIENT PROFILE MODAL ("View Profile →") */}
      {selectedMemberForProfile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelectedMemberForProfile(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {selectedMemberForProfile.codename}
                </h2>
                <p className="text-xs font-mono text-muted">
                  @{selectedMemberForProfile.username}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMemberForProfile(null)}
                className="rounded-md p-1 text-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Mobile number */}
            <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-1">
                Mobile Number
              </p>
              <p className="text-sm font-mono text-foreground">
                {selectedMemberForProfile.phone ?? (
                  <span className="text-muted italic">Not on file</span>
                )}
              </p>
            </div>

            {/* Member Since (exact registration date) */}
            <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-1">
                Member Since
              </p>
              <p className="text-sm text-foreground">
                {formatDisplayDate(selectedMemberForProfile.since_date)}
              </p>
            </div>

            {/* Points balance */}
            <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                Available Points
              </p>
              <p className="text-sm font-bold text-gold">
                {selectedMemberForProfile.points_balance} pts
              </p>
            </div>

            {/* Member QR Code */}
            <div className="rounded-lg border border-border bg-surface-2 p-4 flex flex-col items-center gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted self-start">
                Digital Member QR
              </p>
              {selectedMemberForProfile.qr_token ? (
                <QRImage value={selectedMemberForProfile.qr_token} size={160} />
              ) : (
                <p className="text-xs text-muted italic">No QR token assigned</p>
              )}
              {selectedMemberForProfile.qr_token && (
                <p className="text-[10px] font-mono text-muted text-center break-all">
                  {selectedMemberForProfile.qr_token}
                </p>
              )}
            </div>

            {/* Active Locker status */}
            {lockerMap[selectedMemberForProfile.id] !== undefined && (
              <div className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-3 flex items-center justify-between">
                <p className="text-xs text-muted">Currently checked in</p>
                <span className="rounded border border-gold/50 bg-gold/10 px-2 py-0.5 text-[11px] font-semibold text-gold">
                  Locker {lockerMap[selectedMemberForProfile.id]}
                </span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setLogVisitClient(selectedMemberForProfile);
                  setShowLogVisit(true);
                  setSelectedMemberForProfile(null);
                }}
                disabled={services.length === 0 || staff.length === 0}
                className="w-full flex items-center justify-center gap-1.5 rounded-md border border-gold bg-gold/10 px-4 py-2 text-xs font-semibold text-gold hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer"
              >
                <span>+</span> Log Visit for Member
              </button>
              <button
                type="button"
                onClick={() => setSelectedMemberForProfile(null)}
                className="w-full rounded-md border border-border px-4 py-2 text-sm text-foreground hover:border-gold/30 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MEMBER VISIT HISTORY MODAL ("View Past Stays →") */}
      {selectedMemberForHistory && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 transition-opacity"
          onClick={() => setSelectedMemberForHistory(null)}
        >
          <div
            className="w-full max-w-lg h-full border-l border-border bg-surface p-6 overflow-y-auto space-y-6 shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">
                  Member Visit History
                </p>
                <h2 className="text-xl font-bold text-foreground mt-0.5">
                  {selectedMemberForHistory.client.codename}
                </h2>
                <p className="text-xs font-mono text-muted mt-0.5">
                  @{selectedMemberForHistory.client.username} · {selectedMemberForHistory.visits.length} total visit
                  {selectedMemberForHistory.visits.length !== 1 ? "s" : ""} on record
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMemberForHistory(null)}
                className="rounded-lg border border-border p-2 text-muted hover:text-foreground hover:border-gold/30 transition-colors cursor-pointer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Visit Timeline / History Cards */}
            <div className="space-y-3">
              {selectedMemberForHistory.visits.length === 0 ? (
                <div className="rounded-lg border border-border bg-surface-2 p-6 text-center text-xs text-muted">
                  No visit records found for this member.
                </div>
              ) : (
                selectedMemberForHistory.visits.map((visit, idx) => (
                  <div
                    key={visit.id || idx}
                    className="rounded-lg border border-border bg-surface-2 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-border/50 pb-2">
                      <span className="text-xs font-semibold text-gold">
                        Visit #{selectedMemberForHistory.visits.length - idx}
                      </span>
                      <span className="text-xs text-muted font-mono">
                        {formatDisplayDate(visit.date)}
                        {visit.time ? ` · ${formatTime(visit.time)}` : ""}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted">Service</p>
                        <p className="font-medium text-foreground mt-0.5">
                          {visit.service_name ?? <span className="text-muted italic">Wet Area / None</span>}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted">Therapist</p>
                        <p className="font-medium text-foreground mt-0.5">
                          {visit.therapist_name ?? <span className="text-muted italic">Unassigned</span>}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted">Massage Time</p>
                        <p className="font-medium text-foreground mt-0.5">
                          {visit.time ? (
                            formatTime(visit.time)
                          ) : (
                            <span className="text-muted italic">None (Wet Area)</span>
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted">Locker</p>
                        <p className="font-medium text-foreground mt-0.5">
                          {visit.locker_number ? (
                            <span className="text-gold font-mono">Locker {visit.locker_number}</span>
                          ) : (
                            <span className="text-muted italic">None</span>
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted">Amount & Payment</p>
                        <p className="font-medium text-foreground mt-0.5">
                          {visit.amount != null ? (
                            <span>
                              ₱{Number(visit.amount).toLocaleString()}{" "}
                              {visit.payment_method && (
                                <span className="text-muted text-[10px]">({visit.payment_method})</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted italic">—</span>
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted">Points Delta</p>
                        <p className="font-medium mt-0.5">
                          <span
                            className={
                              visit.points_delta >= 0 ? "text-gold font-bold" : "text-accent-red font-bold"
                            }
                          >
                            {visit.points_delta >= 0 ? "+" : ""}
                            {visit.points_delta} pts
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted pt-1">
                      <span>Status: <strong className="text-foreground">{visit.entry_type}</strong></span>
                      <span className="text-[10px] font-mono">ID: {visit.id.slice(0, 8)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedMemberForHistory(null)}
              className="w-full rounded-lg border border-border py-2.5 text-sm font-medium text-foreground hover:border-gold/30 transition-colors cursor-pointer"
            >
              Close History
            </button>
          </div>
        </div>
      )}

      {/* WALK-IN GUEST VISIT HISTORY DRAWER ("View Past Stays →") */}
      {activeWalkInGroup && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 transition-opacity"
          onClick={() => setSelectedWalkInCodename(null)}
        >
          <div
            className="w-full max-w-lg h-full border-l border-border bg-surface p-6 overflow-y-auto space-y-6 shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">
                  Walk-In Guest History
                </p>
                <h2 className="text-xl font-bold text-foreground mt-0.5">
                  {activeWalkInGroup.codename}
                </h2>
                <p className="text-xs font-mono text-muted mt-0.5">
                  Non-Account Guest · {activeWalkInGroup.visits.length} total visit
                  {activeWalkInGroup.visits.length !== 1 ? "s" : ""} on record
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWalkInCodename(null)}
                className="rounded-lg border border-border p-2 text-muted hover:text-foreground hover:border-gold/30 transition-colors cursor-pointer"
                aria-label="Close history drawer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Visit Timeline / History Cards */}
            <div className="space-y-3">
              {activeWalkInGroup.visits.length === 0 ? (
                <div className="rounded-lg border border-border bg-surface-2 p-6 text-center text-xs text-muted">
                  No visit records found for this walk-in guest.
                </div>
              ) : (
                activeWalkInGroup.visits.map((visit, idx) => {
                  const resolvedLocker =
                    visit.locker_number ??
                    activeWalkInGroup.visits.find((v) => v.locker_number != null)?.locker_number ??
                    null;

                  return (
                    <div
                      key={visit.id || idx}
                      className="rounded-lg border border-border bg-surface-2 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                        <span className="text-xs font-semibold text-gold">
                          Visit #{activeWalkInGroup.visits.length - idx}
                        </span>
                        <span className="text-xs text-muted font-mono">
                          {formatDisplayDate(visit.booking_date)}
                          {visit.start_time ? ` · ${formatTime(visit.start_time)}` : ""}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted">Service</p>
                          <p className="font-medium text-foreground mt-0.5">
                            {visit.service_name ?? <span className="text-muted italic">Wet Area / None</span>}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted">Therapist</p>
                          <p className="font-medium text-foreground mt-0.5">
                            {visit.therapist_name ?? <span className="text-muted italic">Unassigned</span>}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted">Massage Time</p>
                          <p className="font-medium text-foreground mt-0.5">
                            {visit.start_time ? (
                              formatTime(visit.start_time)
                            ) : (
                              <span className="text-muted italic">None (Wet Area)</span>
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted">Room</p>
                          <p className="font-medium text-foreground mt-0.5">
                            {visit.room_number ? (
                              <span>Room {visit.room_number}</span>
                            ) : (
                              <span className="text-muted italic">None (Wet Area)</span>
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted">Locker</p>
                          <p className="font-medium text-foreground mt-0.5">
                            {resolvedLocker ? (
                              <span className="text-gold font-mono">Locker {resolvedLocker}</span>
                            ) : (
                              <span className="text-muted italic">None</span>
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted">Amount & Payment</p>
                          <p className="font-medium text-foreground mt-0.5">
                            {visit.amount != null ? (
                              <span>
                                ₱{Number(visit.amount).toLocaleString()}{" "}
                                {visit.payment_method && (
                                  <span className="text-muted text-[10px]">({visit.payment_method})</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted italic">—</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted pt-1">
                        <span>Status: <strong className="text-foreground">{visit.status}</strong></span>
                        <span className="text-[10px] font-mono">ID: {visit.id.slice(0, 8)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedWalkInCodename(null)}
              className="w-full rounded-lg border border-border py-2.5 text-sm font-medium text-foreground hover:border-gold/30 transition-colors cursor-pointer"
            >
              Close History
            </button>
          </div>
        </div>
      )}

      {/* Log Visit Modal */}
      {showLogVisit && (logVisitClient || clients[0]) && (
        <LogVisitModal
          clients={clients}
          services={services}
          staff={staff}
          therapists={therapists}
          promos={promos}
          addons={addons}
          lockers={lockers}
          initialClientId={(logVisitClient || clients[0]).id}
          onClose={() => {
            setShowLogVisit(false);
            setLogVisitClient(null);
          }}
          onLogged={() => {
            setShowLogVisit(false);
            setLogVisitClient(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
