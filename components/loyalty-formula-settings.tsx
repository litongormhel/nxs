"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateLoyaltyFormula } from "@/app/(staff)/settings/actions";
import { computeLoyaltyPoints, type LoyaltyFormulaMode } from "@/lib/loyalty";

const WET_AREA_POINTS = 3;

export type LoyaltyPreviewService = {
  id: string;
  name: string;
  price: number;
  points_earned: number;
};

export function LoyaltyFormulaSettings({
  initialMode,
  initialPesoPerPoint,
  services,
  canEdit,
  staffId,
}: {
  initialMode: LoyaltyFormulaMode | null;
  initialPesoPerPoint: number | null;
  services: LoyaltyPreviewService[];
  canEdit: boolean;
  staffId: string;
}) {
  const router = useRouter();

  const [savedMode, setSavedMode] = useState<LoyaltyFormulaMode | null>(initialMode);
  const [savedPesoPerPoint, setSavedPesoPerPoint] = useState<number | null>(initialPesoPerPoint);

  const [draftMode, setDraftMode] = useState<LoyaltyFormulaMode | null>(initialMode);
  const [draftPesoPerPoint, setDraftPesoPerPoint] = useState<string>(
    initialPesoPerPoint != null ? String(initialPesoPerPoint) : ""
  );
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const signature = services.find((s) => s.name === "Signature Massage");
  const combi = services.find((s) => s.name === "Combi Massage");

  const [signaturePaid, setSignaturePaid] = useState<string>(
    signature ? String(signature.price) : "1300"
  );
  const [combiPaid, setCombiPaid] = useState<string>(combi ? String(combi.price) : "1100");

  const isDirty =
    draftMode !== savedMode ||
    (draftMode === "uniform" &&
      (draftPesoPerPoint === "" ? null : Number(draftPesoPerPoint)) !== savedPesoPerPoint);

  const pesoPerPointNum = draftPesoPerPoint === "" ? null : Number(draftPesoPerPoint);

  const previewFor = (paid: string, svc: LoyaltyPreviewService | undefined) => {
    if (!draftMode || !svc) return null;
    if (draftMode === "uniform" && !pesoPerPointNum) return null;
    return computeLoyaltyPoints(draftMode, Number(paid) || 0, svc.price, svc.points_earned, pesoPerPointNum);
  };

  const handleSave = async () => {
    if (!draftMode) return;
    if (draftMode === "uniform" && !pesoPerPointNum) {
      setToastMessage("Enter a peso-per-point value first");
      return;
    }
    setSaving(true);
    const res = await updateLoyaltyFormula(draftMode, pesoPerPointNum, staffId);
    setSaving(false);
    if (!res.ok) {
      setToastMessage(`Failed to save: ${res.error}`);
      return;
    }
    setSavedMode(draftMode);
    setSavedPesoPerPoint(draftMode === "uniform" ? pesoPerPointNum : null);
    setToastMessage("Loyalty formula saved");
    router.refresh();
  };

  const handleCancel = () => {
    setDraftMode(savedMode);
    setDraftPesoPerPoint(savedPesoPerPoint != null ? String(savedPesoPerPoint) : "");
  };

  return (
    <div>
      <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted mb-2.5">
        Loyalty Points Formula
      </div>

      {!savedMode && (
        <div className="mb-3 rounded-xl border border-[#a97e2e] bg-[#c89b3c]/10 px-4 py-2.5 text-[11.5px] font-semibold text-accent-gold">
          Formula not yet configured
        </div>
      )}

      {!canEdit && (
        <div className="text-[10.5px] text-muted mb-2">
          Read-only. Only the Owner role can configure the loyalty formula.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
        {(["uniform", "proportional"] as const).map((mode) => (
          <label
            key={mode}
            className={`rounded-xl border px-4 py-3 cursor-pointer transition ${
              draftMode === mode ? "border-[#a97e2e] bg-[#c89b3c]/10" : "border-border bg-surface"
            } ${!canEdit ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <input
                type="radio"
                name="loyalty-mode"
                checked={draftMode === mode}
                disabled={!canEdit}
                onChange={() => setDraftMode(mode)}
              />
              <span className="text-[12.5px] font-bold text-foreground capitalize">{mode}</span>
            </div>
            <div className="font-mono text-[10.5px] text-muted">
              {mode === "uniform"
                ? "points = round(paid / peso_per_point)"
                : "points = round(base_points × (paid / full_price))"}
            </div>
          </label>
        ))}
      </div>

      {draftMode === "uniform" && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 flex-wrap gap-2.5 mb-3">
          <div>
            <div className="text-[13px] font-bold text-foreground">Peso per Point</div>
            <div className="text-[11px] text-muted mt-0.5">
              1 point earned for every this many pesos paid
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted">₱</span>
            <input
              type="number"
              disabled={!canEdit}
              value={draftPesoPerPoint}
              onChange={(e) => setDraftPesoPerPoint(e.target.value)}
              className="w-[80px] rounded-lg border border-border bg-surface px-2 py-1.5 font-mono text-[11.5px] text-foreground outline-none disabled:opacity-50 focus:border-gold"
            />
          </div>
        </div>
      )}

      {draftMode && (
        <div className="mb-3">
          <div className="text-[10.5px] font-bold tracking-[0.1em] uppercase text-muted mb-2">
            Live Preview
          </div>
          <div className="space-y-2">
            {signature && (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 flex-wrap">
                <div className="flex-1 text-[12.5px] font-bold text-foreground min-w-[140px]">
                  Signature Massage
                  <span className="block text-[10.5px] font-normal text-muted">
                    ₱{signature.price} full price · {signature.points_earned} base pts
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted">Paid ₱</span>
                  <input
                    type="number"
                    value={signaturePaid}
                    onChange={(e) => setSignaturePaid(e.target.value)}
                    className="w-[80px] rounded-lg border border-border bg-surface px-2 py-1.5 font-mono text-[11.5px] text-foreground outline-none focus:border-gold"
                  />
                </div>
                <div className="font-mono text-[12.5px] font-bold text-accent-gold min-w-[70px] text-right">
                  {previewFor(signaturePaid, signature) ?? "—"} pts
                </div>
              </div>
            )}
            {combi && (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 flex-wrap">
                <div className="flex-1 text-[12.5px] font-bold text-foreground min-w-[140px]">
                  Combi Massage
                  <span className="block text-[10.5px] font-normal text-muted">
                    ₱{combi.price} full price · {combi.points_earned} base pts
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted">Paid ₱</span>
                  <input
                    type="number"
                    value={combiPaid}
                    onChange={(e) => setCombiPaid(e.target.value)}
                    className="w-[80px] rounded-lg border border-border bg-surface px-2 py-1.5 font-mono text-[11.5px] text-foreground outline-none focus:border-gold"
                  />
                </div>
                <div className="font-mono text-[12.5px] font-bold text-accent-gold min-w-[70px] text-right">
                  {previewFor(combiPaid, combi) ?? "—"} pts
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 flex-wrap opacity-70">
              <div className="flex-1 text-[12.5px] font-bold text-foreground min-w-[140px]">
                Wet Area
                <span className="block text-[10.5px] font-normal text-muted">
                  fixed, not affected by this formula
                </span>
              </div>
              <div className="font-mono text-[12.5px] font-bold text-foreground min-w-[70px] text-right">
                {WET_AREA_POINTS} pts
              </div>
            </div>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            disabled={!isDirty || saving}
            className="rounded-lg border border-border px-4 py-2 text-[11px] font-bold text-muted hover:text-foreground disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || !draftMode || saving}
            className="rounded-lg bg-gold px-4 py-2 text-[11px] font-bold text-black hover:brightness-110 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save"}
          </button>
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
