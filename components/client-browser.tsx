"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogVisitModal } from "@/components/log-visit-modal";

type Client = {
  id: string;
  codename: string;
  username: string;
  member_code: string;
  points_balance: number;
  since_date: string;
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

const REWARD_THRESHOLD = 100;
const HISTORY_LIMIT = 20;

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase();
}

function formatSinceDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatLedgerDate(iso: string) {
  const d = new Date(iso);
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

export function ClientBrowser({
  clients,
  services,
  staff,
  therapists = [],
  promos = [],
  addons = [],
  lockers = [],
  clientLockerMap = {},
}: {
  clients: Client[];
  services: Service[];
  staff: Staff[];
  therapists?: Therapist[];
  promos?: Promo[];
  addons?: Addon[];
  lockers?: number[];
  clientLockerMap?: Record<string, number>;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>(clients[0].id);
  const selected = clients.find((c) => c.id === selectedId) ?? clients[0];

  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [historyClientId, setHistoryClientId] = useState<string | null>(null);
  const [showLogVisit, setShowLogVisit] = useState(false);
  const historyLoading = historyClientId !== selected.id;

  // Filter clients for search
  const filteredClients = search.trim()
    ? clients.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.codename.toLowerCase().includes(q) ||
          c.username.toLowerCase().includes(q) ||
          c.member_code.toLowerCase().includes(q)
        );
      })
    : clients;

  useEffect(() => {
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
  }, [selected.id]);

  function refreshHistory() {
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

  const lockerNumber = clientLockerMap[selected.id];
  const isEligible = selected.points_balance >= REWARD_THRESHOLD;

  // Find lowest-cost redeemable service
  const redeemableService = services.find(
    (s) => selected.points_balance >= s.points_earned * 10
  );

  return (
    <div className="mt-6 flex flex-col gap-4">
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
          placeholder="Search by username, name, or member code..."
          className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted focus:border-gold/50 focus:outline-none"
        />
      </div>

      {/* ALL CLIENTS label */}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
        All Clients
      </p>

      {/* Client pills row */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filteredClients.map((client) => {
          const active = client.id === selected.id;
          const locker = clientLockerMap[client.id];
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
                  {locker !== undefined && (
                    <span>· Locker {locker}</span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
        {filteredClients.length === 0 && (
          <p className="text-sm text-muted">No clients match your search.</p>
        )}
      </div>

      {/* Main 2-panel layout */}
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
                  {lockerNumber !== undefined && (
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
                <p className="text-xs text-muted/70">
                  Tap card for verification (mobile number, QR) →
                </p>
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
                onClick={() => setShowLogVisit(true)}
                disabled={services.length === 0 || staff.length === 0}
                className="flex items-center gap-1.5 rounded-md border border-gold bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              >
                <span>+</span> Log Visit
              </button>
            </div>

            {/* Service cards grid */}
            {services.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {services.map((svc) => (
                  <div
                    key={svc.id}
                    className="rounded-lg border border-border bg-surface-2 p-3"
                  >
                    <p className="text-sm font-medium text-foreground leading-tight">{svc.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      <span className="text-gold font-semibold">+{svc.points_earned}</span>{" "}
                      <span className="text-[10px]">pts</span>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted">No services configured.</p>
            )}
          </div>

          {/* Redemption card */}
          {redeemableService && (
            <div className="rounded-lg border border-border bg-surface-2 p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Redeem {redeemableService.name}</p>
                <p className="text-xs text-muted mt-0.5">
                  Costs {redeemableService.points_earned * 10} points · 0 pts earned on redemption
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-md border border-gold/50 bg-surface px-4 py-1.5 text-xs font-medium text-gold hover:bg-gold/10 transition-colors"
              >
                Redeem — {redeemableService.points_earned * 10} pts
              </button>
            </div>
          )}
        </div>

        {/* Right: Transaction history (Immutable Ledger) */}
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

      {showLogVisit && (
        <LogVisitModal
          clients={clients}
          services={services}
          staff={staff}
          therapists={therapists}
          promos={promos}
          addons={addons}
          lockers={lockers}
          initialClientId={selected.id}
          onClose={() => setShowLogVisit(false)}
          onLogged={() => {
            setShowLogVisit(false);
            refreshHistory();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

