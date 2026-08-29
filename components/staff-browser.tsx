"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStaffSim } from "@/lib/staff-context";
import { addStaff } from "@/app/staff/actions";

export type Staff = {
  id: string;
  name: string;
  position: string;
  comment: string | null;
  active: boolean;
};

const ADDABLE_POSITIONS = ["Receptionist", "Attendant", "Supervisor", "Others"] as const;

const CAN_LOGIN = new Set(["Receptionist", "Supervisor", "Owner"]);

export function StaffBrowser({ initialStaff }: { initialStaff: Staff[] }) {
  const router = useRouter();
  const { currentRole, sessionStaff } = useStaffSim();

  const [staffList, setStaffList] = useState<Staff[]>(initialStaff);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [position, setPosition] = useState<(typeof ADDABLE_POSITIONS)[number]>("Receptionist");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const showToast = (msg: string) => setToastMessage(msg);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 2400);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  if (currentRole !== "Owner") {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted max-w-md">
        Staff Directory is Owner-only. Sign in with an Owner account to view
        this page.
      </div>
    );
  }

  const openModal = () => {
    setName("");
    setPosition("Receptionist");
    setComment("");
    setError(null);
    setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  const onPositionChange = (val: (typeof ADDABLE_POSITIONS)[number]) => {
    setPosition(val);
  };

  const confirmAddStaff = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter a name.");
      return;
    }
    setError(null);
    const trimmedComment = comment.trim();
    const res = await addStaff(
      trimmedName,
      position,
      trimmedComment || null,
      sessionStaff?.id ?? ""
    );
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
      },
    ]);
    setShowModal(false);
    showToast(`${trimmedName} added as ${position}`);
    router.refresh();
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2.5">
        <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted">
          Staff Directory
        </div>
        <button
          onClick={openModal}
          className="rounded-lg border border-[#a97e2e] bg-surface px-3 py-1.5 text-[11px] font-bold text-[#f3d48b] transition hover:bg-[#c89b3c]/10"
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
                {CAN_LOGIN.has(s.position) ? " · can log in" : " · directory only"}
              </div>
            </div>
          </div>
        ))}
        {staffList.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
            No staff on record yet.
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
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
                  className="w-full rounded-lg border border-border bg-[#1d1610] px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                  Position
                </label>
                <select
                  value={position}
                  onChange={(e) =>
                    onPositionChange(e.target.value as (typeof ADDABLE_POSITIONS)[number])
                  }
                  className="w-full rounded-lg border border-border bg-[#1d1610] px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
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
                    className="w-full rounded-lg border border-border bg-[#1d1610] px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                  />
                </div>
              )}
              {error && (
                <div className="text-[11px] font-semibold text-[#d18b8b]">{error}</div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAddStaff}
                className="flex-1 rounded-lg bg-gold py-2 text-xs font-bold text-black hover:brightness-110"
              >
                Add Staff
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-[#a97e2e] bg-[#1d1610] px-5 py-2.5 font-mono text-xs font-semibold text-[#f3d48b] shadow-2xl animate-fade-in">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
