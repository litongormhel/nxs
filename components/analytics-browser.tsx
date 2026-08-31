"use client";

import { useMemo, useState } from "react";
import { lastSpaDays, spaDayNow, spaMonthNow, toSpaDay, toSpaMonth } from "@/lib/analytics/spa-day";

export type AnalyticsSale = {
  id: string;
  client_id: string | null;
  client_name: string;
  points_balance: number | null;
  service_name: string;
  amount: number;
  created_at: string;
  voided: boolean;
};

export type AnalyticsBooking = {
  id: string;
  therapist_id: string | null;
  therapist_name: string | null;
  therapist_archived: boolean;
};

function peso(n: number): string {
  return `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

function fmtSpaDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtSpaMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5 transition-all hover:border-gold/30">
      <h2 className="text-sm font-medium text-muted uppercase tracking-wide">{label}</h2>
      <p className="mt-3 text-3xl font-semibold text-gold">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export type AnalyticsSection = "sales" | "most-availed" | "top-clients" | "top-thera";

export function AnalyticsBrowser({
  sales,
  bookings,
  section,
  onViewCommission,
}: {
  sales: AnalyticsSale[];
  bookings: AnalyticsBooking[];
  section: AnalyticsSection;
  onViewCommission?: (therapistId: string, therapistName: string) => void;
}) {
  const [salesView, setSalesView] = useState<"day" | "month">("day");

  const computed = useMemo(() => {
    const today = spaDayNow();
    const last7 = lastSpaDays(7);
    const thisMonth = spaMonthNow();

    const active = sales.filter((s) => !s.voided);
    const withBuckets = active.map((s) => ({
      ...s,
      spaDay: toSpaDay(s.created_at),
      spaMonth: toSpaMonth(s.created_at),
    }));

    const inToday = withBuckets.filter((s) => s.spaDay === today);
    const in7 = withBuckets.filter((s) => last7.has(s.spaDay));
    const inMonth = withBuckets.filter((s) => s.spaMonth === thisMonth);

    const sum = (rows: { amount: number }[]) => rows.reduce((acc, r) => acc + r.amount, 0);

    // Most Availed Service
    const serviceCounts = new Map<string, number>();
    for (const s of withBuckets) {
      serviceCounts.set(s.service_name, (serviceCounts.get(s.service_name) ?? 0) + 1);
    }
    const serviceRanking = [...serviceCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // Sales Per Day
    const perDay = new Map<string, { amount: number; visits: number }>();
    for (const s of withBuckets) {
      const cur = perDay.get(s.spaDay) ?? { amount: 0, visits: 0 };
      cur.amount += s.amount;
      cur.visits += 1;
      perDay.set(s.spaDay, cur);
    }
    const salesPerDay = [...perDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, v]) => ({ day, ...v }));

    // Sales Per Month
    const perMonth = new Map<string, { amount: number; visits: number }>();
    for (const s of withBuckets) {
      const cur = perMonth.get(s.spaMonth) ?? { amount: 0, visits: 0 };
      cur.amount += s.amount;
      cur.visits += 1;
      perMonth.set(s.spaMonth, cur);
    }
    const salesPerMonth = [...perMonth.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([month, v]) => ({ month, ...v }));

    // Top Clients (registered only — walk-ins have no client_id/points to rank)
    const perClient = new Map<
      string,
      { name: string; amount: number; visits: number; points: number | null }
    >();
    for (const s of withBuckets) {
      if (!s.client_id) continue;
      const cur = perClient.get(s.client_id) ?? {
        name: s.client_name,
        amount: 0,
        visits: 0,
        points: s.points_balance,
      };
      cur.amount += s.amount;
      cur.visits += 1;
      perClient.set(s.client_id, cur);
    }
    const topClients = [...perClient.values()].sort((a, b) => b.amount - a.amount);

    // Therapist Ranking
    const perTherapist = new Map<
      string,
      { id: string; name: string; archived: boolean; count: number }
    >();
    for (const b of bookings) {
      if (!b.therapist_id) continue;
      const cur = perTherapist.get(b.therapist_id) ?? {
        id: b.therapist_id,
        name: b.therapist_name ?? "—",
        archived: b.therapist_archived,
        count: 0,
      };
      cur.count += 1;
      perTherapist.set(b.therapist_id, cur);
    }
    const therapistRanking = [...perTherapist.values()].sort((a, b) => b.count - a.count);

    return {
      salesToday: sum(inToday),
      sales7: sum(in7),
      salesMonth: sum(inMonth),
      visitsToday: inToday.length,
      visits7: in7.length,
      visitsMonth: inMonth.length,
      serviceRanking,
      salesPerDay,
      salesPerMonth,
      topClients,
      therapistRanking,
    };
  }, [sales, bookings]);

  if (section === "sales") {
    const perRows = salesView === "day" ? computed.salesPerDay : computed.salesPerMonth;
    return (
      <div className="space-y-8">
        <section>
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">
            Sales
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Today" value={peso(computed.salesToday)} />
            <StatCard label="Last 7 Days" value={peso(computed.sales7)} />
            <StatCard label="This Month" value={peso(computed.salesMonth)} />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">
            Client Visits
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Today" value={String(computed.visitsToday)} />
            <StatCard label="Last 7 Days" value={String(computed.visits7)} />
            <StatCard label="This Month" value={String(computed.visitsMonth)} />
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
              Sales Per {salesView === "day" ? "Day" : "Month"}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSalesView("day")}
                className={`rounded-lg px-3 py-1 text-[11px] font-bold transition ${
                  salesView === "day"
                    ? "border border-[#a97e2e] bg-surface text-accent-gold"
                    : "border border-border text-muted hover:text-fg"
                }`}
              >
                Per Day
              </button>
              <button
                onClick={() => setSalesView("month")}
                className={`rounded-lg px-3 py-1 text-[11px] font-bold transition ${
                  salesView === "month"
                    ? "border border-[#a97e2e] bg-surface text-accent-gold"
                    : "border border-border text-muted hover:text-fg"
                }`}
              >
                Per Month
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface divide-y divide-border max-h-96 overflow-y-auto">
            {perRows.length === 0 && (
              <p className="p-4 text-sm text-muted">No sales recorded yet.</p>
            )}
            {salesView === "day"
              ? computed.salesPerDay.map((row) => (
                  <div key={row.day} className="flex items-center justify-between p-3 px-4">
                    <span className="text-sm text-fg">{fmtSpaDay(row.day)}</span>
                    <span className="text-sm text-muted">
                      {row.visits} visit{row.visits === 1 ? "" : "s"} · {peso(row.amount)}
                    </span>
                  </div>
                ))
              : computed.salesPerMonth.map((row) => (
                  <div key={row.month} className="flex items-center justify-between p-3 px-4">
                    <span className="text-sm text-fg">{fmtSpaMonth(row.month)}</span>
                    <span className="text-sm text-muted">
                      {row.visits} visit{row.visits === 1 ? "" : "s"} · {peso(row.amount)}
                    </span>
                  </div>
                ))}
          </div>
        </section>
      </div>
    );
  }

  if (section === "most-availed") {
    return (
      <section>
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">
          Most Availed Service
        </h2>
        <div className="rounded-lg border border-border bg-surface divide-y divide-border">
          {computed.serviceRanking.length === 0 && (
            <p className="p-4 text-sm text-muted">No visits recorded yet.</p>
          )}
          {computed.serviceRanking.map((s, i) => (
            <div key={s.name} className="flex items-center justify-between p-3 px-4">
              <span className="text-sm text-fg">
                {i + 1}. {s.name}
              </span>
              <span className="text-sm text-muted">{s.count} visit{s.count === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (section === "top-clients") {
    return (
      <section>
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">
          Top Clients
        </h2>
        <div className="rounded-lg border border-border bg-surface divide-y divide-border">
          {computed.topClients.length === 0 && (
            <p className="p-4 text-sm text-muted">No registered-client sales yet.</p>
          )}
          {computed.topClients.map((c, i) => (
            <div key={c.name + i} className="flex items-center justify-between p-3 px-4">
              <span className="text-sm text-fg">
                {i + 1}. {c.name}
              </span>
              <span className="text-sm text-muted">
                {c.visits} visit{c.visits === 1 ? "" : "s"} · {peso(c.amount)} ·{" "}
                {c.points ?? 0} pts
              </span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">
        Top Thera
      </h2>
      <div className="rounded-lg border border-border bg-surface divide-y divide-border">
        {computed.therapistRanking.length === 0 && (
          <p className="p-4 text-sm text-muted">No bookings recorded yet.</p>
        )}
        {computed.therapistRanking.map((t, i) => (
          <div key={t.name + i} className="flex items-center justify-between p-3 px-4">
            <span className="text-sm text-fg">
              {i + 1}. {t.name}
              {t.archived && <span className="text-muted"> (Archived)</span>}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted">{t.count} booking{t.count === 1 ? "" : "s"}</span>
              {onViewCommission && (
                <button
                  onClick={() => onViewCommission(t.id, t.name)}
                  className="text-[11px] font-bold text-accent-gold hover:underline"
                >
                  View Commission →
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
