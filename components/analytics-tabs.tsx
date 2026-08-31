"use client";

import { useState } from "react";
import { useStaffSim } from "@/lib/staff-context";
import { AnalyticsBrowser, type AnalyticsSale, type AnalyticsBooking } from "@/components/analytics-browser";
import { CommissionRatesBrowser, type CommissionService } from "@/components/commission-rates-browser";
import { CommissionReportBrowser } from "@/components/commission-report-browser";

type Tab = "sales" | "most-availed" | "top-clients" | "top-thera" | "commission";
type CommissionSubTab = "rates" | "report";

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
  const { currentRole } = useStaffSim();
  const [tab, setTab] = useState<Tab>("sales");
  const [commissionSubTab, setCommissionSubTab] = useState<CommissionSubTab>("rates");
  const [commissionFilter, setCommissionFilter] = useState<{ id: string; name: string } | null>(
    null
  );

  if (currentRole !== "Owner") {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted max-w-md">
        Analytics is Owner-only. Sign in with an Owner account to view this
        page.
      </div>
    );
  }

  function handleViewCommission(therapistId: string, therapistName: string) {
    setCommissionFilter({ id: therapistId, name: therapistName });
    setCommissionSubTab("report");
    setTab("commission");
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <TabButton active={tab === "sales"} onClick={() => setTab("sales")}>
          Sales
        </TabButton>
        <TabButton active={tab === "most-availed"} onClick={() => setTab("most-availed")}>
          Most Availed Services
        </TabButton>
        <TabButton active={tab === "top-clients"} onClick={() => setTab("top-clients")}>
          Top Clients
        </TabButton>
        <TabButton active={tab === "top-thera"} onClick={() => setTab("top-thera")}>
          Top Thera
        </TabButton>
        <TabButton active={tab === "commission"} onClick={() => setTab("commission")}>
          Commission
        </TabButton>
      </div>

      {tab === "sales" && <AnalyticsBrowser sales={sales} bookings={bookings} section="sales" />}
      {tab === "most-availed" && (
        <AnalyticsBrowser sales={sales} bookings={bookings} section="most-availed" />
      )}
      {tab === "top-clients" && (
        <AnalyticsBrowser sales={sales} bookings={bookings} section="top-clients" />
      )}
      {tab === "top-thera" && (
        <AnalyticsBrowser
          sales={sales}
          bookings={bookings}
          section="top-thera"
          onViewCommission={handleViewCommission}
        />
      )}

      {tab === "commission" && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <TabButton
              active={commissionSubTab === "rates"}
              onClick={() => setCommissionSubTab("rates")}
            >
              Rates
            </TabButton>
            <TabButton
              active={commissionSubTab === "report"}
              onClick={() => setCommissionSubTab("report")}
            >
              Report
            </TabButton>
          </div>
          {commissionSubTab === "rates" && (
            <CommissionRatesBrowser services={commissionServices} />
          )}
          {commissionSubTab === "report" && (
            <CommissionReportBrowser
              filterTherapist={commissionFilter}
              onClearFilter={() => setCommissionFilter(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
