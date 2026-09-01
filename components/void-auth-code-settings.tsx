"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateVoidAuthCode } from "@/app/(staff)/settings/actions";

export function VoidAuthCodeSettings({
  initialConfigured,
  canEdit,
  staffId,
}: {
  initialConfigured: boolean;
  canEdit: boolean;
  staffId: string;
}) {
  const router = useRouter();

  const [configured, setConfigured] = useState(initialConfigured);
  const [draftCode, setDraftCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isDirty = draftCode.length > 0;

  const handleSave = async () => {
    if (!/^\d{6}$/.test(draftCode)) {
      setError("Enter exactly 6 digits.");
      return;
    }
    setError(null);
    setSaving(true);
    const res = await updateVoidAuthCode(draftCode, staffId);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setConfigured(true);
    setDraftCode("");
    setToastMessage("Void authorization code saved");
    router.refresh();
  };

  const handleCancel = () => {
    setDraftCode("");
    setError(null);
  };

  return (
    <div>
      <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted mb-2.5">
        Void Authorization Code
      </div>

      {!configured && (
        <div className="mb-3 rounded-xl border border-[#a97e2e] bg-[#c89b3c]/10 px-4 py-2.5 text-[11.5px] font-semibold text-accent-gold">
          Not yet configured
        </div>
      )}

      {!canEdit && (
        <div className="text-[10.5px] text-muted mb-2">
          Read-only. Only the Owner role can configure the void authorization code.
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <p className="text-[11px] text-muted">
          Shared 6-digit code Front Desk uses, alongside a Supervisor/Owner
          pick, to void a sale without that person&apos;s own login.
          {configured ? " A code is currently set." : ""}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            disabled={!canEdit}
            value={draftCode}
            onChange={(e) => setDraftCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder={configured ? "Enter new 6-digit code" : "Set 6-digit code"}
            className="w-[160px] rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm tracking-[0.3em] text-foreground outline-none disabled:opacity-50 focus:border-gold"
          />
          {isDirty && canEdit && (
            <>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="rounded-lg bg-gold px-3 py-2 text-xs font-bold text-black hover:brightness-110 disabled:opacity-50"
              >
                Save
              </button>
            </>
          )}
        </div>
        {error && <div className="text-[11px] font-semibold text-accent-red">{error}</div>}
      </div>

      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-[#a97e2e] bg-surface-2 px-5 py-2.5 font-mono text-xs font-semibold text-accent-gold shadow-2xl animate-fade-in">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
