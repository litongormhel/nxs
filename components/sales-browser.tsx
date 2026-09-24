"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStaffSim } from "@/lib/staff-context";
import { editSale, editSplitSale, voidSale, restoreSale } from "@/app/(staff)/sales/actions";
import { spaDayNow, shiftSpaDay } from "@/lib/analytics/spa-day";

export type Sale = {
  id: string;
  booking_id?: string | null;
  client_name: string;
  is_walkin: boolean;
  service_name: string;
  amount: number;
  payment_method: string;
  payment_ref: string | null;
  promo_label: string | null;
  is_redemption?: boolean;
  therapist_id: string | null;
  therapist_name: string | null;
  voided: boolean;
  voided_by_name: string | null;
  void_reason?: string | null;
  edited_by_name: string | null;
  created_at: string;
};

export type ConsolidatedSale = {
  id: string;
  booking_id: string | null;
  sales: Sale[];
  is_split: boolean;
  is_redemption?: boolean;
  client_name: string;
  is_walkin: boolean;
  service_name: string;
  amount: number;
  promo_label: string | null;
  therapist_id: string | null;
  therapist_name: string | null;
  voided: boolean;
  voided_by_name: string | null;
  void_reason?: string | null;
  edited_by_name: string | null;
  created_at: string;
  cash_amount: number;
  digital_amount: number;
  digital_method: string | null;
  digital_ref: string | null;
};

type Therapist = { id: string; name: string };
type Authorizer = { id: string; name: string };

type PinModalTarget = {
  group: ConsolidatedSale;
  mode: "void" | "restore";
};

const PAYMENT_METHODS = ["Cash", "GCash", "Card", "Points"] as const;

export const STANDARD_VOID_REASONS = [
  "Double booking / Duplicate entry",
  "Client cancelled / No-show",
  "Incorrect service / Amount encoded",
  "Incorrect payment method",
  "Test transaction",
  "Other",
] as const;

function fmtPhtTime(isoString: string, selectedSpaDate: string): string {
  const d = new Date(isoString);
  const phtMs = d.getTime() + 8 * 60 * 60 * 1000;
  const phtDate = new Date(phtMs);

  const y = phtDate.getUTCFullYear();
  const m = String(phtDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(phtDate.getUTCDate()).padStart(2, "0");
  const manilaDateStr = `${y}-${m}-${day}`;

  let hours = phtDate.getUTCHours();
  const minutes = String(phtDate.getUTCMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;

  const timeStr = `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
  if (manilaDateStr > selectedSpaDate) {
    return `${timeStr} (+1d)`;
  }
  return timeStr;
}

/** Returns true if the sale's created_at is more than 3 days (72 h) old. */
function isSaleLapsed(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > 3 * 24 * 60 * 60 * 1000;
}

function isPointsRedemption(sale: ConsolidatedSale): boolean {
  return Boolean(
    sale.is_redemption ||
    sale.sales.some(
      (item) =>
        item.is_redemption ||
        item.payment_method === "Points" ||
        item.payment_ref?.toLowerCase().includes("100 pts") ||
        item.payment_ref?.toLowerCase().includes("redemption")
    ) ||
    sale.promo_label?.toLowerCase().includes("100 pts") ||
    sale.promo_label?.toLowerCase().includes("redemption")
  );
}

const GRID_COLS = "1.1fr 1fr 1fr .9fr 1.1fr .9fr 1fr 1.6fr";

export function SalesBrowser({
  initialSales,
  selectedDate,
  therapists,
  authorizers,
}: {
  initialSales: Sale[];
  selectedDate: string;
  therapists: Therapist[];
  authorizers: Authorizer[];
}) {
  const router = useRouter();
  const { currentRole, sessionStaff } = useStaffSim();

  const [sales, setSales] = useState<Sale[]>(initialSales);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Edit Modal State
  const [editing, setEditing] = useState<ConsolidatedSale | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editPayment, setEditPayment] = useState<(typeof PAYMENT_METHODS)[number]>("Cash");
  const [editRef, setEditRef] = useState("");
  const [editSplitCash, setEditSplitCash] = useState("");
  const [editSplitDigital, setEditSplitDigital] = useState("");
  const [editSplitDigitalMethod, setEditSplitDigitalMethod] = useState<(typeof PAYMENT_METHODS)[number]>("GCash");
  const [editSplitRef, setEditSplitRef] = useState("");
  const [editTherapistId, setEditTherapistId] = useState<string>("");
  const [editError, setEditError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mandatory Security PIN Confirmation Modal State
  const [pinModalTarget, setPinModalTarget] = useState<PinModalTarget | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [selectedVoidReason, setSelectedVoidReason] = useState<string>(STANDARD_VOID_REASONS[0]);
  const [otherReasonDetail, setOtherReasonDetail] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [pinModalError, setPinModalError] = useState<string | null>(null);
  const [pinModalBusy, setPinModalBusy] = useState(false);

  const editAllowed =
    currentRole === "Supervisor" ||
    currentRole === "Owner" ||
    currentRole === "Developer" ||
    currentRole === "developer";

  // Grouping sales rows into consolidated visits (preserving newest-first chronological order)
  const consolidatedSales = useMemo(() => {
    const groupMap = new Map<string, ConsolidatedSale>();

    for (const s of sales) {
      const key = s.booking_id ? `b_${s.booking_id}` : `s_${s.id}`;
      const existing = groupMap.get(key);

      if (existing) {
        existing.sales.push(s);
        existing.amount += s.amount;
        if (s.payment_method === "Cash") {
          existing.cash_amount += s.amount;
        } else {
          existing.digital_amount += s.amount;
          existing.digital_method = s.payment_method;
          if (s.payment_ref) existing.digital_ref = s.payment_ref;
        }
        existing.is_split = true;
        existing.voided = existing.sales.every((item) => item.voided);
        if (s.is_redemption) {
          existing.is_redemption = true;
        }
        if (!existing.promo_label && s.promo_label) {
          existing.promo_label = s.promo_label;
        }
        if (!existing.therapist_name && s.therapist_name) {
          existing.therapist_name = s.therapist_name;
          existing.therapist_id = s.therapist_id;
        }
        if (!existing.edited_by_name && s.edited_by_name) {
          existing.edited_by_name = s.edited_by_name;
        }
        if (!existing.void_reason && s.void_reason) {
          existing.void_reason = s.void_reason;
        }
      } else {
        const isCash = s.payment_method === "Cash";
        groupMap.set(key, {
          id: s.id,
          booking_id: s.booking_id ?? null,
          sales: [s],
          is_split: false,
          is_redemption: Boolean(
            s.is_redemption ||
            s.payment_method === "Points" ||
            s.payment_ref?.toLowerCase().includes("100 pts") ||
            s.payment_ref?.toLowerCase().includes("redemption")
          ),
          client_name: s.client_name,
          is_walkin: s.is_walkin,
          service_name: s.service_name,
          amount: s.amount,
          promo_label: s.promo_label,
          therapist_id: s.therapist_id,
          therapist_name: s.therapist_name,
          voided: s.voided,
          voided_by_name: s.voided_by_name,
          void_reason: s.void_reason,
          edited_by_name: s.edited_by_name,
          created_at: s.created_at,
          cash_amount: isCash ? s.amount : 0,
          digital_amount: !isCash ? s.amount : 0,
          digital_method: !isCash ? s.payment_method : null,
          digital_ref: s.payment_ref,
        });
      }
    }

    return Array.from(groupMap.values());
  }, [sales]);

  const { cashRemit, onlineRemit, totalShiftSales, validSalesCount } = useMemo(() => {
    let cash = 0;
    let online = 0;
    let total = 0;
    for (const s of sales) {
      if (s.voided) continue;
      total += s.amount;
      if (s.payment_method === "Cash") {
        cash += s.amount;
      } else {
        online += s.amount;
      }
    }
    // Count unique client transactions/visits (consolidated rows that are not voided)
    const count = consolidatedSales.filter((g) => !g.voided).length;
    return { cashRemit: cash, onlineRemit: online, totalShiftSales: total, validSalesCount: count };
  }, [sales, consolidatedSales]);

  const handleDateChange = (newDate: string) => {
    if (!newDate) return;
    router.push(`/sales?date=${newDate}`);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2400);
  };

  const openEdit = (group: ConsolidatedSale) => {
    setEditing(group);
    setEditTherapistId(group.therapist_id ?? "");
    setEditError(null);

    if (group.is_split) {
      setEditSplitCash(String(group.cash_amount));
      setEditSplitDigital(String(group.digital_amount));
      setEditSplitDigitalMethod(
        (PAYMENT_METHODS as readonly string[]).includes(group.digital_method ?? "")
          ? (group.digital_method as (typeof PAYMENT_METHODS)[number])
          : "GCash"
      );
      setEditSplitRef(group.digital_ref ?? "");
    } else {
      const single = group.sales[0];
      setEditAmount(String(single?.amount ?? group.amount));
      setEditPayment(
        (PAYMENT_METHODS as readonly string[]).includes(single?.payment_method ?? "")
          ? (single.payment_method as (typeof PAYMENT_METHODS)[number])
          : "Cash"
      );
      setEditRef(single?.payment_ref ?? "");
    }
  };

  const closeEdit = () => setEditing(null);

  const confirmEdit = async () => {
    if (!editing) return;
    setBusy(true);
    setEditError(null);

    try {
      if (editing.is_split) {
        const cashAmt = parseFloat(editSplitCash);
        const digitalAmt = parseFloat(editSplitDigital);
        if (isNaN(cashAmt) || cashAmt < 0 || isNaN(digitalAmt) || digitalAmt < 0) {
          setEditError("Enter valid amounts for both payment portions.");
          setBusy(false);
          return;
        }

        const cashSale = editing.sales.find((s) => s.payment_method === "Cash");
        const digitalSale = editing.sales.find((s) => s.payment_method !== "Cash");

        if (!cashSale || !digitalSale) {
          setEditError("Could not identify split payment records.");
          setBusy(false);
          return;
        }

        const legs = [
          {
            saleId: cashSale.id,
            amount: cashAmt,
            paymentMethod: "Cash",
            paymentRef: null,
          },
          {
            saleId: digitalSale.id,
            amount: digitalAmt,
            paymentMethod: editSplitDigitalMethod,
            paymentRef: editSplitDigitalMethod === "GCash" ? editSplitRef.trim() || null : null,
          },
        ];

        const res = await editSplitSale(legs, editTherapistId || null, sessionStaff?.id ?? "");
        if (!res.ok) {
          const errMsg =
            typeof res.error === "string"
              ? res.error
              : (res.error as any)?.message || "Failed to update split payment.";
          setEditError(errMsg);
          setBusy(false);
          return;
        }

        const therapistName = therapists.find((t) => t.id === editTherapistId)?.name ?? null;
        setSales((prev) =>
          prev.map((s) => {
            if (s.id === cashSale.id) {
              return {
                ...s,
                amount: cashAmt,
                therapist_id: editTherapistId || null,
                therapist_name: therapistName,
                edited_by_name: "You",
              };
            }
            if (s.id === digitalSale.id) {
              return {
                ...s,
                amount: digitalAmt,
                payment_method: editSplitDigitalMethod,
                payment_ref: editSplitDigitalMethod === "GCash" ? editSplitRef.trim() || null : null,
                therapist_id: editTherapistId || null,
                therapist_name: therapistName,
                edited_by_name: "You",
              };
            }
            return s;
          })
        );
        setEditing(null);
        showToast("Sale updated");
        router.refresh();
      } else {
        const amount = parseFloat(editAmount);
        if (isNaN(amount) || amount < 0) {
          setEditError("Enter a valid amount.");
          setBusy(false);
          return;
        }
        const singleSale = editing.sales[0];
        const res = await editSale(
          singleSale.id,
          {
            amount,
            paymentMethod: editPayment,
            paymentRef: editPayment === "GCash" ? editRef.trim() || null : null,
            therapistId: editTherapistId || null,
          },
          sessionStaff?.id ?? ""
        );
        if (!res.ok) {
          const errMsg =
            typeof res.error === "string"
              ? res.error
              : (res.error as any)?.message || "An unexpected error occurred.";
          setEditError(errMsg);
          setBusy(false);
          return;
        }
        const therapistName = therapists.find((t) => t.id === editTherapistId)?.name ?? null;
        setSales((prev) =>
          prev.map((s) =>
            s.id === singleSale.id
              ? {
                  ...s,
                  amount,
                  payment_method: editPayment,
                  payment_ref: editPayment === "GCash" ? editRef.trim() || null : null,
                  therapist_id: editTherapistId || null,
                  therapist_name: therapistName,
                  edited_by_name: "You",
                }
              : s
          )
        );
        setEditing(null);
        showToast("Sale updated");
        router.refresh();
      }
    } catch (err: any) {
      const errMsg = err?.message || "An unexpected error occurred.";
      setEditError(errMsg);
    } finally {
      setBusy(false);
    }
  };

  const openVoidModal = (group: ConsolidatedSale) => {
    setPinModalTarget({ group, mode: "void" });
    setPinInput("");
    setSelectedVoidReason(STANDARD_VOID_REASONS[0]);
    setOtherReasonDetail("");
    setReasonInput("");
    setPinModalError(null);
  };

  const openRestoreModal = (group: ConsolidatedSale) => {
    setPinModalTarget({ group, mode: "restore" });
    setPinInput("");
    setReasonInput("");
    setPinModalError(null);
  };

  const closePinModal = () => {
    setPinModalTarget(null);
    setPinInput("");
    setSelectedVoidReason(STANDARD_VOID_REASONS[0]);
    setOtherReasonDetail("");
    setReasonInput("");
    setPinModalError(null);
  };

  const handleConfirmPinModal = async () => {
    if (!pinModalTarget) return;

    const trimmedPin = pinInput.trim();

    if (!trimmedPin) {
      setPinModalError("Manager / Owner PIN is required.");
      return;
    }

    let effectiveReason = "";
    if (pinModalTarget.mode === "void") {
      if (selectedVoidReason === "Other") {
        const customDetail = otherReasonDetail.trim();
        effectiveReason = customDetail ? `Other: ${customDetail}` : "Other";
      } else {
        effectiveReason = selectedVoidReason;
      }
    } else {
      effectiveReason = reasonInput.trim();
      if (!effectiveReason) {
        setPinModalError("Reason for restore is required.");
        return;
      }
    }

    setPinModalBusy(true);
    setPinModalError(null);

    try {
      const staffId = sessionStaff?.id ?? "";
      const targetSaleIds = pinModalTarget.group.sales.map((s) => s.id);

      if (pinModalTarget.mode === "void") {
        const res = await voidSale({
          saleIds: targetSaleIds,
          pin: trimmedPin,
          reason: effectiveReason,
          staffId,
        });

        if (!res.ok) {
          const errMsg =
            typeof res.error === "string"
              ? res.error
              : (res.error as any)?.message || "An unexpected error occurred.";
          setPinModalError(errMsg);
          return;
        }

        setSales((prev) =>
          prev.map((s) =>
            targetSaleIds.includes(s.id)
              ? {
                  ...s,
                  voided: true,
                  void_reason: effectiveReason,
                  voided_by_name: sessionStaff?.name ?? "Manager",
                }
              : s
          )
        );
        closePinModal();
        showToast("Sale voided successfully");
        router.refresh();
      } else {
        const res = await restoreSale({
          saleIds: targetSaleIds,
          pin: trimmedPin,
          reason: effectiveReason,
          staffId,
        });

        if (!res.ok) {
          const errMsg =
            typeof res.error === "string"
              ? res.error
              : (res.error as any)?.message || "An unexpected error occurred.";
          setPinModalError(errMsg);
          return;
        }

        setSales((prev) =>
          prev.map((s) =>
            targetSaleIds.includes(s.id)
              ? {
                  ...s,
                  voided: false,
                  void_reason: null,
                  voided_by_name: null,
                }
              : s
          )
        );
        closePinModal();
        showToast("Sale restored successfully");
        router.refresh();
      }
    } catch (err: any) {
      const errMsg = err?.message || "An unexpected error occurred.";
      setPinModalError(errMsg);
    } finally {
      setPinModalBusy(false);
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      {/* Top Header & Spa Day Date Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground tracking-tight">
            Daily Sales Remittance
          </h1>
          <p className="text-xs text-muted mt-1">
            Cash shift remittance and transaction tally for Spa Day operational window.
          </p>
        </div>

        {/* Date Selector Navigation */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-surface-2 p-1.5 rounded-xl border border-border">
          <button
            onClick={() => handleDateChange(shiftSpaDay(selectedDate, -1))}
            title="Previous Spa Day"
            className="px-2.5 py-1 text-xs font-semibold text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors cursor-pointer"
          >
            &larr; Prev
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="bg-surface border border-border px-2.5 py-1 text-xs font-mono font-medium text-foreground rounded-lg outline-none focus:border-gold"
          />
          <button
            onClick={() => handleDateChange(spaDayNow())}
            disabled={selectedDate === spaDayNow()}
            className="px-2.5 py-1 text-xs font-semibold text-muted hover:text-foreground hover:bg-surface rounded-lg disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            Today
          </button>
          <button
            onClick={() => handleDateChange(shiftSpaDay(selectedDate, 1))}
            title="Next Spa Day"
            className="px-2.5 py-1 text-xs font-semibold text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors cursor-pointer"
          >
            Next &rarr;
          </button>
        </div>
      </div>

      {/* Shift Remittance Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Cash Remit Card */}
        <div className="rounded-2xl border border-border bg-surface p-4 space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted">
              Cash Remit
            </span>
            <span className="text-[10px] font-medium text-accent-green bg-accent-green/10 px-2 py-0.5 rounded-md">
              Physical Cash
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-accent-green">
            ₱{cashRemit.toLocaleString()}
          </div>
          <div className="text-[11px] text-muted">
            Sum of cash payment transactions
          </div>
        </div>

        {/* Online / E-Wallet Card */}
        <div className="rounded-2xl border border-border bg-surface p-4 space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted">
              Online / E-Wallet
            </span>
            <span className="text-[10px] font-medium text-muted bg-surface-2 px-2 py-0.5 rounded-md">
              GCash / Card / Points
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            ₱{onlineRemit.toLocaleString()}
          </div>
          <div className="text-[11px] text-muted">
            Sum of digital/non-cash sales
          </div>
        </div>

        {/* Total Shift Sales Card */}
        <div className="rounded-2xl border border-gold/40 bg-surface-accent p-4 space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider uppercase text-gold">
              Total Shift Sales
            </span>
            <span className="text-[10px] font-medium text-accent-gold bg-gold/15 px-2 py-0.5 rounded-md">
              {validSalesCount} {validSalesCount === 1 ? "Sale" : "Sales"}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-accent-gold">
            ₱{totalShiftSales.toLocaleString()}
          </div>
          <div className="text-[11px] text-muted">
            Overall total for {selectedDate} Spa Day
          </div>
        </div>
      </div>

      {/* Sales Log Table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden overflow-x-auto">
        <div
          className="grid gap-3 border-b border-border px-4 py-2.5 text-[10px] font-bold tracking-wider uppercase text-muted min-w-[900px]"
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          <div>Time</div>
          <div>Client</div>
          <div>Service</div>
          <div>Amount</div>
          <div>Payment</div>
          <div>Promo</div>
          <div>Therapist</div>
          <div>Actions</div>
        </div>
        {consolidatedSales.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted">
            No sales recorded for Spa Day {selectedDate}.
          </div>
        ) : (
          consolidatedSales.map((s) => (
            <div
              key={s.id}
              className={`grid gap-3 border-b border-border px-4 py-3 text-[12px] last:border-b-0 min-w-[900px] items-center ${
                s.voided ? "opacity-50 bg-white/[0.02]" : ""
              }`}
              style={{ gridTemplateColumns: GRID_COLS }}
            >
              <div className="font-mono text-muted">
                {fmtPhtTime(s.created_at, selectedDate)}
              </div>
              <div className="text-foreground font-medium">{s.client_name}</div>
              <div className="text-foreground">
                {s.service_name}
                {s.voided && (
                  <span className="ml-1.5 rounded bg-accent-red/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent-red">
                    Voided
                  </span>
                )}
              </div>
              <div className={`font-mono font-semibold ${s.voided ? "line-through text-muted" : "text-accent-gold"}`}>
                ₱{s.amount.toLocaleString()}
              </div>
              <div>
                {s.is_split ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
                        SPLIT
                      </span>
                      {isPointsRedemption(s) && (
                        <span className="text-[10px] font-semibold text-accent-gold">
                          Points + Split
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted space-y-0.5 leading-tight">
                      <div>• Cash: ₱{s.cash_amount.toLocaleString()}</div>
                      <div>
                        • {s.digital_method || "Digital"}: ₱{s.digital_amount.toLocaleString()}
                        {s.digital_ref && !s.digital_ref.startsWith("100 pts Reward") && (
                          <span className="ml-1 opacity-60 text-[9.5px] font-mono">(Ref: {s.digital_ref})</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : isPointsRedemption(s) ? (
                  s.amount === 0 ? (
                    <div className="inline-flex items-center gap-1 font-semibold text-accent-gold">
                      <span className="text-xs">⭐</span> Points
                    </div>
                  ) : (
                    <div className="text-muted">
                      <div className="inline-flex items-center gap-1 font-semibold text-accent-gold">
                        <span className="text-xs">⭐</span> Points + {s.sales[0]?.payment_method ?? "Cash"}
                      </div>
                      {s.sales[0]?.payment_ref && !s.sales[0].payment_ref.startsWith("100 pts Reward") && (
                        <div className="text-[9.5px] text-muted opacity-70">
                          Ref: {s.sales[0].payment_ref}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="text-muted">
                    {s.sales[0]?.payment_method === "Points" ? (
                      <span className="font-medium text-accent-gold">Points</span>
                    ) : (
                      s.sales[0]?.payment_method ?? "Cash"
                    )}
                    {s.sales[0]?.payment_ref && !s.sales[0].payment_ref.startsWith("100 pts Reward") && (
                      <span className="ml-1 opacity-60 text-[9.5px]">Ref: {s.sales[0].payment_ref}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="text-muted">
                {isPointsRedemption(s) ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-400 whitespace-nowrap">
                    <span>🎁</span> 100 pts Reward
                  </span>
                ) : (
                  s.promo_label ?? "—"
                )}
              </div>
              <div className="text-muted">{s.therapist_name ?? "—"}</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {!s.voided ? (
                  <>
                    {(() => {
                      const lapsed = s.sales.some((item) => isSaleLapsed(item.created_at));
                      const isOwner =
                        currentRole === "Owner" ||
                        currentRole === "Developer" ||
                        currentRole === "developer";
                      const editLocked = lapsed && !isOwner;
                      const voidLocked = lapsed && !isOwner;
                      return (
                        <>
                          <button
                            disabled={!editAllowed || editLocked}
                            title={
                              editLocked
                                ? "Editing locked after 3 days. Owner only"
                                : editAllowed
                                ? undefined
                                : "Supervisor or Owner only"
                            }
                            onClick={() => !editLocked && editAllowed && openEdit(s)}
                            className="rounded-md border border-border px-2 py-1 text-[10.5px] font-semibold text-foreground hover:border-gold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            disabled={voidLocked}
                            title={voidLocked ? "Void locked after 3 days. Owner only" : undefined}
                            onClick={() => !voidLocked && openVoidModal(s)}
                            className="rounded-md border border-[#6b2b2b] px-2 py-1 text-[10.5px] font-semibold text-accent-red hover:bg-accent-red/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            Void
                          </button>
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <button
                    onClick={() => openRestoreModal(s)}
                    className="rounded-md border border-[#3e5e40] bg-emerald-500/10 px-2 py-1 text-[10.5px] font-semibold text-emerald-400 hover:bg-emerald-500/20 cursor-pointer"
                  >
                    Restore
                  </button>
                )}
                {s.edited_by_name && (
                  <div className="w-full text-[9.5px] text-muted">Edited by {s.edited_by_name}</div>
                )}
                {s.voided && s.void_reason && (
                  <div className="w-full text-[9.5px] text-accent-red/80 italic">Reason: {s.void_reason}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit Sale Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">Edit Sale</h3>
                {editing.is_split && (
                  <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-400">
                    Split Payment
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted mt-1">
                {editing.client_name} · {editing.service_name}
              </p>
            </div>
            <div className="space-y-3">
              {editing.is_split ? (
                <>
                  <div>
                    <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                      Cash Portion (₱)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editSplitCash}
                      onChange={(e) => setEditSplitCash(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                      Digital Portion (₱)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editSplitDigital}
                      onChange={(e) => setEditSplitDigital(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                      Digital Payment Method
                    </label>
                    <select
                      value={editSplitDigitalMethod}
                      onChange={(e) => setEditSplitDigitalMethod(e.target.value as (typeof PAYMENT_METHODS)[number])}
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                    >
                      {PAYMENT_METHODS.filter((m) => m !== "Cash").map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  {editSplitDigitalMethod === "GCash" && (
                    <div>
                      <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                        GCash Ref
                      </label>
                      <input
                        type="text"
                        value={editSplitRef}
                        onChange={(e) => setEditSplitRef(e.target.value)}
                        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold font-mono"
                      />
                    </div>
                  )}
                  <div className="rounded-lg bg-surface-2 p-2.5 text-xs flex justify-between items-center border border-border">
                    <span className="text-muted">Combined Total</span>
                    <span className="font-mono font-bold text-accent-gold">
                      ₱{((parseFloat(editSplitCash) || 0) + (parseFloat(editSplitDigital) || 0)).toLocaleString()}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                      Amount Paid (₱)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                      Payment Method
                    </label>
                    <select
                      value={editPayment}
                      onChange={(e) => setEditPayment(e.target.value as (typeof PAYMENT_METHODS)[number])}
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  {editPayment === "GCash" && (
                    <div>
                      <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                        GCash Ref
                      </label>
                      <input
                        type="text"
                        value={editRef}
                        onChange={(e) => setEditRef(e.target.value)}
                        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold font-mono"
                      />
                    </div>
                  )}
                </>
              )}
              <div>
                <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                  Therapist
                </label>
                <select
                  value={editTherapistId}
                  onChange={(e) => setEditTherapistId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                >
                  <option value="">— None —</option>
                  {therapists.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              {editError && (
                <div className="text-[11px] font-semibold text-accent-red">{editError}</div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={closeEdit}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmEdit}
                className="flex-1 rounded-lg bg-gold py-2 text-xs font-bold text-black hover:brightness-110 disabled:opacity-50 cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory Security PIN Confirmation Modal */}
      {pinModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <div className="border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">
                  {pinModalTarget.mode === "void" ? "Confirm Void Sale" : "Confirm Restore Sale"}
                </h3>
                {pinModalTarget.group.is_split && (
                  <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-400">
                    Split
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted mt-1">
                {pinModalTarget.group.client_name} · {pinModalTarget.group.service_name} · ₱{pinModalTarget.group.amount.toLocaleString()}
              </p>
              {pinModalTarget.group.is_split && (
                <p className="text-[10px] text-amber-400/90 mt-1">
                  (Applies to both Cash and Online split portions)
                </p>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                  Manager / Owner PIN <span className="text-accent-red">*</span>
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Enter Manager PIN"
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm tracking-[0.2em] text-foreground outline-none focus:border-gold"
                  autoFocus
                />
              </div>
              {pinModalTarget.mode === "void" ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                      Reason for Void <span className="text-accent-red">*</span>
                    </label>
                    <select
                      value={selectedVoidReason}
                      onChange={(e) => setSelectedVoidReason(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold cursor-pointer"
                    >
                      {STANDARD_VOID_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedVoidReason === "Other" && (
                    <div className="animate-fade-in">
                      <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                        Specify Details <span className="text-muted lowercase font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={otherReasonDetail}
                        onChange={(e) => setOtherReasonDetail(e.target.value)}
                        placeholder="Enter additional details..."
                        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                    Reason for Restore <span className="text-accent-red">*</span>
                  </label>
                  <input
                    type="text"
                    value={reasonInput}
                    onChange={(e) => setReasonInput(e.target.value)}
                    placeholder="e.g. Reverting accidental void"
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                  />
                </div>
              )}
              {pinModalError && (
                <div className="text-[11px] font-semibold text-accent-red bg-accent-red/10 p-2 rounded-md border border-accent-red/20">
                  {pinModalError}
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2 border-t border-border">
              <button
                type="button"
                disabled={pinModalBusy}
                onClick={closePinModal}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pinModalBusy}
                onClick={handleConfirmPinModal}
                className={`flex-1 rounded-lg py-2 text-xs font-bold text-black disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 ${
                  pinModalTarget.mode === "void"
                    ? "bg-accent-red hover:brightness-110"
                    : "bg-emerald-500 hover:brightness-110"
                }`}
              >
                {pinModalBusy ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-black border-t-transparent" />
                    Processing…
                  </>
                ) : pinModalTarget.mode === "void" ? (
                  "Confirm Void"
                ) : (
                  "Confirm Restore"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-[#a97e2e] bg-surface-2 px-5 py-2.5 font-mono text-xs font-semibold text-accent-gold shadow-2xl animate-fade-in">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
