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
  notes: string | null;
  created_at: string;
};

const REWARD_THRESHOLD = 100;
const HISTORY_LIMIT = 10;

export function ClientBrowser({
  clients,
  services,
  staff,
  therapists = [],
  promos = [],
  addons = [],
  lockers = [],
}: {
  clients: Client[];
  services: Service[];
  staff: Staff[];
  therapists?: Therapist[];
  promos?: Promo[];
  addons?: Addon[];
  lockers?: number[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string>(clients[0].id);
  const selected = clients.find((client) => client.id === selectedId) ?? clients[0];

  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [historyClientId, setHistoryClientId] = useState<string | null>(null);
  const [showLogVisit, setShowLogVisit] = useState(false);
  const historyLoading = historyClientId !== selected.id;

  useEffect(() => {
    let cancelled = false;

    const supabase = createClient();
    supabase
      .from("point_transactions")
      .select("id, entry_type, points_delta, notes, created_at")
      .eq("client_id", selected.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT)
      .then(({ data }) => {
        if (cancelled) return;
        setHistory(data ?? []);
        setHistoryClientId(selected.id);
      });

    return () => {
      cancelled = true;
    };
  }, [selected.id]);

  function refreshHistory() {
    const supabase = createClient();
    supabase
      .from("point_transactions")
      .select("id, entry_type, points_delta, notes, created_at")
      .eq("client_id", selected.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT)
      .then(({ data }) => setHistory(data ?? []));
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-wrap gap-2">
        {clients.map((client) => {
          const active = client.id === selected.id;
          return (
            <button
              key={client.id}
              type="button"
              onClick={() => setSelectedId(client.id)}
              className={`rounded-full border px-4 py-2 text-left text-sm transition-colors ${
                active
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border bg-surface text-foreground hover:border-gold/30"
              }`}
            >
              <span className="font-medium">{client.codename}</span>
              <span className="ml-2 text-muted">@{client.username}</span>
              <span className="ml-2 text-muted">· {client.points_balance} pts</span>
            </button>
          );
        })}
      </div>

      <div className="h-fit rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
            Client Details
          </h2>
          <button
            type="button"
            onClick={() => setShowLogVisit(true)}
            disabled={services.length === 0 || staff.length === 0}
            className="rounded-md border border-gold bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Log Visit
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs text-muted">Codename</p>
            <p className="text-lg font-semibold text-gold">{selected.codename}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Username</p>
            <p className="text-sm text-foreground">@{selected.username}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Member Code</p>
            <p className="text-sm text-foreground">{selected.member_code}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Points Balance</p>
            <p className="text-sm text-foreground">{selected.points_balance}</p>
          </div>

          {selected.points_balance >= REWARD_THRESHOLD && (
            <span className="inline-block rounded-full border border-gold bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
              Eligible for Reward
            </span>
          )}

          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted uppercase tracking-wide">
              Recent Activity
            </p>
            {historyLoading ? (
              <p className="mt-2 text-xs text-muted">Loading…</p>
            ) : history.length === 0 ? (
              <p className="mt-2 text-xs text-muted">No transactions yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {history.map((entry) => (
                  <li key={entry.id} className="text-xs">
                    <span
                      className={
                        entry.points_delta >= 0 ? "text-gold" : "text-red-300"
                      }
                    >
                      {entry.points_delta >= 0 ? "+" : ""}
                      {entry.points_delta} pts
                    </span>
                    <span className="ml-2 text-muted">{entry.entry_type}</span>
                    {entry.notes && (
                      <span className="ml-2 text-muted">— {entry.notes}</span>
                    )}
                    <div className="text-muted">
                      {new Date(entry.created_at).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
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
