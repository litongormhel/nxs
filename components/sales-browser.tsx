"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStaffSim } from "@/lib/staff-context";
import { editSale, voidSale, restoreSale } from "@/app/(staff)/sales/actions";
import { spaDayNow, shiftSpaDay } from "@/lib/analytics/spa-day";

export type Sale = {
  id: string;
  client_name: string;
  is_walkin: boolean;
  service_name: string;
  amount: number;
  payment_method: string;
  payment_ref: string | null;
  promo_label: string | null;
  therapist_id: string | null;
  therapist_name: string | null;
  voided: boolean;
  voided_by_name: string | null;
  void_reason?: string | null;
  edited_by_name: string | null;
  created_at: string;
};

type Therapist = { id: string; name: string };
type Authorizer = { id: string; name: string };

type PinModalTarget = {
  sale: Sale;
  mode: "void" | "restore";
};

const PAYMENT_METHODS = ["Cash", "GCash", "Card", "Points"] as const;

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
  const [editing, setEditing] = useState<Sale | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editPayment, setEditPayment] = useState<(typeof PAYMENT_METHODS)[number]>("Cash");
  const [editRef, setEditRef] = useState("");
  const [editTherapistId, setEditTherapistId] = useState<string>("");
  const [editError, setEditError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mandatory Security PIN Confirmation Modal State
  const [pinModalTarget, setPinModalTarget] = useState<PinModalTarget | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [pinModalError, setPinModalError] = useState<string | null>(null);
  const [pinModalBusy, setPinModalBusy] = useState(false);

  const editAllowed = currentRole === "Supervisor" || currentRole === "Owner";

  const { cashRemit, onlineRemit, totalShiftSales, validSalesCount } = useMemo(() => {
    let cash = 0;
    let online = 0;
    let total = 0;
    let count = 0;
    for (const s of sales) {
      if (s.voided) continue;
      total += s.amount;
      count += 1;
      if (s.payment_method === "Cash") {
        cash += s.amount;
      } else {
        online += s.amount;
      }
    }
    return { cashRemit: cash, onlineRemit: online, totalShiftSales: total, validSalesCount: count };
  }, [sales]);

  const handleDateChange = (newDate: string) => {
    if (!newDate) return;
    router.push(`/sales?date=${newDate}`);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2400);
  };

  const openEdit = (sale: Sale) => {
    setEditing(sale);
    setEditAmount(String(sale.amount));
    setEditPayment(
      (PAYMENT_METHODS as readonly string[]).includes(sale.payment_method)
        ? (sale.payment_method as (typeof PAYMENT_METHODS)[number])
        : "Cash"
    );
    setEditRef(sale.payment_ref ?? "");
    setEditTherapistId(sale.therapist_id ?? "");
    setEditError(null);
  };

  const closeEdit = () => setEditing(null);

  const confirmEdit = async () => {
    if (!editing) return;
    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount < 0) {
      setEditError("Enter a valid amount.");
      return;
    }
    setBusy(true);
    const res = await editSale(
      editing.id,
      {
        amount,
        paymentMethod: editPayment,
        paymentRef: editPayment === "GCash" ? editRef.trim() || null : null,
        therapistId: editTherapistId || null,
      },
      sessionStaff?.id ?? ""
    );
    setBusy(false);
    if (!res.ok) {
      setEditError(res.error);
      return;
    }
    setSales((prev) =>
      prev.map((s) =>
        s.id === editing.id
          ? {
              ...s,
              amount,
              payment_method: editPayment,
              payment_ref: editPayment === "GCash" ? editRef.trim() || null : null,
              therapist_id: editTherapistId || null,
              therapist_name:
                therapists.find((t) => t.id === editTherapistId)?.name ?? null,
              edited_by_name: "You",
            }
          : s
      )
    );
    setEditing(null);
    showToast("Sale updated");
    router.refresh();
  };

  const openVoidModal = (sale: Sale) => {
    setPinModalTarget({ sale, mode: "void" });
    setPinInput("");
    setReasonInput("");
    setPinModalError(null);
  };

  const openRestoreModal = (sale: Sale) => {
    setPinModalTarget({ sale, mode: "restore" });
    setPinInput("");
    setReasonInput("");
    setPinModalError(null);
  };

  const closePinModal = () => {
    setPinModalTarget(null);
    setPinInput("");
    setReasonInput("");
    setPinModalError(null);
  };

  const handleConfirmPinModal = async () => {
    if (!pinModalTarget) return;

    const trimmedPin = pinInput.trim();
    const trimmedReason = reasonInput.trim();

    if (!trimmedPin) {
      setPinModalError("Manager / Owner PIN is required.");
      return;
    }

    if (!trimmedReason) {
      setPinModalError(`Reason for ${pinModalTarget.mode} is required.`);
      return;
    }

    setPinModalBusy(true);
    setPinModalError(null);

    const staffId = sessionStaff?.id ?? "";

    if (pinModalTarget.mode === "void") {
      const res = await voidSale({
        saleId: pinModalTarget.sale.id,
        pin: trimmedPin,
        reason: trimmedReason,
        staffId,
      });
      setPinModalBusy(false);

      if (!res.ok) {
        setPinModalError(res.error);
        return;
      }

      setSales((prev) =>
        prev.map((s) =>
          s.id === pinModalTarget.sale.id
            ? {
                ...s,
                voided: true,
                void_reason: trimmedReason,
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
        saleId: pinModalTarget.sale.id,
        pin: trimmedPin,
        reason: trimmedReason,
        staffId,
      });
      setPinModalBusy(false);

      if (!res.ok) {
        setPinModalError(res.error);
        return;
      }

      setSales((prev) =>
        prev.map((s) =>
          s.id === pinModalTarget.sale.id
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
        {sales.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted">
            No sales recorded for Spa Day {selectedDate}.
          </div>
        ) : (
          sales.map((s) => (
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
              <div className="text-muted">
                {s.payment_method}
                {s.payment_ref && (
                  <span className="ml-1 opacity-60 text-[9.5px]">Ref: {s.payment_ref}</span>
                )}
              </div>
              <div className="text-muted">{s.promo_label ?? "—"}</div>
              <div className="text-muted">{s.therapist_name ?? "—"}</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {!s.voided ? (
                  <>
                    <button
                      disabled={!editAllowed}
                      title={editAllowed ? undefined : "Supervisor or Owner only"}
                      onClick={() => editAllowed && openEdit(s)}
                      className="rounded-md border border-border px-2 py-1 text-[10.5px] font-semibold text-foreground hover:border-gold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => openVoidModal(s)}
                      className="rounded-md border border-[#6b2b2b] px-2 py-1 text-[10.5px] font-semibold text-accent-red hover:bg-accent-red/10 cursor-pointer"
                    >
                      Void
                    </button>
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
              <h3 className="text-base font-bold text-foreground">Edit Sale</h3>
              <p className="text-[11px] text-muted mt-1">
                {editing.client_name} · {editing.service_name}
              </p>
            </div>
            <div className="space-y-3">
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
              <h3 className="text-base font-bold text-foreground">
                {pinModalTarget.mode === "void" ? "Confirm Void Sale" : "Confirm Restore Sale"}
              </h3>
              <p className="text-[11px] text-muted mt-1">
                {pinModalTarget.sale.client_name} · {pinModalTarget.sale.service_name} · ₱{pinModalTarget.sale.amount.toLocaleString()}
              </p>
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
              <div>
                <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                  Reason for {pinModalTarget.mode} <span className="text-accent-red">*</span>
                </label>
                <input
                  type="text"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder={
                    pinModalTarget.mode === "void"
                      ? "e.g. Accidental double entry / Client cancelled"
                      : "e.g. Reverting accidental void"
                  }
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                />
              </div>
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
