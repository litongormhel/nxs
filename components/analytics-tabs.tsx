"use client";

import { useState } from "react";
import { AnalyticsBrowser, type AnalyticsSale, type AnalyticsBooking } from "@/components/analytics-browser";
import { CommissionRatesBrowser, type CommissionService } from "@/components/commission-rates-browser";

type Tab = "overview" | "commission";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
        active
          ? "border border-[#a97e2e] bg-surface text-accent-gold"
          : "border border-transparent text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

export function AnalyticsTabs({
  sales,
  bookings,
  commissionServices,
}: {
  sales: AnalyticsSale[];
  bookings: AnalyticsBooking[];
  commissionServices: CommissionService[];
}) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
          Overview
        </TabButton>
        <TabButton active={tab === "commission"} onClick={() => setTab("commission")}>
          Commission
        </TabButton>
      </div>

      {tab === "overview" && <AnalyticsBrowser sales={sales} bookings={bookings} />}

      {tab === "commission" && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="rounded-lg border border-[#a97e2e] bg-surface px-3 py-1.5 text-[11px] font-bold text-accent-gold">
              Rates
            </span>
          </div>
          <CommissionRatesBrowser services={commissionServices} />
        </div>
      )}
    </div>
  );
}
