"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStaffSim } from "@/lib/staff-context";
import { editSale, voidSale } from "@/app/(staff)/sales/actions";

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
  edited_by_name: string | null;
  created_at: string;
};

type Therapist = { id: string; name: string };

const PAYMENT_METHODS = ["Cash", "GCash", "Card", "Points"] as const;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const GRID_COLS = "1fr 1fr 1fr .8fr 1.1fr .9fr 1fr 1.6fr";

export function SalesBrowser({
  initialSales,
  therapists,
}: {
  initialSales: Sale[];
  therapists: Therapist[];
}) {
  const router = useRouter();
  const { currentRole, sessionStaff } = useStaffSim();

  const [sales, setSales] = useState<Sale[]>(initialSales);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editPayment, setEditPayment] = useState<(typeof PAYMENT_METHODS)[number]>("Cash");
  const [editRef, setEditRef] = useState("");
  const [editTherapistId, setEditTherapistId] = useState<string>("");
  const [editError, setEditError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const editAllowed = currentRole === "Supervisor" || currentRole === "Owner";
  const voidAllowed = currentRole === "Owner";

  const total = useMemo(
    () => sales.reduce((sum, s) => (s.voided ? sum : sum + s.amount), 0),
    [sales]
  );

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

  const handleVoid = async (sale: Sale) => {
    if (!window.confirm("Void this sale? It stays on record but is excluded from totals.")) {
      return;
    }
    const res = await voidSale(sale.id, sessionStaff?.id ?? "");
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    setSales((prev) =>
      prev.map((s) => (s.id === sale.id ? { ...s, voided: true } : s))
    );
    showToast("Sale voided");
    router.refresh();
  };

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2.5">
        <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted">
          Sales Log
        </div>
        <div className="text-[13px] font-bold text-accent-gold">
          Total: ₱{total.toLocaleString()}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden overflow-x-auto">
        <div
          className="grid gap-3 border-b border-border px-4 py-2.5 text-[10px] font-bold tracking-wider uppercase text-muted min-w-[900px]"
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          <div>Date</div>
          <div>Client</div>
          <div>Service</div>
          <div>Amount</div>
          <div>Payment</div>
          <div>Promo</div>
          <div>Therapist</div>
          <div>Actions</div>
        </div>
        {sales.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted">No sales recorded yet.</div>
        ) : (
          sales.map((s) => (
            <div
              key={s.id}
              className={`grid gap-3 border-b border-border px-4 py-3 text-[12px] last:border-b-0 min-w-[900px] ${
                s.voided ? "opacity-50" : ""
              }`}
              style={{ gridTemplateColumns: GRID_COLS }}
            >
              <div className="text-muted">{fmtDate(s.created_at)}</div>
              <div className="text-foreground">{s.client_name}</div>
              <div className="text-foreground">
                {s.service_name}
                {s.voided && (
                  <span className="ml-1.5 rounded bg-accent-red/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent-red">
                    Voided
                  </span>
                )}
              </div>
              <div className="font-semibold text-accent-gold">₱{s.amount.toLocaleString()}</div>
              <div className="text-muted">
                {s.payment_method}
                {s.payment_ref && (
                  <span className="ml-1 opacity-60 text-[9.5px]">Ref: {s.payment_ref}</span>
                )}
              </div>
              <div className="text-muted">{s.promo_label ?? "—"}</div>
              <div className="text-muted">{s.therapist_name ?? "—"}</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {s.is_walkin ? (
                  <span className="text-[10px] text-muted italic">No action — walk-in, no account</span>
                ) : !s.voided ? (
                  <>
                    <button
                      disabled={!editAllowed}
                      title={editAllowed ? undefined : "Supervisor or Owner only"}
                      onClick={() => editAllowed && openEdit(s)}
                      className="rounded-md border border-border px-2 py-1 text-[10.5px] font-semibold text-foreground hover:border-gold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Edit
                    </button>
                    <button
                      disabled={!voidAllowed}
                      title={voidAllowed ? undefined : "Owner only"}
                      onClick={() => voidAllowed && handleVoid(s)}
                      className="rounded-md border border-[#6b2b2b] px-2 py-1 text-[10.5px] font-semibold text-accent-red hover:bg-accent-red/10 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Void
                    </button>
                  </>
                ) : null}
                {s.edited_by_name && (
                  <div className="w-full text-[9.5px] text-muted">Edited by {s.edited_by_name}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

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
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
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
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
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
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmEdit}
                className="flex-1 rounded-lg bg-gold py-2 text-xs font-bold text-black hover:brightness-110 disabled:opacity-50"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-[#a97e2e] bg-surface-2 px-5 py-2.5 font-mono text-xs font-semibold text-accent-gold shadow-2xl animate-fade-in">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
