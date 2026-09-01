"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changeOwnPassword } from "@/app/(staff)/my-profile/actions";

export function MyProfileForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setError(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All fields are required.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    setSubmitting(true);
    const res = await changeOwnPassword(currentPassword, newPassword);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    if (forced) {
      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="max-w-sm space-y-4">
      {forced && (
        <div className="rounded-xl border border-[#a97e2e] bg-surface-2 px-4 py-3 text-[11px] text-accent-gold">
          Your password was reset by an Owner. Please set a new password
          before continuing.
        </div>
      )}
      <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
        <h3 className="text-base font-bold text-foreground">Change Password</h3>
        <div>
          <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
            Current Password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
            New Password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
            Confirm New Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
          />
        </div>
        {error && <div className="text-[11px] font-semibold text-accent-red">{error}</div>}
        {success && !forced && (
          <div className="text-[11px] font-semibold text-accent-gold">Password updated.</div>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="w-full rounded-lg bg-gold py-2 text-xs font-bold text-black hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? "Updating…" : "Update Password"}
        </button>
      </div>
    </div>
  );
}
