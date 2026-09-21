"use client";

import { useState } from "react";
import Link from "next/link";
import { logoutPortalAction } from "@/app/portal/actions";

export type MemberProfile = {
  id: string;
  codename: string;
  username: string;
  memberCode: string;
  pointsBalance: number;
  qrToken: string;
  qrDataUrl: string;
};

export type PastVisit = {
  id: string;
  bookingDate: string;
  startTime: string;
  durationMinutes: number | null;
  serviceName: string;
  therapistName: string | null;
  status: string;
};

interface MemberDashboardProps {
  member: MemberProfile;
  pastVisits: PastVisit[];
}

function formatDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    if (!year || !month || !day) return dateStr;
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatTime(timeStr: string): string {
  try {
    const parts = timeStr.split(":");
    if (parts.length < 2) return timeStr;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return timeStr;
  }
}

export function MemberDashboard({ member, pastVisits }: MemberDashboardProps) {
  const [showQrModal, setShowQrModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    await logoutPortalAction();
  }

  return (
    <div className="w-full space-y-6">
      {/* Profile & Points Summary Card */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-xl relative overflow-hidden">
        {/* Subtle accent glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-gold/5 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium tracking-wide bg-surface-2 border border-border text-gold">
                #{member.memberCode}
              </span>
              <span className="text-xs text-muted">@{member.username}</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Welcome, <span className="text-gold">{member.codename}</span>
            </h1>
            <p className="text-xs text-muted mt-0.5">NXS Spa Member Portal</p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setShowQrModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-gold hover:bg-gold-hover text-background px-4 py-2 text-sm font-semibold transition-colors shadow-sm cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="5" height="5" x="3" y="3" rx="1" />
                <rect width="5" height="5" x="16" y="3" rx="1" />
                <rect width="5" height="5" x="3" y="16" rx="1" />
                <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
                <path d="M21 21v.01" />
                <path d="M12 7v3a2 2 0 0 1-2 2H7" />
                <path d="M3 12h.01" />
                <path d="M12 3h.01" />
                <path d="M12 16v.01" />
                <path d="M16 12h1" />
                <path d="M21 12v.01" />
                <path d="M12 21v-1" />
              </svg>
              <span>Member QR</span>
            </button>

            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="rounded-lg border border-border hover:bg-surface-2 text-muted hover:text-foreground px-3 py-2 text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
              title="Log out"
            >
              {isLoggingOut ? "..." : "Log out"}
            </button>
          </div>
        </div>

        {/* Points Display Box */}
        <div className="mt-6 p-4 rounded-lg border border-border bg-surface-2 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted font-medium mb-0.5">
              Available Loyalty Points
            </div>
            <div className="text-3xl font-extrabold text-gold tracking-tight flex items-baseline gap-1.5">
              <span>{member.pointsBalance.toLocaleString()}</span>
              <span className="text-sm font-semibold text-muted">pts</span>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <span className="text-[11px] text-muted">
              Earn 3–6 pts per visit • Redeem 100 pts for service
            </span>
          </div>
        </div>
      </div>

      {/* Past Visits Section */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Past Visits</h2>
            <p className="text-xs text-muted">Your recent verified spa visits (latest 10)</p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-surface-2 border border-border text-muted">
            {pastVisits.length} {pastVisits.length === 1 ? "visit" : "visits"}
          </span>
        </div>

        {pastVisits.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface-2/40 p-8 text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-10 h-10 mx-auto text-muted/50 mb-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
              <line x1="16" x2="16" y1="2" y2="6" />
              <line x1="8" x2="8" y1="2" y2="6" />
              <line x1="3" x2="21" y1="10" y2="10" />
            </svg>
            <p className="text-sm font-medium text-foreground mb-1">
              No past visits recorded yet
            </p>
            <p className="text-xs text-muted max-w-sm mx-auto">
              Your completed spa visits will automatically appear here once verified and checked out at the counter.
            </p>
          </div>
        ) : (
          <div>
            {/* Desktop / Tablet Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted font-medium">
                    <th className="pb-3 pl-1">Date & Time</th>
                    <th className="pb-3 px-3">Service</th>
                    <th className="pb-3 px-3">Therapist</th>
                    <th className="pb-3 px-3">Duration</th>
                    <th className="pb-3 pr-1 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {pastVisits.map((visit) => (
                    <tr key={visit.id} className="hover:bg-surface-2/40 transition-colors">
                      <td className="py-3 pl-1">
                        <div className="font-medium text-foreground">{formatDate(visit.bookingDate)}</div>
                        <div className="text-xs text-muted">{formatTime(visit.startTime)}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-medium text-foreground">{visit.serviceName}</span>
                      </td>
                      <td className="py-3 px-3">
                        {visit.therapistName ? (
                          <span className="text-foreground">{visit.therapistName}</span>
                        ) : (
                          <span className="text-muted italic text-xs">None (Wet Area)</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-muted">
                        {visit.durationMinutes ? `${visit.durationMinutes} mins` : "—"}
                      </td>
                      <td className="py-3 pr-1 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#8a9a76]/10 text-[#8a9a76] border border-[#8a9a76]/30">
                          {visit.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="sm:hidden divide-y divide-border/60">
              {pastVisits.map((visit) => (
                <div key={visit.id} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm text-foreground">
                      {formatDate(visit.bookingDate)}
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[#8a9a76]/10 text-[#8a9a76] border border-[#8a9a76]/30">
                      {visit.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-gold">{visit.serviceName}</span>
                    <span className="text-muted">{formatTime(visit.startTime)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted pt-0.5">
                    <span>
                      Therapist:{" "}
                      {visit.therapistName ? (
                        <span className="text-foreground">{visit.therapistName}</span>
                      ) : (
                        <span className="italic">None (Wet Area)</span>
                      )}
                    </span>
                    <span>{visit.durationMinutes ? `${visit.durationMinutes} mins` : "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Member QR Code Modal */}
      {showQrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-surface-2 border border-border text-gold">
                #{member.memberCode}
              </span>
              <button
                onClick={() => setShowQrModal(false)}
                className="text-muted hover:text-foreground text-sm cursor-pointer p-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div>
              <h3 className="text-lg font-bold text-foreground">{member.codename}</h3>
              <p className="text-xs text-muted">Member QR Code</p>
            </div>

            <div className="rounded-lg border border-border bg-[#0a0705] p-4 flex justify-center">
              {member.qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={member.qrDataUrl}
                  alt={`QR code for ${member.codename}`}
                  width={240}
                  height={240}
                  className="rounded-md"
                />
              ) : (
                <div className="w-60 h-60 flex items-center justify-center text-xs text-muted">
                  QR Code Unavailable
                </div>
              )}
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Present this QR code to reception during counter check-in to earn or redeem loyalty points.
            </p>

            <div className="pt-2 flex flex-col gap-2">
              <Link
                href="/portal/qr"
                className="text-xs text-gold hover:text-gold-hover hover:underline"
              >
                Open Full Screen View &rarr;
              </Link>
              <button
                onClick={() => setShowQrModal(false)}
                className="w-full rounded-lg border border-border bg-surface-2 hover:bg-surface-accent py-2 text-sm font-medium text-foreground transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
