"use client";

import { useCallback, useEffect, useState, useTransition, useMemo } from "react";
import { useStaffSim } from "@/lib/staff-context";
import { getCommissionReport, type CommissionReportRow } from "@/app/(staff)/analytics/actions";
import { spaDayNow, spaMonthNow } from "@/lib/analytics/spa-day";
import { createClient } from "@/lib/supabase/client";
import { TherapistProfileDrawer } from "@/components/therapist-profile-drawer";

function peso(n: number): string {
  return `₱${Math.round(n).toLocaleString("en-PH")}`;
}

type Preset = "1-15" | "16-eom" | "custom";

function monthBounds(spaMonth: string): { first: string; last: string } {
  const [y, m] = spaMonth.split("-").map(Number);
  const first = `${spaMonth}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${spaMonth}-${String(lastDay).padStart(2, "0")}`;
  return { first, last };
}

function presetRange(preset: Preset): { start: string; end: string } {
  const spaMonth = spaMonthNow();
  const { first, last } = monthBounds(spaMonth);
  if (preset === "1-15") return { start: first, end: `${spaMonth}-15` };
  if (preset === "16-eom") return { start: `${spaMonth}-16`, end: last };
  return { start: spaDayNow(), end: spaDayNow() };
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatCutoffRange(startStr: string, endStr: string): string {
  if (!startStr || !endStr) return `${startStr} to ${endStr}`;
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);

  if (!sy || !sm || !sd || !ey || !em || !ed) return `${startStr} to ${endStr}`;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const startMonth = months[sm - 1];
  const endMonth = months[em - 1];

  if (sy === ey && sm === em) {
    return `${startMonth} ${sd} - ${ed}, ${sy}`;
  }
  if (sy === ey) {
    return `${startMonth} ${sd} - ${endMonth} ${ed}, ${sy}`;
  }
  return `${startMonth} ${sd}, ${sy} - ${endMonth} ${ed}, ${ey}`;
}

function formatCoveredPeriod(startStr: string, endStr: string): string {
  if (!startStr || !endStr) return `${startStr}–${endStr}`;
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return `${startStr}–${endStr}`;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const sMonth = months[sm - 1];
  const eMonth = months[em - 1];
  const sDay = String(sd).padStart(2, "0");
  const eDay = String(ed).padStart(2, "0");
  if (sy === ey && sm === em) {
    return `${sMonth} ${sDay}–${eDay}`;
  }
  if (sy === ey) {
    return `${sMonth} ${sDay}–${eMonth} ${eDay}`;
  }
  return `${sMonth} ${sDay}, ${sy}–${eMonth} ${eDay}, ${ey}`;
}

function compareCommissionRows(a: CommissionReportRow, b: CommissionReportRow): number {
  if (b.bookingsCount !== a.bookingsCount) {
    return b.bookingsCount - a.bookingsCount;
  }
  if (b.total !== a.total) {
    return b.total - a.total;
  }
  if (b.commission !== a.commission) {
    return b.commission - a.commission;
  }
  return a.therapistName.localeCompare(b.therapistName);
}

export type CommissionPayoutItem = {
  id: string;
  therapist_id: string;
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
  disbursed_by: string | null;
};

export function CommissionReportBrowser({
  filterTherapist,
  onClearFilter,
}: {
  filterTherapist?: { id: string; name: string } | null;
  onClearFilter?: () => void;
} = {}) {
  const { currentRole, sessionStaff } = useStaffSim();
  const [preset, setPreset] = useState<Preset>("1-15");
  const [range, setRange] = useState(() => presetRange("1-15"));
  const [rows, setRows] = useState<CommissionReportRow[] | null>(null);
  const [payouts, setPayouts] = useState<Record<string, CommissionPayoutItem>>({});
  const [grand, setGrand] = useState<{ total: number; commission: number; bookings: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Modal states
  const [disbursingRow, setDisbursingRow] = useState<CommissionReportRow | null>(null);
  const [deductions, setDeductions] = useState<string>("0");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "gcash">("cash");
  const [disbursementNotes, setDisbursementNotes] = useState<string>("");
  const [isSubmittingPayout, setIsSubmittingPayout] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  // Slip modal state
  const [slipData, setSlipData] = useState<{
    therapistName: string;
    payout: CommissionPayoutItem;
  } | null>(null);

  // Batch modal state
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [isBatchDisbursing, setIsBatchDisbursing] = useState(false);

  // Therapist Profile Drawer state
  const [drawerTarget, setDrawerTarget] = useState<{
    therapistId: string;
    therapistName: string;
    therapistArchived?: boolean;
    cutoffRank?: number | null;
    bookingsCount?: number;
    commission?: number;
    status?: "claimed" | "unclaimed";
  } | null>(null);

  function handlePreset(p: Preset) {
    setPreset(p);
    setRange(presetRange(p));
  }

  const handleGenerate = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await getCommissionReport(range.start, range.end);
      if (!result.ok) {
        setError(result.error);
        setRows(null);
        setGrand(null);
        return;
      }
      setRows(result.rows);
      setGrand({ total: result.grandTotal, commission: result.grandCommission, bookings: result.grandBookings });

      // Fetch existing commission payouts for this period (overlapping or covering)
      const supabase = createClient();
      const { data: payoutsData, error: payoutsErr } = await supabase
        .from("commission_payouts")
        .select("*")
        .lte("period_start", range.end)
        .gte("period_end", range.start);

      if (!payoutsErr && payoutsData) {
        const pMap: Record<string, CommissionPayoutItem> = {};
        for (const p of payoutsData) {
          if (p.period_start <= range.end && p.period_end >= range.start) {
            const existing = pMap[p.therapist_id];
            if (!existing) {
              pMap[p.therapist_id] = p as CommissionPayoutItem;
            } else {
              const isExact = p.period_start === range.start && p.period_end === range.end;
              const existingIsExact = existing.period_start === range.start && existing.period_end === range.end;
              if (isExact && !existingIsExact) {
                pMap[p.therapist_id] = p as CommissionPayoutItem;
              } else if (p.status === "claimed" && existing.status !== "claimed") {
                pMap[p.therapist_id] = p as CommissionPayoutItem;
              }
            }
          }
        }
        setPayouts(pMap);
      }
    });
  }, [range.start, range.end]);

  useEffect(() => {
    if (!filterTherapist) return;
    const timer = setTimeout(handleGenerate, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterTherapist?.id]);

  const displayRows = filterTherapist
    ? (rows ?? []).filter((r) => r.therapistId === filterTherapist.id)
    : rows;

  const displayGrand =
    filterTherapist && rows
      ? (() => {
          const filtered = rows.filter((r) => r.therapistId === filterTherapist.id);
          return {
            total: filtered.reduce((s, r) => s + r.total, 0),
            commission: filtered.reduce((s, r) => s + r.commission, 0),
            bookings: filtered.reduce((s, r) => s + r.bookingsCount, 0),
          };
        })()
      : grand;

  // Rank map sorted by bookings count in cutoff descending (with tie-breakers)
  const rankMap = useMemo(() => {
    if (!rows) return new Map<string, number>();
    const sorted = [...rows].sort(compareCommissionRows);
    const map = new Map<string, number>();
    sorted.forEach((r, idx) => {
      map.set(r.therapistId, idx + 1);
    });
    return map;
  }, [rows]);

  const sortedDisplayRows = useMemo(() => {
    if (!displayRows) return null;
    return [...displayRows].sort(compareCommissionRows);
  }, [displayRows]);

  // Count unclaimed in current visible rows
  const unclaimedRows = useMemo(() => {
    if (!sortedDisplayRows) return [];
    return sortedDisplayRows.filter((r) => {
      const p = payouts[r.therapistId];
      return !p || p.status === "unclaimed";
    });
  }, [sortedDisplayRows, payouts]);

  const totalUnclaimedCommission = useMemo(() => {
    return unclaimedRows.reduce((sum, r) => sum + r.commission, 0);
  }, [unclaimedRows]);

  // Open disbursement modal
  function handleOpenDisburse(row: CommissionReportRow) {
    setDisbursingRow(row);
    setDeductions("0");
    setPaymentMethod("cash");
    setDisbursementNotes("");
    setPayoutError(null);
  }

  // Submit single disbursement or top-up balance
  async function handleSubmitDisbursement() {
    if (!disbursingRow) return;
    setIsSubmittingPayout(true);
    setPayoutError(null);

    const deductionsNum = Math.max(0, Number(deductions) || 0);
    const existingPayout = payouts[disbursingRow.therapistId];
    const isBalanceTopUp = Boolean(
      existingPayout &&
      existingPayout.status === "claimed" &&
      disbursingRow.commission > existingPayout.gross_commission
    );

    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || null;

    let payload: {
      id?: string;
      therapist_id: string;
      period_start: string;
      period_end: string;
      total_bookings: number;
      gross_commission: number;
      deductions: number;
      net_payout: number;
      payment_method: "cash" | "gcash";
      status: "claimed";
      notes: string | null;
      disbursed_at: string;
      disbursed_by: string | null;
    };

    if (isBalanceTopUp && existingPayout) {
      const grossBalance = disbursingRow.commission - existingPayout.gross_commission;
      const netHandedOver = Math.max(0, grossBalance - deductionsNum);
      const totalDeductions = Number(existingPayout.deductions || 0) + deductionsNum;
      const totalNetPayout = Number(existingPayout.net_payout || 0) + netHandedOver;

      const trimmedNotes = disbursementNotes.trim();
      let updatedNotes = existingPayout.notes || "";
      if (trimmedNotes) {
        updatedNotes = updatedNotes
          ? `${updatedNotes} | Top-up: ${trimmedNotes}`
          : `Top-up: ${trimmedNotes}`;
      } else if (!updatedNotes) {
        updatedNotes = "Balance top-up disbursed";
      }

      payload = {
        id: existingPayout.id,
        therapist_id: disbursingRow.therapistId,
        period_start: range.start,
        period_end: range.end,
        total_bookings: disbursingRow.bookingsCount,
        gross_commission: disbursingRow.commission,
        deductions: totalDeductions,
        net_payout: totalNetPayout,
        payment_method: paymentMethod,
        status: "claimed",
        notes: updatedNotes || null,
        disbursed_at: new Date().toISOString(),
        disbursed_by: userId,
      };
    } else {
      const netPayout = Math.max(0, disbursingRow.commission - deductionsNum);
      payload = {
        therapist_id: disbursingRow.therapistId,
        period_start: range.start,
        period_end: range.end,
        total_bookings: disbursingRow.bookingsCount,
        gross_commission: disbursingRow.commission,
        deductions: deductionsNum,
        net_payout: netPayout,
        payment_method: paymentMethod,
        status: "claimed",
        notes: disbursementNotes.trim() || null,
        disbursed_at: new Date().toISOString(),
        disbursed_by: userId,
      };
    }

    const { data, error: insertErr } = await supabase
      .from("commission_payouts")
      .upsert(payload, { onConflict: "therapist_id,period_start,period_end" })
      .select()
      .single();

    setIsSubmittingPayout(false);

    if (insertErr) {
      setPayoutError(insertErr.message);
      return;
    }

    // Optimistic UI update
    setPayouts((prev) => ({
      ...prev,
      [disbursingRow.therapistId]: data as CommissionPayoutItem,
    }));
    setDisbursingRow(null);
  }

  // Batch mark all as disbursed
  async function handleBatchDisburse() {
    const validUnclaimed = unclaimedRows.filter((r) => {
      const p = payouts[r.therapistId];
      const isCovered = p && p.status === "claimed" && p.period_start <= range.end && p.period_end >= range.start;
      return !isCovered;
    });

    if (validUnclaimed.length === 0) return;
    setIsBatchDisbursing(true);

    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || null;
    const nowIso = new Date().toISOString();

    const batchPayloads = validUnclaimed.map((r) => ({
      therapist_id: r.therapistId,
      period_start: range.start,
      period_end: range.end,
      total_bookings: r.bookingsCount,
      gross_commission: r.commission,
      deductions: 0,
      net_payout: r.commission,
      payment_method: "cash" as const,
      status: "claimed" as const,
      notes: "Batch marked as disbursed",
      disbursed_at: nowIso,
      disbursed_by: userId,
    }));

    const { data, error: batchErr } = await supabase
      .from("commission_payouts")
      .upsert(batchPayloads, { onConflict: "therapist_id,period_start,period_end" })
      .select();

    setIsBatchDisbursing(false);
    setShowBatchConfirm(false);

    if (batchErr) {
      setError(`Batch disbursement failed: ${batchErr.message}`);
      return;
    }

    if (data) {
      setPayouts((prev) => {
        const next = { ...prev };
        for (const item of data) {
          next[item.therapist_id] = item as CommissionPayoutItem;
        }
        return next;
      });
    }
  }

  function renderRankPill(rank: number) {
    if (rank === 1) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-bold text-amber-400 whitespace-nowrap">
          Top 1
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-400/40 bg-slate-400/15 px-2 py-0.5 text-[10.5px] font-bold text-slate-300 whitespace-nowrap">
          Top 2
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-700/40 bg-amber-700/15 px-2 py-0.5 text-[10.5px] font-bold text-amber-600 whitespace-nowrap">
          Top 3
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[10.5px] font-semibold text-muted whitespace-nowrap">
        #{rank}
      </span>
    );
  }

  if (currentRole !== "Owner") {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted max-w-md">
        Commission is Owner-only. Sign in with an Owner account to view this
        page.
      </div>
    );
  }

  return (
    <div>
      {/* Top Filter and Controls Bar */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {(["1-15", "16-eom", "custom"] as Preset[]).map((p) => (
            <button
              key={p}
              onClick={() => handlePreset(p)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                preset === p
                  ? "border border-[#a97e2e] bg-surface text-accent-gold"
                  : "border border-border text-muted hover:text-foreground"
              }`}
            >
              {p === "1-15" ? "1–15" : p === "16-eom" ? "16–EOM" : "Custom"}
            </button>
          ))}

          <input
            type="date"
            value={range.start}
            onChange={(e) => {
              setPreset("custom");
              setRange((r) => ({ ...r, start: e.target.value }));
            }}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 font-mono text-[11.5px] text-foreground outline-none focus:border-gold"
          />
          <span className="text-[11px] text-muted">to</span>
          <input
            type="date"
            value={range.end}
            onChange={(e) => {
              setPreset("custom");
              setRange((r) => ({ ...r, end: e.target.value }));
            }}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 font-mono text-[11.5px] text-foreground outline-none focus:border-gold"
          />

          <button
            onClick={handleGenerate}
            disabled={isPending}
            className="rounded-lg border border-[#a97e2e] bg-surface px-3 py-1.5 text-[11px] font-bold text-accent-gold transition hover:bg-[#c89b3c]/10 disabled:opacity-50"
          >
            {isPending ? "Generating..." : "Generate"}
          </button>
        </div>

        {/* Batch Mark All as Disbursed Helper */}
        {sortedDisplayRows && sortedDisplayRows.length > 0 && unclaimedRows.length > 0 && (
          <button
            onClick={() => setShowBatchConfirm(true)}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11.5px] font-bold text-amber-400 transition hover:bg-amber-500/20 flex items-center gap-1.5"
          >
            <span>Mark All as Disbursed</span>
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px]">
              {unclaimedRows.length}
            </span>
          </button>
        )}
      </div>

      {filterTherapist && (
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded-lg border border-[#a97e2e] bg-surface px-3 py-1.5 text-[11px] font-bold text-accent-gold flex items-center">
            Filtering: {filterTherapist.name}
            <button
              onClick={onClearFilter}
              className="ml-2 text-muted hover:text-foreground text-sm font-bold"
              aria-label="Clear therapist filter"
            >
              ×
            </button>
          </span>
        </div>
      )}

      {error && <div className="mb-4 text-[11px] text-accent-red">{error}</div>}

      {/* Commission Table */}
      {sortedDisplayRows && displayGrand && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-muted">
                <th className="px-4 py-3 font-bold">Rank</th>
                <th className="px-4 py-3 font-bold">Therapist</th>
                <th className="px-4 py-3 font-bold">Bookings</th>
                <th className="px-4 py-3 font-bold">Breakdown</th>
                <th className="px-4 py-3 font-bold">Total</th>
                <th className="px-4 py-3 font-bold">Commission</th>
                <th className="px-4 py-3 font-bold">Payout Status</th>
                <th className="px-4 py-3 font-bold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedDisplayRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted">
                    No bookings in this range.
                  </td>
                </tr>
              )}
              {sortedDisplayRows.map((row) => {
                const rank = rankMap.get(row.therapistId) ?? 99;
                const payout = payouts[row.therapistId];
                const isClaimed = payout?.status === "claimed";
                const isPartial = Boolean(isClaimed && payout && row.commission > payout.gross_commission);
                const remainingBalance = isPartial && payout ? row.commission - payout.gross_commission : 0;

                return (
                  <tr key={row.therapistId} className="border-b border-border last:border-0 hover:bg-background/40 transition">
                    {/* Rank */}
                    <td className="px-4 py-3">
                      {renderRankPill(rank)}
                    </td>

                    {/* Therapist (Clickable for Profile Drawer) */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          setDrawerTarget({
                            therapistId: row.therapistId,
                            therapistName: row.therapistName,
                            therapistArchived: row.therapistArchived,
                            cutoffRank: rank,
                            bookingsCount: row.bookingsCount,
                            commission: row.commission,
                            status: isClaimed && !isPartial ? "claimed" : "unclaimed",
                          })
                        }
                        className="text-left font-bold text-foreground hover:text-accent-gold hover:underline transition flex items-center gap-1.5"
                        title="Click to view detailed therapist profile"
                      >
                        <span>{row.therapistName}</span>
                        {row.therapistArchived && (
                          <span className="text-muted font-normal text-[11px]">(Archived)</span>
                        )}
                      </button>
                    </td>

                    {/* Bookings Count */}
                    <td className="px-4 py-3 font-mono font-medium">{row.bookingsCount}</td>

                    {/* Breakdown */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {row.lines.map((line) => (
                          <span
                            key={line.serviceId}
                            className="rounded-lg border border-border bg-background px-2 py-1 text-[11px]"
                            title={line.rateNotSet ? "No commission rate configured for this service" : undefined}
                          >
                            {line.serviceName} ×{line.count}
                            {line.rateNotSet ? (
                              <span className="ml-1 italic text-muted">(Not set)</span>
                            ) : (
                              <span className="ml-1 text-muted">
                                ({line.rateType === "flat" ? `₱${line.rateValue}` : `${line.rateValue}%`})
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Total Price */}
                    <td className="px-4 py-3 font-mono">{peso(row.total)}</td>

                    {/* Gross Commission */}
                    <td className="px-4 py-3 text-accent-gold font-bold font-mono">{peso(row.commission)}</td>

                    {/* Payout Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {isPartial && payout ? (
                        <span
                          title={`Remaining balance: ${peso(remainingBalance)}`}
                          className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400 cursor-help"
                        >
                          🟡 Partial ({peso(payout.gross_commission)} paid)
                        </span>
                      ) : isClaimed && payout ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                          {payout.period_start !== range.start || payout.period_end !== range.end ? (
                            `🟢 Claimed (Covered in ${formatCoveredPeriod(payout.period_start, payout.period_end)})`
                          ) : (
                            `🟢 Claimed ${payout.disbursed_at ? `(${formatDateShort(payout.disbursed_at)})` : ""}`
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
                          🟡 Unclaimed
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {isPartial && payout ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenDisburse(row)}
                            className="rounded-lg border border-[#a97e2e] bg-[#c89b3c]/15 px-2.5 py-1 text-[11px] font-bold text-accent-gold transition hover:bg-[#c89b3c]/25"
                          >
                            Pay Balance {peso(remainingBalance)}
                          </button>
                          <button
                            onClick={() =>
                              setSlipData({
                                therapistName: row.therapistName,
                                payout,
                              })
                            }
                            title="Inspect previous disbursement slip"
                            className="rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-semibold text-muted hover:border-gold hover:text-foreground transition flex items-center gap-1"
                          >
                            <span>📄</span>
                            <span>Slip</span>
                          </button>
                        </div>
                      ) : isClaimed && payout ? (
                        <button
                          onClick={() =>
                            setSlipData({
                              therapistName: row.therapistName,
                              payout,
                            })
                          }
                          className="rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted hover:border-gold hover:text-foreground transition"
                        >
                          View Slip
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOpenDisburse(row)}
                          className="rounded-lg border border-[#a97e2e] bg-surface px-2.5 py-1 text-[11px] font-bold text-accent-gold transition hover:bg-[#c89b3c]/15"
                        >
                          Record Release
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {sortedDisplayRows.length > 0 && (
              <tfoot>
                <tr className="border-t border-border font-bold">
                  <td className="px-4 py-3 text-muted text-xs">—</td>
                  <td className="px-4 py-3 text-foreground">Grand Total</td>
                  <td className="px-4 py-3 font-mono">{displayGrand.bookings}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 font-mono">{peso(displayGrand.total)}</td>
                  <td className="px-4 py-3 text-accent-gold font-mono">{peso(displayGrand.commission)}</td>
                  <td className="px-4 py-3 text-muted text-[11px]">
                    {(() => {
                      const fullyClaimedCount = sortedDisplayRows.filter((r) => {
                        const p = payouts[r.therapistId];
                        return p?.status === "claimed" && r.commission <= p.gross_commission;
                      }).length;
                      const partialCount = sortedDisplayRows.filter((r) => {
                        const p = payouts[r.therapistId];
                        return p?.status === "claimed" && r.commission > p.gross_commission;
                      }).length;
                      if (partialCount > 0) {
                        return `${fullyClaimedCount} claimed · ${partialCount} partial`;
                      }
                      return `${fullyClaimedCount} claimed`;
                    })()}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Commission Disbursement Modal */}
      {disbursingRow && (() => {
        const existingPayout = payouts[disbursingRow.therapistId];
        const isBalanceTopUp = Boolean(
          existingPayout &&
          existingPayout.status === "claimed" &&
          disbursingRow.commission > existingPayout.gross_commission
        );
        const disbursingRank = rankMap.get(disbursingRow.therapistId);
        const rankLabel = disbursingRank ? `Top ${disbursingRank} Therapist` : "Therapist";

        // Calculation figures
        const prevGross = existingPayout ? existingPayout.gross_commission : 0;
        const prevSessions = existingPayout ? existingPayout.total_bookings : 0;
        const currentGross = disbursingRow.commission;
        const currentSessions = disbursingRow.bookingsCount;
        const newSessions = Math.max(0, currentSessions - prevSessions);
        const balanceGross = Math.max(0, currentGross - prevGross);
        const deductionsNum = Math.max(0, Number(deductions) || 0);
        const netHandedOver = isBalanceTopUp
          ? Math.max(0, balanceGross - deductionsNum)
          : Math.max(0, currentGross - deductionsNum);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => !isSubmittingPayout && setDisbursingRow(null)}
            />
            <div className="relative z-10 w-full max-w-md bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-2xl space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
              {/* Voucher Banner */}
              {isBalanceTopUp && existingPayout ? (
                <div className="flex items-center justify-between rounded-xl bg-stone-950/60 border border-stone-800/80 p-3.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-white leading-tight">
                        Disburse Remaining Balance
                      </h2>
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                        Top-up
                      </span>
                    </div>
                    <p className="text-xs text-stone-200 font-semibold mt-1">
                      {disbursingRow.therapistName}
                    </p>
                    <p className="text-[11.5px] text-stone-400 mt-0.5">
                      {peso(prevGross)} previously released for {prevSessions} {prevSessions === 1 ? "session" : "sessions"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-semibold text-stone-500 tracking-wider block">
                      Cutoff Period
                    </span>
                    <span className="text-xs text-stone-400 font-mono">
                      {formatCutoffRange(range.start, range.end)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-xl bg-stone-950/60 border border-stone-800/80 p-3.5">
                  <div>
                    <h2 className="text-lg font-bold text-white leading-tight">
                      {disbursingRow.therapistName}
                    </h2>
                    <p className="text-xs text-stone-400 mt-1">
                      {rankLabel} · {disbursingRow.bookingsCount} Sessions
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-semibold text-stone-500 tracking-wider block">
                      Cutoff Period
                    </span>
                    <span className="text-xs text-stone-400 font-mono">
                      {formatCutoffRange(range.start, range.end)}
                    </span>
                  </div>
                </div>
              )}

              {/* Unified Financial Computation Block */}
              {isBalanceTopUp && existingPayout ? (
                <div className="bg-stone-950/80 border border-stone-800 rounded-xl p-3.5 space-y-2.5 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-stone-400 text-xs">
                      Total Current Gross ({currentSessions} {currentSessions === 1 ? "session" : "sessions"})
                    </span>
                    <span className="text-stone-200 text-sm font-semibold text-right">
                      {peso(currentGross)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-400">
                      Less Previously Disbursed
                    </span>
                    <span className="text-stone-400 font-medium text-right">
                      - {peso(prevGross)}
                    </span>
                  </div>
                  <div className="border-t border-stone-800/80" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-amber-400/90 font-medium">
                      New Gross Balance to Hand Over ({newSessions} {newSessions === 1 ? "new session" : "new sessions"})
                    </span>
                    <span className="text-amber-400 font-semibold text-right">
                      {peso(balanceGross)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-400 text-xs">Less: Vale / Deductions</span>
                    <div className="flex items-center gap-1.5 text-rose-400 font-mono text-xs font-bold">
                      <span>- ₱</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={deductions}
                        onChange={(e) => setDeductions(e.target.value)}
                        placeholder="0"
                        className="text-rose-400 bg-stone-900 border border-stone-700 rounded px-2 py-1 text-right w-28 text-xs font-mono font-bold focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="border-t border-stone-800/80" />
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-xs text-amber-500/90 font-bold uppercase tracking-wider">
                      NET HANDED OVER
                    </span>
                    <span className="text-2xl font-bold font-mono text-amber-400 text-right">
                      {peso(netHandedOver)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-stone-950/80 border border-stone-800 rounded-xl p-3.5 space-y-2.5 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-stone-400 text-xs">Total Gross Commission</span>
                    <span className="text-stone-200 text-sm font-semibold text-right">
                      {peso(disbursingRow.commission)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-400 text-xs">Less: Vale / Deductions</span>
                    <div className="flex items-center gap-1.5 text-rose-400 font-mono text-xs font-bold">
                      <span>- ₱</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={deductions}
                        onChange={(e) => setDeductions(e.target.value)}
                        placeholder="0"
                        className="text-rose-400 bg-stone-900 border border-stone-700 rounded px-2 py-1 text-right w-28 text-xs font-mono font-bold focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="border-t border-stone-800/80" />
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-xs text-amber-500/90 font-bold uppercase tracking-wider">
                      NET HANDED OVER
                    </span>
                    <span className="text-2xl font-bold font-mono text-amber-400 text-right">
                      {peso(Math.max(0, disbursingRow.commission - (Number(deductions) || 0)))}
                    </span>
                  </div>
                </div>
              )}

              {/* Disbursement Channel */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-300">
                  Disbursement Channel
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("cash")}
                    className={`rounded-xl border py-2 px-3 text-xs font-bold transition flex items-center justify-center gap-2 ${
                      paymentMethod === "cash"
                        ? "border-amber-500/60 bg-amber-500/15 text-amber-400"
                        : "border-stone-800 bg-stone-950/60 text-stone-400 hover:text-stone-200 hover:border-stone-700"
                    }`}
                  >
                    <span>💵</span>
                    <span>Cash (Direct)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("gcash")}
                    className={`rounded-xl border py-2 px-3 text-xs font-bold transition flex items-center justify-center gap-2 ${
                      paymentMethod === "gcash"
                        ? "border-amber-500/60 bg-amber-500/15 text-amber-400"
                        : "border-stone-800 bg-stone-950/60 text-stone-400 hover:text-stone-200 hover:border-stone-700"
                    }`}
                  >
                    <span>📱</span>
                    <span>GCash Transfer</span>
                  </button>
                </div>
              </div>

              {/* Notes / Ref */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-300">
                  Notes / Reference (Optional)
                </label>
                <input
                  type="text"
                  value={disbursementNotes}
                  onChange={(e) => setDisbursementNotes(e.target.value)}
                  placeholder={
                    isBalanceTopUp
                      ? "e.g. Balance settled / Ref 102948"
                      : "e.g. Paid at front desk / Ref 102948"
                  }
                  className="w-full rounded-xl border border-stone-800 bg-stone-950/60 px-3 py-2 text-xs text-stone-200 placeholder-stone-500 outline-none focus:border-amber-500"
                />
              </div>

              {payoutError && (
                <div className="text-xs text-rose-400 text-center font-medium">{payoutError}</div>
              )}

              {/* Audit Footnote */}
              <p className="text-[11px] text-stone-500 text-center leading-normal">
                ℹ️ Audit tracking only — does not deduct from daily sales or drawer cash.
              </p>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDisbursingRow(null)}
                  disabled={isSubmittingPayout}
                  className="rounded-xl border border-stone-800 bg-stone-950/40 px-4 py-2 text-xs font-bold text-stone-400 hover:text-stone-200 hover:border-stone-700 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitDisbursement}
                  disabled={isSubmittingPayout}
                  className="rounded-xl border border-amber-500 bg-amber-500 px-4 py-2 text-xs font-bold text-stone-950 transition hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50"
                >
                  {isSubmittingPayout
                    ? "Saving..."
                    : isBalanceTopUp
                    ? "Confirm & Disburse Balance"
                    : "Confirm & Disburse"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* View Slip Modal */}
      {slipData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSlipData(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Commission Disbursement Voucher
                </h2>
                <p className="text-xs text-muted">
                  Official Record Slip
                </p>
              </div>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10.5px] font-bold text-emerald-400">
                Disbursed
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-border/50">
                <span className="text-muted">Therapist:</span>
                <span className="font-bold text-foreground">{slipData.therapistName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span className="text-muted">Cutoff Window:</span>
                <span className="font-mono text-foreground">
                  {formatCutoffRange(slipData.payout.period_start, slipData.payout.period_end)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span className="text-muted">Sessions Completed:</span>
                <span className="font-mono text-foreground">{slipData.payout.total_bookings}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span className="text-muted">Gross Commission:</span>
                <span className="font-mono font-medium text-foreground">{peso(slipData.payout.gross_commission)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span className="text-muted">Vale / Deductions:</span>
                <span className="font-mono text-accent-red font-medium">-{peso(slipData.payout.deductions)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border/50 items-center">
                <span className="text-muted font-semibold">Net Payout Handed:</span>
                <span className="font-mono font-bold text-base text-accent-gold">{peso(slipData.payout.net_payout)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span className="text-muted">Payment Channel:</span>
                <span className="font-medium text-foreground">
                  {slipData.payout.payment_method === "gcash" ? "GCash Transfer" : "Cash (Direct)"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span className="text-muted">Disbursed At:</span>
                <span className="font-mono text-foreground text-[11px]">
                  {slipData.payout.disbursed_at ? new Date(slipData.payout.disbursed_at).toLocaleString("en-PH") : "—"}
                </span>
              </div>
              {slipData.payout.notes && (
                <div className="pt-1">
                  <span className="text-muted block mb-1">Notes:</span>
                  <div className="rounded-lg border border-border bg-background p-2 text-foreground text-[11.5px]">
                    {slipData.payout.notes}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSlipData(null)}
                className="w-full rounded-xl border border-border bg-background py-2 text-xs font-bold text-foreground hover:bg-surface transition"
              >
                Close Slip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Disburse Confirmation Modal */}
      {showBatchConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !isBatchDisbursing && setShowBatchConfirm(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-base font-bold text-foreground">
              Confirm Batch Disbursement
            </h2>
            <p className="text-xs text-muted leading-relaxed">
              Are you sure you want to mark all{" "}
              <strong className="text-foreground">{unclaimedRows.length} unclaimed therapists</strong> as disbursed for
              cutoff period <span className="font-mono font-bold text-foreground">{range.start}</span> to{" "}
              <span className="font-mono font-bold text-foreground">{range.end}</span>?
            </p>

            <div className="rounded-xl border border-border bg-background p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted">Total Therapists:</span>
                <span className="font-bold text-foreground">{unclaimedRows.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Total Net Commission:</span>
                <span className="font-mono font-bold text-accent-gold">{peso(totalUnclaimedCommission)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Default Channel:</span>
                <span className="text-foreground">Cash (Direct) with ₱0 deductions</span>
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-300">
              Notice: Payout vouchers can be individually inspected or adjusted after batch recording.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBatchConfirm(false)}
                disabled={isBatchDisbursing}
                className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted hover:text-foreground transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBatchDisburse}
                disabled={isBatchDisbursing}
                className="rounded-xl border border-[#a97e2e] bg-surface px-4 py-2 text-xs font-bold text-accent-gold transition hover:bg-[#c89b3c]/15 disabled:opacity-50"
              >
                {isBatchDisbursing ? "Disbursing..." : "Confirm Batch Release"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Therapist Profile Drawer */}
      {drawerTarget && (
        <TherapistProfileDrawer
          therapistId={drawerTarget.therapistId}
          therapistName={drawerTarget.therapistName}
          therapistArchived={drawerTarget.therapistArchived}
          cutoffRank={drawerTarget.cutoffRank}
          currentCutoff={{ start: range.start, end: range.end }}
          currentCutoffBookings={drawerTarget.bookingsCount}
          currentCutoffCommission={drawerTarget.commission}
          currentCutoffStatus={drawerTarget.status}
          onClose={() => setDrawerTarget(null)}
        />
      )}
    </div>
  );
}
