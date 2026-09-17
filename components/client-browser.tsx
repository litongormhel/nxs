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
  status: string;
  created_at: string;
  service_name: string | null;
  therapist_name: string | null;
  locker_number: number | null;
  amount: number | null;
  payment_method: string | null;
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

type LedgerEntry = {
  id: string;
  entry_type: "EARN" | "REDEEM" | "ADJUSTMENT";
  points_delta: number;
  source: string;
  notes: string | null;
  created_at: string;
  sales: {
    amount: number;
    payment_method: string;
    services: { name: string } | null;
    therapists: { name: string } | null;
    staff: { name: string } | null;
  } | null;
};

type GroupedWalkIn = {
  codename: string;
  visitCount: number;
  lastVisitDate: string;
  latestVisit: WalkInVisit;
  visits: WalkInVisit[];
};

const REWARD_THRESHOLD = 100;
const HISTORY_LIMIT = 20;

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase();
}

function formatSinceDate(iso: string) {
  if (!iso) return "N/A";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatLedgerDate(iso: string) {
  if (!iso) return "N/A";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDisplayDate(dateStr: string) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function abbrevName(name: string | null | undefined) {
  if (!name) return "";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0];
  return `${parts[0].charAt(0)}. ${parts.slice(1).join(" ")}`;
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


// Simple QR-code renderer using a free API
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
  const [selectedId, setSelectedId] = useState<string>(clients[0]?.id ?? "");

  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [historyClientId, setHistoryClientId] = useState<string | null>(null);

  // Walk-In drawer state
  const [selectedWalkInCodename, setSelectedWalkInCodename] = useState<string | null>(null);

  // Walk-In pagination state
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Reset currentPage to 1 whenever search query or pageSize changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, pageSize]);

  // Modal states
  const [showLogVisit, setShowLogVisit] = useState(false);
  const [logVisitServiceId, setLogVisitServiceId] = useState<string | null>(null);
  const [showClientCard, setShowClientCard] = useState(false);

  // Live locker map (updated by realtime)
  const [lockerMap, setLockerMap] = useState<Record<string, number>>(initialLockerMap);

  const selected = clients.find((c) => c.id === selectedId) ?? clients[0];
  const historyLoading = selected && historyClientId !== selected.id;

  // Filter clients for search
  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) =>
      c.codename.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q) ||
      c.member_code.toLowerCase().includes(q)
    );
  }, [clients, search]);

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
      // Sort visits descending by date/time
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

    // Sort grouped walk-ins by latest visit date descending
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
  const totalPages = Math.ceil(totalWalkIns / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedWalkIns = useMemo(() => {
    return filteredWalkIns.slice(startIndex, startIndex + pageSize);
  }, [filteredWalkIns, startIndex, pageSize]);

  // Selected Walk-In drawer record
  const activeWalkInGroup = useMemo(() => {
    if (!selectedWalkInCodename) return null;
    return groupedWalkIns.find((g) => g.codename === selectedWalkInCodename) ?? null;
  }, [groupedWalkIns, selectedWalkInCodename]);

  // Load transaction history on selected client change
  useEffect(() => {
    if (!selected?.id) return;
    let cancelled = false;

    const supabase = createClient();
    supabase
      .from("point_transactions")
      .select(
        `id, entry_type, points_delta, source, notes, created_at,
         sales(amount, payment_method,
           services(name),
           therapists(name),
           staff!sales_processed_by_fkey(name)
         )`
      )
      .eq("client_id", selected.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT)
      .then(({ data }) => {
        if (cancelled) return;
        setHistory((data as LedgerEntry[]) ?? []);
        setHistoryClientId(selected.id);
      });

    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  // Realtime: subscribe to locker_occupancy changes so locker badge updates live
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

  function refreshHistory() {
    if (!selected?.id) return;
    setHistoryClientId(null);
    const supabase = createClient();
    supabase
      .from("point_transactions")
      .select(
        `id, entry_type, points_delta, source, notes, created_at,
         sales(amount, payment_method,
           services(name),
           therapists(name),
           staff!sales_processed_by_fkey(name)
         )`
      )
      .eq("client_id", selected.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT)
      .then(({ data }) => {
        setHistory((data as LedgerEntry[]) ?? []);
        setHistoryClientId(selected.id);
      });
  }

  function openLogVisit(serviceId?: string) {
    setLogVisitServiceId(serviceId ?? null);
    setShowLogVisit(true);
  }

  const lockerNumber = selected ? lockerMap[selected.id] : undefined;
  const isCheckedIn = lockerNumber !== undefined;
  const isEligible = selected ? selected.points_balance >= REWARD_THRESHOLD : false;

  const redeemableService = selected
    ? services.find((s) => selected.points_balance >= REWARD_THRESHOLD)
    : undefined;

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
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
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
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
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
              ? "Search by username, codename, or member code..."
              : "Search by guest codename (e.g. Wax, Marky) or date..."
          }
          className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted focus:border-gold/50 focus:outline-none"
        />
      </div>

      {/* MEMBERS TAB */}
      {activeTab === "members" && (
        <>
          {clients.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted">
              No registered member accounts currently on file.
            </div>
          ) : (
            <>
              {/* Registered Members label */}
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                Registered Members ({filteredClients.length})
              </p>

              {/* Client pills row */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {filteredClients.map((client) => {
                  const active = client.id === selected?.id;
                  const locker = lockerMap[client.id];
                  return (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => setSelectedId(client.id)}
                      className={`flex shrink-0 items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors ${
                        active
                          ? "border-gold bg-gold/10"
                          : "border-border bg-surface hover:border-gold/30"
                      }`}
                    >
                      {/* Avatar */}
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                          active
                            ? "bg-gold text-background"
                            : "bg-surface-accent text-foreground"
                        }`}
                      >
                        {getInitial(client.codename)}
                      </span>
                      <span className="flex flex-col items-start">
                        <span className={`text-sm font-semibold leading-tight ${active ? "text-gold" : "text-foreground"}`}>
                          {client.codename}
                        </span>
                        <span className="flex items-center gap-1.5 text-[11px] text-muted leading-tight">
                          <span className="text-gold">★</span>
                          {client.points_balance} pts
                          {locker !== undefined && <span>· Locker {locker}</span>}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {filteredClients.length === 0 && (
                  <p className="text-sm text-muted">No members match your search.</p>
                )}
              </div>

              {selected && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                  {/* Left: client detail card */}
                  <div className="rounded-lg border border-border bg-surface p-6 space-y-5">
                    {/* Header row: avatar + info + points */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-accent text-2xl font-bold text-gold border border-border shrink-0">
                          {getInitial(selected.codename)}
                        </div>
                        {/* Info */}
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-xl font-semibold text-foreground">{selected.codename}</h2>
                            {isCheckedIn && (
                              <span className="rounded border border-gold/50 bg-gold/10 px-2 py-0.5 text-[11px] font-semibold text-gold">
                                Locker {lockerNumber}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted">
                            @{selected.username} · Member #{selected.member_code}
                          </p>
                          <p className="text-xs text-muted">
                            Member since {formatSinceDate(selected.since_date)}
                          </p>
                          <button
                            type="button"
                            onClick={() => setShowClientCard(true)}
                            className="mt-0.5 flex items-center gap-1 text-xs text-gold/70 hover:text-gold transition-colors underline underline-offset-2 cursor-pointer"
                          >
                            View client profile (mobile number, QR) →
                          </button>
                        </div>
                      </div>

                      {/* Points balance */}
                      <div className="text-right shrink-0">
                        <p className="text-4xl font-bold text-gold leading-none">{selected.points_balance}</p>
                        <p className="text-[10px] uppercase tracking-widest text-muted mt-1">Available Points</p>
                        {isEligible && (
                          <span className="mt-2 inline-block rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-[11px] font-medium text-gold">
                            + Eligible for Reward
                          </span>
                        )}
                      </div>
                    </div>

                    {/* LOG AVAILED SERVICE section */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                          Log Availed Service
                        </p>
                        <button
                          type="button"
                          onClick={() => openLogVisit()}
                          disabled={services.length === 0 || staff.length === 0 || !selected.has_portal_account}
                          className="flex items-center gap-1.5 rounded-md border border-gold bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                        >
                          <span>+</span> Log Visit
                        </button>
                      </div>
                      {!selected.has_portal_account && (
                        <p className="mt-2 text-xs text-accent-red">
                          Walang portal account — hindi pa mag-eearn/redeem ng points.
                        </p>
                      )}

                      {/* Service cards grid */}
                      {services.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {services.map((svc) => (
                            <button
                              key={svc.id}
                              type="button"
                              onClick={() => openLogVisit(svc.id)}
                              disabled={staff.length === 0 || !selected.has_portal_account}
                              className="group rounded-lg border border-border bg-surface-2 p-3 text-left transition-colors hover:border-gold/50 hover:bg-gold/5 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
                            >
                              <p className="text-sm font-medium text-foreground leading-tight group-hover:text-gold transition-colors">
                                {svc.name}
                              </p>
                              <p className="mt-1 text-xs text-muted">
                                <span className="text-gold font-semibold">+{svc.points_earned}</span>{" "}
                                <span className="text-[10px]">pts</span>
                              </p>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted">No services configured.</p>
                      )}
                    </div>

                    {/* Redemption card */}
                    {redeemableService && selected.points_balance >= REWARD_THRESHOLD && (
                      <div className="rounded-lg border border-border bg-surface-2 p-4 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-foreground">Redeem {redeemableService.name}</p>
                          <p className="text-xs text-muted mt-0.5">
                            Costs {REWARD_THRESHOLD} points · 0 pts earned on redemption
                          </p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 rounded-md border border-gold/50 bg-surface px-4 py-1.5 text-xs font-medium text-gold hover:bg-gold/10 transition-colors"
                        >
                          Redeem — {REWARD_THRESHOLD} pts
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Right: Transaction history */}
                  <div className="rounded-lg border border-border bg-surface flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-border">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-gold/70">
                        Immutable Ledger
                      </p>
                      <h3 className="text-lg font-bold text-foreground">Transaction History</h3>
                      <p className="text-xs text-muted">@{selected.username}</p>
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-border">
                      {historyLoading ? (
                        <p className="p-4 text-xs text-muted">Loading…</p>
                      ) : history.length === 0 ? (
                        <p className="p-4 text-xs text-muted">No transactions yet.</p>
                      ) : (
                        history.map((entry) => {
                          const sale = entry.sales;
                          const serviceName = sale?.services?.name ?? entry.notes ?? entry.entry_type;
                          const therapistName = sale?.therapists?.name ?? null;
                          const processedBy = sale?.staff?.name ?? null;
                          const amount = sale?.amount ?? null;
                          const paymentMethod = sale?.payment_method ?? null;
                          const date = formatLedgerDate(entry.created_at);
                          const nameLabel = processedBy ? abbrevName(processedBy) : null;

                          return (
                            <div key={entry.id} className="p-3 flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0 space-y-0.5">
                                <p className="text-sm font-semibold text-foreground truncate">{serviceName}</p>
                                <p className="text-[11px] text-muted">
                                  {date}{nameLabel ? ` · ${nameLabel}` : ""}
                                </p>
                                {(therapistName || amount !== null || paymentMethod) && (
                                  <p className="text-[11px] text-muted">
                                    {therapistName && <span>Therapist: {therapistName}</span>}
                                    {amount !== null && (
                                      <span>{therapistName ? " · " : ""}₱{amount.toLocaleString()} · {paymentMethod}</span>
                                    )}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span
                                  className={`text-sm font-bold ${
                                    entry.points_delta >= 0 ? "text-gold" : "text-accent-red"
                                  }`}
                                >
                                  {entry.points_delta >= 0 ? "+" : ""}{entry.points_delta}
                                </span>
                                <span className="rounded bg-surface-accent px-1.5 py-0.5 text-[9px] font-mono font-semibold text-muted uppercase tracking-wide">
                                  {entry.source}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="p-4 border-t border-border flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                        Current Balance
                      </p>
                      <p className="text-base font-bold text-gold">{selected.points_balance} pts</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
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
                            {latest.locker_number ? (
                              <span className="rounded border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-gold">
                                Locker {latest.locker_number}
                              </span>
                            ) : (
                              <span className="text-muted italic">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs font-medium">
                            {latest.amount !== null ? (
                              <span>
                                ₱{latest.amount.toLocaleString()}{" "}
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
                              className="rounded border border-gold/40 bg-gold/10 px-2.5 py-1 font-medium text-gold hover:bg-gold/20 transition-colors"
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

              {/* Pagination Controls Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4 text-sm">
                {/* Left side: status indicator */}
                <div className="text-xs text-muted">
                  Showing <span className="font-medium text-foreground">{startIndex + 1}</span>–
                  <span className="font-medium text-foreground">
                    {Math.min(startIndex + pageSize, totalWalkIns)}
                  </span>{" "}
                  of <span className="font-medium text-foreground">{totalWalkIns}</span> guests
                </div>

                {/* Right side: controls */}
                <div className="flex flex-wrap items-center gap-6">
                  {/* Rows per page selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">Rows per page:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      className="rounded-md border border-[#292524] bg-[#141210] px-2.5 py-1 text-xs text-[#f5f5f4] focus:border-gold/50 focus:outline-none"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:border-gold/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-muted">
                      Page <span className="font-medium text-foreground">{currentPage}</span> of{" "}
                      <span className="font-medium text-foreground">{totalPages}</span>
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:border-gold/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
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

      {/* Log Visit Modal */}
      {showLogVisit && selected && (
        <LogVisitModal
          clients={clients}
          services={services}
          staff={staff}
          therapists={therapists}
          promos={promos}
          addons={addons}
          lockers={lockers}
          initialClientId={selected.id}
          initialServiceId={logVisitServiceId}
          onClose={() => setShowLogVisit(false)}
          onLogged={() => {
            setShowLogVisit(false);
            refreshHistory();
            router.refresh();
          }}
        />
      )}

      {/* Client Profile Card Modal */}
      {showClientCard && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowClientCard(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">{selected.codename}</h2>
                <p className="text-xs text-muted">@{selected.username} · #{selected.member_code}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowClientCard(false)}
                className="rounded-md p-1 text-muted hover:text-foreground transition-colors"
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
                {selected.phone ?? (
                  <span className="text-muted italic">Not on file</span>
                )}
              </p>
            </div>

            {/* QR Code */}
            <div className="rounded-lg border border-border bg-surface-2 p-4 flex flex-col items-center gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted self-start">
                Member QR
              </p>
              {selected.qr_token ? (
                <QRImage value={selected.qr_token} size={160} />
              ) : (
                <p className="text-xs text-muted italic">No QR token assigned</p>
              )}
              {selected.qr_token && (
                <p className="text-[10px] font-mono text-muted text-center break-all">
                  {selected.qr_token}
                </p>
              )}
            </div>

            {/* Locker status */}
            {isCheckedIn && (
              <div className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-3 flex items-center justify-between">
                <p className="text-xs text-muted">Currently checked in</p>
                <span className="rounded border border-gold/50 bg-gold/10 px-2 py-0.5 text-[11px] font-semibold text-gold">
                  Locker {lockerNumber}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowClientCard(false)}
              className="w-full rounded-md border border-border px-4 py-2.5 text-sm text-foreground hover:border-gold/30 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* WALK-IN PAST STAYS DRAWER / MODAL */}
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
                  Walk-In Guest Visit History
                </p>
                <h2 className="text-xl font-bold text-foreground mt-0.5">
                  {activeWalkInGroup.codename}
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  {activeWalkInGroup.visitCount} total visit{activeWalkInGroup.visitCount > 1 ? "s" : ""} on record
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWalkInCodename(null)}
                className="rounded-lg border border-border p-2 text-muted hover:text-foreground hover:border-gold/30 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Visit Timeline / History Cards */}
            <div className="space-y-3">
              {activeWalkInGroup.visits.map((visit, idx) => (
                <div
                  key={visit.id || idx}
                  className="rounded-lg border border-border bg-surface-2 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <span className="text-xs font-semibold text-gold">
                      Visit #{activeWalkInGroup.visitCount - idx}
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
                        {visit.amount !== null ? (
                          <span>
                            ₱{visit.amount.toLocaleString()}{" "}
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
              ))}
            </div>

            <button
              type="button"
              onClick={() => setSelectedWalkInCodename(null)}
              className="w-full rounded-lg border border-border py-2.5 text-sm font-medium text-foreground hover:border-gold/30 transition-colors"
            >
              Close History
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
