"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStaffSim } from "@/lib/staff-context";
import {
  addStaff,
  archiveStaff,
  restoreStaff,
  resetStaffPassword,
  updateStaffDetails,
  type LoginProvisioning,
} from "@/app/(staff)/staff/actions";

export type Staff = {
  id: string;
  name: string;
  position: string;
  comment: string | null;
  active: boolean;
  username: string | null;
};

export type ArchivedStaff = Staff & {
  archived_reason: string | null;
  archived_at: string | null;
  archived_by_name: string | null;
};

const ADDABLE_POSITIONS = ["Receptionist", "Attendant", "Supervisor", "Others"] as const;

const CAN_LOGIN = new Set(["Receptionist", "Supervisor", "Owner"]);

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function StaffBrowser({
  initialStaff,
  initialArchived,
}: {
  initialStaff: Staff[];
  initialArchived: ArchivedStaff[];
}) {
  const router = useRouter();
  const { currentRole, sessionStaff } = useStaffSim();

  const [staffList, setStaffList] = useState<Staff[]>(initialStaff);
  const [archivedList, setArchivedList] = useState<ArchivedStaff[]>(initialArchived);
  const [showArchivedSection, setShowArchivedSection] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [openKebabId, setOpenKebabId] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [position, setPosition] = useState<(typeof ADDABLE_POSITIONS)[number]>("Receptionist");
  const [comment, setComment] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [editTarget, setEditTarget] = useState<Staff | null>(null);
  const [editName, setEditName] = useState("");
  const [editComment, setEditComment] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [archiveTarget, setArchiveTarget] = useState<Staff | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const [resetTarget, setResetTarget] = useState<Staff | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);

  const showToast = (msg: string) => setToastMessage(msg);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 2400);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const kebabRootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!openKebabId) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-kebab-root]")) return;
      setOpenKebabId(null);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [openKebabId]);

  if (currentRole !== "Owner") {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted max-w-md">
        Staff Directory is Owner-only. Sign in with an Owner account to view
        this page.
      </div>
    );
  }

  const needsLogin = CAN_LOGIN.has(position);

  const openAddModal = () => {
    setName("");
    setPosition("Receptionist");
    setComment("");
    setUsername("");
    setPassword("");
    setMustChangePassword(true);
    setError(null);
    setShowAddModal(true);
  };

  const confirmAddStaff = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter a name.");
      return;
    }
    let login: LoginProvisioning | undefined;
    if (needsLogin) {
      const trimmedUsername = username.trim().toLowerCase();
      if (!trimmedUsername) {
        setError("Please enter a username.");
        return;
      }
      if (!password) {
        setError("Please enter a password.");
        return;
      }
      login = { username: trimmedUsername, password, mustChangePassword };
    }
    setError(null);
    setSubmitting(true);
    const trimmedComment = comment.trim();
    const res = await addStaff(trimmedName, position, trimmedComment || null, sessionStaff?.id ?? "", login);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStaffList((prev) => [
      ...prev,
      {
        id: res.id!,
        name: trimmedName,
        position,
        comment: trimmedComment || null,
        active: true,
        username: login?.username ?? null,
      },
    ]);
    setShowAddModal(false);
    showToast(`${trimmedName} added as ${position}`);
    router.refresh();
  };

  const openEditModal = (s: Staff) => {
    setOpenKebabId(null);
    setEditTarget(s);
    setEditName(s.name);
    setEditComment(s.comment ?? "");
    setEditError(null);
  };

  const confirmEdit = async () => {
    if (!editTarget) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditError("Please enter a name.");
      return;
    }
    const res = await updateStaffDetails(editTarget.id, trimmedName, editComment.trim() || null, sessionStaff?.id ?? "");
    if (!res.ok) {
      setEditError(res.error);
      return;
    }
    setStaffList((prev) =>
      prev.map((s) => (s.id === editTarget.id ? { ...s, name: trimmedName, comment: editComment.trim() || null } : s))
    );
    setEditTarget(null);
    showToast(`${trimmedName} updated`);
    router.refresh();
  };

  const openArchiveModal = (s: Staff) => {
    setOpenKebabId(null);
    setArchiveTarget(s);
    setArchiveReason("");
    setArchiveError(null);
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    const res = await archiveStaff(archiveTarget.id, archiveReason.trim() || null, sessionStaff?.id ?? "");
    if (!res.ok) {
      setArchiveError(res.error);
      return;
    }
    setStaffList((prev) => prev.filter((s) => s.id !== archiveTarget.id));
    setArchiveTarget(null);
    showToast(`${archiveTarget.name} archived`);
    router.refresh();
  };

  const confirmRestore = async (s: ArchivedStaff) => {
    setOpenKebabId(null);
    const res = await restoreStaff(s.id, sessionStaff?.id ?? "");
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    setArchivedList((prev) => prev.filter((a) => a.id !== s.id));
    setStaffList((prev) => [...prev, { id: s.id, name: s.name, position: s.position, comment: s.comment, active: true, username: s.username }]);
    showToast(`${s.name} restored`);
    router.refresh();
  };

  const openResetModal = (s: Staff) => {
    setOpenKebabId(null);
    setResetTarget(s);
    setResetPassword(generatePassword());
    setResetError(null);
  };

  const confirmReset = async () => {
    if (!resetTarget) return;
    if (!resetPassword) {
      setResetError("Please enter a new password.");
      return;
    }
    const res = await resetStaffPassword(resetTarget.id, resetPassword, sessionStaff?.id ?? "");
    if (!res.ok) {
      setResetError(res.error);
      return;
    }
    setResetTarget(null);
    showToast(`Password reset for ${resetTarget.name}`);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2.5">
        <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted">
          Staff Directory
        </div>
        <button
          onClick={openAddModal}
          className="rounded-lg border border-[#a97e2e] bg-surface px-3 py-1.5 text-[11px] font-bold text-accent-gold transition hover:bg-[#c89b3c]/10"
        >
          + Add Staff
        </button>
      </div>
      <div className="text-[11px] text-muted mb-2.5">
        Only Receptionist, Supervisor, and Owner can log in.
        Attendant and Others are record-only.
      </div>

      <div className="space-y-2">
        {staffList.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 flex-wrap gap-2"
          >
            <div>
              <div className="text-[13px] font-bold text-foreground">{s.name}</div>
              <div className="text-[11px] text-muted mt-0.5">
                {s.position}
                {s.comment ? ` — ${s.comment}` : ""}
                {CAN_LOGIN.has(s.position) ? ` · can log in${s.username ? ` (${s.username})` : ""}` : " · directory only"}
              </div>
            </div>
            <div className="relative" data-kebab-root ref={openKebabId === s.id ? kebabRootRef : undefined}>
              <button
                type="button"
                onClick={() => setOpenKebabId(openKebabId === s.id ? null : s.id)}
                aria-label="Staff actions"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-foreground hover:bg-white/5"
              >
                ⋮
              </button>
              {openKebabId === s.id && (
                <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-border bg-surface-2 py-1 shadow-xl">
                  {CAN_LOGIN.has(s.position) && s.username && (
                    <button
                      type="button"
                      onClick={() => openResetModal(s)}
                      className="block w-full px-3 py-2 text-left text-[11px] text-foreground hover:bg-white/5"
                    >
                      Reset password
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEditModal(s)}
                    className="block w-full px-3 py-2 text-left text-[11px] text-foreground hover:bg-white/5"
                  >
                    Edit details
                  </button>
                  <button
                    type="button"
                    onClick={() => openArchiveModal(s)}
                    className="block w-full px-3 py-2 text-left text-[11px] text-accent-red hover:bg-white/5"
                  >
                    Archive
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {staffList.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
            No staff on record yet.
          </div>
        )}
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowArchivedSection((v) => !v)}
          className="text-[11px] font-bold tracking-wider uppercase text-muted hover:text-foreground"
        >
          {showArchivedSection ? "▾" : "▸"} Archived staff ({archivedList.length})
        </button>
        {showArchivedSection && (
          <div className="mt-2 space-y-2">
            {archivedList.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-border bg-surface/60 px-4 py-3 flex-wrap gap-2"
              >
                <div>
                  <div className="text-[13px] font-bold text-muted">{s.name}</div>
                  <div className="text-[11px] text-muted mt-0.5">
                    {s.position}
                    {s.archived_reason ? ` — ${s.archived_reason}` : ""}
                    {s.archived_by_name ? ` · archived by ${s.archived_by_name}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => confirmRestore(s)}
                  className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-foreground hover:bg-white/5"
                >
                  Restore
                </button>
              </div>
            ))}
            {archivedList.length === 0 && (
              <div className="rounded-xl border border-border bg-surface/60 p-4 text-sm text-muted">
                No archived staff.
              </div>
            )}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div>
              <h3 className="text-base font-bold text-foreground">Add Staff</h3>
              <p className="text-[11px] text-muted mt-1">
                Owner only. Attendant and Others are directory entries — they
                don&apos;t get a system login.
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Renz"
                  autoFocus
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                  Position
                </label>
                <select
                  value={position}
                  onChange={(e) => setPosition(e.target.value as (typeof ADDABLE_POSITIONS)[number])}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                >
                  {ADDABLE_POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              {position === "Others" && (
                <div>
                  <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                    Comment <span className="normal-case font-normal">(role/notes for &quot;Others&quot;)</span>
                  </label>
                  <input
                    type="text"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="e.g. Maintenance"
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                  />
                </div>
              )}
              {needsLogin && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. renz"
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                      Password
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Set an initial password"
                        className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                      />
                      <button
                        type="button"
                        onClick={() => setPassword(generatePassword())}
                        className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted hover:text-foreground"
                      >
                        Generate
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-muted">
                    <input
                      type="checkbox"
                      checked={mustChangePassword}
                      onChange={(e) => setMustChangePassword(e.target.checked)}
                    />
                    Require password change on first login
                  </label>
                </>
              )}
              {error && (
                <div className="text-[11px] font-semibold text-accent-red">{error}</div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAddStaff}
                disabled={submitting}
                className="flex-1 rounded-lg bg-gold py-2 text-xs font-bold text-black hover:brightness-110 disabled:opacity-60"
              >
                {submitting ? "Adding…" : "Add Staff"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground">Edit Details</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                  Comment
                </label>
                <input
                  type="text"
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                />
              </div>
              {editError && <div className="text-[11px] font-semibold text-accent-red">{editError}</div>}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmEdit}
                className="flex-1 rounded-lg bg-gold py-2 text-xs font-bold text-black hover:brightness-110"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground">Archive {archiveTarget.name}?</h3>
            {CAN_LOGIN.has(archiveTarget.position) && (
              <p className="text-[11px] text-accent-red">
                This will immediately sign {archiveTarget.name} out and disable
                their login. This can be reversed with Restore.
              </p>
            )}
            <div>
              <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                Reason <span className="normal-case font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="e.g. Resigned"
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
              />
            </div>
            {archiveError && <div className="text-[11px] font-semibold text-accent-red">{archiveError}</div>}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setArchiveTarget(null)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmArchive}
                className="flex-1 rounded-lg bg-accent-red py-2 text-xs font-bold text-black hover:brightness-110"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground">Reset Password — {resetTarget.name}</h3>
            <div>
              <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                New Password
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                />
                <button
                  type="button"
                  onClick={() => setResetPassword(generatePassword())}
                  className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted hover:text-foreground"
                >
                  Generate
                </button>
              </div>
            </div>
            <p className="text-[11px] text-muted">
              {resetTarget.name} will be required to change this password on
              next login.
            </p>
            {resetError && <div className="text-[11px] font-semibold text-accent-red">{resetError}</div>}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReset}
                className="flex-1 rounded-lg bg-gold py-2 text-xs font-bold text-black hover:brightness-110"
              >
                Reset Password
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
