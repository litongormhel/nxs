"use client";

import { useMemo, useState, useTransition } from "react";
import { logVisit } from "@/app/clients/actions";

type Service = { id: string; name: string; price: number; points_earned: number };
type Staff = { id: string; name: string; position: string };

const PAYMENT_METHODS = ["Cash", "GCash", "Card"] as const;
const REDEMPTION_COST = 100;

export function LogVisitModal({
  clientId,
  clientCodename,
  pointsBalance,
  services,
  staff,
  onClose,
  onLogged,
}: {
  clientId: string;
  clientCodename: string;
  pointsBalance: number;
  services: Service[];
  staff: Staff[];
  onClose: () => void;
  onLogged: () => void;
}) {
  const eligibleForRedemption = pointsBalance >= REDEMPTION_COST;

  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [isRedemption, setIsRedemption] = useState(false);
  // TEMP: placeholder actor pending Staff Auth phase — staff pick their own
  // name from the directory until sessions/auth.uid() exist.
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]>("Cash");
  const [amount, setAmount] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedService = services.find((s) => s.id === serviceId);

  const defaultAmount = useMemo(() => {
    if (!selectedService) return "0";
    return isRedemption ? "0" : String(selectedService.price);
  }, [selectedService, isRedemption]);

  const effectiveAmount = amount === "" ? defaultAmount : amount;
  const parsedAmount = Number(effectiveAmount);

  const pointsPreview = isRedemption ? -REDEMPTION_COST : selectedService?.points_earned ?? 0;

  const canSubmit =
    !isPending &&
    !!serviceId &&
    !!staffId &&
    Number.isFinite(parsedAmount) &&
    parsedAmount >= 0 &&
    (!isRedemption || eligibleForRedemption);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await logVisit({
        clientId,
        serviceId,
        staffId,
        isRedemption,
        paymentMethod,
        amount: parsedAmount,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onLogged();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
          Log Visit
        </h2>
        <p className="mt-1 text-lg font-semibold text-gold">{clientCodename}</p>
        <p className="mt-1 text-xs text-muted">
          Current balance: {pointsBalance} pts
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="text-xs text-muted" htmlFor="service">
              Service
            </label>
            <select
              id="service"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · ₱{service.price} · +{service.points_earned} pts
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isRedemption}
              disabled={!eligibleForRedemption}
              onChange={(e) => {
                setIsRedemption(e.target.checked);
                setAmount("");
              }}
            />
            Redeem 100 pts
            {!eligibleForRedemption && (
              <span className="text-xs text-muted">
                (needs {REDEMPTION_COST - pointsBalance} more pts)
              </span>
            )}
          </label>

          {isRedemption && (
            <p className="text-xs text-muted">
              −{REDEMPTION_COST} pts, 0 earned on this entry. If the chosen
              service costs more than the redemption covers, enter the cash
              top-up below — it&apos;s recorded as a separate sale.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted" htmlFor="payment-method">
                Payment Method
              </label>
              <select
                id="payment-method"
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as (typeof PAYMENT_METHODS)[number])
                }
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted" htmlFor="amount">
                Amount {isRedemption ? "(top-up, ₱)" : "(₱)"}
              </label>
              <input
                id="amount"
                type="number"
                min={0}
                step="0.01"
                placeholder={defaultAmount}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted" htmlFor="staff">
              Logged by (staff)
            </label>
            <select
              id="staff"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} · {member.position}
                </option>
              ))}
            </select>
          </div>

          <p className="text-xs text-muted">
            Points on this entry: {pointsPreview >= 0 ? "+" : ""}
            {pointsPreview}
          </p>

          {error && (
            <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:border-gold/30"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-md border border-gold bg-gold/10 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Logging…" : "Log Visit"}
          </button>
        </div>
      </div>
    </div>
  );
}
